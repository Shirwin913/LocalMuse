import argparse
import json
import subprocess
import socket
import threading
import time
import urllib.request
import urllib.error
import webbrowser
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = Path(__file__).resolve().parent
MODEL_ROOT = Path.home() / '.ollama' / 'models'
ENGINE_URL = 'http://127.0.0.1:8091'

def catalog():
    items = json.loads((ROOT / 'models/catalog.json').read_text(encoding='utf-8'))
    return {item['id']: item for item in items if (ROOT / 'models' / item['model']).is_file()}

def models():
    return {key: str(ROOT / 'models' / item['model']) for key, item in catalog().items()}

class Engine:
    def __init__(self, gpu_layers):
        self.lock = threading.Lock()
        self.process = None
        self.log = None
        self.name = None
        self.loading = False
        self.error = None
        self.gpu_layers = gpu_layers
        self.executable = next((ROOT / 'runtime').rglob('llama-server.exe'))

    def stop(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            self.process = None
        if self.log:
            self.log.close()
            self.log = None
        self.name = None

    def status(self):
        return {'model': self.name, 'engine': 'llama.cpp', 'loading': self.loading,
                'ready': bool(self.process and self.process.poll() is None and self.name and not self.loading),
                'error': self.error, 'models': list(catalog().values())}

    def load(self, name, vision=False):
        available = models()
        if name not in available:
            raise ValueError('未知的模型')
        self.loading = True
        self.error = None
        try:
            self.stop()
            self.log = (ROOT / 'engine.log').open('w', encoding='utf-8')
            extra = []
            item = catalog()[name]
            if vision:
                if not item.get('projector'):
                    raise ValueError('所選模型沒有視覺投影檔')
                extra = ['--mmproj', str(ROOT / 'models' / item['projector'])]
            self.process = subprocess.Popen([str(self.executable), '-m', available[name],
                '--host', '127.0.0.1', '--port', '8091', '-c', str(getattr(self, 'context', 4096)), '-np', '1',
                '-ngl', str(self.gpu_layers), '--jinja'] + extra, cwd=self.executable.parent,
                stdout=self.log, stderr=subprocess.STDOUT)
            for _ in range(180):
                if self.process.poll() is not None:
                    raise RuntimeError('模型載入失敗，請查看 engine.log，或選擇其他模型。')
                try:
                    with urllib.request.urlopen(ENGINE_URL + '/health', timeout=1) as response:
                        if response.status == 200:
                            self.name = name
                            self.vision = vision
                            return
                except (urllib.error.URLError, TimeoutError):
                    time.sleep(1)
            raise RuntimeError('模型載入逾時，請查看 engine.log。')
        except Exception as exc:
            self.error = str(exc)
            self.stop()
            raise
        finally:
            self.loading = False

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/status':
            self.send_json(200, self.server.engine.status())
        elif self.path in ('/', '/app.js', '/style.css'):
            name = 'index.html' if self.path == '/' else self.path[1:]
            data = (ROOT / 'static' / name).read_bytes()
            mime = {'html':'text/html', 'js':'text/javascript', 'css':'text/css'}[name.split('.')[-1]]
            self.send_response(200)
            self.send_header('Content-Type', mime + '; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_json(404, {'error': 'Not found'})

    def do_POST(self):
        if self.path not in ('/api/chat', '/api/model'):
            return self.send_json(404, {'error': 'Not found'})
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self.send_json(415, {'error': 'Content-Type must be application/json'})
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            return self.send_json(403, {'error': 'Origin not allowed'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1024 * 1024:
                return self.send_json(413, {'error': '對話內容過長'})
            data = json.loads(self.rfile.read(length))
            if self.path == '/api/model':
                if not self.server.engine.lock.acquire(blocking=False):
                    return self.send_json(409, {'error': '模型忙碌中，請稍後再切換。'})
                try:
                    self.server.engine.load(data['model'])
                    return self.send_json(200, self.server.engine.status())
                finally:
                    self.server.engine.lock.release()
            messages = data['messages']
            if not isinstance(messages, list) or not messages or any(
                not isinstance(m, dict) or m.get('role') not in ('user','assistant','system')
                or not isinstance(m.get('content'), str) for m in messages):
                raise ValueError('Invalid messages')
            payload = {'messages': messages, 'temperature': 0.7, 'max_tokens': 1024, 'stream': False}
            req = urllib.request.Request(ENGINE_URL + '/v1/chat/completions',
                json.dumps(payload).encode(), {'Content-Type': 'application/json'})
            if not self.server.engine.lock.acquire(blocking=False):
                return self.send_json(409, {'error': '模型載入中或忙碌中，請稍後再試。'})
            try:
                if not self.server.engine.status()['ready']:
                    return self.send_json(503, {'error': '模型尚未就緒，請重新選擇模型。'})
                if data.get('model') != self.server.engine.name:
                    return self.send_json(409, {'error': '模型已切換，請重新整理頁面後再試。'})
                with urllib.request.urlopen(req, timeout=180) as response:
                    result = json.load(response)
            finally:
                self.server.engine.lock.release()
            self.send_json(200, {'reply': result['choices'][0]['message']['content']})
        except (ValueError, KeyError, TypeError):
            self.send_json(400, {'error': '無效的對話資料'})
        except Exception as exc:
            self.send_json(502, {'error': '模型回應失敗，請檢查終端機。' + str(exc)[:200]})

def main():
    parser = argparse.ArgumentParser(description='LocalModelLab — no Ollama service required')
    parser.add_argument('--model', default='qwen2.5:7b', help='project-local model ID')
    parser.add_argument('--gpu-layers', type=int, default=99, help='use 0 for CPU')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--list-models', action='store_true')
    args = parser.parse_args()
    if args.list_models:
        print(json.dumps(models(), ensure_ascii=False, indent=2))
        return
    if args.model not in models():
        raise SystemExit('找不到模型，請使用 --list-models 查看名稱。')
    for port in (8091, args.port):
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError:
                raise SystemExit(f'連接埠 {port} 已被使用，請先關閉既有服務。')
    engine = Engine(args.gpu_layers)
    server = None
    try:
        print('正在載入模型……', flush=True)
        engine.load(args.model)
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
        server.engine = engine
        url = f'http://127.0.0.1:{args.port}'
        print('聊天介面：' + url + ' | Ctrl+C 關閉', flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if server:
            server.server_close()
        engine.stop()

if __name__ == '__main__':
    main()

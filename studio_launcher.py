"""Launch the full original UI with a llama.cpp protocol adapter; no Ollama process."""
import argparse, json, os, sys, socket, subprocess, threading, time, urllib.request, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from app import Engine, ROOT, catalog, ENGINE_URL

class Adapter(BaseHTTPRequestHandler):
    def reply(self, code, value):
        data=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def identify(self,name):
        name=str(name or 'qwen2.5:7b')
        if name.startswith('hf.co/empero-ai/'):
            name=name.removeprefix('hf.co/empero-ai/')
        if name not in catalog(): raise ValueError('找不到專案內模型：'+name)
        return name
    def model_info(self,key,item):
        f=ROOT/'models'/item['model']
        return {'name':key,'model':key,'size':f.stat().st_size,'details':{'format':'gguf','family':key.split(':')[0]}}
    def do_GET(self):
        if self.path=='/api/tags':
            return self.reply(200,{'models':[self.model_info(k,v) for k,v in catalog().items()]})
        if self.path=='/api/ps':
            engine=self.server.engine
            items=[]
            if engine.name and engine.process and engine.process.poll() is None:
                items=[self.model_info(engine.name,catalog()[engine.name])]
            return self.reply(200,{'models':items})
        if self.path=='/health':return self.reply(200,{'ok':True,'engine':'llama.cpp'})
        self.reply(404,{'error':'Not found'})
    def do_POST(self):
        if self.headers.get('Origin'):
            return self.reply(403,{'error':'此端點僅供本機後端呼叫'})
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=40*1024*1024: return self.reply(413,{'error':'資料過大'})
            body=json.loads(self.rfile.read(length));name=self.identify(body.get('model'))
            item=catalog()[name]
            if self.path=='/api/show':
                return self.reply(200,{'capabilities':['completion']+(['vision'] if item.get('projector') else []),'details':{'format':'gguf'},'model_info':{}})
            if self.path not in ('/api/chat','/api/generate'):return self.reply(404,{'error':'Not found'})
            engine=self.server.engine
            # Serialize load + completion so concurrent users cannot evict an active model.
            with engine.lock:
                if self.path=='/api/generate' and not body.get('prompt') and body.get('keep_alive')==0:
                    engine.stop()
                    return self.reply(200,{'model':name,'done':True,'response':''})
                # Avoid competing with an active 專案生成引擎 generation on the same GPU.
                try:
                    with urllib.request.urlopen(os.environ.get('COMFY_URL','http://127.0.0.1:8789')+'/queue',timeout=2) as response:
                        queue=json.load(response)
                except (OSError, ValueError):
                    queue={}
                if queue.get('queue_running') or queue.get('queue_pending'):
                    return self.reply(503,{'error':'專案生成引擎 正在生成作品，請完成後再使用語言模型。'})
                messages=body.get('messages') or [{'role':'user','content':body.get('prompt','')}]
                vision=any(m.get('images') for m in messages)
                if engine.name!=name or getattr(engine,'vision',False)!=vision or not engine.status()['ready']:
                    try:
                        release=urllib.request.Request(os.environ.get('COMFY_URL','http://127.0.0.1:8789')+'/free',json.dumps({'unload_models':True,'free_memory':True}).encode(),{'Content-Type':'application/json'})
                        with urllib.request.urlopen(release,timeout=20): pass
                    except OSError:
                        pass
                    engine.load(name,vision=vision)
                converted=[]
                for message in messages:
                    content=message.get('content','')
                    if message.get('images'):
                        content=[{'type':'text','text':content}]+[{'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+img}} for img in message['images']]
                    converted.append({'role':message['role'],'content':content})
                options=body.get('options',{})
                payload={'messages':converted,'stream':False,'max_tokens':min(2048,max(1,int(options.get('num_predict',1024)))),'temperature':float(options.get('temperature',0.7)), 'chat_template_kwargs': {'enable_thinking': False}}
                request=urllib.request.Request(ENGINE_URL+'/v1/chat/completions',json.dumps(payload).encode(),{'Content-Type':'application/json'})
                started=time.perf_counter_ns()
                try:
                    with urllib.request.urlopen(request,timeout=600) as response:result=json.load(response)
                except urllib.error.HTTPError as exc:
                    raise RuntimeError('llama.cpp: '+exc.read().decode(errors='replace')[:700])
                choice=result['choices'][0];usage=result.get('usage',{})
                if not choice['message'].get('content'):
                    raise RuntimeError('模型未產生正式答案，請增加輸出上限或換用其他模型。')
                if body.get('keep_alive') == 0:
                    engine.stop()
                self.reply(200,{'model':name,'message':{'role':'assistant','content':choice['message'].get('content','')},'response':choice['message'].get('content',''),'done':True,'done_reason':choice.get('finish_reason','stop'),'eval_count':usage.get('completion_tokens',0),'prompt_eval_count':usage.get('prompt_tokens',0),'total_duration':time.perf_counter_ns()-started})
        except Exception as exc:
            self.reply(502,{'error':str(exc)})

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8787)
    parser.add_argument('--bridge-port',type=int,default=8788)
    parser.add_argument('--gpu-layers',type=int,default=99)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    for port in (args.port,args.bridge_port,8091,8789):
        with socket.socket() as probe:
            try:probe.bind(('127.0.0.1',port))
            except OSError:raise SystemExit(f'連接埠 {port} 已使用，請先關閉舊版服務再啟動。')
    engine=Engine(args.gpu_layers)
    engine.context=8192
    bridge=ThreadingHTTPServer(('127.0.0.1',args.bridge_port),Adapter);bridge.engine=engine
    thread=threading.Thread(target=bridge.serve_forever,daemon=True);thread.start()
    env={**os.environ,'PORT':str(args.port),'OLLAMA_URL':f'http://127.0.0.1:{args.bridge_port}','OLLAMA_MODEL':'qwen2.5:7b','PYTHONUTF8':'1'}
    process=None
    native=None
    os.environ['COMFY_URL']='http://127.0.0.1:8789'
    env['COMFY_URL']=os.environ['COMFY_URL']
    env['COMFY_RETENTION_OUTPUT_ROOT']=str(ROOT/'generated/output')
    env['COMFY_OUTPUT_DIR']=str(ROOT/'generated/output')
    env['GENERATION_BACKEND']='native'
    try:
        native=subprocess.Popen([sys.executable,str(ROOT/'native/generation_service.py')],cwd=ROOT,env=env)
        for _ in range(30):
            if native.poll() is not None:raise RuntimeError('獨立生成服務啟動失敗')
            try:
                with urllib.request.urlopen('http://127.0.0.1:8789/capabilities',timeout=1):break
            except OSError:time.sleep(.3)
        else:raise RuntimeError('獨立生成服務啟動逾時')
        process=subprocess.Popen([str(ROOT/'runtime/node/node.exe'),str(ROOT/'studio/server.js')],cwd=ROOT/'studio',env=env)
        url=f'http://127.0.0.1:{args.port}'
        for _ in range(40):
            if process.poll() is not None:raise RuntimeError('完整介面啟動失敗，請查看上方錯誤。')
            try:
                with urllib.request.urlopen(url,timeout=1):break
            except OSError:time.sleep(.5)
        else:raise RuntimeError('網站啟動逾時')
        print('完整工作台：'+url+' | 模型使用時才載入 | Ctrl+C 關閉',flush=True)
        if not args.no_browser:webbrowser.open(url)
        process.wait()
    except KeyboardInterrupt:pass
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait()
        if native and native.poll() is None:
            try:
                request=urllib.request.Request('http://127.0.0.1:8789/shutdown',b'{}',{'Content-Type':'application/json'})
                with urllib.request.urlopen(request,timeout=15):pass
                native.wait(timeout=10)
            except Exception:
                native.terminate();native.wait(timeout=10)
        bridge.shutdown();bridge.server_close()
        with engine.lock:engine.stop()

if __name__=='__main__':main()

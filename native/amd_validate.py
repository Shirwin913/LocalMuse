"""Validate each installed model on an AMD computer with one short real generation.

A model only appears in the interface on AMD after its validated-amd*.json marker exists,
which this script writes after the worker succeeded and produced an output file.
Run with LocalMuse closed:  python native\\amd_validate.py [--only sdxl,heartmula,...] [--force]
"""
import argparse
import json
import os
import struct
import subprocess
import sys
import time
import zlib
from pathlib import Path

os.environ['LOCALMUSE_GPU'] = 'amd'  # before importing anything that resolves runtime paths
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native'))
import gpu_backend  # noqa: E402
import h3_backend  # noqa: E402
import minimax_backend  # noqa: E402
import qwen_backend  # noqa: E402

GEN = ROOT / 'models/generation'
DATA = ROOT / 'generated'
TEST_IMAGE = 'amd-validation.png'
PROMPT_IMAGE = 'a red apple on a wooden table, soft daylight'
PROMPT_VIDEO = 'a paper boat floating on a calm pond, gentle ripples'


def test_image():
    """A small gradient PNG written without third-party packages (for image-to-image checks)."""
    path = DATA / 'input' / TEST_IMAGE
    if path.is_file():
        return
    width = height = 512
    rows = b''.join(b'\x00' + bytes(v for x in range(width) for v in (x // 2, y // 2, 160)) for y in range(height))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def wan_files(folder):
    return all((GEN / folder / p).is_file() for p in ('transformer.safetensors',)) and (GEN / 'wan-1.3b/vae.safetensors').is_file()


CHECKS = [
    # name, marker folder, marker name, installed?, needs torch?, job, timeout seconds
    ('sdxl', GEN / 'sdxl-turbo', 'validated.json', lambda: (GEN / 'sdxl-turbo/model.safetensors').is_file(), True,
     {'mode': 'text-image', 'model': 'sdxl-turbo', 'prompt': PROMPT_IMAGE, 'seed': 42, 'width': 512, 'height': 512,
      'image': None, 'image_method': 'transform', 'ext': '.png'}, 1800),
    ('reference', GEN / 'ip-adapter', 'validated.json',
     lambda: (GEN / 'ip-adapter/adapter.safetensors').is_file() and (GEN / 'ip-adapter/image_encoder/model.safetensors').is_file(), True,
     {'mode': 'image-edit', 'model': 'sdxl-turbo-ipadapter', 'prompt': PROMPT_IMAGE, 'seed': 42, 'width': 512, 'height': 512,
      'image': TEST_IMAGE, 'reference_images': [TEST_IMAGE], 'image_method': 'reference', 'ext': '.png'}, 1800),
    ('heartmula', GEN / 'heartmula', 'validated.json',
     lambda: (GEN / 'heartmula/HeartMuLa-oss-3B/model.safetensors.index.json').is_file(), True,
     {'mode': 'music', 'model': 'heartmula-3b', 'prompt': 'calm lo-fi piano, soft drums, relaxed', 'lyrics': '',
      'duration': 10, 'seed': 42, 'ending': 'none', 'ext': '.wav'}, 3600),
    ('wan', GEN / 'wan-1.3b', 'validated.json',
     lambda: wan_files('wan-1.3b') and (GEN / 'wan-1.3b/text_encoder/model.safetensors.index.json').is_file(), True,
     {'mode': 'text-video', 'model': 'wan-2.1-t2v-1.3b', 'prompt': PROMPT_VIDEO, 'seed': 42, 'width': 832, 'height': 480,
      'num_frames': 17, 'steps': 20, 'fps': 16, 'ext': '.mp4'}, 3600),
    ('wan-i2v', GEN / 'wan-i2v-14b', 'validated.json',
     lambda: wan_files('wan-i2v-14b') and (GEN / 'ip-adapter/image_encoder/model.safetensors').is_file(), True,
     {'mode': 'video', 'model': 'wan-2.1-i2v-14b', 'prompt': PROMPT_VIDEO, 'seed': 42, 'width': 832, 'height': 480,
      'num_frames': 17, 'steps': 20, 'fps': 16, 'image': TEST_IMAGE, 'ext': '.mp4'}, 7200),
    ('minimax-music', GEN / 'minimax-music3', 'validated.json', minimax_backend.installed, True,
     {'mode': 'music', 'model': 'minimax-music3', 'prompt': 'gentle piano, calm instrumental, no vocals',
      'lyrics': '[Instrumental]', 'duration': 5, 'seed': 42, 'ext': '.wav'}, 7200),
    ('qwen-image', GEN / 'qwen-image-2.1', 'validated.json', qwen_backend.installed, False,
     {'mode': 'text-image', 'model': 'qwen-image-2.1', 'prompt': PROMPT_IMAGE, 'seed': 42, 'width': 512, 'height': 512,
      'image': None, 'steps': 25, 'cfg': 1.0, 'ext': '.png'}, 7200),
    ('h3-original', GEN / 'minimax-h3', 'validated-original.json', h3_backend.installed, False,
     {'mode': 'text-video', 'model': 'minimax-h3', 'prompt': PROMPT_VIDEO, 'seed': 42, 'width': 512, 'height': 288,
      'image': None, 'profile': 'original', 'quality': 'standard', 'output_resolution': 'source', 'steps': 20,
      'seconds': 1, 'num_frames': h3_backend.frame_count(1), 'fps': 24, 'cfg': 1.0, 'ext': '.mp4'}, 7200),
    ('h3-turbo', GEN / 'minimax-h3', 'validated-turbo.json', h3_backend.installed, False,
     {'mode': 'text-video', 'model': 'minimax-h3', 'prompt': PROMPT_VIDEO, 'seed': 42, 'width': 512, 'height': 288,
      'image': None, 'profile': 'turbo', 'quality': 'standard', 'output_resolution': 'source', 'steps': 8,
      'seconds': 1, 'num_frames': h3_backend.frame_count(1), 'fps': 24, 'cfg': 1.0, 'ext': '.mp4'}, 7200),
]


def validate(name, folder, marker_name, job, timeout, command):
    ident = 'amd-validate-' + name
    job = {**job, 'id': ident, 'status': 'running', 'created': time.time()}
    job['output'] = ident + job.pop('ext')
    job_path = DATA / 'jobs' / (ident + '.json')
    job_path.parent.mkdir(parents=True, exist_ok=True)
    (DATA / 'output').mkdir(parents=True, exist_ok=True)
    job_path.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')
    python, worker = command(job)
    if not Path(python).is_file():
        print(f'  ✗ {name} 失敗：找不到 {python}，請重新執行 tools\\setup-amd.bat', flush=True)
        return False
    if job.get('image') == TEST_IMAGE or TEST_IMAGE in job.get('reference_images', []):
        test_image()
    env = {**os.environ, 'PYTHONUTF8': '1', 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'LOCALMUSE_GPU': 'amd'}
    log_path = job_path.with_suffix('.log')
    started = time.perf_counter()
    with log_path.open('w', encoding='utf-8') as log:
        child = subprocess.Popen([str(python), str(ROOT / worker), str(job_path)], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            code = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
            code = 'timeout'
    output = DATA / 'output' / job['output']
    if code != 0 or not output.is_file() or output.stat().st_size < 1024:
        tail = log_path.read_text(encoding='utf-8', errors='replace')[-1500:]
        print(f'  ✗ {name} 失敗（{code}）。記錄：{log_path}\n' + tail, flush=True)
        return False
    details = {}
    for suffix in ('.image.json', '.audio.json', '.video.json'):
        side = job_path.with_suffix(suffix)
        if side.is_file():
            try:
                details = json.loads(side.read_text(encoding='utf-8'))
            except ValueError:
                pass
    config = json.loads(gpu_backend.CONFIG.read_text(encoding='utf-8')) if gpu_backend.CONFIG.is_file() else {}
    marker = gpu_backend.marker(folder, marker_name)
    marker.write_text(json.dumps({'backend': 'amd', 'check': name, 'seconds': round(time.perf_counter() - started, 1),
                                  'output': job['output'], 'result': details, 'torch': config.get('torch_info'),
                                  'engine': config.get('engine'), 'validated': time.strftime('%Y-%m-%dT%H:%M:%S')},
                                 ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  ✓ {name} 通過（{round(time.perf_counter() - started)} 秒）→ {marker.name}', flush=True)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', help='逗號分隔：' + ','.join(c[0] for c in CHECKS))
    parser.add_argument('--force', action='store_true', help='已驗證的也重新驗證')
    args = parser.parse_args()
    if gpu_backend.backend() != 'amd':
        raise SystemExit('只在 AMD 設定下使用。')
    import generation_service  # import after LOCALMUSE_GPU is set so it resolves the AMD runtimes
    wanted = set(args.only.split(',')) if args.only else None
    config = json.loads(gpu_backend.CONFIG.read_text(encoding='utf-8')) if gpu_backend.CONFIG.is_file() else {}
    summary = {}
    for name, folder, marker_name, installed, needs_torch, job, timeout in CHECKS:
        if wanted and name not in wanted:
            continue
        if not needs_torch and not gpu_backend.sd_engine().is_file():
            summary[name] = '沒有 AMD 版 stable-diffusion.cpp，略過'
            continue
        if not installed():
            summary[name] = '未安裝模型，略過'
            continue
        if needs_torch and not config.get('torch'):
            summary[name] = 'PyTorch（ROCm）不可用，略過'
            continue
        if name == 'reference' and not gpu_backend.marker(GEN / 'sdxl-turbo').is_file():
            summary[name] = 'SDXL 尚未通過，略過'
            continue
        if name == 'wan-i2v' and not gpu_backend.marker(GEN / 'wan-1.3b').is_file():
            summary[name] = 'Wan 文生影片尚未通過，略過'
            continue
        if gpu_backend.marker(folder, marker_name).is_file() and not args.force:
            summary[name] = '已驗證'
            continue
        print(f'驗證 {name}…（可能需要數分鐘）', flush=True)
        summary[name] = '通過' if validate(name, folder, marker_name, job, timeout, generation_service.command) else '失敗'
    print('\n驗證結果：', flush=True)
    for name, result in summary.items():
        print(f'  {name}: {result}', flush=True)
    print('通過的模型會在重新啟動 start.bat 後出現在介面上。', flush=True)


if __name__ == '__main__':
    main()

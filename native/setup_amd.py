"""Install the experimental AMD Radeon runtimes for LocalMuse (Windows 11).

What it does (each step can be skipped):
  1. runtime/generation-env-amd: Python 3.12 venv with AMD's official ROCm PyTorch wheels
     plus native/requirements-amd.txt (SDXL Turbo, HeartMuLa, Wan, image upscale).
  2. runtime/minimax-env-amd: same ROCm PyTorch plus the pinned MiniMax runtime (only if
     MiniMax weights are installed, or --minimax).
  3. runtime/sd-cpp-amd: stable-diffusion.cpp for AMD (Vulkan by default, or ROCm), the same
     upstream tag as the NVIDIA engine, used by Qwen Image 2.1 and MiniMax H3.
  4. runtime/gpu-backend.json: tells LocalMuse to use the AMD runtimes.
  5. native/amd_validate.py: one short real generation per installed model; only models that
     pass are shown in the interface.

The NVIDIA runtimes (runtime/generation-env, runtime/minimax-env, runtime/sd-cpp) are never
modified. Delete runtime/gpu-backend.json to return to automatic detection.
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'native'))
import gpu_backend  # noqa: E402

ROCM_BASE = os.environ.get('LOCALMUSE_ROCM_WHEELS', 'https://repo.radeon.com/rocm/windows/rocm-rel-7.2')
ROCM_SDK = ['rocm_sdk_core-7.2.0.dev0-py3-none-win_amd64.whl', 'rocm_sdk_devel-7.2.0.dev0-py3-none-win_amd64.whl',
            'rocm_sdk_libraries_custom-7.2.0.dev0-py3-none-win_amd64.whl', 'rocm-7.2.0.dev0.tar.gz']
ROCM_TORCH = ['torch-2.9.1%2Brocmsdk20260116-cp312-cp312-win_amd64.whl',
              'torchaudio-2.9.1%2Brocmsdk20260116-cp312-cp312-win_amd64.whl',
              'torchvision-0.24.1%2Brocmsdk20260116-cp312-cp312-win_amd64.whl']
# Same upstream build as runtime/sd-cpp (NVIDIA), so engine behaviour matches the validated version.
SD_TAG = 'master-1031-c6dfa9d'
SD_ASSETS = {'vulkan': 'sd-master-c6dfa9d-bin-win-vulkan-x64.zip', 'rocm': 'sd-master-c6dfa9d-bin-win-rocm-10.1.0-x64.zip'}
OFFICIAL_GPUS = ('RX 9070', 'RX 9060', 'R9700', 'RX 7900 XTX', 'W7900', 'RX 7700', 'Ryzen AI')
GENERATION_ENV = ROOT / 'runtime/generation-env-amd'
MINIMAX_ENV = ROOT / 'runtime/minimax-env-amd'
ENGINE_DIR = ROOT / 'runtime/sd-cpp-amd'
PIP_CACHE = ROOT / 'runtime/pip-cache'


def say(text):
    print(text, flush=True)


def run(args, **kwargs):
    say('> ' + ' '.join(str(a) for a in args))
    subprocess.run([str(a) for a in args], check=True, **kwargs)


def port_busy(port):
    import socket
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', port))
            return False
        except OSError:
            return True


def make_env(folder):
    python = folder / 'Scripts/python.exe'
    if not python.is_file():
        # Isolated on purpose: the system Python may carry a CUDA PyTorch.
        run([sys.executable, '-m', 'venv', folder])
    run([python, '-m', 'pip', 'install', '--upgrade', 'pip==24.0', '--cache-dir', PIP_CACHE])
    return python


def install_rocm_torch(python):
    run([python, '-m', 'pip', 'install', '--cache-dir', PIP_CACHE] + [ROCM_BASE + '/' + name for name in ROCM_SDK])
    run([python, '-m', 'pip', 'install', '--cache-dir', PIP_CACHE] + [ROCM_BASE + '/' + name for name in ROCM_TORCH])


def probe_torch(python):
    script = ("import json,torch;ok=torch.cuda.is_available();"
              "print(json.dumps({'ok':ok,'torch':torch.__version__,'hip':getattr(torch.version,'hip',None),"
              "'device':torch.cuda.get_device_name(0) if ok else None,"
              "'vram':torch.cuda.get_device_properties(0).total_memory if ok else 0}))")
    try:
        result = subprocess.run([str(python), '-c', script], capture_output=True, text=True, timeout=300)
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (OSError, ValueError, IndexError, subprocess.SubprocessError) as exc:
        return {'ok': False, 'error': str(exc)}


def install_engine(kind):
    asset_name = SD_ASSETS[kind]
    say('下載 stable-diffusion.cpp（' + kind + '）：' + SD_TAG)
    request = urllib.request.Request('https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/tags/' + SD_TAG,
                                     headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'LocalMuse-setup'})
    with urllib.request.urlopen(request, timeout=60) as response:
        release = json.load(response)
    asset = next((a for a in release.get('assets', []) if a['name'] == asset_name), None)
    if not asset:
        raise RuntimeError('這個版本沒有提供 ' + asset_name + '；可改用 --engine ' + ('rocm' if kind == 'vulkan' else 'vulkan'))
    archive = ROOT / 'work' / asset_name
    archive.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with urllib.request.urlopen(asset['browser_download_url'], timeout=120) as response, archive.open('wb') as out:
        done = 0
        while True:
            block = response.read(8 * 1024 * 1024)
            if not block:
                break
            out.write(block)
            digest.update(block)
            done += len(block)
            say(f'  {done // (1024 * 1024)} / {asset["size"] // (1024 * 1024)} MB')
    expected = asset.get('digest')
    if expected and expected != 'sha256:' + digest.hexdigest():
        archive.unlink(missing_ok=True)
        raise RuntimeError('下載檔案的 SHA-256 與 GitHub 公布的不符，已停止安裝')
    if not expected:
        say('提醒：GitHub 沒有提供這個檔案的 SHA-256，已記錄實際雜湊值。')
    staging = ENGINE_DIR.with_name(ENGINE_DIR.name + '.new')
    if staging.exists():
        shutil.rmtree(staging)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(staging)
    found = next(staging.rglob('sd-cli.exe'), None)
    if not found:
        raise RuntimeError('壓縮檔裡找不到 sd-cli.exe')
    if found.parent != staging:  # flatten a top-level folder if the archive has one
        for item in found.parent.iterdir():
            shutil.move(str(item), staging / item.name)
    if ENGINE_DIR.exists():
        shutil.rmtree(ENGINE_DIR)
    staging.replace(ENGINE_DIR)
    (ENGINE_DIR / 'source.json').write_text(json.dumps({'repo': 'leejet/stable-diffusion.cpp', 'tag': SD_TAG, 'asset': asset_name,
                                                        'backend': kind, 'digest': 'sha256:' + digest.hexdigest(),
                                                        'published_digest': expected}, indent=2), encoding='utf-8')
    say('引擎已安裝：' + str(ENGINE_DIR / 'sd-cli.exe'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--engine', choices=('vulkan', 'rocm'), default='vulkan', help='Qwen Image / MiniMax H3 用的引擎（預設 Vulkan，相容最多 AMD 顯示卡）')
    parser.add_argument('--skip-torch', action='store_true', help='不安裝 PyTorch 環境（SDXL、HeartMuLa、Wan 將停用）')
    parser.add_argument('--skip-engine', action='store_true', help='不安裝 stable-diffusion.cpp')
    parser.add_argument('--minimax', choices=('auto', 'yes', 'no'), default='auto', help='MiniMax Music 3 環境（auto：已有模型才安裝）')
    parser.add_argument('--validate', choices=('all', 'none'), default='all', help='安裝後是否逐一做實際生成驗證')
    parser.add_argument('--force', action='store_true', help='即使偵測到 NVIDIA 也繼續（一般不需要）')
    args = parser.parse_args()

    if os.name != 'nt':
        raise SystemExit('AMD 安裝程式目前只支援 Windows 11。')
    if sys.version_info[:2] != (3, 12):
        raise SystemExit('AMD 的 PyTorch 只提供 Python 3.12 版本，請用 Python 3.12 執行。')
    if any(port_busy(p) for p in (8787, 8788, 8789)):
        raise SystemExit('LocalMuse 還在執行，請先關閉 start.bat 的視窗再安裝。')
    adapters = gpu_backend.display_adapters()
    say('偵測到的顯示卡：' + ('、'.join(adapters) or '（無法讀取）'))
    if gpu_backend._nvidia_present() and not args.force:
        raise SystemExit('這台電腦有 NVIDIA 顯示卡，請使用原本的安裝方式（tools\\setup-generation.bat）。')
    amd = [name for name in adapters if 'amd' in name.lower() or 'radeon' in name.lower()]
    if not amd and not args.force:
        raise SystemExit('沒有偵測到 AMD Radeon 顯示卡。')
    official = any(model.lower() in name.lower() for name in amd for model in OFFICIAL_GPUS)
    if not official:
        say('注意：這張顯示卡不在 AMD 官方 Windows PyTorch 支援清單內，PyTorch 部分可能無法使用；'
            'Vulkan 引擎（Qwen Image、MiniMax H3）與聊天仍可嘗試。')
    if shutil.disk_usage(ROOT).free < 25 * 1024 ** 3:
        raise SystemExit('磁碟剩餘空間不足 25GB，無法安裝 AMD 執行環境。')
    PIP_CACHE.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'PYTHONUTF8': '1'}

    config = {'backend': 'amd', 'torch': False, 'engine': None, 'adapters': amd, 'official_gpu': official}
    if not args.skip_torch:
        try:
            python = make_env(GENERATION_ENV)
            install_rocm_torch(python)
            run([python, '-m', 'pip', 'install', '--cache-dir', PIP_CACHE, '-r', ROOT / 'native/requirements-amd.txt'], env=env)
            probe = probe_torch(python)
            say('PyTorch 檢查：' + json.dumps(probe, ensure_ascii=False))
            config.update(torch=bool(probe.get('ok') and probe.get('hip')), torch_info=probe)
            if not config['torch']:
                say('PyTorch 無法使用這張 AMD 顯示卡；SDXL、HeartMuLa、Wan 與 MiniMax Music 會保持停用。')
        except subprocess.CalledProcessError as exc:
            say('PyTorch 環境安裝失敗：' + str(exc))
    want_minimax = args.minimax == 'yes' or (args.minimax == 'auto' and (ROOT / 'models/generation/minimax-music3').is_dir())
    if config['torch'] and want_minimax:
        try:
            python = make_env(MINIMAX_ENV)
            install_rocm_torch(python)
            run([python, '-m', 'pip', 'install', '--no-build-isolation', '--cache-dir', PIP_CACHE,
                 '-r', ROOT / 'native/minimax-requirements.txt', 'soundfile==0.13.1', 'safetensors==0.6.2'], env=env)
            config['minimax'] = True
        except subprocess.CalledProcessError as exc:
            say('MiniMax 環境安裝失敗：' + str(exc))
    if not args.skip_engine:
        try:
            install_engine(args.engine)
            config['engine'] = args.engine
        except Exception as exc:  # network, missing asset, checksum
            say('stable-diffusion.cpp 安裝失敗：' + str(exc))
    config['installed'] = datetime.datetime.now().isoformat(timespec='seconds')
    gpu_backend.CONFIG.parent.mkdir(parents=True, exist_ok=True)
    gpu_backend.CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    say('已寫入 ' + str(gpu_backend.CONFIG))
    if not (config['torch'] or config['engine']):
        raise SystemExit('PyTorch 與引擎都沒有安裝成功，AMD 生成功能無法啟用。')
    if args.validate == 'all':
        run([sys.executable, ROOT / 'native/amd_validate.py'], env={**env, 'LOCALMUSE_GPU': 'amd'}, cwd=ROOT)
    else:
        say('已略過驗證。之後可執行：python native\\amd_validate.py')


if __name__ == '__main__':
    main()

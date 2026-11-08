"""Which GPU runtime this computer uses for generation.

NVIDIA keeps every original, validated path unchanged. AMD uses separate runtimes
(installed by tools/setup-amd.bat) and separate validation markers, so a model is
only offered on AMD after a real generation has succeeded on that AMD computer.

Detection order: LOCALMUSE_GPU environment variable -> runtime/gpu-backend.json
(written by the AMD installer) -> nvidia-smi -> existing NVIDIA environment ->
Windows display adapters (AMD/Radeon) -> none.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'runtime' / 'gpu-backend.json'
BACKENDS = ('nvidia', 'amd', 'none')
LABELS = {'nvidia': 'NVIDIA（CUDA）', 'amd': 'AMD（ROCm／Vulkan，實驗性）', 'none': '未偵測到支援的顯示卡'}
_cached = None


def _config():
    try:
        data = json.loads(CONFIG.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _run(args, timeout):
    flags = 0x08000000 if os.name == 'nt' else 0  # CREATE_NO_WINDOW
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, creationflags=flags)


def _nvidia_present():
    exe = shutil.which('nvidia-smi')
    if not exe:
        return False
    try:
        result = _run([exe, '-L'], 10)
        return result.returncode == 0 and 'GPU' in result.stdout
    except (OSError, subprocess.SubprocessError):
        return False


def display_adapters():
    if os.name != 'nt':
        return []
    try:
        result = _run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
                       '(Get-CimInstance Win32_VideoController).Name'], 20)
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def detect():
    forced = os.environ.get('LOCALMUSE_GPU', '').strip().lower()
    if forced in BACKENDS:
        return forced
    configured = _config().get('backend')
    if configured in BACKENDS:
        return configured
    if _nvidia_present():
        return 'nvidia'
    # The original NVIDIA environment can only be created on a working CUDA install.
    if (ROOT / 'runtime/generation-env/Scripts/python.exe').is_file():
        return 'nvidia'
    if any(re.search(r'\b(amd|radeon)\b', name, re.I) for name in display_adapters()):
        return 'amd'
    return 'none'


def backend():
    global _cached
    if _cached is None:
        _cached = detect()
    return _cached


def is_amd():
    return backend() == 'amd'


def generation_python():
    return ROOT / ('runtime/generation-env-amd/Scripts/python.exe' if is_amd() else 'runtime/generation-env/Scripts/python.exe')


def minimax_python():
    return ROOT / ('runtime/minimax-env-amd/Scripts/python.exe' if is_amd() else 'runtime/minimax-env/Scripts/python.exe')


def sd_engine():
    return ROOT / ('runtime/sd-cpp-amd/sd-cli.exe' if is_amd() else 'runtime/sd-cpp/sd-cli.exe')


def marker(folder, name='validated.json'):
    """Validation marker for this backend. NVIDIA keeps the original file names."""
    folder = Path(folder)
    if not is_amd():
        return folder / name
    return folder / name.replace('validated', 'validated-amd', 1)


def supports_bitsandbytes():
    """bitsandbytes 4-bit kernels are only used (and validated) on NVIDIA here."""
    return backend() == 'nvidia'


def torch_ready():
    if backend() == 'none':
        return False
    if is_amd():
        return generation_python().is_file() and bool(_config().get('torch'))
    return True  # unchanged NVIDIA behaviour


def require_gpu(torch, feature):
    if torch.cuda.is_available():
        return
    if is_amd():
        raise RuntimeError(feature + ' 需要支援 ROCm 的 AMD 顯示卡；請確認驅動程式並重新執行 tools\\setup-amd.bat')
    raise RuntimeError(feature + ' 需要可用的 CUDA 顯示卡')


def vram_bytes(torch):
    try:
        return torch.cuda.mem_get_info()[1]
    except Exception:
        try:
            return torch.cuda.get_device_properties(0).total_memory
        except Exception:
            return 0


def status():
    current = backend()
    info = {'backend': current, 'label': LABELS[current], 'torch': torch_ready(),
            'sd_engine': sd_engine().is_file(), 'experimental': current == 'amd'}
    if current == 'none':
        info['reason'] = '沒有偵測到 NVIDIA 或 AMD 顯示卡，圖片、音樂與影片生成已停用；聊天仍可使用。'
    elif current == 'amd' and not (info['torch'] or info['sd_engine']):
        info['reason'] = '偵測到 AMD 顯示卡，但尚未安裝 AMD 生成環境；請執行 tools\\setup-amd.bat。'
    elif current == 'amd':
        info['reason'] = 'AMD 支援為實驗性：每個模型需在這台電腦通過一次實際生成驗證後才會開放。'
    return info

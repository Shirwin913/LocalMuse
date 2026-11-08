"""Local MiniMax model installation checks, without importing inference packages."""
from audio_ending import validate_ending
import json, math
import gpu_backend
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'models/generation/minimax-music3'
MANIFEST = ROOT / 'native/minimax-model-manifest.json'


def installed():
    try:
        files = json.loads(MANIFEST.read_text(encoding='utf-8'))['files']
        return all((MODEL / f['path']).is_file() and (MODEL / f['path']).stat().st_size == f['size']
                   for f in files if f['path'] != 'modular_model_index.json')
    except (OSError, ValueError, KeyError):
        return False


def ready():
    return installed() and gpu_backend.marker(MODEL).is_file() and gpu_backend.minimax_python().is_file()


def parse_workflow(flow):
    node = next(n for n in flow.values() if n.get('class_type') == 'MiniMaxMusic3TextEncode')
    inputs = node['inputs']
    prompt, lyrics = inputs.get('caption', ''), inputs.get('lyrics', '')
    duration, seed = inputs.get('max_duration', 10), inputs.get('seed', 42)
    if isinstance(seed, list):
        seed = flow[seed[0]]['inputs']['seed']
    if not isinstance(prompt, str) or not 1 <= len(prompt) <= 12000 or not isinstance(lyrics, str) or len(lyrics) > 12000:
        raise ValueError('MiniMax 音樂風格或歌詞長度不正確')
    if type(duration) is not int or not 5 <= duration <= 300:
        raise ValueError('MiniMax 音樂時間需為 5–300 秒')
    if type(seed) is not int or not 0 <= seed <= 9007199254740991:
        raise ValueError('MiniMax 音樂種子不正確')
    sampler = next((n['inputs'] for n in flow.values() if n.get('class_type') == 'KSampler'), {})
    profile=inputs.get('project_profile','global-euler')
    if profile not in ('reference','global-euler'):raise ValueError('不支援的音樂生成流程')
    settings = {'text_cfg_scale': inputs.get('cfg_scale', 1.7), 'top_k': inputs.get('top_k', 50),
                'steps': sampler.get('steps', 30), 'diffusion_cfg': sampler.get('cfg', 1.7)}
    for key in ('text_cfg_scale', 'diffusion_cfg'):
        value = settings[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError('MiniMax 引導強度設定不正確')
    if type(settings['top_k']) is not int or not 1 <= settings['top_k'] <= 16384:
        raise ValueError('MiniMax top_k 設定不正確')
    if type(settings['steps']) is not int or not 1 <= settings['steps'] <= 100:
        raise ValueError('MiniMax 採樣步數需為 1–100')
    if sampler.get('sampler_name', 'euler') != 'euler' or sampler.get('scheduler', 'simple') != 'simple' or sampler.get('denoise', 1) != 1:
        raise ValueError('獨立 MiniMax 目前支援 Euler／simple／完整去噪，不能直接套用其他採樣流程')
    return {'mode': 'music', 'musicModel': 'minimax', 'model': 'minimax-music3',
            'prompt': prompt, 'lyrics': lyrics, 'duration': duration, 'seed': seed, 'sampling_profile':profile,'ending':validate_ending(inputs.get('project_ending','none')), **settings}

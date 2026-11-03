"""Install the isolated MiniMax runtime, download pinned weights, then validate audio."""
import hashlib, json, os, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT/'models/generation/minimax-music3'
ENV = ROOT/'runtime/minimax-env'
TEMP = ROOT/'work/pip-temp'
TEMP.mkdir(parents=True, exist_ok=True)
env = {**os.environ, 'TEMP': str(TEMP), 'TMP': str(TEMP), 'PYTHONUTF8': '1',
       'HF_HOME': str(ROOT/'runtime/hf-cache'), 'HF_HUB_DISABLE_XET': '1', 'HF_HUB_DOWNLOAD_TIMEOUT': '60'}
manifest = json.loads((ROOT/'native/minimax-model-manifest.json').read_text(encoding='utf-8'))
if not (ENV/'Scripts/python.exe').is_file():
    subprocess.run([sys.executable, '-m', 'venv', '--system-site-packages', str(ENV)], check=True, env=env)
python = str(ENV/'Scripts/python.exe')
subprocess.run([python, '-m', 'pip', 'install', '--no-build-isolation', '--timeout', '60',
                '--cache-dir', str(ROOT/'runtime/pip-cache'), '-r', str(ROOT/'native/minimax-requirements.txt')], check=True, env=env)
subprocess.run([sys.executable, str(ROOT/'native/download_minimax.py')], check=True, env=env)
for f in manifest['files']:
    path = MODEL/f['path']
    if not path.is_file() or (f['path'] != 'modular_model_index.json' and path.stat().st_size != f['size']):
        raise RuntimeError('Model file size mismatch: '+f['path'])
    if 'lfs' in f:
        h = hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda: stream.read(8*1024*1024), b''):
                h.update(block)
        if h.hexdigest() != f['lfs']['oid']:
            raise RuntimeError('Model checksum mismatch: '+f['path'])
# Keep all component loads local, including identifiers in the upstream modular index.
index_path = MODEL/'modular_model_index.json'
index = json.loads(index_path.read_text(encoding='utf-8'))
for entry in index.values():
    if isinstance(entry, list) and len(entry) > 2 and isinstance(entry[2], dict):
        entry[2]['pretrained_model_name_or_path'] = str(MODEL)
index_path.write_text(json.dumps(index, indent=2), encoding='utf-8')
job = ROOT/'generated/jobs/minimax-install-validation.json'
job.parent.mkdir(parents=True, exist_ok=True)
(ROOT/'generated/output').mkdir(parents=True, exist_ok=True)
job.write_text(json.dumps({'prompt': 'gentle piano, calm instrumental, no vocals', 'lyrics': '[Instrumental]',
                          'duration': 5, 'seed': 42, 'output': 'minimax-install-validation.wav'}), encoding='utf-8')
subprocess.run([python, str(ROOT/'native/minimax_worker.py'), str(job)], check=True, cwd=ROOT, env=env)
result = json.loads(job.with_suffix('.audio.json').read_text(encoding='utf-8'))
(MODEL/'validated.json').write_text(json.dumps({'revision': manifest['revision'], 'result': result}, indent=2), encoding='utf-8')
print('MiniMax Music 3 安裝及音訊生成驗證完成。請重新啟動 start.bat。')

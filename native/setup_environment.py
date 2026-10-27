"""Recreate project packages without installing into the system environment."""
import sys,subprocess,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if sys.version_info[:2]!=(3,12):raise SystemExit('此環境已驗證 Python 3.12，請使用 Python 3.12 執行。')
try:
 import torch
 if not torch.cuda.is_available():raise RuntimeError()
except Exception:raise SystemExit('基礎 Python 需要已安裝可用的 CUDA PyTorch；此腳本不會改動系統 PyTorch。')
folder=ROOT/'runtime/generation-env'
if not (folder/'Scripts/python.exe').is_file():subprocess.run([sys.executable,'-m','venv','--system-site-packages',str(folder)],check=True)
python=str(folder/'Scripts/python.exe')
subprocess.run([python,'-m','pip','install','-r',str(ROOT/'native/requirements.txt')],check=True)
config=ROOT/'models/generation/sdxl-turbo/config'
if not (config/'model_index.json').is_file():
 env={**os.environ,'HF_HOME':str(ROOT/'runtime/hf-cache')}
 script="from huggingface_hub import snapshot_download; snapshot_download('stabilityai/sdxl-turbo',local_dir="+repr(str(config))+",allow_patterns=['*.json','*.txt','tokenizer/*','tokenizer_2/*','LICENSE.md'],ignore_patterns=['*.safetensors','*.bin','*.onnx','*.pb','*.msgpack','*.h5','*.tflite','*.xml'])"
 subprocess.run([python,'-c',script],env=env,check=True)
if not (ROOT/'models/generation/sdxl-turbo/model.safetensors').is_file():raise SystemExit('請將 SDXL Turbo FP16 完整 checkpoint 放進 models/generation/sdxl-turbo/model.safetensors。')
print('獨立生成環境已就緒。')

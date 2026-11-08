"""Project-owned Qwen Image 2.1 files and request validation."""
import json,math
import gpu_backend
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'models/generation/qwen-image-2.1'
ENGINE=gpu_backend.sd_engine()
def installed():
    try:
        manifest=json.loads((ROOT/'native/qwen-image-manifest.json').read_text(encoding='utf-8'))
        return ENGINE.is_file() and all((MODEL/f['path']).is_file() and (MODEL/f['path']).stat().st_size==f['size'] for f in manifest['files'])
    except (OSError,ValueError,KeyError):return False
def ready():return installed() and gpu_backend.marker(MODEL).is_file()
def parse_workflow(flow):
    p=next(n['inputs'] for n in flow.values() if n.get('class_type')=='ProjectQwenImage')
    prompt=p.get('prompt');seed=p.get('seed');w=p.get('width');h=p.get('height');image=p.get('image')
    if not isinstance(prompt,str) or not 1<=len(prompt)<=12000:raise ValueError('Qwen提示詞需為1–12000字元')
    if isinstance(seed,bool) or not isinstance(seed,int) or not 0<=seed<=9007199254740991:raise ValueError('Invalid Qwen seed')
    if any(isinstance(x,bool) or not isinstance(x,int) or x<256 or x>1536 or x%32 for x in (w,h)) or w*h>1048576:raise ValueError('Invalid Qwen dimensions')
    if image is not None:
        if not isinstance(image,str) or Path(image).name!=image or not (ROOT/'generated/input'/image).is_file():raise ValueError('Invalid Qwen reference image')
    return {'mode':'image-edit' if image else 'text-image','model':'qwen-image-2.1','prompt':prompt,'seed':seed,'width':w,'height':h,'image':image,'steps':25,'cfg':1.0}

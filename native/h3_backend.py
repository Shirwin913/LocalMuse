"""Original MiniMax H3 model set, standalone request validation."""
import json,re
import gpu_backend
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'models/generation/minimax-h3'
ENGINE=gpu_backend.sd_engine()
def installed():
    try:
        data=json.loads((ROOT/'native/h3-model-manifest.json').read_text(encoding='utf-8'))
        return ENGINE.is_file() and len(data['files'])==5 and all((MODEL/x['path']).is_file() and (MODEL/x['path']).stat().st_size==x['size'] for x in data['files'])
    except (OSError,ValueError,KeyError):return False
def ready(profile='original'):
    return installed() and gpu_backend.marker(MODEL,'validated-'+profile+'.json').is_file()
def high_quality_ready():return ready() and gpu_backend.marker(MODEL,'validated-480p.json').is_file()
def frame_count(seconds):return max(5,round(seconds*24))+(5-max(5,round(seconds*24))%17)%17
def lora_application(line):
    match=re.search(r'\((\d+)\s*/\s*(\d+)\)\s+LoRA tensors have been applied',line)
    return tuple(map(int,match.groups())) if match else None
def parse_workflow(flow):
    p=next(n['inputs'] for n in flow.values() if n.get('class_type')=='ProjectMiniMaxH3')
    prompt=p.get('prompt');seed=p.get('seed');w=p.get('width');h=p.get('height');seconds=p.get('seconds');image=p.get('image');profile=p.get('profile','original');quality=p.get('quality','standard');output_resolution=p.get('output_resolution','source')
    if not isinstance(prompt,str) or not 1<=len(prompt)<=12000:raise ValueError('H3提示詞需為1–12000字元')
    if isinstance(seed,bool) or not isinstance(seed,int) or not 0<=seed<=9007199254740991:raise ValueError('Invalid H3 seed')
    if profile not in ('original','turbo'):raise ValueError('Invalid H3 profile')
    if isinstance(seconds,bool) or not isinstance(seconds,int) or not 1<=seconds<=3:raise ValueError('H3目前只接受1–3秒')
    if output_resolution not in ('source','720p','1080p'):raise ValueError('Invalid H3 output resolution')
    if output_resolution!='source' and quality!='480p':raise ValueError('高解析放大輸出需選480p原始20步文生影片')
    if quality not in ('standard','480p'):raise ValueError('Invalid H3 quality')
    if any(isinstance(x,bool) or not isinstance(x,int) for x in (w,h)):raise ValueError('Invalid H3 dimensions')
    if quality=='480p':
        if profile!='original' or image is not None or (w,h)!=(864,480):raise ValueError('480p目前只支援原始20步、16:9文生影片')
    elif any(isinstance(x,bool) or not isinstance(x,int) or x<192 or x>640 or x%32 for x in (w,h)) or w*h>147456:raise ValueError('Invalid H3 dimensions')
    if image is not None and (not isinstance(image,str) or Path(image).name!=image or not (ROOT/'generated/input'/image).is_file()):raise ValueError('Invalid H3 input image')
    if image and seconds>1:raise ValueError('H3圖片生影片目前只驗證設定1秒')
    return {'mode':'video' if image else 'text-video','model':'minimax-h3','prompt':prompt,'seed':seed,'width':w,'height':h,'image':image,'profile':profile,'quality':quality,'output_resolution':output_resolution,'steps':8 if profile=='turbo' else 20,'seconds':seconds,'num_frames':frame_count(seconds),'fps':24,'cfg':1.0}

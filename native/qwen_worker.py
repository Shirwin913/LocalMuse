"""Standalone stable-diffusion.cpp Qwen worker; no ComfyUI imports."""
import json,os,sys,subprocess,time,re
from pathlib import Path
from qwen_backend import ROOT,MODEL,ENGINE,installed
job_path=Path(sys.argv[1]);job=json.loads(job_path.read_text(encoding='utf-8'))
if not installed():raise RuntimeError('Qwen Image 2.1模型或獨立引擎未安裝完整')
output=ROOT/'generated/output'/job['output']
args=[str(ENGINE),'--diffusion-model',str(MODEL/'diffusion_models/qwen_image_2.1_int8_convrot.safetensors'),'--vae',str(MODEL/'vae/qwen_image_2.1_vae_bf16.safetensors'),'--llm',str(MODEL/'text_encoders/qwen3vl_8b_int8_convrot.safetensors'),'-p',job['prompt'],'--cfg-scale',str(job.get('cfg',1)),'--steps',str(job.get('steps',25)),'--sampling-method','euler','--offload-to-cpu','-W',str(job['width']),'-H',str(job['height']),'-s',str(job['seed']),'-o',str(output)]
args+=['--scheduler','simple','--rng','cpu','--mmap','--max-vram','8','--vae-tiling']
if job.get('image'):args+=['-r',str(ROOT/'generated/input'/job['image'])]
def progress(stage,current=0):job_path.with_suffix('.progress.json').write_text(json.dumps({'stage':stage,'current':current,'total':job.get('steps',25)}),encoding='utf-8')
progress('載入 Qwen Image 2.1');start=time.perf_counter()
child=subprocess.Popen(args,cwd=ENGINE.parent,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
from windows_child_job import bind
close_job=bind(child)
try:
    for line in child.stdout:
        print(line,end='',flush=True)
        match=re.search(r'(\d+)\s*/\s*'+str(job.get('steps',25))+r'\b',line)
        if match:progress('Qwen Image 2.1 生成圖片',int(match[1]))
    if child.wait()!=0:raise RuntimeError('Qwen引擎執行失敗，請查看上述紀錄')
finally:
    if child.poll() is None:child.kill();child.wait()
    if close_job:close_job()
from PIL import Image,ImageStat
with Image.open(output) as image:
    image.load()
    if image.size!=(job['width'],job['height']) or max(ImageStat.Stat(image.convert('RGB')).stddev)<1:raise RuntimeError('Qwen輸出尺寸錯誤或空白')
result={'model':'qwen-image-2.1','engine':'stable-diffusion.cpp','seconds':round(time.perf_counter()-start,2),'steps':job.get('steps',25),'cfg':job.get('cfg',1),'prompt':job['prompt'],'seed':job['seed']}
job_path.with_suffix('.image.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');progress('完成',job.get('steps',25));print(json.dumps(result),flush=True)

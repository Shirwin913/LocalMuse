"""Independent Diffusers worker. No imports or API calls to ComfyUI."""
import os,sys,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['HF_HOME']=str(ROOT/'runtime/hf-cache')
os.environ['TOKENIZERS_PARALLELISM']='false'
job_path=Path(sys.argv[1]);job=json.loads(job_path.read_text(encoding='utf-8'))
progress_path=job_path.with_suffix('.progress.json')
def progress(stage,current=0,total=4):
    progress_path.write_text(json.dumps({'stage':stage,'current':current,'total':total}),encoding='utf-8')
progress('載入 SDXL Turbo')
import torch
from PIL import Image,ImageOps
from diffusers import StableDiffusionXLPipeline,StableDiffusionXLImg2ImgPipeline
if not torch.cuda.is_available():raise RuntimeError('獨立生成需要可用的 CUDA 顯示卡')
config=json.loads((ROOT/'models/generation/catalog.json').read_text(encoding='utf-8'))['models'][0]
folder=ROOT/'models/generation'
cls=StableDiffusionXLImg2ImgPipeline if job['mode']=='image-edit' else StableDiffusionXLPipeline
pipe=cls.from_single_file(str(folder/config['checkpoint']),config=str(folder/config['config']),torch_dtype=torch.float16,local_files_only=True,use_safetensors=True)
pipe.enable_model_cpu_offload()
pipe.enable_vae_slicing()
pipe.enable_vae_tiling()
steps=4
started=time.perf_counter()
def callback(pipeline,index,timestep,kwargs):
    progress('生成圖片',index+1,steps)
    return kwargs
params={'prompt':job['prompt'],'width':job['width'],'height':job['height'],'num_inference_steps':steps,'guidance_scale':0.0,'generator':torch.Generator('cpu').manual_seed(job['seed']),'callback_on_step_end':callback}
if job['mode']=='image-edit':
    source=Image.open(ROOT/'generated/input'/job['image']).convert('RGB')
    params['image']=ImageOps.fit(source,(job['width'],job['height']))
    params['strength']=0.75
with torch.inference_mode():image=pipe(**params).images[0]
output=ROOT/'generated/output'/job['output'];output.parent.mkdir(parents=True,exist_ok=True)
image.save(output)
progress('完成',steps,steps)
print(json.dumps({'output':job['output'],'seconds':round(time.perf_counter()-started,2)}),flush=True)

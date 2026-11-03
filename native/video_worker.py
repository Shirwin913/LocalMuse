"""Standalone Wan 2.1 1.3B video inference, with bounded GPU memory use."""
import os,sys,json,time,gc
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',TOKENIZERS_PARALLELISM='false')
job_path=Path(sys.argv[1]);job=json.loads(job_path.read_text(encoding='utf-8'))
MODEL=ROOT/'models/generation/wan-1.3b'
def progress(stage,current=0,total=0):job_path.with_suffix('.progress.json').write_text(json.dumps({'stage':stage,'current':current,'total':total}),encoding='utf-8')
progress('載入影片文字編碼器')
import torch,numpy as np
from transformers import AutoTokenizer,UMT5EncoderModel
from accelerate import cpu_offload
from diffusers import WanPipeline,WanImageToVideoPipeline,WanTransformer3DModel,AutoencoderKLWan,UniPCMultistepScheduler,BitsAndBytesConfig
from diffusers.utils import export_to_video
if not torch.cuda.is_available():raise RuntimeError('Wan 需要 CUDA 顯示卡')
torch.set_num_threads(4)
started=time.perf_counter()
def encode():
 from wan_tokenizer import load_tokenizer
 tokenizer=load_tokenizer(MODEL/'tokenizer')
 encoder=UMT5EncoderModel.from_pretrained(str(MODEL/'text_encoder'),torch_dtype=torch.bfloat16,local_files_only=True,low_cpu_mem_usage=True).eval()
 cpu_offload(encoder,execution_device=torch.device('cuda'),offload_buffers=True)
 tokens=tokenizer([job['prompt'],job.get('negative_prompt','blurry, low quality, deformed')],padding='max_length',max_length=128,truncation=True,return_tensors='pt')
 with torch.inference_mode():embeds=encoder(tokens.input_ids.to('cuda'),tokens.attention_mask.to('cuda')).last_hidden_state.detach()
 embeds=embeds.clone()
 for index,length in enumerate(tokens.attention_mask.sum(dim=1).tolist()):embeds[index,length:]=0
 return embeds[:1].cpu(),embeds[1:].cpu()
positive,negative=encode();gc.collect();torch.cuda.empty_cache()
i2v=job.get('mode')=='video'
image=None;image_embeds=None
if i2v:
 from PIL import Image,ImageOps
 from transformers import CLIPVisionModelWithProjection,CLIPImageProcessor
 image=Image.open(ROOT/'generated/input'/job['image']).convert('RGB')
 def encode_image():
  encoder=CLIPVisionModelWithProjection.from_pretrained(str(ROOT/'models/generation/ip-adapter/image_encoder'),torch_dtype=torch.float16,local_files_only=True).eval().to('cuda')
  values=CLIPImageProcessor()(images=image,return_tensors='pt').pixel_values.to('cuda',dtype=torch.float16)
  with torch.inference_mode():result=encoder(values,output_hidden_states=True).hidden_states[-2].cpu()
  return result
 image_embeds=encode_image();gc.collect();torch.cuda.empty_cache()
progress('載入 Wan 影片模型')
if i2v:
 quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.bfloat16,bnb_4bit_use_double_quant=True)
 from wan_quantization import raw_checkpoint_quantization
 with raw_checkpoint_quantization(progress):
  transformer=WanTransformer3DModel.from_single_file(str(ROOT/'models/generation/wan-i2v-14b/transformer.safetensors'),config=str(ROOT/'models/generation/wan-i2v-14b/transformer'),torch_dtype=torch.bfloat16,local_files_only=True,quantization_config=quant,device='cuda')
 from wan_quantization import enable_quantized_group_offload
 enable_quantized_group_offload(transformer)
else:transformer=WanTransformer3DModel.from_single_file(str(MODEL/'transformer.safetensors'),config=str(MODEL/'transformer'),torch_dtype=torch.bfloat16,local_files_only=True)
vae=AutoencoderKLWan.from_single_file(str(MODEL/'vae.safetensors'),config=str(MODEL/'vae'),torch_dtype=torch.float32,local_files_only=True)
scheduler=UniPCMultistepScheduler.from_pretrained(str(ROOT/'models/generation/wan-i2v-14b/scheduler' if i2v else MODEL/'scheduler'),local_files_only=True)
if i2v:
 pipe=WanImageToVideoPipeline(tokenizer=None,text_encoder=None,transformer=transformer,vae=vae,scheduler=scheduler,image_encoder=None,image_processor=None)
 pipe.vae.to('cuda')
else:
 pipe=WanPipeline(tokenizer=None,text_encoder=None,transformer=transformer,vae=vae,scheduler=scheduler)
 pipe.to('cuda')
pipe.vae.enable_tiling()
positive=positive.to('cuda');negative=negative.to('cuda')
steps=int(job.get('steps',20));frames=int(job.get('num_frames',17));fps=int(job.get('fps',16))
def callback(pipeline,index,timestep,kwargs):progress('生成影片',index+1,steps);return kwargs
kwargs={}
if i2v:
 pipe.encode_image=lambda value,device=None:image_embeds.to(device or 'cuda',dtype=torch.bfloat16)
 kwargs={'image':image}
with torch.inference_mode():
 video=pipe(**kwargs,prompt_embeds=positive,negative_prompt_embeds=negative,width=job.get('width',832),height=job.get('height',480),num_frames=frames,num_inference_steps=steps,guidance_scale=5.0,generator=torch.Generator('cpu').manual_seed(job['seed']),callback_on_step_end=callback,output_type='np').frames[0]
if not np.isfinite(video).all() or len(video)<2 or float(np.std(video))<1e-4:raise RuntimeError('影片影格為空白或無效')
progress('儲存影片')
output=ROOT/'generated/output'/job['output'];export_to_video(video,str(output),fps=fps)
result={'model':'wan-2.1-i2v-14b-nf4' if i2v else 'wan-2.1-t2v-1.3b','seconds':round(time.perf_counter()-started,2),'frames':len(video),'fps':fps,'duration':len(video)/fps,'width':int(video.shape[2]),'height':int(video.shape[1]),'steps':steps,'frame_change':float(np.abs(np.diff(video,axis=0)).mean()),'output':job['output']}
job_path.with_suffix('.video.json').write_text(json.dumps(result),encoding='utf-8');progress('完成');print(json.dumps(result),flush=True)

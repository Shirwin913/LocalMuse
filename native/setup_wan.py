"""Prepare an independent Wan 1.3B runtime from existing local weights.

Downloads official pinned configuration/tokenizer files only. Converts the
existing scaled FP8 UMT5 into bounded BF16 shards, without ComfyUI imports.
"""
from pathlib import Path
import json,urllib.request,shutil,hashlib,gc
ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'models/generation/wan-1.3b'
REV='0fad780a534b6463e45facd96134c9f345acfa5b'
REPO='Wan-AI/Wan2.1-T2V-1.3B-Diffusers'
SOURCE=Path('D:/AI/Models/ComfyUI')
MODEL.mkdir(parents=True,exist_ok=True)
files=['scheduler/scheduler_config.json','text_encoder/config.json','tokenizer/special_tokens_map.json','tokenizer/spiece.model','tokenizer/tokenizer_config.json','transformer/config.json','vae/config.json']
for name in files:
 p=MODEL/name;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.is_file():
  with urllib.request.urlopen(f'https://huggingface.co/{REPO}/resolve/{REV}/{name}',timeout=60) as r,p.with_suffix(p.suffix+'.part').open('wb') as f:shutil.copyfileobj(r,f)
  p.with_suffix(p.suffix+'.part').replace(p)
 print('CONFIG',name,flush=True)
for source,name in [(SOURCE/'diffusion_models/wan2.1_t2v_1.3B_bf16.safetensors','transformer.safetensors'),(SOURCE/'vae/wan_2.1_vae.safetensors','vae.safetensors')]:
 target=MODEL/name
 if not target.is_file() or target.stat().st_size!=source.stat().st_size:
  shutil.copyfile(source,target.with_suffix('.part'));target.with_suffix('.part').replace(target)
 print('COPIED',name,flush=True)
index=MODEL/'text_encoder/model.safetensors.index.json'
if not index.is_file():
 import torch
 from safetensors import safe_open
 from safetensors.torch import save_file
 source=SOURCE/'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors'
 shards=[];current={};current_size=0;mapping={};total=0
 def flush():
  global current,current_size
  if not current:return
  name=f'model-{len(shards)+1:05d}.safetensors'
  save_file(current,str(MODEL/'text_encoder'/name),metadata={'format':'pt'})
  shards.append(name)
  for key in current:mapping[key]=name
  current={};current_size=0;gc.collect()
 with safe_open(source,framework='pt',device='cpu') as weights:
  keys=set(weights.keys())
  for key in sorted(keys):
   if key in ('scaled_fp8','spiece_model') or key.endswith(('.scale_weight','.scale_input')):continue
   tensor=weights.get_tensor(key)
   if tensor.dtype in (torch.float8_e4m3fn,torch.float8_e5m2):
    scale_key=key.removesuffix('.weight')+'.scale_weight'
    if scale_key not in keys:raise RuntimeError('Missing FP8 scale: '+key)
    tensor=(tensor.float()*weights.get_tensor(scale_key)).to(torch.bfloat16)
   elif tensor.is_floating_point():tensor=tensor.to(torch.bfloat16)
   size=tensor.numel()*tensor.element_size()
   if current and current_size+size>512*1024**2:flush()
   current[key]=tensor.contiguous();current_size+=size;total+=size
  flush()
 index.write_text(json.dumps({'metadata':{'total_size':total},'weight_map':mapping},indent=2),encoding='utf-8')
 print('UMT5_BF16_SHARDS',len(shards),total,flush=True)
(MODEL/'provenance.json').write_text(json.dumps({'repo':REPO,'revision':REV,'local_sources':['wan2.1_t2v_1.3B_bf16.safetensors','wan_2.1_vae.safetensors','umt5_xxl_fp8_e4m3fn_scaled.safetensors'],'text_conversion':'scaled FP8 weights multiplied by individual scale_weight, stored as BF16; originals retained','status':'pending_real_validation'},indent=2),encoding='utf-8')
print('Wan prepared; actual inference is still required.',flush=True)

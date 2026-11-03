"""Copy the existing general SDXL image adapter into the project; never alter originals."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'models/generation/ip-adapter'
FILES=[(Path('D:/AI/Models/ComfyUI/ipadapter/ip-adapter_sdxl_vit-h.safetensors'),TARGET/'adapter.safetensors'),
       (Path('D:/AI/Models/ComfyUI/clip_vision/clip_vision_h.safetensors'),TARGET/'image_encoder/model.safetensors')]
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(8*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
records=[]
for source,dest in FILES:
 if not dest.resolve().is_relative_to((ROOT/'models/generation').resolve()):raise RuntimeError('Invalid destination')
 dest.parent.mkdir(parents=True,exist_ok=True)
 expected=digest(source)
 if not dest.is_file() or digest(dest)!=expected:
  part=dest.with_suffix('.part');shutil.copyfile(source,part)
  if digest(part)!=expected:raise RuntimeError('Copy checksum failed')
  part.replace(dest)
 records.append({'file':str(dest.relative_to(TARGET)),'bytes':dest.stat().st_size,'sha256':expected})
config={'architectures':['CLIPVisionModelWithProjection'],'attention_dropout':0.0,'hidden_act':'gelu','hidden_size':1280,'image_size':224,'initializer_factor':1.0,'initializer_range':0.02,'intermediate_size':5120,'layer_norm_eps':1e-5,'model_type':'clip_vision_model','num_attention_heads':16,'num_channels':3,'num_hidden_layers':32,'patch_size':14,'projection_dim':1024,'torch_dtype':'float16'}
(TARGET/'image_encoder/config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
(TARGET/'provenance.json').write_text(json.dumps({'source':'Existing local h94/IP-Adapter weights, originals retained','files':records,'config_source':'https://huggingface.co/h94/IP-Adapter/blob/main/models/image_encoder/config.json','status':'awaiting_real_inference'},indent=2),encoding='utf-8')
print('Reference-image weights copied and verified; real generation still required.')

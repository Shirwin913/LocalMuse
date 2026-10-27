"""Standalone HeartMuLa NF4/BF16 + CPU codec worker, with no Comfy imports."""
import os,sys,json,time,gc
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['HF_HOME']=str(ROOT/'runtime/hf-cache');os.environ['TOKENIZERS_PARALLELISM']='false'
sys.path.insert(0,str(ROOT/'native/vendor'))
job_path=Path(sys.argv[1]);job=json.loads(job_path.read_text(encoding='utf-8'));progress_path=job_path.with_suffix('.progress.json')
def progress(stage,current=0,total=1):progress_path.write_text(json.dumps({'stage':stage,'current':current,'total':total}),encoding='utf-8')
progress('載入 HeartMuLa 與音訊解碼器')
import torch,soundfile as sf,numpy as np
from transformers import BitsAndBytesConfig
from heartlib.heartcodec.modeling_heartcodec import HeartCodec
from heartlib import HeartMuLaGenPipeline
if not torch.cuda.is_available():raise RuntimeError('HeartMuLa 需要可用 CUDA 顯示卡')
torch.set_num_threads(4);torch.manual_seed(job['seed']);torch.cuda.manual_seed_all(job['seed'])
original_init=HeartCodec.__init__
def compatible_init(self,*args,**kwargs):
    original_init(self,*args,**kwargs);changed=0
    for name,layer in self.named_modules():
        if name.startswith('flow_matching.vq_embed.layers.') and name.endswith('._codebook'):
            flag=layer._buffers.get('initted')
            if flag is not None and flag.ndim==0 and flag.numel()==1:layer.register_buffer('initted',flag.reshape(1));changed+=1
    if changed!=8:raise RuntimeError('HeartCodec checkpoint 結構與已驗證版本不相符')
HeartCodec.__init__=compatible_init
original_load=HeartCodec.from_pretrained
@classmethod
def load_cpu(cls,*args,**kwargs):
    kwargs['device_map']='cpu'
    return original_load(*args,**kwargs)
HeartCodec.from_pretrained=load_cpu
original_decode=HeartCodec.detokenize
def decode_cpu(self,codes,*args,**kwargs):
    progress('CPU 解碼音訊，這個階段可能需要數分鐘')
    kwargs['device']='cpu'
    return original_decode(self,codes.cpu(),*args,**kwargs)
HeartCodec.detokenize=decode_cpu
started=time.perf_counter()
quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_compute_dtype=torch.bfloat16,bnb_4bit_use_double_quant=True,bnb_4bit_quant_type='nf4')
pipe=HeartMuLaGenPipeline.from_pretrained(str(ROOT/'models/generation/heartmula'),device=torch.device('cuda'),dtype=torch.bfloat16,version='3B',bnb_config=quant)
for layer in pipe.model.modules():
    if callable(getattr(layer,'rope_init',None)):
        with torch.device('cuda'):layer.rope_init()
if any(buffer.is_meta for _,buffer in pipe.model.named_buffers()):raise RuntimeError('HeartMuLa 有未初始化的模型緩衝區')
pipe.set_progress_callback(lambda current,total:progress('生成音樂 token',current,total))
with torch.inference_mode():
    inputs=pipe.preprocess({'tags':job['prompt'],'lyrics':job['lyrics'] or '[Instrumental]'},cfg_scale=1.0)
    inputs={key:value.to('cuda') if isinstance(value,torch.Tensor) else value for key,value in inputs.items()}
    outputs=pipe._forward(inputs,max_audio_length_ms=job['duration']*1000,temperature=1.0,topk=50,cfg_scale=1.0)
wave=outputs['wav'].detach().cpu().float()
if wave.ndim==3:wave=wave[0]
if wave.ndim!=2 or not torch.isfinite(wave).all() or wave.abs().max()<1e-6:raise RuntimeError('音訊為空白或無效')
rate=48000;duration=wave.shape[-1]/rate
if duration<1:raise RuntimeError('輸出音訊太短')
path=ROOT/'generated/output'/job['output'];sf.write(path,wave.transpose(0,1).numpy(),rate,subtype='PCM_16')
progress('完成',1,1)
result={'seconds':round(time.perf_counter()-started,2),'duration':duration,'sample_rate':rate,'peak':float(wave.abs().max()),'rms':float(wave.square().mean().sqrt())}
job_path.with_suffix('.audio.json').write_text(json.dumps(result),encoding='utf-8');print(json.dumps(result),flush=True)

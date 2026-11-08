"""Standalone MiniMax Music 3 worker using an isolated official Diffusers runtime."""
import os, sys, json, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', TOKENIZERS_PARALLELISM='false',
                  HF_HOME=str(ROOT/'runtime/hf-cache'))
from minimax_backend import MODEL, installed
job_path = Path(sys.argv[1])
job = json.loads(job_path.read_text(encoding='utf-8'))

def progress(stage, current=0, total=0):
    job_path.with_suffix('.progress.json').write_text(json.dumps({'stage': stage, 'current': current, 'total': total}), encoding='utf-8')

if not installed():
    raise RuntimeError('MiniMax 模型尚未安裝完整，請執行 tools/setup-minimax.bat')
progress('載入 MiniMax 音樂模型')
import torch, soundfile as sf
from diffusers import ComponentsManager, ModularPipeline
from diffusers.hooks import apply_group_offloading
import gpu_backend
gpu_backend.require_gpu(torch, 'MiniMax Music 3')
started = time.perf_counter()
manager = ComponentsManager()
manager.enable_auto_cpu_offload(device='cuda', memory_reserve_margin='1GB')
pipe = ModularPipeline.from_pretrained(str(MODEL), components_manager=manager, local_files_only=True)
cache_name=job.get('conditioning_cache')
if cache_name:
 if Path(cache_name).name!=cache_name or not cache_name.endswith('.frames.pt'):raise ValueError('Invalid conditioning cache')
 cache_path=ROOT/'generated/jobs'/cache_name
 source=json.loads(cache_path.with_name(cache_name.removesuffix('.frames.pt')+'.json').read_text(encoding='utf-8'))
 for key in ('prompt','lyrics','duration','seed','text_cfg_scale','top_k'):
  if source.get(key)!=job.get(key):raise ValueError('Conditioning cache settings mismatch: '+key)
 cached=torch.load(cache_path,map_location='cpu',weights_only=True)
 if not isinstance(cached,torch.Tensor) or cached.ndim!=3 or cached.shape[-1]!=32768 or not torch.isfinite(cached).all():raise ValueError('Invalid cached semantic states')
 pipe.load_components(names=['condition_encoder','transformer','vocoder','scheduler','guider'],dtype=torch.bfloat16)
else:pipe.load_components(dtype=torch.bfloat16)
# This pinned Diffusers revision hardcodes AR sampling controls instead of exposing inputs.
# Apply the saved workflow controls within this isolated worker process only.
from diffusers.modular_pipelines.minimax_music3 import encoders as ar_encoder
sampling = {'text_cfg_scale': job.get('text_cfg_scale', 1.7), 'top_k': job.get('top_k', 50),
            'steps': job.get('steps', 30), 'diffusion_cfg': job.get('diffusion_cfg', 1.7)}
from minimax_compat import configure_encoder
configure_encoder(ar_encoder, sampling)
pipe.update_components(guider=pipe.guider.new(guidance_scale=sampling['diffusion_cfg']))
if not cache_name:
 apply_group_offloading(pipe.language_model,onload_device=torch.device('cuda'),offload_type='leaf_level',use_stream=True,low_cpu_mem_usage=True)
profile = job.get('sampling_profile') or os.environ.get('LOCALMUSE_MINIMAX_PROFILE','global-euler')
if profile not in ('reference', 'global-euler'):
    raise ValueError('Unknown MiniMax sampling profile')
if profile == 'global-euler':
    from minimax_global import install_global_sampler, install_tiled_decoder
    install_global_sampler(progress,job['seed'],sampling['steps'],sampling['diffusion_cfg'])
    install_tiled_decoder(progress)
if cache_name:
    from diffusers.modular_pipelines.minimax_music3.encoders import MiniMaxMusic3TextEncoderStep,MiniMaxMusic3SemanticGenerationStep
    MiniMaxMusic3TextEncoderStep.__call__=lambda self,components,state:(components,state)
    def reuse_semantic(self,components,state):
        state.set('frame_hiddens',cached.to(components._execution_device))
        return components,state
    MiniMaxMusic3SemanticGenerationStep.__call__=reuse_semantic
elif job.get('save_conditioning'):
    from diffusers.modular_pipelines.minimax_music3.encoders import MiniMaxMusic3SemanticGenerationStep
    original_semantic = MiniMaxMusic3SemanticGenerationStep.__call__
    def capture_semantic(self, components, state):
        components, state = original_semantic(self, components, state)
        torch.save(state.get('frame_hiddens').detach().cpu(), job_path.with_suffix('.frames.pt'))
        return components, state
    MiniMaxMusic3SemanticGenerationStep.__call__ = capture_semantic
progress('MiniMax 生成音樂，低記憶體模式可能需要較長時間')
frames = max(1, int(float(job['duration']) * pipe.frame_rate))
steps = {'ar': 0}
def ar_progress(module, args, output):
    steps['ar'] += 1
    done = min(frames, max(0, steps['ar'] - 1))
    progress('MiniMax 產生音樂編碼', done, frames)
def flow_progress(module, args, output):
    # CFG and chunking can call the transformer multiple times per sampling step.
    progress('MiniMax 合成音訊')
if not cache_name:pipe.language_model.model.register_forward_hook(ar_progress)
if profile == 'reference':pipe.transformer.register_forward_hook(flow_progress)
with torch.inference_mode():
    audio = pipe(prompt=job['prompt'], lyrics=job.get('lyrics', ''),
                 audio_duration=float(job['duration']),
                 generator=torch.Generator('cuda').manual_seed(job['seed']),
                 num_inference_steps=sampling['steps'], output_type='pt', output='audios')[0]
wave = torch.as_tensor(audio).detach().cpu().float()
if wave.ndim == 3:
    wave = wave[0]
if wave.ndim != 2 or not torch.isfinite(wave).all() or wave.abs().max() < 1e-6:
    raise RuntimeError('MiniMax 音訊為空白或無效')
rate = int(pipe.sampling_rate)
duration = wave.shape[-1] / rate
if duration < 1:
    raise RuntimeError('MiniMax 輸出音訊太短')
from audio_ending import write_audio
ending_info=write_audio(wave.T.numpy(),rate,ROOT/'generated/output'/job['output'],job.get('ending','none'))
result = {'model': 'minimax-music3', 'seconds': round(time.perf_counter()-started, 2),
          'duration': duration, 'sample_rate': rate, 'channels': wave.shape[0],
          'peak': float(wave.abs().max()), 'rms': float(wave.square().mean().sqrt()),
          'sampling': sampling, 'conditioning_reused': bool(cache_name), 'decode':getattr(pipe,'_localmuse_decode_info',None), 'profile': profile,'ending':ending_info, 'offload': 'automatic CPU + layer streaming'}
job_path.with_suffix('.audio.json').write_text(json.dumps(result), encoding='utf-8')
progress('完成')
print(json.dumps(result), flush=True)

"""MiniMax H3 via the project-owned sd.cpp CLI, with MP4 video/audio muxing."""
import json,os,re,subprocess,sys,time
from pathlib import Path
from h3_backend import ROOT,MODEL,ENGINE,installed,lora_application
from windows_child_job import bind
job_path=Path(sys.argv[1]).resolve();job=json.loads(job_path.read_text(encoding='utf-8'))
if not installed():raise RuntimeError('MiniMax H3權重未安裝完整')
avi=job_path.with_suffix('.h3.avi');output=ROOT/'generated/output'/job['output'];steps=job.get('steps',20)
prompt=job['prompt']
if job.get('profile')=='turbo':prompt+=' <lora:minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16:1>'
args=[str(ENGINE),'-M','vid_gen','--diffusion-model',str(MODEL/'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors'),'--llm',str(MODEL/'text_encoders/qwen3vl_32b_heretic_minimax_h3_nvfp4.gguf'),'--vae',str(MODEL/'vae/minimax_h3_video_vae_fp16.safetensors'),'--audio-vae',str(MODEL/'vae/minimax_h3_audio_vae_fp32.safetensors'),'--lora-model-dir',str(MODEL/'loras'),'--lora-apply-mode','at_runtime','-p',prompt,'--cfg-scale','1','--steps',str(steps),'--sampling-method','res_multistep','--scheduler','simple','--flow-shift','12','--rng','cpu','--fps','24','--video-frames',str(job['num_frames']),'-W',str(job['width']),'-H',str(job['height']),'-s',str(job['seed']),'--offload-to-cpu','--mmap','--max-vram','7.5','--params-backend','disk','--vae-tiling','-o',str(avi)]
if job.get('image'):args+=['--init-img',str(ROOT/'generated/input'/job['image'])]
def progress(stage,current=0):job_path.with_suffix('.progress.json').write_text(json.dumps({'stage':stage,'current':current,'total':steps}),encoding='utf-8')
start=time.perf_counter();progress('載入 MiniMax H3（原模型）');lora_counts=None
child=subprocess.Popen(args,cwd=ENGINE.parent,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace');close_job=bind(child)
try:
    for line in child.stdout:
        print(line,end='',flush=True)
        applied=lora_application(line)
        if applied:lora_counts=applied
        match=re.search(r'(\d+)\s*/\s*'+str(steps)+r'\b',line)
        if match:progress('MiniMax H3 生成影片與音訊',int(match[1]))
    if child.wait()!=0:raise RuntimeError('MiniMax H3引擎執行失敗，請查看任務紀錄')
    if job.get('profile')=='turbo' and (not lora_counts or lora_counts[0]!=lora_counts[1] or not lora_counts[0]):raise RuntimeError('Turbo LoRA沒有完整套用，停止保存結果')
finally:
    if child.poll() is None:child.kill();child.wait()
    if close_job:close_job()
from h3_finish import finish_video
finish_video(job_path,job,avi,output,progress,start)

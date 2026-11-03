"""Real GPU single-frame SR comparison on an existing H3 video, no generator rerun."""
import sys,json,time,hashlib,subprocess,threading,argparse
from pathlib import Path
import numpy as np,torch,cv2,imageio_ffmpeg
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'native'))
from vendor.realesrgan_test.rrdbnet_arch import RRDBNet
parser=argparse.ArgumentParser(description='Experimental SR comparison for a validated 864x480, 73-frame, 24 FPS H3 clip.')
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output-dir',type=Path,required=True)
args=parser.parse_args()
source=args.source.resolve();out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=True)
weights=root/'models/generation/upscale/RealESRGAN_x2plus.pth'
if not source.is_file() or not weights.is_file():parser.error('Source clip or official RealESRGAN_x2plus weights are missing')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();start=time.perf_counter();samples=[];stop=threading.Event()
def gpu_monitor():
 while not stop.wait(1):
  try:
   result=subprocess.run(['nvidia-smi','--query-gpu=memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=5)
   samples.append(float(result.stdout.strip().splitlines()[0]))
  except Exception:pass
thread=threading.Thread(target=gpu_monitor,daemon=True);thread.start()
# Load trusted official weights with restricted deserialization, no dependencies installed.
torch.set_num_threads(2);torch.backends.cudnn.benchmark=False
model=RRDBNet(3,3,scale=2,num_feat=64,num_block=23,num_grow_ch=32)
state=torch.load(weights,map_location='cpu',weights_only=True)
model.load_state_dict(state.get('params_ema',state.get('params',state)),strict=True)
model.eval().to('cuda',dtype=torch.float16);del state
torch.cuda.reset_peak_memory_stats()
@torch.inference_mode()
def enhance(rgb,tile=256,pad=64):
 h,w=rgb.shape[:2];tensor=torch.from_numpy(rgb.copy()).permute(2,0,1).unsqueeze(0).to('cuda',dtype=torch.float16)/255
 result=torch.empty((1,3,h*2,w*2),device='cpu',dtype=torch.float16)
 for y in range(0,h,tile):
  for x in range(0,w,tile):
   right,bottom=min(w,x+tile),min(h,y+tile)
   x0,y0=max(0,x-pad),max(0,y-pad);x1,y1=min(w,right+pad),min(h,bottom+pad)
   patch=model(tensor[:,:,y0:y1,x0:x1]).clamp_(0,1)
   result[:,:,y*2:bottom*2,x*2:right*2]=patch[:,:,(y-y0)*2:(bottom-y0)*2,(x-x0)*2:(right-x0)*2].cpu()
 return (result[0].float().permute(1,2,0).numpy()*255).round().clip(0,255).astype(np.uint8)
writers=[];handles=[];targets=[]
for label in ('ai','ai-balanced'):
 target=out/f'h3-cat-720p-{label}.mp4';targets.append(target)
 log=(out/f'upscale-{label}-ffmpeg.log').open('wb');handles.append(log)
 args=[ffmpeg,'-y','-v','error','-threads','2','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','24','-i','pipe:0','-i',str(source),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-threads','2','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',str(target)]
 writers.append(subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log))
reader=imageio_ffmpeg.read_frames(str(source),pix_fmt='rgb24');meta=next(reader);count=0;frame_times=[]
if tuple(meta['size'])!=(864,480) or abs(meta['fps']-24)>.01:raise ValueError('This experiment expects an 864x480, 24 FPS source')
try:
 for data in reader:
  rgb=np.frombuffer(data,dtype=np.uint8).reshape(480,864,3)
  tick=time.perf_counter();enhanced=enhance(rgb)
  ai=cv2.resize(enhanced,(1280,720),interpolation=cv2.INTER_LANCZOS4)
  plain=cv2.resize(rgb,(1280,720),interpolation=cv2.INTER_LANCZOS4)
  balanced=cv2.addWeighted(ai,.5,plain,.5,0)
  for writer,frame in zip(writers,(ai,balanced)):writer.stdin.write(frame.tobytes())
  if count in (0,35,72):
   for label,frame in [('source-lanczos',plain),('ai',ai),('ai-balanced',balanced)]:Image.fromarray(frame).save(out/f'ai-compare-{label}-{count}.png')
  frame_times.append(time.perf_counter()-tick);count+=1
  if count%8==0:print('FRAME',count,'elapsed',round(time.perf_counter()-start,1),flush=True)
 for writer in writers:
  writer.stdin.close()
  if writer.wait(timeout=120)!=0:raise RuntimeError('Encoder failed')
finally:
 reader.close()
 for writer in writers:
  if writer.poll() is None:writer.kill();writer.wait()
 for handle in handles:handle.close()
 stop.set();thread.join(timeout=6)
assert count==73
# Decode outputs and verify frame count and original encoded audio, no quality proxy score.
def audio_hash(path):
 data=subprocess.run([ffmpeg,'-v','error','-i',str(path),'-map','0:a:0','-c:a','copy','-f','adts','pipe:1'],check=True,capture_output=True).stdout
 return hashlib.sha256(data).hexdigest()
audio=audio_hash(source);exports=[]
for target in targets:
 reader=imageio_ffmpeg.read_frames(str(target),pix_fmt='rgb24');meta=next(reader);n=sum(1 for _ in reader)
 assert n==73 and tuple(meta['size'])==(1280,720) and audio_hash(target)==audio
 exports.append({'file':target.name,'frames':n,'fps':meta['fps'],'size':meta['size'],'bytes':target.stat().st_size,'audio_bitstream_unchanged':True})
report={'model':'RealESRGAN_x2plus','source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'weights_sha256':hashlib.sha256(weights.read_bytes()).hexdigest(),'tile':256,'tile_pad':64,'precision':'fp16','seed_used':False,'seconds_total_including_model_load_encoding_decode_checks':round(time.perf_counter()-start,2),'frame_seconds_mean':round(float(np.mean(frame_times)),3),'cuda_peak_allocated_mib':round(torch.cuda.max_memory_allocated()/1024**2,2),'cuda_peak_reserved_mib':round(torch.cuda.max_memory_reserved()/1024**2,2),'whole_gpu_peak_used_mib':max(samples,default=None),'whole_gpu_note':'Includes desktop and unrelated processes; model inference allocator peak is reported separately.','exports':exports,'note':'Independent per-frame SR, no temporal training; 50% blend reuses same AI frames. Inspect flicker visually. No generator inference or ComfyUI used.'}
(out/'ai-video-upscale-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report),flush=True)
canvas=Image.new('RGB',(1920,816),'white');draw=ImageDraw.Draw(canvas)
for row,frame in enumerate((0,35,72)):
 for col,label in enumerate(('source-lanczos','ai','ai-balanced')):
  image=Image.open(out/f'ai-compare-{label}-{frame}.png')
  # Same crop and scale for direct inspection of cat and street.
  crop=image.crop((0,300,900,660)).resize((640,256),Image.Resampling.LANCZOS)
  draw.text((col*640+10,row*272+2),f'{label} frame {frame}',fill='black');canvas.paste(crop,(col*640,row*272+16))
canvas.save(out/'ai-video-upscale-comparison.png')
print('AI_UPSCALE_PASS',flush=True)

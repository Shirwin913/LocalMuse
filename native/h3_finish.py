"""H3 post-generation export and streaming validation, separately testable with a saved AVI."""
import json,subprocess,time
import imageio_ffmpeg,numpy as np
from video_export import export_video,output_size

def finish_video(job_path,job,avi,output,progress,start):
    steps=job.get('steps',20)
    resolution=job.get('output_resolution','source')
    output_width,output_height=output_size(resolution,job['width'],job['height'])
    progress('封裝含音訊的MP4')
    source_output=output if resolution=='source' else output.with_name(output.stem+'.source.mp4')
    export_video(avi,source_output)
    export_result=None
    if resolution!='source':
        progress('CPU放大輸出 '+resolution+'（不增加GPU顯存）')
        export_result=export_video(source_output,output,resolution,encoded_source=True)
    # Validate frame-by-frame rather than allocating the whole HD clip and float diff.
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    reader=imageio_ffmpeg.read_frames(str(output),pix_fmt='rgb24');meta=next(reader)
    if tuple(meta['size'])!=(output_width,output_height):raise RuntimeError('H3輸出尺寸錯誤')
    count=0;nonblank=False;change_sum=0.;previous=None
    for data in reader:
        frame=np.frombuffer(data,dtype=np.uint8).reshape(output_height,output_width,3)
        nonblank=nonblank or float(frame.std())>=1
        if previous is not None:change_sum+=float(np.abs(frame.astype(np.int16)-previous.astype(np.int16)).mean())
        previous=frame;count+=1
    if count!=job['num_frames'] or not nonblank:raise RuntimeError('H3輸出影格數錯誤或空白')
    pcm=subprocess.run([ffmpeg,'-v','error','-i',str(output),'-map','0:a:0','-ac','2','-ar','32000','-f','f32le','pipe:1'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60).stdout
    audio=np.frombuffer(pcm,dtype='<f4')
    if len(audio)<3200 or not np.isfinite(audio).all():raise RuntimeError('H3音軌無效')
    result={'model':'minimax-h3','profile':job.get('profile','original'),'engine':'stable-diffusion.cpp','seconds':round(time.perf_counter()-start,2),'frames':count,'fps':24,'duration':count/24,'audio_duration':len(audio)/2/32000,'audio_rms':float(np.sqrt(np.mean(audio**2))),'width':output_width,'height':output_height,'generation_width':job['width'],'generation_height':job['height'],'output_resolution':resolution,'upscale':export_result,'source_file':source_output.name,'steps':steps,'encoding':{'video':'h264','crf':18,'preset':'medium','audio':'aac'},'sampler':'res_multistep','scheduler':'simple','frame_change':change_sum/max(1,count-1)}
    job_path.with_suffix('.video.json').write_text(json.dumps(result,indent=2),encoding='utf-8');progress('完成',steps);print(json.dumps(result),flush=True)
    return result

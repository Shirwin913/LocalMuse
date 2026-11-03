"""CPU-only, bounded-memory H3 exports. Upscaling is Lanczos, not AI detail recovery."""
import os, subprocess, time
from pathlib import Path
import imageio_ffmpeg

OUTPUT_SIZES = {'source': None, '720p': (1280, 720), '1080p': (1920, 1080)}

def output_size(resolution, width, height):
    if resolution not in OUTPUT_SIZES:
        raise ValueError('Unsupported output resolution')
    return OUTPUT_SIZES[resolution] or (width, height)

def export_video(source, destination, resolution='source', encoded_source=False):
    """Keep audio, stream frames through CPU filters, and publish only a complete file."""
    size=output_size(resolution, 0, 0)
    source, destination=Path(source), Path(destination)
    if source.resolve()==destination.resolve():
        raise ValueError('Source must be preserved')
    temporary=destination.with_name(destination.stem+'.encoding.mp4')
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    args=[ffmpeg,'-hide_banner','-loglevel','error','-y','-hwaccel','none','-threads','2','-i',str(source),'-map','0:v:0','-map','0:a:0']
    if resolution!='source':
        width,height=size
        args+=['-filter_threads','1','-vf',f'scale={width}:{height}:flags=lanczos:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1']
    args+=['-c:v','libx264','-threads','2','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy' if encoded_source else 'aac','-movflags','+faststart',str(temporary)]
    start=time.perf_counter()
    try:
        subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=600)
        os.replace(temporary,destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {'resolution':resolution,'width':size[0] or None,'height':size[1] or None,'method':'cpu-lanczos' if resolution!='source' else 'source','seconds':round(time.perf_counter()-start,2),'video':'h264','crf':18,'audio':'copy' if encoded_source else 'aac'}

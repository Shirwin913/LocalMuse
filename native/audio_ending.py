"""Optional amplitude-only endings. Never claim to compose a musical cadence."""
import os
from pathlib import Path
import numpy as np
import soundfile as sf

MODES={'none':0,'fade8':8,'fade12':12}
def validate_ending(value):
    if not isinstance(value,str) or value not in MODES:raise ValueError('不支援的音樂收尾方式')
    return value

def fade_file(source,destination,mode):
    validate_ending(mode)
    source,destination=Path(source),Path(destination)
    if mode=='none' or source.resolve()==destination.resolve():raise ValueError('Fade requires a separate destination and fade mode')
    temporary=destination.with_name(destination.stem+'.ending-tmp.wav')
    with sf.SoundFile(source) as reader:
        rate=reader.samplerate;frames=len(reader);channels=reader.channels
        if frames<2 or rate<=0:raise ValueError('Invalid source audio')
        # Cap processing to the last quarter for short clips, including terminal silence.
        fade_frames=max(2,min(round(MODES[mode]*rate),frames//4))
        quiet_frames=min(round(.4*rate),max(1,fade_frames//4))
        start=frames-fade_frames;end=frames-quiet_frames;position=0
        try:
            with sf.SoundFile(temporary,'w',samplerate=rate,channels=channels,format='WAV',subtype='PCM_16') as writer:
                while True:
                    block=reader.read(65536,dtype='float32',always_2d=True)
                    if not len(block):break
                    if not np.isfinite(block).all():raise ValueError('Non-finite source audio')
                    indices=np.arange(position,position+len(block))
                    phase=np.clip((indices-start)/max(1,end-start-1),0,1)
                    gain=(.5*(1+np.cos(np.pi*phase))).astype(np.float32)
                    block*=gain[:,None];writer.write(block);position+=len(block)
            os.replace(temporary,destination)
        finally:temporary.unlink(missing_ok=True)
    return {'mode':mode,'method':'cosine-amplitude-fade','fade_seconds':fade_frames/rate,'terminal_silence_seconds':quiet_frames/rate,'start_seconds':start/rate,'duration':frames/rate,'source_file':source.name,'natural_cadence_guaranteed':False}

def write_audio(wave,rate,destination,mode='none'):
    validate_ending(mode);destination=Path(destination)
    source=destination if mode=='none' else destination.with_name(destination.stem+'.original.wav')
    sf.write(source,wave,rate,subtype='PCM_16')
    return {'mode':'none','source_file':source.name} if mode=='none' else fade_file(source,destination,mode)

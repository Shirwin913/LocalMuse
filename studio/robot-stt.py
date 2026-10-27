import os, sys, io, json
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
import av
import numpy as np

def decode_recording(raw):
    # Decode here rather than faster-whisper 1.2.1's removed metadata_errors argument.
    if len(raw)>4000000: raise ValueError('Audio too large')
    resampler=av.AudioResampler(format='s16',layout='mono',rate=16000)
    pieces=[]
    samples=0
    def append(frames):
        nonlocal samples
        for frame in frames:
            values=frame.to_ndarray().reshape(-1)
            samples+=len(values)
            if samples>31*16000: raise ValueError('Recording exceeds 30 seconds')
            pieces.append(values)
    with av.open(io.BytesIO(raw),mode='r') as container:
        if not container.streams.audio: raise ValueError('No audio stream')
        for frame in container.decode(audio=0):
            frame.pts=None
            append(resampler.resample(frame))
        append(resampler.resample(None))
    if not pieces: raise ValueError('Empty audio')
    return np.concatenate(pieces).astype(np.float32)/32768.0

def recognize(model, raw, partial=False):
    audio=decode_recording(raw)
    segments,info=model.transcribe(audio,language='zh',beam_size=5,temperature=0,vad_filter=True,condition_on_previous_text=False,initial_prompt='以下是繁體中文對話。')
    return ''.join(s.text for s in segments).strip()

if __name__=='__main__':
    from faster_whisper import WhisperModel
    import base64
    model=WhisperModel(sys.argv[1],device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
    if '--worker' in sys.argv:
        for line in sys.stdin.buffer:
            request={}
            try:
                if len(line)>5500000: raise ValueError('Audio too large')
                request=json.loads(line)
                text=recognize(model,base64.b64decode(request['audio'],validate=True),request.get('partial',False))
                result={'id':request['id'],'text':text}
            except Exception:
                result={'id':request.get('id'),'error':'無法辨識此段錄音，請重試'}
            print(json.dumps(result,ensure_ascii=False),flush=True)
    else:
        print(json.dumps({'text':recognize(model,sys.stdin.buffer.read(4000001))},ensure_ascii=False))

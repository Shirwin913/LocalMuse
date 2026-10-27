import os, sys, io, contextlib
from pathlib import Path

home=Path(os.environ.get('KOKORO_HOME','D:/AI/Voice/Kokoro'))
os.environ['HF_HOME']=str(home/'cache')
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['CUDA_VISIBLE_DEVICES']='-1'
setup='--setup' in sys.argv
if not setup:
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['TRANSFORMERS_OFFLINE']='1'
import json, base64
with contextlib.redirect_stdout(sys.stderr):
    import torch, numpy as np, soundfile as sf
    from kokoro import KModel, KPipeline
    from opencc import OpenCC
    torch.set_num_threads(4)
    repo='hexgrad/Kokoro-82M-v1.1-zh'
    en=KPipeline(lang_code='a',repo_id=repo,model=False)
    def english(t):
        return next(en(t)).phonemes
    model=KModel(repo_id=repo).to('cpu').eval()
    pipeline=KPipeline(lang_code='z',repo_id=repo,model=model,en_callable=english)

def synthesize(text):
    if not text or len(text)>2000: raise ValueError('Invalid text length')
    text=OpenCC('t2s').convert(text)
    pieces=[]
    for result in pipeline(text,voice='zf_001',speed=1.0):
        if result.audio is not None:
            pieces.append(result.audio.detach().cpu().numpy())
    if not pieces: raise ValueError('No audio produced')
    data=io.BytesIO()
    sf.write(data,np.concatenate(pieces),24000,format='WAV',subtype='PCM_16')
    return data.getvalue()

if '--worker' in sys.argv:
    for line in sys.stdin:
        request={}
        try:
            if len(line)>16000: raise ValueError('Request too large')
            request=json.loads(line)
            text=base64.b64decode(request['audio'],validate=True).decode('utf-8')
            with contextlib.redirect_stdout(sys.stderr):
                wav=synthesize(text)
            result={'id':request['id'],'text':base64.b64encode(wav).decode('ascii')}
        except Exception as error:
            print(str(error),file=sys.stderr)
            result={'id':request.get('id'),'error':'Kokoro 發聲失敗，請重試或切換本機語音'}
        print(json.dumps(result),flush=True)
else:
    text='你好，這是本機語音測試。' if setup or '--test' in sys.argv else sys.stdin.read(4001).strip()
    with contextlib.redirect_stdout(sys.stderr):
        wav=synthesize(text)
    if setup or '--test' in sys.argv:
        (home/'sample-offline.wav').write_bytes(wav)
    else:
        sys.stdout.buffer.write(wav)

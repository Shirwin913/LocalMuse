"""Pinned MiniMax downloader with bounded range transfers and SHA256 validation."""
import concurrent.futures, hashlib, json, shutil, time, urllib.request, threading, os, tempfile
STOP=threading.Event()
URL_CACHE={}
URL_LOCK=threading.Lock()
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MODEL=ROOT/'models/generation/minimax-music3'
MANIFEST=ROOT/'native/minimax-model-manifest.json'
CHUNK=32*1024*1024
CACHE=Path(os.environ.get('LOCALMUSE_DOWNLOAD_CACHE',str(Path(os.environ.get('LOCALAPPDATA',tempfile.gettempdir()))/'LocalMuse/downloads/minimax-music3')))


def checksum(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()


def transfer(url, start, end, target):
    expected=end-start+1
    for attempt in range(6):
        if STOP.is_set():raise RuntimeError("Download stopped after another transfer failed")
        have=target.stat().st_size if target.exists() else 0
        if have==expected:return
        if have>expected:raise RuntimeError('Oversized partial download: '+str(target))
        try:
            offset=start+have
            request=urllib.request.Request(url,headers={'Range':f'bytes={offset}-{end}'})
            with urllib.request.urlopen(request,timeout=20) as response:
                wanted=f'bytes {offset}-{end}/'
                small_full_response=response.status==200 and offset==0 and expected<1024*1024
                if not small_full_response and (response.status!=206 or not response.headers.get('Content-Range','').startswith(wanted)):
                    raise RuntimeError('Server did not honor byte range')
                with target.open('ab') as stream:
                    while block:=response.read(1024*1024):stream.write(block)
            if target.stat().st_size!=expected:raise RuntimeError('Incomplete chunk')
            return
        except Exception as exc:
            if getattr(exc,'code',None)==403:
                key=target.parent.relative_to(CACHE).as_posix()
                with URL_LOCK:
                    if URL_CACHE.get(key)==url:
                        manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
                        source=f"https://huggingface.co/{manifest['repo']}/resolve/{manifest['revision']}/{key}?download=true"
                        with urllib.request.urlopen(urllib.request.Request(source,method='HEAD'),timeout=20) as response:
                            URL_CACHE[key]=response.geturl()
                    url=URL_CACHE[key]
            print('RETRY',target.name,attempt+1,type(exc).__name__,str(exc)[:160],flush=True)
            if attempt==5:raise
            time.sleep(min(5,attempt+1))


def download():
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
    plans=[];tasks=[]
    cache_path=ROOT/'work/minimax-resolved-urls.json'
    cache_path.parent.mkdir(parents=True,exist_ok=True)
    def resolve(entry):
        url=f"https://huggingface.co/{manifest['repo']}/resolve/{manifest['revision']}/{entry['path']}?download=true"
        if entry['size']<1024*1024:return entry['path'],url
        with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=20) as response:
            return entry['path'],response.geturl()
    needed=[f for f in manifest['files'] if not (MODEL/f['path']).is_file() or (MODEL/f['path']).stat().st_size!=f['size']]
    urls={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key,url in pool.map(resolve,needed):urls[key]=url
    URL_CACHE.update(urls)
    cache_path.write_text(json.dumps(urls))
    for entry in manifest['files']:
        path=MODEL/entry['path'];path.parent.mkdir(parents=True,exist_ok=True)
        size=entry['size'];digest=entry.get('lfs',{}).get('oid')
        if path.is_file() and path.stat().st_size==size and (not digest or checksum(path)==digest):
            print('READY',entry['path'],flush=True);continue
        part=path.with_name(path.name+'.part')
        folder=CACHE/entry['path'];folder.mkdir(parents=True,exist_ok=True)
        state=folder/'state.json'
        if state.exists():prefix=json.loads(state.read_text())['prefix']
        else:
            prefix=part.stat().st_size if part.exists() else 0
            if not 0<=prefix<=size:raise RuntimeError('Invalid partial file size')
            state.write_text(json.dumps({'prefix':prefix}))
        chunks=[]
        url=urls.get(entry['path']) or resolve(entry)[1]
        for start in range(prefix,size,CHUNK):
            end=min(size-1,start+CHUNK-1);target=folder/f'{start:012d}-{end:012d}.part'
            chunks.append(target);tasks.append((url,start,end,target))
        plans.append((entry,path,part,folder,state,prefix,chunks))
    print('TRANSFER',len(tasks),'chunks',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures=[pool.submit(transfer,*task) for task in tasks]
        for i,f in enumerate(concurrent.futures.as_completed(futures),1):
            try:f.result()
            except Exception:
                STOP.set()
                for pending in futures:pending.cancel()
                raise
            if i%8==0:print('CHUNKS',i,'/',len(tasks),flush=True)
    for entry,path,part,folder,state,prefix,chunks in plans:
        with part.open('r+b' if part.exists() else 'wb') as output:
            output.truncate(prefix);output.seek(prefix)
            for chunk in chunks:
                with chunk.open('rb') as source:shutil.copyfileobj(source,output,8*1024*1024)
        if part.stat().st_size!=entry['size']:raise RuntimeError('Size mismatch: '+entry['path'])
        if entry.get('lfs') and checksum(part)!=entry['lfs']['oid']:
            raise RuntimeError('SHA256 mismatch: '+entry['path'])
        part.replace(path)
        # Delete only scratch files created by this downloader, after full-file validation.
        for chunk in chunks:chunk.unlink()
        state.unlink()
        try:folder.rmdir()
        except OSError as exc:print('Cleanup skipped:',folder,type(exc).__name__,flush=True)
        print('DONE',entry['path'],flush=True)
    print('All MiniMax files downloaded and verified',flush=True)

if __name__=='__main__':download()

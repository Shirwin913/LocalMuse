"""Install a pinned standalone sd.cpp engine and the original Qwen Image 2.1 weights."""
import concurrent.futures,hashlib,json,shutil,sys,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'native'))
import download_minimax as transfer
TAG='master-1031-c6dfa9d'
ENGINE=ROOT/'runtime/sd-cpp'
def asset_download(asset):
    archive=ROOT/'work'/asset['name'];archive.parent.mkdir(parents=True,exist_ok=True)
    expected=asset['digest']
    if archive.is_file() and archive.stat().st_size==asset['size'] and 'sha256:'+transfer.checksum(archive)==expected:return archive
    with urllib.request.urlopen(urllib.request.Request(asset['browser_download_url'],method='HEAD')) as response:url=response.geturl()
    folder=ROOT/'work/sd-engine-chunks'/asset['name'];folder.mkdir(parents=True,exist_ok=True)
    tasks=[(url,start,min(asset['size']-1,start+8*1024*1024-1),folder/f'{start:012d}.part') for start in range(0,asset['size'],8*1024*1024)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for index,_ in enumerate(pool.map(lambda args:transfer.transfer(*args),tasks),1):print('ENGINE',index,len(tasks),flush=True)
    with archive.open('wb') as dest:
        for task in tasks:
            with task[-1].open('rb') as source:shutil.copyfileobj(source,dest)
    if 'sha256:'+transfer.checksum(archive)!=expected:raise RuntimeError('Engine checksum mismatch')
    return archive

def main():
    release=json.load(urllib.request.urlopen('https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/tags/'+TAG))
    ENGINE.mkdir(parents=True,exist_ok=True)
    selected=[a for a in release['assets'] if a['name']=='sd-master-c6dfa9d-bin-win-cuda12-x64.zip']
    if not (Path.home()/'anaconda3/Lib/site-packages/torch/lib/cublas64_12.dll').is_file():selected+=[a for a in release['assets'] if a['name']=='cudart-sd-bin-win-cu12-x64.zip']
    for asset in selected:
        with zipfile.ZipFile(asset_download(asset)) as archive:archive.extractall(ENGINE)
    cuda=Path.home()/'anaconda3/Lib/site-packages/torch/lib'
    for name in ('cudart64_12.dll','cublas64_12.dll','cublasLt64_12.dll'):
        if (cuda/name).is_file():shutil.copy2(cuda/name,ENGINE/name)
    (ENGINE/'source.json').write_text(json.dumps({'repo':'leejet/stable-diffusion.cpp','tag':TAG,'assets':[{'name':a['name'],'digest':a['digest']} for a in selected]}),encoding='utf-8')
    manifest=ROOT/'native/qwen-image-manifest.json';data=json.loads(manifest.read_text(encoding='utf-8'))
    model=ROOT/'models/generation/qwen-image-2.1';source=Path.home()/'AppData/Local/Comfy-Desktop/ComfyUI-Shared/models'
    for entry in data['files']:
        dst=model/entry['path'];src=source/entry['path'];dst.parent.mkdir(parents=True,exist_ok=True)
        if not dst.exists() and src.is_file():shutil.copy2(src,dst)
    transfer.MODEL=model;transfer.MANIFEST=manifest;transfer.CACHE=ROOT/'work/qwen-download-cache';transfer.download()
    print('Installed. Run a real generation validation before enabling Qwen.',flush=True)
if __name__=='__main__':main()

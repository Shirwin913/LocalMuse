"""Install H3 from existing weights; never imports the original ComfyUI runtime."""
import argparse,hashlib,json,shutil
from pathlib import Path
from h3_nvfp4_repack import convert
ROOT=Path(__file__).resolve().parents[1]
def checksum(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=Path.home()/'AppData/Local/Comfy-Desktop/ComfyUI-Shared/models');args=parser.parse_args()
    data=json.loads((ROOT/'native/h3-model-manifest.json').read_text(encoding='utf-8'));target=ROOT/'models/generation/minimax-h3'
    missing=sum(entry['size'] for entry in data['files'] if not (target/entry['path']).is_file())
    if shutil.disk_usage(ROOT).free<missing+1024**3:raise RuntimeError('Insufficient disk space for H3 model copies/conversion')
    for entry in data['files']:
        dest=target/entry['path'];dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.is_file() and dest.stat().st_size==entry['size'] and checksum(dest)==entry['sha256']:
            print('READY',entry['path'],flush=True);continue
        part=dest.with_name(dest.name+'.part')
        if dest.suffix=='.gguf':
            original=data['original_encoder'];source=args.source/original['path']
            if checksum(source)!=original['sha256']:raise RuntimeError('Original encoder checksum mismatch')
            convert(source,part)
        else:shutil.copy2(args.source/entry['path'],part)
        if part.stat().st_size!=entry['size'] or checksum(part)!=entry['sha256']:raise RuntimeError('Model checksum mismatch: '+entry['path'])
        part.replace(dest);print('VERIFIED',entry['path'],flush=True)
    print('H3 files installed. A real generation validation is required before enabling a new installation.',flush=True)
if __name__=='__main__':main()

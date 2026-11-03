"""Discover local GGUF language models without loading model tensors."""
import json,re,struct
from pathlib import Path


def _inside(root,relative):
    path=(root/relative).resolve()
    return path if path.is_relative_to(root) and path.is_file() else None


def _architecture(path):
    """Read bounded GGUF metadata, never model weights. None means invalid header."""
    try:
        size=path.stat().st_size
        with path.open('rb') as stream:
            def read(n):
                if stream.tell()+n>min(size,8*1024*1024):raise ValueError('metadata bound')
                data=stream.read(n)
                if len(data)!=n:raise ValueError('truncated metadata')
                return data
            def integer(fmt):return struct.unpack(fmt,read(struct.calcsize(fmt)))[0]
            def string(keep=False):
                n=integer('<Q')
                return read(n).decode('utf-8') if keep else read(n)
            def value(kind,keep=False):
                lengths={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8}
                if kind==8:return string(keep)
                if kind==9:
                    subtype=integer('<I');count=integer('<Q')
                    if count>1000000 or subtype==9:raise ValueError('invalid array')
                    if subtype in lengths:read(count*lengths[subtype])
                    else:
                        for _ in range(count):value(subtype)
                    return None
                if kind not in lengths:raise ValueError('unknown metadata type')
                read(lengths[kind]);return None
            if read(4)!=b'GGUF' or integer('<I') not in (2,3):return None
            tensors=integer('<Q');count=integer('<Q')
            if not tensors or count>100000:return None
            for _ in range(count):
                key=string(True);kind=integer('<I')
                result=value(kind,key=='general.architecture')
                if key=='general.architecture':return result if isinstance(result,str) else None
            return ''
    except (OSError,ValueError,UnicodeError,struct.error):return None


def load_catalog(model_root):
    root=Path(model_root).resolve();config=root/'catalog.json'
    items=json.loads(config.read_text(encoding='utf-8-sig')) if config.exists() else []
    if not isinstance(items,list):raise ValueError('models/catalog.json must contain an array')
    result={};registered=set();projectors=set()
    for item in items:
        if not isinstance(item,dict) or not all(isinstance(item.get(k),str) and item[k] for k in ('id','model')):continue
        path=_inside(root,item['model'])
        if not path or path.suffix.lower()!='.gguf':continue
        entry={**item,'label':item.get('label') or path.stem,'model':path.relative_to(root).as_posix(),'discovered':False}
        if item.get('projector'):
            projector=_inside(root,item['projector'])
            if projector:
                entry['projector']=projector.relative_to(root).as_posix();projectors.add(projector)
            else:entry.pop('projector',None)
        result[item['id']]=entry;registered.add(path)
    for path in sorted(root.rglob('*'),key=lambda p:p.as_posix().casefold()):
        relative=path.relative_to(root)
        if relative.parts[0].casefold()=='generation' or path.suffix.lower()!='.gguf':continue
        resolved=path.resolve()
        if not resolved.is_relative_to(root) or not path.is_file() or resolved in registered or resolved in projectors:continue
        if re.search(r'mmproj|projector',path.stem,re.I):continue
        shard=re.search(r'-(\d{5})-of-(\d{5})$',path.stem)
        if shard and (shard[1]!='00001' or not 1<=int(shard[2])<=10000):continue
        if shard and any(not path.with_name(re.sub(r'-\d{5}-of-',f'-{index:05d}-of-',path.name)).is_file() for index in range(1,int(shard[2])+1)):continue
        architecture=_architecture(path)
        if architecture is None or architecture=='clip':continue
        ident='local:'+relative.as_posix()
        if ident in result:continue
        result[ident]={'id':ident,'label':path.stem,'model':relative.as_posix(),'discovered':True}
        registered.add(resolved)
    return result

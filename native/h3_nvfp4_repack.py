"""Repack original Comfy NVFP4 values into GGML blocks without requantization.

Format references: Comfy-Org/comfy-quants docs/formats/nvfp4.md;
ggml-org/ggml block_nvfp4 and dequantize_row_nvfp4. No Comfy imports.
"""
import json,struct,math
from pathlib import Path
import numpy as np

def unblock_scales(blocked,rows,columns):
    nr=(rows+127)//128;nc=(columns+3)//4
    return blocked.reshape(nr,nc,32,4,4).transpose(0,1,3,2,4).reshape(nr,nc,128,4).transpose(0,2,1,3).reshape(nr*128,nc*4)[:rows,:columns]

def repack_blocks(packed,blocked):
    rows,half=packed.shape;columns=half*2
    if columns%64:raise ValueError('NVFP4 input width must divide 64')
    scales=unblock_scales(blocked,rows,columns//16)
    # Comfy alternates high/low nibbles; GGML stores first/last halves per group16.
    values=np.stack((packed>>4,packed&15),axis=-1).reshape(rows,columns//16,16)
    q=(values[...,:8]|(values[...,8:]<<4)).reshape(rows,columns//64,32)
    return np.concatenate((scales.reshape(rows,columns//64,4),q),axis=-1)

def string(value):
    value=value.encode('utf-8');return struct.pack('<Q',len(value))+value

def convert(source,destination):
    with source.open('rb') as f:
        size=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(size));base=8+size
    dtypes={'F32':('<f4',0),'F16':('<f2',1),'BF16':('<u2',30),'I8':('i1',24),'I32':('<i4',26),'I64':('<i8',27)}
    def array(key):
        x=header[key];dtype='u1' if x['dtype'] in ('U8','F8_E4M3') else dtypes[x['dtype']][0]
        return np.memmap(source,dtype=dtype,mode='r',offset=base+x['data_offsets'][0],shape=tuple(x['shape']) or (1,))
    nv={k[:-7] for k,v in header.items() if k.endswith('.weight') and v.get('dtype')=='U8' and k[:-7]+'.weight_scale_2' in header}
    plans=[];offset=0
    for key,x in sorted(header.items()):
        if key=='__metadata__' or key.endswith('.comfy_quant'):continue
        if any(key==prefix+suffix for prefix in nv for suffix in ('.weight_scale','.weight_scale_2')):continue
        if key=='model.embed_tokens.weight_scale':continue
        shape=x['shape'] or [1];kind='raw';outkey=key
        if key[:-7] in nv and key.endswith('.weight'):
            shape=[shape[0],shape[1]*2];typ=40;nbytes=math.prod(shape)//64*36;kind='nv'
        elif key=='model.embed_tokens.weight' and x['dtype']=='I8':typ=0;nbytes=math.prod(shape)*4;kind='embedding'
        else:
            if x['dtype'] not in dtypes:raise ValueError('Unexpected dtype: '+key+' '+x['dtype'])
            typ=dtypes[x['dtype']][1];nbytes=x['data_offsets'][1]-x['data_offsets'][0]
        plans.append((outkey,shape,typ,offset,nbytes,kind,key));offset=(offset+nbytes+31)//32*32
        if kind=='nv':
            prefix=key[:-7];plans.append((prefix+'.weight_scale',[1],0,offset,4,'scale',prefix+'.weight_scale_2'));offset+=32
    destination.parent.mkdir(parents=True,exist_ok=True)
    with destination.open('wb') as output:
        output.write(b'GGUF'+struct.pack('<IQQ',3,len(plans),1));output.write(string('general.alignment')+struct.pack('<II',4,32))
        for key,shape,typ,off,nbytes,kind,src in plans:
            output.write(string(key)+struct.pack('<I',len(shape))+struct.pack('<'+'Q'*len(shape),*reversed(shape))+struct.pack('<IQ',typ,off))
        data_start=(output.tell()+31)//32*32;output.write(b'\0'*(data_start-output.tell()))
        for index,(key,shape,typ,off,nbytes,kind,src) in enumerate(plans):
            output.seek(data_start+off)
            if kind=='nv':
                packed=array(src);scale=array(src[:-7]+'.weight_scale');result=repack_blocks(packed,scale)
                output.write(result.tobytes());del result,packed,scale
            elif kind=='embedding':
                embedding=array(src);scale=float(array('model.embed_tokens.weight_scale')[0])
                for start in range(0,shape[0],256):output.write((embedding[start:start+256].astype(np.float32)*scale).tobytes())
                del embedding
            else:
                data=array(src);output.write(data.tobytes());del data
            if output.tell()!=data_start+off+nbytes:raise RuntimeError('Tensor byte count mismatch: '+key)
            if index%50==0:print('REPACK',index,len(plans),key,flush=True)
    print('REPACK_DONE',destination.stat().st_size,flush=True)
    return {'nvfp4_layers':len(nv),'tensors':len(plans),'bytes':destination.stat().st_size,'requantized':False,'embedding':'original int8 values times original fp32 scale, stored fp32'}

if __name__=='__main__':
    import sys
    result=convert(Path(sys.argv[1]),Path(sys.argv[2]));Path(sys.argv[2]+'.json').write_text(json.dumps(result,indent=2),encoding='utf-8')

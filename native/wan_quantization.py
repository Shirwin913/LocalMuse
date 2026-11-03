"""Bounded NF4 single-file loading for the pinned Diffusers version.

Quantize one matrix on CUDA, return its packed weights to CPU, then let group
offload transfer only active blocks. Quantization statistics follow each active layer through a forward hook.
The original loader functions are restored even if checkpoint loading fails.
"""
from contextlib import contextmanager

@contextmanager
def raw_checkpoint_quantization(progress=None):
    from diffusers.loaders import single_file_model
    import torch
    import bitsandbytes as bnb
    factory=single_file_model.DiffusersAutoQuantizer
    dispatch=single_file_model.dispatch_model
    load=single_file_model.load_single_file_checkpoint
    def read(*args,**kwargs):
        if progress:progress('讀取 Wan 圖生影片權重')
        result=load(*args,**kwargs)
        if progress:progress('Wan 權重讀取完成，準備逐層量化')
        return result
    class RawFactory:
        @staticmethod
        def from_config(config):
            quantizer=factory.from_config(config,pre_quantized=False)
            create=quantizer.create_quantized_param
            count=[0]
            def create_bounded(model,value,name,*args,**kwargs):
                result=create(model,value,name,*args,**kwargs)
                parent,key=name.rsplit('.',1)
                module=model.get_submodule(parent)
                param=module._parameters[key]
                if isinstance(param,bnb.nn.Params4bit):
                    packed=param.to('cpu')
                    module._parameters[key]=packed
                count[0]+=1
                if count[0]%20==0:
                    torch.cuda.empty_cache()
                    if progress:progress('Wan 逐層量化：已處理 '+str(count[0])+' 組權重')
                return result
            quantizer.create_quantized_param=create_bounded
            return quantizer
    single_file_model.DiffusersAutoQuantizer=RawFactory
    single_file_model.dispatch_model=lambda model,**kwargs:model
    single_file_model.load_single_file_checkpoint=read
    try:yield
    finally:
        single_file_model.DiffusersAutoQuantizer=factory
        single_file_model.dispatch_model=dispatch
        single_file_model.load_single_file_checkpoint=load


def align_quantization_statistics(module,args):
    if args and module.weight.quant_state is not None:
        module.weight.quant_state.to(args[0].device)

def enable_quantized_group_offload(model):
    import torch
    import bitsandbytes as bnb
    for module in model.modules():
        if isinstance(module,bnb.nn.Linear4bit):module.register_forward_pre_hook(align_quantization_statistics)
    model.enable_group_offload(onload_device=torch.device('cuda'),offload_device=torch.device('cpu'),offload_type='block_level',num_blocks_per_group=1,use_stream=False)

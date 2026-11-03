"""Experimental whole-song Euler sampler; no ComfyUI imports or service calls."""
import torch


def windows(length, size, hop):
    if length < 1 or not 0 < hop <= size:
        raise ValueError('Invalid latent window dimensions')
    start = 0
    while True:
        end = min(length, start + size)
        yield start, end
        if end == length:return
        start += hop


def sample_global(transformer, condition, seed, steps, cfg, window, hop, progress):
    device = condition.device
    # Shared latent timeline and Euler accumulation stay FP32; model calls use BF16.
    latents = torch.randn((condition.shape[0], 128, condition.shape[1]),
                          generator=torch.Generator('cpu').manual_seed(seed), dtype=torch.float32).to(device)
    spans = list(windows(latents.shape[-1], window, hop))
    for step in range(steps):
        velocity = torch.zeros_like(latents)
        counts = torch.zeros((1, 1, latents.shape[-1]), device=device)
        time = torch.full((latents.shape[0],), step / steps, device=device, dtype=condition.dtype)
        for start, end in spans:
            x = latents[..., start:end].to(condition.dtype)
            c = condition[:, start:end]
            positive = transformer(hidden_states=x, timestep=time, encoder_hidden_states=c, return_dict=False)[0].float()
            negative = transformer(hidden_states=x, timestep=time, encoder_hidden_states=torch.zeros_like(c), return_dict=False)[0].float()
            velocity[..., start:end] += negative + cfg * (positive - negative)
            counts[..., start:end] += 1
        latents += velocity / counts / steps
        progress('MiniMax 整段音樂採樣', step + 1, steps)
    return latents


def install_global_sampler(progress, seed, steps, cfg):
    from diffusers.modular_pipelines.minimax_music3.denoise import MiniMaxMusic3ChunkDenoiseStep
    def denoise(self, components, state):
        block = self.get_block_state(state)
        hidden = block.frame_hiddens.to(components._execution_device)
        condition = components.condition_encoder(hidden.to(components.condition_encoder.dtype)).to(components.transformer.dtype)
        window = max(1, int(200 / components.frame_rate * components.sampling_rate / components.latent_hop_length))
        hop = max(1, int(100 / components.frame_rate * components.sampling_rate / components.latent_hop_length))
        with torch.inference_mode():
            latents = sample_global(components.transformer, condition, seed, steps, cfg, window, hop, progress)
        block.latent_chunks = [latents]
        self.set_block_state(state, block)
        return components, state
    MiniMaxMusic3ChunkDenoiseStep.__call__ = denoise


def decode_tiled(decoder, latents, hop_length, tile_length=1536, overlap=64, progress=lambda *args:None):
    """Decode bounded windows onto CPU, normalize overlapping sample weights."""
    latents=latents.detach().cpu()
    length=latents.shape[-1]
    tile=min(tile_length,max(length,overlap+1))
    while True:
        try:
            output=None
            counts=torch.zeros(length*hop_length,dtype=torch.float32)
            spans=list(windows(length,tile,tile-overlap))
            for index,(start,end) in enumerate(spans):
                wave=decoder(latents[...,start:end]).detach().cpu().float()
                if wave.shape[-1]!=(end-start)*hop_length:raise RuntimeError('Unexpected vocoder output length')
                if output is None:output=torch.zeros((*wave.shape[:-1],length*hop_length),dtype=torch.float32)
                weight=torch.ones(wave.shape[-1])
                fade=min(overlap*hop_length,wave.shape[-1])
                if start:weight[:fade]*=torch.linspace(0,1,fade)
                if end<length:weight[-fade:]*=torch.linspace(1,0,fade)
                left=start*hop_length;right=end*hop_length
                output[...,left:right]+=wave*weight
                counts[left:right]+=weight
                progress('MiniMax 分塊解碼音訊',index+1,len(spans))
            if output is None or bool((counts<=0).any()):raise RuntimeError('Incomplete decoded audio coverage')
            return output/counts,{'tile_length':tile,'overlap':overlap,'tiles':len(spans)}
        except torch.cuda.OutOfMemoryError:
            if tile<=256:raise
            output=None
            tile=max(256,tile//2)
            if torch.cuda.is_available():torch.cuda.empty_cache()


def install_tiled_decoder(progress):
    from diffusers.modular_pipelines.minimax_music3.decoders import MiniMaxMusic3VocoderDecodeStep
    def decode(self,components,state):
        block=self.get_block_state(state)
        # These stages are finished. Remove their manager references and free their memory.
        components.unload_components(['language_model','rvq_depth_decoder','condition_encoder','transformer'])
        def part(z):
            return components.vocoder(z.to(components._execution_device,dtype=components.vocoder.dtype))
        wave,info=decode_tiled(part,block.latent_chunks[0],components.latent_hop_length,progress=progress)
        components._localmuse_decode_info=info
        block.audios=wave.clamp(-1,1) if block.output_type=='pt' else wave.clamp(-1,1).numpy()
        self.set_block_state(state,block)
        return components,state
    MiniMaxMusic3VocoderDecodeStep.__call__=decode

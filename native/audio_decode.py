"""Select a codec device after the music generation model has been released."""
import gc
import time
from contextlib import nullcontext
import torch


def decode_audio(codec, codes, progress, seed):
    # BF16 weights plus a conservative allowance for the fixed 29.76s codec window.
    weights = sum(t.numel() * (2 if t.is_floating_point() else t.element_size())
                  for t in list(codec.parameters()) + list(codec.buffers()))
    required = weights + max(2 * 1024**3, int(weights * 0.3))
    free = 0
    available = torch.cuda.is_available()
    if available:
        try:
            torch.cuda.empty_cache()
            free, _ = torch.cuda.mem_get_info()
        except RuntimeError:
            available = False
    use_gpu = available and free >= required
    info = {'device': 'cuda' if use_gpu else 'cpu', 'free_bytes': free,
            'estimated_required_bytes': required,
            'reason': 'sufficient_vram' if use_gpu else 'insufficient_vram' if available else 'cuda_unavailable'}
    codes = codes.detach().cpu()
    started = time.perf_counter()

    def run(device):
        torch.manual_seed(seed)
        if device == 'cuda':
            torch.cuda.manual_seed_all(seed)
        dtype = torch.bfloat16 if device == 'cuda' else torch.float32
        codec.to(device=device, dtype=dtype)
        codec.eval()
        context = torch.autocast('cuda', dtype=torch.bfloat16) if device == 'cuda' else nullcontext()
        with torch.inference_mode(), context:
            return codec.detokenize(codes, device=device).detach().cpu().float()

    wave = None
    if use_gpu:
        progress('GPU 解碼音訊')
        try:
            wave = run('cuda')
        except torch.cuda.OutOfMemoryError:
            # Retry decoding the existing tokens, without generating the music again.
            info.update(device='cpu', reason='gpu_out_of_memory')
        if wave is None:
            progress('GPU 記憶體不足，改用 CPU 解碼音訊')
            codec.to(device='cpu', dtype=torch.float32)
            gc.collect()
            torch.cuda.empty_cache()
    if wave is None:
        progress('CPU 解碼音訊，這個階段可能需要數分鐘')
        wave = run('cpu')
    info['seconds'] = round(time.perf_counter() - started, 2)
    return wave, info

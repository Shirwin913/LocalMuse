"""Standalone tiled Real-ESRGAN image export; never replaces the source."""
import argparse, json, os, time
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageOps
from vendor.realesrgan_test.rrdbnet_arch import RRDBNet

ROOT = Path(__file__).resolve().parents[1]

def target_size(width, height, mode):
    if mode not in ('2x', '4k'):
        raise ValueError('Unsupported upscale mode')
    scale = 2 if mode == '2x' else 3840 / max(width, height)
    if scale <= 1 or width * height > 4194304:
        raise ValueError('圖片需小於目標尺寸，且原圖不可超過 400 萬像素')
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    if max(size) > 8192:
        raise ValueError('輸出尺寸超過限制')
    return size

@torch.inference_mode()
def enhance(model, image, device, tile=128, pad=32):
    width, height = image.size
    # Keep the full input and output in system RAM; only a tile occupies VRAM.
    tensor = torch.from_numpy(np.array(image).copy()).permute(2, 0, 1).unsqueeze(0).float().div_(255)
    tensor = torch.nn.functional.pad(tensor, (0, width % 2, 0, height % 2), mode='replicate')
    result = np.empty((height * 2, width * 2, 3), dtype=np.uint8)
    dtype = next(model.parameters()).dtype
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            right, bottom = min(width, x + tile), min(height, y + tile)
            x0, y0 = max(0, x-pad), max(0, y-pad)
            x1, y1 = min(tensor.shape[3], right+pad), min(tensor.shape[2], bottom+pad)
            patch = model(tensor[:, :, y0:y1, x0:x1].to(device=device, dtype=dtype)).clamp_(0, 1)
            crop = patch[0, :, (y-y0)*2:(bottom-y0)*2, (x-x0)*2:(right-x0)*2]
            result[y*2:bottom*2, x*2:right*2] = crop.float().permute(1, 2, 0).cpu().numpy().__mul__(255).round().astype(np.uint8)
            del patch, crop
    return Image.fromarray(result)

def upscale(source, destination, mode):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Must preserve source')
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGB')
    size = target_size(*image.size, mode)
    original = image.size
    torch.set_num_threads(2)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = RRDBNet(3, 3, scale=2, num_feat=64, num_block=23, num_grow_ch=32)
    state = torch.load(ROOT/'models/generation/upscale/RealESRGAN_x2plus.pth', map_location='cpu', weights_only=True)
    model.load_state_dict(state.get('params_ema', state.get('params', state)), strict=True)
    del state
    model.eval().to(device=device, dtype=torch.float16 if device == 'cuda' else torch.float32)
    start = time.perf_counter()
    passes = 0
    while image.width < size[0] or image.height < size[1]:
        try:
            image = enhance(model, image, device)
        except torch.cuda.OutOfMemoryError:
            # Retry the same pass on CPU, without discarding the original input.
            model.cpu().float()
            torch.cuda.empty_cache()
            device = 'cpu'
            image = enhance(model, image, device)
        passes += 1
    image = image.resize(size, Image.Resampling.LANCZOS)
    temporary = destination.with_suffix('.tmp.png')
    try:
        image.save(temporary, format='PNG')
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {'width': size[0], 'height': size[1], 'source_width': original[0], 'source_height': original[1], 'model': 'RealESRGAN_x2plus', 'passes': passes, 'device': device, 'seconds': round(time.perf_counter()-start, 2)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source'); parser.add_argument('destination'); parser.add_argument('--mode', choices=['2x', '4k'], default='4k')
    args = parser.parse_args()
    print(json.dumps(upscale(args.source, args.destination, args.mode)), flush=True)

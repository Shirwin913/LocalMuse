# Experimental video super-resolution

This experiment is not enabled in the studio UI. It uses project-owned PyTorch and standalone BasicSR RRDBNet with official RealESRGAN_x2plus weights. No ComfyUI runtime is imported. Original source and existing studio exports are preserved. Test outputs are private and should go under an ignored directory such as work/sr-test.

Download the official model linked in models/generation/upscale/test-provenance.json to models/generation/upscale/RealESRGAN_x2plus.pth and check its SHA256: 49fafd45f8fd7aa8d31ab2a22d14d91b536c34494a5cfe31eb5d89c2fa266abb. The model is not committed.

From the repository root on Windows:

```powershell
runtime/generation-env/Scripts/python.exe native/experiments/compare_video_upscale.py --source "path/to/480p-clip.mp4" --output-dir "work/sr-test"
```

The validated experiment expects 864x480, 24 FPS, 73 frames (about 3.04 seconds). It uses CUDA FP16, 256-pixel tiles with 64-pixel context padding, then resizes the 2x output to 1280x720. It writes a pure SR candidate and a 50% SR / 50% Lanczos candidate using the same inferred frames; original AAC audio is copied. Outputs with the same experiment filenames in output-dir are replaced on rerun, so use a fresh directory to retain comparisons.

RTX3080 10GB test: approximately 38.45 seconds including loading, two encodes and decode validation. Peaks from PyTorch were 297 MiB allocated and 514 MiB reserved; whole-GPU sampled use was 7238 MiB including other processes and context, so the allocator number is not total process VRAM. No OOM occurred. This is not a guarantee for other GPUs or concurrent loads.

Sampled fur/building edges were clearer than Lanczos; blurred paws were not repaired. A one-frame full-image reference check found lower tile-boundary differences with padding64 than padding32. This frame-independent model has no temporal consistency constraint, and fine flicker remains unverified across diverse scenes/long clips. The balanced version is a conservative candidate, not an approved default. No ground-truth quality score is claimed. Original vendor sources and licenses are in native/vendor/realesrgan_test.

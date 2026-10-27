# HeartMuLa standalone source
Vendored from the existing ComfyUI_FL-HeartMuLa/heartlib package. Only the heartlib model/pipeline code is used; no ComfyUI runtime or node code is imported.
Upstream: https://github.com/HeartMuLa/heartlib
Local adaptations: package init exposes only the music pipeline; worker adapts eight scalar codec status-buffer shapes to the checkpoint, rebuilds nonpersistent RoPE caches and keeps HeartCodec on CPU. Checkpoint values are preserved. HeartMuLa inference is NF4/BF16 with cfg_scale=1.

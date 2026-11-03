# 獨立 Wan 影片後端

目前可用：文字生成短片，Wan2.1 T2V1.3B，1–3秒、16 FPS，輸出不含音訊的MP4。介面比例會配置至約480p級尺寸（16:9為832x464），採樣30步。模型可能產生動作或構圖偏差，不等同原MiniMax H3音畫生成。

實機：RTX3080 10GB、32GB RAM，約1秒832x480測試模型載入及生成69.71秒；完整API 3秒49影格、832x464測試251.1秒，包含任務完成、MP4解碼、作品庫、生成配方與Range播放驗證。

256x144的低解析測試明顯失真，已棄用；不會將「可以播放」視為品質驗證。

圖片生影片已啟用：Wan2.1 I2V14B，以NF4量化和逐層CPU/GPU搬移配合10GB顯示記憶體，限制單張圖片、1秒、16 FPS、約480p。完整API測試832x464、17影格耗時380.34秒，完成MP4解碼、作品庫、配方及Range播放驗證。實際檢視保留了輸入圖片中的主體和場景，動作與細節仍可能偏移；輸出沒有音訊。

I2V權重在 models/generation/wan-i2v-14b，約32.79GB；共用專案內UMT5、VAE與CLIP-H。原始權重保留。官方配置來源Wan-AI/Wan2.1-I2V-14B-480P-Diffusers，revision b184e23a8a16b20f108f727c902e769e873ffc73。native/wan_quantization.py只在獨立worker載入時處理量化及搬移，未匯入ComfyUI。

模型在 models/generation/wan-1.3b。native/setup_wan.py使用本機Wan1.3B與VAE，僅下載官方固定版本配置與tokenizer；將既有scaled-FP8 UMT5逐權重乘scale_weight，轉存BF16分片。沒有匯入ComfyUI或使用其Python環境，原權重保留。此配置需要既有Anaconda CUDA PyTorch，不是完全可攜式安裝包。

native/video_worker.py 先讓UMT5逐層在GPU編碼，釋放後才載入影片模型；VAE使用FP32及tiling，MP4使用專案環境imageio-ffmpeg0.6.0。Windows中文路徑由native/wan_tokenizer.py以相對路徑載入SentencePiece處理。

官方來源：https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B-Diffusers
固定revision：0fad780a534b6463e45facd96134c9f345acfa5b。

# 圖生圖與參考圖生成

介面選「圖生圖／參考圖生成」，再選生成方式並加入一張 JPG、PNG 或 WebP（10MB以內）。

- 圖生圖：SDXL Turbo img2img，以原圖作起點，strength 0.75，可能改變細節與人物。
- 參考圖生成：SDXL Turbo + IP-Adapter SDXL ViT-H，用 CLIP-H 影像 embedding 參考外觀／風格，adapter scale 0.6。不是精準人物保留、衣物替換或多圖合成。

兩者均直接呼叫專案的 Diffusers worker，不啟動ComfyUI。權重位於 models/generation/ip-adapter，來自既有本機權重，已逐檔 SHA256 校驗，原檔保留。native/setup_reference.py 可重新準備權重；新機仍需原始來源檔及生成環境，並完成實機驗證才能建立validated marker。

已通過兩種方式的真實GPU推論、API、配方保存、圖片讀取及作品庫測試；介面參考圖選項已透過瀏覽器確認可用。測試不代表所有人物或提示詞皆能精準重現。

模型來源與配置：https://huggingface.co/h94/IP-Adapter

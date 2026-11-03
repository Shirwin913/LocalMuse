# Qwen Image 2.1 獨立後端

使用stable-diffusion.cpp固定版本master-1031-c6dfa9d，直接讀取原工作流相同的INT8 ConvRot diffusion與Qwen3-VL 8B文字編碼器，以及BF16 VAE。模型在models/generation/qwen-image-2.1；官方檔案版本與SHA256在native/qwen-image-manifest.json。原模型保留。

原始檔位於此電腦ComfyUI Desktop共用模型資料夾；安裝只複製權重，推論不匯入ComfyUI，也不啟動其服務或Python環境。native/setup_qwen_image.py可重新安裝引擎、優先複製既有權重，缺檔才由固定版本下載並校驗。

圖片採25步、CFG1、Euler，保留中文提示詞；SDXL Turbo仍使用英文翻譯及4步流程。兩者在圖片模型選單明確區分。設定simple排程及CPU亂數，仍因不同引擎的量化與運算實作而不保證逐像素一致；相同權重不代表相同種子得到完全相同圖像。

已通過RTX3080 10GB、32GB RAM實機測試：1024×1024、25步約49.44秒；完整文生圖API（992×992）約40.35秒，單張指令編輯（544×544）約32.38秒。測試中文漫畫貓咪生成與眼睛改藍色，已檢視輸出；作品附件、原中文提示詞、模型名稱、種子與參考圖配方均保存。

使用8GiB引擎顯存預算、CPU權重搬移、mmap及VAE分塊解碼；實際速度依解析度與提示詞而異。現僅接受一張編輯參考圖，未驗證多圖編輯。新版網頁預設Qwen，舊SDXL配方仍按舊模型還原，沒有暗中改模型。

來源：https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/qwen_image_2.1.md
權重：https://huggingface.co/Comfy-Org/Qwen-Image-2.1

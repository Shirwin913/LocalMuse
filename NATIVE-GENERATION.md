# 專案獨立生成引擎

## 已支援
- llama.cpp：專案內的文字／視覺 GGUF 模型。
- SDXL Turbo：文生圖、單張 img2img 轉換，4 步、CFG 0、最長邊 768 像素；不是 Qwen 精準指令式編輯。
- HeartMuLa 3B：10–60 秒音樂，NF4／BF16 模型在 GPU，HeartCodec 在 CPU，CFG 1；輸出 48kHz PCM16 WAV。

這些生成模式不呼叫 ComfyUI。MiniMax 音樂、影片、Qwen Image 2.1 精準／多圖編輯尚未完成獨立化，對應選項保持停用；既有作品仍保留。

## 使用
重啟 start.bat，拉開生成設定並選模式。圖片轉換限一張圖。音樂預設 HeartMuLa、10 秒，主輸入框描述風格，歌詞填在獨立欄位；音訊 CPU 解碼可能需要數分鐘。留白歌詞使用 [Instrumental]，不能保證完全無人聲。

## 模型與環境
語言模型位於 models/；SDXL Turbo 位於 models/generation/sdxl-turbo/，約 6.94 GB；HeartMuLa 與 HeartCodec 位於 models/generation/heartmula/，約 22.4 GB。原檔保留。
生成模型清單為 models/generation/catalog.json，本機模型按鈕顯示檔案狀態。尚未提供通用自動下載、刪除或格式轉換介面。
runtime/generation-env 為專案套件環境，仍共用此電腦 Anaconda Python 3.12 的 CUDA PyTorch；Whisper／Kokoro 也仍使用原本 D:/AI/Voice。因此不是完全可攜式套件。
setup-generation.bat 可重建套件與圖片設定；模型權重不會自動重新下載。

## 程式與檔案
native/generation_service.py 管理佇列與進度，native/image_worker.py、native/music_worker.py 執行推論；native/vendor/heartlib 是音樂原始碼，沒有匯入 ComfyUI 節點。音樂細節與來源見 native/MUSIC.md。
studio/comfy-integration.js 暫時保留檔名及原工作流程傳輸格式，以維持既有對話／作品庫介面；實際接收端是專案服務，沒有執行 ComfyUI 節點。
generated/jobs/ 保存任務、階段和執行紀錄；generated/input/ 保存參考圖；generated/output/ 保存輸出。SQLite 正式對話與附件仍在 studio/data/。

## 連接埠
8787 網頁、8788 模型協定轉接、8091 llama.cpp、8789 專案生成服務。新版不再連接 ComfyUI 的 8188。

## 驗證摘要
圖片生成、img2img、保存與作品庫已實測；黃花改藍花的精準修改未成功，不能把 img2img 當作精準編輯。
HeartMuLa 獨立 worker 約 273 秒生成 10.08 秒音訊；完整工作台流程約 280.54 秒，保存、下載、分段讀取及作品庫均通過。音訊非靜音且數值有效，旋律品質及歌詞正確率未作聆聽評分。

[SDXL Turbo 官方說明](https://huggingface.co/docs/diffusers/api/pipelines/stable_diffusion/sdxl_turbo)
[HeartMuLa 官方專案](https://github.com/HeartMuLa/heartlib)

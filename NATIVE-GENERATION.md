# 專案獨立生成引擎

## 已支援
- llama.cpp：專案內的文字／視覺 GGUF 模型。
- SDXL Turbo：文生圖、單張 img2img 轉換，4 步、CFG 0、最長邊 768 像素；不是 Qwen 精準指令式編輯。
- HeartMuLa 3B：10–180 秒音樂，NF4／BF16 模型在 GPU，HeartCodec 自動選擇 GPU／CPU，CFG 1；輸出 48kHz PCM16 WAV。
- MiniMax Music 3：5–300 秒上限，獨立 Diffusers 環境、CPU／GPU 權重搬移，輸出 44.1kHz 雙聲道 PCM16 WAV。模型可能提前結束。

- IP-Adapter SDXL：單張參考圖生成，參考外觀與風格；詳見 native/REFERENCE.md。
- Wan2.1 T2V1.3B：1–3秒無聲短片、16 FPS、約480p級尺寸；詳見 native/WAN.md。

這些生成模式不呼叫 ComfyUI。圖片生影片使用 Wan2.1 I2V14B NF4，現限1秒、16 FPS，逐層搬移權重以配合10GB顯示記憶體；完整API測試耗時380.34秒。Qwen Image 2.1 已支援文生圖與單張指令編輯，使用專案內的 stable-diffusion.cpp；多圖尚未開放。詳見 native/QWEN-IMAGE.md。

## 使用
重啟 start.bat，拉開生成設定並選模式。圖片轉換限一張圖。音樂預設 HeartMuLa、10 秒，主輸入框描述風格，歌詞填在獨立欄位；音訊自動選擇 GPU／CPU 解碼，CPU 可能需要數分鐘。HeartMuLa 的留白歌詞使用 [Instrumental]；MiniMax 保留空白歌詞，與原工作流一致。兩者皆不能保證完全無人聲。

## 模型與環境
語言模型位於 models/；SDXL Turbo 位於 models/generation/sdxl-turbo/，約 6.94 GB；HeartMuLa 與 HeartCodec 位於 models/generation/heartmula/，約 22.4 GB。MiniMax Music 3 位於 models/generation/minimax-music3/，約 28.5 GB，環境為 runtime/minimax-env。原檔保留。
生成模型清單為 models/generation/catalog.json，本機模型按鈕顯示檔案狀態。尚未提供通用自動下載、刪除或格式轉換介面。
runtime/generation-env 為專案套件環境，仍共用此電腦 Anaconda Python 3.12 的 CUDA PyTorch；Whisper／Kokoro 也仍使用原本 D:/AI/Voice。因此不是完全可攜式套件。
tools/setup-generation.bat 可重建套件與圖片設定；模型權重不會自動重新下載。

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

## 原MiniMax H3影片模型

已獨立接入原FL2VA INT8主模型、文字編碼器、兩個VAE及可選Turbo LoRA，輸出含聲音的MP4。與Wan分開選擇，原始20步和Turbo8步皆已實測。文字設定1–3秒、圖片設定1秒，24FPS、約147456像素；同種子不保證和ComfyUI完全一致。詳見native/H3.md。


## 2026-11-03 畫質比較與480p短片

以相同歐洲街道虎斑貓提示詞、seed 20261102、原始20步、73影格、24 FPS及CRF18實際生成：
- 512×288：262.19秒；864×480：375.43秒，約多43%。兩者實際約3.042秒，含可解碼音軌。
- 480p街道、牆面等背景細節較清楚，但貓腳動態模糊仍存在。解析度改變會改變構圖與動作，即使相同種子也不是逐像素對照。
- 864×480、736×416、672×384的243影格（約10秒）均因GPU記憶體不足失敗，未開放高解析長片。
- 平台新增可選480p，僅支援H3原始20步、文生影片、16:9、設定1–3秒；實際驗證為3秒，其他秒數沿用影格對齊規則。Turbo及圖生影片480p未驗證，不開放。標準畫質仍為預設。
- H264改為medium/CRF18，降低額外壓縮損失。同一AVI比較CRF23/18，SSIM由0.974162升至0.985176，檔案約增一倍；轉檔1.45秒。這不是模型品質或自然度分數。
- 真實GPU生成與MP4解碼已通過。另以已生成影片作路由測試，驗證作品庫、配方、Range播放及三種非法設定拒絕；該路由測試沒有重新執行GPU推論。瀏覽器已確認480p比例限制、3秒上限，以及Turbo/圖生影片禁用。


## 2026-11-03 低顯存720p／1080p輸出

平台新增「輸出解析度」：原始尺寸、720p（CPU放大）、1080p（CPU放大）。目前限H3原始20步文生影片、480p、16:9、設定1–3秒。生成尺寸仍為864×480，生成結束且CLI退出後才由FFmpeg的CPU Lanczos濾鏡輸出1280×720或1920×1080；沒有使用GPU放大、AI超解析或ComfyUI。這是規避高解析生成的顯存需求，不是讓10GB顯卡具備原生1080p生成能力，也不修復模型缺失細節。沒有自動延長或拼接影片。

保留generated/output/<id>.source.mp4原片與原本job AVI，最終<id>.mp4為指定輸出；不覆蓋原模型。影片逐影格驗證，不再一次堆疊整段高解析RGB影片及float差分到RAM。音軌stream copy保留；轉檔先寫臨時檔、成功才替換，失敗清除部分檔且原片保留。新增輸出設定會存入配方與作品資訊，舊配方預設原始尺寸。

既有真實GPU生成的3.042秒、73影格480p貓咪片：720p額外2.31秒、1080p4.99秒；影格數/FPS/時長不變，AAC位元流SHA256與來源一致。兩者實際解碼並檢視影格，細節受原片限制。測試程序樹含FFmpeg與解碼檢查的RSS峰值約484MB，這不是顯存或系統整體RAM峰值。完整H3後處理函式也用既有原始AVI實測1080p通過（約8秒含原片編碼與檢查），沒有重做未變更的GPU推論。私人API測試驗證真實CPU放大、作品庫/配方/Range與五種非法組合拒絕；模型enqueue使用既有生成片替身。正式頁面選單與Turbo自動重設已以瀏覽器驗證。

# LocalMuse（本機繆思）— 單人本機 AI 工作台

雙擊 `start.bat` 啟動，直接進入聊天，不需要帳號。舊服務正在執行時先按 Ctrl+C，再重新啟動。

目前使用 llama.cpp 處理文字／圖片問答，並以專案自己的 Diffusers 引擎處理 SDXL Turbo 文生圖、單張圖片轉換、SDXL IP-Adapter 參考圖、Wan 文字與圖片生短片，以及 HeartMuLa 3B／MiniMax Music 3 音樂生成，無需 ComfyUI。Qwen Image 2.1 已透過專案內的 stable-diffusion.cpp 支援文生圖與單張指令編輯；多圖編輯尚未開放。圖片設定可選原 Qwen 模型或 SDXL Turbo 快速模式，詳見 native/QWEN-IMAGE.md。

請閱讀 `NATIVE-GENERATION.md`，查看模型位置、執行環境、驗證結果及限制。模型已在專案內，但生成環境仍共用此電腦的 Anaconda CUDA PyTorch；語音模型也仍在原本 D:/AI/Voice，尚非完全可攜式整合包。

對話與附件保存在 `studio/data/chat.sqlite`；關閉服務後可備份整個資料夾。帳號模式轉換前的備份為 `studio/data/before-single-user.sqlite`。

根目錄只保留日常啟動入口 `start.bat`。其他批次工具集中在 `tools/`：精簡聊天 `start-simple.bat`、重建圖片生成環境 `setup-generation.bat`、安裝／驗證 MiniMax `setup-minimax.bat`。已安裝完成後不需每次執行 setup。

音樂使用說明見 `native/MUSIC.md`。HeartMuLa 模型與解碼器約 22.4 GB 已複製進專案，長度 10–60 秒，自動選擇 GPU／CPU 解碼，CPU 可能需要數分鐘。

Git 版本管理與還原方式請參考 `GIT-GUIDE.md`。Git 儲存庫只包含程式碼與設定；模型權重、私人對話、生成作品及執行環境需另外備份。

MiniMax Music 3 已完成獨立推論與本機模型校驗；需要 CUDA，使用獨立環境與 CPU／GPU 權重搬移。RTX 3080 10GB 單次約 5 秒音樂測試，載入加生成約 292 秒。新安裝請執行 tools/setup-minimax.bat，通過生成驗證後才啟用選項。詳見 `native/MINIMAX.md`。

圖片兩種方式見 `native/REFERENCE.md`；文字生成短片的範圍、效能與安裝來源見 `native/WAN.md`。音樂仍在進行與舊工作流的聽感差異排查，技術驗證不代表品質已恢復。

MiniMax H3 已以專案內 stable-diffusion.cpp 獨立支援文生影片、圖片生影片與音軌，可選原始20步或Turbo LoRA8步；Wan仍保留。現階段尺寸約512×288（16:9），文生設定1–3秒、圖生設定1秒，實際時長依影格對齊。完整測試與轉換細節見 native/H3.md。


## 2026-11-03 畫質比較與480p短片

以相同歐洲街道虎斑貓提示詞、seed 20261102、原始20步、73影格、24 FPS及CRF18實際生成：
- 512×288：262.19秒；864×480：375.43秒，約多43%。兩者實際約3.042秒，含可解碼音軌。
- 480p街道、牆面等背景細節較清楚，但貓腳動態模糊仍存在。解析度改變會改變構圖與動作，即使相同種子也不是逐像素對照。
- 864×480、736×416、672×384的243影格（約10秒）均因GPU記憶體不足失敗，未開放高解析長片。
- 平台新增可選480p，僅支援H3原始20步、文生影片、16:9、設定1–3秒；實際驗證為3秒，其他秒數沿用影格對齊規則。Turbo及圖生影片480p未驗證，不開放。標準畫質仍為預設。
- H264改為medium/CRF18，降低額外壓縮損失。同一AVI比較CRF23/18，SSIM由0.974162升至0.985176，檔案約增一倍；轉檔1.45秒。這不是模型品質或自然度分數。
- 真實GPU生成與MP4解碼已通過。另以已生成影片作路由測試，驗證作品庫、配方、Range播放及三種非法設定拒絕；該路由測試沒有重新執行GPU推論。瀏覽器已確認480p比例限制、3秒上限，以及Turbo/圖生影片禁用。


H3影片可選低顯存720p／1080p輸出：先以480p生成，再由CPU Lanczos放大，保留原片與音軌。非原生高解析或AI超解析，目前限原始20步、16:9文生短片（設定最長3秒）。詳見native/H3.md。

AI超解析目前為獨立實驗，尚未取代平台預設。測試方式、官方模型來源、效能與時序限制見 [實驗說明](native/experiments/README.md)。

# LocalMuse（本機繆思）— 單人本機 AI 工作台

雙擊 `start.bat` 啟動，直接進入聊天，不需要帳號。舊服務正在執行時先按 Ctrl+C，再重新啟動。

目前使用 llama.cpp 處理文字／圖片問答，並以專案自己的 Diffusers 引擎處理 SDXL Turbo 文生圖、單張圖片轉換，以及 HeartMuLa 3B 音樂生成，無需 ComfyUI。影片、MiniMax 音樂、Qwen 精準與多圖編輯尚未完成獨立化，對應新任務暫時停用，既有作品仍保留。

請閱讀 `NATIVE-GENERATION.md`，查看模型位置、執行環境、驗證結果及限制。模型已在專案內，但生成環境仍共用此電腦的 Anaconda CUDA PyTorch；語音模型也仍在原本 D:/AI/Voice，尚非完全可攜式整合包。

對話與附件保存在 `studio/data/chat.sqlite`；關閉服務後可備份整個資料夾。帳號模式轉換前的備份為 `studio/data/before-single-user.sqlite`。

`start-simple.bat` 保留純文字聊天精簡模式。`setup-generation.bat` 可重建圖片生成套件環境。

音樂使用說明見 `native/MUSIC.md`。HeartMuLa 模型與解碼器約 22.4 GB 已複製進專案，最長時間 10–60 秒，CPU 解碼可能需要數分鐘。

Git 版本管理與還原方式請參考 `GIT-GUIDE.md`。Git 儲存庫只包含程式碼與設定；模型權重、私人對話、生成作品及執行環境需另外備份。

# 面對面：全本機簡約機器人

在攝影機工具列按「面對面」。按住說話，放開後顯示辨識文字，修改後按送出。也可直接打字。回答以本機 Windows 繁體中文音色播放，嘴型依音量變化。

按「開啟視線追蹤」才會使用相機。人臉追蹤使用本機提供的 MediaPipe，畫面在瀏覽器處理。需勾選「這次附上畫面」並選擇視覺模型，才把單張照片送至本機 Ollama。文字問題與回答沿用目前對話保存；聲音和照片不保存。關閉視窗會停止收音、相機、播放與尚在等待的回覆。已完成的文字回答仍會留在歷史。

語音辨識為 faster-whisper base CPU int8，Windows 發聲也使用 CPU，不占用聊天 GPU。首次安裝需網路下載套件和模型，之後離線執行；沒有使用瀏覽器雲端語音辨識或 CDN。模型放 D:/AI/Voice。網頁需 localhost 或 HTTPS 才能使用麥克風與攝影機。透過 ngrok 使用時，錄音／問答仍經過隧道傳到你的電腦；「本機」指 AI 推論位置，不代表隧道沒有傳輸。

目前沒有完整跨功能排程；生成任務執行中會拒絕新的機器人回覆。其他聊天與視覺分析仍可能使用 GPU。本版是按次語音對話，不是連續即時語音。

環境：Python venv D:/AI/Voice/venv、可正常使用中文音色的 PowerShell（安裝時自動測試 PowerShell 7 與 Windows PowerShell）、Windows 繁體中文音色。可用 ROBOT_VOICE_HOME、ROBOT_POWERSHELL 指定路徑。

來源：
- https://github.com/SYSTRAN/faster-whisper
- https://github.com/google-ai-edge/mediapipe

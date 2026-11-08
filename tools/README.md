# 輔助工具

日常使用請執行專案根目錄的 `start.bat`，會開啟完整 LocalMuse。

| 檔案 | 用途 | 何時執行 |
| --- | --- | --- |
| start-simple.bat | 開啟精簡聊天介面 | 只想使用精簡模式時；先關閉完整服務以免連接埠衝突 |
| setup-generation.bat | 重建圖片生成套件與設定 | 首次安裝或修復環境時 |
| setup-amd.bat | AMD 顯示卡（實驗性）：建立 AMD 專用環境並逐一驗證模型，詳見 native/AMD.md | 沒有 NVIDIA、只有 AMD Radeon 的電腦首次安裝時 |
| setup-minimax.bat | 安裝隔離環境、續傳並校驗 MiniMax 模型，實際生成短音樂驗證 | 首次安裝或修復 MiniMax 時 |

這些工具會自動切換到專案根目錄，可直接雙擊；一般啟動不必執行安裝工具。

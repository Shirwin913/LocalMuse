# Git 與備份

Git 保存程式碼、介面、模型清單與設定，不包含模型權重、runtime、node_modules、對話資料庫或生成作品。複製 Git 儲存庫不等於取得可直接執行的完整環境。

## 在另一台電腦恢復

1. 安裝 Python、支援 SQLite 的 Node.js，以及符合硬體的 llama.cpp，依啟動程式所需位置放入 runtime。
2. 在 studio 執行 npm ci 安裝前後端依賴。
3. 依 models/catalog.json 與 models/generation/catalog.json 的設定放回模型；實際生成環境需求請參考 NATIVE-GENERATION.md 與 native/MUSIC.md。
4. 檢查語音模型等電腦專屬路徑，依說明重建生成環境，再執行 start.bat。

目前生成環境仍依賴這台電腦的 Anaconda/PyTorch，因此不是完整的一鍵安裝套件。

## 私人資料另外備份

關閉服務後備份 studio/data；模型、runtime 與 generated 可依需要另存到外接磁碟。這些內容不會隨 Git 上傳。

## 日常存檔

在專案資料夾執行：

```powershell
git status
git add .
git commit -m "描述這次修改"
```

設定遠端儲存庫後，使用 git push 上傳提交。上傳前仍應檢查 git diff --cached，避免新增檔案夾帶私人資訊。

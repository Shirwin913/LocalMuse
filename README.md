# LocalMuse（本機繆思）

**把聊天、圖片、影片與音樂生成，集中在自己電腦上的單人 AI 工作台。**

LocalMuse 使用專案內的模型與推論引擎，不需要啟動 Ollama 或 ComfyUI。介面以繁體中文為主，不需要註冊帳號；對話、附件與作品保存在本機。

> **目前定位：Windows 本機專案，尚非下載後即可在任何電腦執行的一鍵安裝包。** GitHub 不包含大型模型、runtime、私人資料或生成作品。部分環境與語音功能仍依賴原電腦的設定。已完成實測的功能與實驗項目分開列示，不代表所有模型、解析度與硬體組合都已驗證。

## 目錄

- [功能與支援範圍](#features)
- [日常啟動與關閉](#quick-start)
- [新電腦安裝與環境準備](#installation)
- [模型放置與選擇](#models)
- [操作方式](#usage)
- [影片畫質、顯存與放大輸出](#video-quality)
- [實機效能與驗證](#validation)
- [專案結構與服務](#structure)
- [資料備份與Git](#backup)
- [常見問題](#faq)
- [測試與延伸文件](#development)

<a id="features"></a>

## 功能與支援範圍

| 功能 | 引擎／模型 | 目前範圍與限制 |
| --- | --- | --- |
| 文字聊天 | llama.cpp／GGUF | 選擇本機模型，建立、重新命名及切換對話；首次使用需要載入模型 |
| 圖片問答 | llama.cpp／相容視覺模型 | 需要對應的視覺投影檔，不能把一般文字模型直接當作視覺模型 |
| 文字生成圖片 | Qwen Image 2.1／stable-diffusion.cpp | 原模型25步，支援中文提示詞，已驗證約1MP圖片 |
| 單張圖片指令編輯 | Qwen Image 2.1 | 使用一張參考圖描述修改；未開放多圖編輯 |
| 快速生成圖片 | SDXL Turbo／Diffusers | 4步、最長邊768像素；中文提示詞先由本機語言模型整理為英文 |
| 圖生圖 | SDXL Turbo img2img | 以原圖作生成起點，可能改變人物、物件與構圖 |
| 參考圖片生成 | SDXL Turbo＋IP-Adapter | 參考單張圖的外觀／風格，不保證精準人物或細節保留 |
| 文字生成影片 | MiniMax H3 | 原始20步或Turbo LoRA 8步，含音軌；網頁目前接受設定1–3秒 |
| 圖片生成影片 | MiniMax H3 | 含音軌，目前接受設定1秒；480p與高解析輸出尚未開放此模式 |
| 其他短片模型 | Wan2.1 T2V 1.3B／I2V 14B NF4 | 文生設定1–3秒、圖生設定1秒，16 FPS，不含音軌 |
| 720p／1080p輸出 | FFmpeg CPU Lanczos | H3先生成480p短片，再放大輸出；不是原生HD生成或AI超解析 |
| 音樂生成 | HeartMuLa 3B＋HeartCodec | 設定10–60秒、獨立歌詞欄，解碼自動選擇GPU／CPU |
| 音樂生成 | MiniMax Music 3 | 獨立環境，長度參數5–300秒；模型可能提前結束，長片未全面驗證 |
| 任務與作品 | 本機佇列、SQLite與檔案 | 查看進度與作品、播放／下載、恢復生成提示詞、種子及設定 |
| AI超解析實驗 | Real-ESRGAN ×2 | 已測試720p候選影片，尚未加入正式網頁選單或取代預設 |

語音朗讀、語音辨識及面對面介面沿用原專案整合；Whisper／Kokoro等模型仍依賴原電腦路徑，尚未完成可攜式整合，也未在本輪影片測試中全面驗證。

音樂已通過獨立推論與檔案流程測試，但與原工作流的聽感差異仍待確認。**產出可播放檔案，不等於旋律自然度或歌詞準確率已達標。**

<a id="quick-start"></a>

## 日常啟動與關閉

以下適用於**已經備妥模型與runtime的現有電腦**。

1. 在專案根目錄雙擊 `start.bat`。
2. 等待主控台顯示工作台網址，瀏覽器通常會自動開啟。
3. 若沒有自動開啟，手動前往 **http://127.0.0.1:8787/**。
4. 選擇模型開始聊天，或展開輸入框上方的「生成設定」。

也可以在專案根目錄執行：

```powershell
python studio_launcher.py
```

不自動開啟瀏覽器：

```powershell
python studio_launcher.py --no-browser
```

**關閉方式：**先等待生成完成，再回到啟動的主控台按 `Ctrl+C`。關閉瀏覽器分頁不會關閉後端。修改程式或安裝模型後，關閉舊服務並重新執行 `start.bat`；網頁可再重新整理。

日常只需要根目錄的 `start.bat`。不要同時啟動完整與精簡介面，也不必每次重跑安裝工具。

<a id="installation"></a>

## 新電腦安裝與環境準備

### 已驗證的開發環境

| 項目 | 本機實測配置／需求 |
| --- | --- |
| 作業系統 | Windows；批次檔、可執行檔與目前環境配置以Windows為主 |
| GPU | NVIDIA RTX 3080 10GB；其他GPU／CPU-only完整流程尚未全面測試 |
| 系統記憶體 | 32GB；大型模型會使用CPU卸載、磁碟映射與權重搬移 |
| Python | 3.12；基礎Python需已安裝可用的CUDA PyTorch |
| 生成環境 | 本機已驗證PyTorch 2.6.0＋CUDA 12.4；依賴見各模型文件 |
| Node.js | 需要可使用 `node:sqlite` 的版本，啟動器使用 `runtime/node/node.exe` |
| 磁碟 | 依選用模型而異；多組影像、影片與音樂模型合計會占用數十至數百GB，安裝／轉換還需要暫存空間 |

這是實測配置，**不是最低配備保證**。顯卡標示10GB，也不代表全部顯存都可供生成使用；桌面及其他程式同樣會占用空間。

### 取得程式碼

```powershell
git clone https://github.com/Shirwin913/LocalMuse.git
cd LocalMuse
```

若原本資料夾名稱是 `LocalModelLab`，可直接繼續使用；程式不要求資料夾一定叫LocalMuse。

### 準備順序

1. 安裝Python 3.12，確認 `python` 指向已具備CUDA PyTorch的環境。
2. 準備llama.cpp的 `llama-server.exe` 及其依賴，放在 `runtime/` 下；程式會在此資料夾內尋找它。
3. 準備支援 `node:sqlite` 的Node.js，讓執行檔位於 `runtime/node/node.exe`。
4. 安裝網頁依賴：在 `studio/` 執行 `npm ci`，完成後回到根目錄。這一步使用的Node版本也需相容。
5. 依模型清單放入需要的權重，建立對應生成環境。不是每一種模型都必須安裝。
6. 檢查各安裝腳本的來源路徑；部分腳本仍以原電腦既有模型位置為預設，需要依環境調整。
7. 按各模型文件完成校驗與實際生成驗證，再執行 `start.bat`。

生成環境可由 `tools/setup-generation.bat` 建立，但它**不會安裝系統CUDA PyTorch，也不會自動下載完整SDXL checkpoint**。目前該環境使用 `--system-site-packages`，仍會共用基礎Python套件；MiniMax Music另有隔離環境。

### 安裝與輔助工具

| 工具／腳本 | 用途 | 說明 |
| --- | --- | --- |
| `tools/start-simple.bat` | 精簡聊天介面 | 與完整工作台擇一啟動 |
| `tools/setup-generation.bat` | 建立／修復基本生成套件 | 需先有Python 3.12與CUDA PyTorch |
| `tools/setup-minimax.bat` | 準備MiniMax Music 3 | 包含下載續傳、校驗與短音樂生成驗證 |
| `tools/setup-h3.bat` | 準備MiniMax H3 | 需先有生成環境；模型來源與轉換見H3文件 |
| `native/setup_qwen_image.py` | 準備Qwen Image 2.1與sd.cpp | 優先使用既有權重，缺少檔案時依固定來源下載 |
| `native/setup_reference.py` | 準備IP-Adapter | 檢查並按需調整既有模型來源 |
| `native/setup_wan.py` | 準備Wan模型 | 包含本機權重轉換，來源路徑需自行確認 |

不同腳本的下載與驗證行為不完全相同，請先閱讀相對應文件。**檔案存在或校驗通過，不等於該功能已在新硬體上生成成功。** 部分選項需要實際生成後建立驗證標記才會啟用，請勿手動偽造標記。

<a id="models"></a>

## 模型放置與選擇

所有正式推論使用專案模型目錄，不需要讓Ollama或ComfyUI常駐。

| 位置 | 內容 |
| --- | --- |
| `models/catalog.json` | 語言／視覺模型的顯示名稱、ID與相對檔案路徑 |
| `models/*.gguf` | 語言模型；視覺模型另需對應的mmproj檔 |
| `models/generation/catalog.json` | 生成模型清單 |
| `models/generation/qwen-image-2.1/` | Qwen圖片模型、文字編碼器與VAE |
| `models/generation/sdxl-turbo/` | SDXL Turbo checkpoint與配置 |
| `models/generation/ip-adapter/` | 單張參考圖用的adapter與影像編碼器 |
| `models/generation/minimax-h3/` | H3主模型、文字編碼器、影片／音訊VAE與Turbo LoRA |
| `models/generation/wan-1.3b/`、`wan-i2v-14b/` | Wan文生與圖生影片模型 |
| `models/generation/heartmula/` | HeartMuLa與HeartCodec |
| `models/generation/minimax-music3/` | MiniMax音樂模型 |
| `models/generation/upscale/` | AI超解析實驗權重 |

語言模型清單範例：

```json
[
  {
    "id": "my-local-model",
    "label": "我的本機模型",
    "model": "my-model.gguf"
  }
]
```

此範例表示 `models/my-model.gguf`。新增到現有清單即可，不必覆蓋其他項目。視覺模型可另外設定 `projector` 指向相容的mmproj檔；模型架構也必須受目前llama.cpp支援。

網頁選單只會列出可讀取的語言模型。生成模型則還可能受到安裝、完整性與驗證狀態限制。尚未提供通用的模型搜尋、自動下載、刪除與任意格式轉換介面。

<a id="usage"></a>

## 操作方式

### 聊天與圖片問答

左側建立或選擇對話，上方選擇語言模型。按Enter送出，Shift＋Enter換行。圖片問答需選擇支援視覺的模型並附上圖片。

聊天與生成會共用GPU資源；生成期間可能暫時無法使用語言模型。第一次回覆通常包含模型載入時間，不能直接當作後續每次回覆的速度。

### 生成圖片與編輯圖片

1. 展開「生成設定」，明確選擇「文字生成圖片」或「圖生圖／參考圖生成」。
2. 選擇圖片模型；需要指令式修改時，優先使用Qwen Image 2.1。
3. 編輯模式加入一張參考圖，描述要改的內容和要保留的特徵。
4. 確認尺寸、種子與參考圖後再生成。

圖片結果可下載、帶入這次設定，或按「以這張圖繼續編輯」。例如：

> 一隻穿黃色雨衣的虎斑貓，坐在歐洲咖啡店窗邊，溫暖的日式動畫插畫風格。
>
> 只把貓咪的黃色雨衣改成藍色，保留同一隻貓、咖啡杯、背景和構圖。

SDXL img2img和IP-Adapter著重重新生成與外觀參考，不等於Qwen的單圖指令編輯，也不能保證精準保留人物。

### 生成影片

1. 選擇「文字生成影片」或「圖片生成影片」。
2. 選擇MiniMax H3或Wan。H3可選原始20步與已驗證的Turbo 8步。
3. 設定比例、秒數與種子。圖片生成影片還需加入圖片。
4. 提示詞描述主體、動作、場景和鏡頭；先用短片與簡單動作確認效果。
5. 等待任務完成，再於對話或「任務與作品」播放、下載及帶回設定。

例如：

```text
A tabby cat walks slowly along a European cobblestone street.
A low side-tracking camera follows the cat in one continuous shot.
Soft daylight, consistent fur pattern, gentle outdoor ambience, no speech.
```

相同權重、提示詞與種子，也可能因解析度、排程、引擎與運算精度不同而改變構圖及動作，不保證與原ComfyUI結果逐影格一致。

### 生成音樂

選擇「音樂生成」，在主輸入框寫曲風、樂器與氛圍，歌詞放在獨立欄位，接著選模型與長度。

HeartMuLa留白歌詞會使用 `[Instrumental]`；MiniMax則保留空白歌詞。兩者都不能保證完全沒有人聲。解碼移到CPU時可能需要數分鐘，請查看任務階段，不要因為暫時沒有聲音就重複送出。

MiniMax的5–300秒是參數允許範圍，不代表在10GB顯卡上完整測過所有長度；目前短片段技術測試成功，長片速度與聽感仍需實測。

### 任務、作品與配方

「任務與作品」可依類型查找結果。帶入既有作品設定時，會恢復模型、提示詞、種子與相關參考圖；已有草稿時會先詢問是否取代。修改模型或畫質後，請確認介面顯示的是目前設定，避免誤以為仍在重現原作品。

<a id="video-quality"></a>

## 影片畫質、顯存與放大輸出

### 三種解析度概念

| 選項 | 實際做法 | 狀態 |
| --- | --- | --- |
| 標準H3生成 | 例如16:9的512×288 | 正式介面可用，預設畫質 |
| 480p原生生成 | 模型直接生成864×480 | 限原始20步、16:9文生影片，設定1–3秒；實測3秒 |
| 720p／1080p CPU放大 | 先生成480p，再以Lanczos輸出1280×720／1920×1080 | 正式介面可選，不會憑空補回缺失細節 |
| 720p AI超解析 | Real-ESRGAN ×2逐格處理，再縮至720p | 獨立實驗；尚未接入正式網頁選單 |

**正式高解析輸出操作：**文字生成影片 → MiniMax H3 → 原始20步 → 影片畫質480p → 輸出解析度720p或1080p。

此流程在生成完成、生成引擎退出後才放大，不讓高解析輸出增加生成階段的GPU顯存峰值。原480p影片以 `<id>.source.mp4` 保留在 `generated/output/`，最終 `<id>.mp4` 是指定解析度的結果。輸出採H264 medium／CRF18並保留音軌。

### 片長與顯存限制

H3依模型規格對齊影格，設定秒數不一定等於實際秒數：

| 設定秒數 | 影格數／24 FPS | 實際影片長度 |
| --- | --- | --- |
| 1秒 | 39 | 約1.625秒 |
| 2秒 | 56 | 約2.333秒 |
| 3秒 | 73 | 約3.042秒 |

圖生影片目前只開放設定1秒。音軌與封裝顯示的長度可能略有差異。

在RTX 3080 10GB上，10秒高解析測試的864×480、736×416與672×384均顯存不足，因此未開放這些組合。曾成功生成512×288的約10秒驗證片，但**不是目前網頁的一般片長支援承諾**。

目前已採CPU卸載、磁碟映射、權重搬移與VAE分塊；它們能降低部分記憶體需求，無法保證任意解析度與片長都能跑。增加虛擬記憶體不會直接增加GPU顯存。尚未實作自動片段延伸與長片拼接。

### AI超解析實驗

現有貓咪短片測試中，AI版的毛髮與建築邊緣較清楚，腳部動態模糊仍存在。純AI版可能加強紋理與銳化感，另有50% AI／50%一般放大的柔和候選版。

逐格模型沒有跨影格約束，細微閃爍與長片時間一致性仍需更多場景確認。它不是真實細節還原保證，也尚未測試AI 1080p輸出。重跑方式與權重校驗見 [AI超解析實驗說明](native/experiments/README.md)。

<a id="validation"></a>

## 實機效能與驗證

以下是同一台RTX 3080 10GB、32GB RAM電腦的**特定測試**，包含不同提示詞、解析度與計時範圍，僅供估算等待時間，不能當成跨模型速度排名。

| 項目 | 特定測試結果 |
| --- | --- |
| Qwen Image 2.1 | 1024×1024、25步約49秒；完整API文生圖測試約40秒 |
| H3原始20步、約3秒 | 相同貓咪比較中，512×288約262秒，864×480約375秒 |
| H3 Turbo文生短片 | 512×288、73影格，完整API約215秒 |
| H3原始圖生影片 | 384×384、39影格，完整API約247秒 |
| Wan I2V 14B NF4 | 設定1秒，完整API約380秒 |
| HeartMuLa | 約10秒音訊，完整工作台流程約281秒 |
| MiniMax Music 3 | 約5秒音訊，載入加生成約292秒 |
| CPU放大到720p／1080p | 同一段約3秒來源，額外轉檔約2.3／5.0秒，不含模型生成 |
| AI超解析實驗到720p | 約3秒來源，約38秒，含載入、純AI與柔和兩版編碼及解碼檢查，不含H3生成 |

已實測的流程包括生成、檔案解碼、作品保存、配方、附件／Range播放及部分瀏覽器操作。部分路由測試使用已生成影片與替身佇列，並未重新執行GPU推論；不能將它們計成新的模型生成測試。

同樣地，影片可播放、音訊非靜音、或編碼與分塊誤差較小，都不能單獨證明畫面自然、旋律好聽或完全無閃爍。詳細測試條件分別記錄在各模型文件。

<a id="structure"></a>

## 專案結構與服務

```text
LocalMuse/
├─ start.bat                  日常啟動入口
├─ studio_launcher.py         啟動工作台、協定轉接與生成服務
├─ app.py                     llama.cpp模型管理及精簡介面
├─ studio/                    Node後端與完整網頁介面
│  ├─ public/                 前端HTML、CSS與JavaScript
│  ├─ data/                   本機SQLite、附件相關資料（不入Git）
│  └─ node_modules/           網頁依賴（不入Git）
├─ native/                    獨立生成服務、模型worker、安裝腳本
│  ├─ tests/                  Python測試
│  ├─ experiments/            AI超解析等未接入正式UI的實驗
│  └─ vendor/                 使用的第三方原始碼與授權文件
├─ models/                    語言／生成模型與清單（權重不入Git）
├─ runtime/                   執行檔與Python環境（不入Git）
├─ generated/                 任務、參考圖與生成輸出（不入Git）
├─ tools/                     安裝及輔助啟動工具
└─ work/                      本機測試、暫存與續作記錄（不入Git）
```

| 連接埠 | 服務 |
| --- | --- |
| 8787 | 瀏覽器使用的完整工作台 |
| 8788 | 專案協定轉接層，將舊介面請求交給llama.cpp |
| 8091 | llama.cpp模型推論服務，使用模型時啟動 |
| 8789 | 專案生成服務，管理佇列與獨立worker |

`studio/comfy-integration.js`、`COMFY_URL`、`OLLAMA_URL`等名稱是沿用的介面相容層。以 `start.bat` 啟動時，它們指向本機專案服務，**不表示需要啟動ComfyUI或Ollama**；目前不使用ComfyUI的8188連接埠。

本專案以單人本機使用為前提。沒有為多人帳號、遠端共用或公開網路部署提供完整設定流程。

<a id="backup"></a>

## 資料備份與Git

| 位置 | 建議用途 |
| --- | --- |
| `studio/data/` | 對話及附件資料，包含 `chat.sqlite`；先關閉服務再整份備份 |
| `generated/jobs/` | 任務、生成設定、進度與執行日誌 |
| `generated/input/` | 生成用參考圖片 |
| `generated/output/` | 生成檔案及保留的來源影片 |
| `models/` | 模型另行備份；Git只保存允許納入的清單、配置與來源資料 |
| `runtime/` | 若希望保留目前可執行環境，需另外備份 |

**Git備份程式碼，不等於備份整套可執行環境與私人作品。** `.gitignore`排除權重、執行環境、資料庫所在資料夾、生成作品與本機測試資料。提交前仍應檢查新增檔案，避免把私人內容放進未排除的位置。

帳號模式轉為單人模式前的資料庫備份，若仍存在，位於 `studio/data/before-single-user.sqlite`。更多恢復與版本管理說明見 [Git與備份](GIT-GUIDE.md)。

<a id="faq"></a>

## 常見問題

### 顯示「連接埠8787／8091已使用」

通常是舊服務仍在執行。先找到原啟動主控台，等待任務完成後按Ctrl+C，再重新啟動；不要同時雙擊多個啟動入口。8787是網頁工作台，8091是llama.cpp，不是兩個可互相替代的網址。

### 網頁開不起來

確認啟動主控台仍在執行，網址是 `http://127.0.0.1:8787/`。若主控台出現缺少Python、Node、模型或套件的錯誤，先處理該錯誤；只有開啟瀏覽器並不會自動啟動服務。

### 模型沒有出現在選單，或選項不能選

檢查目錄、檔名與catalog是否一致；視覺模型需要對應mmproj。生成模型還需完整權重、對應引擎與驗證狀態。安裝工具不一定會建立實際生成驗證標記，詳見各模型文件。

### 為什麼第一次生成比較慢？

需要載入大模型、搬移CPU／GPU權重與準備引擎。低顯存模式可能以較長時間換取可執行性；首次載入、模型切換與CPU解碼都會影響等待時間。

### 已選1080p，為什麼細節還是模糊？

正式介面目前是480p生成後做CPU放大。輸出像素數增加，不會自動修復原片模糊、錯誤肢體或缺失紋理。AI超解析仍是獨立實驗，原生720p／1080p生成尚未開放。

### 和ComfyUI使用相同模型，結果為什麼不一樣？

模型之外，文字編碼、採樣器、排程、步數、精度、亂數、解析度與LoRA開關也會影響輸出。即使盡量對齊設定，不同引擎也不保證逐像素一致。

### 可以完全離線嗎？

已備妥模型、套件與執行檔後，主要聊天與生成推論在本機執行，不需Ollama或ComfyUI服務。初次下載、套件安裝、環境修復及部分可選功能仍可能需要網路，不能把Git clone視為完整離線安裝包。

<a id="development"></a>

## 測試與延伸文件

已準備runtime後，可在專案根目錄執行：

```powershell
./runtime/generation-env/Scripts/python.exe -m unittest discover -s native/tests
./runtime/node/node.exe --test studio/image-prompt.test.js
./runtime/node/node.exe --check studio/public/app.js
```

目前記錄為54項Python測試與3項Node測試通過。這些測試不等同重新生成所有媒體；完整GPU測試需另外準備模型與時間，也不能用單元測試代替視覺／聽感評估。

| 文件 | 內容 |
| --- | --- |
| [獨立生成引擎](NATIVE-GENERATION.md) | 共用環境、佇列與生成架構 |
| [Qwen Image 2.1](native/QWEN-IMAGE.md) | 原圖片模型、單圖編輯、安裝與效能 |
| [圖生圖與參考圖](native/REFERENCE.md) | SDXL img2img與IP-Adapter的差別 |
| [MiniMax H3](native/H3.md) | 原影片模型、20／8步、權重轉換、畫質與限制 |
| [Wan影片](native/WAN.md) | Wan文生與圖生影片 |
| [HeartMuLa音樂](native/MUSIC.md) | 音樂、歌詞、音訊解碼 |
| [MiniMax Music 3](native/MINIMAX.md) | 獨立環境、模型下載及短音樂驗證 |
| [AI超解析實驗](native/experiments/README.md) | 可重跑的720p候選比較與時序限制 |
| [工具說明](tools/README.md) | 輔助批次檔 |
| [Git與備份](GIT-GUIDE.md) | 程式版本與私人資料的分別備份 |

第三方程式的授權文件隨其原始碼保存在 `native/vendor/` 等對應位置；模型來源、版本與校驗資訊見各manifest或provenance。模型權重不隨此版本庫散布。

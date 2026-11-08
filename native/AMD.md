# AMD 顯示卡支援（實驗性）

> **狀態：尚未在任何 AMD 顯示卡上實機驗證。** 程式碼、安裝程式與驗證流程已完成，並以模擬測試確認 NVIDIA 原有行為不變；第一位 AMD 使用者執行安裝後，請把 `generated/jobs/amd-validate-*.log` 與 `runtime/gpu-backend.json` 回報給維護者。

## 一句話說明

在 AMD 電腦上執行 `tools\setup-amd.bat`：它會另外建立 AMD 專用的執行環境，再對你已安裝的每個模型各做一次短的實際生成；**只有通過的模型會出現在介面上**，沒通過的會維持停用，不會讓你按了才失敗。NVIDIA 電腦完全不受影響。

## 需求

| 項目 | 需求 |
|---|---|
| 作業系統 | Windows 11（64 位元） |
| Python | 3.12（AMD 的 PyTorch 只提供 3.12 版） |
| 驅動程式 | AMD Software: Adrenalin Edition 26.1.1 以上 |
| 磁碟 | 執行環境約需 25GB（不含模型） |
| PyTorch 功能 | AMD 官方 Windows PyTorch 支援的顯示卡：RX 9070／9070 XT、RX 9060 XT、Radeon AI PRO R9700、RX 7900 XTX、RX 7700、PRO W7900、部分 Ryzen AI Max／Ryzen AI 9 內建顯示 |
| Vulkan 功能 | 大多數支援 Vulkan 的 AMD 顯示卡 |

參考：[AMD Windows PyTorch 安裝說明](https://rocm.docs.amd.com/projects/radeon-ryzen/en/docs-7.2/docs/install/installrad/windows/install-pytorch.html)、[支援清單](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html)。

## 各功能在 AMD 上的做法

| 功能 | 使用的技術 | 與 NVIDIA 的差異 |
|---|---|---|
| 聊天、看圖回答 | 專案內附 llama.cpp（Vulkan） | 相同程式，不需安裝 |
| SDXL Turbo 圖片、參考圖 | PyTorch（ROCm） | 相同 FP16 |
| HeartMuLa 音樂 | PyTorch（ROCm） | 不使用 bitsandbytes 4-bit，改用 BF16；**需要 10GB 以上顯存** |
| MiniMax Music 3 | PyTorch（ROCm），獨立環境 | 相同的自動 CPU 卸載 |
| Wan 文生影片 1.3B | PyTorch（ROCm） | 相同 |
| Wan 圖生影片 14B | PyTorch（ROCm） | NF4 改為 torchao INT8 權重量化＋區塊卸載（最不確定的一項） |
| Qwen Image 2.1 | stable-diffusion.cpp（Vulkan，可選 ROCm） | 同一個上游版本（master-1031-c6dfa9d）、同一組權重 |
| MiniMax H3 影片 | stable-diffusion.cpp（Vulkan，可選 ROCm） | 同上；480p 高畫質不在自動驗證範圍內，維持停用 |
| AI 超解析 | PyTorch（ROCm） | 相同，顯存不足時一樣改用 CPU |
| 資源監控 | — | AMD 的即時顯存用量無法讀取，請用 Windows 工作管理員 |

stable-diffusion.cpp 使用的 ggml 版本在 Vulkan 與 HIP（ROCm）後端都實作了 H3／Qwen 需要的 INT8 convrot 與 NVFP4 運算，所以不需要重新轉換模型。

## 安裝

1. 先照一般流程把模型放好（`models/` 與 `models/generation/`）。
2. 關閉 `start.bat` 的視窗。
3. 雙擊 `tools\setup-amd.bat`。安裝完成後會自動逐一驗證，整個過程可能要一到數小時（取決於已安裝的模型）。
4. 重新執行 `start.bat`。

進階選項（在專案根目錄執行 `python native\setup_amd.py --help`）：

| 選項 | 用途 |
|---|---|
| `--engine rocm` | stable-diffusion.cpp 改用 ROCm 版（預設 Vulkan） |
| `--skip-torch` | 只裝 Vulkan 引擎（顯示卡不在 PyTorch 支援清單時） |
| `--minimax yes/no` | 強制安裝或略過 MiniMax Music 環境 |
| `--validate none` | 先不驗證，之後再執行 `python native\amd_validate.py` |

只重新驗證某幾項：`python native\amd_validate.py --only heartmula,wan --force`

## 運作原理（給維護者）

- `native/gpu_backend.py` 判斷顯示卡：環境變數 `LOCALMUSE_GPU` → `runtime/gpu-backend.json` → `nvidia-smi` → 既有 NVIDIA 環境 → Windows 顯示卡名稱。
- NVIDIA 路徑、檔名與驗證標記（`validated*.json`）完全沒變；AMD 使用 `runtime/generation-env-amd`、`runtime/minimax-env-amd`、`runtime/sd-cpp-amd`，驗證標記為 `validated-amd*.json`。
- 生成服務的 `/capabilities` 多了 `gpu` 欄位；AMD 或沒有支援顯示卡時，只列出已通過驗證的模式，介面會隱藏其他按鈕與範例並說明原因。
- 測試：`native/tests/test_gpu_backend.py`（模擬 NVIDIA、AMD、無顯示卡三種情況）。

## 疑難排解

- **想回到自動偵測**：刪除 `runtime/gpu-backend.json`。
- **暫時強制某種模式**：啟動前設定環境變數 `LOCALMUSE_GPU=nvidia`、`amd` 或 `none`。
- **某個模型沒出現**：看 `generated/jobs/amd-validate-<名稱>.log` 找失敗原因。
- **HeartMuLa 驗證失敗、訊息提到顯存**：8GB 版本的顯示卡無法使用 HeartMuLa，可改用 MiniMax Music 3。

## 第一次在 AMD 實機測試時請回報

- 顯示卡型號、驅動版本、`runtime/gpu-backend.json` 內容
- `amd_validate.py` 最後的驗證結果清單
- 失敗項目的 `generated/jobs/amd-validate-*.log`
- 通過項目的生成時間（寫在 `models/generation/*/validated-amd*.json`）

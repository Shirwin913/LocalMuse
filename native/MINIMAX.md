# MiniMax Music 3 獨立後端

已接入專案原有的音樂任務、歌詞、種子、作品儲存與播放流程。使用官方 Diffusers modular pipeline，沒有啟動或呼叫 ComfyUI；套件隔離在 runtime/minimax-env，權重在 models/generation/minimax-music3。

已在本機 RTX 3080 10GB、32GB RAM 完成全部模型 SHA256 校驗與真實音樂生成。單次測試輸出 4.992 秒、44.1kHz、雙聲道 PCM16 WAV；載入及生成共 292.06 秒，峰值 0.539、RMS 0.0688。低顯示記憶體模式會較慢，此數據不代表所有長度／提示詞的速度與品質。

## 完成安裝

網路可連線 GitHub 與 Hugging Face 後，雙擊 tools 資料夾內的 setup-minimax.bat。需要已安裝 CUDA PyTorch 的 Python 3.12（與現有圖片環境相同基礎），以及至少約 35 GB 可用磁碟；本機以 32GB RAM 通過短片段測試；安裝及續傳會額外占用暫存磁碟空間。

腳本會建立獨立環境、安裝固定版本的官方推論程式、續傳權重並校驗 SHA256，將管線元件改為本機路徑，最後實際生成 5 秒音樂。只有生成成功後才建立 validated.json；重啟 start.bat 後 MiniMax 選項才會啟用。

已設定低顯示記憶體流程：元件自動 CPU offload，加上語言模型逐層載入 GPU。此流程參考官方文件，已通過本機短片段驗證。輸出取官方 vocoder 的原生 44.1kHz 取樣率、PCM16 WAV，最長時間限制為 5–300 秒；模型可能提前結束。長片段可能非常慢，先以 5 秒測試。

## 固定來源

- 模型：MiniMaxAI/MiniMax-Music3，revision 1b525ccb685ae809f33027c51c351eeb5833cf72。檔案與雜湊見 native/minimax-model-manifest.json。
- Diffusers：官方 MiniMax 文件指定的 PR commit dafe3733fcfdbf3c48915fe77be3aef65b5d6a2d；套件需求見 native/minimax-requirements.txt。
- 官方說明：https://huggingface.co/MiniMaxAI/MiniMax-Music3
- Diffusers 文件：https://github.com/huggingface/diffusers/blob/dafe3733fcfdbf3c48915fe77be3aef65b5d6a2d/docs/source/en/api/pipelines/minimax_music3.md

模型與安裝驗證結果不納入 Git；上游模型 LICENSE 會隨下載保存。HeartMuLa 與圖片仍使用原本的 generation-env，不會因安裝 MiniMax 而升級它們的套件。

下載分段暫存預設放在 %LOCALAPPDATA%/LocalMuse/downloads/minimax-music3，可用 LOCALMUSE_DOWNLOAD_CACHE 指定磁碟位置。完整檔案通過 SHA256 後才清除其分段，空暫存資料夾無法刪除時不會中止安裝。首次需網路下載；安裝完成後推論強制使用本機檔案。

完整 API 流程實測通過：5 秒設定得到 4.992 秒、44.1kHz 雙聲道 WAV，送出任務到保存作品共 325.97 秒（worker 載入與生成 297.61 秒）。已檢查任務狀態、音訊檔、HTTP Range 播放、作品庫與 MiniMax 生成配方；測試只以替身處理閒置語言模型釋放 API，音樂推論使用真實模型。

## 與原 ComfyUI 工作流的差異與修正

獨立化最初只讀取提示詞、歌詞、長度及種子，漏讀文字引導強度：原工作流 cfg_scale=1.7，但當時使用的 Diffusers 語義生成固定值為 1.5。現已讀取並套用文字 CFG、top_k、擴散 CFG 和步數，實際數值會存到 generated/jobs/*.audio.json 的 sampling 欄位。非 Euler／simple／完整去噪的配方會拒絕處理，避免默默換成其他採樣設定。

這個修正不代表與 ComfyUI 逐樣本一致：目前權重為官方 BF16，原流程是 Comfy-Org 重封裝權重（含 INT8 文字編碼器）；亂數分流、排程與解碼實作亦有差異。同一種子不能當成相同歌曲的保證。技術測試只證明能生成可播放音訊，旋律和自然度仍需聆聽比較。

MiniMax 歌詞留白現改為原樣傳入，不再擅自補上 [Instrumental]，與原 ComfyUI 請求一致。HeartMuLa 的留白處理不受這項修改影響。

前次修正後同條件10秒技術測試通過，但使用者表示聽感仍沒有改善，因此不能將CFG和空白歌詞的修正視為品質問題已解決。

## 新的全段採樣流程

預設為global-euler：使用完整音訊latent時間軸，每個Euler步驟平均重疊視窗的預測，再更新整段latent；實作在native/minimax_global.py，不匯入ComfyUI。進階設定可切回reference官方分段流程以比較；缺少musicProfile的舊配方按reference還原。採樣方式、CFG和種子均寫入任務紀錄；不能保證與原ComfyUI相同種子得到相同歌曲。

解碼前卸載已完成的模型階段，vocoder以最多1536 latent、64 latent重疊視窗解碼，CPU正規化拼接；CUDA記憶體不足時縮小解碼視窗。真實vocoder多視窗壓力測試3200合成latent、約37.15秒音訊長度、3個視窗通過，CUDA配置峰值約2.03GB。此壓測只驗證解碼覆蓋與資源使用，不是實際長歌生成或品質測試。

完整實際API測試：提示詞「鋼琴音樂」、空歌詞、10秒、種子18846948133178，文字CFG1.7、top-k50、擴散CFG1.7、30步。從送出到保存共495.95秒，worker484.39秒，輸出9.996秒44.1kHz雙聲道PCM16 WAV，沒有重用語義快取；任務、作品庫、配方和HTTP Range播放均通過。新的音樂自然度尚待聆聽確認，未宣稱與原工作流同等。

# 獨立 HeartMuLa 音樂後端

模型與 HeartCodec 放在 models/generation/heartmula/，約 22.4 GB，原始模型保留。
worker 為 native/music_worker.py；推論只匯入專案內的 native/vendor/heartlib，不使用 ComfyUI、節點載入器、folder_paths 或 ComfyUI Python 環境。
使用專案 runtime/generation-env；PyTorch 仍共用 Anaconda 基礎環境。需要 CUDA。

為 RTX 3080 10GB 使用 NF4 4-bit／BF16，CFG 1；生成結束後先釋放生成模型，再依當下可用顯示記憶體自動選擇 GPU 或 CPU 解碼。GPU 使用 BF16，記憶體不足時沿用音樂編碼退回 CPU，不重新生成。CPU 解碼仍可能需要數分鐘。
介面模式選音樂生成，模型選 HeartMuLa，風格用英文逗號分隔標籤，歌詞可用 [Verse]、[Chorus] 分段。留白會以 [Instrumental] 作條件，但不保證完全無人聲。
目前最長時間 10–180 秒，模型可能提前結束，並受 80ms 音訊 token 邊界影響，實際長度可能略有差異。輸出為 48kHz PCM16 WAV。

MiniMax Music 3 已完成獨立推論，使用另一個隔離環境與專案內模型；安裝與測試結果見 MINIMAX.md。影片和 Qwen 精準／多圖編輯亦尚未接入。
此後端不保證歌詞字字正確、音樂品質、跨裝置完全相同的結果。技術驗證檢查音訊可解碼、長度、有限數值與非靜音，不能取代聆聽評估。

官方參考：https://github.com/HeartMuLa/heartlib
上游授權保留於 native/vendor/HEARTLIB-LICENSE；程式來源與相容性改動見 native/vendor/HEARTLIB-NOTES.md。

已完成獨立推論測試：10.08 秒、48kHz、峰值約 0.452、RMS 約 0.063，模型載入加生成及解碼 273.02 秒。此為一次短片段測試，不代表所有歌詞或風格都同樣表現。

自動判斷以解碼器 BF16 權重大小加上至少 2 GiB（或權重的 30%）預留空間估算，無法保證所有顯示卡都能成功；GPU OOM 會退回 CPU，其他錯誤會正常回報。進度會顯示目前解碼裝置，generated/jobs/*.audio.json 記錄實際裝置、判斷原因與解碼時間。

自動解碼版本單次實測：10.08 秒、48kHz，完整載入／生成／解碼 52.40 秒，當次自動選 GPU，解碼 9.57 秒。這是一次短片段驗證，不是跨提示詞的效能保證。5 項自動測試涵蓋 GPU 選擇、低記憶體、無 CUDA、模擬 GPU OOM 退回 CPU 與其他錯誤正常回報。


## 2026-11-03 180秒測試

RTX3080 10GB／32GB RAM，以Lo-fi hip-hop完整描述、空白歌詞（既有worker使用[Instrumental]）、seed20261103實際生成。請求180秒，2251個音訊碼，輸出180.08秒、48kHz PCM16 WAV；整體私人測試364.18秒，worker347.13秒，其中GPU解碼19.57秒。沒有補靜音或重複音樂來湊長度。

整卡取樣使用峰值9554MiB（包含桌面與其他程序），系統可用RAM最低6.64GiB；不是隔離模型顯存與程序RAM峰值。本次GPU解碼通過不保證其他背景負載或硬體也相同，CPU退回可能更慢，超過60秒的HeartMuLa任務工作逾時放寬至7200秒。

介面、Node驗證與native上限已同步提高至180秒，預設短片長度不變。模型到達長度上限才停止，此例沒有自然EOS收尾，最後10秒RMS未下降；尚未聆聽確認音樂自然結尾或整首品質，不能因片長通過而視為收尾問題已解決。私有測試wrapper保存中間codes供失敗解碼重試；正式worker未因此增加續算功能。


## 可選收尾處理

生成設定新增「收尾處理」：保留原始結尾（預設）、末段淡出（最長8秒）、末段淡出（最長12秒）。HeartMuLa及MiniMax共用CPU音量包絡後處理，不會修改提示詞或歌詞、不會重新生成旋律。原始解碼音檔存為generated/output/<id>.original.wav，指定輸出<id>.wav為處理版；原始模式仍使用原流程。配方保存musicEnding，舊配方預設none。

淡出採餘弦音量曲線，最多處理末四分之一，尾端保留最多0.4秒靜音；這段靜音包含在原片長內，不延長作品。立體聲兩聲道套同一增益；前段樣本保持不變、無音量放大。後處理不會補出終止和弦或讓旋律自動完整，選項避免稱為「自然作曲收尾」。

現有180.08秒Lo-fi實測8/12秒淡出，前段PCM一致、長度/聲道/取樣率不變、最後300ms為零、無新增峰值；原片保留。另以同seed的60秒新GPU生成測試更明確的終止和弦與最後12秒收束提示，仍輸出60.08秒（751codes）至長度上限，未自行EOS。提示詞只能作候選，這次沒有證明自然結尾可靠成功，也未聆聽宣稱和聲已解決。

官方歌詞範例有[Outro]等段落標記：https://github.com/HeartMuLa/heartlib/blob/main/assets/lyrics.txt 。標記不是精確倒數指令；本專案不會為空白歌詞自動插入新歌詞。70項Python測試中69通過、1個Windows symlink測試跳過；路由重用既有WAV但實際執行淡出，作品庫/配方/Range通過，非新模型推論。前端預設none、可選fade8與舊配方還原none已驗證。

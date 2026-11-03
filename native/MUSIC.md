# 獨立 HeartMuLa 音樂後端

模型與 HeartCodec 放在 models/generation/heartmula/，約 22.4 GB，原始模型保留。
worker 為 native/music_worker.py；推論只匯入專案內的 native/vendor/heartlib，不使用 ComfyUI、節點載入器、folder_paths 或 ComfyUI Python 環境。
使用專案 runtime/generation-env；PyTorch 仍共用 Anaconda 基礎環境。需要 CUDA。

為 RTX 3080 10GB 使用 NF4 4-bit／BF16，CFG 1；生成結束後先釋放生成模型，再依當下可用顯示記憶體自動選擇 GPU 或 CPU 解碼。GPU 使用 BF16，記憶體不足時沿用音樂編碼退回 CPU，不重新生成。CPU 解碼仍可能需要數分鐘。
介面模式選音樂生成，模型選 HeartMuLa，風格用英文逗號分隔標籤，歌詞可用 [Verse]、[Chorus] 分段。留白會以 [Instrumental] 作條件，但不保證完全無人聲。
目前最長時間 10–60 秒，模型可能提前結束，並受 80ms 音訊 token 邊界影響，實際長度可能略有差異。輸出為 48kHz PCM16 WAV。

MiniMax Music 3 已完成獨立推論，使用另一個隔離環境與專案內模型；安裝與測試結果見 MINIMAX.md。影片和 Qwen 精準／多圖編輯亦尚未接入。
此後端不保證歌詞字字正確、音樂品質、跨裝置完全相同的結果。技術驗證檢查音訊可解碼、長度、有限數值與非靜音，不能取代聆聽評估。

官方參考：https://github.com/HeartMuLa/heartlib
上游授權保留於 native/vendor/HEARTLIB-LICENSE；程式來源與相容性改動見 native/vendor/HEARTLIB-NOTES.md。

已完成獨立推論測試：10.08 秒、48kHz、峰值約 0.452、RMS 約 0.063，模型載入加生成及解碼 273.02 秒。此為一次短片段測試，不代表所有歌詞或風格都同樣表現。

自動判斷以解碼器 BF16 權重大小加上至少 2 GiB（或權重的 30%）預留空間估算，無法保證所有顯示卡都能成功；GPU OOM 會退回 CPU，其他錯誤會正常回報。進度會顯示目前解碼裝置，generated/jobs/*.audio.json 記錄實際裝置、判斷原因與解碼時間。

自動解碼版本單次實測：10.08 秒、48kHz，完整載入／生成／解碼 52.40 秒，當次自動選 GPU，解碼 9.57 秒。這是一次短片段驗證，不是跨提示詞的效能保證。5 項自動測試涵蓋 GPU 選擇、低記憶體、無 CUDA、模擬 GPU OOM 退回 CPU 與其他錯誤正常回報。

# 獨立 HeartMuLa 音樂後端

模型與 HeartCodec 放在 models/generation/heartmula/，約 22.4 GB，原始模型保留。
worker 為 native/music_worker.py；推論只匯入專案內的 native/vendor/heartlib，不使用 ComfyUI、節點載入器、folder_paths 或 ComfyUI Python 環境。
使用專案 runtime/generation-env；PyTorch 仍共用 Anaconda 基礎環境。需要 CUDA。

為 RTX 3080 10GB 使用 NF4 4-bit／BF16，CFG 1；音訊解碼放 CPU。生成 10 秒音樂也可能需要數分鐘。
介面模式選音樂生成，模型選 HeartMuLa，風格用英文逗號分隔標籤，歌詞可用 [Verse]、[Chorus] 分段。留白會以 [Instrumental] 作條件，但不保證完全無人聲。
目前最長時間 10–60 秒，模型可能提前結束，並受 80ms 音訊 token 邊界影響，實際長度可能略有差異。輸出為 48kHz PCM16 WAV。

MiniMax 音樂仍未獨立化，選項保持停用。影片和 Qwen 精準／多圖編輯亦尚未接入。
此後端不保證歌詞字字正確、音樂品質、跨裝置完全相同的結果。技術驗證檢查音訊可解碼、長度、有限數值與非靜音，不能取代聆聽評估。

官方參考：https://github.com/HeartMuLa/heartlib
上游授權保留於 native/vendor/HEARTLIB-LICENSE；程式來源與相容性改動見 native/vendor/HEARTLIB-NOTES.md。

已完成獨立推論測試：10.08 秒、48kHz、峰值約 0.452、RMS 約 0.063，模型載入加生成及解碼 273.02 秒。此為一次短片段測試，不代表所有歌詞或風格都同樣表現。

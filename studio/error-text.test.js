const test=require('node:test'),assert=require('node:assert');
const {describeGenerationError,generationErrorSummary}=require('./public/error-text.js');
test('Windows page-file error becomes a plain explanation with details kept',()=>{
 const raw='  File \\"C:\\\\Users\\\\me\\\\Lib\\\\site-packages\\\\x.py\\", line 1\\nOSError: 分頁檔太小，無法完成操作。 (os error 1455)\\n"]';
 const info=describeGenerationError(raw);
 assert.equal(info.title,'Windows 虛擬記憶體（分頁檔）不足');
 assert.ok(info.technical);assert.match(info.details,/os error 1455/);assert.doesNotMatch(info.details,/\\n/);
});
test('GPU out-of-memory is recognised',()=>{
 assert.equal(describeGenerationError('torch.OutOfMemoryError: CUDA out of memory.').title,'顯示卡記憶體不足');
});
test('Short readable messages are shown as-is',()=>{
 const info=describeGenerationError('HeartMuLa 長度需為 10–180 秒');
 assert.equal(info.title,'HeartMuLa 長度需為 10–180 秒');assert.equal(info.technical,false);
});
test('Unknown tracebacks are summarised by their last line',()=>{
 const info=describeGenerationError('Traceback (most recent call last):\n  File "x.py", line 1\nRuntimeError: shape mismatch');
 assert.equal(info.title,'生成過程發生錯誤');assert.match(info.hint,/shape mismatch/);
});
test('Empty error still produces guidance',()=>{
 assert.match(generationErrorSummary(''),/重試/);
});

// Turns raw generation errors (often a Python traceback tail) into a short,
// actionable message. The original text is kept for a "technical details" view.
(function(root){
 const RULES=[
  {test:/os error 1455|分頁檔太小|paging file is too small/i,
   title:'Windows 虛擬記憶體（分頁檔）不足',
   hint:'載入模型時記憶體不夠。請先到「更多 → 資源監控」釋放已載入的模型、關閉其他大型程式後重試；若常發生，請加大 Windows 分頁檔大小。'},
  {test:/CUDA out of memory|OutOfMemoryError|CUBLAS_STATUS_ALLOC_FAILED|cudaErrorMemoryAllocation|out of memory on device|顯示卡記憶體不足/i,
   title:'顯示卡記憶體不足',
   hint:'請縮短長度、降低解析度或畫質，或先到「更多 → 資源監控」釋放聊天模型後重試。'},
  {test:/MemoryError|Unable to allocate|std::bad_alloc|系統記憶體不足/i,
   title:'系統記憶體不足',
   hint:'請關閉其他大型程式，或縮短長度、降低解析度後重試。'},
  {test:/生成逾時|TimeoutExpired|timed out/i,
   title:'生成時間超過上限',
   hint:'這次任務跑太久被停止。可縮短長度或降低畫質後重試。'},
  {test:/ECONNREFUSED|ECONNRESET|fetch failed|socket hang up|Connection refused|生成引擎.{0,8}(未啟動|無法連線)/i,
   title:'生成引擎沒有回應',
   hint:'請關閉後重新執行 start.bat，等狀態顯示「已就緒」再重試。'},
  {test:/FileNotFoundError|No such file or directory|找不到(模型|檔案)|model.{0,20}not found/i,
   title:'找不到需要的模型或檔案',
   hint:'模型可能還沒安裝完整。請到「更多 → 本機模型」確認狀態，必要時重新執行對應的安裝程式。'},
  {test:/ModuleNotFoundError|ImportError|DLL load failed/i,
   title:'生成環境缺少元件',
   hint:'請重新執行 tools 資料夾內對應的安裝程式（例如 setup-generation.bat）。'}
 ];
 function clean(raw){
  let value=String(raw??'').trim();
  // Errors are sometimes stored as a JSON-escaped string fragment.
  if(/\\n|\\"/.test(value))value=value.replace(/\\\\/g,'\\').replace(/\\n/g,'\n').replace(/\\"/g,'"');
  return value.replace(/^\[?"|"\]?$/g,'').trim();
 }
 function looksTechnical(value){
  return /Traceback|\n\s+File "|^\s*at .+:\d+|Error:|Exception|\^\^\^|\\Lib\\|site-packages/m.test(value)||value.length>220;
 }
 function describeGenerationError(raw){
  const details=clean(raw);
  if(!details)return {title:'生成失敗',hint:'請確認提示詞與設定後重試。',details:'',technical:false};
  for(const rule of RULES)if(rule.test.test(details))return {title:rule.title,hint:rule.hint,details,technical:true};
  if(!looksTechnical(details))return {title:details,hint:'',details:'',technical:false};
  const last=details.split('\n').map(line=>line.trim()).filter(Boolean).pop()||'';
  const short=last.replace(/^[\w.]*(Error|Exception):\s*/,'').slice(0,120);
  return {title:'生成過程發生錯誤',hint:short&&short!==last?'錯誤摘要：'+short:'請確認提示詞與設定後重試；若持續發生，可展開技術細節查看原因。',details,technical:true};
 }
 function generationErrorSummary(raw){const info=describeGenerationError(raw);return info.title+(info.hint?'。'+info.hint:'');}
 const api={describeGenerationError,generationErrorSummary};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);

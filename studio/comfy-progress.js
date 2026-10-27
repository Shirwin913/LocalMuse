module.exports=(base,db)=>{
 if(process.env.GENERATION_BACKEND==='native'){
  let states={},pending=false;
  async function sync(jobs){if(pending||!jobs.length)return;pending=true;try{const r=await fetch(base+'/progress',{signal:AbortSignal.timeout(3000)});if(r.ok)states=await r.json();}catch{}finally{pending=false}}
  return {watch(){},sync,get(id){const row=db.prepare('SELECT prompt_id FROM video_jobs WHERE id=?').get(id);return states[row?.prompt_id]||null}};
 }

 const sockets=new Map(),states=new Map();
 function watch(job){
  if(sockets.has(job.id))return;
  const url=new URL(base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=url.pathname.replace(/\/$/,'')+'/ws';url.search=new URLSearchParams({clientId:job.id}).toString();
  const ws=new WebSocket(url);sockets.set(job.id,ws);
  let closing=false;
  function closeOnce(){if(closing||ws.readyState>=2)return;closing=true;try{ws.close();}catch{}}
  const timer=setTimeout(()=>{if(ws.readyState===0)closeOnce();},10000);timer.unref();
  ws.addEventListener('open',()=>clearTimeout(timer));
  ws.addEventListener('message',event=>{if(typeof event.data!=='string')return;try{
   const {type,data:d}=JSON.parse(event.data);if(!d)return;
   const current=db.prepare('SELECT * FROM video_jobs WHERE id=?').get(job.id);
   if(!current||!['submitting','queued','running'].includes(current.status))return;
   if(!d.prompt_id||current.prompt_id&&d.prompt_id!==current.prompt_id)return;
   if(type==='progress'&&Number.isFinite(d.value)&&Number.isFinite(d.max)&&d.max>0)states.set(job.id,{stage:'採樣生成中',value:Math.max(0,Math.min(d.value,d.max)),max:d.max});
   else if(type==='executing')states.set(job.id,{stage:d.node===null?'正在整理生成結果':'正在執行生成流程'});
   else if(type==='execution_start')states.set(job.id,{stage:'正在載入模型與處理輸入'});
   else if(type==='execution_success')states.set(job.id,{stage:'正在儲存結果'});
  }catch{}});
  ws.addEventListener('error',()=>{clearTimeout(timer);states.delete(job.id);/* Failed native sockets close themselves. Never call close from an error event. */});
  ws.addEventListener('close',()=>{clearTimeout(timer);if(sockets.get(job.id)===ws)sockets.delete(job.id);states.delete(job.id);});
 }
 function sync(jobs){const ids=new Set(jobs.map(j=>j.id));for(const [id,ws] of sockets)if(!ids.has(id)){sockets.delete(id);states.delete(id);if(ws.readyState<2){try{ws.close();}catch{}}}for(const job of jobs)watch(job);}
 return {watch,sync,get:id=>states.get(id)||null};
};

const os=require('os');
const {execFile}=require('child_process');
module.exports=(app,db,inflight)=>{
 let releasing=false,cache=null,pending=null;
 const ollama=process.env.OLLAMA_URL||'http://127.0.0.1:8788',comfy=process.env.COMFY_URL||'http://127.0.0.1:8789';
 async function api(base,route,body){const r=await fetch(base+route,{signal:AbortSignal.timeout(8000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('服務回應 '+r.status);return r.json();}
 function gpu(){return new Promise(resolve=>execFile('nvidia-smi',['--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:4000,maxBuffer:65536},(e,s)=>resolve(e?{ok:false,error:'無法讀取 NVIDIA 狀態'}:{ok:true,devices:s.trim().split(/\r?\n/).filter(Boolean).map(line=>{const a=line.split(',').map(x=>x.trim());const n=x=>Number.isFinite(Number(x))?Number(x):null;return {name:a[0],used:n(a[1]),total:n(a[2]),util:n(a[3]),temperature:n(a[4])}})})));}
 function jobs(){return db.prepare("SELECT name FROM sqlite_master WHERE name='video_jobs'").get()?db.prepare("SELECT status,count(*) AS count FROM video_jobs WHERE status IN ('queued','running','submitting') GROUP BY status").all():[];}
 const active=()=>[...inflight.values()].reduce((a,b)=>a+b,0);
 async function snapshot(){const [g,o,c]=await Promise.all([gpu(),api(ollama,'/api/ps').then(d=>({ok:true,models:d.models||[]})).catch(()=>({ok:false,error:'llama.cpp 無法連線'})),api(comfy,'/queue').then(d=>({ok:true,running:d.queue_running.length,pending:d.queue_pending.length})).catch(()=>({ok:false,error:'獨立生成引擎 無法連線'}))]);return {at:Date.now(),gpu:g,ollama:o,comfy:c,memory:{total:os.totalmem(),free:os.freemem()},jobs:jobs(),active:active()};}
 app.get('/api/admin/resources',async(req,res)=>{if(!req.user?.admin)return res.sendStatus(403);try{if(!cache||Date.now()-cache.at>4000){pending ||= snapshot().finally(()=>pending=null);cache=await pending;}res.set('Cache-Control','no-store').json({...cache,releasing});}catch{res.status(503).json({error:'資源資料讀取失敗'});}});
 app.post('/api/admin/resources/release',async(req,res)=>{
  if(!req.user?.admin)return res.sendStatus(403);
  if(!['ollama','comfy'].includes(req.body.target))return res.status(400).json({error:'不支援的操作'});
  if(releasing||active()>0||jobs().length)return res.status(409).json({error:'仍有網站請求或生成任務，請稍後重試'});
  releasing=true;
  try{
   if(req.body.target==='comfy'){const q=await api(comfy,'/queue');if(q.queue_running.length||q.queue_pending.length)throw Error('獨立生成引擎 還有執行或排隊任務');await api(comfy,'/free',{unload_models:true,free_memory:true});}
   else{const d=await api(ollama,'/api/ps');for(const m of d.models||[])await api(ollama,'/api/generate',{model:m.name,keep_alive:0,stream:false});}
   cache=null;res.json({ok:true,message:'已送出釋放要求；請查看更新後的顯存狀態。'});
  }catch(e){res.status(503).json({error:e.message});}finally{releasing=false;}
 });
 app.use('/api',(req,res,next)=>releasing&&!['GET','HEAD','OPTIONS'].includes(req.method)?res.status(503).json({error:'管理員正在釋放模型資源，請稍後再試'}):next());
};

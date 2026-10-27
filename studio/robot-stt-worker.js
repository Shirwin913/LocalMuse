const {spawn}=require('child_process');
const readline=require('readline');
module.exports=function(python,script,model){
 let process=null,active=null,queue=[],sequence=0,idle=null;
 function pump(){
  if(active||!queue.length)return;
  clearTimeout(idle);
  if(!process){
   const p=spawn(python,['-u',script,model,'--worker'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...global.process.env,HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',PYTHONIOENCODING:'utf-8'}});
   process=p;
   const fail=()=>{if(process!==p)return;process=null;if(active){active.finish(Error('語音服務已中斷，請重試'));}pump();};
   p.on('error',fail);p.on('exit',fail);p.stderr.on('data',()=>{});p.stdin.on('error',fail);
   readline.createInterface({input:p.stdout}).on('line',line=>{
    if(process!==p)return;
    let result;try{result=JSON.parse(line);}catch{return;}
    if(active&&result.id===active.id){active.finish(result.error?Error(result.error):null,{text:result.text});pump();}
   });
  }
  const job=queue.shift();active=job;
  job.timer=setTimeout(()=>{const p=process;process=null;p?.kill();job.finish(Error('語音辨識逾時，請重試'));pump();},120000);
  process.stdin.write(JSON.stringify({id:job.id,audio:job.audio.toString('base64'),partial:job.partial})+'\n');
 }
 return (audio,partial,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('已停止'));
  if((partial&&(active||queue.length))||queue.length>=8)return reject(Error('語音服務忙碌，請稍後再試'));
  const job={audio,partial,id:++sequence,timer:null};
  const abort=()=>{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);job.finish(Error('已停止'));}};
  job.finish=(err,result)=>{clearTimeout(job.timer);signal?.removeEventListener('abort',abort);if(active===job)active=null;err?reject(err):resolve(result);if(!queue.length){idle=setTimeout(()=>{if(active)return;const p=process;process=null;p?.kill();},300000);idle.unref();}};
  signal?.addEventListener('abort',abort,{once:true});queue.push(job);pump();
 });
};

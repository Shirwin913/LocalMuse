const {spawn}=require('node:child_process');
const path=require('node:path');

// Only restart the website process; never resubmit generation requests.
function supervise({launch=()=>spawn(process.execPath,['--experimental-sqlite',path.join(__dirname,'server.js')],{cwd:__dirname,stdio:'inherit',windowsHide:true}),schedule=setTimeout,cancel=clearTimeout,now=Date.now,log=console.log,onStop=()=>{}}={}){
 let child,timer,stopping=false,failures=0,started;
 function run(){
  if(stopping)return;
  started=now();
  try{child=launch();}catch(error){log('網站啟動失敗：'+error.message);retry();return;}
  let finished=false;
  function finish(code,signal){
   if(finished)return;finished=true;child=null;
   if(stopping||code===0||['SIGINT','SIGTERM'].includes(signal)){stopping=true;onStop();return;}
   retry();
  }
  child.once('error',error=>{log('網站程序錯誤：'+error.message);finish(1);});
  child.once('exit',finish);
 }
 function retry(){
  if(stopping)return;
  if(now()-started>60000)failures=0;
  const delay=Math.min(30000,2000*2**Math.min(failures++,4));
  log(`網站異常退出，${delay/1000} 秒後自動重啟。按 Ctrl+C 停止。`);
  timer=schedule(run,delay);
 }
 function stop(){stopping=true;if(timer)cancel(timer);if(child)child.kill('SIGTERM');else onStop();}
 run();return {stop};
}
if(require.main===module){
 const runner=supervise();
 process.on('SIGINT',()=>runner.stop());
 process.on('SIGTERM',()=>runner.stop());
}
module.exports=supervise;

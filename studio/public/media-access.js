// Bounded permission waits; late streams are stopped after cancel/timeout.
(function(root){
 function acquire(constraints,{signal,timeoutMs=15000,mediaDevices=root.navigator?.mediaDevices}={}){
  return new Promise((resolve,reject)=>{
   let settled=false,timer;
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
   const fail=error=>{if(settled)return;settled=true;cleanup();reject(error);};
   const abort=()=>{const error=new Error('已取消裝置啟動');error.name='AbortError';fail(error);};
   if(signal?.aborted){abort();return;}
   signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>{const error=new Error('等待裝置授權逾時。請在一般瀏覽器開啟工作台、允許麥克風／攝影機後重試。');error.name='TimeoutError';fail(error);},timeoutMs);
   Promise.resolve().then(()=>{
    if(settled)return null;
    if(!mediaDevices?.getUserMedia)throw Error('此瀏覽器無法使用裝置，請使用localhost或HTTPS');
    return mediaDevices.getUserMedia(constraints);
   }).then(stream=>{if(!stream)return;if(settled){stream.getTracks().forEach(track=>track.stop());return;}settled=true;cleanup();resolve(stream);},fail);
  });
 }
 if(typeof module==='object'&&module.exports)module.exports={acquire};else root.localMedia={acquire};
})(globalThis);

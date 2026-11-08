// Loads personal preferences from the local server before the rest of the app reads
// localStorage, then mirrors later changes back. Runs before app.js on purpose.
(()=>{
 const META='preferences-sync-meta-v1';
 const proto=Storage.prototype,originalSet=proto.setItem,originalRemove=proto.removeItem;
 let store;try{store=window.localStorage;store.getItem(META);}catch{return;}
 let meta={};try{meta=JSON.parse(store.getItem(META))||{};}catch{}
 const saveMeta=()=>{try{originalSet.call(store,META,JSON.stringify(meta));}catch{}};

 // One short synchronous read from 127.0.0.1 so app.js sees the synced values on first paint.
 let server=null;
 try{const request=new XMLHttpRequest();request.open('GET','/api/preferences',false);request.send();if(request.status===200)server=JSON.parse(request.responseText);}catch{}
 if(!server||!Array.isArray(server.keys))return; // older server without the endpoint: stay local-only
 const keys=new Set(server.keys);

 const pending={};let timer=null;
 async function flush(){
  timer=null;const items={...pending};for(const key of Object.keys(items))delete pending[key];
  if(!Object.keys(items).length)return;
  try{const response=await fetch('/api/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({items}),keepalive:true});if(!response.ok)throw Error(response.status);}
  catch{for(const [key,item] of Object.entries(items))if(!pending[key])pending[key]=item;schedule(15000);}
 }
 function schedule(delay){clearTimeout(timer);timer=setTimeout(flush,delay);}
 function queue(key,value,updated){meta[key]=updated;saveMeta();pending[key]={value,updated};schedule(600);}

 for(const key of keys){
  const remote=server.items?.[key],local=store.getItem(key),localTime=meta[key]||0;
  if(remote&&remote.updated>localTime){
   if(remote.value===null)originalRemove.call(store,key);else originalSet.call(store,key,remote.value);
   meta[key]=remote.updated;
  }else if(local!==null&&(!remote||localTime>remote.updated)){
   meta[key]=localTime||Date.now();pending[key]={value:local,updated:meta[key]};
  }
 }
 saveMeta();if(Object.keys(pending).length)schedule(1500);

 proto.setItem=function(key,value){const result=originalSet.apply(this,arguments);if(this===store&&keys.has(key))queue(key,String(value),Date.now());return result;};
 proto.removeItem=function(key){const result=originalRemove.apply(this,arguments);if(this===store&&keys.has(key))queue(key,null,Date.now());return result;};
 window.addEventListener('pagehide',()=>{if(Object.keys(pending).length)flush();});
})();

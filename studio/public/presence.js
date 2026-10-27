(() => {
 const tabId=crypto.randomUUID(); let lastAction=Date.now(),busy=false,stopped=false;
 for(const event of ['pointerdown','pointermove','keydown','scroll','touchstart']) window.addEventListener(event,()=>{lastAction=Date.now();},{passive:true});
 async function heartbeat(){if(busy||stopped)return;busy=true;try{const r=await fetch('/api/presence',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({tabId,idleFor:Math.max(0,Date.now()-lastAction)}),signal:AbortSignal.timeout(10000)});if(r.status===401)stopped=true;}catch{}finally{busy=false;}}
 window.addEventListener('pageshow',()=>{stopped=false;heartbeat();});window.addEventListener('online',heartbeat);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat();});setInterval(heartbeat,30000);heartbeat();
})();
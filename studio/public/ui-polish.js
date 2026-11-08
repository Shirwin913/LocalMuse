// Compact layout for narrow or short windows.
// - Narrow: the conversation list becomes a slide-in drawer opened from the header.
// - Narrow or short: only one of "對話工具" / "生成設定" stays open, so the chat keeps its space.
(()=>{
 const sidebar=document.querySelector('.conversation-sidebar'),header=document.querySelector('.header');
 if(!sidebar||!header)return;
 const narrow=matchMedia('(max-width:800px)'),cramped=matchMedia('(max-width:800px),(max-height:760px)');

 const toggle=document.createElement('button');toggle.type='button';toggle.className='sidebar-toggle';
 toggle.textContent='☰';toggle.setAttribute('aria-label','開啟對話清單');toggle.setAttribute('aria-controls','conversationList');toggle.setAttribute('aria-expanded','false');
 const backdrop=document.createElement('div');backdrop.className='sidebar-backdrop';backdrop.setAttribute('aria-hidden','true');
 document.body.append(backdrop);

 function setOpen(open){
  document.body.classList.toggle('sidebar-open',open);toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'關閉對話清單':'開啟對話清單');
  sidebar.inert=narrow.matches&&!open;
  if(open)(sidebar.querySelector('.conversation-active')||sidebar.querySelector('button'))?.focus();
 }
 function applyLayout(){
  if(narrow.matches){if(!toggle.isConnected)header.prepend(toggle);setOpen(false);}
  else{toggle.remove();document.body.classList.remove('sidebar-open');sidebar.inert=false;}
  if(cramped.matches)collapseExtra();
 }
 toggle.onclick=()=>setOpen(!document.body.classList.contains('sidebar-open'));
 backdrop.onclick=()=>{setOpen(false);toggle.focus();};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('sidebar-open')){setOpen(false);toggle.focus();}});
 // Picking or creating a conversation closes the drawer; rename/delete keep it open.
 sidebar.addEventListener('click',event=>{
  if(!narrow.matches)return;
  const target=event.target.closest('button');if(!target)return;
  if(target.id==='newConversation'||target.parentElement?.firstElementChild===target)setTimeout(()=>setOpen(false),0);
 });

 // Accordion between the two drawers when space is tight.
 const handles=()=>[document.querySelector('.top-tools-handle'),document.querySelector('.composer-drawer-handle')].filter(Boolean);
 const isOpen=h=>h.getAttribute('aria-expanded')==='true';
 function collapseExtra(){const [top,composer]=handles();if(top&&composer&&isOpen(top)&&isOpen(composer))top.click();}
 let syncing=false;
 for(const handle of handles()){
  new MutationObserver(()=>{
   if(syncing||!cramped.matches||!isOpen(handle))return;
   const other=handles().find(h=>h!==handle&&isOpen(h));
   if(other){syncing=true;other.click();syncing=false;}
  }).observe(handle,{attributes:true,attributeFilter:['aria-expanded']});
 }
 narrow.addEventListener('change',applyLayout);cramped.addEventListener('change',applyLayout);
 applyLayout();
})();

// Long generation jobs: progress in the tab title, optional desktop notification when done,
// and a rough wait estimate next to the music length.
(()=>{
 const baseTitle=document.title;let percent=null,runningCount=0,doneFlash='';
 const store={get(){try{return localStorage.getItem('generation-notify-v1')==='on';}catch{return false;}},set(v){try{localStorage.setItem('generation-notify-v1',v?'on':'off');}catch{}}};
 const supported='Notification' in window;
 function title(){
  const parts=[];
  if(percent!==null&&runningCount)parts.push('('+percent+'%)');
  else if(runningCount)parts.push('⏳');
  else if(doneFlash)parts.push(doneFlash);
  document.title=(parts.length?parts.join(' ')+' ':'')+baseTitle;
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&doneFlash){doneFlash='';title();}});

 // Opt-in toggle lives next to the live progress, so the permission prompt follows a click.
 const progress=document.querySelector('.generation-progress');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='notify-toggle';
 function syncToggle(){
  const on=store.get()&&supported&&Notification.permission==='granted';
  toggle.textContent=on?'🔔 完成時會通知（按此關閉）':'🔕 完成時通知我';
  toggle.setAttribute('aria-pressed',String(on));
  toggle.hidden=!supported||Notification.permission==='denied';
  toggle.title=supported&&Notification.permission==='denied'?'瀏覽器已封鎖通知':'切到其他視窗時，生成完成會跳出系統通知';
 }
 toggle.onclick=async()=>{
  if(store.get()&&Notification.permission==='granted'){store.set(false);syncToggle();return;}
  const result=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  store.set(result==='granted');syncToggle();
 };
 if(progress&&supported){progress.append(toggle);syncToggle();}

 const labels={'text-image':'圖片','image-edit':'圖片','video':'影片','text-video':'影片','music':'音樂'};
 function notify(item){
  const ok=item.status==='done';const kind=labels[item.mode]||'作品';
  doneFlash=ok?'✓':'⚠';if(document.hidden)title();else doneFlash='';
  if(!document.hidden||!store.get()||!supported||Notification.permission!=='granted')return;
  try{
   const n=new Notification(ok?kind+'生成完成':kind+'生成失敗',{body:(item.title?'對話：'+item.title+'\n':'')+(ok?'點這裡回到 LocalMuse 查看。':'點這裡查看原因並重試。'),tag:'localmuse-'+item.id});
   n.onclick=()=>{window.focus();n.close();};
  }catch{}
 }

 // Watch every conversation, not only the open one.
 const known=new Map();let first=true;
 async function poll(){
  try{
   const response=await fetch('/api/studio?view=tasks&page=0');if(!response.ok)return;
   const data=await response.json();let running=0;
   for(const item of data.items||[]){
    const before=known.get(item.id);known.set(item.id,item.status);
    if(['queued','running','submitting'].includes(item.status))running++;
    else if(!first&&before&&['queued','running','submitting'].includes(before)&&['done','error'].includes(item.status))notify(item);
   }
   first=false;runningCount=running;if(!running)percent=null;title();
  }catch{}
 }
 poll();setInterval(poll,8000);

 // Exact percentage is only known for the job in the open conversation.
 try{
  const original=renderGenerationProgress;
  renderGenerationProgress=function(job){
   const result=original.apply(this,arguments);
   const p=job?.progress;
   if(job&&['queued','running','submitting'].includes(job.status)){runningCount=Math.max(runningCount,1);percent=p&&Number.isFinite(p.value)&&p.max>0?Math.floor(p.value/p.max*100):null;}
   else percent=null;
   title();return result;
  };
 }catch{}

 // Music wait estimate, fitted to this computer's own runs (RTX 3080 10GB).
 const duration=document.getElementById('musicDuration'),model=document.getElementById('musicModelSelect');
 if(duration&&model){
  const hint=document.createElement('small');hint.className='music-estimate';hint.setAttribute('aria-live','polite');
  duration.closest('label')?.after(hint);
  function update(){
   const length=Number(duration.value);
   if(!Number.isFinite(length)||length<=0){hint.textContent='';return;}
   if(model.value==='heartmula'){
    const estimate=45+1.8*length,low=estimate*.85,high=estimate*1.2;
    hint.textContent='預估等待：約 '+(high<90?'1–2 分鐘':Math.max(1,Math.round(low/60))+'–'+Math.round(high/60)+' 分鐘')+'（依這台電腦先前的 HeartMuLa 實測；首次載入會再久一點）';
   }else hint.textContent='預估等待：MiniMax 實測資料還不多，先前 10 秒片段約 9 分鐘；長度越長越久。';
  }
  duration.addEventListener('input',update);model.addEventListener('change',update);update();
 }
})();

// Share the chat's colours with the resources page (separate HTML page, same browser storage).
(()=>{
 const keys=['--text','--muted','--line','--accent','--surface','--raised','--page-bg','--button-text'];
 function save(){const style=document.documentElement.style;const vars={tone:document.documentElement.dataset.appearanceTone||'dark'};for(const key of keys){const value=style.getPropertyValue(key).trim();if(value)vars[key]=value;}if(!vars['--surface'])return;try{localStorage.setItem('chat-appearance-vars-v1',JSON.stringify(vars));}catch{}}
 new MutationObserver(save).observe(document.documentElement,{attributes:true,attributeFilter:['style','data-appearance-tone']});save();
})();

// First-run friendliness: a visible mode switch above the input, a gentle suggestion when
// "自動" can't tell, and clickable examples on an empty conversation. Nothing is sent
// automatically; every path ends with the user pressing the send/generate button.
(()=>{
 const form=document.getElementById('chatForm'),chatBox=document.getElementById('chat');
 if(!form||!chatBox||typeof creationMode==='undefined'||typeof input==='undefined')return;
 const labels={chat:'聊天','text-image':'圖片','image-edit':'圖片編輯',video:'影片','text-video':'影片',music:'音樂'};
 const modes=[
  ['auto','自動','依你的描述判斷要聊天還是生成'],
  ['chat','聊天','問問題、整理文件、看圖回答'],
  ['image','圖片','描述畫面來生成圖片；附上圖片則改為修改那張圖'],
  ['video','影片','描述影片內容；附上圖片則讓那張圖動起來'],
  ['music','音樂','描述曲風、情緒與樂器'],
 ];
 const hasImage=()=>Boolean(selectedFile?.type?.startsWith('image/'))||(Array.isArray(editFiles)&&editFiles.length>0);
 const target=key=>key==='image'?(hasImage()?'image-edit':'text-image'):key==='video'?(selectedFile?.type?.startsWith('image/')?'video':'text-video'):key;
 const keyOf=value=>['text-image','image-edit'].includes(value)?'image':['text-video','video'].includes(value)?'video':value;
 const optionUsable=value=>{const option=[...creationMode.options].find(o=>o.value===value);return option&&!option.disabled;};

 const bar=document.createElement('div');bar.className='mode-bar';bar.setAttribute('role','radiogroup');bar.setAttribute('aria-label','要做什麼');
 const chips={};
 for(const [key,label,tip] of modes){
  const chip=document.createElement('button');chip.type='button';chip.textContent=label;chip.title=tip;chip.dataset.mode=key;chip.setAttribute('role','radio');
  chip.onclick=()=>{if(!busyUI)choose(key);};chips[key]=chip;bar.append(chip);
 }
 const status=document.createElement('span');status.className='mode-status';status.setAttribute('role','status');bar.append(status);
 // Sits above the settings drawer: choose what to make → adjust settings → type.
 const drawer=document.querySelector('.composer-drawer');(drawer||form).before(bar);
 function align(){const ref=getComputedStyle(drawer||form);bar.style.marginLeft=ref.marginLeft;bar.style.marginRight=ref.marginRight;}
 addEventListener('resize',align);align();

 function choose(key){
  const value=target(key);if(!optionUsable(value))return;
  if(value==='image-edit'&&selectedFile){editFiles=[selectedFile];selectedFile=null;fileInput.value='';renderFilePreview();renderEditFiles();}
  creationMode.value=value;creationMode.dispatchEvent(new Event('change'));input.focus();
 }
 function availability(){
  for(const [key] of modes){const usable=key==='auto'||key==='chat'||optionUsable(target(key))||(key==='image'&&optionUsable('text-image'))||(key==='video'&&optionUsable('text-video'));chips[key].hidden=!usable;}
 }
 function placeholder(){
  if(creationMode.value==='auto')input.placeholder='直接說你想做什麼，例如：畫一隻穿雨衣的貓、做一段輕鬆的鋼琴音樂';
  else if(creationMode.value==='chat')input.placeholder='輸入訊息，或附上文件、圖片後提問';
 }
 function sync(){
  const current=keyOf(creationMode.value);
  for(const [key,chip] of Object.entries(chips)){const on=key===current;chip.setAttribute('aria-checked',String(on));chip.tabIndex=on?0:-1;}
  placeholder();describe();
 }
 function describe(){
  status.replaceChildren();
  if(creationMode.value!=='auto'||!input.value.trim())return;
  const image=Boolean(selectedFile?.type?.startsWith('image/'));
  const route=detectCreationIntent(input.value,image);
  if(route!=='chat'&&!optionUsable(route)){status.textContent='這台電腦目前無法生成'+(labels[route]||'')+'，會當作聊天送出';return;}
  if(route!=='chat'){status.textContent='將生成'+(labels[route]||'');return;}
  const suggestion=suggestCreationIntent(input.value,image);
  if(!suggestion||!optionUsable(suggestion))return;
  const switcher=document.createElement('button');switcher.type='button';switcher.className='mode-suggest';
  switcher.textContent='要改成生成'+labels[suggestion]+'嗎？';switcher.onclick=()=>choose(keyOf(suggestion));
  status.append(switcher);
 }
 bar.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  const visible=Object.values(chips).filter(c=>!c.hidden),index=visible.indexOf(document.activeElement);if(index<0)return;
  const next=visible[(index+(event.key==='ArrowRight'?1:-1)+visible.length)%visible.length];event.preventDefault();next.focus();next.click();
 });
 const previous=creationMode.onchange;
 creationMode.onchange=function(...args){const result=previous?.apply(this,args);sync();return result;};
 input.addEventListener('input',describe);
 new MutationObserver(describe).observe(document.getElementById('filePreview'),{childList:true});
 new MutationObserver(availability).observe(creationMode,{subtree:true,attributes:true,attributeFilter:['disabled','hidden']});
 availability();sync();

 // Empty conversation: show what this app can do, one click away.
 const examples=[
  {icon:'🎨',title:'畫一張圖',desc:'用一句話描述畫面，約 1 分鐘',key:'image',prompt:'一隻穿著黃色雨衣的橘貓，坐在下雨的窗邊，溫暖的燈光，插畫風格'},
  {icon:'🎵',title:'做一段音樂',desc:'描述曲風和氣氛，約 1–2 分鐘',key:'music',prompt:'輕鬆的 lo-fi 鋼琴純音樂，柔和的鼓點，適合讀書'},
  {icon:'🎬',title:'做一支短片',desc:'描述場景和動作，約 4 分鐘',key:'video',prompt:'一艘紙船漂在平靜的池塘上，微風吹起漣漪，鏡頭緩慢推近'},
  {icon:'💬',title:'問問題',desc:'規劃、寫作、整理重點都可以',key:'chat',prompt:'幫我規劃一個週末的台北一日遊，預算 2000 元'},
  {icon:'📎',title:'看圖或讀文件',desc:'附上圖片、PDF 或 Word 再提問',key:'chat',attach:true,prompt:'請幫我整理這份檔案的重點。'},
 ];
 const panel=document.createElement('section');panel.className='quick-start';panel.setAttribute('aria-label','快速開始');
 const heading=document.createElement('h2');heading.textContent='今天想做什麼？';
 const intro=document.createElement('p');intro.textContent='直接在下方打字聊天，或點一個範例開始。範例只會填入輸入框，按下按鈕才會開始。';
 const grid=document.createElement('div');grid.className='quick-start-grid';
 for(const example of examples){
  const card=document.createElement('button');card.type='button';
  card.innerHTML='<span class="qs-icon" aria-hidden="true"></span><span class="qs-title"></span><span class="qs-desc"></span>';
  card.querySelector('.qs-icon').textContent=example.icon;card.querySelector('.qs-title').textContent=example.title;card.querySelector('.qs-desc').textContent=example.desc;
  card.onclick=()=>{
   if(busyUI)return;
   choose(example.key);input.value=example.prompt;input.dispatchEvent(new Event('input',{bubbles:true}));
   const end=input.value.length;input.focus();input.setSelectionRange(end,end);
   if(example.attach)fileInput.click();
  };
  grid.append(card);
 }
 const notice=document.createElement('p');notice.className='quick-start-notice';notice.hidden=true;
 panel.append(heading,intro,notice,grid);
 // Hide examples this computer cannot run, and say why (e.g. AMD not yet validated, or no supported GPU).
 function cardAvailability(){
  grid.querySelectorAll('button').forEach((card,index)=>{const key=examples[index].key;card.hidden=key!=='chat'&&chips[key]?.hidden;});
  const gpu=window.nativeGeneration?.gpu;notice.hidden=!gpu?.reason;notice.textContent=gpu?.reason||'';
 }
 new MutationObserver(cardAvailability).observe(bar,{subtree:true,attributes:true,attributeFilter:['hidden']});
 let tries=0;const waitForEngine=setInterval(()=>{cardAvailability();if(window.nativeGeneration||++tries>40)clearInterval(waitForEngine);},500);
 cardAvailability();
 let scheduled=false;
 function refresh(){
  scheduled=false;
  const empty=!chatBox.querySelector(':scope > .message.user, :scope > .message.assistant');
  const greeting=[...chatBox.querySelectorAll(':scope > .message.system')].find(m=>m.textContent.trim()==='今天想聊些什麼？');
  greeting?.classList.toggle('greeting-hidden',empty);
  chatBox.classList.toggle('has-quick-start',empty);
  if(empty&&panel.parentElement!==chatBox)chatBox.append(panel);
  else if(!empty&&panel.isConnected)panel.remove();
 }
 new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}).observe(chatBox,{childList:true});
 refresh();
})();

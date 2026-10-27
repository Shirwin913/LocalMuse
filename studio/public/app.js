const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const input = document.getElementById('messageInput');
const modelSelect = document.getElementById('model');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const clearBtn = document.getElementById('clearBtn');
const statusBox = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const fileBtn = document.getElementById('fileBtn');
const filePreview = document.getElementById('filePreview');

let selectedFile = null;
const dropZone = document.querySelector('.panel');
let dragDepth = 0;
let previewUrl = null;

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

// Prevent dropped files from navigating away from the conversation.
window.addEventListener('dragover', (event) => {
  if (isFileDrag(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (isFileDrag(event)) event.preventDefault();
  dragDepth = 0;
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
dropZone.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  if(creationMode.value==='image-edit'){addEditFiles(files);return;}
  if (files.length !== 1) {
    addMessage('system', '請一次拖曳一張圖片。');
    return;
  }
  const file = files[0];
  if (!file.type.startsWith('image/')) {
    addMessage('system', '請拖曳圖片檔案；其他文件請使用迴紋針按鈕選取。');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    addMessage('system', '圖片不可超過 10 MB。');
    return;
  }
  selectedFile = file;
  fileInput.value = '';
  renderFilePreview();
  input.focus();
});

let messages = [
  {
    role: 'system',
    content: '你是一個在本地端執行的繁體中文 AI 助手。回答請清楚、實用，必要時提供程式碼。'
  }
];

fileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files[0] || null;
  renderFilePreview();
});

function renderFilePreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  filePreview.replaceChildren();
  if (!selectedFile) {
    return;
  }
  const chip = document.createElement('span');
  chip.className = 'file-chip';
  if (selectedFile.type.startsWith('image/')) {
    const thumbnail = document.createElement('img');
    previewUrl = URL.createObjectURL(selectedFile);
    thumbnail.src = previewUrl;
    thumbnail.alt = '待上傳圖片預覽';
    chip.appendChild(thumbnail);
  }
  const name = document.createElement('span');
  name.textContent = selectedFile.name;
  chip.appendChild(name);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '移除';
  chip.appendChild(remove);
  filePreview.appendChild(chip);
  remove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    renderFilePreview();
  });
}

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function checkLlamaCpp() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || 'llama.cpp 連線失敗');
    statusBox.textContent = 'llama.cpp 已連線';
    statusBox.className = 'status ok';
  } catch (err) {
    statusBox.textContent = 'llama.cpp 未連線';
    statusBox.className = 'status error';
    addMessage('system', '提醒：請使用專案 start.bat 啟動 llama.cpp 模型服務。');
  }
}

let activeId = null;
let busyUI = false;
const sidebar = document.createElement('aside');
sidebar.className = 'conversation-sidebar';
sidebar.innerHTML = '<h2>我的對話</h2><button type="button" id="newConversation">＋ 新增對話</button><nav aria-label="歷史對話" id="conversationList"></nav><small>紀錄與附件儲存在本機資料庫</small>';
document.querySelector('.app').prepend(sidebar);
clearBtn.textContent = '新增對話';
fileInput.accept = '.pdf,.txt,.docx,image/*';
async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if(res.status===401)throw new Error('服務無法使用，請重新啟動本機工作台');
  if (!res.ok) throw new Error(data.detail || data.error || '操作失敗');
  return data;
}
function selectModel(name) {
  if (!Array.from(modelSelect.options).some(o => o.value === name)) modelSelect.add(new Option(name,name));
  modelSelect.value = name;
}
function setBusy(value) {
  busyUI=value;
  window.chatCamera?.setBusy(value);
  document.querySelectorAll('.conversation-sidebar button, .toolbar button, .toolbar select, .input-area button, .input-area textarea').forEach(e=>e.disabled=value);
}
async function refreshConversations() {
  const list=await api('/api/conversations');
  const nav=document.getElementById('conversationList');
  nav.replaceChildren();
  for (const c of list) {
    const row=document.createElement('div'); row.className='conversation-row';
    const open=document.createElement('button'); open.type='button'; open.textContent=c.title; open.title=c.title;
    open.className=c.id===activeId?'conversation-active':'';
    open.setAttribute('aria-current', String(c.id===activeId));
    open.onclick=()=>runAction(()=>openConversation(c.id));
    const rename=document.createElement('button'); rename.type='button'; rename.textContent='✎'; rename.setAttribute('aria-label',`重新命名 ${c.title}`);
    rename.onclick=()=>runAction(async()=>{
      const title=prompt('對話名稱',c.title); if (!title?.trim()) return;
      await api(`/api/conversations/${c.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}); await refreshConversations();
    });
    const remove=document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.setAttribute('aria-label',`刪除 ${c.title}`);
    remove.onclick=()=>runAction(async()=>{
      if (!confirm(`刪除「${c.title}」及其訊息與附件？此操作無法復原。`)) return;
      await api(`/api/conversations/${c.id}`,{method:'DELETE'});
      if(c.id===activeId) {const remaining=await api('/api/conversations'); if(remaining.length) await openConversation(remaining[0].id); else await newConversation();}
      await refreshConversations();
    });
    row.append(open,rename,remove); nav.append(row);
  }
}
async function openConversation(id) {
  window.chatSpeech?.stop();
  if(activeId!==id)window.chatCamera?.reset();
  const c=await api(`/api/conversations/${id}`);
  renderGenerationProgress(null);if(activeId!==id){restoredRecipe=null;recipeSeed.value='';recipeInfo.textContent='';editFiles=[];renderEditFiles();musicLyrics.value='';}activeId=id; selectModel(c.model); chat.replaceChildren();
  input.value=''; selectedFile=null; fileInput.value=''; renderFilePreview();
  for(const m of c.messages) {
    const div=addMessage(m.role,m.content);if(m.role==='assistant'&&!m.mime){attachTransferButton(div,m.content);if(/(?:圖片|影片|音樂|图片|音乐).{0,6}(?:生成完成|已生成|已完成)/.test(m.content)){const note=document.createElement('p');note.className='missing-media-note';note.textContent='這則是文字回覆，沒有附加生成檔案。請使用生成模式送出任務。';div.append(note);}}
    if(m.role==='assistant'&&!m.mime?.startsWith('video/'))window.chatSpeech?.attach(div,m.content);
    if(m.mime?.startsWith('audio/'))attachMusicPlayer(div,m.id);
    if(m.mime?.startsWith('video/')) {const video=document.createElement('video');video.src=`/api/videos/${m.id}`;video.controls=true;video.preload='metadata';video.style.cssText='display:block;max-width:100%;max-height:420px;margin-top:12px;border-radius:12px';div.appendChild(video);attachVideoAnalysis(div,m.id);}
    if(m.mime?.startsWith('image/'))attachGeneratedImage(div,m.id,m.role==='assistant'&&['圖片已生成完成。','圖片編輯已完成。'].includes(m.content));
    if(m.filename) {const a=document.createElement('a'); a.href=`/api/attachments/${m.id}`; a.textContent=`📎 ${m.filename}`; a.className='saved-attachment'; div.append(document.createElement('br'),a);}
  }
  if(!c.messages.length) addMessage('system','今天想聊些什麼？');
  try { localStorage.setItem('active-conversation',id); } catch {}
  await refreshConversations();
}
async function newConversation() {const c=await api('/api/conversations',{method:'POST'}); await openConversation(c.id);}
async function runAction(action) {
  if(busyUI) return;
  setBusy(true);
  try {await action();} catch(e) {addMessage('system',e.message);} finally {setBusy(false);if(!document.querySelector('dialog[open]:not(.settings-embedded)') && [document.body,input,form.querySelector('[type=submit]')].includes(document.activeElement))input.focus({preventScroll:true});}
}
document.getElementById('newConversation').onclick=()=>runAction(newConversation);
clearBtn.onclick=()=>runAction(newConversation);
modelSelect.addEventListener('change',()=>runAction(async()=>{
  if(activeId) await api(`/api/conversations/${activeId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:modelSelect.value})});
}));
form.addEventListener('submit', e=>{
  e.preventDefault();
  const route=resolveCreationMode();
  if(busyUI)return;
  if(creationMode.value==='auto'&&['text-image','image-edit'].includes(route)){
    if(route==='image-edit'&&selectedFile){editFiles=[selectedFile];selectedFile=null;fileInput.value='';renderFilePreview();renderEditFiles();}
    creationMode.value=route;creationMode.onchange();updateRouteHint();
    document.querySelector('.composer-drawer-handle[aria-expanded="false"]')?.click();
    videoStatus.textContent='已切換'+(route==='image-edit'?'圖片編輯':'文字生成圖片')+'。請確認提示詞與設定，再按生成；目前尚未送出任務。';input.focus();return;
  }
  if(creationMode.value==='auto'&&route==='music'){creationMode.value='music';creationMode.onchange();updateRouteHint();videoStatus.textContent='已切換音樂生成。請確認風格、歌詞與時間，再按「生成音樂」；歷史聊天內容不會自動填入。';input.focus();return;}
  if(['video','text-video','text-image','image-edit','music'].includes(route)){

    if(creationMode.value!=='auto'||confirm('這次要送到 獨立生成引擎 生成影片嗎？\n確定：生成影片\n取消：當作一般聊天送出')){submitVideo(route);return;}
  }
  if(busyUI || (!input.value.trim()&&!selectedFile)) return;
  runAction(async()=>{
    if(!activeId) await newConversation();
    const cameraTurn=await window.chatCamera?.prepareTurn({text:input.value.trim(),model:modelSelect.value,hasAttachment:Boolean(selectedFile)});
    const payload=new FormData();
    payload.append('conversationId',activeId); payload.append('model',modelSelect.value); payload.append('text',input.value.trim());
    if(cameraTurn){payload.append('file',cameraTurn.file);payload.append('visionModel',cameraTurn.visionModel);}
    else if(selectedFile) payload.append('file',selectedFile);
    const loading=addMessage('assistant',cameraTurn?'正在分析這張攝影機照片…':'思考中… 完成後會自動儲存');
    try {const answer=await api(cameraTurn?'/api/webcam/chat':'/api/chat',{method:'POST',body:payload}); await openConversation(activeId);if(cameraTurn)window.chatCamera?.complete(answer,cameraTurn.version);window.chatSpeech?.auto(answer.reply);}
    catch(error) {loading.remove(); if(cameraTurn)window.chatCamera?.failed();throw error;}
  });
});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
checkLlamaCpp();
runAction(async()=>{
  await loadModels();
  const list=await api('/api/conversations');
  let last; try {last=localStorage.getItem('active-conversation');} catch {}
  if(list.length) await openConversation(list.find(c=>c.id===last)?.id||list[0].id); else await newConversation();
});

refreshModelsBtn.addEventListener('click', loadModels);

// llama.cpp 模型名稱 → UI 顯示名稱
function getModelDisplayName(name) {
  const names = {
    'hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q4_K_M': 'Qwythos 9B v2',
    'Qwythos-9B-v2-GGUF:Q4_K_M': 'Qwythos 9B v2',
    'llava:latest': 'LLaVA',
    'llama3.1:8b': 'Llama 3.1 8B',
    'qwen2.5:7b': 'Qwen 2.5 7B'
  };

  return names[name] || name;
}

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const models = await res.json();

    const chosen = modelSelect.value;
    modelSelect.innerHTML = '';

    if (!res.ok || !Array.isArray(models) || models.length === 0) {
      const option = document.createElement('option');
      option.value = 'hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q4_K_M';
      option.textContent = 'Qwythos 9B v2';
      modelSelect.appendChild(option);
      return;
    }

    models.forEach((model) => {
      const option = document.createElement('option');

      // 真正的 llama.cpp 模型 ID
      option.value = model.name;

      // 使用者看到的名稱
      option.textContent = getModelDisplayName(model.name);

      modelSelect.appendChild(option);
    });

    selectModel(chosen || 'qwen2.5:7b');
  } catch (err) {
    console.error('模型列表讀取失敗：', err);
  }
}

// Appearance preferences stay in this browser and never enter chat requests.
(() => {
  const defaults = { theme: 'violet', backgroundMode: 'white', customBackground: '#ece8f4', font: 15, spacing: 24, width: 1120 };
  const palettes = {
    violet: ['#b7a0ff', '#30283f', '#13141c', '#1c1d27', '#0c0d12'],
    ocean: ['#7acde8', '#183744', '#111b22', '#192830', '#091217'],
    forest: ['#9bc9a1', '#263d30', '#141d18', '#202c24', '#0c130e'],
    rose: ['#e9a8bd', '#432c39', '#21171e', '#30222c', '#150e13']
  };
  const valid = (value) => ({
    theme: Object.hasOwn(palettes, value?.theme) ? value.theme : defaults.theme,
    backgroundMode: ['theme','black','white','custom'].includes(value?.backgroundMode)?value.backgroundMode:defaults.backgroundMode,
    customBackground: /^#[0-9a-f]{6}$/i.test(value?.customBackground)?value.customBackground:defaults.customBackground,
    font: Math.min(22, Math.max(13, Number(value?.font) || defaults.font)),
    spacing: Math.min(36, Math.max(12, Number(value?.spacing) || defaults.spacing)),
    width: Math.min(1440, Math.max(800, Number(value?.width) || defaults.width))
  });
  let prefs = { ...defaults };
  try { prefs = valid(JSON.parse(localStorage.getItem('chat-appearance-v1'))); } catch {}
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '外觀';
  toggle.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('.toolbar').appendChild(toggle);
  const dialog = document.createElement('dialog');
  dialog.className = 'appearance-dialog';
  dialog.setAttribute('aria-labelledby', 'appearanceTitle');
  dialog.innerHTML = `
    <div class="appearance-heading"><div><small>MAKE IT YOURS</small><h2 id="appearanceTitle">打造你的聊天空間</h2></div><button type="button" data-close aria-label="關閉外觀設定">✕</button></div>
    <p class="appearance-description">即時預覽，調整到最舒服的閱讀方式。</p>
    <fieldset class="theme-options"><legend>配色風格</legend>
      <label style="--swatch:#b7a0ff"><input type="radio" name="appearanceTheme" value="violet">柔紫夜色</label>
      <label style="--swatch:#7acde8"><input type="radio" name="appearanceTheme" value="ocean">深海藍</label>
      <label style="--swatch:#9bc9a1"><input type="radio" name="appearanceTheme" value="forest">靜謐森林</label>
      <label style="--swatch:#e9a8bd"><input type="radio" name="appearanceTheme" value="rose">玫瑰暮色</label>
    </fieldset>
    <fieldset class="background-options"><legend>背景顏色</legend><div class="background-presets">
      <label><input type="radio" name="backgroundMode" value="theme">跟隨配色</label><label><input type="radio" name="backgroundMode" value="black">純黑</label><label><input type="radio" name="backgroundMode" value="white">純白</label><label><input type="radio" name="backgroundMode" value="custom">自訂</label></div>
      <div class="custom-background"><label for="backgroundColor">選擇顏色</label><input id="backgroundColor" type="color"><label for="backgroundHex">色碼</label><input id="backgroundHex" type="text" maxlength="7" placeholder="#ECE8F4" spellcheck="false" aria-describedby="backgroundHelp"></div>
      <small id="backgroundHelp">可輸入 #RRGGBB 色碼。文字、卡片及按鈕會自動搭配深淺色。</small></fieldset>
    <label class="preference-range" for="appearanceFont">文字大小 <output id="fontValue"></output><input id="appearanceFont" data-pref="font" type="range" min="13" max="22" step="1"></label>
    <label class="preference-range" for="appearanceSpacing">訊息間距 <output id="spacingValue"></output><input id="appearanceSpacing" data-pref="spacing" type="range" min="12" max="36" step="2"></label>
    <label class="preference-range" for="appearanceWidth">聊天區寬度 <output id="widthValue"></output><input id="appearanceWidth" data-pref="width" type="range" min="800" max="1440" step="40"></label>
    <div class="appearance-sample"><small>預覽 · AI 助手</small><p>你好！今天有什麼想一起探索的呢？</p></div>
    <p class="preference-status" role="status"></p>
    <div class="appearance-footer"><button type="button" data-reset>恢復預設</button><button type="button" data-close>完成</button></div>`;
  document.body.appendChild(dialog);
  function apply(save = false) {
    let [accent, bubble, surface, raised, background] = palettes[prefs.theme];
    const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
    const luminance=hex=>rgb(hex).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
    if(prefs.backgroundMode!=='theme')background=prefs.backgroundMode==='black'?'#000000':prefs.backgroundMode==='white'?'#ffffff':prefs.customBackground;
    const light=luminance(background)>.179;
    if(prefs.backgroundMode!=='theme'){surface=mix(background,light?'#ffffff':'#000000',.8);raised=mix(surface,light?'#000000':'#ffffff',.055);bubble=mix(surface,accent,.16);}
    if(light)accent=mix(accent,'#000000',.52);
    document.documentElement.dataset.appearanceTone=light?'light':'dark';
    document.documentElement.style.colorScheme=light?'light':'dark';
    dialog.querySelectorAll('[name="backgroundMode"]').forEach(el=>el.checked=el.value===prefs.backgroundMode);
    dialog.querySelector('#backgroundColor').value=prefs.customBackground;
    dialog.querySelector('#backgroundHex').value=prefs.customBackground.toUpperCase();
    dialog.querySelector('#backgroundHex').setCustomValidity('');
    dialog.querySelector('.custom-background').hidden=prefs.backgroundMode!=='custom';
    const root = document.documentElement.style;
    Object.entries({ '--text':light?'#20212a':'#eeeaf5','--muted':light?'#565866':'#aaa5b9','--line':light?'#00000026':'#ffffff26','--button-text':light?'#ffffff':'#201a2d', '--accent': accent, '--user-bubble': bubble, '--surface': surface, '--raised': raised, '--page-bg': background, '--chat-font': `${prefs.font}px`, '--chat-gap': `${prefs.spacing}px`, '--chat-width': `${prefs.width}px` }).forEach(([key, value]) => root.setProperty(key, value));
    dialog.querySelectorAll('[name="appearanceTheme"]').forEach(el => { el.checked = el.value === prefs.theme; });
    dialog.querySelectorAll('[data-pref]').forEach(el => {
      el.value = prefs[el.dataset.pref];
      dialog.querySelector(`#${el.dataset.pref}Value`).textContent = `${prefs[el.dataset.pref]} px`;
    });
    if (save) {
      try {
        localStorage.setItem('chat-appearance-v1', JSON.stringify(prefs));
        dialog.querySelector('.preference-status').textContent = '已自動儲存在此瀏覽器';
      } catch {
        dialog.querySelector('.preference-status').textContent = '設定已套用，但此瀏覽器目前無法儲存。';
      }
    }
  }
  toggle.addEventListener('click', () => dialog.showModal());
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('input', event => {
    if (event.target.name === 'appearanceTheme') prefs.theme = event.target.value;
    else if(event.target.name==='backgroundMode')prefs.backgroundMode=event.target.value;
    else if(['backgroundColor','backgroundHex'].includes(event.target.id)){
      if(!/^#[0-9a-f]{6}$/i.test(event.target.value)){event.target.setCustomValidity('請輸入完整的 #RRGGBB 色碼');return;}
      prefs.customBackground=event.target.value;prefs.backgroundMode='custom';
    }
    else if (event.target.dataset.pref) prefs[event.target.dataset.pref] = Number(event.target.value);
    else return;
    prefs = valid(prefs);
    apply(true);
  });
  dialog.querySelector('[data-reset]').addEventListener('click', () => { prefs = { ...defaults }; apply(true); });
  apply();
})();

// Defaults are stored in SQLite and copied into each new conversation.
(() => {
  const button=document.createElement('button'); button.type='button'; button.textContent='對話設定';
  document.querySelector('.toolbar').appendChild(button);
  const dialog=document.createElement('dialog'); dialog.className='appearance-dialog';
  dialog.setAttribute('aria-labelledby','languageTitle');
  dialog.innerHTML='<h2 id="languageTitle">新對話設定</h2><p class="appearance-description">建立新對話時套用，既有對話保留原設定。</p><label for="defaultLanguage">預設回答語言</label><select id="defaultLanguage" style="display:block;width:100%;padding:12px;margin:16px 0"><option value="zh-TW">繁體中文（臺灣用語）</option><option value="auto">跟隨使用者的語言</option></select><p class="appearance-description">繁體中文模式會要求模型避免簡體字，並保留程式碼、指令與專有名稱原文。</p><p role="status" id="languageStatus"></p><div class="appearance-footer"><button type="button" data-cancel>關閉</button><button type="button" data-save>儲存設定</button></div>';
  document.body.appendChild(dialog);
  const select=dialog.querySelector('select'), status=dialog.querySelector('[role=status]'), save=dialog.querySelector('[data-save]');
  button.onclick=async()=>{
    dialog.showModal(); save.disabled=true; select.disabled=true; status.textContent='讀取中…';
    try {const settings=await api('/api/settings');select.value=settings.language;status.textContent='';save.disabled=false;select.disabled=false;}
    catch(e){status.textContent=e.message;}
  };
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  save.onclick=async()=>{
    save.disabled=true;
    try {await api('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:select.value})});status.textContent='已儲存！下一個新對話將使用此設定。';}
    catch(e){status.textContent=e.message;}finally{save.disabled=false;}
  };
})();

const creationTools=document.createElement('div');creationTools.className='creation-tools';
creationTools.innerHTML='<label>模式 <select id="creationMode"><option value="auto">自動判斷</option><option value="chat">一般聊天</option><option value="video">圖片生成影片</option><option value="text-video">文字生成影片</option><option value="text-image">文字生成圖片</option><option value="image-edit">單張圖片轉換（SDXL Turbo）</option><option value="music">音樂生成</option></select></label><span id="videoControls" hidden><button id="videoSettingsButton" type="button">影片設定</button> <button id="polishPrompt" type="button">AI 整理提示詞</button> <button id="openVideoFolder" type="button">開啟影片資料夾</button></span>';
form.before(creationTools);
const videoStatus=document.createElement('div');videoStatus.id='videoJobStatus';videoStatus.setAttribute('role','status');creationTools.before(videoStatus);
const creationMode=document.getElementById('creationMode');
creationMode.onchange=()=>{const isVideo=creationMode.value!=='chat';document.getElementById('videoControls').hidden=!isVideo;document.getElementById('openVideoFolder').hidden=creationMode.value==='text-image';input.placeholder=creationMode.value==='text-image'?'描述圖片的主體、風格、構圖與光線':creationMode.value==='text-video'?'描述主體、場景、動作與鏡頭，不需要上傳圖片':creationMode.value==='video'?'上傳圖片，描述人物動作與鏡頭；可先按 AI 整理提示詞':'輸入訊息';form.querySelector('[type=submit]').textContent=creationMode.value==='text-image'?'生成圖片':['video','text-video'].includes(creationMode.value)?'生成影片':'送出';};
document.getElementById('polishPrompt').onclick=()=>runAction(async()=>{
 if(!input.value.trim())throw Error('請先描述想生成的內容');
 const mode=creationMode.value==='auto'?(resolveCreationMode()==='music'?'music':selectedFile?.type.startsWith('image/')?'video':'text-video'):creationMode.value,reference=selectedFile;
 const originalMode=creationMode.value,referenceFiles=[...editFiles],originalText=input.value,originalConversation=activeId;
 if(mode==='image-edit'&&!referenceFiles.length)throw Error('請先加入參考圖片');
 if(mode==='video'&&!reference)throw Error('請先上傳圖片，再整理提示詞');
 const body=new FormData();body.append('text',input.value);body.append('model',modelSelect.value);body.append('mode',mode);if(mode==='music')body.append('musicModel',musicModelSelect.value);
 if(mode==='video')body.append('file',reference);
 if(mode==='image-edit')for(const f of referenceFiles)body.append('file',f);
 videoStatus.textContent=mode==='image-edit'?'正在依序分析 '+referenceFiles.length+' 張圖片並整理提示詞…':mode==='video'?'正在查看參考圖片並整理動作提示詞…':'正在整理提示詞…';
 try{
  const result=await api('/api/video-prompt',{method:'POST',body});
  if(originalMode!==creationMode.value||originalConversation!==activeId||originalText!==input.value||(mode==='image-edit'&&(referenceFiles.length!==editFiles.length||referenceFiles.some((f,i)=>f!==editFiles[i])))||(mode==='video'&&reference!==selectedFile))throw Error('圖片或模式已變更，請重新整理提示詞');
  input.value=result.prompt;if(originalMode!=='auto'){creationMode.value=mode;creationMode.onchange();}videoStatus.textContent=mode==='video'?'已參考圖片整理提示詞，請確認後再生成。':'提示詞已填入，確認後即可生成。';
 }catch(e){videoStatus.textContent='提示詞整理失敗';throw e;}
});
async function submitVideo(mode=resolveCreationMode()){
 if(busyUI)return;
 await runAction(async()=>{
  if(window.nativeGeneration&&!window.nativeGeneration.modes.includes(mode))throw Error('此功能尚未完成獨立化；目前可用圖片生成與 HeartMuLa 音樂。');
  if(window.nativeGeneration&&mode==='image-edit'&&editFiles.length!==1)throw Error('獨立圖片轉換僅接受一張參考圖。');
  if(!activeId)throw Error('請先新增對話');
  if(!input.value.trim())throw Error('請填入提示詞');
  if(mode==='video'&&!selectedFile)throw Error('請拖入圖片');
  if(mode!=='video'&&selectedFile)throw Error('文字生成不使用附件，請先移除附件');
  const body=new FormData();body.append('conversationId',activeId);body.append('text',input.value.trim());const settings=getVideoSettings(mode);body.append('seconds',settings.seconds);body.append('ratio',settings.ratio);body.append('megapixels',settings.megapixels);body.append('mode',mode);if(mode==='image-edit'){if(!editFiles.length)throw Error('請先選擇參考圖片');for(const f of editFiles)body.append('file',f);}else if(selectedFile)body.append('file',selectedFile);
  if(recipeSeed.value!=='')body.append('seed',recipeSeed.value);if(restoredRecipe?.mode===mode)body.append('recipeId',restoredRecipe.jobId);
  if(mode==='music'){body.append('musicModel',musicModelSelect.value);const duration=Number(musicDuration.value);if(!Number.isInteger(duration)||duration<5||duration>360)throw Error('音樂時間需為 5–360 秒');if(musicModelSelect.value==='heartmula'&&(duration<10||duration>60))throw Error('HeartMuLa 音樂時間需為 10–60 秒');body.append('lyrics',musicLyrics.value);body.append('duration',duration);}
  videoStatus.textContent='正在送到 獨立生成引擎…';
  try{await api('/api/video-jobs',{method:'POST',body});await openConversation(activeId);await checkVideoJobs();}catch(e){videoStatus.textContent='送出失敗：'+e.message;throw e;}
 });
}
let checkingVideo=false;const knownVideoStates=new Map();
async function checkVideoJobs(){
 if(!activeId||checkingVideo)return;checkingVideo=true;const id=activeId;
 try{
  const jobs=await api('/api/video-jobs?conversation='+encodeURIComponent(id));if(activeId!==id)return;
  const ongoing=jobs.filter(j=>['queued','running','submitting'].includes(j.status));
  renderGenerationProgress(ongoing[0]||jobs.at(-1));
  const failed=jobs.filter(j=>j.status==='error');
  if(ongoing.length)videoStatus.textContent=ongoing.map(j=>(j.status==='running'?'獨立生成引擎 正在生成…':'生成任務排隊中…')+(j.error?' '+j.error:'')).join('\n');
  else if(failed.length&&jobs.at(-1)?.status==='error')videoStatus.textContent='生成失敗：'+failed.at(-1).error;
  else if(jobs.length)videoStatus.textContent='最近一筆生成任務的結果已儲存在對話中；不代表後續聊天已生成檔案。';
  else if(!busyUI)videoStatus.textContent='';
  for(const job of jobs){
   const prior=knownVideoStates.get(job.id);knownVideoStates.set(job.id,job.status);
   if(job.status==='done'&&prior!=='done'){
    if(job.mode==='music'){if(!chat.querySelector('audio[data-message-id="'+job.message_id+'"]')){const div=addMessage('assistant','音樂已生成完成。');attachMusicPlayer(div,job.message_id);const a=document.createElement('a');a.href='/api/attachments/'+job.message_id;a.textContent='下載音樂';a.className='saved-attachment';div.append(a);}continue;}
    if(['text-image','image-edit'].includes(job.mode)){if(!chat.querySelector('img[data-message-id="'+job.message_id+'"]')){const div=addMessage('assistant','圖片已生成完成。');attachGeneratedImage(div,job.message_id,true);const a=document.createElement('a');a.href='/api/attachments/'+job.message_id;a.textContent='下載圖片';div.append(a);}continue;}
    if(!chat.querySelector(`video[src="/api/videos/${job.message_id}"]`)){
     const div=addMessage('assistant','影片已生成完成。');const v=document.createElement('video');v.src='/api/videos/'+job.message_id;v.controls=true;v.preload='metadata';v.style.cssText='display:block;max-width:100%;max-height:420px';const a=document.createElement('a');a.href='/api/attachments/'+job.message_id;a.textContent='下載影片';a.className='saved-attachment';div.append(v,a);attachVideoAnalysis(div,job.message_id);
    }
   }
  }
 }catch(e){if(activeId!==id)return;renderGenerationProgress({status:'running',connectionLost:true,error:'無法取得進度，等待連線恢復'});videoStatus.textContent='無法更新影片狀態：'+e.message;}finally{checkingVideo=false;}
}
setInterval(checkVideoJobs,4000);

function attachVideoAnalysis(container,videoId,isImage=false){
 attachRecipeButton(container,videoId);
 const actionLabel=isImage?'分析圖片並改善提示詞':'分析影片並改善提示詞';const endpoint='/api/'+(isImage?'image-analysis':'video-analysis')+'/'+videoId;
 const button=document.createElement('button');button.type='button';button.textContent=actionLabel;button.className='analyze-video';
 const result=document.createElement('div');result.className='video-analysis-result';const label=document.createElement('label');label.textContent='希望新增或調整的內容（選填）';label.className='video-change-request';
 const changes=document.createElement('textarea');changes.rows=3;changes.maxLength=2000;changes.placeholder=isImage?'例如：保留人物與服裝，加入櫻花背景，改成暖色光線。':'例如：保留人物與服裝，加入飄落的櫻花，鏡頭慢慢拉遠。';label.append(changes);
 const help=document.createElement('small');help.textContent='未指定的特徵會要求保留；新版提示詞需確認後重新生成。';label.append(help);
 let edited=false;changes.addEventListener('input',()=>{edited=true;});if(isImage){const section=document.createElement('section');section.className='image-improve-panel';section.setAttribute('aria-label','改善圖片提示詞');section.append(label,button,result);container.append(section);}else container.append(label,button,result);
 function render(data){if(!data)return;result.replaceChildren();
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看分析與新版提示詞';details.append(summary);
  const requestSummary=document.createElement('p');requestSummary.textContent='本次調整要求：'+(data.requested_changes||'無額外要求')+(data.mode==='image-edit'?'。分析依據為生成結果；再次編輯時請確認參考圖片及順序與這次生成相符。':'');details.append(requestSummary);
  const review=document.createElement('p');review.textContent=data.analysis;details.append(review);
  const revised=document.createElement('textarea');revised.value=data.prompt;revised.rows=6;revised.setAttribute('aria-label','改善後的提示詞，可編輯');details.append(revised);
  const use=document.createElement('button');use.type='button';use.textContent='使用這份提示詞';use.onclick=()=>{
   if(busyUI)return;
   if(input.value.trim()&&!confirm('要以這份提示詞取代目前輸入框內容嗎？'))return;
   input.value=revised.value;creationMode.value=data.mode;creationMode.onchange();input.focus();
   videoStatus.textContent=data.mode==='image-edit'?(editFiles.length?'已填入提示詞，參考圖已保留。請確認圖片順序後按「編輯圖片」。':'已填入提示詞。請依原順序加入參考圖，確認後按「編輯圖片」。'):data.mode==='text-image'?'已填入提示詞，確認後按「生成圖片」。':data.mode==='video'?'請重新附上原始圖片，確認後按「生成影片」。':'已填入提示詞，確認後按「生成影片」。';
  };details.append(use);result.append(details);
 }
 api(endpoint).then(data=>{if(data){if(!edited&&!changes.disabled)changes.value=data.requested_changes||'';render(data);}}).catch(()=>{});
 button.onclick=async()=>{
  if(busyUI)return;const requested_changes=changes.value.trim();changes.disabled=true;button.disabled=true;button.textContent=isImage?'正在讀取圖片…':'正在擷取畫面…';
  try{
   const frames=isImage?undefined:await extractVideoFrames('/api/videos/'+videoId);
   button.textContent='正在分析與改寫，請稍候…';
   const data=await api(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames,model:modelSelect.value,requested_changes})});
   render(data);result.querySelector('details').open=true;
  }catch(e){result.textContent='分析失敗：'+e.message;}finally{changes.disabled=false;button.disabled=false;button.textContent=actionLabel;}
 };
}
async function extractVideoFrames(url){
 const video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
 function wait(event,action){return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>finish(Error('讀取影片逾時')),30000);
  const ok=()=>finish(),bad=()=>finish(Error('瀏覽器無法解碼影片'));
  function finish(error){clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);error?reject(error):resolve();}
  video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});action();
 });}
 try{
  await wait('loadeddata',()=>{video.src=url;video.load();});
  if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw Error('無法取得影片長度或畫面');
  const canvas=document.createElement('canvas');const scale=Math.min(1,512/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const context=canvas.getContext('2d');const frames=[];
  for(const fraction of [.05,.35,.65,.95]){
   const time=video.duration*fraction;await wait('seeked',()=>{video.currentTime=time;});context.drawImage(video,0,0,canvas.width,canvas.height);
   frames.push({time,image:canvas.toDataURL('image/jpeg',.65).split(',')[1]});
  }return frames;
 }finally{video.removeAttribute('src');video.load();}
}

const videoSettingsDialog=document.createElement('dialog');
videoSettingsDialog.className='appearance-dialog';videoSettingsDialog.setAttribute('aria-labelledby','videoSettingsTitle');
videoSettingsDialog.innerHTML=`<div class="appearance-heading"><h2 id="videoSettingsTitle">影片設定</h2><button type="button" data-close aria-label="關閉影片設定">✕</button></div>
<p class="appearance-description">圖生影片與文生影片分別記住設定，下次生成時套用。</p>
<label class="video-setting-field">畫面比例<select id="videoRatio">
<option value="16:9 (Widescreen)">16:9 橫向寬螢幕</option><option value="9:16 (Portrait Widescreen)">9:16 直向短片</option><option value="1:1 (Square)">1:1 正方形</option><option value="3:2 (Photo)">3:2 橫向照片</option><option value="2:3 (Portrait Photo)">2:3 直向照片</option><option value="4:3 (Standard)">4:3 橫向</option><option value="3:4 (Portrait Standard)">3:4 直向</option><option value="21:9 (Ultrawide)">21:9 超寬</option></select></label>
<label class="video-setting-field">解析度（總像素）<select id="videoMegapixels"><option value="0.2">0.2 MP · 快速測試</option><option value="0.3">0.3 MP</option><option value="0.5">0.5 MP · 目前工作流程預設</option><option value="0.7">0.7 MP</option><option value="1">1.0 MP · 較高解析度</option></select></label>
<label class="video-setting-field">影片長度（秒）<input id="videoSeconds" type="number" min="1" max="15" step="1" value="3"></label>
<p class="appearance-description">維持 24 FPS。實際寬高由 獨立生成引擎 按比例計算並對齊 32 像素；秒數也可能因模型幀數限制略有差異。解析度與秒數越高，所需記憶體與時間越多。圖生影片建議選接近原圖的比例。</p>
<p id="videoSettingsFeedback" role="status"></p><div class="appearance-footer"><button type="button" data-reset>恢復預設</button><button type="button" data-save>套用設定</button></div>`;
document.body.append(videoSettingsDialog);
let savedVideoSettings={};try{savedVideoSettings=JSON.parse(localStorage.getItem('video-settings-v1'))||{};}catch{}
let settingsMode='video';
function getVideoSettings(mode=creationMode.value){
 if(mode==='auto')mode=selectedFile?.type.startsWith('image/')?'video':'text-video';
 const fallback={ratio:mode==='text-image'?'1:1 (Square)':mode==='text-video'?'16:9 (Widescreen)':'3:2 (Photo)',megapixels:mode==='text-image'?1:.5,seconds:3};
 const value=savedVideoSettings[mode]||{};
 return {ratio:Array.from(document.getElementById('videoRatio').options).some(o=>o.value===value.ratio)?value.ratio:fallback.ratio,megapixels:[.2,.3,.5,.7,1].includes(Number(value.megapixels))?Number(value.megapixels):fallback.megapixels,seconds:Number.isInteger(value.seconds)&&value.seconds>=1&&value.seconds<=15?value.seconds:3};
}
function showVideoSettings(){
 settingsMode=creationMode.value==='auto'?(selectedFile?.type.startsWith('image/')?'video':'text-video'):creationMode.value;const v=getVideoSettings(settingsMode);
 document.getElementById('videoRatio').value=v.ratio;document.getElementById('videoMegapixels').value=v.megapixels;document.getElementById('videoSeconds').value=v.seconds;
 document.getElementById('videoSettingsTitle').textContent=settingsMode==='text-image'?'圖片設定':'影片設定';document.getElementById('videoSeconds').closest('label').hidden=settingsMode==='text-image';videoSettingsDialog.querySelectorAll('.appearance-description').forEach(el=>el.hidden=settingsMode==='text-image');document.getElementById('videoSettingsFeedback').textContent=settingsMode==='text-image'?'Qwen Image 2.1 · 25 步 · 寬高對齊 8 像素。解析度越高，記憶體與時間需求越多。':'';videoSettingsDialog.showModal();
}
document.getElementById('videoSettingsButton').onclick=showVideoSettings;
videoSettingsDialog.querySelector('[data-close]').onclick=()=>videoSettingsDialog.close();
videoSettingsDialog.querySelector('[data-reset]').onclick=()=>{document.getElementById('videoRatio').value=settingsMode==='text-image'?'1:1 (Square)':settingsMode==='text-video'?'16:9 (Widescreen)':'3:2 (Photo)';document.getElementById('videoMegapixels').value='.5';document.getElementById('videoMegapixels').value=settingsMode==='text-image'?'1':'0.5';document.getElementById('videoSeconds').value=3;};
videoSettingsDialog.querySelector('[data-save]').onclick=()=>{
 const seconds=Number(document.getElementById('videoSeconds').value);if(!Number.isInteger(seconds)||seconds<1||seconds>15){document.getElementById('videoSettingsFeedback').textContent='請輸入 1–15 的整數秒數';return;}
 savedVideoSettings[settingsMode]={ratio:document.getElementById('videoRatio').value,megapixels:Number(document.getElementById('videoMegapixels').value),seconds};
 try{localStorage.setItem('video-settings-v1',JSON.stringify(savedVideoSettings));}catch{videoStatus.textContent='設定已套用，但瀏覽器無法儲存偏好。';}
 updateVideoSettingsSummary();videoSettingsDialog.close();
};
function updateVideoSettingsSummary(){const v=getVideoSettings();document.getElementById('videoSettingsButton').textContent=`${creationMode.value==='text-image'?'圖片':'影片'}設定 · ${v.ratio.split(' ')[0]} / ${v.megapixels} MP${creationMode.value==='text-image'?'':' / '+v.seconds+' 秒'}`;}
creationMode.addEventListener('change',updateVideoSettingsSummary);updateVideoSettingsSummary();

// Clipboard images use the same attachment and preview flow as file selection.
input.addEventListener('paste', (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const items = Array.from(clipboard.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/'));
  const files = items.length
    ? items.map(item => item.getAsFile()).filter(Boolean)
    : Array.from(clipboard.files || []).filter(file => file.type.startsWith('image/'));
  if (!files.length && !items.length) return; // Let normal text paste work.
  event.preventDefault();
  if (busyUI || input.disabled) return;
  if (files.length !== 1) {
    addMessage('system', '請一次貼上一張圖片；若圖片無法讀取，請重新截圖或使用附件按鈕。');
    return;
  }
  const file = files[0];
  if (!file.size || file.size > 10 * 1024 * 1024) {
    addMessage('system', '圖片必須有內容，且不可超過 10 MB。');
    return;
  }
  selectedFile = file;
  fileInput.value = '';
  renderFilePreview();
  input.focus();
});

// Browser speech synthesis; only newly completed chat replies may auto-play.
(() => {
 const supported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
 const synth=window.speechSynthesis;
 let prefs={voice:'',rate:1,auto:false};
 try{const p=JSON.parse(localStorage.getItem('chat-speech-v1'));if(p)prefs={voice:typeof p.voice==='string'?p.voice:'',rate:Math.min(1.5,Math.max(.5,Number(p.rate)||1)),auto:p.auto===true};}catch{}
 let voices=[],token=0,activeButton=null,utterance=null;
 const dialog=document.createElement('dialog');dialog.className='appearance-dialog';dialog.setAttribute('aria-labelledby','speechTitle');
 dialog.innerHTML='<div class="appearance-heading"><h2 id="speechTitle">語音朗讀</h2><button type="button" data-close aria-label="關閉語音設定">✕</button></div><label class="video-setting-field">音色<select id="speechVoice"></select></label><label class="video-setting-field">語速 <output id="speechRateLabel"></output><input id="speechRate" type="range" min="0.5" max="1.5" step="0.1"></label><label><input id="speechAuto" type="checkbox"> 自動朗讀新回答</label><p class="appearance-description">音色由瀏覽器與系統提供，部分音色可能需要網路。程式碼區塊與網址不朗讀。</p><p role="status" id="speechStatus"></p><div class="appearance-footer"><button type="button" data-test>試聽</button><button type="button" data-stop>停止朗讀</button></div>';
 document.body.append(dialog);
 const settings=document.createElement('button');settings.type='button';settings.textContent='語音';settings.setAttribute('aria-haspopup','dialog');document.querySelector('.toolbar').append(settings);
 const status=dialog.querySelector('#speechStatus'),voiceSelect=dialog.querySelector('select'),rate=dialog.querySelector('#speechRate'),auto=dialog.querySelector('#speechAuto');
 const globalStop=document.createElement('button');globalStop.type='button';globalStop.textContent='停止朗讀';globalStop.hidden=true;creationTools.append(globalStop);
 function stop(){token++;if(supported)synth.cancel();if(activeButton){activeButton.textContent='🔊 朗讀';activeButton.setAttribute('aria-pressed','false');}activeButton=null;utterance=null;globalStop.hidden=true;}
 function clean(text){return text.replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```[\s\S]*?```/g,'（略過程式碼）').replace(/https?:\/\/\S+/g,'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*_`|]/g,'').trim();}
 function speak(text,button){
  if(!supported)return;
  stop();const value=clean(text);if(!value)return;
  const parts=[];for(let i=0;i<value.length;i+=160)parts.push(value.slice(i,i+160));
  const current=token;activeButton=button||null;globalStop.hidden=false;
  if(button){button.textContent='■ 停止';button.setAttribute('aria-pressed','true');}
  let index=0;
  function next(){
   if(current!==token)return;
   if(index>=parts.length){stop();return;}
   const u=new SpeechSynthesisUtterance(parts[index++]);utterance=u;
   const voice=voices.find(v=>v.voiceURI===prefs.voice)||voices.find(v=>/^zh[-_]TW$/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));
   if(voice)u.voice=voice;u.lang=voice?.lang||'zh-TW';u.rate=prefs.rate;
   u.onend=next;u.onerror=e=>{if(current!==token)return;stop();status.textContent='無法朗讀（'+e.error+'），請改選音色或手動按朗讀。';};
   try{synth.speak(u);}catch(e){stop();status.textContent='朗讀失敗：'+e.message;}
  }next();
 }
 function refreshVoices(){
  voices=supported?synth.getVoices():[];voiceSelect.replaceChildren(new Option('自動選擇中文音色',''));
  for(const v of [...voices].sort((a,b)=>Number(!/^zh/i.test(a.lang))-Number(!/^zh/i.test(b.lang))))voiceSelect.add(new Option(`${v.name} · ${v.lang}${v.localService?' · 本機':''}`,v.voiceURI));
  voiceSelect.value=voices.some(v=>v.voiceURI===prefs.voice)?prefs.voice:'';
 }
 function save(){prefs={voice:voiceSelect.value,rate:Number(rate.value),auto:auto.checked};dialog.querySelector('output').textContent=prefs.rate.toFixed(1)+' 倍';try{localStorage.setItem('chat-speech-v1',JSON.stringify(prefs));status.textContent='設定已儲存';}catch{status.textContent='設定已套用，但無法儲存至瀏覽器';}}
 rate.value=prefs.rate;auto.checked=prefs.auto;dialog.querySelector('output').textContent=prefs.rate.toFixed(1)+' 倍';
 voiceSelect.onchange=save;rate.oninput=save;auto.onchange=save;
 settings.onclick=()=>{refreshVoices();status.textContent=supported?'':'此瀏覽器不支援語音朗讀，請使用支援的瀏覽器。';dialog.showModal();};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-test]').onclick=()=>speak('你好，這是繁體中文語音朗讀測試。');dialog.querySelector('[data-stop]').onclick=stop;globalStop.onclick=stop;
 if(supported){synth.addEventListener('voiceschanged',refreshVoices);refreshVoices();}else{for(const e of dialog.querySelectorAll('input,select,[data-test],[data-stop]'))e.disabled=true;}
 window.addEventListener('pagehide',stop);
 window.chatSpeech={stop,attach(div,text){if(!supported)return;const button=document.createElement('button');button.type='button';button.className='speech-reply-button';button.textContent='🔊 朗讀';button.setAttribute('aria-pressed','false');button.onclick=()=>activeButton===button?stop():speak(text,button);div.append(button);},auto(text){if(prefs.auto)speak(text);}};
})();

function detectVideoIntent(text,hasImage){
 const t=text.trim();
 if(/不要|不用|不想|沒有要|沒有想|不是要|別幫|先別|如何|怎麼|為什麼|為何|教我|解釋|分析|討論|提示詞|提示词|能不能|可以嗎|可以吗|\?|？|\b(how|why|explain|don't|do not)\b/i.test(t))return 'chat';
 if(/^(?:(?:請|请)(?:幫我|帮我)?|幫我|帮我|我要你|現在幫我|现在帮我)?\s*(?:生成|製作|制作|產生)(?:一首|一段|一個|一个)?[^。！？\n]{0,30}(?:音樂|音乐|歌曲|配樂|配乐)|^(?:please\s+)?(?:generate|create|make)\s+[^.!?\n]{0,40}\b(?:music|song|soundtrack)\b/i.test(t))return 'music';
 const imageRequest=/^(?:(?:請|请)(?:幫我|帮我)?|幫我|帮我|我要你|現在幫我|现在帮我)?\s*(?:生成|製作|制作|產生|畫|画|繪製|绘制)(?:一張|一张|一幅|一個|一个)?[^。！？\n]{0,30}(?:圖片|图片|圖像|图像|插畫|插画|照片)|^(?:please\s+)?(?:generate|create|make|draw)\s+[^.!?\n]{0,40}\b(?:image|picture|illustration|photo)\b/i.test(t);
 if(imageRequest&&!/(?:影片|視頻|视频|動畫|动画|video|animation)/i.test(t))return hasImage?'image-edit':'text-image';
 const request=/^(?:(?:請|请)(?:幫我|帮我)?|幫我|帮我|我要你|現在幫我|现在帮我)?\s*(?:(?:生成|製作|制作|產生|做)(?:一段|一個|一个|一支|個|个)?[^。！？\n]{0,30}(?:影片|視頻|视频|短片|動畫|动画)|把(?:這張|这张|這個|这个)?(?:圖片|图片|照片)[^。！？\n]{0,10}(?:動起來|动起来|轉成影片|转成视频))|^(?:please\s+)?(?:generate|create|make)\s+[^.!?\n]{0,40}\b(?:video|animation|clip)\b/i.test(t);
 return request?(hasImage?'video':'text-video'):'chat';
}
function resolveCreationMode(){return creationMode.value==='auto'?detectVideoIntent(input.value,Boolean(selectedFile?.type.startsWith('image/'))):creationMode.value;}
const routeHint=document.createElement('small');routeHint.setAttribute('role','status');creationTools.append(routeHint);
function updateRouteHint(){const route=resolveCreationMode();routeHint.textContent=creationMode.value==='auto'?'本次判斷：'+({chat:'一般聊天',video:'圖片生成影片','text-video':'文字生成影片',music:'音樂生成','text-image':'文字生成圖片','image-edit':'圖片編輯'}[route]):'';}
input.addEventListener('input',updateRouteHint);creationMode.addEventListener('change',updateRouteHint);
new MutationObserver(updateRouteHint).observe(filePreview,{childList:true});
creationMode.onchange();updateRouteHint();

document.getElementById('openVideoFolder').onclick=async(event)=>{
 const button=event.currentTarget;button.disabled=true;
 try{await api('/api/open-video-folder',{method:'POST',headers:{'X-Local-Action':'open-video-folder'}});}
 catch(e){addMessage('system','開啟影片資料夾失敗：'+e.message);}
 finally{button.disabled=false;}
};

const resourceButton=document.createElement('button');resourceButton.type='button';resourceButton.textContent='資源監控';resourceButton.onclick=()=>location.href='/resources.html';document.querySelector('.toolbar').append(resourceButton);

function attachGeneratedImage(container,id,generated=false){const img=document.createElement('img');img.src='/api/attachments/'+id+'?preview=1';img.dataset.messageId=id;img.alt='對話圖片';img.loading='lazy';img.style.cssText='display:block;max-width:100%;max-height:560px;object-fit:contain;margin-top:12px;border-radius:12px';container.append(img);if(generated){
 const edit=document.createElement('button');edit.type='button';edit.className='speech-reply-button';edit.textContent='以這張圖繼續編輯';edit.title='將這張生成結果設為圖片 1，取代目前的參考圖';
 edit.onclick=()=>{if(busyUI)return;if((editFiles.length||selectedFile||input.value.trim())&&!confirm('將以這張生成結果取代目前所有參考圖，並清空輸入框，方便輸入新的修改要求。要繼續嗎？'))return;
 const conversation=activeId;
 runAction(async()=>{
  const response=await fetch('/api/attachments/'+id+'?preview=1');if(!response.ok)throw Error('無法讀取圖片，請確認圖片是否仍存在');
  const blob=await response.blob();if(!['image/png','image/jpeg','image/webp'].includes(blob.type))throw Error('此圖片格式不支援繼續編輯');if(blob.size>10*1024*1024)throw Error('這張圖片超過 10 MB，請先下載並縮小後再上傳');if(activeId!==conversation)return;
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[blob.type];editFiles=[new File([blob],'generated-'+id+'.'+ext,{type:blob.type})];renderEditFiles();selectedFile=null;fileInput.value='';renderFilePreview();input.value='';creationMode.value='image-edit';creationMode.onchange();updateRouteHint();videoStatus.textContent='已將生成結果設為圖片 1。請輸入這次要修改的內容；也可再加入其他參考圖。';input.focus();
 });};container.append(edit);attachVideoAnalysis(container,id,true);
 container.classList.add('generated-image-message');
 const actions=document.createElement('div');actions.className='image-result-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','圖片操作');img.after(actions);actions.append(edit);
 const recipe=container.querySelector(':scope > .reuse-recipe');if(recipe)actions.append(recipe);
 // Download links are appended by both history rendering and live completion.
 queueMicrotask(()=>{for(const link of container.querySelectorAll(':scope > a')){if(link.getAttribute('href')==='/api/attachments/'+id){link.classList.add('image-download-action');link.textContent='下載圖片';actions.append(link);}}});
 }}


// Reference uploads for the dedicated image editing mode.
let editFiles=[],editUrls=[];
const editPanel=document.createElement('div');editPanel.hidden=true;editPanel.className='file-preview';
const editChoose=document.createElement('input');editChoose.type='file';editChoose.multiple=true;editChoose.accept='image/png,image/jpeg,image/webp';
const editHelp=document.createElement('p');editHelp.textContent='獨立模式接受一張參考圖片，以 SDXL Turbo 進行圖片轉換。輸出目前為 448 × 448，可能改變構圖與人物，不是 Qwen 的指令式精準編輯。';
const editList=document.createElement('div');editList.style.cssText='display:flex;flex-wrap:wrap;gap:12px';editPanel.append(editHelp,editChoose,editList);creationTools.after(editPanel);
function renderEditFiles(){editUrls.forEach(URL.revokeObjectURL);editUrls=[];editList.replaceChildren();editFiles.forEach((f,i)=>{const item=document.createElement('div'),img=document.createElement('img'),label=document.createElement('div'),remove=document.createElement('button');const url=URL.createObjectURL(f);editUrls.push(url);img.src=url;img.alt='圖片 '+(i+1);img.style.cssText='width:90px;height:90px;object-fit:contain';label.textContent='圖片 '+(i+1)+' · '+f.name;remove.type='button';remove.textContent='移除';remove.onclick=()=>{if(busyUI)return;editFiles.splice(i,1);renderEditFiles();};item.append(img,label,remove);editList.append(item);});}
function addEditFiles(files){if(busyUI)return;if(editFiles.length+files.length>1||files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>10*1024*1024)){addMessage('system','最多一張圖片，檔案限 10 MB，格式為 JPG、PNG 或 WebP。');return;}editFiles.push(...files);renderEditFiles();input.focus();}
editChoose.onchange=()=>{const files=Array.from(editChoose.files);editChoose.value='';addEditFiles(files);};
const previousModeChange=creationMode.onchange;creationMode.onchange=()=>{previousModeChange();const editing=creationMode.value==='image-edit';editPanel.hidden=!editing;document.getElementById('videoSettingsButton').hidden=editing;document.getElementById('openVideoFolder').hidden=editing||creationMode.value==='text-image';if(editing){document.getElementById('videoControls').hidden=false;input.placeholder='例如：保留圖片 1 的人物與背景，換上圖片 2 的衣服';form.querySelector('[type=submit]').textContent='編輯圖片';}};

// Keep the composer tools relevant to the selected task.
creationTools.classList.add('composer-toolbar');
creationTools.firstElementChild.classList.add('composer-mode');
routeHint.classList.add('composer-route');
editPanel.classList.add('composer-references');
editChoose.setAttribute('aria-label','加入參考圖片');
const composerSettings=document.getElementById('videoSettingsButton');
const composerPolish=document.getElementById('polishPrompt');
const composerFolder=document.getElementById('openVideoFolder');
composerPolish.textContent='✦ 整理提示詞';composerFolder.textContent='開啟資料夾';
const settingsDetail=document.createElement('small');settingsDetail.className='composer-settings-detail';document.getElementById('videoControls').append(settingsDetail);
function syncComposerTools(){
 const route=resolveCreationMode(),editing=route==='image-edit',image=route==='text-image',generating=route!=='chat';
 document.getElementById('videoControls').hidden=!generating;
 composerSettings.hidden=!generating||editing||route==='music';composerFolder.hidden=!['video','text-video'].includes(route);
 settingsDetail.hidden=!generating||editing||route==='music';
 if(generating&&!editing&&route!=='music'){const v=getVideoSettings(route);composerSettings.textContent=image?'圖片設定':'影片設定';settingsDetail.textContent=v.ratio.split(' ')[0]+' · '+v.megapixels+' MP'+(image?'':' · '+v.seconds+' 秒');}
 routeHint.textContent=creationMode.value==='auto'?'自動 · '+({chat:'一般聊天',video:'圖生影片','text-video':'文生影片',music:'音樂生成','text-image':'文字生成圖片','image-edit':'圖片編輯'}[route]||'一般聊天'):'';
}
const composerModeChange=creationMode.onchange;creationMode.onchange=()=>{composerModeChange();syncComposerTools();};
input.addEventListener('input',syncComposerTools);
new MutationObserver(syncComposerTools).observe(filePreview,{childList:true});
videoSettingsDialog.addEventListener('close',syncComposerTools);
new MutationObserver(()=>{videoStatus.classList.toggle('is-complete',videoStatus.textContent==='生成結果已儲存在對話中。');}).observe(videoStatus,{childList:true,characterData:true,subtree:true});
syncComposerTools();

const generationProgress=document.createElement('div');generationProgress.className='generation-progress';generationProgress.hidden=true;
const progressLabel=document.createElement('div'),progressBar=document.createElement('progress'),progressNote=document.createElement('small');progressBar.max=100;progressBar.setAttribute('aria-label','目前生成階段進度');progressLabel.setAttribute('role','status');generationProgress.append(progressLabel,progressBar,progressNote);creationTools.before(generationProgress);
function renderGenerationProgress(job){if(!job){generationProgress.hidden=true;return;}generationProgress.hidden=false;progressBar.removeAttribute('value');progressNote.textContent='百分比表示目前採樣階段，不包含載入、解碼與存檔時間。';
 if(job.status==='done'){progressLabel.textContent='最近一筆任務已完成';progressBar.value=100;progressNote.textContent='結果已儲存在對話中。';return;}
 if(job.status==='error'){progressLabel.textContent='生成失敗';progressBar.value=0;progressNote.textContent=job.error||'請查看錯誤訊息後重試。';return;}
 if(job.error){progressLabel.textContent=job.error;return;}
 const p=job.progress;
 if(p&&Number.isFinite(p.value)&&p.max>0){const percent=Math.floor(p.value/p.max*100);progressLabel.textContent=p.stage+' · '+p.value+' / '+p.max+' 步（'+percent+'%）';progressBar.value=percent;}
 else progressLabel.textContent=p?.stage||(job.status==='queued'?'等待 獨立生成引擎 執行':job.status==='submitting'?'正在送出任務':'正在處理，等待步數回報');
}

// MiniMax Music 3: caption in the composer; lyrics and duration kept separate.
const musicPanel=document.createElement('section');musicPanel.className='music-panel';musicPanel.hidden=true;
musicPanel.innerHTML='<label for="musicLyrics">歌詞 <span>選填，可使用 [Verse]、[Chorus] 分段</span></label><textarea id="musicLyrics" rows="4" maxlength="12000" placeholder="在此輸入歌詞；主輸入框描述曲風、情緒與樂器。留白可嘗試純音樂，結果依模型而定。"></textarea><label class="music-duration" for="musicDuration">最長時間 <input id="musicDuration" type="number" min="5" max="360" step="1" value="60"> 秒</label><small>模型可能提前結束。先以短片段測試；AI 整理提示詞只整理音樂風格，不更動歌詞。</small>';
creationTools.after(musicPanel);const musicLyrics=document.getElementById('musicLyrics'),musicDuration=document.getElementById('musicDuration');
const beforeMusicChange=creationMode.onchange;creationMode.onchange=()=>{beforeMusicChange();const music=creationMode.value==='music';musicPanel.hidden=!music;if(music){input.placeholder='描述音樂風格，例如：溫暖的中文抒情歌、柔和女聲、鋼琴與弦樂';form.querySelector('[type=submit]').textContent='生成音樂';}};
function attachMusicPlayer(container,id){attachRecipeButton(container,id);container.classList.add('music-message');const audio=document.createElement('audio');audio.src='/api/audio/'+id;audio.dataset.messageId=id;audio.controls=true;audio.preload='metadata';audio.style.cssText='display:block;width:100%;margin-top:12px';container.append(audio);}


// Generation recipes are restored into an editable draft, never submitted automatically.
let restoredRecipe=null;
const recipeBar=document.createElement('div');recipeBar.className='recipe-bar';
recipeBar.innerHTML='<label>種子 <input type="number" min="0" step="1" placeholder="留白：每次隨機" aria-label="生成種子"></label><span></span><button type="button">清除原始設定</button>';
creationTools.after(recipeBar);
const recipeSeed=recipeBar.querySelector('input'),recipeInfo=recipeBar.querySelector('span');
recipeBar.querySelector('button').onclick=()=>{restoredRecipe=null;recipeSeed.value='';recipeInfo.textContent='下次使用目前工作流程與隨機種子';};
function attachRecipeButton(container,id){
 if(container.querySelector('.reuse-recipe'))return;
 const button=document.createElement('button');button.type='button';button.className='reuse-recipe';button.textContent='帶入這次生成設定';container.append(button);
 button.onclick=()=>runAction(async()=>{
  const conversation=activeId;
  const data=await api('/api/generation-recipes/'+id);
  if((input.value.trim()||editFiles.length||selectedFile||musicLyrics.value)&&!confirm('以這次作品的提示詞、參考圖與設定取代目前草稿？'))return;
  const files=[];
  for(const ref of data.references){const response=await fetch('/api/attachments/'+ref.id+'?preview=1');if(!response.ok)throw Error('參考圖片讀取失敗');const blob=await response.blob();files.push(new File([blob],ref.name,{type:ref.type}));}
  if(activeId!==conversation)throw Error('對話已切換，請重新帶入');
  creationMode.value=data.mode;editFiles=data.mode==='image-edit'?files:[];selectedFile=data.mode==='video'?files[0]:null;fileInput.value='';
  savedVideoSettings[data.mode]={ratio:data.ratio,megapixels:data.megapixels,seconds:data.seconds};
  musicModelSelect.value=data.musicModel||'minimax';syncMusicModel();musicLyrics.value=data.lyrics||'';musicDuration.value=data.duration||60;input.value=data.prompt;
  restoredRecipe={jobId:data.jobId,mode:data.mode};recipeSeed.value=data.seed;recipeInfo.textContent='已帶入原始流程與種子；相同設定仍可能有細微差異';
  renderEditFiles();renderFilePreview();creationMode.onchange();input.focus();videoStatus.textContent='設定與參考圖已恢復；確認後按生成。';
 });
}
function attachTransferButton(container,text){
 const button=document.createElement('button');button.type='button';button.className='transfer-generation';button.textContent='帶入生成…';container.append(button);
 button.onclick=()=>{
  if(busyUI)return;
  const dialog=document.createElement('dialog');dialog.className='appearance-dialog generation-transfer';
  dialog.innerHTML='<h2>將聊天內容帶入生成</h2><label>生成類型<select><option value="music">音樂</option><option value="text-image">文字生成圖片</option><option value="text-video">文字生成影片</option><option value="video">圖片生成影片</option><option value="image-edit">圖片編輯</option></select></label><label>提示詞／音樂風格<textarea rows="6" maxlength="12000"></textarea></label><label class="transfer-lyrics">歌詞<textarea rows="7" maxlength="12000"></textarea></label><p>請刪除聊天說明、檢查歌詞分欄。圖片模式請在帶入後確認參考圖。這個動作不會開始生成。</p><div><button type="button" data-apply>帶入輸入框</button><button type="button" data-cancel>取消</button></div>';
  const mode=dialog.querySelector('select'),areas=dialog.querySelectorAll('textarea');
  // Only split at an explicit lyric heading; preserve original wording for review.
  const split=/(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?(?:歌詞|Lyrics)(?:\*\*)?[：:]?[ \t]*(?:\r?\n)/i.exec(text);
  areas[0].value=(split?text.slice(0,split.index):text).slice(0,12000);areas[1].value=split?text.slice(split.index+split[0].length).slice(0,12000):'';
  mode.onchange=()=>{dialog.querySelector('.transfer-lyrics').hidden=mode.value!=='music';};
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
  dialog.querySelector('[data-apply]').onclick=()=>{
   if(!areas[0].value.trim()){areas[0].focus();return;}
   if(input.value.trim()&&!confirm('取代目前輸入框的草稿？'))return;
   creationMode.value=mode.value;input.value=areas[0].value.trim();if(mode.value==='music')musicLyrics.value=areas[1].value;
   restoredRecipe=null;recipeSeed.value='';recipeInfo.textContent='使用目前工作流程';creationMode.onchange();dialog.close();input.focus();
  };
  document.body.append(dialog);dialog.showModal();
 };
}

// Keep existing button handlers while grouping infrequent actions in native disclosures.
function createHeaderMenu(label){
 const menu=document.createElement('details');menu.className='header-menu';
 const toggle=document.createElement('summary');toggle.textContent=label;
 const content=document.createElement('div');content.className='header-menu-content';
 menu.append(toggle,content);
 menu.addEventListener('toggle',()=>{if(menu.open)document.querySelectorAll('.header-menu').forEach(other=>{if(other!==menu)other.open=false;});});
 content.addEventListener('click',event=>{if(event.target.closest('button'))menu.open=false;});
 return {menu,toggle,content};
}
(()=>{
 const toolbar=document.querySelector('.toolbar');toolbar.classList.add('compact-header-toolbar');
 const {menu,content}=createHeaderMenu('設定');
 for(const button of Array.from(toolbar.querySelectorAll(':scope > button'))){if(['外觀','對話設定','語音'].includes(button.textContent.trim()))content.append(button);}
 toolbar.append(menu);
 const refresh=document.getElementById('refreshModelsBtn');refresh.textContent='↻';refresh.title='重新整理模型清單';refresh.setAttribute('aria-label','重新整理模型清單');
 document.addEventListener('click',event=>document.querySelectorAll('.header-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));
 document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.header-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});});
})();


// An animated drawer stays mounted so drafts, files and settings survive closing.
(()=>{
 const section=document.createElement('section');section.className='composer-drawer';
 const handle=document.createElement('button');handle.type='button';handle.className='composer-drawer-handle';
 const grip=document.createElement('span');grip.className='drawer-grip';grip.setAttribute('aria-hidden','true');
 const title=document.createElement('span');title.textContent='生成設定';
 const overview=document.createElement('span');overview.className='drawer-overview';
 const arrow=document.createElement('span');arrow.className='drawer-arrow';arrow.textContent='⌃';arrow.setAttribute('aria-hidden','true');
 handle.append(grip,title,overview,arrow);
 const track=document.createElement('div');track.className='drawer-track';track.id='composerDrawerContent';
 const clip=document.createElement('div');clip.className='drawer-clip';
 const body=document.createElement('div');body.className='composer-disclosure-body';
 clip.append(body);track.append(clip);section.append(handle,track);form.before(section);form.classList.add('drawer-composer');
 body.append(videoStatus,generationProgress,creationTools,recipeBar,musicPanel,editPanel);
 let open=false;try{open=localStorage.getItem('composer-expanded-v1')==='true';}catch{}
 handle.setAttribute('aria-controls',track.id);
 function update(){
  section.classList.toggle('is-open',open);handle.setAttribute('aria-expanded',String(open));handle.title=open?'收起生成設定':'拉出生成設定';track.inert=!open;
  const mode=creationMode.selectedOptions[0]?.textContent||'自動判斷';const status=generationProgress.hidden?'':progressLabel.textContent;
  overview.textContent=mode+(status?' · '+status:'');overview.title=overview.textContent;
 }
 handle.onclick=()=>{open=!open;update();try{localStorage.setItem('composer-expanded-v1',String(open));}catch{}};
 section.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){open=false;update();handle.focus();try{localStorage.setItem('composer-expanded-v1','false');}catch{}event.stopPropagation();}});
 creationMode.addEventListener('change',update);
 new MutationObserver(update).observe(progressLabel,{childList:true,characterData:true,subtree:true});
 new MutationObserver(update).observe(generationProgress,{attributes:true,attributeFilter:['hidden']});
 const previous=creationMode.onchange;creationMode.onchange=function(...args){const result=previous?.apply(this,args);update();return result;};
 update();
})();

// Upper tools use the same disclosure language as the composer drawer.
(()=>{
 const toolbar=document.querySelector('.toolbar');
 const drawer=document.createElement('section');drawer.className='top-tools-drawer';
 const track=document.createElement('div');track.className='top-tools-track';track.id='topToolsContent';
 const clip=document.createElement('div');clip.className='top-tools-clip';
 const handle=document.createElement('button');handle.type='button';handle.className='top-tools-handle';handle.setAttribute('aria-controls',track.id);
 const grip=document.createElement('span');grip.className='drawer-grip';grip.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.textContent='對話工具';
 const model=document.createElement('span');model.className='drawer-overview';
 const arrow=document.createElement('span');arrow.className='drawer-arrow';arrow.textContent='⌃';arrow.setAttribute('aria-hidden','true');
 handle.append(grip,label,model,arrow);toolbar.before(drawer);clip.append(toolbar);track.append(clip);drawer.append(track,handle);
 let open=true;try{open=localStorage.getItem('chat-tools-expanded-v1')!=='false';}catch{}
 function update(){drawer.classList.toggle('is-open',open);handle.setAttribute('aria-expanded',String(open));handle.title=open?'收合對話工具':'展開對話工具';track.inert=!open;model.textContent=modelSelect.selectedOptions[0]?.textContent||'選擇模型';}
 let settleTimer;
 function settle(){clearTimeout(settleTimer);drawer.classList.remove('drawer-settled');if(open)settleTimer=setTimeout(()=>{if(open)drawer.classList.add('drawer-settled');},460);}
 function toggle(){open=!open;settle();if(!open){if(track.contains(document.activeElement))handle.focus();toolbar.querySelectorAll('details[open]').forEach(el=>el.open=false);}update();try{localStorage.setItem('chat-tools-expanded-v1',String(open));}catch{}}
 handle.onclick=toggle;
 drawer.addEventListener('keydown',event=>{if(event.key==='Escape'&&open&&!event.target.closest('details[open]')){toggle();event.stopPropagation();}});
 modelSelect.addEventListener('change',update);new MutationObserver(update).observe(modelSelect,{childList:true,subtree:true,attributes:true});
 update();settle();
})();

// Reuse existing controls and persistence handlers inside one settings shell.
(()=>{
 const toolbar=document.querySelector('.toolbar');
 const oldMenu=Array.from(toolbar.querySelectorAll('.header-menu')).find(el=>el.querySelector('summary')?.textContent==='設定');
 if(!oldMenu)return;
 const definitions=[['外觀','appearanceTitle','配色、背景與閱讀體驗'],['對話設定','languageTitle','新對話的預設偏好'],['語音','speechTitle','朗讀音色與播放方式']];
 const hub=document.createElement('dialog');hub.className='settings-hub';hub.setAttribute('aria-labelledby','settingsHubTitle');
 hub.innerHTML='<header class="settings-hub-heading"><div><small>你的聊天空間</small><h2 id="settingsHubTitle">設定</h2></div><button type="button" class="settings-hub-close" aria-label="關閉設定">✕</button></header><div class="settings-hub-layout"><nav class="settings-hub-tabs" role="tablist" aria-label="設定類別"></nav><div class="settings-hub-content"></div></div>';
 document.body.append(hub);
 const tabs=hub.querySelector('nav'),content=hub.querySelector('.settings-hub-content');const items=[];
 const trigger=document.createElement('button');trigger.type='button';trigger.textContent='設定';trigger.setAttribute('aria-haspopup','dialog');oldMenu.before(trigger);
 let current=0,closing=false,timer;
 function close(){if(!hub.open||closing)return;closing=true;hub.classList.add('is-closing');timer=setTimeout(()=>{hub.close();hub.classList.remove('is-closing');closing=false;trigger.focus();},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);}
 definitions.forEach(([name,id,description],index)=>{
  const original=Array.from(oldMenu.querySelectorAll('button')).find(b=>b.textContent.trim()===name);
  const panel=document.getElementById(id)?.closest('dialog');if(!original||!panel)return;
  const tab=document.createElement('button');tab.type='button';tab.role='tab';tab.id='settings-tab-'+index;tab.textContent=name;tab.title=description;
  const page=document.createElement('section');page.id='settings-page-'+index;page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby',tab.id);page.hidden=true;tab.setAttribute('aria-controls',page.id);
  panel.classList.add('settings-embedded');panel.setAttribute('open','');panel.setAttribute('role','presentation');page.append(panel);content.append(page);tabs.append(tab);
  panel.showModal=()=>{current=index;items.forEach(item=>{const active=item.index===index;item.page.hidden=!active;item.tab.setAttribute('aria-selected',String(active));item.tab.tabIndex=active?0:-1;});if(!hub.open){hub.showModal();tab.focus();}content.scrollTop=0;};
  panel.close=close;
  tab.onclick=()=>original.click();items.push({index,tab,page,original});
 });
 oldMenu.remove();
 trigger.onclick=()=>{if(closing){clearTimeout(timer);hub.classList.remove('is-closing');closing=false;}items.find(item=>item.index===current)?.original.click();};
 hub.querySelector('.settings-hub-close').onclick=close;
 hub.addEventListener('cancel',event=>{event.preventDefault();close();});
 hub.addEventListener('click',event=>{if(event.target!==hub)return;const rect=hub.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();});
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const i=items.findIndex(item=>item.index===current);const next=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+items.length)%items.length;items[next].tab.click();items[next].tab.focus();});
})();

// Music backend is independent of the conversational language model.
const musicModelLabel=document.createElement('label');musicModelLabel.textContent='音樂生成模型';musicModelLabel.htmlFor='musicModelSelect';
const musicModelSelect=document.createElement('select');musicModelSelect.id='musicModelSelect';musicModelSelect.add(new Option('MiniMax Music 3','minimax'));musicModelSelect.add(new Option('HeartMuLa 3B · 獨立生成','heartmula'));
const musicModelNote=document.createElement('small');musicPanel.prepend(musicModelLabel,musicModelSelect,musicModelNote);
try{musicModelSelect.value='heartmula';}catch{}
function syncMusicModel(){const heart=musicModelSelect.value==='heartmula';musicDuration.min=heart?'10':'5';musicDuration.max=heart?'60':'360';musicDuration.value=Math.max(Number(musicDuration.min),Math.min(Number(musicDuration.max),Number(musicDuration.value)||60));musicModelNote.textContent=heart?'HeartMuLa 獨立生成：10–60 秒；風格用逗號分隔，歌詞填在下方。CPU 解碼可能需要數分鐘。':'MiniMax Music 3：5–360 秒；主輸入框描述音樂風格。';}
musicModelSelect.onchange=()=>{syncMusicModel();if(restoredRecipe?.mode==='music'){restoredRecipe=null;recipeSeed.value='';recipeInfo.textContent='已切換音樂模型，使用該模型目前的工作流程。';}if(musicModelSelect.value==='heartmula'&&Number(recipeSeed.value)>2147483647)recipeSeed.value='';try{localStorage.setItem('music-model-v1',musicModelSelect.value);}catch{}};syncMusicModel();

// Always-visible progress is outside the collapsible settings drawer.
(()=>{
 const strip=document.createElement('section');strip.className='live-generation';strip.hidden=true;strip.setAttribute('aria-label','生成進度');
 const row=document.createElement('div');row.className='live-generation-row';
 const label=document.createElement('span');label.setAttribute('role','status');
 const elapsed=document.createElement('span');elapsed.className='live-generation-time';
 const bar=document.createElement('progress');bar.max=100;bar.setAttribute('aria-label','目前生成階段進度');
 const note=document.createElement('small');row.append(label,elapsed);strip.append(row,bar,note);
 document.querySelector('.composer-drawer').before(strip);
 let current=null,ticker=null,hideTimer=null;
 const original=renderGenerationProgress;
 function clear(){clearInterval(ticker);clearTimeout(hideTimer);ticker=null;hideTimer=null;current=null;strip.hidden=true;}
 function clock(){if(!current)return;const seconds=Math.max(0,Math.floor((Date.now()-current.created)/1000));elapsed.textContent='已等待 '+Math.floor(seconds/60)+' 分 '+String(seconds%60).padStart(2,'0')+' 秒';}
 renderGenerationProgress=function(job){
  original(job);
  if(!job){clear();return;}
  if(job.connectionLost){if(!current)return;label.textContent='連線中斷，正在重新取得進度';bar.removeAttribute('value');note.textContent='目前無法確認任務狀態；不會重複送出生成請求。';return;}
  if(['submitting','queued','running'].includes(job.status)){
   if(current?.id!==job.id){clear();current={id:job.id,created:Number(job.created)||Date.now()};ticker=setInterval(clock,1000);}
   clearTimeout(hideTimer);hideTimer=null;strip.hidden=false;clock();
   const p=job.progress;const measured=!job.error&&Number.isFinite(p?.value)&&Number.isFinite(p?.max)&&p.max>0;
   if(measured){const percent=Math.max(0,Math.min(100,Math.floor(p.value/p.max*100)));bar.value=percent;label.textContent=(p.stage||'生成中')+' · '+percent+'%';note.textContent='百分比為目前採樣階段，等待時間包含排隊、載入與存檔。';}
   else{bar.removeAttribute('value');label.textContent=job.error|| (job.status==='queued'?'排隊中':job.status==='submitting'?'正在送出':'處理中');note.textContent=job.error?'等待連線恢復，不會重複送出任務。':(p?.stage||'模型未提供百分比，正在等待生成結果。');}
   return;
  }
  if(job.status==='done'){
   if(current?.id!==job.id)return;
   if(hideTimer)return;
   clearInterval(ticker);clock();bar.value=100;label.textContent='生成完成';note.textContent='結果已儲存在對話中。';hideTimer=setTimeout(clear,2200);return;
  }
  if(job.status==='error'){
   clearInterval(ticker);clearTimeout(hideTimer);hideTimer=null;current=null;strip.hidden=false;elapsed.textContent='';bar.removeAttribute('value');bar.hidden=true;label.textContent='生成失敗';note.textContent=job.error||'請展開設定查看錯誤後重試。';return;
  }
 };
 // Restore bar after an error when a new job begins.
 const wrapped=renderGenerationProgress;renderGenerationProgress=job=>{bar.hidden=false;wrapped(job);};
 window.addEventListener('pagehide',clear);
})();

// Account-scoped task and media browser; no generation is submitted from this view.
(()=>{
 const launch=document.createElement('button');launch.type='button';launch.textContent='任務與作品';document.querySelector('.toolbar').append(launch);
 const dialog=document.createElement('dialog');dialog.className='appearance-dialog studio-dialog';dialog.setAttribute('aria-label','任務中心與作品庫');
 dialog.innerHTML='<div class="appearance-heading"><h2>任務與作品</h2><button type="button" data-close aria-label="關閉">✕</button></div><div class="studio-controls"><label>檢視 <select data-view><option value="tasks">任務中心</option><option value="library">作品庫</option></select></label><label>類型 <select data-kind><option value="">全部</option><option value="image">圖片</option><option value="video">影片</option><option value="music">音樂</option></select></label><button type="button" data-refresh>重新整理</button></div><p data-status role="status"></p><div class="studio-grid"></div><div class="appearance-footer"><button type="button" data-prev>上一頁</button><span data-page></span><button type="button" data-next>下一頁</button></div>';
 document.body.append(dialog);const grid=dialog.querySelector('.studio-grid'),status=dialog.querySelector('[data-status]'),view=dialog.querySelector('[data-view]'),kind=dialog.querySelector('[data-kind]');let page=0,serial=0;
 const statuses={submitting:'送出中',queued:'排隊中',running:'生成中',done:'已完成',error:'失敗'};
 const modes={'text-image':'文字生成圖片','image-edit':'圖片編輯',video:'圖片生成影片','text-video':'文字生成影片',music:'音樂'};
 function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
 function button(name,fn){const el=text('button',name);el.type='button';el.onclick=fn;return el;}
 async function load(){const ticket=++serial;status.textContent='讀取中…';try{
  const data=await api('/api/studio?'+new URLSearchParams({view:view.value,kind:kind.value,page}));if(ticket!==serial||!dialog.open)return;
  grid.replaceChildren();status.textContent=data.total?'共 '+data.total+' 筆；只顯示自己的生成任務。':'目前沒有符合條件的紀錄。';
  for(const item of data.items){
   const card=document.createElement('article');card.className='studio-card';
   card.append(text('h3',modes[item.mode]||item.mode),text('span',(statuses[item.status]||item.status)+(item.musicModel?' · '+(item.musicModel==='heartmula'?'HeartMuLa':'MiniMax Music 3'):'')));
   const duration=item.finished?Math.max(0,Math.round((item.finished-item.created)/1000)):['running','queued','submitting'].includes(item.status)?Math.max(0,Math.round((Date.now()-item.created)/1000)):null;
   card.append(text('small',new Date(item.created).toLocaleString()+' · '+(duration===null?'舊任務未記錄完成時間':(item.finished?'耗時 ':'已等待 ')+Math.floor(duration/60)+' 分 '+duration%60+' 秒')));
   card.append(text('p','對話：'+item.title));
   if(item.expired_at)card.append(text('p','作品已到期清除'));
   else if(item.expires_at)card.append(text('p','請於 '+new Date(item.expires_at).toLocaleString()+' 前下載；到期後排程清除。'));
   if(item.prompt){const details=document.createElement('details');details.append(text('summary','查看提示詞'),text('p',item.prompt));card.append(details);}
   if(item.error)card.append(text('p',item.error));
   if(item.status==='done'&&!item.expired_at&&item.mime){let media;if(item.mime.startsWith('image/')){media=document.createElement('img');media.src='/api/attachments/'+item.message_id+'?preview=1';media.alt=item.prompt||'生成圖片';media.loading='lazy';}else{media=document.createElement(item.mime.startsWith('audio/')?'audio':'video');media.src='/api/'+(item.mime.startsWith('audio/')?'audio/':'videos/')+item.message_id;media.controls=true;media.preload='none';}card.append(media);const link=text('a','下載原始檔');link.href='/api/attachments/'+item.message_id;card.append(link);}
   card.append(button('開啟原對話',()=>{dialog.close();runAction(()=>openConversation(item.conversation));}));
   if(item.status==='done'&&item.hasRecipe){const holder=document.createElement('div');attachRecipeButton(holder,item.message_id);const reuse=holder.querySelector('button');reuse.addEventListener('click',()=>dialog.close());card.append(holder);}
   if(item.status==='error')card.append(text('small','開啟原對話，確認提示詞與設定後可手動重試。'));
   const info=document.createElement('div');info.className='studio-card-info';
   const preview=document.createElement('div');preview.className='studio-card-preview';
   const actions=document.createElement('div');actions.className='studio-card-actions';
   for(const child of Array.from(card.children)){
    if(['IMG','VIDEO','AUDIO'].includes(child.tagName))preview.append(child);
    else if(['BUTTON','A'].includes(child.tagName)||child.querySelector('.reuse-recipe'))actions.append(child);
    else info.append(child);
   }
   if(!preview.children.length)preview.append(text('span',item.status==='error'?'此次任務沒有產生作品':'等待生成結果'));
   card.append(info,preview,actions);
   grid.append(card);
  }
  dialog.querySelector('[data-page]').textContent=(data.total?page+1:0)+' / '+Math.ceil(data.total/20);dialog.querySelector('[data-prev]').disabled=page===0;dialog.querySelector('[data-next]').disabled=(page+1)*20>=data.total;
 }catch(e){if(ticket===serial)status.textContent='讀取失敗：'+e.message;}}
 launch.onclick=()=>{dialog.showModal();load();};dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-refresh]').onclick=load;
 for(const select of [view,kind])select.onchange=()=>{page=0;load();};dialog.querySelector('[data-prev]').onclick=()=>{page--;load();};dialog.querySelector('[data-next]').onclick=()=>{page++;load();};
 dialog.addEventListener('close',()=>{serial++;grid.querySelectorAll('audio,video').forEach(el=>el.pause());});
})();

// Let longer drafts grow naturally without moving the send button off-screen.
(()=>{
 function resize(){input.style.height='auto';input.style.height=Math.min(180,Math.max(48,input.scrollHeight))+'px';input.style.overflowY=input.scrollHeight>180?'auto':'hidden';}
 input.addEventListener('input',resize);input.addEventListener('focus',resize);
 form.addEventListener('submit',()=>setTimeout(resize,0));window.addEventListener('resize',resize);
 resize();
})();

// Keep the rounded modal shell separate from its scrollable content.
(()=>{
 const dialog=document.querySelector('.studio-dialog');if(!dialog)return;
 const header=dialog.querySelector('.appearance-heading');
 const footer=dialog.querySelector('.appearance-footer');
 const scroll=document.createElement('div');scroll.className='studio-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','任務與作品清單');
 for(const child of Array.from(dialog.children)){if(child!==header&&child!==footer)scroll.append(child);}
 header.after(scroll);if(footer)dialog.append(footer);
 const nativeClose=dialog.close.bind(dialog),nativeShow=dialog.showModal.bind(dialog);let closing=false,timer;
 dialog.close=function(value){
  if(!dialog.open||closing)return;closing=true;
  dialog.classList.add('studio-closing');dialog.querySelectorAll('audio,video').forEach(el=>el.pause());
  timer=setTimeout(()=>{nativeClose(value);dialog.classList.remove('studio-closing');closing=false;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);
 };
 dialog.showModal=function(){clearTimeout(timer);closing=false;dialog.classList.remove('studio-closing');if(!dialog.open)nativeShow();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
})();

// Explicit capability labels: never silently fall back to ComfyUI.
(async()=>{try{const d=await api('/api/generation-engine');window.nativeGeneration=d;
 if(d.musicModels?.includes('heartmula')){musicModelSelect.value='heartmula';musicDuration.value=10;for(const option of musicModelSelect.options)if(option.value!=='heartmula'){option.disabled=true;option.textContent+='（尚未獨立化）';}syncMusicModel();}
 const note=document.createElement('p');note.className='appearance-description';note.id='generationEngineNote';note.textContent='獨立生成 · SDXL Turbo 圖片／HeartMuLa 音樂。音樂 10–60 秒，CPU 解碼可能需要數分鐘；影片尚未接入。';videoStatus.before(note);
 for(const option of creationMode.options){if(!['auto','chat',...d.modes].includes(option.value)){option.disabled=true;option.textContent+='（尚未獨立化）';}if(option.value==='image-edit')option.textContent='單張圖片轉換（SDXL Turbo）';if(option.value==='text-image')option.textContent='文字生成圖片（SDXL Turbo）';}
}catch(e){videoStatus.textContent='獨立生成引擎未就緒：'+e.message;}})();

(()=>{const button=document.createElement('button');button.type='button';button.textContent='本機模型';button.onclick=()=>runAction(async()=>{const d=await api('/api/local-models');const dialog=document.createElement('dialog');dialog.className='appearance-dialog';const title=document.createElement('h2');title.textContent='專案模型清單';dialog.append(title);for(const m of d.models){const card=document.createElement('p');card.textContent=m.label+' · '+m.kind+' · '+(m.bytes/1073741824).toFixed(2)+' GB · '+(m.ready?'已安裝':'缺少檔案');const detail=document.createElement('small');detail.textContent=m.file;card.append(document.createElement('br'),detail);dialog.append(card);}const note=document.createElement('p');note.textContent='尚待獨立化：'+d.pending.join('、')+'。目前不會自動下載其他大型模型。';const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(note,close);document.body.append(dialog);dialog.showModal();});document.querySelector('.toolbar').append(button);})();

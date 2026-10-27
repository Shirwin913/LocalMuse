(()=>{
 const tools=document.querySelector('.webcam-tools'),dialog=document.querySelector('.robot-dialog'),entry=tools?.querySelector('.robot-entry'),preview=document.querySelector('.webcam-popover');if(!tools||!dialog||!entry||!preview)return;
 const newChat=document.getElementById('clearBtn');entry.textContent='面對面';entry.setAttribute('aria-haspopup','dialog');entry.title='語音對話、攝影機與視線追蹤';if(newChat)newChat.after(entry);else document.querySelector('.toolbar').append(entry);
 const group=document.createElement('section');group.className='face-camera';group.setAttribute('aria-label','攝影機設定');const title=document.createElement('h3');title.textContent='攝影機與畫面';group.append(title);
 const controls=document.getElementById('robotCamera').parentElement;group.append(controls,document.getElementById('robotTracking'));
 const details=document.createElement('details');details.className='face-camera-details';const summary=document.createElement('summary');summary.textContent='攝影機裝置與預覽';details.append(summary,preview);group.append(details);dialog.querySelector('.robot-body').append(group);
 // Retain original camera controller elements for its lifecycle, but expose one camera control.
 tools.hidden=true;tools.style.display='none';dialog.append(tools);
 document.getElementById('webcamPreview').style.display='none';document.getElementById('webcamHide').style.display='none';preview.querySelector('header').hidden=true;
 preview.querySelector('.webcam-model').hidden=true;preview.querySelector('.webcam-model').style.display='none';document.getElementById('webcamAuto').checked=false;
 const note=preview.querySelector('.webcam-model + p');if(note)note.textContent='選擇攝影機後，按「開啟攝影機」啟動。勾選「這次附上畫面」才會把單張照片送給本機模型。關閉面對面視窗會停止攝影機。';
 const button=document.getElementById('robotCamera');function sync(){if(!window.chatCamera.live()&&button.textContent!=='開啟攝影機')button.textContent='開啟攝影機';}new MutationObserver(sync).observe(button,{childList:true});
 const device=document.getElementById('webcamDevice');device.onchange=async()=>{if(!window.chatCamera.live())return;button.click();await button.onclick();};
 sync();
})();
(()=>{
 const dialog=document.querySelector('.robot-dialog');if(!dialog)return;const $=id=>dialog.querySelector('#'+id);
 function fold(title,nodes){const box=document.createElement('details');box.className='face-fold';const summary=document.createElement('summary');const heading=document.createElement('span');heading.textContent=title;const hint=document.createElement('small');summary.append(heading,hint);const body=document.createElement('div');body.className='face-fold-body';box.append(summary,body);nodes[0].before(box);nodes.forEach(n=>body.append(n));return {box,hint};}
 const mic=fold('收音與辨識設定',[$('robotMicDevice').closest('.robot-camera-controls'),$('robotMicHint')]);
 const text=fold('辨識文字與手動編輯',[dialog.querySelector('label[for="robotText"]'),$('robotText')]);text.hint.textContent='需要修改時展開';
 $('robotMic').addEventListener('pointerdown',()=>text.box.open=true);
 const camera=dialog.querySelector('.face-camera');if(camera){const title=camera.querySelector('h3');title.remove();const section=fold('攝影機與畫面',[camera]);section.box.classList.add('face-camera-fold');function status(){section.hint.textContent=window.chatCamera?.live()?'已開啟 · 收合仍持續運作':'未開啟';}new MutationObserver(status).observe($('robotCamera'),{childList:true});status();}
 function update(){const selected=id=>$(id).selectedOptions[0]?.textContent||'';mic.hint.textContent=selected('robotQuality')+' · 停頓 '+selected('robotPause');}['robotQuality','robotPause'].forEach(id=>$(id).addEventListener('change',update));update();
})();

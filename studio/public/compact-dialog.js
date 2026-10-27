(()=>{
 const d=document.querySelector('.robot-dialog'),body=d?.querySelector('.robot-body');if(!body)return;
 const settings=document.createElement('details');settings.className='compact-dialog-settings';const title=document.createElement('summary');title.innerHTML='<span>對話設定</span><small>外觀 · 收音 · 文字 · 攝影機</small>';const inside=document.createElement('div');inside.className='compact-dialog-inner';settings.append(title,inside);
 const sections=[...body.children].filter(n=>n.matches('details.face-fold,details.avatar-settings'));for(const section of sections)inside.append(section);
 const notes=[...body.children].filter(n=>n.matches('.robot-note'));for(const note of notes)inside.append(note);
 body.append(settings);
 const edit=document.createElement('button');edit.type='button';edit.textContent='編輯文字';edit.className='compact-edit';edit.onclick=()=>{settings.open=true;const box=d.querySelector('#robotText').closest('details');if(box)box.open=true;d.querySelector('#robotText').focus();};
 const actions=d.querySelector('.robot-actions');const send=d.querySelector('#robotSend');send.before(edit);const textBox=d.querySelector('#robotText').closest('.face-fold-body');if(textBox)textBox.append(send);
 d.querySelector('#robotMic').addEventListener('pointerdown',()=>{settings.open=true;});
 const status=document.createElement('small');status.className='compact-camera-status';status.setAttribute('role','status');title.append(status);const camera=d.querySelector('#robotCamera');function update(){status.textContent=window.chatCamera?.live()?'攝影機開啟中':'';}new MutationObserver(update).observe(camera,{childList:true});update();
})();
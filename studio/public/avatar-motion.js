(()=>{
const dialog=document.querySelector('.robot-dialog');if(!dialog)return;
const panel=document.createElement('details');panel.className='face-fold avatar-motion';panel.innerHTML='<summary><span>角色動作</span><small class="motion-status" role="status">等待角色載入</small></summary><div class="avatar-options"><button type="button" data-act="wave">揮手</button><button type="button" data-act="nod">點頭</button><button type="button" data-act="shake">搖頭</button><button type="button" data-act="dance">開心律動</button><button type="button" data-act="stop">停止動作</button><label><input type="checkbox" class="motion-idle" checked>自然待機（隨機張望、伸展、小動作）</label><label>幅度<select class="motion-level"><option value="soft">輕微</option><option value="lively">活潑</option></select></label></div>';
(dialog.querySelector('.compact-dialog-inner')||dialog.querySelector('.robot-body')).append(panel);const status=panel.querySelector('.motion-status'),idle=panel.querySelector('.motion-idle'),level=panel.querySelector('.motion-level');let bound=null,action=null,elapsed=0,time=0,blinkAt=2+Math.random()*3,blinkTime=-1;
try{const saved=JSON.parse(localStorage.getItem('avatar-motion-v1'));if(saved){idle.checked=saved.idle!==false;level.value=saved.level==='lively'?'lively':'soft';}}catch{}
const clearanceLabel=document.createElement('label');clearanceLabel.textContent='手臂離身距離 ';
const clearance=document.createElement('input');clearance.type='range';clearance.min='0';clearance.max='35';clearance.step='1';clearance.value='0';clearance.setAttribute('aria-label','手臂離身距離');
const clearanceValue=document.createElement('span');clearanceLabel.append(clearance,clearanceValue);panel.querySelector('.avatar-options').append(clearanceLabel);
function loadClearance(vrm){
 const name=String(vrm?.meta?.name||vrm?.meta?.title||'');
 let value=/鲸|鯨|肥鱼|肥魚|deepseek/i.test(name)?18:0;
 try{const saved=localStorage.getItem('avatar-arm-clearance:'+dialog.dataset.avatar);if(saved!==null&&Number.isFinite(Number(saved)))value=Math.max(0,Math.min(35,Number(saved)));}catch{}
 clearance.value=String(value);clearanceValue.textContent=value+'°';
}
clearance.oninput=()=>{clearanceValue.textContent=clearance.value+'°';try{localStorage.setItem('avatar-arm-clearance:'+dialog.dataset.avatar,clearance.value);}catch{}};
function prefs(){try{localStorage.setItem('avatar-motion-v1',JSON.stringify({idle:idle.checked,level:level.value}))}catch{}}idle.onchange=level.onchange=prefs;
const names=['hips','spine','chest','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','rightHand','leftHand'];
function available(){const selected=dialog.dataset.avatar==='vrm-vivi'||dialog.dataset.avatar?.startsWith('custom:');panel.hidden=!selected;panel.querySelectorAll('[data-act]').forEach(b=>{b.disabled=!bound||(b.dataset.act==='wave'&&(!bound.bones.rightUpperArm||!bound.bones.rightLowerArm||!bound.bones.rightHand))||(b.dataset.act==='dance'&&!bound.bones.spine);});}
let idleAction=null,idleElapsed=0,idleWait=28+Math.random()*22,idleFade=1,lastIdle=null;
function resetIdle(){idleAction=null;idleElapsed=0;idleFade=1;idleWait=28+Math.random()*22;}
let thinkingWeight=0,listeningWeight=0,replyGesture=null,gestureTime=0,gestureWeight=0,previousPose={};
function stop(){replyGesture=null;gestureTime=0;gestureWeight=0;action=null;elapsed=0;resetIdle();if(bound)status.textContent='待機';}
panel.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{if(b.dataset.act==='stop'){stop();return}resetIdle();action=b.dataset.act;elapsed=0;status.textContent=b.textContent+'中';});
new MutationObserver(available).observe(dialog,{attributes:true,attributeFilter:['data-avatar']});
window.avatarMotion={react(text){
 // Only explicit opening agreement/disagreement triggers a response gesture.
 const opening=String(text||'').trim().replace(/^[「『“"\s]+/,'');
 replyGesture=/^(我不同意|我不贊成|不可以|不是這樣|並不是|不對)(?:[，。！!、\s]|$)/.test(opening)?'shake':/^(我同意|我贊成|沒錯|你說得對|是的|對的|可以)(?:[，。！!、\s]|$)/.test(opening)?'nod':null;
 gestureTime=0;gestureWeight=0;
},bind(vrm){bound=null;previousPose={};thinkingWeight=0;listeningWeight=0;stop();if(vrm){const bones={},base={};for(const name of names){const bone=vrm.humanoid.getNormalizedBoneNode(name);if(bone){bones[name]=bone;base[name]=bone.quaternion.clone();}}bound={vrm,bones,base};loadClearance(vrm);status.textContent='待機';}else status.textContent='等待角色載入';available();},reset(){if(bound)for(const name of Object.keys(bound.bones))bound.bones[name].quaternion.copy(bound.base[name]);},stop,
update(dt,state,tracking,reduced){if(!bound)return;dt=Math.max(0,Math.min(.1,dt));time+=dt;const add=(n,x=0,y=0,z=0)=>{const b=bound.bones[n];if(b){b.rotation.x+=x;b.rotation.y+=y;const side=n.startsWith('left')?'left':n.startsWith('right')?'right':null;const direction=side&&/(Arm|Hand)$/.test(n)?(bound.vrm.userData?.armDirection?.[side]||1):1;b.rotation.z+=z*direction;}};const a=level.value==='lively'?1.15:.8;
// Relax the elbows and wrists rather than holding both arms perfectly straight.
const relaxed=action?0:1;
const gap=Number(clearance.value)*Math.PI/180;
// Outward offset uses the per-avatar lowering direction; manual gestures retain their original pose.
add('leftUpperArm',-.02*relaxed,0,(.12-gap)*relaxed);add('rightUpperArm',-.015*relaxed,0,(-.11+gap)*relaxed);
add('leftLowerArm',0,0,-.045*relaxed);add('rightLowerArm',0,0,.05*relaxed);
// Keep the imported wrist alignment; avoid independently twisting the hands.
const easing=1-Math.exp(-dt*2.2);
const automatic=idle.checked&&!reduced&&!action;
thinkingWeight+=((automatic&&state==='thinking'?1:0)-thinkingWeight)*easing;
listeningWeight+=((automatic&&state==='listening'?1:0)-listeningWeight)*easing;
const ponder=thinkingWeight*(.7+.3*Math.sin(time*.65));
add('chest',.01*listeningWeight-.008*ponder);
if(!tracking){add('head',.045*ponder-.025*listeningWeight,.045*Math.sin(time*.55)*ponder,.055*ponder+.045*listeningWeight);}
if(replyGesture){
 if(state==='speaking'&&automatic&&!tracking){gestureTime+=dt;gestureWeight+=(1-gestureWeight)*easing;}
 else if(gestureTime>0){gestureWeight+=(0-gestureWeight)*easing;gestureTime+=dt;}
 const envelope=Math.sin(Math.min(1,gestureTime/1.8)*Math.PI)*gestureWeight;
 if(!tracking){if(replyGesture==='nod')add('head',Math.sin(gestureTime*7)*.085*envelope);else add('head',0,Math.sin(gestureTime*7)*.12*envelope);}
 if(gestureTime>=1.8||['idle','listening','error'].includes(state))replyGesture=null;
}
if(idle.checked&&!reduced){add('chest',Math.sin(time*1.6)*.012*a);add('spine',0,Math.sin(time*.65)*.012*a,Math.sin(time*.8)*.018*a);// Arms follow torso movement without a separate metronomic swing.
if(!tracking&&state!=='listening')add('head',Math.sin(time*.6)*.025*a,Math.sin(time*.4)*.04*a);if(state==='speaking'&&!action)add('head',Math.sin(time*2.6)*.018);}
// Ambient gestures only start while idle. Speech and camera tracking fade them out.
const canIdle=idle.checked&&!reduced&&!tracking&&!action&&state==='idle';
if(!idleAction){
 if(canIdle){idleWait-=dt;if(idleWait<=0){
  const choices=['look','stretch','playful'].filter(n=>n!==lastIdle&&(n!=='stretch'||(bound.bones.leftUpperArm&&bound.bones.rightUpperArm)));
  idleAction=choices[Math.floor(Math.random()*choices.length)];lastIdle=idleAction;idleElapsed=0;idleFade=1;
  status.textContent={look:'四處張望',stretch:'輕輕伸展',playful:'俏皮歪頭'}[idleAction];
 }}else idleWait=28+Math.random()*22;
}
if(idleAction){
 idleElapsed+=dt;
 if(!canIdle)idleFade=Math.max(0,idleFade-dt/.35);
 const duration=idleAction==='stretch'?7:6;
 const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 const weight=smooth(idleElapsed/1.4)*(1-smooth((idleElapsed-duration+1.6)/1.6))*idleFade;
 const strength=level.value==='lively'?.75:.5;
 const w=weight*strength;
 if(idleAction==='look'){
  add('head',-.025*w,Math.sin(idleElapsed*1.35)*.24*w,Math.sin(idleElapsed*.9)*.025*w);
  add('chest',0,Math.sin(idleElapsed*1.35)*.035*w);
 }
 if(idleAction==='stretch'){
  add('chest',-.045*w);add('spine',-.025*w,0,Math.sin(idleElapsed*.9)*.035*w);
  add('leftUpperArm',-.025*w,0,-.10*w);add('rightUpperArm',-.02*w,0,.08*w);
  add('leftLowerArm',0,0,-.025*w);add('rightLowerArm',0,0,.02*w);
  add('head',-.045*w);
 }
 if(idleAction==='playful'){
  add('head',-.035*w,Math.sin(idleElapsed)*.06*w,Math.sin(idleElapsed*1.3)*.12*w);
  add('spine',0,0,-Math.sin(idleElapsed*1.3)*.04*w);
  // Playfulness is expressed through the head and torso, not swinging hands.
 }
 if(idleElapsed>=duration||idleFade<=0){resetIdle();if(!action)status.textContent='待機';}
}
if(action){elapsed+=dt;const duration=action==='dance'?6:action==='wave'?3.5:2.2;const fade=Math.min(1,elapsed/.35,(duration-elapsed)/.4);const w=Math.max(0,fade)*(reduced?.3:1);if(action==='wave'){
 const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 const lift=smooth(elapsed/.65)*(1-smooth((elapsed-2.65)/.85));
 const waveGate=smooth((elapsed-.65)/.25)*(1-smooth((elapsed-2.35)/.3));
 const sway=Math.sin(Math.max(0,elapsed-.65)*Math.PI*3)*.18*waveGate;
 const strength=reduced?.45:1;
 // Lift first, bend the elbow upward, then make a small greeting motion.
 add('rightUpperArm',-.12*lift*strength,0,.8*lift*strength);
 add('rightLowerArm',0,0,(1.55*lift+sway*.35)*strength);
 // Twist around the forearm/hand axis so the palm faces forward.
 const hand=bound.bones.rightHand;
 if(hand){hand.rotation.z+=sway*strength;hand.rotateX(Math.PI/2*lift);}
}if(action==='nod')add('head',Math.sin(elapsed*7)*.18*w);if(action==='shake')add('head',0,Math.sin(elapsed*7)*.23*w);if(action==='dance'){add('spine',0,Math.sin(elapsed*3)*.1*w,Math.sin(elapsed*4)*.08*w);add('leftUpperArm',Math.sin(elapsed*4)*.18*w,0,-.28*w);add('rightUpperArm',-Math.sin(elapsed*4)*.18*w,0,.28*w);add('leftLowerArm',0,.35*w);add('rightLowerArm',0,-.35*w);add('head',0,0,-Math.sin(elapsed*4)*.04*w);}if(elapsed>=duration)stop();}
// Smooth body transitions, including when manual gestures interrupt a pose.
for(const [name,bone] of Object.entries(bound.bones)){
 if(name==='head')continue;
 const target=bone.quaternion.clone();
 if(previousPose[name]&&bone.quaternion.slerp){bone.quaternion.copy(previousPose[name]);const rate=action?10:/Hand$/.test(name)?2.8:/LowerArm$/.test(name)?3.6:/UpperArm$/.test(name)?4.5:5.5;bone.quaternion.slerp(target,1-Math.exp(-dt*rate));}
 previousPose[name]=bone.quaternion.clone();
}
if(time>=blinkAt&&blinkTime<0){blinkTime=0;blinkAt=time+2.5+Math.random()*4;}let blink=0;if(blinkTime>=0){blinkTime+=dt;blink=Math.sin(Math.min(1,blinkTime/.18)*Math.PI);if(blinkTime>=.18)blinkTime=-1;}bound.vrm.expressionManager?.setValue('blink',reduced?0:blink);
}};available();
})();
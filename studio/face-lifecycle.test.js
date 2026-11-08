const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {acquire}=require('./public/media-access');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const file of ['robot-stt-worker.js','kokoro-worker.js']){
 test(file+': abort running work kills child and queued work continues',async()=>{
  const children=[];
  const spawn=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.killed=false;child.kill=()=>{child.killed=true;child.emit('exit',null);};children.push(child);return child;};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),{module,require:name=>name==='child_process'?{spawn}:require(name),Buffer,setTimeout,clearTimeout,global:{process},Error});
  const run=module.exports('python','worker','small'),controller=new AbortController();
  const first=run(Buffer.from('first'),false,controller.signal);const rejected=assert.rejects(first,/已停止/);
  const second=run(Buffer.from('second'),false,new AbortController().signal);
  controller.abort();await rejected;assert.equal(children[0].killed,true);assert.equal(children.length,2);
  children[1].stdout.write(JSON.stringify({id:2,text:'next result'})+'\n');
  assert.equal((await second).text,'next result');
 });
}
test('permission timeout stops a stream that arrives late',async()=>{
 let finish,stopped=0;const devices={getUserMedia:()=>new Promise(resolve=>finish=resolve)};
 await assert.rejects(acquire({audio:true},{mediaDevices:devices,timeoutMs:10}),{name:'TimeoutError'});
 finish({getTracks:()=>[{stop:()=>stopped++}]});await tick();assert.equal(stopped,1);
});
test('closing aborts pending device acquisition and stops late tracks',async()=>{
 let finish,stopped=0;const controller=new AbortController();const pending=acquire({video:true},{signal:controller.signal,mediaDevices:{getUserMedia:()=>new Promise(resolve=>finish=resolve)}});
 await tick();controller.abort();await assert.rejects(pending,{name:'AbortError'});
 finish({getTracks:()=>[{stop:()=>stopped++}]});await tick();assert.equal(stopped,1);
});
test('successful acquisition returns the original stream',async()=>{
 const stream={getTracks:()=>[]};assert.equal(await acquire({audio:true},{mediaDevices:{getUserMedia:async()=>stream}}),stream);
});

for(const modelsOk of [true,false]){
 test('camera preview survives tracking/model-list failure (models '+modelsOk+')',async()=>{
  const elements=new Map();let stopped=0;
  const element=()=>({style:{setProperty(){},removeProperty(){}},options:[],value:'',textContent:'',hidden:false,disabled:false,open:true,
   append(){},setAttribute(){},addEventListener(){},closest(){return this;},replaceChildren(...items){this.options=items;},play:async()=>{}});
  const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);};
  const dialog=element();dialog.querySelector=get;dialog.setAttribute=()=>{};
  const stream={getTracks:()=>[{addEventListener(){},stop(){stopped++;}}]};
  const document={createElement:tag=>tag==='dialog'?dialog:element(),querySelector:get,body:{append(){}},addEventListener(){}};
  const window={speechSynthesis:{getVoices:()=>[],addEventListener(){}},addEventListener(){},chatCamera:{acquireStream:async()=>stream,getStream:()=>stream,stop:()=>stopped++}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'public/robot.js'),'utf8'),{document,window,navigator:{mediaDevices:{addEventListener(){}}},localStorage:{getItem(){return null;},setItem(){}},Option:function(label,value){this.textContent=label;this.value=value;},fetch:async()=>({ok:modelsOk,json:async()=>({models:[{name:'vision'}]})}),AbortController,setTimeout,clearTimeout,setInterval,clearInterval,console});
  await get('#robotCamera').onclick();
  assert.equal(stopped,0);assert.equal(get('#robotVideo').srcObject,stream);assert.equal(get('#robotVideo').hidden,false);
  assert.match(get('#robotTracking').textContent,/攝影機預覽可用/);
  assert.equal(get('#robotCamera').disabled,false);assert.equal(get('#robotAttach').disabled,!modelsOk);
  await get('#robotCamera').onclick();assert.equal(stopped,1);assert.equal(get('#robotVideo').srcObject,null);assert.equal(get('#robotAttach').disabled,true);
 });
}

test('snapshot context excludes unrelated history while voice-only keeps recent turns',()=>{
 const context=require('./robot-context'),history=[{role:'user',content:'old question'},{role:'assistant',content:'unrelated answer'}];
 assert.deepEqual(context(history,true),[]);assert.deepEqual(context(history,false),history);
 assert.equal(history.length,2);assert.equal(context(Array(12).fill({role:'user',content:'x'.repeat(3000)}),false).length,10);
 assert.equal(context(history.concat({role:'user',content:'x'.repeat(3000)}),false).at(-1).content.length,2500);
});

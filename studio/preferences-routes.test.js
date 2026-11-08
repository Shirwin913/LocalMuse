const test=require('node:test'),assert=require('node:assert');
const {DatabaseSync}=require('node:sqlite');
const routes=require('./preferences-routes');
function setup(){
 const handlers={},app={get:(p,h)=>handlers['GET '+p]=h,put:(p,h)=>handlers['PUT '+p]=h};
 routes(app,new DatabaseSync(':memory:'));
 const call=(method,body,user='me')=>{let status=200,payload;handlers[method+' /api/preferences']({user:{id:user},body},{status(code){status=code;return this;},json(v){payload=v;}});return {status,payload};};
 return call;
}
test('saved preferences come back on another browser',()=>{
 const call=setup();
 call('PUT',{items:{'chat-appearance-v1':{value:'{"theme":"forest"}',updated:1000}}});
 assert.deepEqual(call('GET').payload.items['chat-appearance-v1'],{value:'{"theme":"forest"}',updated:1000});
});
test('an older change never overwrites a newer one',()=>{
 const call=setup();
 call('PUT',{items:{'chat-speech-v1':{value:'new',updated:2000}}});
 call('PUT',{items:{'chat-speech-v1':{value:'old',updated:1000}}});
 assert.equal(call('GET').payload.items['chat-speech-v1'].value,'new');
});
test('device-specific and unknown keys are ignored',()=>{
 const call=setup();
 const result=call('PUT',{items:{'robot-mic-device':{value:'usb',updated:1},'evil':{value:'x',updated:1},'robot-pause':{value:'1.2',updated:1}}});
 assert.deepEqual(result.payload.accepted,['robot-pause']);
 assert.deepEqual(Object.keys(call('GET').payload.items),['robot-pause']);
});
test('oversized or malformed values are rejected',()=>{
 const call=setup();
 assert.equal(call('PUT',{items:[]}).status,400);
 assert.deepEqual(call('PUT',{items:{'chat-appearance-v1':{value:'x'.repeat(70000),updated:1}}}).payload.accepted,[]);
});
test('preferences are kept per user',()=>{
 const call=setup();
 call('PUT',{items:{'music-model-v1':{value:'heartmula',updated:5}}},'a');
 assert.deepEqual(call('GET',undefined,'b').payload.items,{});
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {imagePrompt}=require('./image-prompt');
test('English prompts stay unchanged without loading a language model',async()=>{
 assert.equal(await imagePrompt('a cute cat','unused',()=>{throw Error('must not fetch');}),'a cute cat');
});
test('Chinese request is translated locally and original text is sent intact',async()=>{
 const original='一隻可愛的貓咪，用日式漫畫風格';
 const result=await imagePrompt(original,'http://127.0.0.1:8788',async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:8788/api/chat');
  const request=JSON.parse(options.body);assert.ok(request.messages[1].content.includes(original));assert.equal(request.keep_alive,0);
  return {ok:true,json:async()=>({message:{content:'A cute cat, Japanese manga style.'}})};
 });
 assert.equal(result,'A cute cat, Japanese manga style.');
});
test('Translation failure stops generation instead of passing unsupported text silently',async()=>{
 await assert.rejects(imagePrompt('貓','local',async()=>({ok:false,status:500,json:async()=>({error:'offline'})})),/翻譯失敗/);
 await assert.rejects(imagePrompt('貓','local',async()=>({ok:true,json:async()=>({message:{content:''}})})),/有效英文/);
});

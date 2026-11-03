// Translate locally before loading SDXL; keep the user's wording in the recipe.
const hasHan=text=>/\p{Script=Han}/u.test(text);
async function imagePrompt(text,bridge,fetcher=fetch){
 if(!hasHan(text))return text;
 const response=await fetcher(bridge+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(600000),body:JSON.stringify({model:'qwen2.5:7b',stream:false,keep_alive:0,options:{temperature:0,num_predict:512},messages:[{role:'system',content:'You are a Chinese-to-English translator. Return only an English translation. Preserve the subject, count, actions and art style. Never add scenery or decorative text.'},{role:'user',content:'Translate the following image description into ENGLISH. Respond in English only, no explanations. Example: 一隻狗，水彩風格 -> A dog, watercolor style.\nDescription:\n'+text+'\nEnglish translation:'}]})});
 const data=await response.json();
 if(!response.ok)throw Error('圖片提示詞翻譯失敗：'+(data.error||response.status));
 const translated=String(data.message?.content||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim();
 if(!translated||translated.length>12000||!/[A-Za-z]/.test(translated))throw Error('圖片提示詞翻譯未得到有效英文，請重試或直接輸入英文');
 return translated;
}
module.exports={imagePrompt,hasHan};

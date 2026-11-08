const test=require('node:test'),assert=require('node:assert');
const {detectCreationIntent:d,suggestCreationIntent:s}=require('./public/intent.js');
const cases=[
 ['幫我畫一隻穿雨衣的貓','text-image'],['畫一張夕陽海邊的風景','text-image'],['可以幫我畫一隻柴犬嗎？','text-image'],['做一張海報','text-image'],
 ['生成一張賽博龐克城市的圖片','text-image'],['draw a cat in a raincoat','text-image'],['make a poster for a coffee shop','text-image'],
 ['生成一首輕鬆的鋼琴音樂','music'],['我想要一段 10 秒的背景音樂','music'],['做一首歌，關於友情','music'],['來一段輕快的 bgm','music'],['make a relaxing lo-fi song','music'],
 ['幫我做一段貓咪跳舞的影片','text-video'],['生成一支海浪的短片','text-video'],['create a short video of a paper boat','text-video'],
 ['寫一首關於秋天的詩','chat'],['今天天氣如何','chat'],['翻譯這段英文','chat'],['怎麼畫一隻貓？','chat'],['不要畫圖，幫我整理重點','chat'],
 ['推薦幾首適合讀書的歌','chat'],['這張圖片是什麼？','chat'],['畫面有點模糊怎麼辦','chat'],['幫我分析這段程式碼','chat'],['什麼是 LoRA','chat'],
];
test('auto mode recognises everyday wording',()=>{for(const [text,want] of cases)assert.equal(d(text,false),want,text);});
test('attached image changes the target',()=>{
 assert.equal(d('把這張圖變成動畫',true),'video');assert.equal(d('讓這張照片動起來',true),'video');
 assert.equal(d('幫我把這張照片改成卡通風格',true),'image-edit');assert.equal(d('畫成水彩風格',true),'image-edit');
 assert.equal(d('這張圖片是什麼？',true),'chat');assert.equal(d('描述這張照片',true),'chat');
});
test('ambiguous requests only get a suggestion',()=>{
 assert.equal(s('寫一首關於友情的歌',false),'music');assert.equal(d('我想要一張海邊的桌布',false),'text-image');assert.equal(s('海邊夕陽的桌布',false),'text-image');
 assert.equal(s('今天天氣如何',false),null);assert.equal(s('怎麼做影片？',false),null);assert.equal(s('畫面有點模糊',false),null);
 assert.equal(s('幫我畫一隻貓',false),null); // already detected, no suggestion needed
});

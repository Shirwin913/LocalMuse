// Decides whether a message in "自動" mode is a chat message or a generation request.
// Loaded before app.js; app.js's detectVideoIntent delegates here. Also usable from Node tests.
(function(root){
 const LEAD=/^(?:\s|請|请|麻煩|麻烦|可以|可不可以|能不能|能否|能|幫我|帮我|幫忙|帮忙|替我|給我|给我|我想要|我想|我要|想要|你|現在|现在|再|來|来|試著|试着|please|can you|could you|i want to|i'd like to|i want|help me)+/i;
 const TAIL=/(?:嗎|吗|好嗎|好吗|好不好|吧|呢|啦|喔|哦|謝謝|谢谢|thanks|please|[\s?？!！。.~～])+$/i;
 const ASKING=/不要|不用|不想|別|别|先不要|如何|怎麼|怎么|為什麼|为什么|為何|教我|解釋|解释|分析|討論|讨论|介紹|介绍|推薦|推荐|是什麼|是什么|什麼是|哪裡|哪里|提示詞|提示词|prompt|\b(?:how|why|what is|explain|recommend|don't|do not)\b/i;
 const VIDEO=/影片|視頻|视频|短片|動畫|动画|\b(?:video|animation|clip)\b/i;
 const MUSIC=/音樂|音乐|歌曲|配樂|配乐|旋律|曲子|樂曲|乐曲|背景樂|bgm|\b(?:music|song|soundtrack|melody|beat)\b|(?:一首|首)[^。！？\n，,]{0,12}歌(?![詞词])|^歌$/i;
 const IMAGE=/圖片|图片|圖像|图像|插畫|插画|照片|相片|海報|海报|頭像|头像|桌布|壁紙|壁纸|貼圖|贴图|圖示|图标|圖標|logo|\b(?:image|picture|photo|illustration|poster|wallpaper|icon|drawing|painting)\b|一張|一张|一幅/i;
 const MAKE=/^(?:生成|製作|制作|產生|产生|做|作|弄|創作|创作|設計|设计|來|来|出|拍|錄|录|generate|create|make|produce|compose|design)/i;
 const DRAW=/^(?:畫|画|繪製|绘制|繪|绘|draw|paint|sketch|illustrate)/i;
 const ANIMATE=/動起來|动起来|(?:變|变|轉|转|做)成(?:影片|視頻|视频|動畫|动画|短片)|\banimate\b/i;
 const RESTYLE=/(?:改成|變成|变成|換成|换成|轉成|转成|弄成|做成|改為|改为)[^。！？\n]{0,12}(?:風格|风格|卡通|動漫|动漫|漫畫|漫画|油畫|油画|水彩|素描|像素|寫實|写实|插畫|插画)|(?:換|换|改)(?:個|个)?(?:背景|顏色|颜色|風格|风格)|\b(?:make it|turn (?:it|this) into|restyle)\b/i;
 const WRITE_SONG=/^(?:寫|写|write)[^。！？\n]{0,8}(?:歌|song|歌詞|歌词|lyrics)/i;
 function normalise(text){return String(text||'').trim().replace(LEAD,'').replace(TAIL,'').trim();}
 function detectCreationIntent(text,hasImage){
  const raw=String(text||'').trim(),t=normalise(raw);
  if(!t)return 'chat';
  if(ASKING.test(t))return 'chat';
  if(ANIMATE.test(t))return hasImage?'video':'text-video';
  if(hasImage&&RESTYLE.test(t))return 'image-edit';
  if(WRITE_SONG.test(t))return 'chat'; // writing lyrics is a chat task; suggestCreationIntent offers music
  const made=MAKE.test(t),drawn=DRAW.test(t),counted=/^(?:一|兩|两|幾|几|\d+)\s*(?:段|支|部|個|个|首|曲|張|张|幅|秒)/.test(t);
  if((made||counted)&&VIDEO.test(t))return hasImage?'video':'text-video';
  if((made||counted)&&MUSIC.test(t))return 'music';
  if(drawn)return hasImage?'image-edit':'text-image';
  if((made||counted)&&IMAGE.test(t))return hasImage?'image-edit':'text-image';
  return 'chat';
 }
 // When the request is ambiguous we never switch silently; we only offer a one-click switch.
 function suggestCreationIntent(text,hasImage){
  const t=normalise(text);
  if(!t||detectCreationIntent(text,hasImage)!=='chat')return null;
  if(/如何|怎麼|怎么|為什麼|为什么|教我|解釋|解释|是什麼|是什么|推薦|推荐|\b(?:how|why|explain)\b/i.test(t))return null;
  if(WRITE_SONG.test(t)||/(?:一首|首)[^。！？\n]{0,12}歌|配樂|配乐|背景音樂|背景音乐|bgm/i.test(t))return 'music';
  if(VIDEO.test(t))return hasImage?'video':'text-video';
  if(hasImage&&RESTYLE.test(t))return 'image-edit';
  if(/(?:畫|画)(?!面|質|质|家|廊|展|風|风)|插畫|插画|海報|海报|頭像|头像|桌布|壁紙|壁纸|\b(?:draw|poster|wallpaper)\b/i.test(t))return hasImage?'image-edit':'text-image';
  return null;
 }
 const api={detectCreationIntent,suggestCreationIntent};
 if(typeof module==='object'&&module.exports)module.exports=api;else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);

// A fresh snapshot must not be answered using an unrelated older text exchange.
module.exports=function robotContext(previous,hasSnapshot){
 if(hasSnapshot)return [];
 return previous.slice(-10).map(message=>({role:message.role,content:String(message.content).slice(0,2500)}));
};

// Personal preferences that should follow the user to any browser on this computer.
// Device-specific state (microphone choice, open drawers, active conversation,
// notification opt-in) deliberately stays in each browser's localStorage.
const KEYS=['chat-appearance-v1','chat-speech-v1','video-settings-v1','music-model-v1','avatar-motion-v1','local-avatar-v1','robot-pause','robot-stt-quality','robot-output-voice'];
const MAX_VALUE=65536;
module.exports=(app,db)=>{
 db.exec('CREATE TABLE IF NOT EXISTS user_preferences(owner TEXT NOT NULL, key TEXT NOT NULL, value TEXT, updated INTEGER NOT NULL, PRIMARY KEY(owner,key))');
 const list=db.prepare('SELECT key,value,updated FROM user_preferences WHERE owner=?');
 // Newer timestamp wins, so an older tab can never overwrite a newer change.
 const upsert=db.prepare('INSERT INTO user_preferences(owner,key,value,updated) VALUES(?,?,?,?) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value,updated=excluded.updated WHERE excluded.updated>user_preferences.updated');
 app.get('/api/preferences',(req,res)=>{
  const items={};for(const row of list.all(req.user.id))if(KEYS.includes(row.key))items[row.key]={value:row.value,updated:Number(row.updated)};
  res.json({keys:KEYS,items});
 });
 app.put('/api/preferences',(req,res)=>{
  const items=req.body?.items;
  if(!items||typeof items!=='object'||Array.isArray(items))return res.status(400).json({error:'設定格式不正確'});
  const now=Date.now(),accepted=[];
  for(const [key,item] of Object.entries(items)){
   if(!KEYS.includes(key)||!item||typeof item!=='object')continue;
   const value=item.value;
   if(value!==null&&(typeof value!=='string'||value.length>MAX_VALUE))continue;
   const updated=Number.isSafeInteger(item.updated)&&item.updated>0?Math.min(item.updated,now+60000):now;
   upsert.run(req.user.id,key,value,updated);accepted.push(key);
  }
  res.json({ok:true,accepted});
 });
};
module.exports.KEYS=KEYS;

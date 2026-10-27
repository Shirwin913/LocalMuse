// Single local workspace. No passwords, sessions, registration or user management.
const fs=require('fs'),path=require('path');
module.exports=(app,db)=>{
 const dir=process.env.CHAT_DATA_DIR||path.join(__dirname,'data');
 const backup=path.join(dir,'before-single-user.sqlite');
 if(!fs.existsSync(backup))db.exec("VACUUM INTO '"+backup.replace(/'/g,"''")+"'");
 db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS user_settings(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,language TEXT NOT NULL DEFAULT 'zh-TW');`);
 if(!db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='owner'))db.exec('ALTER TABLE conversations ADD COLUMN owner TEXT REFERENCES users(id)');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
 const id='local-workspace';
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('INSERT OR IGNORE INTO users(id,username,password,admin,disabled) VALUES(?,?,?,1,0)').run(id,'__local_workspace__','NO_LOGIN');
  const settings=db.prepare('SELECT language FROM user_settings WHERE user_id<>? LIMIT 1').get(id);
  if(settings)db.prepare('INSERT OR IGNORE INTO user_settings VALUES(?,?)').run(id,settings.language);
  db.prepare('UPDATE conversations SET owner=? WHERE owner IS NULL OR owner<>?').run(id,id);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 const inflight=new Map();
 app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.get('host')||'')||req.get('x-forwarded-for')||req.get('cf-ray'))return res.status(403).json({error:'僅供本機使用'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   let valid=false;try{valid=new URL(req.get('origin')).host===req.get('host');}catch{}
   if(!valid)return res.status(403).json({error:'請從本站頁面操作'});
  }
  req.user={id,username:'本機工作區',admin:1};next();
 });
 // Old account URLs have no effect in local mode.
 app.use('/api/auth',(req,res)=>res.status(404).json({error:'單人模式不使用帳號功能'}));
 require('./resource-routes')(app,db,inflight);
 app.use('/api/admin',(req,res)=>res.status(404).json({error:'單人模式不提供使用者管理'}));
 app.use('/api',(req,res,next)=>{inflight.set(id,(inflight.get(id)||0)+1);res.once('finish',()=>inflight.set(id,Math.max(0,(inflight.get(id)||1)-1)));next();});
 return {owns:(conversation,user)=>Boolean(db.prepare('SELECT id FROM conversations WHERE id=? AND owner=?').get(conversation,user))};
};

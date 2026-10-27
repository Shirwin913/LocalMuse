const crypto=require('crypto'),{promisify}=require('util');
const scrypt=promisify(crypto.scrypt),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=(app,db)=>{
 db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS user_settings(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,language TEXT NOT NULL DEFAULT 'zh-TW');`);
 if(!db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='owner'))db.exec('ALTER TABLE conversations ADD COLUMN owner TEXT REFERENCES users(id)');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
 const inflight=new Map();
 const isLocal=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.get('host')||'')&&!req.get('cf-ray')&&!req.get('x-forwarded-for');
 app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   let valid=false;try{valid=new URL(req.get('origin')).host===req.get('host');}catch{}
   if(!valid)return res.status(403).json({error:'請從本站頁面操作'});
  }
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chat_session='))?.slice(13);
  if(cookie)req.sessionToken=hash(cookie);
  if(cookie)req.user=db.prepare('SELECT u.id,u.username,u.admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.disabled=0').get(hash(cookie),Date.now());
  next();
 });
 const attempts=new Map();
 const limit=(req,res,next)=>{const key=req.socket.remoteAddress;let a=attempts.get(key);if(!a||Date.now()-a.start>60000){a={count:0,start:Date.now()};attempts.set(key,a);}if(++a.count>12)return res.status(429).json({error:'嘗試次數過多，請一分鐘後再試'});next();};
 const credentials=b=>typeof b.username==='string'&&/^[a-zA-Z0-9_.-]{3,40}$/.test(b.username)&&typeof b.password==='string'&&b.password.length>=12&&b.password.length<=128;
 async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
 function session(req,res,id){const token=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,Date.now()+7*86400000);res.cookie('chat_session',token,{httpOnly:true,sameSite:'strict',secure:!isLocal(req),maxAge:7*86400000,path:'/'});res.json({ok:true});}
 app.get('/api/auth/status',(req,res)=>res.json({user:req.user||null,setup:!db.prepare('SELECT id FROM users LIMIT 1').get()&&isLocal(req)}));
 app.post('/api/auth/setup',limit,async(req,res)=>{try{
  if(!isLocal(req)||db.prepare('SELECT id FROM users LIMIT 1').get())return res.status(403).json({error:'初始化僅限本機首次使用'});
  if(!credentials(req.body))return res.status(400).json({error:'帳號需 3–40 個英數字，密碼需 12–128 字元'});
  const pw=await passwordHash(req.body.password),id=crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');try{if(db.prepare('SELECT id FROM users LIMIT 1').get())throw Error('已完成初始化');db.prepare('INSERT INTO users(id,username,password,admin) VALUES(?,?,?,1)').run(id,req.body.username.toLowerCase(),pw);db.prepare('UPDATE conversations SET owner=? WHERE owner IS NULL').run(id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  session(req,res,id);
 }catch(e){res.status(400).json({error:'無法建立帳號，可能已完成初始化'});}});
 app.post('/api/auth/login',limit,async(req,res)=>{try{
  if(!credentials(req.body))return res.status(401).json({error:'帳號或密碼不正確'});
  const u=db.prepare('SELECT * FROM users WHERE username=?').get(req.body.username.toLowerCase());
  const [salt,expected]=(u?.password||('0'.repeat(32)+':'+ '0'.repeat(128))).split(':');
  const actual=await scrypt(req.body.password,salt,64);
  if(!u||u.disabled||db.prepare('SELECT password FROM users WHERE id=? AND disabled=0').get(u.id)?.password!==u.password||!crypto.timingSafeEqual(actual,Buffer.from(expected,'hex')))return res.status(401).json({error:'帳號或密碼不正確'});
  session(req,res,u.id);
 }catch{res.status(500).json({error:'登入失敗'});}});
 app.post('/api/auth/register',limit,async(req,res)=>{try{
  if(!credentials(req.body)||typeof req.body.invitation!=='string')return res.status(400).json({error:'請檢查帳號、密碼與邀請碼'});
  const token=hash(req.body.invitation),pw=await passwordHash(req.body.password),id=crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');try{
   if(!db.prepare('SELECT token FROM invitations WHERE token=? AND expires>?').get(token,Date.now()))throw Error('邀請碼失效');
   db.prepare('INSERT INTO users(id,username,password,admin) VALUES(?,?,?,0)').run(id,req.body.username.toLowerCase(),pw);db.prepare('DELETE FROM invitations WHERE token=?').run(token);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}session(req,res,id);
 }catch{res.status(400).json({error:'邀請碼無效、已使用，或帳號已存在'});}});
 app.use('/api',(req,res,next)=>req.user?next():res.status(401).json({error:'請先登入'}));
 require('./presence')(app,db);
 require('./admin-routes')(app,db,passwordHash,inflight);
 require('./resource-routes')(app,db,inflight);
 app.use('/api',(req,res,next)=>{const id=req.user.id;inflight.set(id,(inflight.get(id)||0)+1);res.once('finish',()=>inflight.set(id,Math.max(0,(inflight.get(id)||1)-1)));next();});
 app.post('/api/auth/logout',(req,res)=>{const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('chat_session='))?.slice(13);if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));res.clearCookie('chat_session',{path:'/'});res.json({ok:true});});
 app.post('/api/auth/invite',(req,res)=>{if(!req.user.admin)return res.status(403).json({error:'僅管理員可邀請'});const code=crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO invitations VALUES(?,?)').run(hash(code),Date.now()+86400000);res.json({invitation:code});});
 app.use('/api',(req,res,next)=>{
  let conversation;
  const c=/^\/conversations\/([^/]+)$/.exec(req.path);
  const m=/^\/(attachments|videos|audio|video-analysis|image-analysis)\/([^/]+)$/.exec(req.path);
  if(c)conversation=c[1];
  else if(m){const row=db.prepare('SELECT conversation FROM messages WHERE id=?').get(m[2]);if(!row)return res.status(404).json({error:'找不到資料'});conversation=row.conversation;}
  else if(req.path==='/video-jobs'&&req.method==='GET')conversation=String(req.query.conversation||'');
  if(conversation!==undefined&&!owns(conversation,req.user.id))return res.status(404).json({error:'找不到資料'});
  if(req.path==='/open-video-folder'&&(!req.user.admin||!isLocal(req)))return res.status(403).json({error:'僅管理員在本機可開啟資料夾'});
  next();
 });
 function owns(id,user){return Boolean(db.prepare('SELECT id FROM conversations WHERE id=? AND owner=?').get(id,user));}
 return {owns};
};

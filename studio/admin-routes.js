module.exports=(app,db,hashPassword,inflight)=>{
 app.use('/api/admin',(req,res,next)=>req.user?.admin?next():res.status(403).json({error:'僅管理員可操作'}));
 const user=id=>db.prepare('SELECT id,username,admin,disabled FROM users WHERE id=?').get(id);
 function blocked(id){return (inflight.get(id)||0)>0 || (db.prepare("SELECT name FROM sqlite_master WHERE name='video_jobs'").get()&&db.prepare("SELECT j.id FROM video_jobs j JOIN conversations c ON c.id=j.conversation WHERE c.owner=? AND j.status IN ('submitting','queued','running')").get(id));}
 app.get('/api/admin/users',(req,res)=>res.json(db.prepare(`SELECT u.id,u.username,u.admin,u.disabled,
 (SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.expires>cast(strftime('%s','now') AS INTEGER)*1000) AS sessions,
 (SELECT max(c.updated) FROM conversations c WHERE c.owner=u.id) AS last_activity,
 (SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.owner=u.id AND m.mime LIKE 'image/%') AS images,
 (SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.owner=u.id AND m.mime LIKE 'video/%') AS videos,
 (SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.owner=u.id AND m.attachment IS NOT NULL AND m.mime NOT LIKE 'video/%' AND m.mime NOT LIKE 'image/%') AS files,
 (SELECT count(*) FROM conversations c WHERE c.owner=u.id) AS conversations,
 (SELECT count(*) FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.owner=u.id) AS messages, (SELECT coalesce(sum(length(m.attachment)),0) FROM messages m JOIN conversations c ON c.id=m.conversation WHERE c.owner=u.id) AS bytes FROM users u ORDER BY u.admin DESC,u.username`).all()));
 app.get('/api/admin/users/:id/conversations',(req,res)=>res.json(db.prepare('SELECT c.id,c.title,c.model,c.updated, (SELECT count(*) FROM messages m WHERE m.conversation=c.id) AS messages, (SELECT coalesce(sum(length(m.attachment)),0) FROM messages m WHERE m.conversation=c.id) AS bytes FROM conversations c WHERE c.owner=? ORDER BY c.updated DESC').all(req.params.id)));
 app.get('/api/admin/users/:id/conversations/:conversation/messages',(req,res)=>{
  const conversation=db.prepare('SELECT id,title,model FROM conversations WHERE id=? AND owner=?').get(req.params.conversation,req.params.id);
  if(!conversation)return res.status(404).json({error:'找不到此帳號的對話'});
  const after=Number(req.query.after||0);
  if(!Number.isSafeInteger(after)||after<0)return res.status(400).json({error:'分頁格式不正確'});
  const rows=db.prepare('SELECT id,role,content,filename,mime FROM messages WHERE conversation=? AND id>? ORDER BY id LIMIT 51').all(conversation.id,after);
  const more=rows.length>50;const messages=rows.slice(0,50);
  res.setHeader('Cache-Control','no-store');res.json({conversation,messages,next:more?messages[messages.length-1].id:null});
 });
 app.patch('/api/admin/users/:id', (req,res)=>{
  const u=user(req.params.id);if(!u)return res.status(404).json({error:'找不到帳號'});
  if(u.id===req.user.id||u.admin)return res.status(400).json({error:'不能停用自己或管理員帳號'});
  if(typeof req.body.disabled!=='boolean')return res.status(400).json({error:'狀態格式不正確'});
  db.prepare('UPDATE users SET disabled=? WHERE id=?').run(Number(req.body.disabled),u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);res.json({ok:true});
 });
 app.post('/api/admin/users/:id/password',async(req,res)=>{try{
  const u=user(req.params.id);if(!u)return res.status(404).json({error:'找不到帳號'});
  if(u.admin&&u.id!==req.user.id)return res.status(403).json({error:'不能重設其他管理員密碼'});
  const pw=req.body.password;if(typeof pw!=='string'||pw.length<12||pw.length>128)return res.status(400).json({error:'密碼需 12–128 字元'});
  const encoded=await hashPassword(pw);if(!user(u.id))return res.status(404).json({error:'帳號已刪除'});
  db.prepare('UPDATE users SET password=? WHERE id=?').run(encoded,u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);res.json({ok:true,self:u.id===req.user.id});
 }catch{res.status(500).json({error:'密碼重設失敗'});}});
 app.delete('/api/admin/users/:id/conversations/:conversation',(req,res)=>{
  const u=user(req.params.id);if(!u)return res.status(404).json({error:'找不到帳號'});
  if(req.body.confirm!==u.username)return res.status(400).json({error:'請輸入帳號名稱確認'});
  if(blocked(u.id))return res.status(409).json({error:'帳號仍有請求或影片任務進行中，請稍後重試'});
  db.prepare('DELETE FROM conversations WHERE id=? AND owner=?').run(req.params.conversation,u.id);res.json({ok:true});
 });
 app.delete('/api/admin/users/:id',(req,res)=>{
  const u=user(req.params.id);if(!u)return res.status(404).json({error:'找不到帳號'});
  if(u.id===req.user.id||u.admin)return res.status(400).json({error:'不能刪除自己或管理員帳號'});
  if(req.body.confirm!==u.username)return res.status(400).json({error:'請輸入帳號名稱確認'});
  if(blocked(u.id))return res.status(409).json({error:'帳號仍有請求或影片任務進行中，請稍後重試'});
  db.exec('BEGIN');try{db.prepare('DELETE FROM conversations WHERE owner=?').run(u.id);db.prepare('DELETE FROM users WHERE id=?').run(u.id);db.exec('COMMIT');res.json({ok:true});}catch{db.exec('ROLLBACK');res.status(500).json({error:'刪除失敗，資料已保留'});}
 });
};


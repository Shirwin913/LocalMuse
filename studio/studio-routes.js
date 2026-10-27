module.exports=(app,db)=>{
 if(!db.prepare('PRAGMA table_info(video_jobs)').all().some(c=>c.name==='finished'))db.exec('ALTER TABLE video_jobs ADD COLUMN finished INTEGER');
 db.exec(`CREATE TRIGGER IF NOT EXISTS generation_finished AFTER UPDATE OF status ON video_jobs
 WHEN NEW.status IN ('done','error') AND OLD.status NOT IN ('done','error')
 BEGIN UPDATE video_jobs SET finished=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=NEW.id; END;`);
 app.get('/api/studio',(req,res)=>{
  const page=Math.max(0,Math.min(100000,parseInt(req.query.page)||0));
  const kind=['image','video','music'].includes(req.query.kind)?req.query.kind:'';
  const library=req.query.view==='library';
  const where=['c.owner=?'];const args=[req.user.id];
  if(library)where.push("j.status='done' AND m.attachment IS NOT NULL");
  if(kind==='image')where.push("j.mode IN ('text-image','image-edit')");
  if(kind==='video')where.push("j.mode IN ('video','text-video')");
  if(kind==='music')where.push("j.mode='music'");
  const from=' FROM video_jobs j JOIN conversations c ON c.id=j.conversation LEFT JOIN messages m ON m.id=j.message_id LEFT JOIN generation_recipes r ON r.job_id=j.id WHERE '+where.join(' AND ');
  const total=db.prepare('SELECT COUNT(*) AS n'+from).get(...args).n;
  const rows=db.prepare('SELECT j.id,j.conversation,j.status,j.error,j.mode,j.created,j.finished,j.expires_at,j.expired_at,j.message_id,c.title,m.filename,m.mime,length(m.attachment) AS bytes,r.settings'+from+' ORDER BY j.created DESC,j.id LIMIT 20 OFFSET ?').all(...args,page*20);
  res.json({total,page,items:rows.map(({settings,...r})=>{let recipe=null;try{recipe=JSON.parse(settings);}catch{}return {...r,prompt:recipe?.prompt||'',musicModel:recipe?.musicModel,hasRecipe:Boolean(recipe)};})});
 });
};

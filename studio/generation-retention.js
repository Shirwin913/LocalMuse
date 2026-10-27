const fs=require('fs'),path=require('path'),crypto=require('crypto');
const DAY=86400000;
module.exports=function(db,history){
 const columns=db.prepare('PRAGMA table_info(video_jobs)').all().map(x=>x.name);
 for(const name of ['expires_at','expired_at'])if(!columns.includes(name))db.exec(`ALTER TABLE video_jobs ADD COLUMN ${name} INTEGER`);
 db.exec('CREATE TABLE IF NOT EXISTS generation_output_files(job_id TEXT NOT NULL, location TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(job_id,location))');
 const root=process.env.COMFY_RETENTION_OUTPUT_ROOT||path.resolve(__dirname,'../generated/output');
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 function inside(base,file){const rel=path.relative(base,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);}
 function resolveFile(file){
  if(file.type&&file.type!=='output')throw Error('Not output');
  if(typeof file.filename!=='string'||path.basename(file.filename)!==file.filename)throw Error('Invalid filename');
  const base=fs.realpathSync(root),candidate=path.resolve(base,file.subfolder||'',file.filename);
  if(!inside(base,candidate))throw Error('Outside output');
  const real=fs.realpathSync(candidate);if(!inside(base,real)||!fs.statSync(real).isFile())throw Error('Invalid output');return real;
 }
 function capture(job,files){
  for(const file of files){try{const location=resolveFile(file);db.prepare('INSERT OR REPLACE INTO generation_output_files VALUES(?,?,?)').run(job.id,location,hash(fs.readFileSync(location)));}catch(e){console.warn('Retention: output not tracked',job.id,e.code||e.message);}}
 }
 // Existing work gets a full grace day, including records without a completion timestamp.
 db.prepare(`UPDATE video_jobs SET expires_at=? WHERE status='done' AND expires_at IS NULL AND expired_at IS NULL
 AND conversation IN (SELECT c.id FROM conversations c JOIN users u ON u.id=c.owner WHERE u.admin=0)`).run(Date.now()+DAY);
 function completed(id){db.prepare(`UPDATE video_jobs SET expires_at=COALESCE(finished,?)+? WHERE id=? AND conversation IN
 (SELECT c.id FROM conversations c JOIN users u ON u.id=c.owner WHERE u.admin=0)`).run(Date.now(),DAY,id);}
 function sweep(now=Date.now()){
  if(history.isBusy?.()||db.prepare("SELECT id FROM video_jobs WHERE status IN ('submitting','queued','running') LIMIT 1").get())return 0;
  const jobs=db.prepare(`SELECT j.* FROM video_jobs j JOIN conversations c ON c.id=j.conversation JOIN users u ON u.id=c.owner
 WHERE u.admin=0 AND j.status='done' AND j.expires_at<=? AND j.expired_at IS NULL LIMIT 20`).all(now);
  for(const job of jobs){
   db.exec('BEGIN');try{
    db.prepare("UPDATE messages SET attachment=NULL,filename=NULL,mime=NULL,content='生成作品已到期清除（保留 24 小時）。',context=? WHERE id=?").run(JSON.stringify({role:'assistant',content:'生成作品已到期清除（保留 24 小時）。'}),job.message_id);
    db.prepare('UPDATE video_jobs SET expired_at=? WHERE id=?').run(now,job.id);
    db.prepare("INSERT OR REPLACE INTO settings VALUES('retention_compact_pending','1')").run();db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  const expiredFiles=db.prepare(`SELECT f.* FROM generation_output_files f JOIN video_jobs j ON j.id=f.job_id
 JOIN conversations c ON c.id=j.conversation JOIN users u ON u.id=c.owner WHERE j.expired_at IS NOT NULL AND u.admin=0`).all();
  for(const file of expiredFiles){
   if(db.prepare('SELECT job_id FROM generation_output_files WHERE location=? AND job_id<>?').get(file.location,file.job_id))continue;
   try{
    const base=fs.realpathSync(root);
    if(!inside(base,file.location)||fs.realpathSync(file.location)!==file.location||hash(fs.readFileSync(file.location))!==file.digest)continue;
    fs.unlinkSync(file.location);
   }catch(e){if(e.code!=='ENOENT'){console.warn('Retention: output cleanup deferred',e.message);continue;}}
   db.prepare('DELETE FROM generation_output_files WHERE job_id=? AND location=?').run(file.job_id,file.location);
  }
  if(db.prepare("SELECT value FROM settings WHERE key='retention_compact_pending'").get()){
   // No active generation or chat. VACUUM may need additional temporary disk space.
   try{db.exec('VACUUM');db.prepare("DELETE FROM settings WHERE key='retention_compact_pending'").run();}catch(e){console.warn('Retention: database compaction deferred',e.message);}
  }
  return jobs.length;
 }
 function safeSweep(){try{sweep();}catch(e){console.error('Retention cleanup failed',e.message);}}
 const timer=setInterval(safeSweep,3600000);timer.unref();const initial=setTimeout(safeSweep,60000);initial.unref();
 return {capture,completed,sweep,stop(){clearInterval(timer);clearTimeout(initial);}};
};

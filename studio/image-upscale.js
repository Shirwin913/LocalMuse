const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
module.exports=(app,history)=>{
 const db=history.db,root=path.resolve(__dirname,'..');let active=false;
 db.exec('CREATE TABLE IF NOT EXISTS image_upscales(image_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,mode TEXT NOT NULL,metadata TEXT NOT NULL,image BLOB NOT NULL,PRIMARY KEY(image_id,mode))');
 const source=id=>db.prepare("SELECT id,attachment FROM messages WHERE id=? AND mime IN ('image/png','image/jpeg','image/webp')").get(id);
 app.get('/api/image-upscale/:id/:mode',(req,res)=>{
  if(!source(req.params.id))return res.sendStatus(404);
  const row=db.prepare('SELECT image FROM image_upscales WHERE image_id=? AND mode=?').get(req.params.id,req.params.mode);
  if(!row)return res.sendStatus(404);
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.query.download==='1')res.setHeader('Content-Disposition',`attachment; filename="localmuse-${Number(req.params.id)}-${req.params.mode}.png"`);
  res.type('png').send(Buffer.from(row.image));
 });
 app.post('/api/image-upscale/:id',async(req,res)=>{
  const mode=req.body.mode;if(!['2x','4k'].includes(mode))return res.status(400).json({error:'請選擇 2x 或 4k'});
  const row=source(req.params.id);if(!row?.attachment)return res.status(404).json({error:'找不到原圖'});
  const cached=db.prepare('SELECT metadata FROM image_upscales WHERE image_id=? AND mode=?').get(row.id,mode);
  if(cached)return res.json(JSON.parse(cached.metadata));
  if(active)return res.status(409).json({error:'另一張圖片正在超解析，請稍候'});
  active=true;let directory;
  try{
   directory=fs.mkdtempSync(path.join(os.tmpdir(),'localmuse-sr-'));
   const input=path.join(directory,'source.png'),output=path.join(directory,'result.png');fs.writeFileSync(input,Buffer.from(row.attachment));
   const metadata=await new Promise((resolve,reject)=>{
    const child=spawn(require('./gpu-backend').generationPython(root),['-B',path.join(root,'native/image_upscale.py'),input,output,'--mode',mode],{cwd:root,windowsHide:true});
    let stdout='',stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},1800000);
    child.stdout.on('data',data=>stdout=(stdout+data).slice(-8192));child.stderr.on('data',data=>stderr=(stderr+data).slice(-4096));
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);if(timedOut)return reject(Error('超解析超過 30 分鐘，已停止；原圖保留'));if(code!==0)return reject(Error('超解析失敗：'+stderr.slice(-1000)));try{resolve(JSON.parse(stdout.trim()));}catch{reject(Error('超解析結果無效'));}});
   });
   if(!source(row.id))throw Error('原圖已被刪除，未儲存放大結果');
   db.prepare('INSERT OR REPLACE INTO image_upscales VALUES(?,?,?,?)').run(row.id,mode,JSON.stringify(metadata),fs.readFileSync(output));
   res.json(metadata);
  }catch(error){if(!res.destroyed)res.status(500).json({error:error.message});}
  finally{if(directory)fs.rmSync(directory,{recursive:true,force:true});active=false;}
 });
};

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
module.exports = function setup(app) {
  const dir = process.env.CHAT_DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'chat.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, model TEXT NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL, context TEXT NOT NULL, filename TEXT, mime TEXT, attachment BLOB);`);
  const accounts=require('./local-workspace')(app,db);
  const prompts = {
    'zh-TW': '請一律使用繁體中文（臺灣用語）回答，除非使用者明確要求其他語言。避免使用簡體字；程式碼、指令、網址與專有名稱保留原文。',
    'auto': '請依照使用者使用的語言回答。'
  };
  if (!db.prepare('PRAGMA table_info(conversations)').all().some(c => c.name === 'language')) {
    db.exec("ALTER TABLE conversations ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-TW'");
  }
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const defaultLanguage = user => db.prepare('SELECT language FROM user_settings WHERE user_id=?').get(user)?.language || 'zh-TW';
  app.get('/api/settings', (req,res) => res.json({language:defaultLanguage(req.user.id)}));
  app.patch('/api/settings', (req,res) => {
    if (!Object.hasOwn(prompts, req.body.language)) return res.status(400).json({error:'不支援的語言設定'});
    db.prepare('INSERT INTO user_settings VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language').run(req.user.id,req.body.language);
    res.json({language:defaultLanguage(req.user.id)});
  });
  const get = id => db.prepare('SELECT * FROM conversations WHERE id=?').get(id);
  const rows = id => db.prepare('SELECT id,role,content,filename,mime FROM messages WHERE conversation=? ORDER BY id').all(id);
  const busy = new Set();
  app.get('/api/conversations', (req,res) => res.json(db.prepare('SELECT * FROM conversations WHERE owner=? ORDER BY updated DESC').all(req.user.id)));
  app.post('/api/conversations', (req,res) => {
    const id = randomUUID();
    db.prepare('INSERT INTO conversations (id,title,model,updated,language,owner) VALUES (?,?,?,?,?,?)').run(id,'新對話',process.env.OLLAMA_MODEL || 'hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q4_K_M',Date.now(),defaultLanguage(req.user.id),req.user.id);
    res.status(201).json(get(id));
  });
  app.get('/api/conversations/:id', (req,res) => {
    const c = get(req.params.id);
    if (!c) return res.status(404).json({error:'找不到對話'});
    res.json({...c,messages:rows(c.id)});
  });
  app.patch('/api/conversations/:id', (req,res) => {
    const c = get(req.params.id);
    if (!c) return res.status(404).json({error:'找不到對話'});
    if (busy.has(c.id)) return res.status(409).json({error:'請等待回覆完成'});
    const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0,80) : c.title;
    const model = typeof req.body.model === 'string' ? req.body.model.trim().slice(0,200) : c.model;
    if (!title || !model) return res.status(400).json({error:'名稱不可空白'});
    db.prepare('UPDATE conversations SET title=?,model=? WHERE id=?').run(title,model,c.id);
    res.json(get(c.id));
  });
  app.delete('/api/conversations/:id', (req,res) => {
    if (busy.has(req.params.id)) return res.status(409).json({error:'請等待回覆完成'});
    if (db.prepare("SELECT name FROM sqlite_master WHERE name='video_jobs'").get() && db.prepare("SELECT id FROM video_jobs WHERE conversation=? AND status IN ('queued','running','submitting')").get(req.params.id)) return res.status(409).json({error:'影片仍在生成，請完成後再刪除對話'});
    db.prepare('DELETE FROM conversations WHERE id=?').run(req.params.id);
    res.json({ok:true});
  });
  app.get('/api/attachments/:id', (req,res) => {
    const row = db.prepare('SELECT filename,mime,attachment FROM messages WHERE id=?').get(req.params.id);
    if (!row?.attachment) return res.sendStatus(404);
    if(req.query.preview==='1'&&['image/png','image/jpeg','image/webp','image/gif'].includes(row.mime)){res.setHeader('X-Content-Type-Options','nosniff');return res.type(row.mime).send(Buffer.from(row.attachment));}
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.type('application/octet-stream').send(Buffer.from(row.attachment));
  });
  return {
    db,
    isBusy(){return busy.size>0;},
    begin(id,user) {
      if(!accounts.owns(id,user))throw new Error('找不到對話');
      if (!get(id)) throw new Error('找不到對話，請重新整理');
      if (busy.has(id)) throw new Error('這個對話正在產生回覆');
      busy.add(id);
      return db.prepare('SELECT context FROM messages WHERE conversation=? ORDER BY id').all(id).map(r=>JSON.parse(r.context));
    },
    systemPrompt(id) { return '你是本地 AI 助手，回答請清楚、實用。' + (prompts[get(id)?.language] || prompts['zh-TW']); },
    release(id) { busy.delete(id); },
    save(id, model, text, context, file, reply) {
      db.exec('BEGIN');
      try {
        const insert = db.prepare('INSERT INTO messages (conversation,role,content,context,filename,mime,attachment) VALUES (?,?,?,?,?,?,?)');
        insert.run(id,'user',text,JSON.stringify(context),file?.originalname||null,file?.mimetype||null,file?.buffer||null);
        insert.run(id,'assistant',reply,JSON.stringify({role:'assistant',content:reply}),null,null,null);
        const c=get(id);
        db.prepare('UPDATE conversations SET title=?,model=?,updated=? WHERE id=?').run(c.title==='新對話'?text.slice(0,40):c.title,model,Date.now(),id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
};

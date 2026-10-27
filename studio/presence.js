// Presence uses authenticated sessions; client-supplied user IDs are never accepted.
module.exports = (app, db) => {
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'last_seen'))
    db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER');
  const tabs = new Map();
  const liveMs = 90000, idleMs = 300000;
  function prune(now) {
    for (const [key, tab] of tabs) if (now - tab.seen >= liveMs) tabs.delete(key);
  }
  app.post('/api/presence', (req, res) => {
    const {tabId, idleFor} = req.body || {};
    if (typeof tabId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(tabId) || !Number.isFinite(idleFor) || idleFor < 0)
      return res.status(400).json({error:'連線狀態格式不正確'});
    const now = Date.now(); prune(now);
    const key = req.sessionToken + ':' + tabId;
    // Bound the number of tabs tracked per session.
    if (!tabs.has(key) && [...tabs.values()].filter(t => t.token === req.sessionToken).length >= 32)
      return res.status(429).json({error:'開啟的分頁過多'});
    tabs.set(key, {user:req.user.id, token:req.sessionToken, seen:now, active:now-Math.min(idleFor,86400000)});
    db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now,req.user.id);
    res.json({ok:true});
  });
  app.get('/api/admin/presence', (req,res) => {
    if (!req.user.admin) return res.status(403).json({error:'僅管理員可操作'});
    const now = Date.now(); prune(now);
    const valid = new Set(db.prepare('SELECT token FROM sessions WHERE expires>?').all(now).map(s=>s.token));
    const users = db.prepare('SELECT id,disabled,last_seen FROM users').all().map(u=>{
      const live = u.disabled ? [] : [...tabs.values()].filter(t=>t.user===u.id && valid.has(t.token));
      return {id:u.id, status:live.some(t=>now-t.active<idleMs)?'online':live.length?'idle':'offline',last_seen:u.last_seen};
    });
    res.json({users,updated:now});
  });
};

const crypto = require('crypto');
const { db, banUser, unbanUser } = require('./lib');
const sig = (p) => crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(p).digest('hex');
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const res = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const cnt = async (q) => (await q.count().get()).data().count;
const U = db.collection('users');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'POST only' });
  const b = JSON.parse(event.body || '{}');
  if (b.action === 'login') {
    if (!eq(String(b.password || ''), process.env.ADMIN_PASSWORD)) return res(401, { error: 'Password salah' });
    const exp = String(Date.now() + 12 * 3600e3);
    return res(200, { token: exp + '.' + sig(exp) });
  }
  const [exp, s] = String(event.headers.authorization || '').replace('Bearer ', '').split('.');
  if (!exp || !s || Date.now() > +exp || !eq(s, sig(exp))) return res(401, { error: 'Sesi habis' });
  try {
    if (b.action === 'stats') {
      const g = (await db.doc('stats/global').get()).data() || {};
      const [total, queue, chat, botc, banned] = await Promise.all([cnt(U), cnt(U.where('state', '==', 'queue')), cnt(U.where('state', '==', 'chat')), cnt(U.where('state', '==', 'chat').where('partner', '==', 'BOT')), cnt(U.where('banned', '==', true))]);
      return res(200, { total, queue, chat, botChat: botc, humanChat: chat - botc, banned, messages: g.messages || 0, photos: g.photos || 0, matches: g.matches || 0 });
    }
    if (b.action === 'users') {
      if (b.q) { const d = await U.doc(String(b.q).trim()).get(); return res(200, { users: d.exists ? [{ id: d.id, ...d.data() }] : [] }); }
      const q = await U.orderBy('lastActive', 'desc').limit(100).get();
      return res(200, { users: q.docs.map((d) => { const x = d.data(); delete x.hist; return { id: d.id, ...x }; }) });
    }
    if (b.action === 'logs') { const q = await db.collection('logs').orderBy('t', 'desc').limit(60).get(); return res(200, { logs: q.docs.map((d) => d.data()) }); }
    if (b.action === 'ban') return res(200, { ok: await banUser(b.id, 'dashboard') });
    if (b.action === 'unban') return res(200, { ok: await unbanUser(b.id) });
  } catch (e) { console.error(e); return res(500, { error: 'Server error' }); }
  return res(400, { error: 'Aksi tidak dikenal' });
};

const crypto = require('crypto');
const { db, banUser, unbanUser, purgeChats } = require('./lib');
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
      const openReports = await cnt(db.collection('reports').where('status', '==', 'open'));
      return res(200, { openReports, total, queue, chat, botChat: botc, humanChat: chat - botc, banned, messages: g.messages || 0, photos: g.photos || 0, matches: g.matches || 0, reports: g.reports || 0, fbGood: g.fbGood || 0, fbOk: g.fbOk || 0, fbBad: g.fbBad || 0 });
    }
    if (b.action === 'users') {
      if (b.q) { const d = await U.doc(String(b.q).trim()).get(); return res(200, { users: d.exists ? [{ id: d.id, ...d.data() }] : [] }); }
      const q = await U.orderBy('lastActive', 'desc').limit(100).get();
      return res(200, { users: q.docs.map((d) => { const x = d.data(); delete x.hist; return { id: d.id, ...x }; }) });
    }
    if (b.action === 'logs') { const q = await db.collection('logs').orderBy('t', 'desc').limit(60).get(); return res(200, { logs: q.docs.map((d) => d.data()) }); }
    if (b.action === 'chats') {
      const C = db.collection('chats'), id = String(b.uid || '').trim();
      let docs;
      if (id) { const [x, y] = await Promise.all([C.where('from', '==', id).limit(300).get(), C.where('to', '==', id).limit(300).get()]); docs = [...x.docs, ...y.docs]; }
      else docs = (await C.orderBy('t', 'desc').limit(150).get()).docs;
      const rows = docs.map((d) => d.data()).sort((p, q) => q.t - p.t).slice(0, 300);
      return res(200, { chats: rows });
    }
    if (b.action === 'purge') return res(200, { deleted: await purgeChats(Math.max(0, +b.days || 30)) });
    if (b.action === 'reports') { const q = await db.collection('reports').orderBy('t', 'desc').limit(100).get(); return res(200, { reports: q.docs.map((d) => ({ id: d.id, ...d.data() })) }); }
    if (b.action === 'report_close') { await db.doc('reports/' + String(b.id)).update({ status: 'closed' }); return res(200, { ok: true }); }
    if (b.action === 'broadcast') {
      const text = String(b.text || '').trim();
      if (!text || text.length > 3500) return res(400, { error: 'Pesan kosong atau lebih dari 3500 karakter' });
      const total = await cnt(U);
      const doc = await db.collection('broadcasts').add({ t: Date.now(), text, status: 'queued', sent: 0, failed: 0, total });
      await fetch(process.env.URL + '/.netlify/functions/broadcast-background', { method: 'POST', headers: { 'x-secret': process.env.WEBHOOK_SECRET }, body: JSON.stringify({ id: doc.id }) });
      return res(200, { id: doc.id });
    }
    if (b.action === 'broadcasts') { const q = await db.collection('broadcasts').orderBy('t', 'desc').limit(10).get(); return res(200, { broadcasts: q.docs.map((d) => ({ id: d.id, ...d.data() })) }); }
    if (b.action === 'ban') return res(200, { ok: await banUser(b.id, 'dashboard') });
    if (b.action === 'unban') return res(200, { ok: await unbanUser(b.id) });
  } catch (e) { console.error(e); return res(500, { error: 'Server error' }); }
  return res(400, { error: 'Aksi tidak dikenal' });
};

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const call = (token) => async (method, body) =>
  (await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const bot = call(process.env.BOT_TOKEN);
const abot = call(process.env.ADMIN_BOT_TOKEN);
const send = (id, text, extra = {}) => bot('sendMessage', { chat_id: id, text, ...extra });
const ref = (id) => db.doc('users/' + id);
const log = (type, uid, extra = '') => db.collection('logs').add({ t: Date.now(), type, uid: String(uid), extra });
const stat = (k, n = 1) => db.doc('stats/global').set({ [k]: FV.increment(n) }, { merge: true });

async function banUser(id, by = 'admin') {
  id = String(id);
  const s = await ref(id).get();
  if (!s.exists) return false;
  const u = s.data();
  await ref(id).update({ banned: true, state: 'idle', partner: null });
  if (u.partner && u.partner !== 'BOT') {
    await ref(u.partner).update({ state: 'idle', partner: null });
    await send(u.partner, 'Chat diakhiri. Ketik /search untuk mencari pasangan baru.');
  }
  await send(id, '🚫 Akunmu diblokir karena melanggar aturan.');
  await log('ban', id, by); await stat('bans');
  return true;
}
async function unbanUser(id) {
  id = String(id);
  if (!(await ref(id).get()).exists) return false;
  await ref(id).update({ banned: false });
  await send(id, '✅ Blokirmu dicabut. Ketik /start untuk lanjut.');
  await log('unban', id); return true;
}
async function warnUser(id, text, by = 'admin') {
  id = String(id);
  if (!(await ref(id).get()).exists) return 'notfound';
  const r = await send(id, '⚠️ Peringatan dari admin:\n\n' + text);
  if (!r.ok) return 'failed';
  await log('warn', id, by + ': ' + text.slice(0, 80)); await stat('warns');
  return 'ok';
}
async function purgeChats(days = 30) {
  const cutoff = Date.now() - days * 864e5; let n = 0;
  for (;;) {
    const q = await db.collection('chats').where('t', '<', cutoff).limit(400).get();
    if (q.empty) return n;
    const b = db.batch(); q.docs.forEach((d) => b.delete(d.ref)); await b.commit(); n += q.size;
  }
}
module.exports = { FP: admin.firestore.FieldPath, purgeChats, db, FV, bot, abot, send, ref, log, stat, banUser, unbanUser, warnUser };

const { db, bot, FP } = require('./lib');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.headers['x-secret'] !== process.env.WEBHOOK_SECRET) return { statusCode: 401 };
  const bref = db.doc('broadcasts/' + JSON.parse(event.body).id);
  const { text } = (await bref.get()).data();
  let sent = 0, failed = 0, last = null;
  await bref.update({ status: 'sending' });
  for (;;) {
    let q = db.collection('users').orderBy(FP.documentId()).limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (d.data().banned) continue;
      let r = await bot('sendMessage', { chat_id: d.id, text: '📢 Pengumuman\n\n' + text });
      if (r.error_code === 429) { await sleep(((r.parameters && r.parameters.retry_after) || 2) * 1000); r = await bot('sendMessage', { chat_id: d.id, text: '📢 Pengumuman\n\n' + text }); }
      r.ok ? sent++ : failed++;
      await sleep(40);
    }
    last = snap.docs[snap.docs.length - 1];
    await bref.update({ sent, failed });
  }
  await bref.update({ status: 'done', sent, failed, doneAt: Date.now() });
};

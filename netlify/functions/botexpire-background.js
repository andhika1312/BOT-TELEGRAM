const { db, ref, send } = require('./lib');
const { search, MENU } = require('./bot');

exports.handler = async (event) => {
  if (event.headers['x-secret'] !== process.env.WEBHOOK_SECRET) return { statusCode: 401 };
  const { uid, since } = JSON.parse(event.body);
  await new Promise((r) => setTimeout(r, 10000));
  const ended = await db.runTransaction(async (t) => {
    const d = (await t.get(ref(uid))).data();
    if (d.state !== 'chat' || d.partner !== 'BOT' || d.botSince !== since) return false;
    t.update(ref(uid), { state: 'idle', partner: null }); return true;
  });
  if (!ended) return { statusCode: 200 };
  const rounds = ((await ref(uid).get()).data().botRounds || 0) + 1;
  if (rounds >= 3) { await ref(uid).update({ botRounds: 0 }); return send(uid, 'Belum ada orang yang cocok online saat ini. Coba lagi sebentar lagi ya 🙏 /search', { reply_markup: MENU }); }
  await ref(uid).update({ botRounds: rounds });
  await send(uid, '⏭ Chat berakhir. Mencari pasangan lain...');
  await search(uid);
};

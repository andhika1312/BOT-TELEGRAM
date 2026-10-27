const { db, bot, abot, send, ref, log, stat, FV } = require('./lib');
const S = { L: 'Laki-laki', P: 'Perempuan', A: 'Semua' };
const MENU = { keyboard: [[{ text: '🔍 Cari' }, { text: '⏭ Skip' }], [{ text: '➡️ Next' }, { text: '⛔ Stop' }], [{ text: '👤 Profil' }]], resize_keyboard: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (a, b) => (a.seek === 'A' || a.seek === b.gender) && (b.seek === 'A' || b.seek === a.gender);
const RULES = '👋 Selamat datang di chat anonim!\n\nAturan:\n• Khusus 18 tahun ke atas\n• Dilarang konten seksual eksplisit, pelecehan, penipuan, SARA\n• Percakapan dapat ditinjau admin demi keamanan (maks. 30 hari)\n• Jika belum ada pasangan yang cocok, kamu bisa dihubungkan dengan teman ngobrol otomatis (bot)\n• Pelanggar akan diblokir\n\nIsi profil dulu ya. Gendermu?';
const kb = (rows) => ({ inline_keyboard: rows });
const MENU_TEXTS = ['🔍 Cari', '⏭ Skip', '➡️ Next', '⛔ Stop', '👤 Profil'];
const profileText = (u) => `👤 Profilmu\n\nGender: ${S[u.gender] || '-'}\nUmur: ${u.age || '-'}\nMencari: ${S[u.seek] || '-'}\n\nMau ubah apa?`;
const profileKb = kb([[{ text: '👤 Gender', callback_data: 'pf:g' }, { text: '🎂 Umur', callback_data: 'pf:a' }], [{ text: '💞 Minat (cari siapa)', callback_data: 'pf:s' }]]);
const showProfile = (uid, u) => send(uid, profileText(u), { reply_markup: profileKb });

exports.handler = async (event) => {
  if (event.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return { statusCode: 401 };
  try { await handle(JSON.parse(event.body)); } catch (e) { console.error(e); }
  return { statusCode: 200, body: 'ok' };
};

async function load(from) {
  const r = ref(from.id); const s = await r.get();
  if (s.exists) return s.data();
  const u = { name: from.first_name || '', state: 'setup', step: 'gender', banned: false, createdAt: Date.now(), lastActive: Date.now(), msgCount: 0, photoCount: 0, ack2: true };
  await r.set(u); await log('join', from.id); await stat('users'); return u;
}

async function handle(up) {
  if (up.callback_query) return cb(up.callback_query);
  const m = up.message;
  if (!m || m.chat.type !== 'private') return;
  const uid = m.from.id, u = await load(m.from), t = (m.text || '').trim();
  if (u.banned) return send(uid, '🚫 Akunmu diblokir.');
  await ref(uid).update({ lastActive: Date.now() });

  if (u.pendingReport && ((t && !t.startsWith('/')) || t === '/lewati')) return submitReport(uid, u, t === '/lewati' ? '' : t);
  if (u.editing === 'age') {
    if (t === '/batal') { await ref(uid).update({ editing: FV.delete() }); return send(uid, 'Dibatalkan.', { reply_markup: MENU }); }
    if (/^\d{1,2}$/.test(t)) {
      const age = parseInt(t, 10);
      if (age < 18) return send(uid, '❌ Maaf, bot ini hanya untuk usia 18 tahun ke atas. Kirim umur lain atau /batal.');
      await ref(uid).update({ age, editing: FV.delete() });
      return send(uid, `✅ Umur diubah menjadi ${age}.`, { reply_markup: MENU });
    }
    if (t.startsWith('/') || MENU_TEXTS.includes(t)) await ref(uid).update({ editing: FV.delete() });
    else return send(uid, 'Kirim umurmu dalam angka, contoh: 21 (atau /batal).');
  }
  if (t === '/start' || t === '/ubah') { if (u.partner) await endChat(uid, u); await ref(uid).update({ state: 'setup', step: 'gender', partner: null }); return send(uid, RULES, { reply_markup: kb([[{ text: '👨 Laki-laki', callback_data: 'g:L' }, { text: '👩 Perempuan', callback_data: 'g:P' }]]) }); }
  if (u.state === 'setup') {
    if (u.step === 'age') {
      const age = parseInt(t, 10);
      if (!(age >= 1 && age <= 99)) return send(uid, 'Kirim umurmu dalam angka, contoh: 21');
      if (age < 18) return send(uid, '❌ Maaf, bot ini hanya untuk usia 18 tahun ke atas.');
      await ref(uid).update({ age, step: 'seek' });
      return send(uid, 'Tertarik dengan gender apa?', { reply_markup: kb([[{ text: 'Laki-laki', callback_data: 's:L' }, { text: 'Perempuan', callback_data: 's:P' }, { text: 'Semua', callback_data: 's:A' }]]) });
    }
    return send(uid, 'Selesaikan profil dulu dengan memilih tombol di atas, atau ketik /start.');
  }
  if (t === '/profil' || t === '👤 Profil') return showProfile(uid, u);
  if (t === '/search' || t === '🔍 Cari') return u.state === 'chat' ? send(uid, 'Kamu sedang chat. Pakai Next/Skip/Stop.') : search(uid);
  if (['/next', '➡️ Next', '/skip', '⏭ Skip'].includes(t)) return search(uid);
  if (t === '/stop' || t === '⛔ Stop') return stop(uid, u);
  if (u.state === 'chat') return relay(uid, u, m);
  if (u.state === 'queue') return send(uid, '🔍 Masih mencari pasangan...');
  return send(uid, 'Ketik /search untuk mencari pasangan.', { reply_markup: MENU });
}

async function cb(q) {
  const uid = q.from.id, p = q.data.split(':'), k = p[0], v = p[1];
  await bot('answerCallbackQuery', { callback_query_id: q.id });
  const u = await load(q.from);
  if (u.banned) return;
  const edit = (text, reply_markup) => bot('editMessageText', { chat_id: uid, message_id: q.message.message_id, text, ...(reply_markup ? { reply_markup } : {}) });
  if (k === 'nx' || k === 'xx') { if (u.state === 'chat' && String(u.partner) === v) return k === 'nx' ? search(uid) : stop(uid, u); return; }
  if (k === 'fb') { await db.collection('feedback').add({ t: Date.now(), from: String(uid), about: p[2], rating: v }); await stat({ g: 'fbGood', o: 'fbOk', b: 'fbBad' }[v] || 'fbOk'); return edit('Terima kasih atas penilaianmu 🙏'); }
  if (k === 'rp') return edit('🚩 Kenapa kamu melaporkan pasangan tadi? Pilih alasan:', kb([[{ text: '🔞 Seksual', callback_data: 'rc:sx:' + v }], [{ text: '😡 Kasar / pelecehan', callback_data: 'rc:ha:' + v }], [{ text: '💸 Penipuan / spam', callback_data: 'rc:sp:' + v }], [{ text: '✍️ Lainnya', callback_data: 'rc:ot:' + v }]]));
  if (k === 'rc') { await ref(uid).update({ pendingReport: { target: p[2], cat: v } }); return edit('✍️ Jelaskan singkat apa yang terjadi (ketik pesanmu), atau kirim /lewati untuk tanpa penjelasan.'); }
  if (k === 'pf' || k === 'pg' || k === 'ps') {
    if (u.state === 'setup') return;
    if (k === 'pf' && v === 'g') return edit('Pilih gendermu:', kb([[{ text: '👨 Laki-laki', callback_data: 'pg:L' }, { text: '👩 Perempuan', callback_data: 'pg:P' }]]));
    if (k === 'pf' && v === 's') return edit('Tertarik dengan gender apa?', kb([[{ text: 'Laki-laki', callback_data: 'ps:L' }, { text: 'Perempuan', callback_data: 'ps:P' }, { text: 'Semua', callback_data: 'ps:A' }]]));
    if (k === 'pf' && v === 'a') { await ref(uid).update({ editing: 'age' }); return edit('🎂 Kirim umur barumu (angka, minimal 18), atau /batal.'); }
    if (k === 'pg' && ['L', 'P'].includes(v)) { await ref(uid).update({ gender: v }); return edit(profileText({ ...u, gender: v }), profileKb); }
    if (k === 'ps' && ['L', 'P', 'A'].includes(v)) { await ref(uid).update({ seek: v }); return edit(profileText({ ...u, seek: v }), profileKb); }
    return;
  }
  if (u.state !== 'setup') return;
  if (k === 'g' && u.step === 'gender') { await ref(uid).update({ gender: v, step: 'age' }); return send(uid, 'Berapa umurmu? (angka, minimal 18)'); }
  if (k === 's' && u.step === 'seek') { await ref(uid).update({ seek: v, state: 'idle', step: 'done' }); return send(uid, '✅ Profil tersimpan! Ketik /search atau tekan 🔍 Cari. Ubah profil kapan saja lewat /profil.', { reply_markup: MENU }); }
}

async function endChat(uid, u) {
  if (u.partner && u.partner !== 'BOT') {
    await ref(u.partner).update({ state: 'idle', partner: null });
    await send(u.partner, '👋 Pasanganmu mengakhiri chat. Ketik /search untuk cari lagi.', { reply_markup: MENU });
    await askFeedback(u.partner, uid);
    await askFeedback(uid, u.partner);
  }
}

async function search(uid) {
  const u = (await ref(uid).get()).data();
  await endChat(uid, u);
  await ref(uid).update({ state: 'queue', partner: null, queuedAt: Date.now(), hist: [] });
  await send(uid, '🔍 Mencari pasangan...', { reply_markup: MENU });
  if (await tryMatch(uid)) return;
  await sleep(6000);
  const since = Date.now();
  const joined = await db.runTransaction(async (t) => {
    const s = await t.get(ref(uid));
    if (s.data().state !== 'queue') return false;
    t.update(ref(uid), { state: 'chat', partner: 'BOT', hist: [], botSince: since }); return true;
  });
  if (joined) {
    await send(uid, '✅ Pasangan ditemukan!\nSapa dia 👋', { reply_markup: kb([[{ text: '➡️ Next', callback_data: 'nx:BOT' }, { text: '⛔ Stop', callback_data: 'xx:BOT' }]]) });
    await log('bot_join', uid); await stat('botChats');
    await fetch(process.env.URL + '/.netlify/functions/botexpire-background', { method: 'POST', headers: { 'x-secret': process.env.WEBHOOK_SECRET }, body: JSON.stringify({ uid, since }) }).catch(console.error);
  }
}

async function tryMatch(uid) {
  const me = (await ref(uid).get()).data();
  const q = await db.collection('users').where('state', '==', 'queue').limit(50).get();
  const cands = q.docs.filter((d) => d.id !== String(uid)).sort((a, b) => a.data().queuedAt - b.data().queuedAt);
  for (const d of cands) {
    const c = d.data();
    if (c.banned || !ok(me, c)) continue;
    const done = await db.runTransaction(async (t) => {
      const [a, b] = await Promise.all([t.get(ref(uid)), t.get(d.ref)]);
      if (a.data().state !== 'queue' || b.data().state !== 'queue') return false;
      t.update(a.ref, { state: 'chat', partner: d.id, hist: [], botRounds: 0 }); t.update(b.ref, { state: 'chat', partner: String(uid), hist: [], botRounds: 0 }); return true;
    });
    if (done) {
      const info = (x) => `${S[x.gender]}, ${x.age} th`;
      const ctl = (pid) => ({ reply_markup: kb([[{ text: '➡️ Next', callback_data: 'nx:' + pid }, { text: '⛔ Stop', callback_data: 'xx:' + pid }]]) });
      await send(uid, `✅ Pasangan ditemukan! (${info(c)})\nSapa dia 👋`, ctl(d.id));
      await send(d.id, `✅ Pasangan ditemukan! (${info(me)})\nSapa dia 👋`, ctl(uid));
      await log('match', uid, d.id); await stat('matches'); return true;
    }
  }
  return false;
}

async function relay(uid, u, m) {
  const photo = !!m.photo;
  await ref(uid).update({ msgCount: FV.increment(1), ...(photo ? { photoCount: FV.increment(1) } : {}) });
  await stat('messages');
  const type = m.text ? 'text' : ['photo', 'sticker', 'voice', 'video', 'document', 'animation', 'video_note', 'audio'].find((k) => m[k]) || 'other';
  await db.collection('chats').add({ t: Date.now(), from: String(uid), to: String(u.partner), type, text: String(m.text || m.caption || '').slice(0, 1000) });
  if (photo) { await stat('photos'); await log('photo', uid, u.partner); await toAdmin(m, uid, u); }
  if (u.partner === 'BOT') {
    if (m.text) return botReply(uid, u, m.text);
    return send(uid, 'Pesan ini tidak bisa ditampilkan. Coba kirim teks ya.');
  }
  await bot('copyMessage', { chat_id: u.partner, from_chat_id: uid, message_id: m.message_id });
}

async function toAdmin(m, uid, u) {
  const p = m.photo[m.photo.length - 1];
  const f = await bot('getFile', { file_id: p.file_id });
  const buf = await (await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer();
  const fd = new FormData();
  fd.append('chat_id', process.env.ADMIN_CHAT_ID);
  fd.append('photo', new Blob([buf]), 'photo.jpg');
  fd.append('caption', `📷 Foto baru\nPengirim: ${uid} (${u.name}, ${S[u.gender]}, ${u.age} th)\nPenerima: ${u.partner}\n${m.caption ? 'Caption: ' + m.caption : ''}`);
  fd.append('reply_markup', JSON.stringify(kb([[{ text: '🚫 Ban pengirim', callback_data: 'ban:' + uid }]])));
  await fetch(`https://api.telegram.org/bot${process.env.ADMIN_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd });
}

async function botReply(uid, u, text) {
  let hist = [...(u.hist || []), { role: 'user', content: text }];
  if (hist.length > 7) hist = hist.slice(-7);
  let reply;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 200, system: 'Kamu bot AI teman ngobrol santai berbahasa Indonesia di chat anonim. Singkat (1-2 kalimat), ramah. Akui bahwa kamu bot jika ditanya. Jangan minta data pribadi, jangan konten seksual.', messages: hist }) });
      reply = (await r.json()).content?.[0]?.text;
    } catch (e) { console.error(e); }
  }
  if (!reply) reply = ['Hehe iya 😄 cerita lebih banyak dong', 'Wah menarik, lanjut!', 'Menurutmu gimana?', 'Lagi ngapain hari ini?'][Math.floor(Math.random() * 4)];
  hist.push({ role: 'assistant', content: reply });
  await ref(uid).update({ hist });
  await send(uid, reply);
  await db.collection('chats').add({ t: Date.now(), from: 'BOT', to: String(uid), type: 'text', text: reply });
}

const CAT = { sx: '🔞 SEKSUAL', ha: '😡 Kasar/pelecehan', sp: '💸 Penipuan/spam', ot: '✍️ Lainnya' };
const fbKb = (pid) => kb([[{ text: '👍 Bagus', callback_data: 'fb:g:' + pid }, { text: '😐 Biasa', callback_data: 'fb:o:' + pid }, { text: '👎 Buruk', callback_data: 'fb:b:' + pid }], [{ text: '🚩 Laporkan', callback_data: 'rp:' + pid }]]);
const askFeedback = (uid, pid) => send(uid, 'Bagaimana pengalamanmu dengan pasangan tadi?', { reply_markup: fbKb(pid) });

async function stop(uid, u) {
  await endChat(uid, u);
  await ref(uid).update({ state: 'idle', partner: null });
  return send(uid, 'Chat dihentikan. Ketik /search untuk mulai lagi.', { reply_markup: MENU });
}

async function evidence(a, b) {
  const C = db.collection('chats');
  const [x, y] = await Promise.all([C.where('from', '==', a).where('to', '==', b).limit(100).get(), C.where('from', '==', b).where('to', '==', a).limit(100).get()]);
  return [...x.docs, ...y.docs].map((d) => d.data()).sort((p, q) => p.t - q.t).slice(-30);
}

async function submitReport(uid, u, text) {
  const { target, cat } = u.pendingReport;
  await ref(uid).update({ pendingReport: FV.delete() });
  await db.collection('reports').add({ t: Date.now(), reporter: String(uid), reported: String(target), cat, text: text.slice(0, 500), status: 'open', evidence: await evidence(String(uid), String(target)) });
  await stat('reports'); await log('report', uid, target + ':' + cat);
  await send(uid, '✅ Laporan terkirim. Terima kasih, admin akan meninjaunya.', { reply_markup: MENU });
  await abot('sendMessage', { chat_id: process.env.ADMIN_CHAT_ID, text: `🚩 LAPORAN ${CAT[cat]}\nPelapor: ${uid}\nTerlapor: ${target}\nPenjelasan: ${text || '-'}\nBukti chat: lihat dashboard → Laporan`, reply_markup: kb([[{ text: '🚫 Ban terlapor', callback_data: 'ban:' + target }]]) });
}

exports.search = search;
exports.MENU = MENU;

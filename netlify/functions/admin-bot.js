const { db, abot, bot, banUser, unbanUser, warnUser } = require('./lib');
const A = () => String(process.env.ADMIN_CHAT_ID);
const say = (text) => abot('sendMessage', { chat_id: A(), text });

exports.handler = async (event) => {
  if (event.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return { statusCode: 401 };
  try {
    const up = JSON.parse(event.body);
    if (up.callback_query) {
      const q = up.callback_query;
      if (String(q.from.id) === A() && q.data.startsWith('ban:')) {
        const done = await banUser(q.data.slice(4), 'admin-bot');
        await abot('answerCallbackQuery', { callback_query_id: q.id, text: done ? 'User diblokir' : 'User tidak ditemukan' });
      }
    } else if (up.message?.text) {
      const txt = up.message.text.trim(), [cmd, arg] = txt.split(/\s+/);
      if (cmd === '/id') await abot('sendMessage', { chat_id: up.message.chat.id, text: 'Chat ID: ' + up.message.chat.id });
      else if (String(up.message.chat.id) === A()) {
        if (cmd === '/ban' && arg) await say((await banUser(arg, 'admin-bot')) ? '🚫 Diblokir ' + arg : 'Tidak ditemukan');
        else if (cmd === '/unban' && arg) await say((await unbanUser(arg)) ? '✅ Dibuka ' + arg : 'Tidak ditemukan');
        else if (cmd === '/stats') { const s = (await db.doc('stats/global').get()).data() || {}; await say(`Users: ${s.users || 0}\nMatch: ${s.matches || 0}\nBot chat: ${s.botChats || 0}\nPesan: ${s.messages || 0}\nFoto: ${s.photos || 0}\nBan: ${s.bans || 0}`); }
        else if (cmd === '/warn' || cmd === '/pesan') {
          const msg = txt.split(/\s+/).slice(2).join(' ').trim();
          if (!arg || !msg) await say('Format: /warn <id> <pesan peringatan>');
          else { const r = await warnUser(arg, msg, 'admin-bot'); await say(r === 'ok' ? '✅ Peringatan terkirim ke ' + arg : r === 'notfound' ? 'User tidak ditemukan' : 'Gagal terkirim (user mungkin memblokir bot)'); }
        }
        else if (cmd === '/setcmd') {
          const r = await bot('setMyCommands', { commands: [
            { command: 'search', description: '🔍 Cari pasangan' }, { command: 'next', description: '➡️ Pasangan berikutnya' },
            { command: 'skip', description: '⏭ Lewati pasangan' }, { command: 'stop', description: '⛔ Hentikan chat' },
            { command: 'profil', description: '👤 Lihat & ubah profil' }, { command: 'ubah', description: '✏️ Isi ulang profil dari awal' },
            { command: 'start', description: '🚀 Mulai / aturan' } ] });
          await say(r.ok ? '✅ Daftar command bot utama diperbarui' : 'Gagal: ' + JSON.stringify(r));
        }
        else await say('Perintah: /ban <id>, /unban <id>, /warn <id> <pesan>, /stats, /setcmd');
      }
    }
  } catch (e) { console.error(e); }
  return { statusCode: 200, body: 'ok' };
};

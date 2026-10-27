const { db, abot, ref, banUser, unbanUser } = require('./lib');
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
      const [cmd, arg] = up.message.text.trim().split(/\s+/);
      if (cmd === '/id') await abot('sendMessage', { chat_id: up.message.chat.id, text: 'Chat ID: ' + up.message.chat.id });
      else if (String(up.message.chat.id) === A()) {
        if (cmd === '/ban' && arg) await say((await banUser(arg, 'admin-bot')) ? '🚫 Diblokir ' + arg : 'Tidak ditemukan');
        else if (cmd === '/unban' && arg) await say((await unbanUser(arg)) ? '✅ Dibuka ' + arg : 'Tidak ditemukan');
        else if (cmd === '/stats') { const s = (await db.doc('stats/global').get()).data() || {}; await say(`Users: ${s.users || 0}\nMatch: ${s.matches || 0}\nBot chat: ${s.botChats || 0}\nPesan: ${s.messages || 0}\nFoto: ${s.photos || 0}\nBan: ${s.bans || 0}`); }
        else await say('Perintah: /ban <id>, /unban <id>, /stats');
      }
    }
  } catch (e) { console.error(e); }
  return { statusCode: 200, body: 'ok' };
};

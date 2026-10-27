import { createRequire } from 'module';
const { purgeChats } = createRequire(import.meta.url)('./lib.js');
export default async () => { console.log('chat dihapus:', await purgeChats(Number(process.env.CHAT_RETENTION_DAYS || 30))); };
export const config = { schedule: '@daily' };

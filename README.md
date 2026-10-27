# Bot Telegram Chat Anonim + Dashboard Admin

## 1. Siapkan
1. Buat 2 bot di @BotFather: **bot utama** (BOT_TOKEN) & **bot admin** (ADMIN_BOT_TOKEN).
2. Firebase → Firestore Database (mode production) → Project settings → Service accounts → Generate key (JSON).
3. Push folder ini ke GitHub lalu import di Netlify (atau `netlify deploy --prod` via CLI). Drag-drop biasa TIDAK menginstall dependency function.

## 2. Environment variables (Netlify → Site settings)
| Nama | Isi |
|---|---|
| BOT_TOKEN | token bot utama |
| ADMIN_BOT_TOKEN | token bot admin |
| ADMIN_CHAT_ID | chat id kamu (isi nanti, lihat langkah 4) |
| WEBHOOK_SECRET | string acak bebas (huruf/angka) |
| FIREBASE_SERVICE_ACCOUNT | seluruh isi file JSON (1 baris) |
| ADMIN_PASSWORD | password login dashboard |
| ANTHROPIC_API_KEY | (opsional) agar balasan bot lebih natural |

## 3. Pasang webhook (ganti nilai)
```
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://SITEMU.netlify.app/api/bot&secret_token=<WEBHOOK_SECRET>"
curl "https://api.telegram.org/bot<ADMIN_BOT_TOKEN>/setWebhook?url=https://SITEMU.netlify.app/api/admin-bot&secret_token=<WEBHOOK_SECRET>"
```

## 4. ADMIN_CHAT_ID
Deploy dulu, kirim `/id` ke bot admin → salin angkanya → isi ADMIN_CHAT_ID → redeploy.

## Log chat
Semua chat dicatat ke Firestore (koleksi `chats`), dibaca lewat dashboard → Log Chat. Otomatis dihapus setelah 30 hari (ubah dengan env `CHAT_RETENTION_DAYS`). User diberi tahu di aturan /start.

## Laporan & auto-skip bot
Setelah chat berakhir (skip/stop/di-skip) user melihat penilaian 👍😐👎 + tombol 🚩 Laporkan (pilih Seksual/Kasar/Spam/Lainnya, lalu jelaskan). Laporan + 30 pesan terakhir masuk dashboard dan bot admin. Bot pengganti dilewati otomatis ±10 detik lewat `botexpire-background` (variabel `URL` disediakan Netlify otomatis).

## Broadcast
Dashboard → Broadcast: tulis pengumuman, kirim ke semua user (kecuali yang diblokir). Berjalan di background (±25 pesan/detik), progres tampil di dashboard. User yang memblokir bot dihitung 'gagal'.

## Fitur
- User: /start (gender, umur 18+, minat), /search, Skip, Next, Stop.
- Tidak ada pasangan cocok dalam ±6 detik → masuk BOT (diberi label jelas).
- Foto diteruskan ke bot admin + tombol 🚫 Ban. Perintah admin: /ban id, /unban id, /stats.
- Dashboard: buka https://SITEMU.netlify.app (statistik, daftar user, log, ban/unban).

# DAGET

Ruang obrolan komunitas **realtime**. Tanpa login, tanpa email, tanpa password — cukup masukkan username lalu langsung ngobrol.

Tampilannya terinspirasi dari channel komunitas yang sudah familiar (avatar di kiri, username di atas pesan, timestamp kecil, balasan bergaris, indikator mengetik di bawah), tetapi dibuat lebih ringan, bersih, dan mobile-first dengan nuansa gelap + glass/blur.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| Masuk tanpa akun | Username disimpan di `localStorage`, refresh tetap login |
| Ganti Username | Menu `⋯` → **Ganti Username** |
| Chat realtime | Supabase Realtime (`postgres_changes`) |
| Kirim teks, gambar, GIF | JPG / JPEG / PNG / WEBP / GIF via Supabase Storage (maks. 8 MB), plus pencarian GIF GIPHY (opsional) |
| Emoji picker | Pencarian emoji, riwayat emoji terakhir |
| Balas pesan | Hover → ikon balas (desktop) atau tekan lama → **Balas** (mobile) |
| Hapus pesan sendiri | Diverifikasi di database, tidak bisa menghapus pesan orang lain |
| Indikator mengetik | Supabase Realtime Broadcast — "kep sedang mengetik..." |
| Pengguna online | Supabase Presence — panel "Online — 12" |
| Pencarian pesan | Pencarian teks di seluruh riwayat, klik hasil untuk lompat ke pesan |
| Auto scroll | Mengikuti pesan baru; jika sedang membaca pesan lama muncul "N pesan baru" |
| Lainnya | Mention `@username` + autocomplete, tautan otomatis, emoji besar, pengelompokan pesan beruntun, pemisah tanggal, infinite scroll, tempel/drag-drop gambar, lightbox, coba kirim ulang saat gagal, sinkron ulang saat koneksi pulih |

## Tech stack

- Next.js 15 (App Router) + TypeScript
- TailwindCSS
- Supabase (Postgres, Realtime, Presence, Storage)
- Zustand
- Lucide Icons

## Struktur folder

```
daget/
├── supabase/
│   └── schema.sql              # Schema lengkap: tabel, RLS, RPC, realtime, storage
├── src/
│   ├── app/
│   │   ├── api/gifs/route.ts   # Proxy pencarian GIF (API key tetap di server)
│   │   ├── globals.css
│   │   ├── icon.svg
│   │   ├── layout.tsx
│   │   ├── manifest.ts
│   │   └── page.tsx
│   ├── components/
│   │   ├── chat/               # ChatRoom, header, daftar pesan, composer, panel, dll.
│   │   ├── ui/                 # Avatar, toast, util kecil
│   │   ├── DagetApp.tsx        # Alur masuk / chat / ganti username
│   │   ├── JoinScreen.tsx
│   │   ├── Logo.tsx
│   │   └── Watermark.tsx
│   ├── hooks/
│   │   ├── useLongPress.ts
│   │   └── useRealtimeRoom.ts  # Satu channel: pesan + presence + typing
│   ├── lib/
│   │   ├── api.ts              # Semua panggilan Supabase
│   │   ├── chat-actions.ts     # Kirim / hapus / muat / lompat ke pesan
│   │   ├── constants.ts
│   │   ├── realtime.ts
│   │   ├── session.ts          # localStorage
│   │   ├── supabase.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   └── store/
│       └── chat.ts             # Zustand store
├── .env.example
└── package.json
```

## Database

Tabel `users`

| Kolom | Tipe |
| --- | --- |
| `id` | uuid (PK) |
| `username` | text (unik, tidak peka huruf besar/kecil) |
| `created_at` | timestamptz |
| `last_seen` | timestamptz |
| `secret_hash` | text — hash SHA-256 dari secret browser, tidak pernah bisa dibaca client |

Tabel `messages`

| Kolom | Tipe |
| --- | --- |
| `id` | uuid (PK) |
| `username` | text |
| `content` | text (maks. 2000 karakter) |
| `type` | `text` \| `image` \| `gif` |
| `media_url` | text, nullable |
| `reply_to` | uuid → `messages.id`, nullable (jadi `null` jika pesan asli dihapus) |
| `created_at` | timestamptz |
| `user_id` | uuid → `users.id` (untuk verifikasi pemilik pesan) |

### Keamanan tanpa login

Saat pertama masuk, browser membuat **secret acak 256-bit** yang disimpan di `localStorage`. Database hanya menyimpan hash-nya. Semua penulisan berjalan melalui fungsi RPC `SECURITY DEFINER` yang memverifikasi secret:

- `join_chat(username, secret)` — masuk atau ganti username. Username yang sedang dipakai orang lain ditolak (`username_taken`); username terkunci selama pemiliknya aktif dan otomatis bebas setelah 10 menit tidak aktif (heartbeat tiap 2 menit selama tab terbuka).
- `send_message(...)` — username pengirim diambil dari database, jadi tidak bisa dipalsukan. URL media harus berasal dari bucket `chat-media` atau GIPHY. Anti-spam: maks. 8 pesan / 10 detik.
- `delete_message(secret, id)` — hanya pemilik pesan.
- `touch_user(secret)` — memperbarui `last_seen` dan mengembalikan username saat ini (client kembali ke layar masuk jika namanya sudah dipakai orang lain).
- `search_messages(query)` — pencarian teks (indeks trigram).

Role `anon` hanya boleh `SELECT` tabel `messages`. Tabel `users` sama sekali tidak bisa diakses langsung dari client.

> Karena tidak ada akun, menghapus data browser (localStorage) berarti kehilangan kepemilikan username di perangkat itu. Username tersebut akan bebas dipakai lagi setelah 10 menit tidak aktif.

## Project Supabase bawaan

Repo ini sudah terhubung ke project Supabase `daget` (`https://sfvysgdzqrgppbgyjmtk.supabase.co`) — schema sudah dijalankan dan URL + publishable key disimpan sebagai default di `src/lib/config.ts`. Jadi **deploy ke Vercel tidak butuh environment variable apa pun**. Key tersebut memang kunci publik untuk browser; keamanan data dijaga RLS + RPC.

Ingin memakai project Supabase lain? Jalankan `supabase/schema.sql` di project itu, lalu isi env di bawah — env selalu mengalahkan default.

## Menjalankan secara lokal

Prasyarat: Node.js 18.18+ dan akun [Supabase](https://supabase.com) (gratis cukup).

1. **Buat project Supabase** di <https://supabase.com/dashboard>.
2. **Jalankan schema**: buka **SQL Editor** → **New query** → tempel seluruh isi `supabase/schema.sql` → **Run**. File ini aman dijalankan ulang.
3. **Pastikan Realtime aktif untuk channel publik**: **Project Settings → Realtime** → pastikan opsi *Allow public access* / private-only **tidak** memaksa channel privat (default project baru sudah benar). Presence & typing memakai channel publik `room:daget`.
4. **Salin environment**:
   ```bash
   cp .env.example .env.local
   ```
   Isi dari **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `anon` public key atau publishable key (`sb_publishable_...`)
   - `GIPHY_API_KEY` — opsional, buat gratis di <https://developers.giphy.com/dashboard/>. Tanpa key, tombol GIF tetap bisa dipakai untuk upload file `.gif`.
5. **Install & jalankan**:
   ```bash
   npm install
   npm run dev
   ```
   Buka <http://localhost:3000>.

Perintah lain:

```bash
npm run build      # build produksi
npm run start      # jalankan hasil build
npm run lint       # ESLint
npm run typecheck  # TypeScript
```

## Deploy ke Vercel

1. Push repository ini ke GitHub/GitLab/Bitbucket.
2. Buka <https://vercel.com/new> → **Import** repository.
3. Framework preset otomatis terdeteksi sebagai **Next.js**. Biarkan build command (`next build`) dan output default.
4. Di **Environment Variables**, tambahkan untuk *Production*, *Preview*, dan *Development*:

   | Nama | Nilai |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `GIPHY_API_KEY` | (opsional) API key GIPHY |

5. Klik **Deploy**.
6. Setelah selesai, buka domain `*.vercel.app` kamu — langsung bisa dipakai.

Catatan:
- **Setiap kali menambah/mengubah env di Vercel, wajib Redeploy**: tab **Deployments** → deployment terbaru → **⋯ → Redeploy**. Env baru tidak berlaku untuk deployment yang sudah ada.
- Nama variabel dari integrasi Supabase ↔ Vercel (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) juga diterima.
- Jangan pernah mengisi `service_role` / `sb_secret_...` key — aplikasi akan menolaknya.
- Tidak perlu konfigurasi CORS/redirect di Supabase karena aplikasi tidak memakai Supabase Auth.
- Pastikan `supabase/schema.sql` sudah dijalankan pada project Supabase yang sama dengan env di Vercel.

## Login Discord (wajib anggota server)

Sejak versi ini, masuk ke Daget memakai akun Discord. Hanya anggota server Discord yang ditentukan (opsional: dengan role tertentu) yang bisa chat. Nama dan foto profil diambil dari Discord, jadi setiap pesan jelas siapa pengirimnya.

Cara kerja:

1. Browser login lewat Supabase Auth (provider Discord, scope `identify guilds.members.read`).
2. Edge Function `discord-verify` (`supabase/functions/discord-verify`) memakai token Discord untuk mengecek keanggotaan server, lalu membuat profil terverifikasi di `public.users`.
3. Pesan hanya bisa dikirim lewat RPC `post_message` oleh profil terverifikasi yang tidak diblokir. Admin (`users.is_admin`) bisa menghapus pesan siapa pun lewat `remove_message`; `users.banned = true` memblokir seseorang.

Setup (sekali):

1. **Discord Developer Portal** → New Application → **OAuth2** → salin *Client ID* & *Client Secret*, tambahkan Redirect `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → Sign In / Providers → Discord** → aktifkan, isi Client ID & Secret.
3. **Supabase → Authentication → URL Configuration** → *Site URL* = domain Vercel kamu, dan tambahkan `https://<domain-vercel>/**` ke *Redirect URLs*.
4. Jalankan `supabase/discord_voice.sql` (setelah `schema.sql`) dan deploy Edge Function `discord-verify`.
5. Isi tabel `app_settings`: `discord_guild_id` (Server ID), opsional `discord_role_id`, `discord_guild_name`, `discord_invite_url`, lalu set `require_discord = true`.

## Role, profil, mention & pencarian

Jalankan `supabase/roles_profiles_search.sql` setelah `discord_voice.sql`.

- **Role kosmetik dari Discord** (`supabase/discord_roles.sql`): isi tabel `discord_roles` dengan Role ID, nama, warna (`#RRGGBB`), dan `position` (makin besar makin tinggi). Saat login, role anggota di server Discord ikut tersimpan; warna nama mengikuti role tertinggi. Role ini hanya warna — tanpa izin apa pun. Tidak ada label di samping nama; role terlihat di kartu profil. Anggota yang login sebelum fitur ini akan melihat tombol **Sinkronkan** (atau menu ⋯ → Sinkronkan Role Discord).
- **Hak moderasi Daget** (terpisah dari role Discord, tidak ditampilkan di chat): `admin` dan `mod`.
  - Admin: hapus pesan siapa pun, jadikan/cabut Moderator atau Admin, blokir anggota.
  - Moderator: hapus pesan siapa pun, blokir anggota biasa.
  - Diatur dari kartu profil (klik foto/nama → Moderasi). Admin tidak bisa mengubah dirinya sendiri; Admin/Moderator harus diturunkan dulu sebelum bisa diblokir.
- **Kartu profil**: klik foto atau nama → banner, foto, nama, @username Discord, role, tanggal akun Discord dibuat / join server / join Daget, jumlah pesan, tombol ke profil Discord asli, "Pesannya", "Yang menyebut", dan "Mention". Banner & tanggal join server diambil saat login Discord (anggota lama perlu login ulang agar terisi).
- **Mention**: ketik `@` untuk memilih anggota (disimpan sebagai @username Discord, ditampilkan sebagai nama), **role** (`@guardian`, `@vice-principal`, `@rizz-academy-student`, … — `supabase/role_mentions.sql`), atau `@everyone` / `@here`. Semua anggota boleh memakai ketiganya. Pesan yang menyebut kamu, role kamu, atau @everyone di-highlight.
- **Search by**: panel cari punya filter **Dari** (pengirim), **Menyebut** (anggota yang di-mention), dan **Jenis** (semua media, gambar, GIF, pesan suara, link) — bisa digabung dengan kata kunci.

## Live YouTube, nonton bareng, reaksi, notifikasi

Jalankan `supabase/reactions_live.sql` setelah `role_mentions.sql`.

- **Deteksi live**: isi `app_settings.youtube_channel` (handle `@nama`, channel id `UC…`, atau link channel — boleh lebih dari satu, pisahkan dengan koma) dan `youtube_name`. Route `/api/live` mengecek halaman `/live` channel tersebut (di-cache ±25 detik di edge; banner & player hilang otomatis ±30–60 detik setelah live selesai). `live_mode`: `auto` (default), `on` (paksa live; isi `live_video_id` bila perlu), `off`.
- **Banner LIVE** muncul otomatis di atas chat hanya saat live. Ikon 📺 di header selalu ada: merah + berkedip saat live; abu-abu di luar live dan membuka **siaran ulang** stream terakhir (diambil dari tab Live channel).
- **Nonton bareng**: di laptop stream tampil di kiri chat; di HP player di atas chat (bisa dikecilkan tanpa berhenti).
- **Reaksi emoji**: hover pesan → 😊+ (laptop) atau tekan lama → baris reaksi cepat (HP). Klik reaksi yang sudah ada untuk ikut/batal. Realtime ke semua orang.
- **Notifikasi mention**: saat tab Daget di belakang dan kamu di-mention (nama, role, atau @everyone): bunyi "ping", judul tab jadi `(N) Daget`, dan notifikasi browser jika diaktifkan (menu ⋯ → Notifikasi mention). Di iPhone notifikasi browser hanya bisa jika Daget ditambahkan ke Home Screen.

## Voice note & balas dengan swipe

- Tombol 🎤 muncul saat kolom pesan kosong: ketuk untuk merekam (maks. 2 menit), ketuk kirim atau 🗑 untuk batal. Rekaman memakai MP4/AAC jika browser mendukung (diputar di semua perangkat), selain itu WebM/Opus.
- Di HP, geser pesan **ke kiri** untuk membalas. Tekan lama tetap membuka menu aksi.

## Mode istirahat (maintenance)

Untuk menghentikan chat sementara tanpa menghapus data:

1. Supabase Dashboard → **Table Editor** → tabel `app_settings`.
2. Ubah kolom `maintenance` menjadi `true` (opsional: isi `maintenance_message`) → **Save**.

Admin tetap bisa masuk untuk tes lewat `https://<domain>/?tes` (tersimpan di browser itu; matikan dengan `?tes=0`). Selama mode istirahat hanya admin yang bisa mengirim pesan.

Semua pengunjung langsung melihat layar "Lagi libur" dan pesan baru ditolak di database. Ubah kembali ke `false` untuk menyalakan lagi — aplikasi terbuka otomatis kembali normal.

Atau lewat SQL Editor:

```sql
update public.app_settings set maintenance = true  where id = 1;  -- matikan sementara
update public.app_settings set maintenance = false where id = 1;  -- nyalakan lagi
```

## Troubleshooting

| Gejala | Solusi |
| --- | --- |
| Muncul "Konfigurasi belum lengkap" | Layar itu menyebut variabel yang kurang. Isi di Vercel → Settings → Environment Variables, lalu **Redeploy** |
| "Menghubungkan…" terus-menerus | Cek Realtime aktif dan channel publik diizinkan (langkah 3) |
| Pesan terkirim tapi tidak muncul realtime di tab lain | Pastikan blok `alter publication supabase_realtime add table public.messages` di schema berhasil (Database → Publications) |
| Upload gambar gagal | Pastikan bucket `chat-media` ada (Storage) dan policy upload dari schema terpasang |
| `username_taken` | Username sedang dipakai orang yang aktif dalam 10 menit terakhir — tunggu sebentar atau pilih nama lain |
| Tombol GIF membuka pemilih file | `GIPHY_API_KEY` belum diisi — itu perilaku normal |

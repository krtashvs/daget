-- ════════════════════════════════════════════════════════════════════
--  DAGET — Supabase schema
--  Jalankan seluruh file ini di Supabase Dashboard → SQL Editor → Run.
--  Aman dijalankan ulang (idempotent).
--
--  Model keamanan (tanpa login):
--  • Browser membuat "secret" acak dan menyimpannya di localStorage.
--  • Database hanya menyimpan hash SHA-256 dari secret tersebut.
--  • Semua penulisan (join, kirim, hapus) lewat fungsi RPC SECURITY DEFINER
--    yang memverifikasi secret → username tidak bisa dipalsukan dan
--    pesan hanya bisa dihapus oleh pemiliknya.
--  • Role anon hanya boleh SELECT tabel messages (untuk history & realtime).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ────────────────────────────────────────────────────────────────────
--  Tables
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  secret_hash text not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  constraint users_username_format check (
    char_length(username) between 2 and 24
    and username ~ '^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$'
  )
);

create unique index if not exists users_username_lower_key on public.users (lower(username));
create unique index if not exists users_secret_hash_key    on public.users (secret_hash);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users (id) on delete set null,
  username   text not null,
  content    text not null default '',
  type       text not null default 'text',
  media_url  text,
  reply_to   uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint messages_type_check    check (type in ('text', 'image', 'gif')),
  constraint messages_content_len   check (char_length(content) <= 2000),
  constraint messages_payload_check check (
    (type = 'text' and char_length(btrim(content)) > 0 and media_url is null)
    or (type in ('image', 'gif') and media_url is not null)
  )
);

create index if not exists messages_created_at_idx   on public.messages (created_at desc);
create index if not exists messages_user_created_idx on public.messages (user_id, created_at desc);
create index if not exists messages_reply_to_idx     on public.messages (reply_to);
create index if not exists messages_content_trgm_idx on public.messages using gin (content extensions.gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────────
--  Row Level Security & privileges
-- ────────────────────────────────────────────────────────────────────

alter table public.users    enable row level security;
alter table public.messages enable row level security;

-- users: tidak bisa diakses langsung sama sekali dari client.
revoke all on table public.users from anon, authenticated;

-- messages: hanya bisa dibaca. Penulisan wajib lewat RPC.
revoke all on table public.messages from anon, authenticated;
grant select on table public.messages to anon, authenticated;

drop policy if exists "messages are readable by everyone" on public.messages;
create policy "messages are readable by everyone"
  on public.messages for select
  to anon, authenticated
  using (true);

-- ────────────────────────────────────────────────────────────────────
--  Internal helpers (tidak diekspos ke client)
-- ────────────────────────────────────────────────────────────────────

create or replace function public.hash_secret(p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_secret, 'sha256'), 'hex');
$$;

create or replace function public.user_from_secret(p_secret text)
returns public.users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  if p_secret is null or char_length(p_secret) not between 32 and 128 then
    raise exception 'invalid_session';
  end if;

  select * into v_user from public.users where secret_hash = public.hash_secret(p_secret);
  if v_user.id is null then
    raise exception 'invalid_session';
  end if;

  return v_user;
end;
$$;

revoke execute on function public.hash_secret(text)      from public, anon, authenticated;
revoke execute on function public.user_from_secret(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
--  RPC: join_chat — masuk / ganti username
--  • Username baru      → dibuat & diikat ke secret.
--  • Username milik sendiri → diperbarui last_seen.
--  • Secret sudah punya username lain → username di-rename (Ganti Username).
--  • Username milik orang lain & aktif ≤ 30 hari → error username_taken.
--  • Username milik orang lain & tidak aktif > 30 hari → dibebaskan.
-- ────────────────────────────────────────────────────────────────────

create or replace function public.join_chat(p_username text, p_secret text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text := regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g');
  v_hash  text;
  v_me    public.users;
  v_other public.users;
begin
  if p_secret is null or char_length(p_secret) not between 32 and 128 then
    raise exception 'invalid_session';
  end if;

  if char_length(v_name) not between 2 and 24
     or v_name !~ '^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$' then
    raise exception 'invalid_username';
  end if;

  v_hash := public.hash_secret(p_secret);

  select * into v_me    from public.users where secret_hash = v_hash;
  select * into v_other from public.users where lower(username) = lower(v_name);

  if v_other.id is not null and v_other.secret_hash <> v_hash then
    if v_other.last_seen > now() - interval '30 days' then
      raise exception 'username_taken';
    end if;

    -- Bebaskan username yang sudah lama tidak dipakai.
    update public.users
       set username = left(v_other.username, 17) || '_' || substr(replace(v_other.id::text, '-', ''), 1, 6)
     where id = v_other.id;
  end if;

  begin
    if v_me.id is not null then
      update public.users
         set username = v_name, last_seen = now()
       where id = v_me.id
      returning * into v_me;
    else
      insert into public.users (username, secret_hash)
      values (v_name, v_hash)
      returning * into v_me;
    end if;
  exception when unique_violation then
    raise exception 'username_taken';
  end;

  return json_build_object('id', v_me.id, 'username', v_me.username);
end;
$$;

-- ────────────────────────────────────────────────────────────────────
--  RPC: send_message
-- ────────────────────────────────────────────────────────────────────

create or replace function public.send_message(
  p_secret    text,
  p_id        uuid,
  p_content   text,
  p_type      text,
  p_media_url text default null,
  p_reply_to  uuid default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     public.users;
  v_msg      public.messages;
  v_content  text := btrim(coalesce(p_content, ''));
  v_media    text := nullif(btrim(coalesce(p_media_url, '')), '');
  v_reply_to uuid := p_reply_to;
begin
  v_user := public.user_from_secret(p_secret);

  if p_type is null or p_type not in ('text', 'image', 'gif') then
    raise exception 'invalid_type';
  end if;

  if char_length(v_content) > 2000 then
    raise exception 'message_too_long';
  end if;

  if p_type = 'text' then
    if v_content = '' then
      raise exception 'empty_message';
    end if;
    v_media := null;
  else
    if v_media is null
       or char_length(v_media) > 1024
       or not (
         v_media ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/chat-media/[A-Za-z0-9/_.-]+$'
         or v_media ~ '^https://(media[0-9]*|i)\.giphy\.com/[A-Za-z0-9/_.-]+$'
       ) then
      raise exception 'invalid_media';
    end if;
  end if;

  -- Anti-spam sederhana: maksimal 8 pesan per 10 detik per user.
  if (
    select count(*) from public.messages
     where user_id = v_user.id and created_at > now() - interval '10 seconds'
  ) >= 8 then
    raise exception 'rate_limited';
  end if;

  if v_reply_to is not null and not exists (select 1 from public.messages where id = v_reply_to) then
    v_reply_to := null;
  end if;

  insert into public.messages (id, user_id, username, content, type, media_url, reply_to)
  values (coalesce(p_id, gen_random_uuid()), v_user.id, v_user.username, v_content, p_type, v_media, v_reply_to)
  returning * into v_msg;

  update public.users set last_seen = now() where id = v_user.id;

  return v_msg;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
--  RPC: delete_message — hanya pemilik pesan
-- ────────────────────────────────────────────────────────────────────

create or replace function public.delete_message(p_secret text, p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  v_user := public.user_from_secret(p_secret);

  delete from public.messages where id = p_id and user_id = v_user.id;
  if not found then
    raise exception 'not_allowed';
  end if;

  return true;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
--  RPC: touch_user — heartbeat last_seen
-- ────────────────────────────────────────────────────────────────────

create or replace function public.touch_user(p_secret text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  v_user := public.user_from_secret(p_secret);
  update public.users set last_seen = now() where id = v_user.id;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
--  RPC: search_messages — pencarian teks (case-insensitive)
-- ────────────────────────────────────────────────────────────────────

create or replace function public.search_messages(p_query text, p_limit int default 40)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
    from public.messages m
   where char_length(btrim(coalesce(p_query, ''))) >= 2
     and m.content ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

revoke execute on function public.join_chat(text, text)                             from public;
revoke execute on function public.send_message(text, uuid, text, text, text, uuid)  from public;
revoke execute on function public.delete_message(text, uuid)                        from public;
revoke execute on function public.touch_user(text)                                  from public;
revoke execute on function public.search_messages(text, int)                        from public;

grant execute on function public.join_chat(text, text)                            to anon, authenticated;
grant execute on function public.send_message(text, uuid, text, text, text, uuid) to anon, authenticated;
grant execute on function public.delete_message(text, uuid)                       to anon, authenticated;
grant execute on function public.touch_user(text)                                 to anon, authenticated;
grant execute on function public.search_messages(text, int)                       to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
--  Realtime: siarkan perubahan tabel messages
-- ────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
--  Storage: bucket publik untuk gambar & GIF (maks 8 MB)
-- ────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "daget: upload chat media" on storage.objects;
create policy "daget: upload chat media"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'chat-media'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
  );

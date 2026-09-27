-- ════════════════════════════════════════════════════════════════════
--  DAGET — Login Discord, voice note, admin
--  Jalankan SETELAH schema.sql. Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════

-- ── Pengaturan Discord ──────────────────────────────────────────────
alter table public.app_settings add column if not exists require_discord    boolean not null default false;
alter table public.app_settings add column if not exists discord_guild_id   text;
alter table public.app_settings add column if not exists discord_role_id    text;
alter table public.app_settings add column if not exists discord_guild_name text;
alter table public.app_settings add column if not exists discord_invite_url text;

-- ── Profil user dari Discord ────────────────────────────────────────
alter table public.users alter column secret_hash drop not null;
alter table public.users add column if not exists auth_id          uuid references auth.users (id) on delete cascade;
alter table public.users add column if not exists discord_id       text;
alter table public.users add column if not exists discord_username text;
alter table public.users add column if not exists avatar_url       text;
alter table public.users add column if not exists verified_at      timestamptz;
alter table public.users add column if not exists is_admin         boolean not null default false;
alter table public.users add column if not exists banned           boolean not null default false;

create unique index if not exists users_auth_id_key    on public.users (auth_id);
create unique index if not exists users_discord_id_key on public.users (discord_id);

-- Nama Discord boleh sama (seperti di Discord); keunikan hanya untuk user lama (tanpa Discord).
drop index if exists public.users_username_lower_key;
create unique index if not exists users_username_lower_legacy_key on public.users (lower(username)) where auth_id is null;

alter table public.users drop constraint if exists users_username_format;
alter table public.users add constraint users_username_format check (
  (auth_id is null and char_length(username) between 2 and 24 and username ~ '^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$')
  or (auth_id is not null and char_length(btrim(username)) between 1 and 32)
);

-- ── Pesan: voice note + snapshot avatar/handle ──────────────────────
alter table public.messages add column if not exists avatar_url    text;
alter table public.messages add column if not exists author_handle text;
alter table public.messages add column if not exists duration_ms   int;

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check check (type in ('text', 'image', 'gif', 'voice'));

alter table public.messages drop constraint if exists messages_payload_check;
alter table public.messages add constraint messages_payload_check check (
  (type = 'text' and char_length(btrim(content)) > 0 and media_url is null)
  or (type in ('image', 'gif', 'voice') and media_url is not null)
);

-- ── Penjaga pesan: mode istirahat + wajib Discord ───────────────────
create or replace function public.block_messages_during_maintenance()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_author   public.users;
begin
  select * into v_settings from public.app_settings where id = 1;
  select * into v_author from public.users where id = new.user_id;

  -- Selama mode istirahat hanya admin yang bisa mengirim (untuk tes).
  if v_settings.maintenance and not coalesce(v_author.is_admin, false) then
    raise exception 'maintenance';
  end if;

  if v_settings.require_discord and not (
    v_author.id is not null and v_author.auth_id is not null and v_author.verified_at is not null and not v_author.banned
  ) then
    raise exception 'discord_required';
  end if;
  return new;
end;
$$;

-- ── RPC untuk user yang login Discord ───────────────────────────────
create or replace function public.current_member()
returns public.users
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  select * into v_user from public.users where auth_id = auth.uid();
  if v_user.id is null or v_user.verified_at is null then
    raise exception 'not_verified';
  end if;
  if v_user.banned then
    raise exception 'banned';
  end if;
  return v_user;
end;
$$;

revoke execute on function public.current_member() from public, anon, authenticated;

create or replace function public.member_json(u public.users)
returns json
language sql
immutable
set search_path = ''
as $$
  select json_build_object(
    'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
    'discord_username', u.discord_username, 'is_admin', u.is_admin
  );
$$;

revoke execute on function public.member_json(public.users) from public, anon, authenticated;

-- Heartbeat + profil saat ini.
create or replace function public.touch_member()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  v_user := public.current_member();
  update public.users set last_seen = now() where id = v_user.id;
  return public.member_json(v_user);
end;
$$;

create or replace function public.post_message(
  p_id          uuid,
  p_content     text,
  p_type        text,
  p_media_url   text default null,
  p_reply_to    uuid default null,
  p_duration_ms int  default null
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
  v_duration int  := null;
begin
  v_user := public.current_member();

  if p_type is null or p_type not in ('text', 'image', 'gif', 'voice') then
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
  elsif p_type = 'voice' then
    if v_media is null
       or char_length(v_media) > 1024
       or v_media !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/chat-media/[A-Za-z0-9/_.-]+$' then
      raise exception 'invalid_media';
    end if;
    v_duration := least(greatest(coalesce(p_duration_ms, 0), 0), 300000);
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

  if (
    select count(*) from public.messages
     where user_id = v_user.id and created_at > now() - interval '10 seconds'
  ) >= 8 then
    raise exception 'rate_limited';
  end if;

  if v_reply_to is not null and not exists (select 1 from public.messages where id = v_reply_to) then
    v_reply_to := null;
  end if;

  insert into public.messages (id, user_id, username, content, type, media_url, reply_to, avatar_url, author_handle, duration_ms)
  values (coalesce(p_id, gen_random_uuid()), v_user.id, v_user.username, v_content, p_type, v_media, v_reply_to,
          v_user.avatar_url, v_user.discord_username, v_duration)
  returning * into v_msg;

  update public.users set last_seen = now() where id = v_user.id;
  return v_msg;
end;
$$;

-- Hapus pesan sendiri, atau pesan siapa pun jika admin.
create or replace function public.remove_message(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  v_user := public.current_member();
  delete from public.messages where id = p_id and (user_id = v_user.id or v_user.is_admin);
  if not found then
    raise exception 'not_allowed';
  end if;
  return true;
end;
$$;

revoke execute on function public.touch_member()                                         from public, anon;
revoke execute on function public.post_message(uuid, text, text, text, uuid, int)       from public, anon;
revoke execute on function public.remove_message(uuid)                                   from public, anon;
grant  execute on function public.touch_member()                                         to authenticated;
grant  execute on function public.post_message(uuid, text, text, text, uuid, int)       to authenticated;
grant  execute on function public.remove_message(uuid)                                   to authenticated;

-- ── Storage: gambar + voice note, hanya user login, di folder miliknya ──
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/x-m4a'
       ]
 where id = 'chat-media';

drop policy if exists "daget: upload chat media" on storage.objects;
drop policy if exists "daget: members upload chat media" on storage.objects;
create policy "daget: members upload chat media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'webm', 'ogg', 'm4a', 'mp4', 'aac', 'mp3')
  );

-- ════════════════════════════════════════════════════════════════════
--  DAGET — Role (admin/moderator), profil, @mention, @everyone, search by
--  Jalankan SETELAH discord_voice.sql. Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════

-- ── Role ────────────────────────────────────────────────────────────
alter table public.users add column if not exists role text not null default 'member';
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('member', 'mod', 'admin'));

-- is_admin menjadi turunan dari role (kolom lama dipertahankan agar kode lama tetap jalan).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'is_admin' and is_generated = 'NEVER'
  ) then
    update public.users set role = 'admin' where is_admin and role = 'member';
    alter table public.users drop column is_admin;
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'is_admin'
  ) then
    alter table public.users add column is_admin boolean generated always as (role = 'admin') stored;
  end if;
end;
$$;

-- ── Detail profil dari Discord ──────────────────────────────────────
alter table public.users add column if not exists banner_url      text;
alter table public.users add column if not exists accent_color    int;
alter table public.users add column if not exists guild_joined_at timestamptz;

-- ── Mention ─────────────────────────────────────────────────────────
alter table public.messages add column if not exists mentions         uuid[]  not null default '{}';
alter table public.messages add column if not exists mention_everyone boolean not null default false;

create index if not exists messages_mentions_idx     on public.messages using gin (mentions);
create index if not exists messages_type_created_idx on public.messages (type, created_at desc);

-- ── Helper ──────────────────────────────────────────────────────────
create or replace function public.member_json(u public.users)
returns json
language sql
immutable
set search_path = ''
as $$
  select json_build_object(
    'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
    'discord_username', u.discord_username, 'role', u.role, 'is_admin', u.role = 'admin'
  );
$$;

revoke execute on function public.member_json(public.users) from public, anon, authenticated;

-- ── Kirim pesan (dengan mention & @everyone) ────────────────────────
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
  v_mentions uuid[];
  v_everyone boolean;
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

  -- @username Discord yang disebut → id user.
  select coalesce(array_agg(distinct u.id), '{}')
    into v_mentions
    from public.users u
   where u.auth_id is not null
     and u.verified_at is not null
     and lower(u.discord_username) in (
       select lower(x.m[1]) from regexp_matches(v_content, '@([A-Za-z0-9_.]{2,32})', 'g') as x(m)
     );

  -- @everyone / @here hanya berlaku untuk admin & moderator.
  v_everyone := v_user.role in ('admin', 'mod')
    and v_content ~* '(^|[^A-Za-z0-9_])@(everyone|here)([^A-Za-z0-9_]|$)';

  insert into public.messages (
    id, user_id, username, content, type, media_url, reply_to,
    avatar_url, author_handle, duration_ms, mentions, mention_everyone
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_user.id, v_user.username, v_content, p_type, v_media, v_reply_to,
    v_user.avatar_url, v_user.discord_username, v_duration, v_mentions, v_everyone
  )
  returning * into v_msg;

  update public.users set last_seen = now() where id = v_user.id;
  return v_msg;
end;
$$;

-- ── Hapus pesan: pemilik, admin, atau moderator ─────────────────────
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
  delete from public.messages where id = p_id and (user_id = v_user.id or v_user.role in ('admin', 'mod'));
  if not found then
    raise exception 'not_allowed';
  end if;
  return true;
end;
$$;

-- ── Daftar anggota (untuk mention, warna role, daftar online/offline) ──
create or replace function public.list_members()
returns table (
  id               uuid,
  username         text,
  discord_username text,
  avatar_url       text,
  role             text,
  banned           boolean,
  last_seen        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.current_member();
  return query
    select u.id, u.username, u.discord_username, u.avatar_url, u.role, u.banned, u.last_seen
      from public.users u
     where u.auth_id is not null and u.verified_at is not null
     order by lower(u.username);
end;
$$;

-- ── Profil satu anggota ─────────────────────────────────────────────
create or replace function public.get_profile(p_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user public.users;
begin
  perform public.current_member();
  select * into v_user from public.users where id = p_id;
  if v_user.id is null then
    raise exception 'not_found';
  end if;
  return json_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'discord_username', v_user.discord_username,
    'discord_id', v_user.discord_id,
    'avatar_url', v_user.avatar_url,
    'banner_url', v_user.banner_url,
    'accent_color', v_user.accent_color,
    'role', v_user.role,
    'banned', v_user.banned,
    'is_discord', v_user.auth_id is not null,
    'created_at', v_user.created_at,
    'guild_joined_at', v_user.guild_joined_at,
    'last_seen', v_user.last_seen,
    'message_count', (select count(*) from public.messages m where m.user_id = v_user.id)
  );
end;
$$;

-- ── Atur role (khusus admin) ────────────────────────────────────────
create or replace function public.set_member_role(p_id uuid, p_role text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me     public.users;
  v_target public.users;
begin
  v_me := public.current_member();
  if v_me.role <> 'admin' then
    raise exception 'not_allowed';
  end if;
  if p_role not in ('member', 'mod', 'admin') then
    raise exception 'invalid_role';
  end if;
  if p_id = v_me.id then
    raise exception 'cannot_change_self';
  end if;

  update public.users set role = p_role
   where id = p_id and auth_id is not null and verified_at is not null
  returning * into v_target;
  if v_target.id is null then
    raise exception 'not_found';
  end if;
  return public.member_json(v_target);
end;
$$;

-- ── Blokir / buka blokir (admin & moderator) ────────────────────────
create or replace function public.set_member_banned(p_id uuid, p_banned boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me     public.users;
  v_target public.users;
begin
  v_me := public.current_member();
  if v_me.role not in ('admin', 'mod') then
    raise exception 'not_allowed';
  end if;
  if p_id = v_me.id then
    raise exception 'cannot_change_self';
  end if;

  select * into v_target from public.users where id = p_id;
  if v_target.id is null then
    raise exception 'not_found';
  end if;
  -- Admin/moderator harus diturunkan dulu sebelum bisa diblokir.
  if v_target.role in ('admin', 'mod') then
    raise exception 'not_allowed';
  end if;

  update public.users set banned = coalesce(p_banned, false) where id = p_id;
  return coalesce(p_banned, false);
end;
$$;

-- ── Search by: teks + dari siapa + menyebut siapa + jenis ───────────
create or replace function public.search_messages_v2(
  p_query    text default null,
  p_from     uuid default null,
  p_mentions uuid default null,
  p_has      text default null,
  p_limit    int  default 50
)
returns setof public.messages
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
    from public.messages m
   where (char_length(btrim(coalesce(p_query, ''))) >= 2 or p_from is not null or p_mentions is not null or p_has is not null)
     and (
       char_length(btrim(coalesce(p_query, ''))) = 0
       or m.content ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
     and (p_from is null or m.user_id = p_from)
     and (p_mentions is null or p_mentions = any (m.mentions))
     and (
       p_has is null
       or (p_has = 'media' and m.type in ('image', 'gif', 'voice'))
       or (p_has in ('image', 'gif', 'voice') and m.type = p_has)
       or (p_has = 'link' and m.content ~* 'https?://')
     )
   order by m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke execute on function public.list_members()                                         from public, anon;
revoke execute on function public.get_profile(uuid)                                       from public, anon;
revoke execute on function public.set_member_role(uuid, text)                             from public, anon;
revoke execute on function public.set_member_banned(uuid, boolean)                        from public, anon;
revoke execute on function public.search_messages_v2(text, uuid, uuid, text, int)         from public;
grant  execute on function public.list_members()                                         to authenticated;
grant  execute on function public.get_profile(uuid)                                       to authenticated;
grant  execute on function public.set_member_role(uuid, text)                             to authenticated;
grant  execute on function public.set_member_banned(uuid, boolean)                        to authenticated;
grant  execute on function public.search_messages_v2(text, uuid, uuid, text, int)         to anon, authenticated;

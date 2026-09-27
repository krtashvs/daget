-- ════════════════════════════════════════════════════════════════════
--  DAGET — Mention role (@guardian, @vice-principal, …)
--  Jalankan SETELAH discord_roles.sql. Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════

-- Slug untuk ditulis di chat: "Rizz academy student" → rizz-academy-student
alter table public.discord_roles
  add column if not exists slug text
  generated always as (btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-')) stored;

create unique index if not exists discord_roles_slug_key on public.discord_roles (slug);

alter table public.messages add column if not exists mention_roles text[] not null default '{}';
create index if not exists messages_mention_roles_idx on public.messages using gin (mention_roles);

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
  v_tokens   text[];
  v_roles    text[];
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

  -- Semua token @xxx di pesan.
  select coalesce(array_agg(distinct lower(x.m[1])), '{}')
    into v_tokens
    from regexp_matches(v_content, '@([A-Za-z0-9_.-]{2,40})', 'g') as x(m);

  -- Role disebut lewat slug-nya (role didahulukan jika sama dengan username).
  select coalesce(array_agg(r.id), '{}')
    into v_roles
    from public.discord_roles r
   where r.slug = any (v_tokens);

  -- @username Discord yang disebut → id user.
  select coalesce(array_agg(distinct u.id), '{}')
    into v_mentions
    from public.users u
   where u.auth_id is not null
     and u.verified_at is not null
     and lower(u.discord_username) = any (v_tokens)
     and lower(u.discord_username) not in (select r.slug from public.discord_roles r where r.id = any (v_roles));

  -- @everyone / @here boleh dipakai semua anggota.
  v_everyone := v_content ~* '(^|[^A-Za-z0-9_])@(everyone|here)([^A-Za-z0-9_]|$)';

  insert into public.messages (
    id, user_id, username, content, type, media_url, reply_to,
    avatar_url, author_handle, duration_ms, mentions, mention_everyone, mention_roles
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_user.id, v_user.username, v_content, p_type, v_media, v_reply_to,
    v_user.avatar_url, v_user.discord_username, v_duration, v_mentions, v_everyone, v_roles
  )
  returning * into v_msg;

  update public.users set last_seen = now() where id = v_user.id;
  return v_msg;
end;
$$;

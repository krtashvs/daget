-- ════════════════════════════════════════════════════════════════════
--  DAGET — Role kosmetik yang disamakan dengan server Discord
--  Role hanya memberi WARNA nama (tanpa izin apa pun). Role user dibaca
--  dari Discord saat login (discord-verify) dan disimpan di users.discord_role_ids.
--  Jalankan SETELAH roles_profiles_search.sql. Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.discord_roles (
  id       text primary key,                 -- Role ID Discord
  name     text not null,
  color    text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position int  not null default 0           -- makin besar = makin tinggi (warna yang dipakai)
);

alter table public.discord_roles enable row level security;
revoke all on table public.discord_roles from anon, authenticated;
grant select on table public.discord_roles to anon, authenticated;

drop policy if exists "discord roles are readable by everyone" on public.discord_roles;
create policy "discord roles are readable by everyone"
  on public.discord_roles for select
  to anon, authenticated
  using (true);

alter table public.users add column if not exists discord_role_ids text[] not null default '{}';
alter table public.users add column if not exists roles_synced_at  timestamptz;

-- Profil untuk client: tambah penanda perlu sinkron role.
create or replace function public.member_json(u public.users)
returns json
language sql
immutable
set search_path = ''
as $$
  select json_build_object(
    'id', u.id, 'username', u.username, 'avatar_url', u.avatar_url,
    'discord_username', u.discord_username, 'role', u.role, 'is_admin', u.role = 'admin',
    'needs_role_sync', u.auth_id is not null and u.roles_synced_at is null
  );
$$;

revoke execute on function public.member_json(public.users) from public, anon, authenticated;

-- Daftar anggota kini menyertakan role Discord (hanya role yang terdaftar di discord_roles).
drop function if exists public.list_members();
create function public.list_members()
returns table (
  id               uuid,
  username         text,
  discord_username text,
  avatar_url       text,
  role             text,
  banned           boolean,
  last_seen        timestamptz,
  role_ids         text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.current_member();
  return query
    select u.id, u.username, u.discord_username, u.avatar_url, u.role, u.banned, u.last_seen,
           coalesce(array(select r.id from public.discord_roles r where r.id = any (u.discord_role_ids) order by r.position desc), '{}')
      from public.users u
     where u.auth_id is not null and u.verified_at is not null
     order by lower(u.username);
end;
$$;

revoke execute on function public.list_members() from public, anon;
grant  execute on function public.list_members() to authenticated;

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
    'roles_synced_at', v_user.roles_synced_at,
    'message_count', (select count(*) from public.messages m where m.user_id = v_user.id),
    'discord_roles', coalesce((
      select json_agg(json_build_object('id', r.id, 'name', r.name, 'color', r.color, 'color2', r.color2) order by r.position desc)
        from public.discord_roles r
       where r.id = any (v_user.discord_role_ids)
    ), '[]'::json)
  );
end;
$$;

-- ── Warna gradasi (Discord "enhanced role styles"): color → color2 ──
alter table public.discord_roles add column if not exists color2 text;
alter table public.discord_roles drop constraint if exists discord_roles_color2_check;
alter table public.discord_roles add constraint discord_roles_color2_check check (color2 is null or color2 ~ '^#[0-9A-Fa-f]{6}$');

-- ════════════════════════════════════════════════════════════════════
--  DAGET — Reaksi emoji + pengaturan live YouTube
--  Jalankan SETELAH role_mentions.sql. Aman dijalankan ulang.
-- ════════════════════════════════════════════════════════════════════

-- ── Reaksi emoji ────────────────────────────────────────────────────
create table if not exists public.message_reactions (
  message_id uuid        not null references public.messages (id) on delete cascade,
  user_id    uuid        not null references public.users (id) on delete cascade,
  emoji      text        not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint message_reactions_emoji_check check (char_length(emoji) between 1 and 16 and emoji !~ '[[:space:]<>]')
);

create index if not exists message_reactions_message_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;
grant select on table public.message_reactions to anon, authenticated;

drop policy if exists "reactions are readable by everyone" on public.message_reactions;
create policy "reactions are readable by everyone"
  on public.message_reactions for select
  to anon, authenticated
  using (true);

-- Tambah / hapus reaksi (toggle). Mengembalikan true jika sekarang aktif.
create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  public.users;
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  v_user := public.current_member();

  if char_length(v_emoji) not between 1 and 16 or v_emoji ~ '[[:space:]<>]' or v_emoji ~ '[A-Za-z0-9]' then
    raise exception 'invalid_emoji';
  end if;
  if not exists (select 1 from public.messages where id = p_message_id) then
    raise exception 'not_found';
  end if;

  delete from public.message_reactions
   where message_id = p_message_id and user_id = v_user.id and emoji = v_emoji;
  if found then
    return false;
  end if;

  -- Batas: 20 jenis emoji per pesan.
  if (select count(distinct emoji) from public.message_reactions where message_id = p_message_id) >= 20
     and not exists (select 1 from public.message_reactions where message_id = p_message_id and emoji = v_emoji) then
    raise exception 'too_many_reactions';
  end if;

  insert into public.message_reactions (message_id, user_id, emoji) values (p_message_id, v_user.id, v_emoji);
  return true;
end;
$$;

revoke execute on function public.toggle_reaction(uuid, text) from public, anon;
grant  execute on function public.toggle_reaction(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;

-- ── Live YouTube ────────────────────────────────────────────────────
--  youtube_channel : handle (@nama) atau channel id (UC…)
--  live_mode       : 'auto' (cek YouTube otomatis) | 'on' (paksa live, pakai live_video_id) | 'off'
alter table public.app_settings add column if not exists youtube_channel text;
alter table public.app_settings add column if not exists youtube_name    text;
alter table public.app_settings add column if not exists live_mode       text not null default 'auto';
alter table public.app_settings add column if not exists live_video_id   text;
alter table public.app_settings drop constraint if exists app_settings_live_mode_check;
alter table public.app_settings add constraint app_settings_live_mode_check check (live_mode in ('auto', 'on', 'off'));

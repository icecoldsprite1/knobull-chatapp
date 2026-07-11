-- =====================================================================
-- Session-based metering + free tier.
--
-- The billing unit becomes a CHAT SESSION (start -> resolved = 1), not an
-- answered question. Weekly caps: free = 2, standard = 5, unlimited = none.
-- A session is "ended" when an advisor resolves it; the student can then
-- start a new (separately counted) session.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Session lifecycle columns.
-- ---------------------------------------------------------------------
alter table sessions
  add column if not exists status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users,
  add column if not exists week_start date;

-- Constrain status values (add the check once).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_status_check'
  ) then
    alter table sessions
      add constraint sessions_status_check check (status in ('open', 'resolved'));
  end if;
end $$;

-- Backfill week_start for existing rows to the Monday (UTC) of their creation.
update sessions
set week_start = (date_trunc('week', coalesce(created_at, now()) at time zone 'UTC'))::date
where week_start is null;

-- ---------------------------------------------------------------------
-- 2. Drop the old one-session-per-student uniqueness so students can have
--    many sessions over time. Replace it with a PARTIAL unique index that
--    only allows a single OPEN session per student at a time (race-safe).
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Drop any unique CONSTRAINT on sessions that covers student_id.
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.sessions'::regclass
      and con.contype = 'u'
      and exists (
        select 1
        from unnest(con.conkey) as k(attnum)
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = k.attnum
        where att.attname = 'student_id'
      )
  loop
    execute format('alter table public.sessions drop constraint %I', r.conname);
  end loop;
end $$;

-- Also drop bare unique indexes that may have enforced it.
drop index if exists sessions_student_id_key;
drop index if exists sessions_student_id_idx;

-- At most one OPEN session per student.
create unique index if not exists uniq_open_session_per_student
  on sessions (student_id)
  where status = 'open';

-- Fast weekly counting.
create index if not exists idx_sessions_student_week
  on sessions (student_id, week_start);

-- ---------------------------------------------------------------------
-- 3. Per-week admin session grants (adds/removes allowance for one week).
--    Kept separate from `memberships` so grants survive PayPal webhook
--    updates and also work for free-tier users (who have no membership row).
-- ---------------------------------------------------------------------
create table if not exists weekly_session_grants (
  user_id uuid references auth.users not null,
  week_start date not null,
  bonus integer not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, week_start)
);

alter table weekly_session_grants enable row level security;

drop policy if exists "grants_select_own" on weekly_session_grants;
create policy "grants_select_own" on weekly_session_grants
  for select using (auth.uid() = user_id);

drop policy if exists "grants_select_admin" on weekly_session_grants;
create policy "grants_select_admin" on weekly_session_grants
  for select using (public.is_admin(auth.uid()));

-- All writes go through the backend (service_role); block client writes.
revoke insert, update, delete on weekly_session_grants from anon, authenticated;

-- =====================================================================
-- Advisor queue performance: denormalize each session's message summary
-- onto the session row so the dashboard queue is a single, bounded query
-- instead of scanning the messages table on every refresh.
--
-- Run once in the Supabase SQL Editor, AFTER supabase_free_tier_sessions.sql.
-- Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Denormalized columns.
-- ---------------------------------------------------------------------
alter table sessions
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_sender_type text,
  add column if not exists last_student_message_at timestamptz,
  add column if not exists last_expert_reply_at timestamptz,
  add column if not exists student_message_count integer not null default 0;

-- ---------------------------------------------------------------------
-- 2. Backfill from existing messages.
-- ---------------------------------------------------------------------
with agg as (
  select
    session_id,
    max(created_at) as last_message_at,
    count(*) filter (where sender_type = 'student') as student_message_count,
    max(created_at) filter (where sender_type = 'student') as last_student_message_at,
    max(created_at) filter (where sender_type = 'expert') as last_expert_reply_at
  from messages
  group by session_id
),
last_msg as (
  select distinct on (session_id)
    session_id, content, sender_type
  from messages
  order by session_id, created_at desc
)
update sessions s
set
  last_message_at = a.last_message_at,
  student_message_count = coalesce(a.student_message_count, 0),
  last_student_message_at = a.last_student_message_at,
  last_expert_reply_at = a.last_expert_reply_at,
  last_message_preview = left(regexp_replace(coalesce(l.content, ''), '\s+', ' ', 'g'), 120),
  last_message_sender_type = l.sender_type
from agg a
left join last_msg l on l.session_id = a.session_id
where s.id = a.session_id;

-- ---------------------------------------------------------------------
-- 3. Keep the summary current on every new message.
--    A single-row UPDATE; runs for messages from every code path
--    (welcome/handoff guide messages and student/expert messages).
-- ---------------------------------------------------------------------
create or replace function public.sync_session_message_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update sessions
  set
    last_message_at = NEW.created_at,
    last_message_preview = left(regexp_replace(coalesce(NEW.content, ''), '\s+', ' ', 'g'), 120),
    last_message_sender_type = NEW.sender_type,
    student_message_count = student_message_count
      + (case when NEW.sender_type = 'student' then 1 else 0 end),
    last_student_message_at = case
      when NEW.sender_type = 'student' then NEW.created_at
      else last_student_message_at
    end,
    last_expert_reply_at = case
      when NEW.sender_type = 'expert' then NEW.created_at
      else last_expert_reply_at
    end
  where id = NEW.session_id;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_session_message_summary on messages;
create trigger trg_sync_session_message_summary
  after insert on messages
  for each row execute function public.sync_session_message_summary();

-- ---------------------------------------------------------------------
-- 4. Indexes for the two queue reads (active open list, recent resolved).
-- ---------------------------------------------------------------------
create index if not exists idx_sessions_open_last_message
  on sessions (last_message_at desc nulls last)
  where status = 'open';

create index if not exists idx_sessions_resolved_recent
  on sessions (resolved_at desc nulls last)
  where status = 'resolved';

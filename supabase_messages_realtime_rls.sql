-- =====================================================================
-- Make the messages SELECT policy Realtime-friendly.
--
-- WHY: Supabase Realtime (postgres_changes) only reliably evaluates RLS
-- policies that reference the changed row's OWN columns plus auth.uid().
-- The previous policy used a subquery into `sessions`, which regular reads
-- handle fine but Realtime does not — so students stopped receiving their
-- own messages live (they only appeared after re-opening the chat, which
-- does a normal SELECT).
--
-- FIX: denormalize the owning student's id onto each message row, then use a
-- plain column comparison in the student policy. Admins (all advisors) keep a
-- self-contained boolean function policy.
--
-- Run once in the Supabase SQL Editor, AFTER supabase_rls_read_policies.sql.
-- Safe to re-run (idempotent).
-- =====================================================================

-- 1. Denormalized owner column.
alter table messages
  add column if not exists student_id uuid;

-- 2. Backfill existing rows from their session.
update messages m
set student_id = s.student_id
from sessions s
where s.id = m.session_id
  and m.student_id is null;

-- 3. Populate student_id automatically on every insert (all code paths:
--    welcome/handoff guide messages and student/expert messages).
create or replace function public.set_message_student_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.student_id is null then
    select student_id into NEW.student_id from sessions where id = NEW.session_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_set_message_student_id on messages;
create trigger trg_set_message_student_id
  before insert on messages
  for each row execute function public.set_message_student_id();

-- 4. Replace the subquery-based policy with Realtime-friendly policies.
drop policy if exists "messages_select_participant" on messages;

drop policy if exists "messages_select_student" on messages;
create policy "messages_select_student" on messages
  for select using (student_id = auth.uid());

drop policy if exists "messages_select_admin" on messages;
create policy "messages_select_admin" on messages
  for select using (public.is_admin(auth.uid()));

-- Helps RLS checks and lookups by owner.
create index if not exists idx_messages_student_id on messages (student_id);

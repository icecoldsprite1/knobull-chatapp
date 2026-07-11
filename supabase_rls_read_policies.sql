-- =====================================================================
-- Read (SELECT) Row Level Security for the chat data model.
--
-- WHY THIS EXISTS
-- The React client talks to Supabase directly with the public anon key +
-- the signed-in user's JWT to read `sessions` and `messages` (and to open
-- realtime subscriptions on them). Earlier hardening only revoked
-- INSERT/UPDATE/DELETE; it never constrained SELECT. Without the policies
-- below, any authenticated user can read EVERY student's private advising
-- messages (e.g. by subscribing to another student's session_id).
--
-- Model:
--   * Students may read ONLY their own sessions and the messages in them.
--   * Admins (rows in `admins`) may read all sessions and all messages.
--   * The Express backend uses the service_role key, which bypasses RLS,
--     so backend reads/writes are unaffected.
--
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Admin check helper.
-- SECURITY DEFINER so the lookup on `admins` is not itself subject to the
-- caller's RLS (prevents recursion / empty-result surprises inside policies).
-- ---------------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- sessions: students read their own; assigned experts + admins read all.
-- ---------------------------------------------------------------------
alter table sessions enable row level security;

drop policy if exists "sessions_select_student" on sessions;
create policy "sessions_select_student" on sessions
  for select using (student_id = auth.uid());

drop policy if exists "sessions_select_assigned_expert" on sessions;
create policy "sessions_select_assigned_expert" on sessions
  for select using (expert_id = auth.uid());

drop policy if exists "sessions_select_admin" on sessions;
create policy "sessions_select_admin" on sessions
  for select using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- messages: readable by the owning student, the assigned expert, or admins.
-- ---------------------------------------------------------------------
alter table messages enable row level security;

drop policy if exists "messages_select_participant" on messages;
create policy "messages_select_participant" on messages
  for select using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from sessions s
      where s.id = messages.session_id
        and (s.student_id = auth.uid() or s.expert_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- question_usage: users already read their own (see supabase_memberships.sql);
-- admins additionally read all so the advisor dashboard usage counts work.
-- ---------------------------------------------------------------------
alter table question_usage enable row level security;

drop policy if exists "question_usage_select_admin" on question_usage;
create policy "question_usage_select_admin" on question_usage
  for select using (public.is_admin(auth.uid()));

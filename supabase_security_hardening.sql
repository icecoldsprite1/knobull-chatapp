-- Security hardening for the paid chat flow.
-- Run this in Supabase SQL Editor after confirming the backend /api/send-message
-- route is deployed. The service_role key still bypasses RLS for backend writes.

-- Browser clients should not create/update sessions directly. Sessions are
-- created and claimed through the Express backend, which performs auth checks.
drop policy if exists "Students create sessions" on sessions;
drop policy if exists "Admins/Experts update sessions" on sessions;
revoke insert, update, delete on sessions from anon, authenticated;

-- Browser clients should not insert messages directly. Messages are sent through
-- the Express backend so membership status and session access are checked before
-- writing to the database.
drop policy if exists "Insert messages" on messages;
drop policy if exists "messages: no client insert" on messages;
create policy "messages: no client insert" on messages
  for insert with check (false);
revoke insert, update, delete on messages from anon, authenticated;

-- Memberships are payment records. Clients may read their own record only; all
-- writes must come from the backend after PayPal verification.
revoke insert, update, delete on memberships from anon, authenticated;

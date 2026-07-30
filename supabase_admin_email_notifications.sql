-- Per-admin email notification preference.
--
-- Adds an on/off switch (default ON) to public.admins so every advisor is
-- automatically opted in to email alerts and can turn their own alerts off from
-- the Advisor Dashboard. Recipients are read live from this table by the server
-- (server/src/services/email.service.js) — no manual recipient list to maintain.
--
-- Safe to run more than once.

alter table public.admins
  add column if not exists email_notifications boolean not null default true;

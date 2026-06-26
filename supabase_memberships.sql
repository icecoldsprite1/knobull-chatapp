-- PayPal subscription records for Knobull memberships.
-- Run this once in Supabase SQL Editor before testing the subscription flow.

create table if not exists memberships (
  user_id uuid primary key references auth.users not null,
  plan_key text not null check (
    plan_key in (
      'standard_monthly',
      'standard_yearly',
      'unlimited_monthly',
      'unlimited_yearly'
    )
  ),
  tier text not null check (tier in ('standard', 'unlimited')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  question_limit_weekly integer,
  paypal_subscription_id text not null unique,
  paypal_plan_id text,
  status text not null default 'approval_pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table memberships enable row level security;

drop policy if exists "Users read own membership" on memberships;
create policy "Users read own membership" on memberships
  for select using (auth.uid() = user_id);

revoke insert, update, delete on memberships from anon, authenticated;

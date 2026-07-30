# CLAUDE.md

This file gives future AI/code assistants the project context needed to work safely in this repo.

## Project

KnoBull Chat App is a React/Vite frontend with a Node/Express backend. It supports:

- Student email auth through Supabase
- Advisor/admin login through Supabase Auth plus `public.admins`
- Student/advisor chat sessions stored in Supabase
- Supabase Realtime message updates
- PayPal subscriptions
- Weekly answered-question limits
- Optional Firebase Cloud Messaging advisor notifications
- Netlify deployment using static frontend plus Netlify Functions wrapping Express

## Repo Structure

```text
client/                 React + Vite frontend
server/                 Express API server
server/src/routes/      API route definitions
server/src/controllers/ Route handlers
server/src/services/    Shared backend business logic
netlify/functions/api.js Express wrapper for Netlify Functions
netlify.toml            Netlify build, functions, and redirect config
supabase_*.sql          Supabase schema/RLS/supporting SQL
```

## Local Development

Run backend:

```bash
cd server
npm start
```

Run frontend:

```bash
cd client
npm run dev
```

The local frontend normally runs on `http://localhost:5173`. The local backend runs on `http://localhost:3000`.

`client/vite.config.js` proxies `/api/*` to `http://localhost:3000` for local development. `client/.env` may also set:

```env
VITE_API_URL=http://localhost:3000/api
```

After backend route changes, restart `server`. After Vite config/env changes, restart `client`.

## Build / Verification

Useful checks:

```bash
npm run build --prefix client
node --check server/server.js
node --check server/src/routes/api.routes.js
node --check server/src/controllers/session.controller.js
node --check server/src/controllers/message.controller.js
```

The Vite build may warn about a JS chunk over 500 kB. That warning already exists and is not necessarily a failure.

## Deployment

The low-cost deployment target is Netlify.

`netlify.toml` does:

```text
build command: npm install --prefix server && npm install --prefix client && npm run build --prefix client
publish: client/dist
functions: netlify/functions
```

Redirects:

- `/api/*` -> `/.netlify/functions/api/:splat`
- `/health` -> `/.netlify/functions/api/health`
- `/*` -> `/index.html`

The current temporary chat URL discussed during development is:

```text
https://knobull-chat.netlify.app
```

The separate main site repo is:

```text
/Users/codyqiu/student-knobull-heroku
```

In that repo, chat links live in:

```text
views/navbar.ejs
views/home.ejs
```

## Environment Variables

Do not commit `.env` files or secrets.

Frontend variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_HCAPTCHA_SITEKEY=
VITE_PAYPAL_CLIENT_ID=
VITE_PAYPAL_STANDARD_MONTHLY_PLAN_ID=
VITE_PAYPAL_STANDARD_YEARLY_PLAN_ID=
VITE_PAYPAL_UNLIMITED_MONTHLY_PLAN_ID=
VITE_PAYPAL_UNLIMITED_YEARLY_PLAN_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

Backend variables:

```env
PORT=3000
SUPABASE_URL=
SUPABASE_SECRET_KEY=
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_STANDARD_MONTHLY_PLAN_ID=
PAYPAL_STANDARD_YEARLY_PLAN_ID=
PAYPAL_UNLIMITED_MONTHLY_PLAN_ID=
PAYPAL_UNLIMITED_YEARLY_PLAN_ID=
PAYPAL_WEBHOOK_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=
FIREBASE_SERVICE_ACCOUNT_PATH=
GMAIL_USER=
GMAIL_APP_PASSWORD=
RESEND_API_KEY=
NOTIFY_FROM_EMAIL=
ADVISOR_NOTIFY_EMAIL=
```

Advisor email alerts (`server/src/services/email.service.js`): server-side emails
on new chat / new student message. Two transports — **Gmail SMTP via Nodemailer**
(`GMAIL_USER` + `GMAIL_APP_PASSWORD`; preferred, no domain needed, sends to
anyone) or **Resend** (`RESEND_API_KEY`; its sandbox sender only reaches the
account owner until a domain is verified via `NOTIFY_FROM_EMAIL`). Gmail wins if
both are set. Recipients are read live from `admins` (each toggles their own
alerts on the dashboard); `ADVISOR_NOTIFY_EMAIL` is an optional extra recipient.
No transport set = safe no-op. See `DEPLOY.md` §8.

For Netlify, set env vars in the Netlify dashboard. Do not rely on local `.env` files.

## Supabase Model

Core tables:

- `admins`: admin/advisor allowlist. A user is an admin only if their Supabase Auth user ID is in this table.
- `sessions`: one student chat session, with `student_id` and optional `expert_id`.
- `messages`: chat messages with `sender_type` of `student`, `guide`, or `expert`.
- `memberships`: subscription state, plan, weekly question limit, PayPal subscription ID.
- `question_usage`: answered-question usage rows. A student question counts when an expert/admin reply records a usage row.
- `device_tokens`: Firebase Cloud Messaging tokens for advisors.
- `admins.email_notifications`: boolean (default true) per-admin email-alert
  on/off toggle, added by `supabase_admin_email_notifications.sql`.

Admin setup:

```sql
insert into public.admins (user_id)
select id
from auth.users
where email = 'advisor@example.com'
on conflict (user_id) do nothing;
```

## Auth / Role Rules

Important distinction:

- Supabase project/admin access is not the same as app admin access.
- App admin access requires a Supabase Auth account plus a row in `public.admins`.

Student accounts and admin accounts should be separate. If a user is in `admins`, the frontend treats them as an advisor, not as a student subscriber.

## Advisor Dashboard Behavior

Route:

```text
/dashboard
```

The dashboard uses `GET /api/expert-sessions` for enriched queue data. That endpoint returns:

- student name/email
- session ID
- membership status
- weekly used/remaining question count
- unlimited status
- last message preview
- unread/new student message metadata
- priority fields such as `needs_advisor_reply`

Tabs:

- `Mine`: sessions assigned to current advisor
- `Unclaimed`: sessions with no advisor
- `Claimed`: sessions assigned to other advisors

Sorting priority:

1. Active member sessions needing advisor reply
2. Other active member sessions by latest activity
3. No-membership sessions at the bottom

No-membership sessions must not show `Needs reply`.

Advisors can:

- claim unclaimed sessions
- unclaim their own sessions
- reply to sessions assigned to them
- adjust limited-member weekly question allowance with `+` / `-`

Admins should not be able to reply to another advisor's claimed session. Backend enforcement is in `server/src/controllers/message.controller.js`.

## Question Limits

Weekly question counts are based on `question_usage`.

For standard plans:

```text
remaining = memberships.question_limit_weekly - count(question_usage rows for current week)
```

For unlimited plans, `memberships.question_limit_weekly` is `null`.

The app records usage when an expert/admin reply answers an uncounted student message.

Testing reset by email:

```sql
delete from public.question_usage
where user_id = (
  select id
  from auth.users
  where email = 'student@example.com'
);
```

## PayPal

Current payment implementation is subscription-based PayPal, not Venmo-first.

Frontend PayPal button component:

```text
client/src/components/PayPalSubscriptionButton.jsx
```

Backend payment controller:

```text
server/src/controllers/payment.controller.js
```

Plan keys:

- `standard_monthly`
- `standard_yearly`
- `unlimited_monthly`
- `unlimited_yearly`

PayPal webhook support exists, but `PAYPAL_WEBHOOK_ID` must be configured for webhook verification.

## Netlify / API Notes

The Express app is exported from `server/server.js` and wrapped by:

```text
netlify/functions/api.js
```

`server/server.js` only starts a port when run directly:

```js
if (require.main === module) {
  app.listen(...)
}
```

This is intentional for Netlify Functions.

## Common Debugging Notes

If the frontend shows an HTML/DOCTYPE API error, the request is hitting the wrong server or a stale backend route. Restart both:

```bash
cd server && npm start
cd client && npm run dev
```

If enriched advisor queue fails, the dashboard may show an amber warning. The usual causes are:

- backend not restarted after route changes
- missing backend env vars
- route not deployed
- Supabase project paused/unavailable

If Realtime updates look stale, ensure the relevant table is in the Supabase Realtime publication, especially:

- `messages`
- `sessions`
- `question_usage`

## Security Notes

- Never expose `SUPABASE_SECRET_KEY` to the frontend.
- Client should only use `VITE_SUPABASE_ANON_KEY`.
- Admin-only operations must go through backend routes and verify `public.admins`.
- Keep PayPal secret server-side only.
- Do not commit `.env`, API keys, service-role keys, or PayPal secrets.
- Rate limiting exists in `server/server.js`; avoid removing it. The dashboard also coalesces refreshes to avoid request storms.

## Git Notes

Current main working repo is:

```text
/Users/codyqiu/knobull
```

Before committing:

```bash
git status
npm run build --prefix client
```

Commit only relevant source/config files. Avoid committing generated `client/dist` unless the repo intentionally tracks it.

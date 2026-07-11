# Deploying Knobull Chat (free tier)

This app runs at **$0/month** on **Netlify** (static client + the Express API as a
Netlify Function) plus **Supabase** (Postgres / Auth / Realtime). Payments use
PayPal; optional advisor push uses Firebase Cloud Messaging.

Target URL in these notes: `https://chat.knobull.com`.

---

## 1. Architecture

- **Client** — React/Vite SPA, built to `client/dist`, served as static files.
- **API** — `server/` is an Express app; `netlify/functions/api.js` wraps it with
  `serverless-http` so it runs as a single Netlify Function. `netlify.toml`
  redirects `/api/*` and `/health` to that function; everything else falls back
  to the SPA.
- **Data** — Supabase (Postgres + RLS, Auth, Realtime).
- The client calls the API **same-origin** at `/api` (leave `VITE_API_URL` unset),
  so there is no CORS round-trip for normal app traffic.

---

## 2. Prerequisites

- A Supabase project (URL + anon key + service/secret key).
- A PayPal app (client id/secret) with four subscription plans created, plus a
  webhook id. Use **live** credentials for real payments, **sandbox** for testing.
- An hCaptcha site key.
- (Optional) A Firebase project for advisor push notifications.
- Node 20 locally (matches `netlify.toml` `NODE_VERSION`).

---

## 3. Environment variables

Set these in **Netlify → Site settings → Environment variables**. `VITE_*` are
baked into the client at **build time**; the rest are read by the function at
**runtime**.

### Client (build-time, `VITE_*`)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_API_URL` | **Leave unset** (defaults to `/api`, same-origin) |
| `VITE_PAYPAL_CLIENT_ID` | PayPal client id (public) |
| `VITE_PAYPAL_STANDARD_MONTHLY_PLAN_ID` | PayPal plan id |
| `VITE_PAYPAL_STANDARD_YEARLY_PLAN_ID` | PayPal plan id |
| `VITE_PAYPAL_UNLIMITED_MONTHLY_PLAN_ID` | PayPal plan id |
| `VITE_PAYPAL_UNLIMITED_YEARLY_PLAN_ID` | PayPal plan id |
| `VITE_HCAPTCHA_SITEKEY` | hCaptcha site key |
| `VITE_FIREBASE_API_KEY` | (push, optional) Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | (push, optional) |
| `VITE_FIREBASE_PROJECT_ID` | (push, optional) |
| `VITE_FIREBASE_STORAGE_BUCKET` | (push, optional) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | (push, optional) |
| `VITE_FIREBASE_APP_ID` | (push, optional) |
| `VITE_FIREBASE_VAPID_KEY` | (push, optional) Web Push certificate key |

### Server (runtime)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (same project as the client) |
| `SUPABASE_SECRET_KEY` | Supabase **service_role** key — bypasses RLS. Secret. |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `https://chat.knobull.com` |
| `FRONTEND_URL` | `https://chat.knobull.com` (PayPal return/cancel URLs) |
| `PAYPAL_ENV` | `live` or `sandbox` |
| `PAYPAL_CLIENT_ID` | PayPal client id |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret. Secret. |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook id (for signature verification) |
| `PAYPAL_STANDARD_MONTHLY_PLAN_ID` | PayPal plan id |
| `PAYPAL_STANDARD_YEARLY_PLAN_ID` | PayPal plan id |
| `PAYPAL_UNLIMITED_MONTHLY_PLAN_ID` | PayPal plan id |
| `PAYPAL_UNLIMITED_YEARLY_PLAN_ID` | PayPal plan id |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | (push, optional) Full service-account JSON as one string |

> The `VITE_PAYPAL_*_PLAN_ID` (client) and `PAYPAL_*_PLAN_ID` (server) values must
> be the **same** plan ids — the client renders the button, the server verifies.

---

## 4. Database migrations

Run these in the **Supabase SQL Editor**, in order. They are idempotent
(safe to re-run).

1. `supabase_memberships.sql`
2. `supabase_question_usage_and_plan_rules.sql`
3. `supabase_security_hardening.sql`
4. `supabase_rls_read_policies.sql`
5. `supabase_free_tier_sessions.sql`
6. `supabase_advisor_queue_perf.sql`
7. `supabase_messages_realtime_rls.sql`

> **Note:** the base tables `sessions`, `messages`, `admins`, and `device_tokens`
> were created directly in Supabase (not committed as SQL). A brand-new Supabase
> project must have those tables before running the files above. An existing
> project already has them — just run any migrations it hasn't seen yet.
>
> To grant an advisor access, insert their auth user id into `admins`:
> `insert into admins (user_id) values ('<auth-user-uuid>');`

---

## 5. Deploy

### Option A — Netlify CLI from a local clone (no GitHub ownership needed)

Use this if you can't connect the repo in Netlify (e.g. it's owned by a teammate).

```bash
npm i -g netlify-cli
netlify login
netlify sites:create --name knobull-chat      # once; or `netlify link` to an existing site
netlify env:import .env.production             # optional: bulk-load env vars from a file
netlify deploy --build --prod                  # builds via netlify.toml and deploys to prod
```

Re-run `netlify deploy --build --prod` to ship each update. Env vars can also be
set in the Netlify UI instead of `env:import`.

### Option B — Continuous deploy from GitHub

Requires **admin** on the GitHub repo (to install the deploy webhook). If the repo
is owned by a teammate, they must either connect it in their own Netlify and add
you to the Netlify team, or grant the **Netlify GitHub App** access to the repo
and make you an admin collaborator.

1. Netlify → **Add new site → Import from Git** → select the repo/branch.
2. Build settings are read from `netlify.toml` automatically.
3. Set the environment variables (section 3).
4. Every push to the selected branch auto-builds and deploys.

---

## 6. Custom domain (`chat.knobull.com`)

1. Netlify → **Domain management → Add a domain** → `chat.knobull.com`.
2. In the DNS host for `knobull.com`, add a `CNAME`:
   `chat` → `your-site-name.netlify.app`.
3. Netlify provisions HTTPS (Let's Encrypt) automatically once DNS resolves.
4. Ensure `CORS_ORIGINS` and `FRONTEND_URL` use `https://chat.knobull.com`.

---

## 7. PayPal webhook

In the PayPal developer dashboard, set the webhook URL to:

```
https://chat.knobull.com/api/paypal-webhook
```

Subscribe to the `BILLING.SUBSCRIPTION.*` events. Confirm the webhook id matches
`PAYPAL_WEBHOOK_ID`. Membership access is only granted once PayPal sends
`BILLING.SUBSCRIPTION.ACTIVATED` (i.e. after payment) — `approval_pending` does
not unlock access by design.

---

## 8. Post-deploy verification

- [ ] `https://chat.knobull.com/health` returns `{ "status": "ok" }`.
- [ ] Sign up as a student (email verification + hCaptcha work).
- [ ] Free tier: start chats; the **3rd chat session in a week is blocked** with an upsell.
- [ ] Student sends a message → it appears immediately; advisor replies appear within ~3s.
- [ ] Advisor dashboard loads the queue; claim → reply → **Resolve**; resolved chat moves to the Resolved tab.
- [ ] Subscribe with PayPal (sandbox first) → membership becomes `active` after the webhook; cap rises to 5 (standard) / unlimited.
- [ ] A student cannot read another student's chat (RLS).

---

## 9. Free-tier notes & limits

- **Netlify free:** ~100 GB bandwidth, 125k function invocations/mo, 300 build min/mo.
  Every `/api/*` call is one invocation; fine at launch scale.
- **Supabase free:** 500 MB DB, ~5 GB egress/mo, 50k MAU. **Projects pause after
  ~7 days of inactivity** — a live app won't pause; resume with one click if it does.
- **Student chat polls every 3s** (Realtime + RLS is unreliable for non-admin
  subscribers). This hits Supabase directly (not Netlify functions) and grows with
  concurrent open chats. Fine at launch; the follow-up below removes it.
- **Push notifications are optional and off by default:** `firebase-admin` is not in
  `server/package.json`. To enable, add it as a dependency and set
  `FIREBASE_SERVICE_ACCOUNT_JSON`. The `client/public/firebase-messaging-sw.js`
  service worker also needs the Firebase web config (service workers can't read
  `VITE_*` env, so those values are set in that file).

---

## 10. Known follow-up

- **Migrate chat to Supabase Realtime private channels (Realtime Authorization).**
  This restores instant delivery for students *and* removes the 3s poll (cutting
  Supabase egress), while keeping RLS security. Non-trivial; do it after launch.

---

## 11. Rollback

- **CLI:** `netlify deploy --build --prod` from an earlier commit, or use
  **Netlify → Deploys → [pick a previous deploy] → Publish deploy**.
- **Git-connected:** revert the commit (auto-redeploys) or publish a prior deploy
  from the Netlify Deploys list.
- Database migrations are additive; a client/function rollback does not require a
  DB rollback.

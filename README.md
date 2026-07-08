# Knobull Chat App

A real-time chat application connecting students with expert advisors, built with React, Express, and Supabase.

---

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  React Frontend │ ──JWT──▶│  Express Server  │──Admin─▶│    Supabase      │
│  (Vite + PWA)   │◀──WSS──│  (API + Bot)     │  Key   │  (DB + Realtime) │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

**How it works:**
1. **Students** sign in anonymously and chat via a real-time WebSocket connection to Supabase.
2. **Experts** (admins) log in with email/password, see a queue of active sessions, and claim one to reply.
3. The **Express server** acts as a "System Admin" — it uses Supabase's secret key to perform privileged actions like sending bot messages and creating sessions.
4. **Security** is enforced at three layers: JWT verification on the Express server, Row Level Security (RLS) in the database, and a PostgreSQL trigger that prevents users from spoofing their role.

---

## File Structure

```
knobull-chatapp/
│
├── client/                          # React Frontend (Vite)
│   ├── .env                         # Environment variables (VITE_ prefix)
│   ├── index.html                   # HTML entry point
│   ├── vite.config.js               # Vite dev server config
│   │
│   └── src/
│       ├── main.jsx                 # App entry point (renders <App /> in StrictMode)
│       ├── App.jsx                  # Root component — manages auth state & view routing
│       ├── App.css                  # Global styles
│       ├── index.css                # Base CSS reset
│       │
│       ├── config/
│       │   └── supabase.js          # Initializes the Supabase client using env vars
│       │
│       ├── services/
│       │   └── api.service.js       # HTTP helper — attaches JWT to all backend requests
│       │
│       ├── components/
│       │   ├── ChatBubble.jsx       # Reusable message bubble (student/expert/guide styles)
│       │   └── LoginForm.jsx        # Expert email/password login form
│       │
│       └── pages/
│           ├── LandingPage.jsx      # Entry screen — "Student" or "Expert" buttons
│           ├── StudentChatPage.jsx  # Student chat UI — sends messages, listens via WebSocket
│           └── ExpertDashboardPage.jsx  # Expert queue + chat UI — claims & replies to sessions
│
├── server/                          # Express Backend
│   ├── .env                         # Environment variables (Supabase URL, keys)
│   ├── package.json                 # Dependencies (express, cors, supabase-js, jsonwebtoken)
│   ├── server.js                    # Entry point — loads middleware & routes
│   │
│   └── src/
│       ├── routes/
│       │   └── api.routes.js        # Registers all API endpoints, applies JWT middleware
│       │
│       ├── middlewares/
│       │   └── auth.middleware.js    # Verifies Supabase JWT tokens on every request
│       │
│       ├── controllers/
│       │   ├── session.controller.js  # Creates sessions & handles expert "claim" logic
│       │   └── bot.controller.js      # Auto-replies with the Guide bot script
│       │
│       └── utils/
│           └── constants.js         # Bot script text (intro & handoff messages)
│
└── .gitignore                       # Excludes .env, node_modules, build outputs
```

---

## How the Code Runs (Student Flow)

1. **Student clicks "Student"** → `App.jsx` calls `supabase.auth.signInAnonymously()`
2. **Session created** → `api.service.js` sends a JWT-authenticated POST to `/api/create-session`
3. **Express verifies JWT** → `auth.middleware.js` validates the token via `supabase.auth.getUser()`
4. **Session + welcome message inserted** → `session.controller.js` uses the Admin key to write to the DB
5. **WebSocket connects** → `StudentChatPage.jsx` subscribes to Supabase Realtime for live updates
6. **Student sends a message** → Inserted directly into Supabase (RLS + trigger enforce security)
7. **Bot check** → `api.service.js` pings `/api/bot-check`, which may auto-reply via `bot.controller.js`

---

## Security Layers

| Layer | What it Protects | How |
|-------|-----------------|-----|
| **JWT Middleware** (`auth.middleware.js`) | Express API routes | Verifies the caller's identity before allowing session creation or bot triggers |
| **RLS Policies** (Supabase DB) | Data access | Students can only read/write their own session's messages |
| **SQL Trigger** (`set_message_role()`) | Message integrity | Forces `sender_type` based on the user's actual role — prevents spoofing |
| **Admin Table** (`admins`) | Expert access | Only UUIDs in this table get expert-level permissions |

---

## Local Development Setup

### Prerequisites
- Node.js (v18+)
- A Supabase project with the schema applied

### 1. Server
```bash
cd server
npm install
# Fill in .env with your Supabase URL, Secret Key, and JWT Secret
npm start
```

### 2. Client
```bash
cd client
npm install
# Fill in .env with your Supabase URL, Anon Key, and API URL
npm run dev
```

### 3. Testing with Two Roles
Because Supabase stores auth tokens in `localStorage`, you **must** use two separate browsers (or one incognito window) to test Student and Expert simultaneously on the same machine.

---

## Environment Variables

### `client/.env`
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public (anon) key — safe for the browser |
| `VITE_API_URL` | Express server URL (e.g., `http://localhost:3000/api`) |
| `VITE_PAYPAL_CLIENT_ID` | PayPal sandbox/live client ID for rendering subscription buttons |
| `VITE_PAYPAL_STANDARD_MONTHLY_PLAN_ID` | PayPal subscription plan ID for Standard monthly |
| `VITE_PAYPAL_STANDARD_YEARLY_PLAN_ID` | PayPal subscription plan ID for Standard yearly |
| `VITE_PAYPAL_UNLIMITED_MONTHLY_PLAN_ID` | PayPal subscription plan ID for Unlimited monthly |
| `VITE_PAYPAL_UNLIMITED_YEARLY_PLAN_ID` | PayPal subscription plan ID for Unlimited yearly |

### `server/.env`
| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Service Role (secret) key — **never expose publicly** |
| `FRONTEND_URL` | Canonical frontend URL used for safe PayPal redirects |
| `PAYPAL_ENV` | PayPal environment (`sandbox` or `live`) |
| `PAYPAL_CLIENT_ID` | PayPal client ID for backend subscription management |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret — **never expose publicly** |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook ID for verifying subscription webhook events |
| `PAYPAL_STANDARD_MONTHLY_PLAN_ID` | PayPal subscription plan ID for Standard monthly |
| `PAYPAL_STANDARD_YEARLY_PLAN_ID` | PayPal subscription plan ID for Standard yearly |
| `PAYPAL_UNLIMITED_MONTHLY_PLAN_ID` | PayPal subscription plan ID for Unlimited monthly |
| `PAYPAL_UNLIMITED_YEARLY_PLAN_ID` | PayPal subscription plan ID for Unlimited yearly |

### PayPal Webhook

Create a PayPal webhook for the backend endpoint:

```text
https://YOUR_BACKEND_DOMAIN/api/paypal-webhook
```

For local testing through a tunnel, use the tunnel URL:

```text
https://YOUR_TUNNEL_URL/api/paypal-webhook
```

Subscribe to these PayPal events:

```text
BILLING.SUBSCRIPTION.ACTIVATED
BILLING.SUBSCRIPTION.UPDATED
BILLING.SUBSCRIPTION.CANCELLED
BILLING.SUBSCRIPTION.SUSPENDED
BILLING.SUBSCRIPTION.EXPIRED
BILLING.SUBSCRIPTION.PAYMENT.FAILED
```

After creating the webhook in PayPal, copy its webhook ID into `server/.env` as `PAYPAL_WEBHOOK_ID`.

### Supabase Hardening

After deploying the backend `/api/send-message` endpoint, run:

```text
supabase_security_hardening.sql
supabase_question_usage_and_plan_rules.sql
```

This prevents browser clients from bypassing backend membership checks by writing
directly to `sessions` or `messages`. The backend service-role key can still
perform the required writes.

### Usage and Plan Switching Rules

Standard memberships include 5 answered questions per UTC week. A question is
counted when an expert replies to an uncounted student message; one expert reply
can count at most one question. Unlimited memberships do not have a weekly
answered-question cap.

Plan upgrades take effect immediately. Downgrades take effect immediately only
inside the downgrade window: 7 days for monthly plans and 30 days for yearly
plans. A user can downgrade once per subscription period. If they downgrade and
upgrade again, they cannot downgrade again until that period ends.

### Push Notifications

Firebase push notifications are optional. The server currently runs safely
without `firebase-admin`; notification attempts are skipped when that package is
not installed. If push notifications are re-enabled, add a reviewed, audit-clean
Firebase Admin version and re-run:

```bash
npm audit --omit=dev
```

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

### `server/.env`
| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SECRET_KEY` | Service Role (secret) key — **never expose publicly** |

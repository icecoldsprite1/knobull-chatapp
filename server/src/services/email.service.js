/**
 * Email Notification Service
 *
 * Sends advisor alert emails on two triggers, via Gmail SMTP (Nodemailer) when a
 * Gmail app password is configured, otherwise via the Resend HTTPS API:
 *   - a new chat session is created ("a student arrived")
 *   - a student sends a message ("a student texted")
 *
 * SECURITY / PRIVACY NOTES:
 *   - The Resend API key lives ONLY in the server env (RESEND_API_KEY). It is
 *     never sent to the browser.
 *   - Emails deliberately contain NO message content and NO student PII — just a
 *     nudge and a link to the dashboard, which is itself behind advisor auth.
 *     Email is not end-to-end encrypted, so we keep the conversation out of it.
 *   - If the service isn't configured, every function is a safe no-op. It never
 *     throws and never blocks the student's request.
 *
 * RECIPIENTS:
 *   Alerts go to every admin in public.admins who has email_notifications = true
 *   (the default). Admins toggle their own alerts from the dashboard. There is
 *   NO manual recipient list to maintain. ADVISOR_NOTIFY_EMAIL may optionally add
 *   an extra always-on address (e.g. a shared inbox).
 *
 * CONFIG (server env / Netlify env) — set ONE transport:
 *   Gmail (recommended — no domain needed, sends to anyone):
 *     GMAIL_USER           the sending Gmail address (use a dedicated account)
 *     GMAIL_APP_PASSWORD   16-char Google App Password (needs 2-Step Verification)
 *   Resend (alternative — needs a verified domain to reach >1 address):
 *     RESEND_API_KEY       from the Resend dashboard
 *   Shared:
 *     NOTIFY_FROM_EMAIL    optional — sender display for Resend; Gmail always
 *                          sends from GMAIL_USER (Google requires it)
 *     ADVISOR_NOTIFY_EMAIL optional — extra recipient(s), comma-separated
 *     FRONTEND_URL         optional — used to build the dashboard link
 */

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Transport selection. Gmail SMTP (Nodemailer) is preferred when configured —
// it needs no verified domain and can send to any recipient. Resend is the
// fallback (but its free sandbox sender only reaches the account owner).
const hasGmail = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const hasResend = () => Boolean(process.env.RESEND_API_KEY);

let gmailTransport = null;
const getGmailTransport = () => {
  if (!hasGmail()) return null;
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return gmailTransport;
};

// Best-effort anti-spam: don't email more than once per session per window.
// On serverless (Netlify) this map resets on cold start, so it's a soft guard —
// good enough for a low-volume advisor inbox, same tradeoff as the FCM cooldown.
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const lastEmailAt = {};

// Short cache of resolved admin recipient emails so we don't hit the Auth Admin
// API on every message. Toggles/added admins take effect within RECIPIENT_TTL_MS.
const RECIPIENT_TTL_MS = 60 * 1000;
let recipientCache = { emails: [], expires: 0 };

const isConfigured = () => hasGmail() || hasResend();

/**
 * Resolve the current alert recipients: every opted-in admin's email, plus any
 * optional ADVISOR_NOTIFY_EMAIL extras. Cached briefly. Never throws.
 */
const getRecipients = async () => {
  const now = Date.now();
  if (recipientCache.expires > now) return recipientCache.emails;

  const emails = new Set();

  // Optional extra always-on recipient(s) — e.g. a shared support inbox.
  (process.env.ADVISOR_NOTIFY_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((e) => emails.add(e));

  try {
    // select('*') so this still works before the email_notifications column
    // migration is applied (missing column -> undefined -> treated as opted in).
    const { data: admins, error } = await supabase.from('admins').select('*');
    if (error) throw error;

    const optedIn = (admins || []).filter((a) => a.email_notifications !== false);
    const resolved = await Promise.all(
      optedIn.map(async (a) => {
        const { data, error: uErr } = await supabase.auth.admin.getUserById(a.user_id);
        if (uErr) {
          console.error('[Email] Admin email lookup failed:', uErr.message);
          return null;
        }
        return data?.user?.email || null;
      })
    );
    resolved.filter(Boolean).forEach((e) => emails.add(e));
  } catch (err) {
    console.error('[Email] Failed to load admin recipients:', err.message);
  }

  const list = [...emails];
  recipientCache = { emails: list, expires: now + RECIPIENT_TTL_MS };
  return list;
};

const getDashboardLink = () => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return base ? `${base}/dashboard` : null;
};

const renderHtml = (heading, message, link) => `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:18px;color:#1d4ed8">${heading}</h2>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155">${message}</p>
    ${link
      ? `<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Open Advisor Dashboard</a>`
      : `<p style="font-size:13px;color:#64748b">Open your Knobull advisor dashboard to respond.</p>`}
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">You're receiving this because you're a Knobull advisor. This alert contains no chat content — open the dashboard to view the conversation.</p>
  </div>`;

/**
 * Low-level send. Returns true on success, false on any failure (never throws).
 */
const sendEmail = async ({ subject, text, html }) => {
  if (!isConfigured()) {
    console.log('[Email] No transport configured (set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY) — skipping alert.');
    return false;
  }

  const to = await getRecipients();
  if (!to.length) {
    console.log('[Email] No opted-in admin recipients — skipping alert.');
    return false;
  }

  // Preferred transport: Gmail SMTP via Nodemailer. No verified domain needed,
  // and it can send to any recipient. Google requires the From to be GMAIL_USER.
  const gmail = getGmailTransport();
  if (gmail) {
    try {
      await gmail.sendMail({
        from: `Knobull Alerts <${process.env.GMAIL_USER}>`,
        to: to.join(', '),
        subject,
        text,
        html,
      });
      console.log('[Email] Advisor alert sent (Gmail).');
      return true;
    } catch (err) {
      console.error('[Email] Gmail send error:', err.message);
      return false;
    }
  }

  // Fallback transport: Resend HTTPS API.
  if (typeof fetch !== 'function') {
    console.error('[Email] global fetch unavailable (needs Node 18+) — skipping alert.');
    return false;
  }

  const from = process.env.NOTIFY_FROM_EMAIL || 'Knobull Alerts <onboarding@resend.dev>';

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.error(`[Email] Send failed (${resp.status}): ${detail.slice(0, 200)}`);
      return false;
    }

    console.log('[Email] Advisor alert sent (Resend).');
    return true;
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    return false;
  }
};

/**
 * Alert: a student/guest just started a new chat session. Fires once per session
 * and stamps the cooldown so the student's immediate first message doesn't also
 * trigger a near-duplicate email.
 */
const notifyAdvisorNewSession = async ({ sessionId, isTrialGuest = false } = {}) => {
  if (sessionId) lastEmailAt[sessionId] = Date.now();

  const who = isTrialGuest ? 'A trial guest' : 'A student';
  const link = getDashboardLink();
  return sendEmail({
    subject: '🟢 New chat started on Knobull',
    text: `${who} just started a new chat on Knobull and is waiting for help.` +
      (link ? `\n\nOpen your dashboard: ${link}` : ''),
    html: renderHtml('New chat started', `${who} just started a new chat and is waiting for help.`, link),
  });
};

/**
 * Alert: a student sent a message. Rate-limited per session by COOLDOWN_MS so a
 * burst of messages (or the arrival email) doesn't flood the advisor inbox.
 */
const notifyAdvisorNewMessage = async ({ sessionId } = {}) => {
  const now = Date.now();
  if (sessionId && lastEmailAt[sessionId] && now - lastEmailAt[sessionId] < COOLDOWN_MS) {
    return false;
  }
  if (sessionId) lastEmailAt[sessionId] = now;

  const link = getDashboardLink();
  return sendEmail({
    subject: '💬 New message on Knobull',
    text: 'A student sent a new message on Knobull and is waiting for a reply.' +
      (link ? `\n\nOpen your dashboard: ${link}` : ''),
    html: renderHtml('New student message', 'A student sent a new message and is waiting for a reply.', link),
  });
};

module.exports = {
  notifyAdvisorNewSession,
  notifyAdvisorNewMessage,
};

/**
 * One-shot test for the advisor email-alert path (Resend).
 *
 * Usage:
 *   npm run test:email --prefix server -- you@example.com
 *   # or set ADVISOR_NOTIFY_EMAIL in server/.env and omit the argument:
 *   npm run test:email --prefix server
 *
 * Requires RESEND_API_KEY in server/.env. Sends a single "New chat started"
 * alert to the resolved recipients (opted-in admins from the DB, plus any
 * ADVISOR_NOTIFY_EMAIL / CLI address). Reuses the real send path so a success
 * here means production email will work too.
 *
 * Reminder: with the default sandbox sender, Resend only delivers to the Resend
 * account owner's own email until a domain is verified (see DEPLOY.md §8).
 */

const path = require('path');

// Load server/.env regardless of the current working directory.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Optional recipient override from the CLI, added on top of any configured ones.
const argEmail = process.argv[2];
if (argEmail) {
  process.env.ADVISOR_NOTIFY_EMAIL = process.env.ADVISOR_NOTIFY_EMAIL
    ? `${process.env.ADVISOR_NOTIFY_EMAIL},${argEmail}`
    : argEmail;
}

if (!process.env.RESEND_API_KEY) {
  console.error('✗ RESEND_API_KEY is not set. Add it to server/.env, then re-run.');
  process.exit(1);
}

// Required so email.service can resolve admin recipients from the DB.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SECRET_KEY not set — will only use ADVISOR_NOTIFY_EMAIL / CLI address.');
}

const { notifyAdvisorNewSession } = require('../src/services/email.service');

(async () => {
  console.log('Sending a test advisor alert…');
  const ok = await notifyAdvisorNewSession({ sessionId: `test-${Date.now()}`, isTrialGuest: false });
  if (ok) {
    console.log('✓ Resend accepted the email. Check the recipient inbox (and spam) within ~1 min.');
    process.exit(0);
  }
  console.error('✗ Email not sent. See the log line above for why (no recipients, or a Resend API error).');
  console.error("  Reminder: the sandbox sender only delivers to the Resend account owner's email until a domain is verified.");
  process.exit(1);
})();

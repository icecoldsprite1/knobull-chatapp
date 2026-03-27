/**
 * Notification Service
 * 
 * Handles all Google Firebase Cloud Messaging (FCM) logic.
 * Pushes alerts to active Expert browsers when a student asks for help.
 */

const admin = require('../config/firebase');
const { createClient } = require('@supabase/supabase-js');

// Admin Supabase client (bypasses RLS) to read all active device tokens.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ==========================================
// ANTI-SPAM MECHANISM
// ==========================================
// We keep a simple in-memory cache of the last time we pinged experts per session.
// This prevents 5 messages in 5 seconds from sending 5 push notifications.
// Note: In a larger horizontally-scaled production app, this should be moved to Redis.
const lastNotificationTime = {};
const COOLDOWN_MS = 5 * 1000; // 5 seconds cooldown

/**
 * notifyExperts
 * 
 * Pulls all registered device tokens from the DB and sends a multicast push.
 * @param {string} sessionId - The UUID of the session requesting help.
 */
const notifyExperts = async (sessionId) => {
  // 1. Anti-Spam Check
  const now = Date.now();
  if (lastNotificationTime[sessionId] && (now - lastNotificationTime[sessionId]) < COOLDOWN_MS) {
    console.log(`[Push Notification] Skipped for session ${sessionId} — cooldown active`);
    return;
  }

  try {
    // 2. Fetch Active Tokens
    // We get every token an expert has explicitly registered via their browser prompt.
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token');

    if (error || !tokens || tokens.length === 0) {
      console.log('[Push Notification] No device tokens registered. Skipping.');
      return;
    }

    // 3. Build the Payload (DATA-ONLY)
    // CRITICAL ARCHITECTURE NOTE: 
    // We purposefully omit the `notification: { title, body }` field here.
    // Instead, we pass everything inside `data`.
    // Why? 
    // If the browser tab is even partially visible (foreground), FCM intercepts the `notification` 
    // object and might show a duplicate OS popup. By using a data-only payload, we force 
    // our client-side code (`App.jsx` and `firebase-messaging-sw.js`) to manually decide 
    // when and how to display the OS popup, preventing annoying double-notifications.
    const message = {
      data: {
        title: '💬 New Student Message',
        body: 'A student needs help on Knobull Chat!',
        url: '/',
      },
      tokens: tokens.map(t => t.token),
    };

    // 4. Dispatch the Multicast
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Push Notification] Sent: ${response.successCount} success, ${response.failureCount} failed`);

    // 5. Token Cleanup Subroutine
    // Browsers constantly revoke tokens when users clear cache or revoke permissions.
    // If Firebase tells us a token failed, we permanently delete it from Supabase 
    // so we don't waste pinging it in the future.
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          invalidTokens.push(tokens[idx].token);
        }
      });

      if (invalidTokens.length > 0) {
        await supabase
          .from('device_tokens')
          .delete()
          .in('token', invalidTokens);
        console.log(`[Push Notification] Cleaned up ${invalidTokens.length} stale/revoked device tokens from DB.`);
      }
    }

    // 6. Reset Cooldown
    lastNotificationTime[sessionId] = now;

  } catch (err) {
    console.error('[Push Notification] Central Error:', err.message);
  }
};

module.exports = { notifyExperts };

/**
 * Bot Controller
 * 
 * Handles the logic for the automated "Knobull Support" bot that greets students.
 * Currently, it acts as a simple router: it greets the user and immediately 
 * notifies human experts that a student is waiting.
 */

const { createClient } = require('@supabase/supabase-js');
const { GUIDE_SCRIPT } = require('../utils/constants');
const { notifyExperts } = require('../services/notification.service');

// Initialize the Admin Supabase client.
// We use the SECRET_KEY so the server can insert messages on behalf of the bot
// without being blocked by Row Level Security (RLS) policies.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * handleBotCheck
 * 
 * Invoked by the frontend every time a student sends a message.
 * @param {Object} req - Express request object containing `sessionId` and `messageCount`
 * @param {Object} res - Express response object
 */
// UUID v4 format validator — prevents malformed IDs from hitting the database
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handleBotCheck = async (req, res) => {
  const { sessionId, messageCount } = req.body;
  const userId = req.user.sub; // Extracted securely by requireAuth middleware

  // 🚨 SECURITY: Block anonymous accounts
  if (req.user.is_anonymous) {
    return res.status(403).json({ error: 'Forbidden: Account required.' });
  }

  // Input Validation
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  if (typeof messageCount !== 'number' || !Number.isInteger(messageCount) || messageCount < 1) {
    return res.status(400).json({ error: 'Invalid message count' });
  }

  // 🚨 OWNERSHIP CHECK 🚨
  // Verify that the sessionId actually belongs to the authenticated student.
  // Without this, an attacker could inject bot messages into another student's chat
  // because the admin client bypasses RLS.
  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('student_id', userId)
      .single();

    if (!session) {
      return res.status(403).json({ error: 'Forbidden: Session does not belong to you.' });
    }
  } catch (err) {
    console.error('Session ownership check error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  // 1. Notify Human Experts
  // We trigger a background push notification to all online advisors.
  // We don't await this because push notifications shouldn't block the HTTP response to the student.
  notifyExperts(sessionId).catch(console.error);

  // 2. Bot Greeting Logic
  // Currently, the bot only speaks ONCE: right after the student sends their very first message.
  if (messageCount === 1) {
    // Simulate a natural "typing" delay before the bot responds (1.5 seconds)
    setTimeout(async () => {
      try {
        await supabase.from('messages').insert([{
          session_id: sessionId,
          user_id: userId,
          content: GUIDE_SCRIPT.handoff, // "Connecting you to an academic advisor..."
          sender_type: 'guide'           // Identifies this as a bot aesthetic on the frontend
        }]);
      } catch (err) {
        console.error("Bot failed to insert reply to Supabase:", err);
      }
    }, 1500);
  }
  
  // 3. Return immediate success to the student's browser 
  // so their UI doesn't hang while waiting for the bot/notifications.
  res.sendStatus(200);
};

module.exports = {
  handleBotCheck
};

const { createClient } = require('@supabase/supabase-js');
const { GUIDE_SCRIPT } = require('../utils/constants');

// Initialize the Admin Supabase client in the controller context
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Create a new chat session for a student.
 */
const createSession = async (req, res) => {
  // Use the verified user ID from the JWT token, NOT the request body
  const userId = req.user.sub; 

  // 🚨 SECURITY: Block anonymous accounts from creating sessions
  // Only verified, non-anonymous email users should reach this point
  if (req.user.is_anonymous) {
    return res.status(403).json({ error: 'Forbidden: Account required. Anonymous users cannot create sessions.' });
  }

  try {
    // 1. Create the Session Row for the student
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert([{ student_id: userId }])
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === '23505') {
        // A session already exists for this student! (Likely due to a React StrictMode double-fire)
        // Instead of failing, just fetch and return their existing session gracefully.
        const { data: existingSession } = await supabase
          .from('sessions')
          .select('*')
          .eq('student_id', userId)
          .single();
          
        if (existingSession) {
          return res.json({ session: existingSession });
        }
      }
      
      console.error('Session creation error:', sessionError);
      return res.status(400).json({ error: 'Failed to create session. You may already have an active session.' });
    }

    // 2. Post the Guide's Welcome Message
    const { error: messageError } = await supabase.from('messages').insert([{
      session_id: session.id,
      user_id: userId,
      content: GUIDE_SCRIPT.intro,
      sender_type: 'guide'
    }]);

    if (messageError) {
       console.error("Bot failed to insert a welcome message:", messageError);
    }

    res.json({ session });
  } catch (error) {
    console.error("Session creation error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Allows an Expert to claim an active session
 */
// UUID v4 format validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const claimSession = async (req, res) => {
  // 🚨 AUTHORIZATION CHECK 🚨
  // Because we use the Supabase Secret Key (God Mode), we bypass Database RLS.
  // We MUST explicitly verify that the caller is an Expert via the admins table.
  const expertId = req.user.sub;

  try {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', expertId)
      .single();

    if (!adminRow) {
      return res.status(403).json({ error: 'Forbidden: Only authorized experts can claim sessions.' });
    }
  } catch (err) {
    console.error('Admin verification error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  const { sessionId } = req.body;

  // Input Validation
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const { data: session, error } = await supabase
      .from('sessions')
      .update({ expert_id: expertId })
      .eq('id', sessionId)
      .is('expert_id', null) // Only update if no expert has claimed it yet
      .select()
      .single();

    if (error || !session) {
      return res.status(400).json({ error: "Session may already be claimed or does not exist." });
    }

    res.json({ session, message: "Session claimed successfully." });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  createSession,
  claimSession
};

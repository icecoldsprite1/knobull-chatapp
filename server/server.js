require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware: Enable CORS so your React frontend can reach this API
app.use(cors());
app.use(express.json());

/**
 * SUPABASE ADMIN CLIENT
 * We use the 'SERVICE_ROLE' (Secret) Key here. 
 * This key is "God Mode"—it bypasses Row Level Security (RLS).
 * This is the ONLY way the server can post messages with the 'guide' sender_type,
 * because our SQL Trigger is designed to force 'student' or 'expert' for anyone
 * using the standard public 'anon' key.
 */
const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SECRET_KEY
);

/**
 * BOT RESPONSES
 * Defined on the backend to ensure consistency and prevent client-side tampering.
 */
const GUIDE_SCRIPT = {
  intro: "Hello! I'm the Knobull Guide. I'm here to help you navigate your career resources. What's on your mind today?",
  handoff: "Understood. I've notified the expert team. Someone will be with you shortly."
};

/**
 * 1. CREATE SESSION ROUTE
 * This is the entry point for a new chat.
 * Instead of creating a session in the frontend, we do it here to ensure
 * the first message (the Bot Intro) is sent successfully in the same flow.
 */
app.post('/api/create-session', async (req, res) => {
  const { userId } = req.body;

  // A. Create the Session Row
  // We insert into 'sessions' table. The student_id links this session to the user.
  const { data: session, error } = await supabase
    .from('sessions')
    .insert([{ student_id: userId }])
    .select()
    .single();

  // If session creation fails (e.g., student already has an active session due to constraints)
  if (error) return res.status(400).json({ error: error.message });

  // B. Post the Guide's Welcome Message
  // user_id is set to the student's ID so it appears in their specific chat window.
  // sender_type 'guide' identifies this as a system/bot message.
  await supabase.from('messages').insert([{
    session_id: session.id,
    user_id: userId, // We attribute it to the user so they can see it
    content: GUIDE_SCRIPT.intro,
    sender_type: 'guide'
  }]);

  // Return the session object so the frontend knows which session ID to listen to via Realtime
  res.json({ session });
});

/**
 * 2. BOT LOGIC WEBHOOK
 * The frontend calls this every time a student sends a message.
 * This simulates a "smart" bot that monitors the conversation state.
 */
app.post('/api/bot-check', async (req, res) => {
  const { sessionId, userId, messageCount } = req.body;

  if (messageCount === 1) {
    setTimeout(async () => {
      try {
        await supabase.from('messages').insert([{
          session_id: sessionId,
          user_id: userId,
          content: GUIDE_SCRIPT.handoff,
          sender_type: 'guide'
        }]);
      } catch (err) {
        console.error("Bot failed to reply:", err);
      }
    }, 1500);
  }
  
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

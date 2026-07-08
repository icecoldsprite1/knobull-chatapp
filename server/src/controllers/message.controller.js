const { createClient } = require('@supabase/supabase-js');
const { requireActiveMembership } = require('../services/membership.service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 5000;

const getAdminStatus = async (userId) => {
  const { data, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Admin lookup error:', error);
    throw new Error('Failed to verify admin status.');
  }

  return Boolean(data);
};

const sendMessage = async (req, res) => {
  const userId = req.user.sub;
  const { sessionId, content } = req.body;

  if (req.user.is_anonymous) {
    return res.status(403).json({ error: 'Forbidden: Account required.' });
  }

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format.' });
  }

  if (typeof content !== 'string' || !content.trim() || content.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: 'Message must be between 1 and 5000 characters.' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, student_id, expert_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) {
      console.error('Message session lookup error:', sessionError);
      return res.status(500).json({ error: 'Failed to verify chat session.' });
    }

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found.' });
    }

    const isStudent = session.student_id === userId;
    const isAssignedExpert = session.expert_id === userId;
    const isAdmin = await getAdminStatus(userId);

    if (!isStudent && !isAssignedExpert && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this chat session.' });
    }

    if (isStudent) {
      await requireActiveMembership(userId);
    }

    const senderType = isStudent ? 'student' : 'expert';
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert([{
        session_id: sessionId,
        user_id: userId,
        sender_type: senderType,
        content: content.trim(),
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Message insert error:', insertError);
      return res.status(500).json({ error: 'Failed to send message.' });
    }

    res.json({ message });
  } catch (error) {
    console.error('Message send error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to send message.' });
  }
};

module.exports = {
  sendMessage,
};

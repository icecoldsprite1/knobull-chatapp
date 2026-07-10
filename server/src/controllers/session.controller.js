const { createClient } = require('@supabase/supabase-js');
const { GUIDE_SCRIPT } = require('../utils/constants');
const {
  getWeekStart,
  hasActiveMembership,
  requireActiveMembership,
} = require('../services/membership.service');

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
    await requireActiveMembership(userId);

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
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
  }
};

/**
 * Allows an Expert to claim an active session
 */
// UUID v4 format validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const assertAdmin = async (userId) => {
  const { data: adminRow, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Admin verification error:', error);
    const err = new Error('Failed to verify admin status.');
    err.statusCode = 500;
    throw err;
  }

  if (!adminRow) {
    const err = new Error('Forbidden: Only authorized experts can access this resource.');
    err.statusCode = 403;
    throw err;
  }
};

const getStudentDisplay = async (studentId, cache) => {
  if (cache.has(studentId)) return cache.get(studentId);

  const fallback = {
    student_id: studentId,
    student_email: null,
    student_name: 'Student',
  };

  const { data, error } = await supabase.auth.admin.getUserById(studentId);

  if (error || !data?.user) {
    console.error('Student auth lookup error:', error?.message);
    cache.set(studentId, fallback);
    return fallback;
  }

  const metadata = data.user.user_metadata || {};
  const email = data.user.email || null;
  const name = metadata.full_name || metadata.name || metadata.display_name || email?.split('@')[0] || 'Student';
  const student = {
    student_id: studentId,
    student_email: email,
    student_name: name,
  };

  cache.set(studentId, student);
  return student;
};

const summarizeContent = (content) => {
  if (!content) return 'No messages yet.';
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
};

const listExpertSessions = async (req, res) => {
  const expertId = req.user.sub;

  try {
    await assertAdmin(expertId);

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (sessionsError) {
      console.error('Expert session list error:', sessionsError);
      return res.status(500).json({ error: 'Failed to load sessions.' });
    }

    if (!sessions?.length) {
      return res.json({ sessions: [] });
    }

    const sessionIds = sessions.map((session) => session.id);
    const studentIds = [...new Set(sessions.map((session) => session.student_id))];
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, session_id, sender_type, content, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (messagesError) {
      console.error('Expert message summary error:', messagesError);
      return res.status(500).json({ error: 'Failed to load session message summaries.' });
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('memberships')
      .select('*')
      .in('user_id', studentIds);

    if (membershipsError) {
      console.error('Expert membership summary error:', membershipsError);
      return res.status(500).json({ error: 'Failed to load membership summaries.' });
    }

    const weekStart = getWeekStart();
    const { data: questionUsage, error: questionUsageError } = await supabase
      .from('question_usage')
      .select('user_id')
      .in('user_id', studentIds)
      .eq('week_start', weekStart);

    if (questionUsageError) {
      console.error('Expert question usage summary error:', questionUsageError);
      return res.status(500).json({ error: 'Failed to load question usage summaries.' });
    }

    const membershipByUser = new Map((memberships || []).map((membership) => [membership.user_id, membership]));
    const usageByUser = new Map();
    for (const usage of questionUsage || []) {
      usageByUser.set(usage.user_id, (usageByUser.get(usage.user_id) || 0) + 1);
    }

    const summaryBySession = new Map();

    for (const message of messages || []) {
      const summary = summaryBySession.get(message.session_id) || {
        lastMessage: null,
        studentMessageCount: 0,
        lastStudentMessageAt: null,
        pendingStudentMessageCount: 0,
        expertReplySeen: false,
      };

      if (!summary.lastMessage) {
        summary.lastMessage = message;
      }

      if (message.sender_type === 'student') {
        summary.studentMessageCount += 1;
        if (!summary.lastStudentMessageAt) {
          summary.lastStudentMessageAt = message.created_at;
        }

        if (!summary.expertReplySeen) {
          summary.pendingStudentMessageCount += 1;
        }
      }

      if (message.sender_type === 'expert') {
        summary.expertReplySeen = true;
      }

      summaryBySession.set(message.session_id, summary);
    }

    const studentCache = new Map();
    const enrichedSessions = await Promise.all(sessions.map(async (session) => {
      const student = await getStudentDisplay(session.student_id, studentCache);
      const summary = summaryBySession.get(session.id) || {};
      const lastMessage = summary.lastMessage || null;
      const lastActivityAt = lastMessage?.created_at || session.created_at;
      const membership = membershipByUser.get(session.student_id) || null;
      const isActiveMember = hasActiveMembership(membership);
      const questionsUsedWeekly = usageByUser.get(session.student_id) || 0;
      const questionLimitWeekly = membership?.question_limit_weekly ?? null;
      const questionsRemainingWeekly = questionLimitWeekly == null
        ? null
        : Math.max(questionLimitWeekly - questionsUsedWeekly, 0);
      const hasUnlimitedQuestions = isActiveMember && questionLimitWeekly == null;
      const pendingStudentMessages = summary.pendingStudentMessageCount || 0;
      const needsAdvisorReply = isActiveMember && pendingStudentMessages > 0;

      return {
        ...session,
        ...student,
        has_active_membership: isActiveMember,
        membership_status: membership?.status || null,
        membership_tier: membership?.tier || null,
        membership_plan_key: membership?.plan_key || null,
        billing_interval: membership?.billing_interval || null,
        question_limit_weekly: questionLimitWeekly,
        questions_used_weekly: questionsUsedWeekly,
        questions_remaining_weekly: questionsRemainingWeekly,
        has_unlimited_questions: hasUnlimitedQuestions,
        last_message_preview: summarizeContent(lastMessage?.content),
        last_message_sender_type: lastMessage?.sender_type || null,
        last_message_created_at: lastMessage?.created_at || null,
        last_student_message_at: summary.lastStudentMessageAt || null,
        student_message_count: summary.studentMessageCount || 0,
        pending_student_messages: pendingStudentMessages,
        needs_advisor_reply: needsAdvisorReply,
        last_activity_at: lastActivityAt,
      };
    }));

    enrichedSessions.sort((a, b) => {
      if (a.needs_advisor_reply !== b.needs_advisor_reply) {
        return a.needs_advisor_reply ? -1 : 1;
      }

      if (a.has_active_membership !== b.has_active_membership) {
        return a.has_active_membership ? -1 : 1;
      }

      return new Date(b.last_activity_at) - new Date(a.last_activity_at);
    });

    res.json({ sessions: enrichedSessions });
  } catch (error) {
    console.error('Expert session list error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load sessions.' });
  }
};

const claimSession = async (req, res) => {
  // 🚨 AUTHORIZATION CHECK 🚨
  // Because we use the Supabase Secret Key (God Mode), we bypass Database RLS.
  // We MUST explicitly verify that the caller is an Expert via the admins table.
  const expertId = req.user.sub;

  try {
    await assertAdmin(expertId);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
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

const unclaimSession = async (req, res) => {
  const expertId = req.user.sub;
  const { sessionId } = req.body;

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    await assertAdmin(expertId);

    const { data: session, error } = await supabase
      .from('sessions')
      .update({ expert_id: null })
      .eq('id', sessionId)
      .eq('expert_id', expertId)
      .select()
      .single();

    if (error || !session) {
      return res.status(400).json({ error: 'Only the assigned advisor can unclaim this session.' });
    }

    res.json({ session, message: 'Session returned to the unclaimed queue.' });
  } catch (error) {
    console.error('Session unclaim error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to unclaim session.' });
  }
};

const adjustQuestionAllowance = async (req, res) => {
  const adminId = req.user.sub;
  const { studentId, delta } = req.body;
  const adjustment = Number(delta);

  if (!studentId || !UUID_REGEX.test(studentId)) {
    return res.status(400).json({ error: 'Invalid student ID format.' });
  }

  if (!Number.isInteger(adjustment) || ![-1, 1].includes(adjustment)) {
    return res.status(400).json({ error: 'Question adjustment must be +1 or -1.' });
  }

  try {
    await assertAdmin(adminId);

    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', studentId)
      .maybeSingle();

    if (membershipError) {
      console.error('Membership adjustment lookup error:', membershipError);
      return res.status(500).json({ error: 'Failed to load membership.' });
    }

    if (!membership || !hasActiveMembership(membership)) {
      return res.status(400).json({ error: 'Student does not have an active membership.' });
    }

    if (membership.question_limit_weekly == null) {
      return res.status(400).json({ error: 'Unlimited members do not need question adjustments.' });
    }

    const nextLimit = Math.max(0, membership.question_limit_weekly + adjustment);
    const { data: updatedMembership, error: updateError } = await supabase
      .from('memberships')
      .update({ question_limit_weekly: nextLimit })
      .eq('user_id', studentId)
      .select()
      .single();

    if (updateError) {
      console.error('Membership adjustment update error:', updateError);
      return res.status(500).json({ error: 'Failed to update question allowance.' });
    }

    res.json({ membership: updatedMembership });
  } catch (error) {
    console.error('Question allowance adjustment error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to adjust question allowance.' });
  }
};

module.exports = {
  createSession,
  listExpertSessions,
  claimSession,
  unclaimSession,
  adjustQuestionAllowance
};

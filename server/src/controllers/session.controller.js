const { createClient } = require('@supabase/supabase-js');
const { GUIDE_SCRIPT } = require('../utils/constants');
const {
  getWeekStart,
  hasActiveMembership,
  getBaseWeeklySessionLimit,
  getTierLabel,
  getSessionUsageSummary,
  ensureSessionAvailable,
} = require('../services/membership.service');

// Initialize the Admin Supabase client in the controller context
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// UUID v4 format validator
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getOpenSessionForStudent = async (studentId) => {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Open session lookup error:', error);
    throw new Error('Failed to load chat session.');
  }

  return data;
};

/**
 * Create a new chat session for a student.
 *
 * Metering model: a chat session (start -> advisor-resolved) counts as 1.
 * Free tier = 2/week, standard = 5/week, unlimited = uncapped. A student may
 * only have ONE open session at a time; returning that open session does NOT
 * consume a new weekly slot.
 */
const createSession = async (req, res) => {
  // Use the verified user ID from the JWT token, NOT the request body
  const userId = req.user.sub;

  // 🚨 SECURITY: Block anonymous accounts from creating sessions
  if (req.user.is_anonymous) {
    return res.status(403).json({ error: 'Forbidden: Account required. Anonymous users cannot create sessions.' });
  }

  try {
    // 1. If the student already has an OPEN session, reuse it (no new count).
    const openSession = await getOpenSessionForStudent(userId);
    if (openSession) {
      return res.json({ session: openSession });
    }

    // 2. Enforce the weekly chat-session limit for this tier (free/standard/unlimited).
    await ensureSessionAvailable(userId);

    // 3. Create the Session Row for the student
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert([{ student_id: userId, status: 'open', week_start: getWeekStart() }])
      .select()
      .single();

    if (sessionError) {
      if (sessionError.code === '23505') {
        // Race with a concurrent create (partial unique index on open sessions).
        // Return the session that won the race instead of failing.
        const existingSession = await getOpenSessionForStudent(userId);
        if (existingSession) {
          return res.json({ session: existingSession });
        }
      }

      console.error('Session creation error:', sessionError);
      return res.status(400).json({ error: 'Failed to create session. Please try again.' });
    }

    // 4. Post the Guide's Welcome Message
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

// Cross-request cache for student identity so we don't call the Auth Admin API
// once per student on every dashboard refresh. Bounded by the number of distinct
// students seen; entries expire so name/email edits eventually propagate.
const STUDENT_CACHE_TTL_MS = 5 * 60 * 1000;
const studentDisplayCache = new Map(); // studentId -> { value, expires }

const getStudentDisplay = async (studentId) => {
  const now = Date.now();
  const cached = studentDisplayCache.get(studentId);
  if (cached && cached.expires > now) return cached.value;

  const fallback = {
    student_id: studentId,
    student_email: null,
    student_name: 'Student',
  };

  const { data, error } = await supabase.auth.admin.getUserById(studentId);

  if (error || !data?.user) {
    console.error('Student auth lookup error:', error?.message);
    // Cache the fallback briefly so a failing lookup isn't retried on every row.
    studentDisplayCache.set(studentId, { value: fallback, expires: now + 30 * 1000 });
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

  studentDisplayCache.set(studentId, { value: student, expires: now + STUDENT_CACHE_TTL_MS });
  return student;
};

const RESOLVED_PAGE_DEFAULT = 50;
const RESOLVED_PAGE_MAX = 100;
// Safety cap on the active queue. There is at most one OPEN session per student
// (partial unique index), so this is only ever hit by a very large live load.
const OPEN_QUEUE_CAP = 300;

/**
 * Enrich a bounded set of session rows with student identity, membership, and
 * weekly usage. Uses the denormalized message summary on the session row, so no
 * scan of the messages table is needed.
 */
const enrichSessions = async (sessions) => {
  if (!sessions.length) return [];

  const studentIds = [...new Set(sessions.map((session) => session.student_id))];
  const weekStart = getWeekStart();

  const [membershipRes, grantRes, weekRes] = await Promise.all([
    supabase.from('memberships').select('*').in('user_id', studentIds),
    supabase.from('weekly_session_grants').select('user_id, bonus').in('user_id', studentIds).eq('week_start', weekStart),
    supabase.from('sessions').select('student_id').in('student_id', studentIds).eq('week_start', weekStart),
  ]);

  if (membershipRes.error) {
    console.error('Expert membership summary error:', membershipRes.error);
    const err = new Error('Failed to load membership summaries.');
    err.statusCode = 500;
    throw err;
  }
  if (grantRes.error) {
    console.error('Expert session grant summary error:', grantRes.error);
    const err = new Error('Failed to load session grant summaries.');
    err.statusCode = 500;
    throw err;
  }
  if (weekRes.error) {
    console.error('Expert weekly usage summary error:', weekRes.error);
    const err = new Error('Failed to load weekly session usage.');
    err.statusCode = 500;
    throw err;
  }

  const membershipByUser = new Map((membershipRes.data || []).map((m) => [m.user_id, m]));
  const bonusByUser = new Map((grantRes.data || []).map((g) => [g.user_id, g.bonus]));
  const usageByUser = new Map();
  for (const row of weekRes.data || []) {
    usageByUser.set(row.student_id, (usageByUser.get(row.student_id) || 0) + 1);
  }

  const students = await Promise.all(studentIds.map((id) => getStudentDisplay(id)));
  const studentById = new Map(students.map((s) => [s.student_id, s]));

  return sessions.map((session) => {
    const student = studentById.get(session.student_id) || {
      student_id: session.student_id,
      student_email: null,
      student_name: 'Student',
    };
    const membership = membershipByUser.get(session.student_id) || null;
    const isActiveMember = hasActiveMembership(membership);
    const tier = getTierLabel(membership);
    const baseLimit = getBaseWeeklySessionLimit(membership);
    const bonus = baseLimit == null ? 0 : (bonusByUser.get(session.student_id) || 0);
    const sessionsUsedWeekly = usageByUser.get(session.student_id) || 0;
    const sessionLimitWeekly = baseLimit == null ? null : Math.max(0, baseLimit + bonus);
    const sessionsRemainingWeekly = sessionLimitWeekly == null
      ? null
      : Math.max(sessionLimitWeekly - sessionsUsedWeekly, 0);
    const hasUnlimitedSessions = baseLimit == null;
    const isResolved = session.status === 'resolved';
    // "Needs reply" = the latest student message is newer than the latest expert
    // reply. Robust to guide messages arriving after the student's message.
    const needsAdvisorReply = !isResolved
      && !!session.last_student_message_at
      && (!session.last_expert_reply_at
        || new Date(session.last_student_message_at) > new Date(session.last_expert_reply_at));

    return {
      ...session,
      ...student,
      tier,
      has_active_membership: isActiveMember,
      membership_status: membership?.status || null,
      membership_tier: membership?.tier || null,
      membership_plan_key: membership?.plan_key || null,
      billing_interval: membership?.billing_interval || null,
      session_limit_weekly: sessionLimitWeekly,
      sessions_used_weekly: sessionsUsedWeekly,
      sessions_remaining_weekly: sessionsRemainingWeekly,
      has_unlimited_sessions: hasUnlimitedSessions,
      last_message_preview: session.last_message_preview || 'No messages yet.',
      last_message_sender_type: session.last_message_sender_type || null,
      last_message_created_at: session.last_message_at || null,
      last_student_message_at: session.last_student_message_at || null,
      student_message_count: session.student_message_count || 0,
      needs_advisor_reply: needsAdvisorReply,
      last_activity_at: session.last_message_at || session.created_at,
    };
  });
};

/**
 * Advisor queue.
 *   GET /expert-sessions                      -> all OPEN sessions + resolvedCount
 *   GET /expert-sessions?status=resolved&cursor=<iso>&limit=50 -> resolved page
 * Resolved sessions grow without bound over time, so they are paginated; the
 * open queue is bounded (<= one open session per student).
 */
const listExpertSessions = async (req, res) => {
  const expertId = req.user.sub;

  try {
    await assertAdmin(expertId);

    const status = req.query.status === 'resolved' ? 'resolved' : 'open';

    if (status === 'resolved') {
      const limit = Math.min(
        Math.max(parseInt(req.query.limit, 10) || RESOLVED_PAGE_DEFAULT, 1),
        RESOLVED_PAGE_MAX
      );
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;

      let query = supabase
        .from('sessions')
        .select('*')
        .eq('status', 'resolved')
        .order('resolved_at', { ascending: false, nullsFirst: false })
        .limit(limit + 1);

      if (cursor) {
        query = query.lt('resolved_at', cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Expert resolved session list error:', error);
        return res.status(500).json({ error: 'Failed to load resolved sessions.' });
      }

      const rows = data || [];
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const enriched = await enrichSessions(page);
      const nextCursor = hasMore ? page[page.length - 1].resolved_at : null;

      return res.json({ sessions: enriched, nextCursor });
    }

    // Active queue: open sessions only (bounded).
    const { data: openRows, error: openError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'open')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(OPEN_QUEUE_CAP);

    if (openError) {
      console.error('Expert session list error:', openError);
      return res.status(500).json({ error: 'Failed to load sessions.' });
    }

    const { count: resolvedCount, error: countError } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved');

    if (countError) {
      console.error('Expert resolved count error:', countError);
    }

    const enrichedSessions = await enrichSessions(openRows || []);

    enrichedSessions.sort((a, b) => {
      if (a.needs_advisor_reply !== b.needs_advisor_reply) {
        return a.needs_advisor_reply ? -1 : 1;
      }

      if (a.has_active_membership !== b.has_active_membership) {
        return a.has_active_membership ? -1 : 1;
      }

      return new Date(b.last_activity_at) - new Date(a.last_activity_at);
    });

    res.json({ sessions: enrichedSessions, resolvedCount: resolvedCount || 0 });
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
      .eq('status', 'open')
      .is('expert_id', null) // Only update if no expert has claimed it yet
      .select()
      .single();

    if (error || !session) {
      return res.status(400).json({ error: "Session may already be claimed, resolved, or does not exist." });
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
      .eq('status', 'open')
      .select()
      .single();

    if (error || !session) {
      return res.status(400).json({ error: 'Only the assigned advisor can unclaim this open session.' });
    }

    res.json({ session, message: 'Session returned to the unclaimed queue.' });
  } catch (error) {
    console.error('Session unclaim error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to unclaim session.' });
  }
};

/**
 * Resolve (end) a chat session. This is what "ends" a session in the metering
 * model: once resolved, the student can start a new session (counted separately).
 * Only the assigned advisor may resolve their own open session.
 */
const resolveSession = async (req, res) => {
  const expertId = req.user.sub;
  const { sessionId } = req.body;

  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    await assertAdmin(expertId);

    const { data: session, error } = await supabase
      .from('sessions')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: expertId,
      })
      .eq('id', sessionId)
      .eq('expert_id', expertId)
      .eq('status', 'open')
      .select()
      .single();

    if (error || !session) {
      return res.status(400).json({ error: 'Only the assigned advisor can resolve an open session.' });
    }

    res.json({ session, message: 'Session resolved.' });
  } catch (error) {
    console.error('Session resolve error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to resolve session.' });
  }
};

/**
 * Lets admins add or remove one weekly chat session from a student's allowance
 * for the current week. Stored as a per-week grant so it survives PayPal webhook
 * updates and also works for free-tier students (who have no membership row).
 */
const adjustSessionAllowance = async (req, res) => {
  const adminId = req.user.sub;
  const { studentId, delta } = req.body;
  const adjustment = Number(delta);

  if (!studentId || !UUID_REGEX.test(studentId)) {
    return res.status(400).json({ error: 'Invalid student ID format.' });
  }

  if (!Number.isInteger(adjustment) || ![-1, 1].includes(adjustment)) {
    return res.status(400).json({ error: 'Session adjustment must be +1 or -1.' });
  }

  try {
    await assertAdmin(adminId);

    const summary = await getSessionUsageSummary(studentId);

    if (summary.limit == null) {
      return res.status(400).json({ error: 'Unlimited members do not need session adjustments.' });
    }

    const weekStart = getWeekStart();
    const { data: existingGrant, error: grantLookupError } = await supabase
      .from('weekly_session_grants')
      .select('bonus')
      .eq('user_id', studentId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (grantLookupError) {
      console.error('Session grant lookup error:', grantLookupError);
      return res.status(500).json({ error: 'Failed to load session allowance.' });
    }

    const nextBonus = (existingGrant?.bonus || 0) + adjustment;

    const { error: upsertError } = await supabase
      .from('weekly_session_grants')
      .upsert(
        { user_id: studentId, week_start: weekStart, bonus: nextBonus, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,week_start' }
      );

    if (upsertError) {
      console.error('Session grant upsert error:', upsertError);
      return res.status(500).json({ error: 'Failed to update session allowance.' });
    }

    const updatedSummary = await getSessionUsageSummary(studentId);
    res.json({ usage: updatedSummary });
  } catch (error) {
    console.error('Session allowance adjustment error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to adjust session allowance.' });
  }
};

module.exports = {
  createSession,
  listExpertSessions,
  claimSession,
  unclaimSession,
  resolveSession,
  adjustSessionAllowance,
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const ACTIVE_MEMBERSHIP_STATUSES = new Set([
  'active',
  'approved',
  'approval_pending',
  'change_pending',
]);

const getWeekStart = (date = new Date()) => {
  const weekStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  const day = weekStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + diff);
  return weekStart.toISOString().slice(0, 10);
};

const getMembershipForUser = async (userId) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Membership lookup error:', error);
    throw new Error('Failed to check membership.');
  }

  return data;
};

const hasActiveMembership = (membership) => {
  return Boolean(membership && ACTIVE_MEMBERSHIP_STATUSES.has(membership.status));
};

const requireActiveMembership = async (userId) => {
  const membership = await getMembershipForUser(userId);

  if (!hasActiveMembership(membership)) {
    const error = new Error('Active membership required.');
    error.statusCode = 402;
    throw error;
  }

  return membership;
};

const getAnsweredQuestionUsage = async (userId, weekStart = getWeekStart()) => {
  const { count, error } = await supabase
    .from('question_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('week_start', weekStart);

  if (error) {
    console.error('Question usage lookup error:', error);
    throw new Error('Failed to check question usage.');
  }

  return {
    used: count || 0,
    weekStart,
  };
};

const getMembershipUsageSummary = async (userId) => {
  const membership = await requireActiveMembership(userId);
  const usage = await getAnsweredQuestionUsage(userId);

  return {
    membership,
    used: usage.used,
    weekStart: usage.weekStart,
    limit: membership.question_limit_weekly,
    remaining: membership.question_limit_weekly == null
      ? null
      : Math.max(membership.question_limit_weekly - usage.used, 0),
  };
};

const ensureAnsweredQuestionAvailable = async (studentId) => {
  const membership = await requireActiveMembership(studentId);

  if (membership.question_limit_weekly == null) {
    return { membership, usage: null };
  }

  const usage = await getAnsweredQuestionUsage(studentId);

  if (usage.used >= membership.question_limit_weekly) {
    const error = new Error('This student has reached their weekly answered-question limit.');
    error.statusCode = 402;
    throw error;
  }

  return { membership, usage };
};

module.exports = {
  ACTIVE_MEMBERSHIP_STATUSES,
  getWeekStart,
  getMembershipForUser,
  hasActiveMembership,
  requireActiveMembership,
  getAnsweredQuestionUsage,
  getMembershipUsageSummary,
  ensureAnsweredQuestionAvailable,
};

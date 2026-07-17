const { createClient } = require('@supabase/supabase-js');
const {
  FREE_WEEKLY_SESSIONS,
  STANDARD_WEEKLY_SESSIONS,
  TRIAL_TOTAL_SESSIONS,
} = require('../utils/constants');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Only statuses that represent a PAID, billing-confirmed subscription grant
// membership access. `approval_pending` and `approved` are intentionally
// excluded: PayPal reports them before the first payment is actually collected,
// so treating them as active let a user start a subscription, never complete/pay,
// and keep paid access indefinitely. Access is granted once the
// BILLING.SUBSCRIPTION.ACTIVATED webhook flips the row to `active`.
// `change_pending` is retained because it only applies to an already-active
// member revising their plan.
const ACTIVE_MEMBERSHIP_STATUSES = new Set([
  'active',
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

/**
 * The base weekly chat-session cap for a user, derived from their tier.
 *   - active unlimited membership -> null (uncapped)
 *   - active standard membership  -> STANDARD_WEEKLY_SESSIONS (5)
 *   - everyone else (free tier)   -> FREE_WEEKLY_SESSIONS (2)
 * Admin per-week grants are applied separately (see getSessionUsageSummary).
 */
const getBaseWeeklySessionLimit = (membership) => {
  if (hasActiveMembership(membership)) {
    if (membership.tier === 'unlimited') return null;
    return STANDARD_WEEKLY_SESSIONS;
  }
  return FREE_WEEKLY_SESSIONS;
};

const getTierLabel = (membership) => {
  if (!hasActiveMembership(membership)) return 'free';
  return membership.tier === 'unlimited' ? 'unlimited' : 'standard';
};

const getWeeklySessionBonus = async (userId, weekStart = getWeekStart()) => {
  const { data, error } = await supabase
    .from('weekly_session_grants')
    .select('bonus')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    // Non-fatal: a missing grant just means no bonus.
    console.error('Weekly session grant lookup error:', error);
    return 0;
  }

  return data?.bonus || 0;
};

/**
 * Total chat sessions this user has ever started. Used only for the guest
 * free-trial cap (anonymous users), which is a lifetime cap, not a weekly one.
 */
const getLifetimeSessionCount = async (userId) => {
  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId);

  if (error) {
    console.error('Lifetime session count error:', error);
    throw new Error('Failed to check trial usage.');
  }

  return count || 0;
};

/**
 * Throws a 402 (code TRIAL_LIMIT_REACHED) once a guest has used up their free
 * trial session(s). Callers should have already returned any existing OPEN
 * session before calling this so continuing a trial chat is free.
 */
const ensureTrialSessionAvailable = async (userId) => {
  const used = await getLifetimeSessionCount(userId);

  if (used >= TRIAL_TOTAL_SESSIONS) {
    const error = new Error(
      'Your free trial chat is complete. Create a free account to keep chatting with our experts — your trial conversation is saved.'
    );
    error.statusCode = 402;
    error.code = 'TRIAL_LIMIT_REACHED';
    throw error;
  }

  return { used, limit: TRIAL_TOTAL_SESSIONS, remaining: Math.max(TRIAL_TOTAL_SESSIONS - used, 0) };
};

const getWeeklySessionCount = async (userId, weekStart = getWeekStart()) => {
  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('week_start', weekStart);

  if (error) {
    console.error('Weekly session count error:', error);
    throw new Error('Failed to check chat-session usage.');
  }

  return count || 0;
};

/**
 * Full weekly usage summary for a user, valid for every tier including free.
 */
const getSessionUsageSummary = async (userId) => {
  const membership = await getMembershipForUser(userId);
  const weekStart = getWeekStart();
  const baseLimit = getBaseWeeklySessionLimit(membership);
  const bonus = baseLimit == null ? 0 : await getWeeklySessionBonus(userId, weekStart);
  const used = await getWeeklySessionCount(userId, weekStart);
  const limit = baseLimit == null ? null : Math.max(0, baseLimit + bonus);

  return {
    membership,
    hasActiveMembership: hasActiveMembership(membership),
    tier: getTierLabel(membership),
    weekStart,
    used,
    limit,
    remaining: limit == null ? null : Math.max(limit - used, 0),
  };
};

/**
 * Throws a 402 if the user has no remaining chat sessions this week.
 * Returns the usage summary otherwise. Callers should have already returned
 * any existing OPEN session before calling this (an open session is free to
 * continue and must not consume a new slot).
 */
const ensureSessionAvailable = async (userId) => {
  const summary = await getSessionUsageSummary(userId);

  if (summary.limit != null && summary.used >= summary.limit) {
    const error = new Error(
      summary.tier === 'free'
        ? 'You have used your 2 free chat sessions for this week. Upgrade to a membership to start more.'
        : 'You have reached your weekly chat-session limit.'
    );
    error.statusCode = 402;
    error.code = 'SESSION_LIMIT_REACHED';
    throw error;
  }

  return summary;
};

module.exports = {
  ACTIVE_MEMBERSHIP_STATUSES,
  getWeekStart,
  getMembershipForUser,
  hasActiveMembership,
  getBaseWeeklySessionLimit,
  getTierLabel,
  getWeeklySessionBonus,
  getWeeklySessionCount,
  getLifetimeSessionCount,
  ensureTrialSessionAvailable,
  getSessionUsageSummary,
  ensureSessionAvailable,
};

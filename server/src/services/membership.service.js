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

module.exports = {
  ACTIVE_MEMBERSHIP_STATUSES,
  getMembershipForUser,
  hasActiveMembership,
  requireActiveMembership,
};

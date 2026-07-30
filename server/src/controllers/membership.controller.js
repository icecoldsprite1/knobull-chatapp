const { getSessionUsageSummary, getLifetimeSessionCount } = require('../services/membership.service');
const { TRIAL_TOTAL_SESSIONS } = require('../utils/constants');

const getMembershipUsage = async (req, res) => {
  // Anonymous (trial guest): report the lifetime free-trial usage instead of a
  // weekly membership cap, so the client can show accurate trial state.
  if (req.user.is_anonymous) {
    try {
      const used = await getLifetimeSessionCount(req.user.sub);
      return res.json({
        usage: {
          membership: null,
          hasActiveMembership: false,
          tier: 'trial',
          used,
          limit: TRIAL_TOTAL_SESSIONS,
          remaining: Math.max(TRIAL_TOTAL_SESSIONS - used, 0),
        },
      });
    } catch (error) {
      console.error('Trial usage error:', error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load trial usage.' });
    }
  }

  try {
    // Works for every tier, including free (no membership row) — returns the
    // weekly chat-session usage and cap.
    const usage = await getSessionUsageSummary(req.user.sub);
    res.json({ usage });
  } catch (error) {
    console.error('Membership usage error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load membership usage.' });
  }
};

module.exports = {
  getMembershipUsage,
};

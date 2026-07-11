const { getSessionUsageSummary } = require('../services/membership.service');

const getMembershipUsage = async (req, res) => {
  if (req.user.is_anonymous) {
    return res.status(403).json({ error: 'Forbidden: Account required.' });
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

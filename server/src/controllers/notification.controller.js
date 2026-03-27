const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Register a device token for push notifications.
 * Called when an Expert logs in and grants notification permission.
 */
const registerDevice = async (req, res) => {
  const { token } = req.body;
  const userId = req.user.sub;

  if (!token) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  try {
    // Upsert: If this token already exists, just update the user_id
    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        { user_id: userId, token },
        { onConflict: 'token' }
      );

    if (error) {
      console.error('Device registration error:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Device registered for notifications.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { registerDevice };

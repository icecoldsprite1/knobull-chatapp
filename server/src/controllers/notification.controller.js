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
  // 🚨 AUTHORIZATION CHECK 🚨
  // Verify the caller is an authorized expert via the admins table.
  const userId = req.user.sub;

  try {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (!adminRow) {
      return res.status(403).json({ error: 'Forbidden: Only authorized experts can register for notifications.' });
    }
  } catch (err) {
    console.error('Admin verification error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  const { token } = req.body;

  if (!token || typeof token !== 'string' || token.length > 500) {
    return res.status(400).json({ error: 'Invalid device token' });
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
      return res.status(400).json({ error: 'Failed to register device.' });
    }

    res.json({ message: 'Device registered for notifications.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { registerDevice };

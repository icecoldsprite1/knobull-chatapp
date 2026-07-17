const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Confirm the caller is an authorized advisor (row in public.admins).
 * Throws an error carrying a statusCode for the caller to surface.
 */
const assertAdmin = async (userId) => {
  const { data: adminRow, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const err = new Error('Failed to verify advisor status.');
    err.statusCode = 500;
    throw err;
  }
  if (!adminRow) {
    const err = new Error('Forbidden: Only authorized experts can access this resource.');
    err.statusCode = 403;
    throw err;
  }
};

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

/**
 * Read the current advisor's email-alert preference (on/off).
 * Defaults to ON if the row/column isn't set yet.
 */
const getNotificationPreference = async (req, res) => {
  const userId = req.user.sub;

  try {
    await assertAdmin(userId);

    const { data, error } = await supabase
      .from('admins')
      .select('email_notifications')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Notification preference read error:', error);
      return res.status(500).json({ error: 'Failed to load notification preference.' });
    }

    res.json({ emailNotifications: data?.email_notifications !== false });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
  }
};

/**
 * Turn the current advisor's email alerts on or off.
 */
const setNotificationPreference = async (req, res) => {
  const userId = req.user.sub;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Field "enabled" must be true or false.' });
  }

  try {
    await assertAdmin(userId);

    const { error } = await supabase
      .from('admins')
      .update({ email_notifications: enabled })
      .eq('user_id', userId);

    if (error) {
      console.error('Notification preference update error:', error);
      return res.status(500).json({ error: 'Failed to update notification preference.' });
    }

    res.json({ emailNotifications: enabled });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
  }
};

module.exports = {
  registerDevice,
  getNotificationPreference,
  setNotificationPreference,
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const PLAN_CONFIG = {
  standard_monthly: {
    tier: 'standard',
    interval: 'month',
    question_limit_weekly: 5,
    paypal_plan_id: process.env.PAYPAL_STANDARD_MONTHLY_PLAN_ID,
  },
  standard_yearly: {
    tier: 'standard',
    interval: 'year',
    question_limit_weekly: 5,
    paypal_plan_id: process.env.PAYPAL_STANDARD_YEARLY_PLAN_ID,
  },
  unlimited_monthly: {
    tier: 'unlimited',
    interval: 'month',
    question_limit_weekly: null,
    paypal_plan_id: process.env.PAYPAL_UNLIMITED_MONTHLY_PLAN_ID,
  },
  unlimited_yearly: {
    tier: 'unlimited',
    interval: 'year',
    question_limit_weekly: null,
    paypal_plan_id: process.env.PAYPAL_UNLIMITED_YEARLY_PLAN_ID,
  },
};

const PAYPAL_SUBSCRIPTION_ID_REGEX = /^I-[A-Z0-9]+$/i;
const PAYPAL_API_BASE_URL = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const getPayPalAccessToken = async () => {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error('Missing PayPal client credentials.');
  }

  const credentials = Buffer
    .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
    .toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('PayPal token error:', data);
    throw new Error('Failed to authenticate with PayPal.');
  }

  return data.access_token;
};

const paypalRequest = async (path, options = {}) => {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error('PayPal API error:', data);
    throw new Error(data?.message || 'PayPal request failed.');
  }

  return data;
};

const getMembershipForUser = async (userId) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Membership lookup error:', error);
    throw new Error('Failed to check existing membership.');
  }

  return data;
};

const recordSubscription = async (req, res) => {
  const userId = req.user.sub;
  const { planKey, paypalSubscriptionId } = req.body;
  const plan = PLAN_CONFIG[planKey];

  if (!plan) {
    return res.status(400).json({ error: 'Invalid subscription plan.' });
  }

  if (!paypalSubscriptionId || !PAYPAL_SUBSCRIPTION_ID_REGEX.test(paypalSubscriptionId)) {
    return res.status(400).json({ error: 'Invalid PayPal subscription ID.' });
  }

  try {
    const existingMembership = await getMembershipForUser(userId);

    if (
      existingMembership?.paypal_subscription_id &&
      existingMembership.status !== 'cancelled' &&
      existingMembership.paypal_subscription_id !== paypalSubscriptionId
    ) {
      return res.status(409).json({
        error: 'This account already has a PayPal subscription. Cancel or update the existing subscription before choosing another plan.'
      });
    }

    const { data, error } = await supabase
      .from('memberships')
      .upsert({
        user_id: userId,
        plan_key: planKey,
        tier: plan.tier,
        billing_interval: plan.interval,
        question_limit_weekly: plan.question_limit_weekly,
        paypal_subscription_id: paypalSubscriptionId,
        paypal_plan_id: plan.paypal_plan_id,
        status: 'approval_pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Membership record error:', error);
      return res.status(500).json({ error: 'Failed to record subscription.' });
    }

    res.json({ membership: data });
  } catch (error) {
    console.error('Subscription record error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const cancelSubscription = async (req, res) => {
  const userId = req.user.sub;

  try {
    const membership = await getMembershipForUser(userId);

    if (!membership?.paypal_subscription_id || membership.status === 'cancelled') {
      return res.status(400).json({ error: 'No active PayPal subscription found.' });
    }

    await paypalRequest(`/v1/billing/subscriptions/${membership.paypal_subscription_id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'User requested cancellation from Knobull billing controls.',
      }),
    });

    const { data, error } = await supabase
      .from('memberships')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Membership cancellation record error:', error);
      return res.status(500).json({ error: 'Subscription cancelled in PayPal, but local membership update failed.' });
    }

    res.json({ membership: data });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription.' });
  }
};

const changeSubscriptionPlan = async (req, res) => {
  const userId = req.user.sub;
  const { planKey } = req.body;
  const plan = PLAN_CONFIG[planKey];

  if (!plan) {
    return res.status(400).json({ error: 'Invalid subscription plan.' });
  }

  if (!plan.paypal_plan_id) {
    return res.status(500).json({ error: 'PayPal plan ID is not configured.' });
  }

  try {
    const membership = await getMembershipForUser(userId);

    if (!membership?.paypal_subscription_id || membership.status === 'cancelled') {
      return res.status(400).json({ error: 'No active PayPal subscription found.' });
    }

    if (membership.plan_key === planKey) {
      return res.status(400).json({ error: 'You are already on this plan.' });
    }

    const origin = req.get('origin') || 'http://localhost:5173';
    const revision = await paypalRequest(`/v1/billing/subscriptions/${membership.paypal_subscription_id}/revise`, {
      method: 'POST',
      body: JSON.stringify({
        plan_id: plan.paypal_plan_id,
        application_context: {
          brand_name: 'Knobull',
          return_url: `${origin}/subscription/confirmed`,
          cancel_url: origin,
        },
      }),
    });

    const approvalUrl = revision?.links?.find((link) => link.rel === 'approve')?.href || null;

    const { data, error } = await supabase
      .from('memberships')
      .update({
        plan_key: planKey,
        tier: plan.tier,
        billing_interval: plan.interval,
        question_limit_weekly: plan.question_limit_weekly,
        paypal_plan_id: plan.paypal_plan_id,
        status: approvalUrl ? 'change_pending' : membership.status,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Membership plan-change record error:', error);
      return res.status(500).json({ error: 'Plan change started in PayPal, but local membership update failed.' });
    }

    res.json({ membership: data, approvalUrl });
  } catch (error) {
    console.error('Subscription plan-change error:', error);
    res.status(500).json({ error: error.message || 'Failed to change subscription plan.' });
  }
};

module.exports = {
  recordSubscription,
  cancelSubscription,
  changeSubscriptionPlan,
};

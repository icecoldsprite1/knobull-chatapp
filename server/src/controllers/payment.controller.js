const { createClient } = require('@supabase/supabase-js');
const { getMembershipForUser } = require('../services/membership.service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const PLAN_CONFIG = {
  standard_monthly: {
    tier: 'standard',
    interval: 'month',
    price_cents: 3000,
    question_limit_weekly: 5,
    paypal_plan_id: process.env.PAYPAL_STANDARD_MONTHLY_PLAN_ID,
  },
  standard_yearly: {
    tier: 'standard',
    interval: 'year',
    price_cents: 30000,
    question_limit_weekly: 5,
    paypal_plan_id: process.env.PAYPAL_STANDARD_YEARLY_PLAN_ID,
  },
  unlimited_monthly: {
    tier: 'unlimited',
    interval: 'month',
    price_cents: 9000,
    question_limit_weekly: null,
    paypal_plan_id: process.env.PAYPAL_UNLIMITED_MONTHLY_PLAN_ID,
  },
  unlimited_yearly: {
    tier: 'unlimited',
    interval: 'year',
    price_cents: 90000,
    question_limit_weekly: null,
    paypal_plan_id: process.env.PAYPAL_UNLIMITED_YEARLY_PLAN_ID,
  },
};

const PAYPAL_SUBSCRIPTION_ID_REGEX = /^I-[A-Z0-9]+$/i;
const PAYPAL_WEBHOOK_EVENT_TYPES = new Set([
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
]);
const PAYPAL_API_BASE_URL = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const allowedFrontendOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const findPlanByPayPalPlanId = (paypalPlanId) => {
  return Object.entries(PLAN_CONFIG).find(([, plan]) => plan.paypal_plan_id === paypalPlanId) || null;
};

const normalizePayPalStatus = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'active';
    case 'APPROVAL_PENDING':
      return 'approval_pending';
    case 'APPROVED':
      return 'approved';
    case 'SUSPENDED':
      return 'suspended';
    case 'CANCELLED':
      return 'cancelled';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'unknown';
  }
};

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

const getPayPalSubscription = async (subscriptionId) => {
  return paypalRequest(`/v1/billing/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });
};

const assertSubscriptionBelongsToUser = (paypalSubscription, userId) => {
  if (paypalSubscription?.custom_id !== userId) {
    const error = new Error('PayPal subscription does not belong to this user.');
    error.statusCode = 403;
    throw error;
  }
};

const getSafeFrontendOrigin = (req) => {
  const requestOrigin = req.get('origin');

  if (requestOrigin && allowedFrontendOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  return allowedFrontendOrigins[0] || 'http://localhost:5173';
};

const addPeriod = (date, interval) => {
  const nextDate = new Date(date);
  if (interval === 'year') {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  }
  return nextDate;
};

const getDowngradeWindowDays = (interval) => interval === 'year' ? 30 : 7;

const getPlanChangePolicy = (membership, targetPlanKey) => {
  const currentPlan = PLAN_CONFIG[membership.plan_key];
  const targetPlan = PLAN_CONFIG[targetPlanKey];
  const isDowngrade = currentPlan && targetPlan && targetPlan.price_cents < currentPlan.price_cents;
  const periodStart = new Date(membership.current_period_started_at || membership.created_at);
  const downgradeWindowDays = getDowngradeWindowDays(membership.billing_interval);
  const downgradeDeadline = new Date(periodStart);
  downgradeDeadline.setUTCDate(downgradeDeadline.getUTCDate() + downgradeWindowDays);
  const lockUntil = membership.downgrade_locked_until
    ? new Date(membership.downgrade_locked_until)
    : null;

  return {
    isDowngrade,
    downgradeWindowDays,
    downgradeDeadline,
    lockUntil,
    periodEndsAt: addPeriod(periodStart, membership.billing_interval),
  };
};

const enforcePlanChangePolicy = (membership, targetPlanKey) => {
  const policy = getPlanChangePolicy(membership, targetPlanKey);

  if (!policy.isDowngrade) {
    return policy;
  }

  const now = new Date();

  if (policy.lockUntil && policy.lockUntil > now) {
    const error = new Error(`You already used your downgrade for this subscription period. You can downgrade again after ${policy.lockUntil.toLocaleDateString('en-US')}.`);
    error.statusCode = 409;
    throw error;
  }

  if (now > policy.downgradeDeadline) {
    const error = new Error(`Downgrades for this plan are only available within ${policy.downgradeWindowDays} days of the current subscription period.`);
    error.statusCode = 409;
    throw error;
  }

  return policy;
};

const verifyPayPalWebhookSignature = async (req, webhookEvent) => {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    throw new Error('Missing PayPal webhook ID.');
  }

  const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: req.get('paypal-auth-algo'),
      cert_url: req.get('paypal-cert-url'),
      transmission_id: req.get('paypal-transmission-id'),
      transmission_sig: req.get('paypal-transmission-sig'),
      transmission_time: req.get('paypal-transmission-time'),
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: webhookEvent,
    }),
  });

  return verification?.verification_status === 'SUCCESS';
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
    if (!plan.paypal_plan_id) {
      return res.status(500).json({ error: 'PayPal plan ID is not configured.' });
    }

    const paypalSubscription = await getPayPalSubscription(paypalSubscriptionId);
    assertSubscriptionBelongsToUser(paypalSubscription, userId);

    if (paypalSubscription?.plan_id !== plan.paypal_plan_id) {
      return res.status(400).json({ error: 'PayPal subscription does not match the selected plan.' });
    }

    const paypalStatus = normalizePayPalStatus(paypalSubscription?.status);
    if (['cancelled', 'expired', 'suspended'].includes(paypalStatus)) {
      return res.status(400).json({ error: 'PayPal subscription is not active or pending approval.' });
    }

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
        status: paypalStatus,
        current_period_started_at: new Date().toISOString(),
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
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
  }
};

const handlePayPalWebhook = async (req, res) => {
  let webhookEvent;

  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    webhookEvent = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }

  try {
    const isVerified = await verifyPayPalWebhookSignature(req, webhookEvent);
    if (!isVerified) {
      return res.status(400).json({ error: 'Invalid PayPal webhook signature.' });
    }

    if (!PAYPAL_WEBHOOK_EVENT_TYPES.has(webhookEvent.event_type)) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const resource = webhookEvent.resource || {};
    const subscriptionId = resource.id || resource.billing_agreement_id;

    if (!subscriptionId || !PAYPAL_SUBSCRIPTION_ID_REGEX.test(subscriptionId)) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const planEntry = resource.plan_id ? findPlanByPayPalPlanId(resource.plan_id) : null;
    const planKey = planEntry?.[0];
    const plan = planEntry?.[1];

    const updatePayload = {
      status: webhookEvent.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
        ? 'payment_failed'
        : normalizePayPalStatus(resource.status),
      updated_at: new Date().toISOString(),
    };

    if (planKey && plan) {
      updatePayload.plan_key = planKey;
      updatePayload.tier = plan.tier;
      updatePayload.billing_interval = plan.interval;
      updatePayload.question_limit_weekly = plan.question_limit_weekly;
      updatePayload.paypal_plan_id = plan.paypal_plan_id;
    }

    const { error } = await supabase
      .from('memberships')
      .update(updatePayload)
      .eq('paypal_subscription_id', subscriptionId);

    if (error) {
      console.error('PayPal webhook membership update error:', error);
      return res.status(500).json({ error: 'Failed to sync membership.' });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    res.status(500).json({ error: error.message || 'Webhook handling failed.' });
  }
};

const cancelSubscription = async (req, res) => {
  const userId = req.user.sub;

  try {
    const membership = await getMembershipForUser(userId);

    if (!membership?.paypal_subscription_id || membership.status === 'cancelled') {
      return res.status(400).json({ error: 'No active PayPal subscription found.' });
    }

    const paypalSubscription = await getPayPalSubscription(membership.paypal_subscription_id);
    assertSubscriptionBelongsToUser(paypalSubscription, userId);

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
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to cancel subscription.' });
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

    const planPolicy = enforcePlanChangePolicy(membership, planKey);
    const paypalSubscription = await getPayPalSubscription(membership.paypal_subscription_id);
    assertSubscriptionBelongsToUser(paypalSubscription, userId);

    const origin = getSafeFrontendOrigin(req);
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
        current_period_started_at: new Date().toISOString(),
        downgrade_used_at: planPolicy.isDowngrade ? new Date().toISOString() : membership.downgrade_used_at,
        downgrade_locked_until: planPolicy.isDowngrade
          ? planPolicy.periodEndsAt.toISOString()
          : membership.downgrade_locked_until,
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
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to change subscription plan.' });
  }
};

module.exports = {
  recordSubscription,
  handlePayPalWebhook,
  cancelSubscription,
  changeSubscriptionPlan,
};

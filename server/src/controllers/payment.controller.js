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
    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from('memberships')
      .select('paypal_subscription_id, plan_key, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMembershipError) {
      console.error('Membership lookup error:', existingMembershipError);
      return res.status(500).json({ error: 'Failed to check existing membership.' });
    }

    if (
      existingMembership?.paypal_subscription_id &&
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

module.exports = { recordSubscription };

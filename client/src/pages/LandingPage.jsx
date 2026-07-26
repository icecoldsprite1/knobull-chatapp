import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ShieldCheck, Send, Library, LogOut, MessageCircle, CreditCard, AlertTriangle, X, Users, Settings } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import LoginForm from '../components/LoginForm';
import PayPalSubscriptionButton from '../components/PayPalSubscriptionButton';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY;
// Where the guest's typed first question is stashed while we start their trial
// session, so StudentChatPage can auto-send it once the session is ready.
const TRIAL_FIRST_MESSAGE_KEY = 'knobull_trial_first_message';
// Persists across sign-out (Supabase's signOut only clears its own auth keys, not
// this one), so a visitor can't farm unlimited guest trials by signing out and
// starting a fresh anonymous session. Only cleared if they wipe browser storage.
const TRIAL_USED_KEY = 'knobull_trial_used';

const MEMBERSHIP_PLANS = [
  {
    key: 'standard_monthly',
    tier: 'standard',
    title: 'Standard Package',
    description: 'Five chat sessions per week.',
    price: '$30 / month',
    priceCents: 3000,
    paypalPlanId: import.meta.env.VITE_PAYPAL_STANDARD_MONTHLY_PLAN_ID,
  },
  {
    key: 'standard_yearly',
    tier: 'standard',
    title: 'Standard Package',
    description: 'Five chat sessions per week.',
    price: '$300 / year',
    priceCents: 30000,
    paypalPlanId: import.meta.env.VITE_PAYPAL_STANDARD_YEARLY_PLAN_ID,
  },
  {
    key: 'unlimited_monthly',
    tier: 'unlimited',
    title: 'Unlimited Package',
    description: 'Unlimited chat sessions.',
    price: '$90 / month',
    priceCents: 9000,
    paypalPlanId: import.meta.env.VITE_PAYPAL_UNLIMITED_MONTHLY_PLAN_ID,
  },
  {
    key: 'unlimited_yearly',
    tier: 'unlimited',
    title: 'Unlimited Package',
    description: 'Unlimited chat sessions.',
    price: '$900 / year',
    priceCents: 90000,
    paypalPlanId: import.meta.env.VITE_PAYPAL_UNLIMITED_YEARLY_PLAN_ID,
  },
];

/**
 * LandingPage Component
 * 
 * The default route when the application loads.
 * Features a navbar, hero section, guest preview chat, membership info,
 * and access portals for Students and Advisors.
 * 
 * @param {Object} props.user - Current auth user (may be null)
 * @param {boolean} props.isAdmin - Whether the current user is an admin
 */
export default function LandingPage({ user, isAdmin }) {
  const navigate = useNavigate();
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showPlanManagement, setShowPlanManagement] = useState(false);

  // ==========================================
  // GUEST FREE-TRIAL CHAT LAUNCHER
  // A not-yet-registered visitor can start ONE real chat session to try the
  // service via Supabase anonymous auth. The backend enforces the 1-session
  // trial cap; afterwards they create a free account, which carries the trial
  // conversation over (their anonymous user is converted, not replaced).
  // ==========================================
  const [trialInput, setTrialInput] = useState('');
  const [trialStarting, setTrialStarting] = useState(false);
  const [trialError, setTrialError] = useState('');
  const [trialCaptcha, setTrialCaptcha] = useState(null);
  const trialCaptchaRef = useRef(null);

  const [membership, setMembership] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [billingAction, setBillingAction] = useState('');
  const [billingError, setBillingError] = useState('');
  const [pendingBillingAction, setPendingBillingAction] = useState(null);
  const [membershipUsage, setMembershipUsage] = useState(null);

  const startGuestTrial = async (e) => {
    if (e) e.preventDefault();
    if (trialStarting) return;
    setTrialError('');

    const question = trialInput.trim();
    if (!question) {
      setTrialError('Type a question to start your free chat.');
      return;
    }

    // Already signed in — a verified student, or a guest already mid-trial. Just
    // go to chat with the typed question; don't start a second anonymous identity.
    if (user) {
      sessionStorage.setItem(TRIAL_FIRST_MESSAGE_KEY, question);
      navigate('/chat');
      return;
    }

    // Logged-out visitor starting a NEW trial. If this browser already used its
    // one free trial, block it — otherwise signing out and retrying would mint a
    // fresh anonymous user and reset the cap (the infinite-trial exploit).
    if (localStorage.getItem(TRIAL_USED_KEY)) {
      setTrialError('You’ve already used your free trial chat. Create a free account (it’s free) to keep chatting with our experts.');
      return;
    }

    if (HCAPTCHA_SITEKEY && !trialCaptcha) {
      setTrialError('Please complete the security check to start your free trial.');
      return;
    }

    setTrialStarting(true);
    try {
      const { error } = await supabase.auth.signInAnonymously(
        HCAPTCHA_SITEKEY ? { options: { captchaToken: trialCaptcha } } : undefined
      );

      if (error) {
        const anonDisabled = /anonymous/i.test(error.message || '');
        setTrialError(
          anonDisabled
            ? 'Free trial is temporarily unavailable. Please create a free account to start chatting.'
            : (error.message || 'Could not start your free trial. Please try again.')
        );
        return;
      }

      // Mark this browser's one free trial as used, so signing out and retrying
      // can't start another anonymous trial session.
      localStorage.setItem(TRIAL_USED_KEY, new Date().toISOString());
      sessionStorage.setItem(TRIAL_FIRST_MESSAGE_KEY, question);
      navigate('/chat');
    } catch (err) {
      console.error('Guest trial start failed:', err);
      setTrialError('Could not start your free trial. Please try again.');
    } finally {
      setTrialStarting(false);
      setTrialCaptcha(null);
      trialCaptchaRef.current?.resetCaptcha();
    }
  };

  // Navigate student based on auth state
  const handleStudentClick = () => {
    if (user && !user.is_anonymous && user.email_confirmed_at) {
      navigate('/chat');
    } else {
      navigate('/login');
    }
  };

  // Navigate admin based on auth state
  const handleAdvisorSuccess = () => {
    navigate('/dashboard', { replace: true });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const isVerifiedUser = user && !user.is_anonymous && user.email_confirmed_at;
  const isVerifiedStudent = isVerifiedUser && !isAdmin;

  useEffect(() => {
    let isCancelled = false;

    const fetchMembership = async () => {
      if (!isVerifiedStudent) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      setMembershipLoading(true);
      const { data, error } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isCancelled) {
        if (error) {
          console.error('Membership lookup failed:', error);
          setMembership(null);
        } else {
          setMembership(data);
        }
        setMembershipLoading(false);
      }
    };

    fetchMembership();

    return () => {
      isCancelled = true;
    };
  }, [isVerifiedStudent, user?.id]);

  const activePlanLabel = membership
    ? MEMBERSHIP_PLANS.find((plan) => plan.key === membership.plan_key)?.price
    : null;
  const hasActiveMembership = membership && membership.status !== 'cancelled';
  const activePlan = membership
    ? MEMBERSHIP_PLANS.find((plan) => plan.key === membership.plan_key)
    : null;
  const activePlanTitle = activePlan
    ? `${activePlan.title.replace(' Package', '')} ${membership.billing_interval}`
    : 'Membership';
  const membershipAllowance = membership?.tier === 'unlimited'
    ? 'Unlimited chat sessions included'
    : 'Five chat sessions per week included';
  const availablePlanChanges = hasActiveMembership
    ? MEMBERSHIP_PLANS.filter((plan) => plan.key !== membership.plan_key)
    : [];
  const pendingPlan = pendingBillingAction?.type === 'change'
    ? MEMBERSHIP_PLANS.find((plan) => plan.key === pendingBillingAction.planKey)
    : null;
  const isPendingDowngrade = pendingPlan && activePlan
    ? pendingPlan.priceCents < activePlan.priceCents
    : false;
  const downgradeWindow = membership?.billing_interval === 'year' ? '30 days' : '7 days';

  useEffect(() => {
    let isCancelled = false;

    const fetchUsage = async () => {
      // Usage applies to every verified student, including free tier (2/week).
      if (!isVerifiedStudent) {
        setMembershipUsage(null);
        return;
      }

      try {
        const data = await apiService.getMembershipUsage();
        if (!isCancelled) {
          setMembershipUsage(data.usage);
        }
      } catch (err) {
        console.error('Membership usage lookup failed:', err);
        if (!isCancelled) {
          setMembershipUsage(null);
        }
      }
    };

    fetchUsage();

    // A chat session counts on start, so weekly usage changes when a session
    // row is created; refresh the counter on any change to this user's sessions.
    const usageChannel = isVerifiedStudent && user?.id
      ? supabase.channel(`session_usage_${user.id}_${Date.now()}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'sessions', filter: `student_id=eq.${user.id}` },
          () => fetchUsage()
        )
        .subscribe()
      : null;

    const handleFocus = () => fetchUsage();
    window.addEventListener('focus', handleFocus);

    return () => {
      isCancelled = true;
      window.removeEventListener('focus', handleFocus);
      if (usageChannel) {
        supabase.removeChannel(usageChannel);
      }
    };
  }, [isVerifiedStudent, hasActiveMembership, membership?.updated_at, user?.id]);

  const requestPlanChange = (planKey) => {
    setBillingError('');
    setPendingBillingAction({ type: 'change', planKey });
  };

  const requestCancelSubscription = () => {
    setBillingError('');
    setPendingBillingAction({ type: 'cancel' });
  };

  const closeBillingConfirmation = () => {
    if (billingAction) return;
    setPendingBillingAction(null);
  };

  const handlePlanChange = async (planKey) => {
    setBillingError('');
    setBillingAction(planKey);

    try {
      const data = await apiService.changeSubscriptionPlan({ planKey });
      setMembership(data.membership);

      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      }
    } catch (err) {
      setBillingError(err.message || 'Unable to change subscription plan.');
    } finally {
      setBillingAction('');
      setPendingBillingAction(null);
    }
  };

  const handleCancelSubscription = async () => {
    setBillingError('');
    setBillingAction('cancel');

    try {
      const data = await apiService.cancelSubscription();
      setMembership(data.membership);
    } catch (err) {
      setBillingError(err.message || 'Unable to cancel subscription.');
    } finally {
      setBillingAction('');
      setPendingBillingAction(null);
    }
  };

  const confirmBillingAction = () => {
    if (!pendingBillingAction) return;

    if (pendingBillingAction.type === 'change') {
      handlePlanChange(pendingBillingAction.planKey);
      return;
    }

    if (pendingBillingAction.type === 'cancel') {
      handleCancelSubscription();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">

      {/* ===================== TOP NAVBAR ===================== */}
      <nav className="w-full bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img 
            src="/icons/knobull2.png" 
            alt="Knobull Logo" 
            className="w-9 h-9 rounded-full object-cover shadow-sm"
          />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Knobull</span>
        </div>
        <div className="flex items-center gap-3">
          {user && !user.is_anonymous && user.email_confirmed_at ? (
            // Logged-in student — show shortcut
            <>
              <button 
                onClick={() => navigate(isAdmin ? '/dashboard' : '/chat')}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 px-4 py-2 border border-blue-200 hover:bg-blue-50 rounded-xl transition-all"
              >
                {isAdmin ? 'Dashboard' : 'My Chat'} →
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl transition-all"
              >
                <LogOut size={15} /> Sign Out
              </button>
            </>
          ) : (
            <button 
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 px-4 py-2 border border-blue-200 hover:bg-blue-50 rounded-xl transition-all"
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {/* ===================== HERO SECTION ===================== */}
      <section className="w-full bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 text-white py-14 md:py-20 relative overflow-hidden">
        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight drop-shadow-sm">
            Chat with Experts
          </h1>

          {/* Mascot Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-32 h-32 md:w-44 md:h-44 rounded-full">
              <img 
                src="/icons/knobull2.png" 
                alt="Knobull Mascot" 
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          <p className="text-lg md:text-xl text-white/90 max-w-xl mx-auto leading-relaxed mb-3">
            We're here to help.
          </p>
          <p className="text-base md:text-lg text-white/75 max-w-md mx-auto leading-relaxed mb-8">
            Reach out and we'll get back quickly.
          </p>

          <button
            onClick={() => {
              document.getElementById(isAdmin || hasActiveMembership ? 'member-home' : 'preview-chat')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl shadow-lg hover:bg-gray-50 transition-all duration-300"
          >
            {isAdmin ? 'Go to admin panel' : hasActiveMembership ? 'Go to membership' : 'Get started'}
          </button>
        </div>
      </section>

      {/* ===================== MEMBERSHIP PERKS ===================== */}
      <section id="member-home" className="w-full bg-white py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8 tracking-tight">
            {hasActiveMembership ? 'Your Membership' : 'Knobull Membership'}
          </h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-900/5 p-6 md:p-8 space-y-6">
            {isAdmin ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Staff access</p>
                      <h3 className="mt-1 text-xl font-bold text-slate-950">Admin account detected</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        You are signed in as a Knobull advisor. Subscription checkout is hidden for staff accounts.
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                      Advisor
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-slate-900/20 transition hover:bg-slate-800"
                    >
                      <Users size={16} />
                      Open Advisor Dashboard
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Review queue</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">View mine, unclaimed, and claimed student sessions.</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Respond to students</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">Claim active chats and reply from the advisor dashboard.</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Manage access</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">Adjust question allowances and return chats to the unclaimed queue.</p>
                  </div>
                </div>
              </>
            ) : hasActiveMembership ? (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Active membership</p>
                      <h3 className="mt-1 text-xl font-bold capitalize text-emerald-950">{activePlanTitle}</h3>
                      <p className="mt-1 text-sm text-emerald-800">
                        {activePlanLabel ? `${activePlanLabel}. ` : ''}{membershipAllowance}.
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                      {membership.status}
                    </div>
                  </div>

                  {membership.status === 'change_pending' && (
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      Your plan change is pending PayPal approval.
                    </p>
                  )}

                  {billingError && (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      {billingError}
                    </p>
                  )}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => navigate('/chat')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
                    >
                      <MessageCircle size={16} />
                      Go to Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPlanManagement((value) => !value)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                    >
                      <CreditCard size={16} />
                      Manage Subscription
                    </button>
                  </div>
                  {membershipUsage?.limit != null && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Answered questions this week</p>
                          <p className="mt-1 text-sm font-semibold text-emerald-950">
                            {membershipUsage.used} of {membershipUsage.limit} used
                          </p>
                        </div>
                        <div className="text-right text-xs font-medium text-emerald-700">
                          {membershipUsage.remaining} remaining
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${Math.min((membershipUsage.used / membershipUsage.limit) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {showPlanManagement && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h3 className="text-base font-bold text-gray-900">Switch Plans?</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">
                      Upgrades take effect immediately. Downgrades are allowed only within {downgradeWindow} of the current subscription period and can be used once per period.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-700">
                      If you downgrade and later upgrade, you cannot downgrade again until this subscription period ends.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {availablePlanChanges.map((plan) => (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => requestPlanChange(plan.key)}
                          disabled={!!billingAction}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {billingAction === plan.key ? 'Updating...' : `Switch to ${plan.price}`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={requestCancelSubscription}
                      disabled={!!billingAction}
                      className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {billingAction === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Expert chat</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">Continue your academic or career support conversation.</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Fast follow-up</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">Ask questions when you need guidance without returning to checkout.</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Plan control</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">Switch plans or cancel from this page.</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Free-tier status for signed-in students without a paid plan */}
                {isVerifiedStudent && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Free plan</p>
                        <h3 className="mt-1 text-xl font-bold text-blue-950">2 free chat sessions each week</h3>
                        <p className="mt-1 text-sm text-blue-800">
                          Upgrade any time for more weekly sessions or unlimited support.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/chat')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
                      >
                        <MessageCircle size={16} />
                        Go to Chat
                      </button>
                    </div>
                    {membershipUsage?.limit != null && (
                      <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Chat sessions this week</p>
                            <p className="mt-1 text-sm font-semibold text-blue-950">
                              {membershipUsage.used} of {membershipUsage.limit} used
                            </p>
                          </div>
                          <div className="text-right text-xs font-medium text-blue-700">
                            {membershipUsage.remaining} remaining
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${Math.min((membershipUsage.used / membershipUsage.limit) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Major Time + Money Savings */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Major Time + Money Savings</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    <span className="font-semibold text-gray-900">All users</span> gain free access to a top ranked academic search engine, direct links to research sources, student focused news articles, online courses. <span className="font-semibold text-gray-900">Members</span> can ask learning/career experts questions and receive guidance with no scheduling hassles, missing time from work/school, or expensive consults.
                  </p>
                </div>

                {/* Learning Career Expert Support Examples */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Learning Career Expert Support Examples</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Job search guidance, resume upgrade, time management, career choices, interview skills, work/life balance, presentation techniques, research process development, and many other critical learning/career development topics.
                  </p>
                  <p className="text-gray-600 text-sm leading-relaxed mt-2">
                    Quick response when you need answers on skill building related topics from 9 am to midnight 7 days each week.
                  </p>
                </div>

                {/* Learning and Career Experts */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Learning and Career Experts</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Chat with experts 1:1 that have pragmatic knowledge and experience—anytime, anywhere.
                  </p>
                </div>

                {/* Start with 30-day free trial */}
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-base">
                      <BookOpen size={17} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {isAdmin ? 'Admin account detected' : isVerifiedStudent ? 'Choose a membership' : 'Start chatting free'}
                    </h3>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    {isAdmin
                      ? 'This account has Advisor Dashboard access. Use a non-admin student account to test subscriptions and student chat.'
                      : isVerifiedStudent
                      ? 'Select a monthly or yearly plan to continue with Knobull expert support.'
                      : 'Create a free account for 2 chat sessions every week. Upgrade any time for more.'}
                  </p>

                  {isAdmin && (
                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Admins cannot subscribe from this account.</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        This prevents staff accounts from being treated as paid student accounts. Sign out and use a separate student test account for PayPal subscription testing.
                      </p>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="mt-3 text-xs font-bold text-blue-700 hover:text-blue-900"
                      >
                        Sign out
                      </button>
                    </div>
                  )}

                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h4 className="text-sm font-bold text-amber-950">Switch Plans?</h4>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800">
                      Upgrades to a higher plan take effect immediately. Downgrades are only available within 7 days for monthly plans or 30 days for yearly plans, and can be used once per subscription period.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-800">
                      If you downgrade and later upgrade again, you cannot downgrade again until that subscription period ends.
                    </p>
                  </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {MEMBERSHIP_PLANS.map((plan) => (
                    <div
                      key={plan.key}
                      className={`p-4 rounded-xl border ${
                        plan.tier === 'standard'
                          ? 'bg-blue-50/60 border-blue-100'
                          : 'bg-indigo-50/60 border-indigo-100'
                      }`}
                    >
                      <p className="font-bold text-gray-900 text-sm mb-1">{plan.title}</p>
                      <p className="text-gray-600 text-xs mb-2">{plan.description}</p>
                      <p className={`font-semibold text-sm mb-3 ${
                        plan.tier === 'standard' ? 'text-blue-700' : 'text-indigo-700'
                      }`}>
                        {plan.price}
                      </p>
                      <PayPalSubscriptionButton
                        plan={plan}
                        disabled={!isVerifiedStudent || membershipLoading}
                        onRequireLogin={() => navigate('/login')}
                        userId={user?.id}
                      />
                    </div>
                  ))}
                </div>
                </div>
              </>
            )}

          </div>
        </div>
      </section>

      {/* ===================== GUEST FREE-TRIAL CHAT ===================== */}
      {!hasActiveMembership && !isAdmin && (
        <section id="preview-chat" className="w-full bg-gray-50 py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2 tracking-tight">
            {isVerifiedStudent ? 'Start an Expert Chat' : 'Try It Free'}
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            {isVerifiedStudent
              ? 'Ask a question to open a chat with a Knobull expert.'
              : 'Ask a question to start one free chat with a real Knobull expert — no account needed. Sign up free afterward to keep chatting.'}
          </p>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-900/5 overflow-hidden">
            {/* Chat Header */}
            <div className="px-5 py-3.5 bg-blue-700 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                <Library className="text-white" size={16} />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Knobull Support</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <p className="text-[10px] text-blue-100 uppercase tracking-wider font-semibold">Advisors Online</p>
                </div>
              </div>
            </div>

            {/* Intro + trial launcher */}
            <div className="p-5 space-y-4 bg-slate-50/50">
              <div className="flex justify-start">
                <div className="max-w-[85%] px-4 py-3 text-sm leading-relaxed bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm shadow-sm">
                  <p className="whitespace-pre-wrap">
                    👋 Hi! I'm the Knobull Guide. Ask a learning or career question below and I'll connect you with a real expert.
                    {!user && ' Your first chat is free — no account needed.'}
                  </p>
                </div>
              </div>

              <form onSubmit={startGuestTrial} className="space-y-3">
                <textarea
                  value={trialInput}
                  onChange={(e) => setTrialInput(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm resize-none"
                  placeholder="e.g. How do I improve my resume for a software internship?"
                />

                {!user && HCAPTCHA_SITEKEY && (
                  <div className="flex justify-center">
                    <HCaptcha
                      ref={trialCaptchaRef}
                      sitekey={HCAPTCHA_SITEKEY}
                      onVerify={(token) => { setTrialCaptcha(token); setTrialError(''); }}
                      onExpire={() => setTrialCaptcha(null)}
                      onError={() => setTrialCaptcha(null)}
                    />
                  </div>
                )}

                {trialError && (
                  <p className="text-red-600 text-xs text-center">{trialError}</p>
                )}

                <button
                  type="submit"
                  disabled={trialStarting || !trialInput.trim() || (!user && !!HCAPTCHA_SITEKEY && !trialCaptcha)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {trialStarting
                    ? 'Starting your chat…'
                    : user
                    ? 'Go to your chat'
                    : 'Start my free chat'}
                </button>

                {!user && (
                  <p className="text-center text-xs text-slate-400">
                    Already have an account?{' '}
                    <button type="button" onClick={() => navigate('/login')} className="text-blue-600 font-semibold hover:underline">
                      Sign in
                    </button>
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
        </section>
      )}

      {/* ===================== ACCESS PORTALS ===================== */}
      <section id="get-started" className="w-full bg-gray-50 py-12 md:py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 text-center mb-8 tracking-tight">
            Access Portals
          </h2>

          {!showLoginForm ? (
            <div className="grid md:grid-cols-2 gap-5">
              {/* Student Access Card */}
              <button 
                onClick={handleStudentClick}
                className="flex flex-col p-7 bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 rounded-2xl shadow-lg shadow-blue-900/10 hover:-translate-y-1 hover:shadow-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 text-left group"
              >
                <div className="w-12 h-12 bg-blue-500/30 rounded-xl text-white flex items-center justify-center mb-5">
                  <BookOpen size={26} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Chat With An Expert
                </h3>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Open a secure session with an academic, career search, research, +more Expert. Get 2 free chat sessions every week.
                </p>
                <p className="text-blue-200/70 text-xs mt-3 font-medium">
                  Free account • 2 chat sessions / week
                </p>
              </button>

              {/* Advisor Gateway Card */}
              <button 
                onClick={() => {
                  if (isAdmin) {
                    navigate('/dashboard');
                  } else {
                    setShowLoginForm(true);
                  }
                }} 
                className="flex flex-col p-7 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl shadow-lg shadow-slate-900/10 hover:-translate-y-1 hover:shadow-xl hover:from-slate-900 hover:to-slate-950 transition-all duration-300 text-left group"
              >
                <div className="w-12 h-12 bg-slate-700/50 rounded-xl text-white flex items-center justify-center mb-5">
                  <ShieldCheck size={26} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Advisor Gateway</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Secure staff login to access the student request queue and dashboard.
                </p>
              </button>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <LoginForm 
                onClose={() => setShowLoginForm(false)} 
                onSuccess={handleAdvisorSuccess} 
              />
            </div>
          )}
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="w-full bg-white border-t border-gray-200 py-6 mt-auto">
        <p className="text-gray-400 text-sm font-medium text-center">
          © {new Date().getFullYear()} Knobull Academic Resources
        </p>
      </footer>

      {pendingBillingAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
                  pendingBillingAction.type === 'cancel'
                    ? 'border-red-200 bg-red-50 text-red-600'
                    : 'border-amber-200 bg-amber-50 text-amber-600'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">
                    {pendingBillingAction.type === 'cancel' ? 'Cancel subscription?' : 'Switch subscription plan?'}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {pendingBillingAction.type === 'cancel'
                      ? 'This will cancel your PayPal subscription and remove active membership access after the cancellation is recorded.'
                      : `You are about to switch from ${activePlanLabel || activePlanTitle} to ${pendingPlan?.price || 'the selected plan'}. PayPal may ask you to approve the change.`}
                  </p>
                  {isPendingDowngrade && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800">
                      Downgrade policy: this downgrade is only allowed within {downgradeWindow} of the current subscription period. After confirming, you cannot downgrade again until this period ends, even if you upgrade later.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeBillingConfirmation}
                disabled={!!billingAction}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current plan</p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
                {activePlanTitle}{activePlanLabel ? ` (${activePlanLabel})` : ''}
              </p>
              {pendingPlan && (
                <>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">New plan</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {pendingPlan.title} ({pendingPlan.price})
                  </p>
                </>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeBillingConfirmation}
                disabled={!!billingAction}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep Current Plan
              </button>
              <button
                type="button"
                onClick={confirmBillingAction}
                disabled={!!billingAction}
                className={`rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  pendingBillingAction.type === 'cancel'
                    ? 'bg-red-600 shadow-red-600/20 hover:bg-red-700'
                    : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700'
                }`}
              >
                {billingAction
                  ? pendingBillingAction.type === 'cancel' ? 'Cancelling...' : 'Redirecting...'
                  : pendingBillingAction.type === 'cancel' ? 'Yes, Cancel' : 'Yes, Switch Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

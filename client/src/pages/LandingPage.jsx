import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ShieldCheck, Send, Library, LogOut, MessageCircle, CreditCard } from 'lucide-react';
import LoginForm from '../components/LoginForm';
import PayPalSubscriptionButton from '../components/PayPalSubscriptionButton';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';

const MEMBERSHIP_PLANS = [
  {
    key: 'standard_monthly',
    tier: 'standard',
    title: 'Standard Package',
    description: 'Five questions per week.',
    price: '$30 / month',
    paypalPlanId: import.meta.env.VITE_PAYPAL_STANDARD_MONTHLY_PLAN_ID,
  },
  {
    key: 'standard_yearly',
    tier: 'standard',
    title: 'Standard Package',
    description: 'Five questions per week.',
    price: '$300 / year',
    paypalPlanId: import.meta.env.VITE_PAYPAL_STANDARD_YEARLY_PLAN_ID,
  },
  {
    key: 'unlimited_monthly',
    tier: 'unlimited',
    title: 'Unlimited Package',
    description: 'Unlimited support package.',
    price: '$90 / month',
    paypalPlanId: import.meta.env.VITE_PAYPAL_UNLIMITED_MONTHLY_PLAN_ID,
  },
  {
    key: 'unlimited_yearly',
    tier: 'unlimited',
    title: 'Unlimited Package',
    description: 'Unlimited support package.',
    price: '$900 / year',
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
  // GUEST PREVIEW CHAT (local state only, no database)
  // ==========================================
  const PREVIEW_LIMIT = 2;
  const [previewMessages, setPreviewMessages] = useState([
    { sender: 'bot', text: "👋 Hi! I'm the Knobull Guide. I can connect you with learning and career experts. What's on your mind?" }
  ]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewCount, setPreviewCount] = useState(0);
  const [showSignupPrompt, setShowSignupPrompt] = useState(false);
  const [membership, setMembership] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [billingAction, setBillingAction] = useState('');
  const [billingError, setBillingError] = useState('');
  const previewBottomRef = useRef(null);

  const handlePreviewSend = (e) => {
    e.preventDefault();
    if (!previewInput.trim()) return;

    const userMsg = previewInput.trim();
    setPreviewInput('');

    // Add user message
    setPreviewMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    const newCount = previewCount + 1;
    setPreviewCount(newCount);

    // Bot response after a short delay
    setTimeout(() => {
      if (newCount >= PREVIEW_LIMIT) {
        setPreviewMessages((prev) => [...prev, { 
          sender: 'bot', 
          text: "I'd love to connect you with an expert who can help with that! Create a free account to start your 30-day trial. 🎓" 
        }]);
        setShowSignupPrompt(true);
      } else {
        setPreviewMessages((prev) => [...prev, { 
          sender: 'bot', 
          text: "Great question! Our experts specialize in exactly this type of guidance. Send one more message, or create a free account to chat with a real expert!" 
        }]);
      }
      
      // Auto-scroll
      setTimeout(() => {
        previewBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }, 800);
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

  const isVerifiedStudent = user && !user.is_anonymous && user.email_confirmed_at && !isAdmin;

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
    ? 'Unlimited expert support included'
    : 'Five expert questions per week included';
  const availablePlanChanges = hasActiveMembership
    ? MEMBERSHIP_PLANS.filter((plan) => plan.key !== membership.plan_key)
    : [];

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
    }
  };

  const handleCancelSubscription = async () => {
    const confirmed = window.confirm('Cancel your current PayPal subscription?');
    if (!confirmed) return;

    setBillingError('');
    setBillingAction('cancel');

    try {
      const data = await apiService.cancelSubscription();
      setMembership(data.membership);
    } catch (err) {
      setBillingError(err.message || 'Unable to cancel subscription.');
    } finally {
      setBillingAction('');
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
              document.getElementById(hasActiveMembership ? 'member-home' : 'preview-chat')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl shadow-lg hover:bg-gray-50 transition-all duration-300"
          >
            {hasActiveMembership ? 'Go to membership' : 'Get started'}
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
            {hasActiveMembership ? (
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
                </div>

                {showPlanManagement && (
                  <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <h3 className="text-base font-bold text-gray-900">Change plan</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">
                      Choose a different monthly or yearly plan. PayPal may ask you to approve the change.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {availablePlanChanges.map((plan) => (
                        <button
                          key={plan.key}
                          type="button"
                          onClick={() => handlePlanChange(plan.key)}
                          disabled={!!billingAction}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {billingAction === plan.key ? 'Updating...' : `Switch to ${plan.price}`}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelSubscription}
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
                {/* Major Time Savings */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Major Time Savings</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Access to a top ranked academic search engine, direct links to research sources, student focused news articles, online courses, career growth coaching, and learning or career expert support.
                  </p>
                </div>

                {/* Learning Career Expert Service Examples */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Learning Career Expert Service Examples</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Research guidance, time management, study success, picking a major, tough teacher tips, job search support, tutoring options, work/life balance, and presentation guidance.
                  </p>
                </div>

                {/* No long waits */}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">No long waits</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Quick response when you need answers on learning and career growth topics.
                  </p>
                </div>

                {/* Start with 30-day free trial */}
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-base">
                      <BookOpen size={17} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {isVerifiedStudent ? 'Choose a membership' : 'Start with 30-day free trial'}
                    </h3>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">
                    {isVerifiedStudent
                      ? 'Select a monthly or yearly plan to continue with Knobull expert support.'
                      : 'Ask a Knobull expert two questions a week during the trial period.'}
                  </p>

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

      {/* ===================== GUEST PREVIEW CHAT ===================== */}
      {!hasActiveMembership && (
        <section id="preview-chat" className="w-full bg-gray-50 py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2 tracking-tight">
            {isVerifiedStudent ? 'Preview Expert Chat' : 'Try It Out'}
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            {isVerifiedStudent
              ? 'Send a sample question before choosing your membership.'
              : 'Send a message to see how Knobull expert chat works - no account needed.'}
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
                  <p className="text-[10px] text-blue-100 uppercase tracking-wider font-semibold">Preview Mode</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
              {previewMessages.map((m, i) => (
                <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm shadow-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ))}
              <div ref={previewBottomRef} />
            </div>

            {/* Input or Signup Prompt */}
            {showSignupPrompt ? (
              <div className="p-5 bg-white border-t border-gray-100 text-center">
                <p className="text-slate-600 text-sm mb-3 font-medium">
                  Create a free account to chat with real experts
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-2.5 rounded-xl transition-all text-sm shadow-md shadow-blue-600/20 active:scale-[0.98]"
                >
                  Sign Up Free — 30 Day Trial
                </button>
              </div>
            ) : (
              <form onSubmit={handlePreviewSend} className="p-4 bg-white border-t border-gray-100 flex gap-3">
                <input 
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm"
                  placeholder="Try asking a question..."
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-all active:scale-95">
                  <Send size={16} />
                </button>
              </form>
            )}
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
                  Open a secure session with an academic, career search, research, +more Expert. Start one month free now.
                </p>
                <p className="text-blue-200/70 text-xs mt-3 font-medium">
                  Free account required • 30-day trial
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
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import LoginForm from '../components/LoginForm';

/**
 * LandingPage Component
 * 
 * The default route when the application loads.
 * Features a navbar with branding, a blue gradient hero with expert chat info,
 * membership perks, and dual-portal cards for Students and Advisors.
 * 
 * @param {Function} props.onStartStudent - Triggers anonymous login and creates a session
 * @param {Function} props.onStartExpert - Receives a valid Supabase user object after login
 */
export default function LandingPage({ onStartStudent, onStartExpert }) {
  // Toggles the visibility of the Expert Login Modal
  const [showLoginForm, setShowLoginForm] = useState(false);

  // hCaptcha state: shows the challenge after clicking "Student Access"
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const captchaRef = useRef(null);

  /**
   * Called when the student solves the CAPTCHA challenge.
   * Automatically proceeds with the anonymous sign-in flow.
   */
  const handleCaptchaVerify = async (token) => {
    setIsStarting(true);
    try {
      await onStartStudent(token);
    } catch (err) {
      captchaRef.current?.resetCaptcha();
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans">

      {/* ===================== TOP NAVBAR (logo only) ===================== */}
      <nav className="w-full bg-white border-b border-gray-200 px-6 py-3 flex items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img 
            src="/icons/knobull.jpg" 
            alt="Knobull Logo" 
            className="w-9 h-9 rounded-full object-cover shadow-sm border border-gray-100"
          />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Knobull</span>
        </div>
      </nav>

      {/* ===================== HERO SECTION (light blue gradient) ===================== */}
      <section className="w-full bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 text-white py-14 md:py-20 relative overflow-hidden">
        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          {/* Main Heading */}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight drop-shadow-sm">
            Chat with Experts
          </h1>

          {/* Mascot Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 p-1.5 shadow-xl shadow-black/10">
              <img 
                src="/icons/knobull.jpg" 
                alt="Knobull Mascot" 
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          {/* Sub-copy */}
          <p className="text-lg md:text-xl text-white/90 max-w-xl mx-auto leading-relaxed mb-3">
            We're here to help.
          </p>
          <p className="text-base md:text-lg text-white/75 max-w-md mx-auto leading-relaxed mb-8">
            Reach out and we'll get back quickly.
          </p>

          <button
            onClick={() => {
              document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl shadow-lg hover:bg-gray-50 transition-all duration-300"
          >
            Get started
          </button>
        </div>
      </section>

      {/* ===================== MEMBERSHIP PERKS (visible early) ===================== */}
      <section className="w-full bg-gray-50 py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8 tracking-tight">
            Knobull Membership
          </h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-900/5 p-6 md:p-8">
            {/* Free Trial Highlight */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-base">
                  🎉
                </div>
                <h3 className="text-lg font-bold text-gray-900">Start Free</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Users get <span className="font-semibold text-gray-900">1 month free</span> without membership. No billing info required to get started.
              </p>
            </div>

            {/* After Free Period */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 mb-3">After your free month</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Access stops after the free period. Choose a paid plan for continued access:
              </p>

              {/* Plan Tiers */}
              <div className="grid gap-2.5">
                <div className="flex items-start gap-3 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 text-xs font-bold mt-0.5 shrink-0">M</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Monthly</p>
                    <p className="text-gray-500 text-xs">Month-to-month access, renewal required each month.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 text-xs font-bold mt-0.5 shrink-0">Y</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Yearly</p>
                    <p className="text-gray-500 text-xs">One-year payment for continued access.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3.5 bg-amber-50/60 rounded-xl border border-amber-100">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 text-xs font-bold mt-0.5 shrink-0">∞</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Unlimited</p>
                    <p className="text-gray-500 text-xs">One-time purchase, no further renewal required!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* What You Get */}
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-2">What You Get</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Access to academic search, direct links to research sources, student-focused news, online courses, career growth coaching, and direct expert chat for learning and career questions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ACCESS PORTALS (Student + Advisor cards) ===================== */}
      <section id="get-started" className="w-full bg-white py-12 md:py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 text-center mb-8 tracking-tight">
            Get Started
          </h2>

          {!showLoginForm ? (
            <div>
              <div className="grid md:grid-cols-2 gap-5">
                {/* Student Access Card */}
                <button 
                  onClick={() => setShowCaptcha(true)} 
                  disabled={isStarting}
                  className="flex flex-col p-7 bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 rounded-2xl shadow-lg shadow-blue-900/10 hover:-translate-y-1 hover:shadow-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 text-left group disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <div className="w-12 h-12 bg-blue-500/30 rounded-xl text-white flex items-center justify-center mb-5">
                    <BookOpen size={26} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {isStarting ? 'Connecting...' : 'Chat With An Expert'}
                  </h3>
                  <p className="text-blue-100 text-sm leading-relaxed">
                    Open a secure session with an academic, career search, research, +more Expert. Start one month free now.
                  </p>
                  <p className="text-blue-200/70 text-xs mt-3 font-medium">
                    Member sign in available after verification
                  </p>
                </button>

                {/* Advisor Gateway Card */}
                <button 
                  onClick={() => setShowLoginForm(true)} 
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

              {/* hCaptcha Challenge — appears below the cards after clicking Student Access */}
              {showCaptcha && !isStarting && (
                <div className="mt-6 flex flex-col items-center gap-3 animate-fade-in">
                  <p className="text-gray-600 text-sm font-medium">Please verify you're human to continue</p>
                  <HCaptcha
                    ref={captchaRef}
                    sitekey={import.meta.env.VITE_HCAPTCHA_SITEKEY}
                    onVerify={handleCaptchaVerify}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <LoginForm 
                onClose={() => setShowLoginForm(false)} 
                onSuccess={onStartExpert} 
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

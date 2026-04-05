import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, ShieldCheck, Send, Library } from 'lucide-react';
import LoginForm from '../components/LoginForm';

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
            <button 
              onClick={() => navigate(isAdmin ? '/dashboard' : '/chat')}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 px-4 py-2 border border-blue-200 hover:bg-blue-50 rounded-xl transition-all"
            >
              {isAdmin ? 'Dashboard' : 'My Chat'} →
            </button>
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
              document.getElementById('preview-chat')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-8 py-3 bg-white text-blue-600 font-bold rounded-xl shadow-lg hover:bg-gray-50 transition-all duration-300"
          >
            Get started
          </button>
        </div>
      </section>

      {/* ===================== MEMBERSHIP PERKS ===================== */}
      <section className="w-full bg-white py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8 tracking-tight">
            Knobull Membership
          </h2>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg shadow-gray-900/5 p-6 md:p-8 space-y-6">
            
            {/* Major Time Savings */}
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Major Time Savings</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Access to a top ranked academic search engine, direct links to research sources, student focused news articles, online courses, career growth coaching, ask learning/career experts questions via chat icon on landing page!
              </p>
            </div>

            {/* Learning Career Expert Service Examples */}
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Learning Career Expert Service Examples</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Research guidance, time management, study success, pick major, tough teacher tips, job search success, find a tutor, work/life balance, presentation guidance, most other critical learning/career development support.
              </p>
            </div>

            {/* No long waits */}
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No long waits</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Quick response when you need answers on learning/career growth related topics 24/7.
              </p>
            </div>

            {/* Learning and Career Experts */}
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Learning and Career Experts</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Chat with experts that have pragmatic knowledge and experience—anytime, anywhere.
              </p>
            </div>
            
            {/* Start with 30-day free trial */}
            <div className="pt-6 border-t border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 text-base">
                  🎉
                </div>
                <h3 className="text-lg font-bold text-gray-900">Start with 30-day free trial</h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Ask a Knobull expert (initially all questions come to President)! Two questions a week during the trial period. 
              </p>
              
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100">
                  <p className="font-bold text-gray-900 text-sm mb-1">Standard Package</p>
                  <p className="text-gray-600 text-xs mb-2">Five questions per week via Venmo.</p>
                  <p className="font-semibold text-blue-700 text-sm">$30 / month <span className="text-gray-400 font-normal">or</span> $300 / year</p>
                </div>
                <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <p className="font-bold text-gray-900 text-sm mb-1">Unlimited Package</p>
                  <p className="text-gray-600 text-xs mb-2">Unlimited support package.</p>
                  <p className="font-semibold text-indigo-700 text-sm">$90 / month <span className="text-gray-400 font-normal">or</span> $900 / year</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ===================== GUEST PREVIEW CHAT ===================== */}
      <section id="preview-chat" className="w-full bg-gray-50 py-10 md:py-14 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2 tracking-tight">
            Try It Out
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            Send a message to see how Knobull expert chat works — no account needed.
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

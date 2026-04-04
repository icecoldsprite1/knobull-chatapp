import React, { useState, useRef } from 'react';
import { BookOpen, ShieldCheck, Library } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import LoginForm from '../components/LoginForm';

/**
 * LandingPage Component
 * 
 * The default route when the application loads.
 * Acts as a dual-portal gateway, offering paths for both Students and Advisors.
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
      // If session creation fails, reset the CAPTCHA so they can try again
      captchaRef.current?.resetCaptcha();
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 p-6 font-sans">

      {/* Branding Header */}
      <div className="text-center mb-12 relative z-10">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-blue-700 rounded-xl flex items-center justify-center shadow-md shadow-blue-900/10">
            <Library className="text-white" size={28} />
          </div>
          <h1 className="text-5xl font-serif font-bold text-slate-900 tracking-tight">
            Knobull
          </h1>
        </div>
        <div className="w-20 h-1.5 bg-blue-600 mx-auto mb-5 rounded-full"></div>
        <p className="text-slate-700 text-lg max-w-md mx-auto leading-relaxed">
          The Academic Resource Center. Connect directly with an advisor for career and research guidance.
        </p>
      </div>

      {/* Access Portals */}
      {!showLoginForm ? (
        <div className="w-full max-w-2xl relative z-10">
          <div className="grid md:grid-cols-2 gap-6">
            {/* 
              Student Interface Button 
              Shows the CAPTCHA challenge before proceeding 
            */}
            <button 
              onClick={() => setShowCaptcha(true)} 
              disabled={isStarting}
              className="flex flex-col p-8 bg-blue-600 border border-blue-500 rounded-2xl shadow-lg shadow-blue-900/10 hover:-translate-y-1 hover:shadow-xl hover:bg-blue-700 transition-all duration-300 text-left group disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <div className="w-14 h-14 bg-blue-500/30 rounded-xl text-white flex items-center justify-center mb-6">
                <BookOpen size={28} />
              </div>
              <h2 className="text-2xl font-serif font-semibold text-white mb-2">
                {isStarting ? 'Connecting...' : 'Student Access'}
              </h2>
              <p className="text-blue-100 text-sm leading-relaxed">
                Open a secure chat session with an academic advisor. No registration required.
              </p>
            </button>

            {/* 
              Expert Interface Button 
              Switches the UI view to show the LoginForm component 
            */}
            <button 
              onClick={() => setShowLoginForm(true)} 
              className="flex flex-col p-8 bg-slate-800 border border-slate-700 rounded-2xl shadow-lg shadow-slate-900/10 hover:-translate-y-1 hover:shadow-xl hover:bg-slate-900 transition-all duration-300 text-left group"
            >
              <div className="w-14 h-14 bg-slate-700/50 rounded-xl text-white flex items-center justify-center mb-6">
                <ShieldCheck size={28} />
              </div>
              <h2 className="text-2xl font-serif font-semibold text-white mb-2">Advisor Gateway</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Secure staff login to access the student request queue and dashboard.
              </p>
            </button>
          </div>

          {/* hCaptcha Challenge — appears below the cards after clicking Student Access */}
          {showCaptcha && !isStarting && (
            <div className="mt-6 flex flex-col items-center gap-3 animate-fade-in">
              <p className="text-slate-600 text-sm font-medium">Please verify you're human to continue</p>
              <HCaptcha
                ref={captchaRef}
                sitekey={import.meta.env.VITE_HCAPTCHA_SITEKEY}
                onVerify={handleCaptchaVerify}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="relative z-10 w-full flex justify-center">
          {/* 
            Pass down `onStartExpert` so the LoginForm can tell 
            App.jsx when authentication is successfully finished. 
          */}
          <LoginForm 
            onClose={() => setShowLoginForm(false)} 
            onSuccess={onStartExpert} 
          />
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-8 left-0 w-full text-center z-10">
        <p className="text-slate-500 text-sm font-medium">
          © {new Date().getFullYear()} Knobull Academic Resources
        </p>
      </div>
    </div>
  );
}

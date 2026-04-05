import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase } from '../config/supabase';

/**
 * StudentAuthPage
 * 
 * Full-page login/signup form for students.
 * Supports toggling between "Sign In" and "Create Account" modes.
 * After signup, shows a "Check your email" message.
 * After login, redirects to /chat.
 */
export default function StudentAuthPage() {
  const navigate = useNavigate();
  
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'check-email'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // hCaptcha
  const [captchaToken, setCaptchaToken] = useState(null);
  const captchaRef = useRef(null);

  const resetForm = () => {
    setError(null);
    setCaptchaToken(null);
    captchaRef.current?.resetCaptcha();
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setCaptchaToken(null);
    captchaRef.current?.resetCaptcha();
  };

  /**
   * Handle Sign Up — creates a new Supabase user with email verification
   */
  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (!captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        captchaToken,
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      resetForm();
      return;
    }

    // Successfully registered — show "check your email" state
    setIsLoading(false);
    setMode('check-email');
  };

  /**
   * Handle Login — authenticates with email/password
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      resetForm();
      return;
    }

    // Check if email is confirmed
    if (data.user && !data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      setError('Please verify your email before signing in. Check your inbox.');
      setIsLoading(false);
      resetForm();
      return;
    }

    setPassword('');
    setIsLoading(false);
    navigate('/chat', { replace: true });
  };

  // ============================================
  // CHECK EMAIL SUCCESS STATE
  // ============================================
  if (mode === 'check-email') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white font-sans px-4">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/5 text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5 border border-emerald-200">
            <CheckCircle className="text-emerald-600" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Check Your Email</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            We sent a verification link to <span className="font-semibold text-slate-700">{email}</span>. 
            Click the link in your inbox to activate your account.
          </p>
          <p className="text-slate-400 text-xs mb-6">
            Don't see it? Check your spam folder.
          </p>
          <button 
            onClick={() => switchMode('login')}
            className="text-blue-600 hover:text-blue-700 text-sm font-semibold underline underline-offset-2"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // LOGIN / SIGNUP FORM
  // ============================================
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white font-sans px-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/5 relative">

        {/* Back to Home */}
        <Link 
          to="/" 
          className="absolute top-4 left-4 flex items-center gap-1 text-slate-400 hover:text-blue-600 transition text-sm"
        >
          <ArrowLeft size={16} /> Home
        </Link>

        {/* Header */}
        <div className="mb-6 mt-4">
          <h2 className="text-2xl font-bold text-slate-900">
            {mode === 'login' ? 'Student Sign In' : 'Create Account'}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' 
              ? 'Sign in to chat with a Knobull expert' 
              : 'Create your free account to get started'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleSignUp} className="space-y-4">
          
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-400" size={16} />
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                placeholder="you@email.com"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-400" size={16} />
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Confirm Password (signup only) */}
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={16} />
                <input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {/* CAPTCHA */}
          <div className="flex justify-center my-2">
            <HCaptcha
              ref={captchaRef}
              sitekey={import.meta.env.VITE_HCAPTCHA_SITEKEY}
              onVerify={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
            />
          </div>

          {/* Submit */}
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 text-white font-medium py-3 rounded-xl transition-all text-sm disabled:opacity-50 mt-2 active:scale-[0.98]"
          >
            {isLoading 
              ? (mode === 'login' ? 'Signing in...' : 'Creating account...') 
              : (mode === 'login' ? 'Sign In' : 'Create Account')
            }
          </button>
        </form>

        {/* Toggle between login/signup */}
        <p className="text-center text-slate-500 text-sm mt-6">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => switchMode('signup')} className="text-blue-600 font-semibold hover:underline underline-offset-2">
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => switchMode('login')} className="text-blue-600 font-semibold hover:underline underline-offset-2">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

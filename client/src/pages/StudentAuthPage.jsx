import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase } from '../config/supabase';

const HCAPTCHA_SITEKEY = import.meta.env.VITE_HCAPTCHA_SITEKEY;

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

  // Resend verification email (shown on the check-email screen)
  const [isResending, setIsResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCaptcha, setResendCaptcha] = useState(null);
  const resendCaptchaRef = useRef(null);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const resetCaptcha = () => {
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
    setResendMsg('');
    setResendCaptcha(null);
  };

  /**
   * Handle Sign Up — creates a new Supabase user with email verification
   */
  const handleSignUp = async (e) => {
    e.preventDefault();

    if (isLoading) return;
    
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

    try {
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
        resetCaptcha();
        return;
      }

      // Successfully registered — show "check your email" state
      setMode('check-email');
    } catch (err) {
      console.error('Signup failed:', err);
      setError('Unable to create account. Please try again.');
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle Login — authenticates with email/password
   */
  const handleLogin = async (e) => {
    e.preventDefault();

    if (isLoading) return;

    if (!captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken }
      });

      if (authError) {
        setError(authError.message);
        resetCaptcha();
        return;
      }

      // Check if email is confirmed
      if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setError('Please verify your email before signing in. Check your inbox.');
        resetCaptcha();
        return;
      }

      setPassword('');
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('Login failed:', err);
      setError('Unable to sign in. Please try again.');
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resend the signup verification email. Requires a fresh captcha token since
   * the project enforces hCaptcha on auth endpoints, and is rate-limited with a
   * cooldown to respect the mailer's send limits.
   */
  const handleResend = async () => {
    if (isResending || resendCooldown > 0) return;

    if (HCAPTCHA_SITEKEY && !resendCaptcha) {
      setResendMsg('Please complete the security check first.');
      return;
    }

    setIsResending(true);
    setResendMsg('');

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          captchaToken: resendCaptcha || undefined,
        },
      });

      if (resendError) {
        setResendMsg(resendError.message);
      } else {
        setResendMsg('Sent! Check your inbox and spam folder — delivery can take a couple of minutes.');
        setResendCooldown(60);
      }
    } catch {
      setResendMsg('Could not resend right now. Please try again shortly.');
    } finally {
      setIsResending(false);
      setResendCaptcha(null);
      resendCaptchaRef.current?.resetCaptcha();
    }
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
          <p className="text-slate-400 text-xs mb-5">
            Don't see it? Check your spam folder, or resend below.
          </p>

          {HCAPTCHA_SITEKEY && (
            <div className="flex justify-center mb-3">
              <HCaptcha
                ref={resendCaptchaRef}
                sitekey={HCAPTCHA_SITEKEY}
                onVerify={(token) => setResendCaptcha(token)}
                onExpire={() => setResendCaptcha(null)}
                onError={() => setResendCaptcha(null)}
              />
            </div>
          )}

          {resendMsg && (
            <p className="text-slate-500 text-xs mb-3">{resendMsg}</p>
          )}

          <button
            onClick={handleResend}
            disabled={isResending || resendCooldown > 0 || (!!HCAPTCHA_SITEKEY && !resendCaptcha)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all text-sm disabled:opacity-50 mb-4"
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : isResending
              ? 'Sending...'
              : 'Resend verification email'}
          </button>

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
          {HCAPTCHA_SITEKEY ? (
            <div className="flex justify-center my-2">
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITEKEY}
                onVerify={(token) => {
                  setCaptchaToken(token);
                  setError(null);
                }}
                onExpire={() => setCaptchaToken(null)}
                onError={() => {
                  setCaptchaToken(null);
                  setError('Security check failed to load. Please refresh and try again.');
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Missing hCaptcha site key. Add VITE_HCAPTCHA_SITEKEY to client/.env.
            </div>
          )}

          {/* Submit */}
          <button 
            type="submit" 
            disabled={isLoading || !HCAPTCHA_SITEKEY}
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

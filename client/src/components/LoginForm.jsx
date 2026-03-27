import React, { useState } from 'react';
import { BookOpen, ShieldCheck, Mail, Lock, X } from 'lucide-react';
import { supabase } from '../config/supabase';

/**
 * LoginForm Component
 * 
 * Renders the modal used by Academic Advisors to log into the dashboard securely.
 * Handles direct email/password authentication with Supabase Auth.
 * 
 * @param {Function} props.onClose - Hides this form and returns to the LandingPage
 * @param {Function} props.onSuccess - Fires after a successful login, passing the user object up to App.jsx
 */
export default function LoginForm({ onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Submits credentials to the Supabase Auth server.
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // 1. Authenticate with Supabase
    // This automatically saves a secure JWT into LocalStorage on success.
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      setError(authError.message); // e.g., "Invalid login credentials"
      setIsLoading(false);
      return;
    }

    // 2. Clear sensitive state and trigger the App router switch
    setPassword('');
    setIsLoading(false);
    onSuccess(data.user);
  };

  return (
    <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/5 relative">
      {/* Close Button */}
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-blue-600 transition">
        <X size={20} />
      </button>
      
      {/* Visual Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-slate-900">Advisor Gateway</h2>
        <p className="text-slate-500 text-sm mt-1">Secure login for Knobull staff</p>
      </div>

      {/* Error Message Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Login Form Inputs */}
      <form onSubmit={handleLogin} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Institutional Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-slate-400" size={16} />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
              placeholder="name@knobull.com"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 tracking-wide uppercase">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-slate-400" size={16} />
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 text-white font-medium py-3 rounded-xl transition-all text-sm disabled:opacity-50 mt-2 active:scale-[0.98]"
        >
          {isLoading ? 'Authenticating...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

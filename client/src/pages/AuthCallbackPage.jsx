import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { CheckCircle, XCircle } from 'lucide-react';

/**
 * AuthCallbackPage
 * 
 * Handles the redirect after a user clicks the email verification link.
 * Supabase appends auth tokens to the URL hash — the Supabase client 
 * automatically picks them up on page load via `onAuthStateChange`.
 * 
 * Flow: Email link → this page → auto-verify → redirect to /chat
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase automatically processes the token from the URL hash
        // when the client initializes. We just need to check if a session exists.
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          setErrorMsg(error.message);
          setStatus('error');
          return;
        }

        if (session) {
          setStatus('success');
          // Brief pause so user sees the success message
          setTimeout(() => navigate('/chat', { replace: true }), 1500);
        } else {
          setErrorMsg('Verification link may have expired. Please try signing up again.');
          setStatus('error');
        }
      } catch (err) {
        setErrorMsg('An unexpected error occurred.');
        setStatus('error');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white font-sans px-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl border border-blue-100 shadow-xl shadow-blue-900/5 text-center">
        
        {status === 'verifying' && (
          <>
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verifying your email...</h2>
            <p className="text-slate-500 text-sm">Please wait while we confirm your account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
              <CheckCircle className="text-emerald-600" size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Email Verified!</h2>
            <p className="text-slate-500 text-sm">Redirecting you to chat...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
              <XCircle className="text-red-600" size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Failed</h2>
            <p className="text-red-600 text-sm mb-4">{errorMsg}</p>
            <button 
              onClick={() => navigate('/login', { replace: true })}
              className="text-blue-600 hover:text-blue-700 text-sm font-semibold underline underline-offset-2"
            >
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}

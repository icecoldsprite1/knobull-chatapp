import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './config/supabase';

// Pages
import LandingPage from './pages/LandingPage';
import StudentAuthPage from './pages/StudentAuthPage';
import StudentChatPage from './pages/StudentChatPage';
import ExpertDashboardPage from './pages/ExpertDashboardPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import SubscriptionConfirmationPage from './pages/SubscriptionConfirmationPage';

const withTimeout = (promise, message, timeoutMs = 10000) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

/**
 * App Component - The Core Router & Auth Manager
 * 
 * Responsibilities:
 * 1. Global auth state management (who is logged in?)
 * 2. Route definitions with protection
 * 3. Session persistence across page refreshes
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  const checkAdminStatus = async (userId) => {
    const { data, error } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Admin status check failed:', error);
      return false;
    }

    return !!data;
  };

  // ==========================================
  // SESSION PERSISTENCE & AUTH STATE LISTENER
  // ==========================================
  useEffect(() => {
    let isCancelled = false;

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          'Timed out while restoring your login session.'
        );

        if (isCancelled) return;

        if (error) {
          console.error('Session restore failed:', error);
          return;
        }
        
        if (session?.user) {
          setUser(session.user);
          
          // Check admin status
          if (!session.user.is_anonymous) {
            setIsAdmin(await checkAdminStatus(session.user.id));
          }
        }
      } catch (err) {
        console.error('Session restore failed:', err);
      } finally {
        if (!isCancelled) {
          setAuthLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          
          // Re-check admin status on new sign-in
          if (!session.user.is_anonymous) {
            setTimeout(async () => {
              setIsAdmin(await checkAdminStatus(session.user.id));
            }, 0);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAdmin(false);
        }
      }
    );

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // ==========================================
  // LOGOUT HANDLER
  // ==========================================
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAdmin(false);
    navigate('/', { replace: true });
  };

  // ==========================================
  // ROUTE GUARDS
  // ==========================================
  
  /**
   * ProtectedStudentRoute - Requires a verified, non-anonymous email user
   */
  const ProtectedStudentRoute = ({ children }) => {
    if (authLoading) return <LoadingSpinner />;
    
    // Must be logged in with a verified email
    if (!user || user.is_anonymous) {
      return <Navigate to="/login" replace />;
    }
    
    // Must have verified email
    if (!user.email_confirmed_at) {
      return <Navigate to="/login" replace />;
    }

    return children;
  };

  /**
   * ProtectedAdminRoute - Requires admin table membership
   */
  const ProtectedAdminRoute = ({ children }) => {
    if (authLoading) return <LoadingSpinner />;
    
    if (!user || !isAdmin) {
      return <Navigate to="/" replace />;
    }

    return children;
  };

  // ==========================================
  // LOADING STATE
  // ==========================================
  if (authLoading) return <LoadingSpinner />;

  // ==========================================
  // ROUTE DEFINITIONS
  // ==========================================
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage user={user} isAdmin={isAdmin} />} />
      <Route path="/login" element={
        user && user.email_confirmed_at && !user.is_anonymous
          ? <Navigate to="/chat" replace />
          : <StudentAuthPage />
      } />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/subscription/confirmed" element={
        <ProtectedStudentRoute>
          <SubscriptionConfirmationPage />
        </ProtectedStudentRoute>
      } />
      
      {/* Protected Student Route */}
      <Route path="/chat" element={
        <ProtectedStudentRoute>
          <StudentChatPage user={user} onLogout={handleLogout} />
        </ProtectedStudentRoute>
      } />

      {/* Protected Admin Route */}
      <Route path="/dashboard" element={
        <ProtectedAdminRoute>
          <ExpertDashboardPage user={user} onLogout={handleLogout} />
        </ProtectedAdminRoute>
      } />

      {/* Catch-all: redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Simple full-page loading spinner
 */
function LoadingSpinner() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

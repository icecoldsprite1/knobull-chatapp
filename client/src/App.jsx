import React, { useState, useEffect } from 'react';
import { supabase } from './config/supabase';
import { apiService } from './services/api.service';

// Pages
import LandingPage from './pages/LandingPage';
import StudentChatPage from './pages/StudentChatPage';
import ExpertDashboardPage from './pages/ExpertDashboardPage';

/**
 * App Component - The Core Router & State Manager
 * 
 * This component acts as the central brain of the frontend. It is responsible for:
 * 1. Persistent Authentication (Remembering who you are when you refresh the page)
 * 2. View Routing (Deciding whether to show the Landing, Student, or Expert page)
 */
export default function App() {
  // Global State
  const [user, setUser] = useState(null); // Holds the Supabase Auth User object
  const [view, setView] = useState('loading'); // Controls the visible "Page"
  const [session, setSession] = useState(null); // The active database Chat Session object

  // ==========================================
  // SESSION PERSISTENCE (AUTO-LOGIN)
  // ==========================================
  // Runs once when the browser tab is first opened or refreshed.
  useEffect(() => {
    const restoreSession = async () => {
      // 1. Ask Supabase if we have a valid JWT saved in local storage
      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      if (authSession?.user) {
        // We found a logged-in user! 
        setUser(authSession.user);
        
        // 2. Classify the user
        // Advisors log in with an email/password. Students log in anonymously.
        if (authSession.user.is_anonymous) {
          
          // 3. If Student: Try to fetch their last active chat box
          const { data: existingSession } = await supabase
            .from('sessions')
            .select('*')
            .eq('student_id', authSession.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (existingSession) {
             // Successfully restored student's old chat
            setSession(existingSession);
            setView('student');
          } else {
            // An anonymous user with no active chat. Show them the home page.
            setView('landing');
          }
        } else {
          // 4. If Expert: We know they are staff, send them directly to Dashboard
          setView('expert');
        }
      } else {
        // Nobody is logged in. Show the home page.
        setView('landing');
      }
    };

    restoreSession();
  }, []);

  // ==========================================
  // AUTHENTICATION FLOWS
  // ==========================================

  /**
   * Fired when a student clicks "Student Access" on the Landing Page.
   */
  const startStudent = async (captchaToken) => {
    // 1. Secretly log them into Supabase via a temporary anonymous account
    //    The captchaToken from hCaptcha is required — Supabase will reject without it.
    const { data, error: authError } = await supabase.auth.signInAnonymously({
      options: { captchaToken }
    });

    if (authError) {
      throw new Error(authError.message);
    }
    setUser(data.user);
    
    // 2. Ping our Node.js backend to officially register the Chat Session in the DB
    try {
      const resData = await apiService.createSession();
      setSession(resData.session);
      
      // 3. Switch the UI to the Chat Screen
      setView('student');
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  /**
   * Fired when an Advisor successfully logs in via the LoginForm modal.
   */
  const startExpert = (expertUser) => {
    setUser(expertUser);
    setView('expert');
  };

  /**
   * Fired when either an Advisor or Student clicks "Sign Out / End Chat".
   */
  const handleLogout = async () => {
    // Tell Supabase to invalidate the token on the server and clear LocalStorage
    await supabase.auth.signOut();
    
    // Reset all local UI state
    setUser(null);
    setSession(null);
    setView('landing');
  };

  // ==========================================
  // VIEW ROUTER (RENDER LOGIC)
  // ==========================================

  // Prevent UI flashing by showing a spinner while we check LocalStorage (useEffect)
  if (view === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Home Page
  if (view === 'landing') {
    return <LandingPage onStartStudent={startStudent} onStartExpert={startExpert} />;
  }

  // Staff Portal
  if (view === 'expert') {
    return <ExpertDashboardPage user={user} onLogout={handleLogout} />;
  }

  // Student Chat Box
  if (view === 'student') {
    return <StudentChatPage user={user} session={session} onLogout={handleLogout} />;
  }

  // Fallback (Should never be reached)
  return null;
}

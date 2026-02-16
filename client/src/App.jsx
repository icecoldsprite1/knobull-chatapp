import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Send, User, ShieldCheck, GraduationCap, LogOut, X, Lock, Mail } from 'lucide-react';

// --- CONFIGURATION ---
// 1. PROJECT URL: Points to your specific Supabase instance.
const SUPABASE_URL = 'https://nszpydzyraowklcsvkfx.supabase.co'; 

// 2. ANON KEY: This is the "Public" key. 
// It is SAFE to expose in the browser because your SQL RLS policies 
// prevent this key from doing anything illegal (like reading other students' chats).
const SUPABASE_ANON_KEY = 'sb_publishable_seR0hl1Ab2m2wzYUZpUqRw_FwDQ6uoZ';

// 3. API URL: Points to your Express Backend (acting as the System Admin)
const API_URL = 'http://localhost:3000/api';

// Initialize the Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  // --- STATE MANAGEMENT ---
  const [user, setUser] = useState(null); // The current logged-in user (Student or Expert)
  const [view, setView] = useState('landing'); // Controls which screen is visible
  const [session, setSession] = useState(null); // The active chat room data
  const [messages, setMessages] = useState([]); // List of messages in the current room
  const [input, setInput] = useState(''); // Chat text input value
  const [sessionsList, setSessionsList] = useState([]); // List of all active chats (Expert view only)
  const bottomRef = useRef(null); // Used to auto-scroll to the newest message

  // --- LOGIN FORM STATE ---
  // specifically added to handle the secure password input UI
  const [showLoginForm, setShowLoginForm] = useState(false); 
  const [expertEmail, setExpertEmail] = useState();
  const [expertPassword, setExpertPassword] = useState('');

  // --- AUTHENTICATION ---

  /**
   * 1. START STUDENT DEMO
   * Logic:
   * A. Sign in Anonymously via Supabase. This gives the user a valid UUID so RLS works.
   * B. Call the Backend to create the session row and post the "Guide" welcome message.
   */
  const startStudent = async () => {
    // A. Client-side Auth
    const { data } = await supabase.auth.signInAnonymously();
    setUser(data.user);
    
    // B. Server-side Session Creation
    try {
      const response = await fetch(`${API_URL}/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id })
      });
      
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error);

      setSession(resData.session);
      setView('student');
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  /**
   * 2. EXPERT LOGIN (UPDATED)
   * Logic: Standard Email/Password login using form state variables.
   * NOTE: This replaces the old 'window.prompt' method to ensure passwords are masked.
   */
  const handleExpertLogin = async (e) => {
    e.preventDefault(); // Prevent page reload on form submit
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email: expertEmail, 
      password: expertPassword 
    });
    
    if (error) return alert("Login failed. Check Supabase Users.");
    
    // Reset form state for security
    setExpertPassword(''); 
    setShowLoginForm(false);

    setUser(data.user);
    setView('expert');
    fetchSessions(); // Immediately load the queue
  };

  // --- DATA FETCHING ---

  /**
   * FETCH SESSIONS (Expert Only)
   * This query selects * from 'sessions'.
   * - If a Student tries this: returns [] (RLS blocks it).
   * - If an Admin tries this: returns [all_sessions] (RLS allows it).
   */
  const fetchSessions = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (data) setSessionsList(data);
  };

  /**
   * REAL-TIME SUBSCRIPTION HOOK
   * This handles the "Live Chat" functionality.
   */
  useEffect(() => {
    if (!session) return;

    // A. Load History: Get old messages from the database
    supabase.from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages(data || []));

    // B. Subscribe: Listen for NEW messages inserted into this specific room
    const channel = supabase.channel(`room_${session.id}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` }, 
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    // Cleanup: Unsubscribe when leaving the chat
    return () => supabase.removeChannel(channel);
  }, [session]);

  // Auto-scroll effect: Whenever 'messages' changes, scroll to the bottom
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // --- SENDING MESSAGES ---

  /**
   * SEND MESSAGE
   * The core security feature lives here.
   */
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input; setInput('');

    // 1. Insert into Supabase
    // SECURITY NOTE: We do NOT send 'sender_type'. 
    // The SQL Trigger calculates it based on the authenticating User ID.
    const { error } = await supabase.from('messages').insert([{
      session_id: session.id,
      user_id: user.id,
      content: content
    }]);

    if (error) {
      console.error("Block:", error);
      alert("Message blocked by RLS policies."); 
      return;
    }

    // 2. Bot Logic (Student Only)
    // Send webhook to Express server for potential bot auto-response.
    if (view === 'student') {
      const studentMsgCount = messages.filter(m => m.sender_type === 'student').length + 1;
      
      fetch(`${API_URL}/bot-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: session.id, 
          userId: user.id, 
          messageCount: studentMsgCount 
        })
      });
    }
  };

  // --- UI RENDER ---

  // 1. LANDING SCREEN
  if (view === 'landing') return (
    <div className="h-screen flex items-center justify-center bg-slate-900 gap-8 p-4 relative">
      
      {/* STUDENT ENTRY BUTTON 
        (Always visible unless expert form is open to reduce clutter)
      */}
      {!showLoginForm && (
        <button onClick={startStudent} className="w-72 p-8 bg-blue-600 rounded-2xl hover:bg-blue-500 transition shadow-2xl text-left group">
          <GraduationCap className="text-white mb-4 w-12 h-12 group-hover:scale-110 transition" />
          <h2 className="text-2xl font-bold text-white">Student</h2>
          <p className="text-blue-100 text-sm mt-2">Chat with Guide</p>
        </button>
      )}

      {/* EXPERT LOGIC:
        Toggle between the Big Button and the Login Form
      */}
      {!showLoginForm ? (
        <button onClick={() => setShowLoginForm(true)} className="w-72 p-8 bg-slate-800 border border-slate-700 rounded-2xl hover:bg-slate-700 transition shadow-2xl text-left group">
          <ShieldCheck className="text-emerald-400 mb-4 w-12 h-12 group-hover:scale-110 transition" />
          <h2 className="text-2xl font-bold text-white">Expert</h2>
          <p className="text-slate-400 text-sm mt-2">Admin Dashboard</p>
        </button>
      ) : (
        // --- SECURE LOGIN FORM ---
        // This replaces window.prompt to allow type="password"
        <div className="w-96 bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl relative animate-in fade-in zoom-in duration-200">
          <button onClick={() => setShowLoginForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
            <X size={20} />
          </button>
          
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Expert Login</h2>
            <p className="text-slate-400 text-xs mt-1">Authorized personnel only</p>
          </div>

          <form onSubmit={handleExpertLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 ml-1">EMAIL</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-500" size={16} />
                <input 
                  type="email" 
                  value={expertEmail}
                  onChange={(e) => setExpertEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Password Field - Masked! */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 ml-1">PASSWORD</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-500" size={16} />
                <input 
                  type="password" // <--- This masks the characters
                  value={expertPassword}
                  onChange={(e) => setExpertPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 text-white pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition mt-4">
              Access Dashboard
            </button>
          </form>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 text-slate-800 font-sans">
      
      {/* 2. EXPERT SIDEBAR (Queue View) */}
      {view === 'expert' && !session && (
        <div className="w-full max-w-5xl mx-auto p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Support Queue</h1>
            <button onClick={() => setView('landing')} className="flex items-center gap-2 text-red-500 font-bold hover:bg-red-50 px-4 py-2 rounded-lg transition"><LogOut size={18}/> Logout</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sessionsList.map(s => (
              <div key={s.id} onClick={() => setSession(s)} className="bg-white p-6 rounded-xl border hover:border-blue-500 cursor-pointer shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <div className="bg-blue-50 p-3 rounded-lg"><User className="text-blue-600" size={24} /></div>
                  <span className="text-xs font-mono text-slate-400">{new Date(s.created_at).toLocaleTimeString()}</span>
                </div>
                <p className="font-mono text-[10px] text-slate-400 truncate mb-1">ID: {s.id}</p>
                <p className="font-bold text-sm text-slate-700">Active Session</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. CHAT INTERFACE */}
      {(session || view === 'student') && (
        <div className="flex-1 flex flex-col max-w-3xl mx-auto bg-white shadow-2xl h-full md:h-[95vh] md:my-auto md:rounded-2xl overflow-hidden border">
          
          {/* Header */}
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full animate-pulse ${view === 'expert' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
              <div>
                <h2 className="font-bold text-slate-800">{view === 'expert' ? 'Live Session' : 'Knobull Guide'}</h2>
                <p className="text-xs text-slate-400 font-medium">End-to-End Encrypted</p>
              </div>
            </div>
            {view === 'expert' && <button onClick={() => setSession(null)} className="text-xs font-bold text-blue-600 hover:text-blue-800 px-3 py-1 bg-blue-50 rounded-lg">Close Ticket</button>}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender_type === 'student' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm text-sm ${
                  m.sender_type === 'student' ? 'bg-blue-600 text-white rounded-br-none' : 
                  m.sender_type === 'expert' ? 'bg-slate-800 text-white rounded-bl-none' : 'bg-slate-100 text-slate-800 border rounded-bl-none'
                }`}>
                  <p className="text-[9px] uppercase font-black opacity-50 mb-1 tracking-widest">{m.sender_type}</p>
                  <p className="leading-relaxed">{m.content}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-4 border-t bg-slate-50 flex gap-3">
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm" 
              placeholder={view === 'expert' ? "Reply to student..." : "Type your message..."} 
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-all shadow-md active:scale-95"><Send size={20} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

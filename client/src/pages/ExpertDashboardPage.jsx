import React, { useState, useEffect, useRef } from 'react';
import { Send, User, LogOut, Bell } from 'lucide-react';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';
import { requestNotificationPermission, onForegroundMessage } from '../config/firebase';
import ChatBubble from '../components/ChatBubble';

/**
 * ExpertDashboardPage Component
 * 
 * The secure staff portal for Academic Advisors. 
 * Features a real-time queue of incoming student chats and a chat interface.
 * 
 * @param {Object} props.user - The verified Supabase staff user object
 * @param {Function} props.onLogout - Allows the expert to log out securely
 */
export default function ExpertDashboardPage({ user, onLogout }) {
  // --- STATE DEFINITIONS ---
  const [sessionsList, setSessionsList] = useState([]); // List of all active/historical rooms
  const [activeSession, setActiveSession] = useState(null); // The room currently open in the Chat View
  const [messages, setMessages] = useState([]); // Messages for the active session
  const [input, setInput] = useState(''); // Text input
  const [notificationsEnabled, setNotificationsEnabled] = useState(false); // UI toggle state for push alerts
  const bottomRef = useRef(null);

  // ==========================================
  // INITIAL LOAD & GLOBAL DASHBOARD SUBSCRIPTIONS
  // ==========================================
  useEffect(() => {
    // 1. Fetch initial queue list on load
    fetchSessions();

    // 2. Subscribe to Global Queue Changes (Realtime)
    // Listens to ANY change on the `sessions` table (new student, expert claiming).
    // This allows the dashboard list to auto-update without hitting refresh.
    const channelName = `sessions_queue_${Date.now()}`;
    const sessionsChannel = supabase.channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => fetchSessions() // Reload the queue data
      )
      .subscribe();

    // 3. Setup Firebase Cloud Messaging (Push Notifications)
    const setupNotifications = async () => {
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('VITE_FIREBASE_VAPID_KEY not set in .env');
        return;
      }

      // Prompt browser for permission and get a unique Firebase token
      const token = await requestNotificationPermission(vapidKey);
      if (token) {
        // Send this browser's token to our backend DB so the Node server can ping it later
        await apiService.registerDevice(token).catch(console.error);
        setNotificationsEnabled(true);
        console.log('✅ Push notifications enabled for this Advisor');
      }
    };

    setupNotifications();

    // 4. Listen for WebPush messages while the user is ACTIVELY looking at this tab.
    // We use "data-only" pushes, so the OS popup doesn't appear if they are already here.
    // Instead, we just quietly refresh the queue list.
    onForegroundMessage((payload) => {
      if (payload.data) {
        fetchSessions();
      }
    });

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  /**
   * Helper to pull the latest session list from Supabase
   */
  const fetchSessions = async () => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (data) setSessionsList(data);
  };

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  /**
   * Fired when an Expert clicks a card in the Queue
   * If the session is unassigned, it officially assigns this Expert's ID to it via API.
   */
  const handleSelectSession = async (sessionData) => {
    try {
      if (!sessionData.expert_id) {
        // Ping backend to safely claim it (handles race conditions if 2 experts click at once)
        await apiService.claimSession(sessionData.id);
        fetchSessions(); // visually update the queue immediately
      }
      
      // Open the chat UI
      setActiveSession(sessionData);
    } catch (err) {
      alert("Error opening session: " + err.message);
    }
  };

  // ==========================================
  // ACTIVE CHAT VIEW SUBSCRIPTIONS
  // ==========================================
  
  // Triggers only when the `activeSession` state changes
  useEffect(() => {
    if (!activeSession) return;

    let isCancelled = false;

    // Load message history for this specific room
    supabase.from('messages')
      .select('*')
      .eq('session_id', activeSession.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!isCancelled) setMessages(data || []);
      });

    // Subscribe ONLY to new messages inserted matching this `session.id`
    const channelName = `room_${activeSession.id}_${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${activeSession.id}` }, 
        (payload) => {
          if (!isCancelled) setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeSession]);

  // Auto-scroll the chat view explicitly as new messages arrive
  useEffect(() => { 
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  // ==========================================
  // SEND MESSAGE LOGIC (EXPERT)
  // ==========================================
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const content = input; 
    setInput('');

    // Directly insert as an expert. 
    // Supabase RLS policies check `user.id` against the `expert_id` column of the session.
    const { error } = await supabase.from('messages').insert([{
      session_id: activeSession.id,
      user_id: user.id,
      content: content
    }]);

    if (error) alert("Message blocked by Database Security Policies."); 
  };

  // ==========================================
  // RENDER UI: DASHBOARD (QUEUE)
  // ==========================================
  if (!activeSession) {
    return (
      <div className="min-h-screen bg-blue-50 p-8 font-sans">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 border-b border-blue-200 pb-6">
            <div>
              <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">Advisor Dashboard</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-blue-700 text-sm font-semibold tracking-wide uppercase">Support Queue</span>
                <span className="text-slate-300">•</span>
                <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium ${notificationsEnabled ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                  {notificationsEnabled ? '🔔 Notifications Active' : '🔕 Notifications Off'}
                </span>
              </div>
            </div>
            <button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-blue-700 text-sm font-semibold px-5 py-2.5 border border-slate-300 hover:border-blue-300 hover:bg-blue-100 rounded-xl transition-all bg-white shadow-sm hover:shadow-md">
              <LogOut size={16}/> Sign Out
            </button>
          </div>

          {/* Session Cards Grid */}
          {sessionsList.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-blue-100 shadow-md shadow-blue-900/5">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <User className="text-blue-400" size={40} />
              </div>
              <p className="text-slate-800 font-semibold text-xl">Queue is empty</p>
              <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">Incoming student requests will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {sessionsList.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => handleSelectSession(s)} 
                  className={`p-6 bg-white rounded-2xl border cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5 ${
                    s.expert_id === user.id 
                      ? 'border-blue-400 shadow-lg shadow-blue-500/10 ring-2 ring-blue-400/20' 
                      : s.expert_id 
                      ? 'border-slate-200 opacity-60' 
                      : 'border-blue-200 hover:border-blue-400'
                  }`}
                >
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl shadow-sm border ${
                        s.expert_id === user.id ? 'bg-blue-600 text-white border-blue-500' : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        <User size={20} />
                      </div>
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${s.expert_id === user.id ? 'text-blue-700' : 'text-slate-700'}`}>Student Chat</p>
                        <p className="font-mono text-[10px] text-slate-400 mt-1">ID: {s.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                      {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100">
                    <p className={`text-sm font-semibold ${
                      s.expert_id === user.id ? 'text-blue-700' : s.expert_id ? 'text-slate-500' : 'text-slate-700'
                    }`}>
                      {s.expert_id === user.id ? 'Active Session' : s.expert_id ? 'Claimed' : 'Unclaimed'}
                    </p>
                    <span className={`text-xs font-bold uppercase tracking-wider ${s.expert_id === user.id ? 'text-blue-600 group-hover:underline' : 'text-blue-500'}`}>
                      {s.expert_id === user.id ? 'Resume →' : s.expert_id ? 'View' : 'Claim →'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER UI: CHAT COMPONENT
  // ==========================================
  return (
    <div className="flex bg-blue-50 h-screen w-full font-sans">
      <div className="flex-1 flex flex-col max-w-4xl mx-auto bg-white shadow-xl shadow-blue-900/5 h-full md:h-[95vh] md:my-auto md:rounded-2xl overflow-hidden border border-blue-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700">
              <User className="text-blue-100" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="font-serif font-semibold text-white text-base tracking-wide">Advising Session</h2>
                <span className="text-[10px] font-mono text-blue-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md shadow-sm">ID: {activeSession.id.slice(0,8)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <p className="text-[10px] text-blue-100 font-semibold tracking-wider uppercase">Student Connected</p>
              </div>
            </div>
          </div>
          <button onClick={() => setActiveSession(null)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 border border-slate-700 hover:bg-slate-800 rounded-lg transition-all shadow-sm">
            ← Dashboard
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {messages.map((m, i) => <ChatBubble key={i} message={m} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 bg-white border-t border-blue-50 flex gap-3 shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)]">
          <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm" 
            placeholder="Send message to student..." 
          />
          <button type="submit" className="bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-900/20 text-white px-6 py-3 rounded-xl font-medium transition-all active:scale-95 text-sm">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}


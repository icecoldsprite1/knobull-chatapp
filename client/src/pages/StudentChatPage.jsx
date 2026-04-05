import React, { useState, useEffect, useRef } from 'react';
import { Send, Library, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';
import ChatBubble from '../components/ChatBubble';

/**
 * StudentChatPage Component
 * 
 * The main interface for students seeking help.
 * On mount, it checks for an existing session or creates a new one.
 * Displays real-time messages and handles direct insertion into the Supabase database.
 * 
 * @param {Object} props.user - The authenticated Supabase user
 * @param {Function} props.onLogout - Allows the student to manually end the session
 */
export default function StudentChatPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const isInitializing = useRef(false);

  // ==========================================
  // SESSION INITIALIZATION
  // ==========================================
  useEffect(() => {
    if (!user || isInitializing.current) return;

    const initSession = async () => {
      isInitializing.current = true;
      try {
        // 1. Check for an existing active session
        const { data: existingSession } = await supabase
          .from('sessions')
          .select('*')
          .eq('student_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingSession) {
          setSession(existingSession);
          setLoading(false);
          return;
        }

        // 2. No existing session — create a new one via the backend
        const resData = await apiService.createSession();
        setSession(resData.session);
        setLoading(false);
      } catch (err) {
        console.error('Session init error:', err);
        setError('Failed to start chat session. Please try again.');
        setLoading(false);
      }
    };

    initSession();
  }, [user]);

  // ==========================================
  // REAL-TIME SYNCHRONIZATION
  // ==========================================
  useEffect(() => {
    if (!session) return;

    let isCancelled = false;

    // A. Initial Data Load
    supabase.from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!isCancelled) setMessages(data || []);
      });

    // B. Subscribe to Live Inserts
    const channelName = `room_${session.id}_${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` }, 
        (payload) => {
          if (!isCancelled) setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  // Auto-scroll
  useEffect(() => { 
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  // ==========================================
  // SEND MESSAGE LOGIC
  // ==========================================
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !session) return;
    
    const content = input; 
    setInput('');

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

    // Trigger server-side webhooks
    const studentMsgCount = messages.filter(m => m.sender_type === 'student').length + 1;
    await apiService.triggerBotCheck(session.id, studentMsgCount).catch(console.error);
  };

  // ==========================================
  // LOADING & ERROR STATES
  // ==========================================
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Setting up your chat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-50 px-4">
        <div className="text-center bg-white rounded-2xl p-8 border border-red-200 shadow-lg max-w-sm">
          <p className="text-red-600 text-sm font-medium mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="text-blue-600 hover:text-blue-700 text-sm font-semibold underline"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER UI
  // ==========================================
  return (
    <div className="flex bg-blue-50 h-screen w-full font-sans">
      <div className="flex-1 flex flex-col max-w-4xl mx-auto bg-white shadow-xl shadow-blue-900/5 h-full md:h-[95vh] md:my-auto md:rounded-2xl overflow-hidden border border-blue-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-blue-700 flex justify-between items-center shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
              <Library className="text-white" size={20} />
            </div>
            <div>
              <h2 className="font-serif font-semibold text-white text-base tracking-wide">Knobull Support</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <p className="text-[11px] text-blue-100 uppercase tracking-wider font-semibold">Advisors Online</p>
              </div>
            </div>
          </div>
          {onLogout && (
            <button 
              onClick={onLogout} 
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-50 hover:text-white px-3 py-1.5 border border-blue-400/30 hover:bg-blue-600 rounded-lg transition-all"
            >
              <LogOut size={14} /> Sign Out
            </button>
          )}
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
            placeholder="Type your question..." 
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 text-white px-6 py-3 rounded-xl font-medium transition-all active:scale-95 text-sm">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

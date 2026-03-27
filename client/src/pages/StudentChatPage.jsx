import React, { useState, useEffect, useRef } from 'react';
import { Send, Library, LogOut } from 'lucide-react';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';
import ChatBubble from '../components/ChatBubble';

/**
 * StudentChatPage Component
 * 
 * The main interface for students seeking help.
 * Displays real-time messages and handles direct insertion into the Supabase database.
 * 
 * @param {Object} props.user - The persistent anonymous Supabase auth user
 * @param {Object} props.session - The database row representing this specific chat room
 * @param {Function} props.onLogout - Allows the student to manually end the session
 */
export default function StudentChatPage({ user, session, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null); // Used to auto-scroll the chat view down

  // ==========================================
  // REAL-TIME SYNCHRONIZATION
  // ==========================================
  useEffect(() => {
    if (!session) return;

    let isCancelled = false;

    // A. Initial Data Load
    // Fetch all existing messages in this chat room so the student can see history
    supabase.from('messages')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!isCancelled) setMessages(data || []);
      });

    // B. Subscribe to Live Inserts
    // Using Supabase Realtime, we listen to the PostgreSQL database for any new rows 
    // added to the `messages` table where the `session_id` matches ours.
    // The dynamic channel name prevents collisions if React StrictMode double-mounts.
    const channelName = `room_${session.id}_${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` }, 
        (payload) => {
          // Whenever the Expert (or Bot) replies, it gets pushed here instantly
          if (!isCancelled) setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    // Cleanup: Remove the subscription when the component unmounts (student leaves page)
    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  // ==========================================
  // UI HELPERS
  // ==========================================
  // Auto-scroll to the bottom of the message list whenever the messages array changes
  useEffect(() => { 
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  // ==========================================
  // SEND MESSAGE LOGIC
  // ==========================================
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // Optimistic UI clear
    const content = input; 
    setInput('');

    // 1. Direct Database Insert
    // We send the message directly to Supabase. Supabase's internal Row-Level Security (RLS)
    // policies verify that `user.id` is allowed to insert into `session.id`.
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

    // 2. Trigger Server-Side Webhooks
    // Now that the message is in the database, we ping our NodeJS backend so it can:
    // a) Run automated bot logic (if it's the first message)
    // b) Send push notifications to Experts on their dashboards
    const studentMsgCount = messages.filter(m => m.sender_type === 'student').length + 1;
    await apiService.triggerBotCheck(session.id, studentMsgCount).catch(console.error);
  };

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
              <LogOut size={14} /> End Session
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

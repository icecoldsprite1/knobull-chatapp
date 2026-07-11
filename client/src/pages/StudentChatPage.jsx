import React, { useState, useEffect, useRef } from 'react';
import { Send, Library, LogOut, Home, Lock, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';
import ChatBubble from '../components/ChatBubble';

/**
 * StudentChatPage Component
 *
 * The main interface for students seeking help.
 * On mount, it loads the student's OPEN session or creates a new one (subject
 * to the weekly chat-session cap: free = 2, standard = 5, unlimited = none).
 * When an advisor resolves the session, the student is prompted to start a new
 * chat (which counts as a new session).
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
  const [limitReached, setLimitReached] = useState(null); // upsell message when weekly cap hit
  const [resolved, setResolved] = useState(false); // advisor resolved the current session
  const [startingNew, setStartingNew] = useState(false);
  const bottomRef = useRef(null);
  const isInitializing = useRef(false);

  const withTimeout = (promise, message) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), 10000);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  };

  // ==========================================
  // SESSION INITIALIZATION
  // ==========================================
  const loadSession = async () => {
    setError(null);
    setLimitReached(null);
    setResolved(false);
    setLoading(true);

    try {
      // 1. Check for an existing OPEN session
      const { data: existingSession, error: existingSessionError } = await withTimeout(
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', user.id)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        'Timed out while checking for an existing chat session.'
      );

      if (existingSessionError) {
        throw existingSessionError;
      }

      if (existingSession) {
        setSession(existingSession);
        setLoading(false);
        return;
      }

      // 2. No open session — create a new one via the backend (enforces the cap)
      const resData = await withTimeout(
        apiService.createSession(),
        'Timed out while creating a chat session. Make sure the backend is running.'
      );
      setSession(resData.session);
      setLoading(false);
    } catch (err) {
      console.error('Session init error:', err);
      if (err.status === 402 || err.code === 'SESSION_LIMIT_REACHED') {
        setLimitReached(err.message || 'You have reached your weekly chat-session limit.');
      } else {
        setError(err.message || 'Failed to start chat session. Please try again.');
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || isInitializing.current) return;
    isInitializing.current = true;
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const startNewChat = async () => {
    if (startingNew) return;
    setStartingNew(true);
    setError(null);
    try {
      const resData = await apiService.createSession();
      setMessages([]);
      setResolved(false);
      setLimitReached(null);
      setSession(resData.session);
    } catch (err) {
      console.error('Start new chat error:', err);
      if (err.status === 402 || err.code === 'SESSION_LIMIT_REACHED') {
        setSession(null);
        setLimitReached(err.message || 'You have reached your weekly chat-session limit.');
      } else {
        setError(err.message || 'Failed to start a new chat session.');
      }
    } finally {
      setStartingNew(false);
    }
  };

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

    // B. Subscribe to Live Message Inserts + session resolution
    const channelName = `room_${session.id}_${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${session.id}` },
        (payload) => {
          if (isCancelled) return;
          // De-dupe: the sender appends its own message optimistically, and
          // Realtime may also deliver it.
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          if (!isCancelled && payload.new?.status === 'resolved') {
            setResolved(true);
          }
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
    if (!input.trim() || !session || resolved) return;

    const content = input;
    setInput('');

    try {
      const { message } = await apiService.sendMessage({
        sessionId: session.id,
        content,
      });
      // Show the student's own message immediately rather than waiting on a
      // Realtime round-trip. De-duped in the INSERT handler by message id.
      if (message) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      }
    } catch (err) {
      console.error("Message blocked:", err);
      if (err.code === 'SESSION_RESOLVED' || err.status === 409) {
        setResolved(true);
      } else {
        alert(err.message || "Message blocked by security policies.");
      }
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

  // Weekly chat-session cap reached — show upsell.
  if (limitReached) {
    return (
      <div className="h-screen flex items-center justify-center bg-blue-50 px-4">
        <div className="text-center bg-white rounded-2xl p-8 border border-amber-200 shadow-lg max-w-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
            <Lock className="text-amber-600" size={26} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">No chat sessions left this week</h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">{limitReached}</p>
          <div className="grid gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
            >
              View membership plans
            </button>
            <Link to="/" className="text-blue-600 hover:text-blue-700 text-sm font-semibold underline">
              Back to home
            </Link>
          </div>
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
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-50 hover:text-white px-3 py-1.5 border border-blue-400/30 hover:bg-blue-600 rounded-lg transition-all"
            >
              <Home size={14} /> Home
            </Link>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-50 hover:text-white px-3 py-1.5 border border-blue-400/30 hover:bg-blue-600 rounded-lg transition-all"
              >
                <LogOut size={14} /> Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {messages.map((m, i) => <ChatBubble key={i} message={m} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input, or resolved banner */}
        {resolved ? (
          <div className="p-5 bg-white border-t border-emerald-100 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
              <CheckCircle className="text-emerald-600" size={20} />
            </div>
            <p className="text-slate-700 text-sm font-medium mb-3">
              Your advisor marked this chat as resolved. Start a new chat if you need more help.
            </p>
            <button
              onClick={startNewChat}
              disabled={startingNew}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm shadow-md shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {startingNew ? 'Starting…' : 'Start a new chat'}
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

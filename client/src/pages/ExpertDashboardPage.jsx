import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Send, User, LogOut, Bell, Home, BookOpen, Mail, CheckCircle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';
import { apiService } from '../services/api.service';
import { requestNotificationPermission, onForegroundMessage } from '../config/firebase';
import ChatBubble from '../components/ChatBubble';

const QUEUE_TABS = [
  { key: 'mine', label: 'Mine' },
  { key: 'unclaimed', label: 'Unclaimed' },
  { key: 'claimed', label: 'Claimed' },
  { key: 'resolved', label: 'Resolved' },
];

// Resolved sessions are "ended" — they only appear in the Resolved tab.
const isOpenSession = (s) => s.status !== 'resolved';

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
  const [sessionsList, setSessionsList] = useState([]); // OPEN sessions (active queue)
  const [resolvedSessions, setResolvedSessions] = useState([]); // paginated resolved history
  const [resolvedCount, setResolvedCount] = useState(0);
  const [resolvedCursor, setResolvedCursor] = useState(null);
  const [resolvedHasMore, setResolvedHasMore] = useState(false);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true); // Prevents "Queue is empty" flash
  const [activeSession, setActiveSession] = useState(null); // The room currently open in the Chat View
  const [messages, setMessages] = useState([]); // Messages for the active session
  const [input, setInput] = useState(''); // Text input
  const [notificationsEnabled, setNotificationsEnabled] = useState(false); // UI toggle state for push alerts
  const [emailAlerts, setEmailAlerts] = useState(null); // this advisor's email-alert preference (null = loading)
  const [emailAlertsSaving, setEmailAlertsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('mine');
  const [queueError, setQueueError] = useState(null);
  const [pendingActions, setPendingActions] = useState({});
  const [readCounts, setReadCounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`knobull-advisor-read-counts:${user.id}`)) || {};
    } catch {
      return {};
    }
  });
  const bottomRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const fetchQueuedRef = useRef(false);
  const fetchCooldownRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(`knobull-advisor-read-counts:${user.id}`, JSON.stringify(readCounts));
  }, [readCounts, user.id]);

  // Load this advisor's email-alert preference once on mount.
  useEffect(() => {
    let cancelled = false;
    apiService.getNotificationPreference()
      .then((res) => { if (!cancelled) setEmailAlerts(res.emailNotifications !== false); })
      .catch((err) => { console.error('Failed to load email-alert preference:', err); if (!cancelled) setEmailAlerts(true); });
    return () => { cancelled = true; };
  }, []);

  const toggleEmailAlerts = async () => {
    if (emailAlerts === null || emailAlertsSaving) return;
    const next = !emailAlerts;
    setEmailAlertsSaving(true);
    setEmailAlerts(next); // optimistic
    try {
      await apiService.setNotificationPreference(next);
    } catch (err) {
      console.error('Failed to update email-alert preference:', err);
      setEmailAlerts(!next); // revert on failure
    } finally {
      setEmailAlertsSaving(false);
    }
  };

  const getUnreadCount = (session) => {
    if (session.expert_id !== user.id) return 0;
    return Math.max(0, (session.student_message_count || 0) - (readCounts[session.id] || 0));
  };

  const markSessionRead = (session) => {
    if (!session || session.expert_id !== user.id) return;
    setReadCounts((prev) => ({
      ...prev,
      [session.id]: Math.max(prev[session.id] || 0, session.student_message_count || 0),
    }));
  };

  // sessionsList holds only OPEN sessions; resolved history is fetched separately.
  const tabCounts = useMemo(() => ({
    mine: sessionsList.filter((s) => s.expert_id === user.id).length,
    unclaimed: sessionsList.filter((s) => !s.expert_id).length,
    claimed: sessionsList.filter((s) => s.expert_id && s.expert_id !== user.id).length,
    resolved: resolvedCount,
  }), [sessionsList, resolvedCount, user.id]);

  const mineUnreadTotal = useMemo(() => (
    sessionsList.reduce((total, session) => {
      if (session.expert_id !== user.id) return total;
      return total + Math.max(0, (session.student_message_count || 0) - (readCounts[session.id] || 0));
    }, 0)
  ), [sessionsList, readCounts, user.id]);

  const filteredSessions = useMemo(() => {
    if (activeTab === 'resolved') {
      return resolvedSessions;
    }

    if (activeTab === 'mine') {
      return sessionsList.filter((s) => s.expert_id === user.id);
    }

    if (activeTab === 'unclaimed') {
      return sessionsList.filter((s) => !s.expert_id);
    }

    return sessionsList.filter((s) => s.expert_id && s.expert_id !== user.id);
  }, [activeTab, sessionsList, resolvedSessions, user.id]);

  const getMembershipLabel = (session) => {
    if (session.has_unlimited_sessions) {
      return 'Unlimited sessions';
    }

    if (session.session_limit_weekly == null) {
      return session.has_active_membership ? 'Membership active' : 'Free plan';
    }

    const prefix = session.has_active_membership ? '' : 'Free • ';
    return `${prefix}${session.sessions_used_weekly || 0} / ${session.session_limit_weekly} sessions this week`;
  };

  const refreshSessionsSoon = () => {
    if (fetchCooldownRef.current) return;

    fetchCooldownRef.current = window.setTimeout(() => {
      fetchCooldownRef.current = null;
      fetchSessions();
    }, 350);
  };

  // ==========================================
  // INITIAL LOAD & GLOBAL DASHBOARD SUBSCRIPTIONS
  // ==========================================
  useEffect(() => {
    // 1. Fetch initial queue list on load
    fetchSessions();

    // 2. Subscribe to Queue Changes (Realtime).
    // A DB trigger updates the session row's denormalized message summary on
    // every message insert, so listening to `sessions` alone captures new
    // students, claims, resolutions, AND new-message previews — no separate
    // (noisy) global messages subscription needed. The refetch is debounced.
    const channelName = `sessions_queue_${Date.now()}`;
    const sessionsChannel = supabase.channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions' },
        () => refreshSessionsSoon() // Reload the queue data
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
        refreshSessionsSoon();
      }
    });

    const handleFocus = () => refreshSessionsSoon();
    window.addEventListener('focus', handleFocus);

    // Cleanup subscription on unmount
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (fetchCooldownRef.current) {
        window.clearTimeout(fetchCooldownRef.current);
      }
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  // Load the resolved history when the advisor opens the Resolved tab.
  useEffect(() => {
    if (activeTab === 'resolved') {
      fetchResolved({ reset: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /**
   * Helper to pull the latest session list from Supabase
   */
  const fetchSessions = async () => {
    if (fetchInFlightRef.current) {
      fetchQueuedRef.current = true;
      return;
    }

    fetchInFlightRef.current = true;

    try {
      const { sessions, resolvedCount: resolved } = await apiService.getExpertSessions();
      setSessionsList(sessions || []);
      setResolvedCount(resolved || 0);
      setQueueError(null);
    } catch (err) {
      console.error("Error fetching enriched queue:", err);
      setQueueError(err.message || 'Failed to load enriched queue data.');

      if (/too many requests/i.test(err.message || '')) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('status', 'open')
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) throw error;
        setSessionsList(data || []);
      } catch (fallbackErr) {
        console.error("Fallback queue fetch failed:", fallbackErr);
        setSessionsList([]);
      }
    } finally {
      fetchInFlightRef.current = false;
      setIsLoadingQueue(false);

      if (fetchQueuedRef.current) {
        fetchQueuedRef.current = false;
        refreshSessionsSoon();
      }
    }
  };

  /**
   * Loads the resolved history (paginated). `reset` starts from the newest page;
   * otherwise it appends the next page using the current cursor.
   */
  const fetchResolved = async ({ reset = false } = {}) => {
    if (resolvedLoading) return;
    setResolvedLoading(true);

    try {
      const cursor = reset ? null : resolvedCursor;
      const data = await apiService.getExpertSessions({
        status: 'resolved',
        cursor: cursor || undefined,
        limit: 50,
      });
      const rows = data.sessions || [];
      setResolvedSessions((prev) => (reset ? rows : [...prev, ...rows]));
      setResolvedCursor(data.nextCursor || null);
      setResolvedHasMore(Boolean(data.nextCursor));
    } catch (err) {
      console.error('Error fetching resolved sessions:', err);
    } finally {
      setResolvedLoading(false);
    }
  };

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  /**
   * Fired when an Expert clicks a card in the Queue. Opens the chat to read it.
   * It does NOT claim automatically — claiming is an explicit "Claim this chat"
   * button inside the chat view, so advisors always understand what's happening.
   */
  const handleSelectSession = (sessionData) => {
    // Someone else's open session stays read-only from the queue.
    if (isOpenSession(sessionData) && sessionData.expert_id && sessionData.expert_id !== user.id) {
      alert('This chat is already claimed by another advisor.');
      return;
    }
    markSessionRead(sessionData);
    setActiveSession(sessionData);
  };

  /**
   * Explicitly claim the open chat so this advisor can reply. Triggered by the
   * "Claim this chat" button in the chat view.
   */
  const handleClaimSession = async () => {
    if (!activeSession) return;

    const actionKey = `claim:${activeSession.id}`;
    if (pendingActions[actionKey]) return;

    try {
      setPendingActions((prev) => ({ ...prev, [actionKey]: true }));
      // Backend safely assigns the session (handles two advisors racing to claim).
      await apiService.claimSession(activeSession.id);
      const claimed = { ...activeSession, expert_id: user.id };
      markSessionRead(claimed);
      setActiveSession(claimed);
      setActiveTab('mine');
      fetchSessions();
    } catch (err) {
      alert(err.message || 'Could not claim this chat — it may have just been claimed by someone else.');
      setActiveSession(null);
      fetchSessions();
    } finally {
      setPendingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleUnclaimSession = async () => {
    if (!activeSession) return;

    const confirmed = window.confirm('Return this chat to the unclaimed queue so another advisor can respond?');
    if (!confirmed) return;

    const actionKey = `unclaim:${activeSession.id}`;
    if (pendingActions[actionKey]) return;

    try {
      setPendingActions((prev) => ({ ...prev, [actionKey]: true }));
      await apiService.unclaimSession(activeSession.id);
      setActiveSession(null);
      setActiveTab('unclaimed');
      fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to unclaim session.');
    } finally {
      setPendingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleSessionAdjustment = async (event, session, delta) => {
    event.stopPropagation();

    const actionKey = `sessions:${session.student_id}`;
    if (pendingActions[actionKey]) return;

    try {
      setPendingActions((prev) => ({ ...prev, [actionKey]: true }));
      await apiService.adjustSessionAllowance({
        studentId: session.student_id,
        delta,
      });
      fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to adjust session allowance.');
    } finally {
      setPendingActions((prev) => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleResolveSession = async () => {
    if (!activeSession) return;

    const confirmed = window.confirm('Resolve this chat? It will be closed and the student can start a new session.');
    if (!confirmed) return;

    const actionKey = `resolve:${activeSession.id}`;
    if (pendingActions[actionKey]) return;

    try {
      setPendingActions((prev) => ({ ...prev, [actionKey]: true }));
      await apiService.resolveSession(activeSession.id);
      setActiveSession(null);
      setActiveTab('resolved');
      fetchSessions();
    } catch (err) {
      alert(err.message || 'Failed to resolve session.');
    } finally {
      setPendingActions((prev) => ({ ...prev, [actionKey]: false }));
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

  useEffect(() => {
    if (!activeSession || activeSession.expert_id !== user.id) return;

    const studentMessageCount = messages.filter((message) => message.sender_type === 'student').length;
    setReadCounts((prev) => ({
      ...prev,
      [activeSession.id]: Math.max(prev[activeSession.id] || 0, studentMessageCount),
    }));
  }, [activeSession, messages, user.id]);

  // ==========================================
  // SEND MESSAGE LOGIC (EXPERT)
  // ==========================================
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const content = input; 
    setInput('');

    try {
      await apiService.sendMessage({
        sessionId: activeSession.id,
        content,
      });
      fetchSessions();
    } catch (err) {
      alert(err.message || "Message blocked by Database Security Policies.");
    }
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
                {mineUnreadTotal > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                    <Bell size={13} /> {mineUnreadTotal} new {mineUnreadTotal === 1 ? 'message' : 'messages'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleEmailAlerts}
                disabled={emailAlerts === null || emailAlertsSaving}
                title={emailAlerts ? 'Email alerts are ON — click to turn off' : 'Email alerts are OFF — click to turn on'}
                className={`flex items-center gap-2 text-sm font-semibold px-5 py-2.5 border rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${
                  emailAlerts
                    ? 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                    : 'text-slate-600 border-slate-300 bg-white hover:bg-slate-100'
                }`}
              >
                <Mail size={16} />
                {emailAlerts === null ? 'Email alerts' : emailAlerts ? 'Email alerts: On' : 'Email alerts: Off'}
              </button>
              <Link
                to="/guide"
                className="flex items-center gap-2 text-slate-600 hover:text-blue-700 text-sm font-semibold px-5 py-2.5 border border-slate-300 hover:border-blue-300 hover:bg-blue-100 rounded-xl transition-all bg-white shadow-sm hover:shadow-md"
              >
                <BookOpen size={16}/> Guide
              </Link>
              <Link
                to="/"
                className="flex items-center gap-2 text-slate-600 hover:text-blue-700 text-sm font-semibold px-5 py-2.5 border border-slate-300 hover:border-blue-300 hover:bg-blue-100 rounded-xl transition-all bg-white shadow-sm hover:shadow-md"
              >
                <Home size={16}/> Home
              </Link>
              <button onClick={onLogout} className="flex items-center gap-2 text-slate-600 hover:text-blue-700 text-sm font-semibold px-5 py-2.5 border border-slate-300 hover:border-blue-300 hover:bg-blue-100 rounded-xl transition-all bg-white shadow-sm hover:shadow-md">
                <LogOut size={16}/> Sign Out
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {QUEUE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              // Attention badge: Unclaimed = chats waiting to be claimed;
              // Mine = unread messages in chats you're already handling.
              let badge = tabCounts[tab.key] || 0;
              let attention = false;
              if (tab.key === 'unclaimed' && badge > 0) attention = true;
              if (tab.key === 'mine' && mineUnreadTotal > 0) { badge = mineUnreadTotal; attention = true; }
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-900/10'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {tab.label}
                  {badge > 0 && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold ${
                      attention
                        ? 'bg-red-500 text-white'
                        : isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* How claiming works — plain-language hint */}
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
            <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-slate-600">
              New student requests arrive under <span className="font-semibold text-slate-800">Unclaimed</span> (a red number appears).
              Open one and tap <span className="font-semibold text-slate-800">Claim this chat</span> to start — it then moves to{' '}
              <span className="font-semibold text-slate-800">Mine</span>. A red number on{' '}
              <span className="font-semibold text-slate-800">Mine</span> means a student you're helping sent a new message.
            </p>
          </div>

          {queueError && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Showing basic queue data because enriched session details did not load: {queueError}
            </div>
          )}

          {/* Session Cards Grid */}
          {isLoadingQueue ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-blue-100 shadow-md shadow-blue-900/5">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
              <p className="text-slate-500 font-semibold">Loading queue...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-blue-100 shadow-md shadow-blue-900/5">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <User className="text-blue-400" size={40} />
              </div>
              <p className="text-slate-800 font-semibold text-xl">No {activeTab} sessions</p>
              <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
                {activeTab === 'mine'
                  ? 'Sessions you claim will appear here.'
                  : activeTab === 'unclaimed'
                  ? 'New student requests will appear here automatically.'
                  : activeTab === 'resolved'
                  ? 'Chats you resolve will appear here.'
                  : 'Sessions claimed by other advisors will appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filteredSessions.map(s => {
                const unreadCount = getUnreadCount(s);
                const isMine = s.expert_id === user.id;
                const isClaimedByOther = s.expert_id && !isMine;
                const isAdjustingSessions = Boolean(pendingActions[`sessions:${s.student_id}`]);
                const isResolved = !isOpenSession(s);

                return (
                <div 
                  key={s.id} 
                  onClick={() => handleSelectSession(s)} 
                  className={`p-6 bg-white rounded-2xl border cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5 ${
                    isMine 
                      ? 'border-blue-400 shadow-lg shadow-blue-500/10 ring-2 ring-blue-400/20' 
                      : isClaimedByOther 
                      ? 'border-slate-200 opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none' 
                      : 'border-blue-200 hover:border-blue-400'
                  }`}
                >
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-3 rounded-xl shadow-sm border ${
                        isMine ? 'bg-blue-600 text-white border-blue-500' : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        <User size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold uppercase tracking-wider ${isMine ? 'text-blue-700' : 'text-slate-700'}`}>Student Chat</p>
                        <p className="text-sm font-semibold text-slate-900 truncate max-w-[190px]">{s.student_name || 'Student'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[190px]">{s.student_email || 'No email available'}</p>
                        <p className="font-mono text-[10px] text-slate-400 mt-1">ID: {s.id.slice(0, 8)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {unreadCount > 0 && (
                        <span className="min-w-6 h-6 px-2 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shadow-md shadow-blue-600/20">
                          {unreadCount}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                        {new Date(s.last_activity_at || s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 min-h-[52px]">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {isResolved && (
                        <span className="text-[11px] font-bold uppercase tracking-wider rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1">
                          Resolved
                        </span>
                      )}
                      {s.needs_advisor_reply && (
                        <span className="text-[11px] font-bold uppercase tracking-wider rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-1">
                          Needs reply
                        </span>
                      )}
                      <span className={`text-[11px] font-bold uppercase tracking-wider rounded-full border px-2.5 py-1 ${
                        s.has_active_membership
                          ? s.has_unlimited_sessions
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {s.has_active_membership
                          ? s.has_unlimited_sessions
                            ? 'Unlimited'
                            : 'Member'
                          : 'Free'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 mb-3">
                      {getMembershipLabel(s)}
                      {s.has_active_membership && s.membership_tier ? ` • ${s.membership_tier}` : ''}
                      {s.billing_interval ? ` ${s.billing_interval}` : ''}
                    </p>
                    {!s.has_unlimited_sessions && (
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Adjust</span>
                        <button
                          type="button"
                          onClick={(event) => handleSessionAdjustment(event, s, -1)}
                          disabled={isAdjustingSessions}
                          className="h-7 w-7 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Remove one weekly chat session"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleSessionAdjustment(event, s, 1)}
                          disabled={isAdjustingSessions}
                          className="h-7 w-7 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Add one weekly chat session"
                        >
                          +
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Last message{s.last_message_sender_type ? ` from ${s.last_message_sender_type}` : ''}
                    </p>
                    <p className={`text-sm leading-relaxed line-clamp-2 ${unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                      {s.last_message_preview || 'No messages yet.'}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100">
                    <p className={`text-sm font-semibold ${
                      isResolved ? 'text-slate-500' : isMine ? 'text-blue-700' : isClaimedByOther ? 'text-slate-500' : 'text-slate-700'
                    }`}>
                      {isResolved ? 'Resolved' : isMine ? 'Active Session' : isClaimedByOther ? 'Claimed' : 'Unclaimed'}
                    </p>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isResolved ? 'text-slate-400' : isMine ? 'text-blue-600 group-hover:underline' : isClaimedByOther ? 'text-slate-400' : 'text-blue-500'}`}>
                      {isResolved ? 'View' : isMine ? 'Resume →' : isClaimedByOther ? 'Assigned' : 'Open to claim →'}
                    </span>
                  </div>
                </div>
              )})}
            </div>
          )}

          {activeTab === 'resolved' && (resolvedHasMore || resolvedLoading) && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => fetchResolved({ reset: false })}
                disabled={resolvedLoading || !resolvedHasMore}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resolvedLoading ? 'Loading…' : 'Load more'}
              </button>
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
                <h2 className="font-serif font-semibold text-white text-base tracking-wide">
                  {activeSession.student_name || 'Advising Session'}
                </h2>
                <span className="text-[10px] font-mono text-blue-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md shadow-sm">ID: {activeSession.id.slice(0,8)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <p className="text-[10px] text-blue-100 font-semibold tracking-wider uppercase">
                  {activeSession.student_email || 'Student Connected'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOpenSession(activeSession) && !activeSession.expert_id && (
              <button
                onClick={handleClaimSession}
                disabled={Boolean(pendingActions[`claim:${activeSession.id}`])}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 rounded-lg transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle size={14} /> {pendingActions[`claim:${activeSession.id}`] ? 'Claiming…' : 'Claim this chat'}
              </button>
            )}
            {isOpenSession(activeSession) && activeSession.expert_id === user.id && (
              <>
                <button
                  onClick={handleUnclaimSession}
                  disabled={Boolean(pendingActions[`unclaim:${activeSession.id}`])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-amber-200 hover:text-white px-3 py-1.5 border border-amber-500/30 hover:bg-amber-500/10 rounded-lg transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Unclaim
                </button>
                <button
                  onClick={handleResolveSession}
                  disabled={Boolean(pendingActions[`resolve:${activeSession.id}`])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200 hover:text-white px-3 py-1.5 border border-emerald-500/30 hover:bg-emerald-500/10 rounded-lg transition-all shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Resolve
                </button>
              </>
            )}
            <button onClick={() => setActiveSession(null)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 border border-slate-700 hover:bg-slate-800 rounded-lg transition-all shadow-sm">
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
          {messages.map((m, i) => <ChatBubble key={i} message={m} viewerRole="expert" />)}
          <div ref={bottomRef} />
        </div>

        {/* Input area: resolved (read-only) / claimed by me (send) / not yet claimed (claim CTA) */}
        {!isOpenSession(activeSession) ? (
          <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-sm font-medium text-slate-500">
            This chat session has been resolved and is read-only.
          </div>
        ) : activeSession.expert_id === user.id ? (
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
        ) : (
          <div className="p-5 bg-blue-50 border-t border-blue-100 text-center">
            <p className="text-sm font-semibold text-slate-800 mb-1">You haven't claimed this chat yet</p>
            <p className="text-xs text-slate-500 mb-4">Claim it to start replying. It will move to your <span className="font-semibold">Mine</span> tab.</p>
            <button
              onClick={handleClaimSession}
              disabled={Boolean(pendingActions[`claim:${activeSession.id}`])}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md shadow-blue-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle size={18} />
              {pendingActions[`claim:${activeSession.id}`] ? 'Claiming…' : 'Claim this chat'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

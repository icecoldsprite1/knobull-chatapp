/**
 * API Service Layer
 * 
 * Handles all communication between the React frontend and the Express.js Backend.
 * Ensures that every request is securely signed with a Supabase JWT Token.
 */

import { supabase } from '../config/supabase';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * fetchWithAuth
 * 
 * A wrapper around the native browser `fetch` API.
 * 1. Checks LocalStorage for a valid Supabase Session.
 * 2. Extracts the `access_token` (JWT).
 * 3. Injects it into the HTTP headers as a `Bearer` token.
 * 4. Parses the JSON response automatically.
 * 
 * By using this wrapper, we guarantee that the backend `auth.middleware.js` 
 * accepts our requests.
 */
const sendRequest = async (endpoint, options) => {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // If the user has logged in, attach their ID badge (Token)
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  // Hit the NodeJS backend
  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });
};

const fetchWithAuth = async (endpoint, options = {}) => {
  let response = await sendRequest(endpoint, options);

  // Self-heal a stale/expired session. A 401 can mean the cached access token's
  // session was revoked or expired. Try a single refresh + retry; if the refresh
  // fails the session is truly dead, so sign out — App's auth listener then sends
  // the user back to the login screen instead of leaving them stuck on an error.
  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session?.access_token) {
      response = await sendRequest(endpoint, options);
    } else {
      await supabase.auth.signOut().catch(() => {});
    }
  }

  // Attempt to parse any returned JSON, while preserving useful non-JSON errors.
  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      const looksLikeHtml = /^\s*<!doctype html/i.test(responseText) || /^\s*<html/i.test(responseText);
      data = {
        error: looksLikeHtml
          ? `Backend returned HTML instead of JSON for ${endpoint}. Confirm the API server has the latest routes deployed and that API routing is configured correctly.`
          : responseText.slice(0, 160)
      };
    }
  }

  if (!response.ok) {
    const error = new Error(data.error || `API request failed with status ${response.status}`);
    error.status = response.status;
    if (data.code) error.code = data.code;
    throw error;
  }

  return data;
};

// ==========================================
// EXPOSED API ENDPOINTS
// ==========================================

export const apiService = {
  /**
   * Called by a Student to initialize a chat session row in PostgreSQL.
   */
  createSession: async () => {
    return fetchWithAuth('/create-session', { method: 'POST' });
  },

  /**
   * Loads enriched advisor queue data.
   * Default: open sessions + resolvedCount. Pass { status: 'resolved', cursor, limit }
   * to page through resolved sessions.
   */
  getExpertSessions: async ({ status, cursor, limit } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchWithAuth(`/expert-sessions${query}`, { method: 'GET' });
  },
  
  /**
   * Called by an Expert to take ownership of a student's session.
   */
  claimSession: async (sessionId) => {
    return fetchWithAuth('/claim-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  },

  /**
   * Returns an assigned session to the unclaimed queue.
   */
  unclaimSession: async (sessionId) => {
    return fetchWithAuth('/unclaim-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  },

  /**
   * Resolves (ends) a chat session. The student can then start a new one.
   */
  resolveSession: async (sessionId) => {
    return fetchWithAuth('/resolve-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  },

  /**
   * Adds/removes one weekly chat session from a student's allowance.
   */
  adjustSessionAllowance: async ({ studentId, delta }) => {
    return fetchWithAuth('/adjust-session-allowance', {
      method: 'POST',
      body: JSON.stringify({ studentId, delta })
    });
  },

  /**
   * Called by StudentChatPage every time a message is sent.
   * Tells the backend to evaluate bot logic and trigger push notifications.
   */
  triggerBotCheck: async (sessionId, messageCount) => {
    return fetchWithAuth('/bot-check', {
      method: 'POST',
      body: JSON.stringify({ sessionId, messageCount })
    });
  },

  /**
   * Sends a chat message through the backend so membership and session access
   * checks are enforced server-side.
   */
  sendMessage: async ({ sessionId, content }) => {
    return fetchWithAuth('/send-message', {
      method: 'POST',
      body: JSON.stringify({ sessionId, content })
    });
  },

  /**
   * Loads the current membership plus weekly answered-question usage.
   */
  getMembershipUsage: async () => {
    return fetchWithAuth('/membership-usage', { method: 'GET' });
  },

  /**
   * Called by ExpertDashboardPage to register a browser for push notifications.
   */
  registerDevice: async (token) => {
    return fetchWithAuth('/register-device', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },

  /**
   * Reads the current advisor's email-alert on/off preference.
   */
  getNotificationPreference: async () => {
    return fetchWithAuth('/notification-preference', { method: 'GET' });
  },

  /**
   * Turns the current advisor's email alerts on or off.
   */
  setNotificationPreference: async (enabled) => {
    return fetchWithAuth('/notification-preference', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
  },

  /**
   * Called after PayPal approves a subscription.
   * Records the subscription against the authenticated Supabase user.
   */
  recordSubscription: async ({ planKey, paypalSubscriptionId }) => {
    return fetchWithAuth('/record-subscription', {
      method: 'POST',
      body: JSON.stringify({ planKey, paypalSubscriptionId })
    });
  },

  /**
   * Cancels the authenticated student's active PayPal subscription.
   */
  cancelSubscription: async () => {
    return fetchWithAuth('/cancel-subscription', { method: 'POST' });
  },

  /**
   * Changes the authenticated student's existing subscription to a different plan.
   */
  changeSubscriptionPlan: async ({ planKey }) => {
    return fetchWithAuth('/change-subscription-plan', {
      method: 'POST',
      body: JSON.stringify({ planKey })
    });
  }
};

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
const fetchWithAuth = async (endpoint, options = {}) => {
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
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Attempt to parse any returned JSON
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
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
   */
  getExpertSessions: async () => {
    return fetchWithAuth('/expert-sessions', { method: 'GET' });
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

/**
 * Main API Router
 * 
 * Maps HTTP routes to their respective Controller functions. 
 * This file separates routing concerns from business logic (which lives in controllers).
 */

const express = require('express');
const router = express.Router();

// Import controllers
const { createSession, claimSession } = require('../controllers/session.controller');
const { handleBotCheck } = require('../controllers/bot.controller');
const { registerDevice } = require('../controllers/notification.controller');

// Import security middleware
const { requireAuth } = require('../middlewares/auth.middleware');

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================
// This line injects the `requireAuth` function before EVERY route defined below.
// It ensures that no API endpoint inside this file can be accessed without a valid 
// JWT Bearer token being passed in the "Authorization" header. Let's keep our data safe.
router.use(requireAuth);


// ==========================================
// ROUTE DEFINITIONS
// ==========================================

/**
 * Creates a brand new chat session for a student.
 * Caller: StudentChatPage.jsx
 */
router.post('/create-session', createSession);

/**
 * Allows an expert to "take" a session, assigning it to them.
 * Caller: ExpertDashboardPage.jsx
 */
router.post('/claim-session', claimSession);

/**
 * Called every time a student sends a message. Central hub for bot logic.
 * Checks message counts, escalates to human experts, and handles push actions.
 * Caller: StudentChatPage.jsx
 */
router.post('/bot-check', handleBotCheck);

/**
 * Saves a unique browser Firebase Cloud Messaging (FCM) token to the DB.
 * Allows the server to send push notifications to a specific expert's browser.
 * Caller: notification.service.js
 */
router.post('/register-device', registerDevice);

module.exports = router;

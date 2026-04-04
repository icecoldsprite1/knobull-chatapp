/**
 * Knobull Chat Backend Entry Point
 * 
 * This file sets up the Express.js server, configuring global middlewares 
 * like CORS and JSON body parsing, and establishing the base route structure.
 * 
 * Architecture Note: We use a Modular Monolith (MVC) pattern. 
 * Business logic is entirely abstracted away into routes, controllers, and services
 * stored inside the `/src` directory to keep this entry file minimal and clean.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const apiRoutes = require('./src/routes/api.routes');

const app = express();

// Trust the first proxy (e.g. Heroku, Render, AWS ALBs) so express-rate-limit 
// correctly identifies the user's IP instead of the proxy's IP.
app.set('trust proxy', 1);

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================

// Helmet automatically sets secure HTTP headers (X-Content-Type-Options, 
// Strict-Transport-Security, X-Frame-Options, etc.) that protect against 
// common web attacks like clickjacking, MIME sniffing, and XSS.
app.use(helmet());

// CORS Lockdown: Only allow requests from our own frontend domains.
// Without this, ANY website on the internet could make API calls to our backend.
// Origins are configured via CORS_ORIGINS env var (comma-separated).
// In production, set: CORS_ORIGINS=https://knobull.com,https://www.knobull.com
// In development, add: http://localhost:5173
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['https://knobull.com', 'https://www.knobull.com'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
}));

// Rate Limiting: Prevent abuse by limiting each IP to 100 API requests per 15 minutes.
// This protects against brute-force attacks, spam session creation, and notification flooding.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minute window
  max: 100,                   // Max 100 requests per window per IP
  standardHeaders: true,      // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,       // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', apiLimiter);

// Parse incoming payloads with JSON payloads automatically to `req.body`.
app.use(express.json({ limit: '10kb' }));

// ==========================================
// 2. ROUTING
// ==========================================

// Prefix all functional application routes with `/api`.
// Note: Security rules (like checking for valid JWTs) are purposefully handled 
// inside the router level (`api.routes.js`), NOT globally, allowing public 
// routes (like /health) to exist without requiring authentication.
app.use('/api', apiRoutes);

/**
 * Basic health check endpoint used by deployment platforms (Render, Heroku) 
 * to verify that the server has successfully booted and is accepting requests.
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ==========================================
// 3. SERVER INITIALIZATION
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Knobull Server] Running securely on port ${PORT}`));


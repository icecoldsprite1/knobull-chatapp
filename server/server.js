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
const apiRoutes = require('./src/routes/api.routes');

const app = express();

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================

// Enable Cross-Origin Resource Sharing (CORS) so the Vite frontend (localhost:5173) 
// can make API requests to this backend without browser security blocks.
app.use(cors());

// Parse incoming payloads with JSON payloads automatically to `req.body`.
app.use(express.json());

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


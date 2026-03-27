/**
 * Authentication Middleware
 * 
 * This file contains security logic that acts as a gatekeeper for our API routes.
 * It intercepts incoming HTTP requests, extracts the authorization token, 
 * and verifies it using the Supabase Admin client before allowing the controller to run.
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize the Supabase Admin client using the SUPABASE_SECRET_KEY.
// This key bypasses Row Level Security (RLS) entirely, giving the server God-mode 
// to check the database for valid user sessions.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Express Middleware: requireAuth
 * 
 * Ensures the incoming request has a valid Supabase Session token (JWT).
 * If valid, attaches the decoded `user` object to the Express `req` object so 
 * downstream controllers know exactly who made the request securely.
 */
const requireAuth = async (req, res, next) => {
  // 1. Extract the Authorization Header
  const authHeader = req.headers.authorization;

  // We expect the format: "Bearer <encoded_jwt_token_string>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Validate the Token
    // We actively ping the Supabase Auth server securely via `getUser(token)`.
    // Why? It implicitly handles secret signing keys (HS256 vs RS256) entirely 
    // seamlessly, and strictly throws an error if a token has been explicitly revoked 
    // before its natural expiration.
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('Supabase Auth Error:', error?.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    // 3. Attach User Data
    // We bind the verified Supabase User UUID to `req.user.sub`.
    // Controllers can safely trust `req.user.sub` as the indisputable identity of the caller.
    req.user = { sub: user.id, ...user }; 
    
    // 4. Proceed to the actual Route Handler (Controller)
    next();
  } catch (err) {
    console.error('Server Verification Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error during auth verification' });
  }
};

module.exports = { requireAuth };

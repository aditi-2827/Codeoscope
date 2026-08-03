// backend/middleware/auth.js
// Extracts and verifies Supabase JWT from Authorization header.
// Attaches req.user if valid. Does NOT block — routes decide individually.
const supabase = require('../lib/supabase');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        req.user = user;
      }
    } catch {
      // Token invalid or expired — just continue as guest
    }
  }

  next();
}

module.exports = authMiddleware;

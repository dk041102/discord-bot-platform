import jwt from 'jsonwebtoken';

/**
 * Protects every dashboard route except /auth/login. Expects a Bearer JWT
 * issued by POST /auth/login. The dashboard itself is the only thing this
 * is meant to gate — it has no bearing on the Discord interactions endpoint,
 * which is verified separately and entirely differently (Ed25519, not JWT)
 * over in discord-service.
 */
export function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

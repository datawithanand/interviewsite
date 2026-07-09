const { verifyToken } = require('../utils/jwt');
const { getActiveSession, touchSession } = require('../utils/session');
const prisma = require('../db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const session = await getActiveSession(payload.sid);
  if (!session) {
    return res.status(401).json({ error: 'Session has expired or was revoked. Please sign in again.' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
  }

  req.user = user;
  req.session = session;
  touchSession(session.id); // fire-and-forget; never blocks the request
  next();
}

// Attaches req.user if a valid token is present, but never rejects the
// request — used for endpoints that are public but behave differently for
// authenticated callers (e.g. filtering to public-only questions).
async function optionalAuthenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyToken(token);
      const session = await getActiveSession(payload.sid);
      if (session) {
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (user && user.isActive) {
          req.user = user;
          req.session = session;
        }
      }
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}

module.exports = { authenticate, optionalAuthenticate };

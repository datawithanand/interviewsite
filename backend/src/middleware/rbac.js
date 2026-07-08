const { ROLES } = require('../utils/enums');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

const requireWriterOrAdmin = requireRole(ROLES.WRITER, ROLES.ADMIN);
const requireAdmin = requireRole(ROLES.ADMIN);

module.exports = { requireRole, requireWriterOrAdmin, requireAdmin };

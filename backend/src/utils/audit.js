const prisma = require('../db');

/**
 * Persists an audit log entry. Never throws — an audit-log failure must not
 * block the primary action it's recording.
 */
async function recordAudit({
  userId = null,
  action,
  targetType,
  targetId = null,
  details = null,
  ipAddress = null,
  status = 'success',
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        status,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log', err);
  }
}

module.exports = { recordAudit };

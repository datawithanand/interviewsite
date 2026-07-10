const prisma = require('../db');

/**
 * Creates a notification. Never throws — a notification failure must not
 * block the primary action that triggered it.
 */
async function notify({ userId, actorId = null, type, message, relatedQuestionId = null, relatedNodeId = null }) {
  if (!userId || userId === actorId) return; // don't notify users about their own actions
  try {
    await prisma.notification.create({
      data: { userId, actorId, type, message, relatedQuestionId, relatedNodeId },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to create notification', err);
  }
}

module.exports = { notify };

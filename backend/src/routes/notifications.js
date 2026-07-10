const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../utils/validation');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const querySchema = z.object({
      unreadOnly: z.string().optional(),
      page: z.coerce.number().int().positive().optional().default(1),
      pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
    });
    const q = validate(querySchema, req.query);

    const where = { userId: req.user.id, ...(q.unreadOnly === 'true' ? { isRead: false } : {}) };

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { username: true } } },
      }),
    ]);

    res.json({
      total,
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        actorUsername: n.actor ? n.actor.username : null,
        relatedQuestionId: n.relatedQuestionId,
        relatedNodeId: n.relatedNodeId,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== req.user.id) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const { validate } = require('../utils/validation');

const router = express.Router();

router.use(authenticate, requireAdmin);

const querySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
});

router.get('/', async (req, res, next) => {
  try {
    const q = validate(querySchema, req.query);
    const where = {};
    if (q.userId) where.userId = q.userId;
    if (q.action) where.action = q.action;
    if (q.targetType) where.targetType = q.targetType;
    if (q.from || q.to) {
      where.timestamp = {};
      if (q.from) where.timestamp.gte = new Date(q.from);
      if (q.to) where.timestamp.lte = new Date(q.to);
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { username: true } } },
      }),
    ]);

    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      logs: logs.map((l) => ({
        id: l.id,
        username: l.user ? l.user.username : null,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        details: l.details ? JSON.parse(l.details) : null,
        ipAddress: l.ipAddress,
        status: l.status,
        timestamp: l.timestamp,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 5000,
      include: { user: { select: { username: true } } },
    });
    const { stringify } = require('csv-stringify/sync');
    const csv = stringify(
      logs.map((l) => ({
        timestamp: l.timestamp.toISOString(),
        username: l.user ? l.user.username : '',
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId || '',
        status: l.status,
        ipAddress: l.ipAddress || '',
        details: l.details || '',
      })),
      { header: true }
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireWriterOrAdmin } = require('../middleware/rbac');

const router = express.Router();

router.use(authenticate, requireWriterOrAdmin);

router.get('/', async (req, res, next) => {
  try {
    const [totalUsers, totalWriters, totalAdmins, totalQuestions, totalModules, byDifficulty, byFormat, mostViewed, recent, byCreator] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: 'WRITER' } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
        prisma.question.count(),
        prisma.module.count({ where: { isArchived: false } }),
        prisma.question.groupBy({ by: ['difficulty'], _count: true }),
        prisma.question.groupBy({ by: ['format'], _count: true }),
        prisma.question.findMany({ orderBy: { viewCount: 'desc' }, take: 10, select: { id: true, title: true, viewCount: true } }),
        prisma.question.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, createdAt: true, module: { select: { name: true } } },
        }),
        prisma.question.groupBy({ by: ['createdById'], _count: true }),
      ]);

    const questionsPerModule = await prisma.module.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, _count: { select: { questions: true } } },
    });

    res.json({
      users: { total: totalUsers, writers: totalWriters, admins: totalAdmins },
      totalQuestions,
      totalModules,
      questionsPerModule: questionsPerModule.map((m) => ({ module: m.name, count: m._count.questions })),
      difficultyDistribution: byDifficulty.map((d) => ({ difficulty: d.difficulty, count: d._count })),
      formatDistribution: byFormat.map((f) => ({ format: f.format, count: f._count })),
      mostViewedQuestions: mostViewed,
      recentQuestions: recent.map((q) => ({ id: q.id, title: q.title, module: q.module.name, createdAt: q.createdAt })),
      questionsByCreator: byCreator,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

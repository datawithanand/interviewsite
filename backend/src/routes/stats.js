const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireContentManagerOrAdmin } = require('../middleware/rbac');
const { ROLES } = require('../utils/enums');

const router = express.Router();

router.use(authenticate, requireContentManagerOrAdmin);

// Resolves the top-level ancestor ("Technology") name for every node id,
// using a single in-memory walk over all nodes rather than one DB round
// trip per node.
async function buildTechnologyLookup() {
  const allNodes = await prisma.node.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  const rootNameCache = new Map();
  function rootNameOf(nodeId) {
    if (rootNameCache.has(nodeId)) return rootNameCache.get(nodeId);
    let current = byId.get(nodeId);
    const visited = new Set();
    while (current && current.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    const name = current ? current.name : 'Unknown';
    rootNameCache.set(nodeId, name);
    return name;
  }
  return rootNameOf;
}

router.get('/', async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalContentManagers,
      totalAdmins,
      totalQuestions,
      totalTechnologies,
      byDifficulty,
      byFormat,
      mostViewed,
      recentQuestionsRaw,
      byCreatorRaw,
      recentUsersRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: ROLES.CONTENT_MANAGER } }),
      prisma.user.count({ where: { role: ROLES.ADMIN } }),
      prisma.question.count(),
      prisma.node.count({ where: { parentId: null, isArchived: false } }),
      prisma.question.groupBy({ by: ['difficulty'], _count: true }),
      prisma.question.groupBy({ by: ['format'], _count: true }),
      prisma.question.findMany({ orderBy: { viewCount: 'desc' }, take: 10, select: { id: true, title: true, viewCount: true } }),
      prisma.question.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, createdAt: true, node: { select: { name: true } } },
      }),
      prisma.question.groupBy({ by: ['createdById'], _count: true }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, username: true, role: true, createdAt: true } }),
    ]);

    const rootNameOf = await buildTechnologyLookup();

    const leafNodes = await prisma.node.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, _count: { select: { questions: true } } },
    });
    const questionsByNode = leafNodes.filter((n) => n._count.questions > 0).map((n) => ({ node: n.name, count: n._count.questions }));

    const byTechnology = new Map();
    for (const n of leafNodes) {
      if (n._count.questions === 0) continue;
      const tech = rootNameOf(n.id);
      byTechnology.set(tech, (byTechnology.get(tech) || 0) + n._count.questions);
    }

    const creatorIds = byCreatorRaw.map((c) => c.createdById).filter(Boolean);
    const creators = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, username: true } });
    const creatorNameMap = new Map(creators.map((c) => [c.id, c.username]));

    res.json({
      users: { total: totalUsers, active: activeUsers, contentManagers: totalContentManagers, admins: totalAdmins },
      totalQuestions,
      totalTechnologies,
      questionsByTechnology: [...byTechnology.entries()].map(([technology, count]) => ({ technology, count })),
      questionsByNode,
      difficultyDistribution: byDifficulty.map((d) => ({ difficulty: d.difficulty, count: d._count })),
      formatDistribution: byFormat.map((f) => ({ format: f.format, count: f._count })),
      mostViewedQuestions: mostViewed,
      recentQuestions: recentQuestionsRaw.map((q) => ({ id: q.id, title: q.title, node: q.node.name, createdAt: q.createdAt })),
      mostActiveContributors: byCreatorRaw
        .filter((c) => c.createdById)
        .map((c) => ({ userId: c.createdById, username: creatorNameMap.get(c.createdById) || 'unknown', count: c._count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recentlyRegisteredUsers: recentUsersRaw,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

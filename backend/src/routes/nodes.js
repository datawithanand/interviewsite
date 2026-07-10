const express = require('express');
const prisma = require('../db');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireContentManagerOrAdmin } = require('../middleware/rbac');
const { validate, nodeCreateSchema, nodeUpdateSchema } = require('../utils/validation');
const { recordAudit } = require('../utils/audit');
const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = require('../utils/enums');
const { hasActiveChildren, getDescendantIds, getNodePath } = require('../utils/nodeHelpers');

const router = express.Router();

async function serializeNode(node) {
  const [childCount, questionCount] = await Promise.all([
    prisma.node.count({ where: { parentId: node.id, isArchived: false } }),
    prisma.question.count({ where: { nodeId: node.id } }),
  ]);
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    parentId: node.parentId,
    isLeaf: childCount === 0,
    childCount,
    questionCount,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

async function assertUniqueSiblingName(name, parentId, excludeId) {
  const siblings = await prisma.node.findMany({
    where: { parentId: parentId ?? null, isArchived: false, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true },
  });
  const clash = siblings.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (clash) {
    const err = new Error('A sibling with this name already exists at this level.');
    err.statusCode = 409;
    throw err;
  }
}

// Flat list of every active node — the client assembles the tree from
// parentId. Simpler and cheaper than a recursive query for a tree that's
// realistically a few hundred nodes at most.
router.get('/', optionalAuthenticate, async (req, res, next) => {
  try {
    const nodes = await prisma.node.findMany({ where: { isArchived: false }, orderBy: { name: 'asc' } });
    const childCounts = await prisma.node.groupBy({ by: ['parentId'], where: { isArchived: false }, _count: true });
    const questionCounts = await prisma.question.groupBy({ by: ['nodeId'], _count: true });

    const childCountMap = new Map(childCounts.map((c) => [c.parentId, c._count]));
    const questionCountMap = new Map(questionCounts.map((c) => [c.nodeId, c._count]));

    res.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description,
        parentId: n.parentId,
        isLeaf: !childCountMap.get(n.id),
        childCount: childCountMap.get(n.id) || 0,
        questionCount: questionCountMap.get(n.id) || 0,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuthenticate, async (req, res, next) => {
  try {
    const node = await prisma.node.findUnique({ where: { id: req.params.id } });
    if (!node || node.isArchived) return res.status(404).json({ error: 'Node not found.' });

    const [serialized, path] = await Promise.all([serializeNode(node), getNodePath(node.id)]);
    res.json({ node: { ...serialized, path } });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const data = validate(nodeCreateSchema, req.body);

    if (data.parentId) {
      const parent = await prisma.node.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.isArchived) return res.status(404).json({ error: 'Parent node not found.' });
    }

    await assertUniqueSiblingName(data.name, data.parentId || null, null);

    const node = await prisma.node.create({
      data: { name: data.name, description: data.description || null, parentId: data.parentId || null, createdById: req.user.id },
    });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.CREATE,
      targetType: AUDIT_TARGET_TYPES.NODE,
      targetId: node.id,
      details: { name: node.name, parentId: node.parentId },
      ipAddress: req.ip,
    });

    res.status(201).json({ node: await serializeNode(node) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const data = validate(nodeUpdateSchema, req.body);
    const existing = await prisma.node.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isArchived) return res.status(404).json({ error: 'Node not found.' });

    if (data.name && data.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()) {
      await assertUniqueSiblingName(data.name, existing.parentId, existing.id);
    }

    const updated = await prisma.node.update({ where: { id: existing.id }, data });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.EDIT,
      targetType: AUDIT_TARGET_TYPES.NODE,
      targetId: updated.id,
      details: { changes: data },
      ipAddress: req.ip,
    });

    res.json({ node: await serializeNode(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireContentManagerOrAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.node.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isArchived) return res.status(404).json({ error: 'Node not found.' });

    // Soft delete — archives this node and every descendant so nothing is
    // silently orphaned or immediately unrecoverable.
    const idsToArchive = await getDescendantIds(existing.id);
    await prisma.node.updateMany({ where: { id: { in: idsToArchive } }, data: { isArchived: true } });

    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.DELETE,
      targetType: AUDIT_TARGET_TYPES.NODE,
      targetId: existing.id,
      details: { name: existing.name, archivedCount: idsToArchive.length },
      ipAddress: req.ip,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/can-attach-questions', optionalAuthenticate, async (req, res, next) => {
  try {
    const node = await prisma.node.findUnique({ where: { id: req.params.id } });
    if (!node || node.isArchived) return res.status(404).json({ error: 'Node not found.' });
    const hasChildren = await hasActiveChildren(node.id);
    res.json({ isLeaf: !hasChildren });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

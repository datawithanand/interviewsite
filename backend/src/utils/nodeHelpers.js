const prisma = require('../db');

// Returns true if the node has at least one non-archived child — i.e. it is
// NOT a leaf and therefore cannot have questions attached directly to it.
async function hasActiveChildren(nodeId) {
  const count = await prisma.node.count({ where: { parentId: nodeId, isArchived: false } });
  return count > 0;
}

// Depth-first collection of a node's own id plus every descendant id
// (including archived ones, so a delete/archive cascade is complete).
async function getDescendantIds(nodeId) {
  const ids = [nodeId];
  let frontier = [nodeId];
  while (frontier.length > 0) {
    // eslint-disable-next-line no-await-in-loop
    const children = await prisma.node.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

// Root-to-node array of { id, name }, used for breadcrumbs and export paths.
async function getNodePath(nodeId) {
  const path = [];
  let currentId = nodeId;
  // Depth is bounded in practice; guard against a corrupted cyclic parentId
  // (shouldn't happen given onDelete: Cascade, but fail safe rather than loop forever).
  for (let i = 0; i < 1000 && currentId; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const node = await prisma.node.findUnique({ where: { id: currentId }, select: { id: true, name: true, parentId: true } });
    if (!node) break;
    path.unshift({ id: node.id, name: node.name });
    currentId = node.parentId;
  }
  return path;
}

function pathToString(path) {
  return path.map((p) => p.name).join(' > ');
}

module.exports = { hasActiveChildren, getDescendantIds, getNodePath, pathToString };

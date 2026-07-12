import { useMemo } from 'react';
import QuestionListCard from './QuestionListCard';

// Finds the top-level Technology ancestor of any node (walks to parentId === null).
function technologyRootOf(nodeId, nodeMap) {
  let node = nodeMap.get(nodeId);
  while (node && node.parentId) node = nodeMap.get(node.parentId);
  return node;
}

// Descends from the Technology root through any single-child "pass-through"
// levels (e.g. ServiceNow -> ITSM, when ITSM is currently the only thing
// under ServiceNow) until it reaches a level that actually branches into
// multiple categories — that's the level whose children make sensible board
// columns. This keeps the board useful regardless of how deep a Technology's
// real submodules happen to be nested, and self-adjusts once more siblings
// (e.g. ITOM, HRSD, CSM) exist at any level.
function columnParentOf(technologyRoot, childrenOf) {
  let node = technologyRoot;
  while (node) {
    const kids = childrenOf.get(node.id) || [];
    if (kids.length !== 1) return node;
    node = kids[0];
  }
  return technologyRoot;
}

// Finds the ancestor of `nodeId` that is a direct child of `columnParentId` —
// this ancestor is the board column a question belongs in.
function columnAncestorOf(nodeId, columnParentId, nodeMap) {
  let node = nodeMap.get(nodeId);
  while (node && node.parentId !== columnParentId) {
    node = nodeMap.get(node.parentId);
  }
  return node;
}

export default function QuestionsKanbanBoard({
  questions,
  nodesById,
  canManage,
  onView,
  onToggleFavorite,
  onToggleComplete,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const columns = useMemo(() => {
    const childrenOf = new Map();
    for (const node of nodesById.values()) {
      const key = node.parentId || 'root';
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key).push(node);
    }

    const columnParentCache = new Map();
    const groups = new Map();

    for (const q of questions) {
      const leafId = q.node?.id;
      if (!leafId) continue;

      const techRoot = technologyRootOf(leafId, nodesById);
      if (!techRoot) continue;

      if (!columnParentCache.has(techRoot.id)) {
        columnParentCache.set(techRoot.id, columnParentOf(techRoot, childrenOf));
      }
      const columnParent = columnParentCache.get(techRoot.id);
      const column = columnAncestorOf(leafId, columnParent.id, nodesById) || columnParent;

      const key = column.id;
      if (!groups.has(key)) groups.set(key, { name: column.name, questions: [] });
      groups.get(key).questions.push(q);
    }

    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, nodesById]);

  if (columns.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.name} className="w-80 shrink-0 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col max-h-[75vh]">
          <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm">{col.name}</h3>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">{col.questions.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {col.questions.map((q) => (
              <QuestionListCard
                key={q.id}
                q={q}
                showNodeName
                canManage={canManage}
                onView={() => onView(q)}
                onToggleFavorite={() => onToggleFavorite(q)}
                onToggleComplete={() => onToggleComplete(q)}
                onEdit={() => onEdit(q)}
                onDuplicate={() => onDuplicate(q)}
                onDelete={() => onDelete(q)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

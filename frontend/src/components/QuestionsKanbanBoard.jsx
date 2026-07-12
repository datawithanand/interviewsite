import { useMemo } from 'react';
import QuestionListCard from './QuestionListCard';

// Finds the "submodule" ancestor of a leaf node — the node one level below
// its top-level Technology — regardless of how deep the leaf actually sits.
// If the leaf itself has no parent (a Technology being used as a leaf, with
// no submodules under it), it is its own column.
function submoduleAncestorOf(nodeId, nodeMap) {
  let node = nodeMap.get(nodeId);
  if (!node) return null;
  while (node.parentId && nodeMap.get(node.parentId)?.parentId) {
    node = nodeMap.get(node.parentId);
  }
  return node;
}

export default function QuestionsKanbanBoard({ questions, nodesById, canManage, onView, onToggleFavorite, onEdit, onDuplicate, onDelete }) {
  const columns = useMemo(() => {
    const groups = new Map();
    for (const q of questions) {
      const leafId = q.node?.id;
      const column = leafId ? submoduleAncestorOf(leafId, nodesById) : null;
      const key = column ? column.id : 'unfiled';
      if (!groups.has(key)) groups.set(key, { name: column ? column.name : 'Unfiled', questions: [] });
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

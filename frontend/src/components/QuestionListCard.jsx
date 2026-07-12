import { FORMAT_ICON, DIFFICULTY_COLOR } from '../constants';

// The single-question card used both by the plain List view and inside each
// Kanban column of the board view — kept in one place so both stay visually
// consistent and future edits don't have to happen twice.
export default function QuestionListCard({ q, showNodeName, canManage, onView, onToggleFavorite, onEdit, onDuplicate, onDelete }) {
  return (
    <div className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <button className="text-left flex-1 min-w-0" onClick={onView}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">#{q.serialNumber}</span>
            <span title={q.format}>{FORMAT_ICON[q.format]}</span>
            <span className="font-medium truncate">{q.title}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[q.difficulty]}`}>{q.difficulty}</span>
            {q.node && showNodeName && <span className="text-xs text-gray-400">{q.node.name}</span>}
            <span className="text-xs text-gray-400">by {q.createdByUsername || 'unknown'}</span>
            <span className="text-xs text-gray-400">updated {new Date(q.updatedAt).toLocaleDateString()}</span>
          </div>
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onToggleFavorite} title="Favorite" className="text-sm">
            {q.favoritedByMe ? '★' : '☆'}
          </button>
          <button onClick={onView} title="View" className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            View
          </button>
          {canManage && (
            <>
              <button onClick={onEdit} title="Edit" className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                ✏️
              </button>
              <button onClick={onDuplicate} title="Duplicate" className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                ⧉
              </button>
              <button onClick={onDelete} title="Delete" className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

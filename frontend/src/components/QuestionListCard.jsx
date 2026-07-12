import { FORMAT_ICON, DIFFICULTY_COLOR } from '../constants';

// The single-question card used both by the plain List view and inside each
// Kanban column of the board view — kept in one place so both stay visually
// consistent and future edits don't have to happen twice.
//
// The hover-reveal action row is positioned absolutely (not in normal flex
// flow) so it never steals width from the title — previously it sat inline
// even at opacity:0, which silently squeezed long titles down to a handful
// of visible characters in the narrower Kanban columns.
export default function QuestionListCard({
  q,
  showNodeName,
  canManage,
  onView,
  onToggleFavorite,
  onToggleComplete,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  return (
    <div className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-sm transition-shadow">
      <button className="w-full text-left pr-8" onClick={onView}>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete();
            }}
            title={q.completedByMe ? 'Mark incomplete' : 'Mark complete'}
            className="shrink-0 leading-none"
          >
            {q.completedByMe ? '✅' : '⬜'}
          </button>
          <span className="text-gray-400 shrink-0">#{q.serialNumber}</span>
          <span title={q.format} className="shrink-0">
            {FORMAT_ICON[q.format]}
          </span>
          <span className="font-medium truncate">{q.title}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[q.difficulty]}`}>{q.difficulty}</span>
          {q.completedByMe && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              ✓ Completed
            </span>
          )}
          {q.node && showNodeName && <span className="text-xs text-gray-400">{q.node.name}</span>}
          <span className="text-xs text-gray-400">by {q.createdByUsername || 'unknown'}</span>
          <span className="text-xs text-gray-400">updated {new Date(q.updatedAt).toLocaleDateString()}</span>
        </div>
      </button>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-md pl-1">
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
  );
}

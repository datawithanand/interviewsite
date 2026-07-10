import { useState } from 'react';
import { NavLink } from 'react-router-dom';

export default function NodeTreeItem({ node, childrenOf, depth, canManage, onAdd, onRename, onDelete }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);

  const children = (childrenOf.get(node.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const hasChildren = children.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-gray-100 dark:hover:bg-gray-700/50" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`w-4 h-4 flex items-center justify-center text-xs text-gray-400 shrink-0 ${hasChildren ? '' : 'invisible'}`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '−' : '+'}
        </button>

        {renaming ? (
          <div className="flex-1 flex gap-1 py-1">
            <input
              autoFocus
              className="flex-1 min-w-0 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-1.5 py-0.5 text-sm"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRename(node, renameValue).then(() => setRenaming(false))}
            />
            <button onClick={() => onRename(node, renameValue).then(() => setRenaming(false))} className="text-xs text-brand-600">
              Save
            </button>
          </div>
        ) : (
          <NavLink
            to={`/nodes/${node.id}`}
            className={({ isActive }) =>
              `flex-1 min-w-0 flex items-center justify-between py-1.5 text-sm rounded-md ${
                isActive ? 'text-brand-700 dark:text-brand-300 font-medium' : ''
              }`
            }
          >
            <span className="truncate">{node.name}</span>
            <span className="text-xs text-gray-400 shrink-0 ml-1">{node.isLeaf ? node.questionCount || '' : node.childCount}</span>
          </NavLink>
        )}

        {canManage && !renaming && (
          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen((v) => !v);
              }}
              className="opacity-0 group-hover:opacity-100 px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm overflow-hidden">
                <button
                  onClick={() => {
                    onAdd(node);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  + Add child node
                </button>
                <button
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Rename
                </button>
                <button
                  onClick={() => {
                    onDelete(node);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {children.map((child) => (
            <NodeTreeItem
              key={child.id}
              node={child}
              childrenOf={childrenOf}
              depth={depth + 1}
              canManage={canManage}
              onAdd={onAdd}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

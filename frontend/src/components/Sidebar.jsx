import { useEffect, useMemo, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, isAdmin, isContentManagerOrAdmin } from '../context/AuthContext';
import NodeTreeItem from './NodeTreeItem';
import Modal from './Modal';
import { on } from '../utils/events';

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const [nodes, setNodes] = useState([]);
  const [error, setError] = useState('');
  const [addModalParent, setAddModalParent] = useState(undefined); // undefined = closed, null = top-level, node = child of node
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canManage = isContentManagerOrAdmin(user);

  const loadNodes = useCallback(() => {
    api.get('/nodes').then((res) => setNodes(res.nodes)).catch(() => {});
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  // Question create/delete/move happen in QuestionsView, far from this
  // component — listen for the shared event instead of prop-drilling a
  // refresh callback, so the per-node counts shown below never go stale.
  useEffect(() => on('questions:changed', loadNodes), [loadNodes]);

  const childrenOf = useMemo(() => {
    const map = new Map();
    for (const n of nodes) {
      const key = n.parentId || 'root';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    }
    return map;
  }, [nodes]);

  const topLevel = (childrenOf.get('root') || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const submitAdd = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/nodes', { name: newName, parentId: addModalParent ? addModalParent.id : null });
      setNewName('');
      setAddModalParent(undefined);
      loadNodes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRename = async (node, newValue) => {
    await api.patch(`/nodes/${node.id}`, { name: newValue });
    loadNodes();
  };

  const confirmDelete = async () => {
    try {
      await api.del(`/nodes/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadNodes();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed md:static z-30 top-0 left-0 h-full w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Technologies</h2>
          {canManage && (
            <button
              onClick={() => setAddModalParent(null)}
              title="Add Technology"
              className="w-6 h-6 flex items-center justify-center rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
            >
              +
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-600 px-3 pt-2">{error}</p>}

        <nav className="flex-1 overflow-y-auto py-2">
          <div className="mx-2 mb-3 space-y-1">
            <NavLink
              to="/progress"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                  isActive ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`
              }
            >
              <span aria-hidden>📊</span> My Progress
            </NavLink>
          </div>

          <div className="mx-3 mb-2 border-t border-gray-200 dark:border-gray-700" />

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center justify-between mx-2 mb-2 rounded-lg px-3 py-1.5 text-sm ${
                isActive ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`
            }
          >
            All Questions
          </NavLink>

          {topLevel.length === 0 && (
            <p className="px-4 text-xs text-gray-400">
              No technologies yet.{canManage ? ' Click "+" above to add one.' : ''}
            </p>
          )}

          {topLevel.map((node) => (
            <NodeTreeItem
              key={node.id}
              node={node}
              childrenOf={childrenOf}
              depth={0}
              canManage={canManage}
              onAdd={(parent) => setAddModalParent(parent)}
              onRename={handleRename}
              onDelete={(n) => setDeleteTarget(n)}
            />
          ))}
        </nav>

        {canManage && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-700 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`
              }
            >
              <span aria-hidden>{isAdmin(user) ? '🛠️' : '📝'}</span>
              {isAdmin(user) ? 'Admin Panel' : 'Content Manager Panel'}
            </NavLink>
          </div>
        )}
      </aside>

      <Modal
        open={addModalParent !== undefined}
        onClose={() => setAddModalParent(undefined)}
        title={addModalParent ? `Add child under "${addModalParent.name}"` : 'Add Technology'}
      >
        <form onSubmit={submitAdd} className="space-y-3">
          <input
            autoFocus
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddModalParent(undefined)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
              Cancel
            </button>
            <button type="submit" className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white">
              Create
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete node?">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm">
              Delete <strong>{deleteTarget.name}</strong>
              {!deleteTarget.isLeaf ? ' and all of its submodules and questions' : deleteTarget.questionCount ? ` and its ${deleteTarget.questionCount} question(s)` : ''}?
              This can only be undone by an administrator restoring from the database.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white">
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, isWriterOrAdmin } from '../context/AuthContext';

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const [modules, setModules] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');

  const loadModules = useCallback(() => {
    api.get('/modules').then((res) => setModules(res.modules)).catch(() => {});
  }, []);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const canManage = isWriterOrAdmin(user);

  const createModule = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/modules', { name: newName });
      setNewName('');
      setShowAdd(false);
      loadModules();
    } catch (err) {
      setError(err.message);
    }
  };

  const renameModule = async (id) => {
    try {
      await api.patch(`/modules/${id}`, { name: renameValue });
      setRenamingId(null);
      loadModules();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteModule = async (id, name) => {
    if (!window.confirm(`Delete module "${name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/modules/${id}`);
      setMenuOpenId(null);
      loadModules();
    } catch (err) {
      setError(err.message);
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
          <h2 className="font-semibold text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Modules</h2>
          {canManage && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              title="Add module"
              className="w-6 h-6 flex items-center justify-center rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
            >
              +
            </button>
          )}
        </div>

        {showAdd && (
          <form onSubmit={createModule} className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <input
              autoFocus
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
              placeholder="Module name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-xs py-1.5">
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-md text-xs py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-xs text-red-600 px-3 pt-2">{error}</p>}

        <nav className="flex-1 overflow-y-auto py-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center justify-between mx-2 mb-1 rounded-lg px-3 py-2 text-sm ${
                isActive ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`
            }
          >
            All Questions
          </NavLink>
          {modules.map((m) => (
            <div key={m.id} className="mx-2 mb-1 group relative">
              {renamingId === m.id ? (
                <div className="flex gap-1 px-1">
                  <input
                    autoFocus
                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-sm"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                  <button onClick={() => renameModule(m.id)} className="text-xs text-brand-600">
                    Save
                  </button>
                </div>
              ) : (
                <NavLink
                  to={`/modules/${m.id}`}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`
                  }
                >
                  <span className="truncate">{m.name}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">{m.questionCount}</span>
                    {canManage && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === m.id ? null : m.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        ⋯
                      </button>
                    )}
                  </span>
                </NavLink>
              )}
              {menuOpenId === m.id && (
                <div className="absolute right-0 top-full z-10 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm overflow-hidden">
                  <button
                    onClick={() => {
                      setRenamingId(m.id);
                      setRenameValue(m.name);
                      setMenuOpenId(null);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => deleteModule(m.id, m.name)}
                    className="w-full text-left px-3 py-2 text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

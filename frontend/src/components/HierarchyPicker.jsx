import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const NEW_OPTION = '__new__';

const LEVEL_LABELS = ['Technology', 'Submodule', 'Child module'];
function labelForLevel(level) {
  return LEVEL_LABELS[level] || `Level ${level + 1}`;
}

/**
 * Reusable hierarchy navigator used both for admins picking where to create
 * a new node, and for writers picking which leaf node a question attaches
 * to. Levels 0 (Technology) and 1 (Submodule) are required; everything
 * beyond that — matching the "optional child module" spec, generalized to
 * unlimited depth — is optional.
 *
 * mode="pickLeaf": onSelect(nodeId) fires when the user confirms a leaf.
 * mode="createNode": onSelect(parentId | null) fires when the user confirms
 *   where a brand-new node should be created (null = new top-level Technology).
 */
export default function HierarchyPicker({ mode, onSelect, initialNodeId }) {
  const [allNodes, setAllNodes] = useState([]);
  const [path, setPath] = useState([]); // array of node objects, root to current
  const [pendingNew, setPendingNew] = useState({}); // level -> draft name being typed
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/nodes').then((res) => setAllNodes(res.nodes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialNodeId || allNodes.length === 0 || path.length > 0) return;
    const chain = [];
    let current = allNodes.find((n) => n.id === initialNodeId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? allNodes.find((n) => n.id === current.parentId) : null;
    }
    if (chain.length) setPath(chain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, initialNodeId]);

  const childrenOf = useMemo(() => {
    const map = new Map();
    for (const n of allNodes) {
      const key = n.parentId || 'root';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    }
    return map;
  }, [allNodes]);

  const levelOptions = (level) => {
    const parent = level === 0 ? null : path[level - 1];
    const key = parent ? parent.id : 'root';
    return (childrenOf.get(key) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  };

  const selectExisting = (level, node) => {
    setPath((prev) => [...prev.slice(0, level), node]);
    setPendingNew({});
    setError('');
  };

  const startNew = (level) => {
    setPendingNew({ level, name: '' });
  };

  const confirmNew = async (level) => {
    const name = (pendingNew.name || '').trim();
    if (!name) return;
    setError('');
    try {
      const parent = level === 0 ? null : path[level - 1];
      const res = await api.post('/nodes', { name, parentId: parent ? parent.id : null });
      setAllNodes((prev) => [...prev, res.node]);
      setPath((prev) => [...prev.slice(0, level), res.node]);
      setPendingNew({});
    } catch (err) {
      setError(err.message);
    }
  };

  const currentNode = path[path.length - 1];
  const isLeafCandidate = currentNode && currentNode.isLeaf;
  const canGoDeeper = !currentNode || currentNode.isLeaf; // a leaf can still grow a child

  const maxRenderedLevel = Math.max(path.length, mode === 'createNode' ? path.length : path.length + (canGoDeeper ? 1 : 0));

  return (
    <div className="space-y-3">
      {Array.from({ length: maxRenderedLevel + 1 }).map((_, level) => {
        if (level > path.length) return null;
        const options = levelOptions(level);
        const selected = path[level];
        const isPendingHere = pendingNew.level === level;
        const parentExists = level === 0 || !!path[level - 1];
        if (!parentExists) return null;

        return (
          <div key={level}>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {labelForLevel(level)}
              {level >= 2 && <span className="text-gray-400"> (optional)</span>}
            </label>
            {!isPendingHere ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
                  value={selected ? selected.id : ''}
                  onChange={(e) => {
                    if (e.target.value === NEW_OPTION) startNew(level);
                    else {
                      const node = options.find((o) => o.id === e.target.value);
                      if (node) selectExisting(level, node);
                    }
                  }}
                >
                  <option value="" disabled>
                    Select {labelForLevel(level).toLowerCase()}…
                  </option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} {o.questionCount ? `(${o.questionCount})` : ''}
                    </option>
                  ))}
                  <option value={NEW_OPTION}>+ Create new {labelForLevel(level).toLowerCase()}</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
                  placeholder={`New ${labelForLevel(level).toLowerCase()} name`}
                  value={pendingNew.name}
                  onChange={(e) => setPendingNew({ level, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmNew(level);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => confirmNew(level)}
                  className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3"
                >
                  Add
                </button>
                <button type="button" onClick={() => setPendingNew({})} className="text-xs px-2 text-gray-500">
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {mode === 'pickLeaf' && currentNode && isLeafCandidate && (
        <button
          type="button"
          onClick={() => onSelect(currentNode.id)}
          className="w-full text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2"
        >
          Use "{path.map((p) => p.name).join(' > ')}" for this question
        </button>
      )}

      {mode === 'createNode' && (
        <button
          type="button"
          onClick={() => onSelect(currentNode ? currentNode.id : null)}
          disabled={path.length < 0}
          className="w-full text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2"
        >
          Create new node under {currentNode ? `"${path.map((p) => p.name).join(' > ')}"` : 'top level (new Technology)'}
        </button>
      )}
    </div>
  );
}

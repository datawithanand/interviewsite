import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, isContentManagerOrAdmin } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DIFFICULTIES, FORMATS } from '../constants';
import QuestionFormModal from '../components/QuestionFormModal';
import QuestionDetailModal from '../components/QuestionDetailModal';
import QuestionListCard from '../components/QuestionListCard';
import QuestionsKanbanBoard from '../components/QuestionsKanbanBoard';
import { emit } from '../utils/events';

const RECENT_SEARCHES_KEY = 'recentSearches';
const MAX_RECENT_SEARCHES = 10;

function loadRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function pushRecentSearch(term) {
  if (!term || !term.trim()) return;
  const existing = loadRecentSearches().filter((t) => t !== term);
  const updated = [term, ...existing].slice(0, MAX_RECENT_SEARCHES);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

export default function QuestionsView() {
  const { nodeId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const canManage = isContentManagerOrAdmin(user);

  const [nodePath, setNodePath] = useState(null);
  const [nodeIsLeaf, setNodeIsLeaf] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState('serial');
  const [view, setView] = useState('list');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [completedFilter, setCompletedFilter] = useState(''); // '' | 'true' | 'false'
  const [allNodes, setAllNodes] = useState([]);
  const [techFilter, setTechFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const [savedSearches, setSavedSearches] = useState([]);
  const [savedSearchOpen, setSavedSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches());

  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!nodeId) {
      setNodePath(null);
      setNodeIsLeaf(false);
      return;
    }
    api
      .get(`/nodes/${nodeId}`)
      .then((res) => {
        setNodePath(res.node.path);
        setNodeIsLeaf(res.node.isLeaf);
      })
      .catch(() => {
        setNodePath(null);
        setNodeIsLeaf(false);
      });
  }, [nodeId]);

  useEffect(() => {
    api.get('/nodes').then((res) => setAllNodes(res.nodes)).catch(() => {});
  }, []);

  const nodesById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const technologies = useMemo(
    () => allNodes.filter((n) => !n.parentId).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [allNodes]
  );

  // The Jira-style board only makes sense scoped to one Technology at a
  // time (its example is "ITSM" then "ITOM", both submodules of the same
  // technology) — so switching into Card view defaults to the first one
  // if the viewer hasn't already picked a Technology or a specific node.
  useEffect(() => {
    if (view === 'card' && !nodeId && !techFilter && technologies.length > 0) {
      setTechFilter(technologies[0].id);
    }
  }, [view, nodeId, techFilter, technologies]);

  const loadSavedSearches = useCallback(() => {
    api.get('/saved-searches').then((res) => setSavedSearches(res.savedSearches)).catch(() => {});
  }, []);

  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  // Cmd/Ctrl+K focuses the search box from anywhere on the page.
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    const scopeNodeId = nodeId || techFilter;
    if (scopeNodeId) params.set('nodeId', scopeNodeId);
    if (search) params.set('q', search);
    if (difficulty) params.set('difficulty', difficulty);
    if (format) params.set('format', format);
    if (favoritesOnly) params.set('favoritesOnly', 'true');
    if (completedFilter) params.set('completed', completedFilter);
    params.set('sort', sort);
    params.set('pageSize', '100');

    api
      .get(`/questions?${params.toString()}`)
      .then((res) => {
        setQuestions(res.questions);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [nodeId, techFilter, search, difficulty, format, sort, favoritesOnly, completedFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (search.trim()) {
        pushRecentSearch(search.trim());
        setRecentSearches(loadRecentSearches());
      }
    }, 1200); // debounce so every keystroke doesn't spam history
    return () => clearTimeout(handle);
  }, [search]);

  const toggleFavorite = async (q) => {
    if (q.favoritedByMe) await api.del(`/questions/${q.id}/favorite`);
    else await api.post(`/questions/${q.id}/favorite`, {});
    load();
  };

  const toggleComplete = async (q) => {
    if (q.completedByMe) await api.del(`/questions/${q.id}/complete`);
    else await api.post(`/questions/${q.id}/complete`, {});
    load();
  };

  const deleteQuestion = async (q) => {
    if (!window.confirm(`Delete question "${q.title}"?`)) return;
    await api.del(`/questions/${q.id}`);
    load();
    emit('questions:changed');
    showToast(`Deleted "${q.title}"`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await api.post('/questions', {
              nodeId: q.nodeId,
              serialNumber: q.serialNumber,
              title: q.title,
              format: q.format,
              codeLanguage: q.codeLanguage,
              questionText: q.questionText,
              questionCode: q.questionCode,
              answerText: q.answerText,
              answerCode: q.answerCode,
              difficulty: q.difficulty,
              tags: q.tags,
            });
            load();
            emit('questions:changed');
          } catch {
            showToast('Could not undo — serial number was reused since deletion.', { durationMs: 5000 });
          }
        },
      },
    });
  };

  const duplicateQuestion = async (q) => {
    await api.post(`/questions/${q.id}/duplicate`, {});
    load();
    emit('questions:changed');
  };

  const currentFilters = { nodeId, difficulty, format, sort, favoritesOnly, q: search };

  const applySavedSearch = (s) => {
    setDifficulty(s.filters.difficulty || '');
    setFormat(s.filters.format || '');
    setSort(s.filters.sort || 'serial');
    setFavoritesOnly(!!s.filters.favoritesOnly);
    setSearch(s.filters.q || '');
    setSavedSearchOpen(false);
  };

  const saveCurrentSearch = async () => {
    const name = window.prompt('Name this search:');
    if (!name) return;
    try {
      await api.post('/saved-searches', { name, filters: currentFilters });
      loadSavedSearches();
    } catch (err) {
      showToast(err.message, { durationMs: 5000 });
    }
  };

  const deleteSavedSearch = async (id) => {
    await api.del(`/saved-searches/${id}`);
    loadSavedSearches();
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Interview Questions</h1>
        {nodePath ? (
          <nav className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
            {nodePath.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300 dark:text-gray-600">›</span>}
                <span className={i === nodePath.length - 1 ? 'font-medium text-gray-700 dark:text-gray-200' : ''}>{p.name}</span>
              </span>
            ))}
          </nav>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">All Technologies</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="relative flex-1 min-w-[180px]">
          <input
            ref={searchInputRef}
            list="recent-searches"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm pr-14"
            placeholder="Search title, text, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <datalist id="recent-searches">
            {recentSearches.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-400 pointer-events-none">
            ⌘K
          </kbd>
        </div>
        {!nodeId && (
          <select
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
          >
            <option value="">All technologies</option>
            {technologies.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="">All formats</option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="serial">Serial #</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="mostViewed">Most viewed</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
          Favorites
        </label>
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={completedFilter}
          onChange={(e) => setCompletedFilter(e.target.value)}
        >
          <option value="">All questions</option>
          <option value="false">Not completed</option>
          <option value="true">Completed</option>
        </select>

        <div className="relative">
          <button
            onClick={() => setSavedSearchOpen((v) => !v)}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600"
          >
            Saved ({savedSearches.length})
          </button>
          {savedSearchOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 text-sm">
              <button onClick={saveCurrentSearch} className="w-full text-left px-3 py-2 text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700">
                + Save current search
              </button>
              {savedSearches.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No saved searches yet.</p>}
              {savedSearches.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <button onClick={() => applySavedSearch(s)} className="text-left flex-1 truncate">
                    {s.name}
                  </button>
                  <button onClick={() => deleteSavedSearch(s.id)} className="text-xs text-red-500 ml-2">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 text-xs">
          <button
            onClick={() => setView('list')}
            className={`px-2 py-1.5 ${view === 'list' ? 'bg-brand-600 text-white' : ''}`}
          >
            List
          </button>
          <button
            onClick={() => setView('card')}
            className={`px-2 py-1.5 ${view === 'card' ? 'bg-brand-600 text-white' : ''}`}
          >
            Card
          </button>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingQuestion(null);
              setFormOpen(true);
            }}
            className="ml-auto bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            + Add Question
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && questions.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">
            {search || difficulty || format || favoritesOnly ? 'No questions match your filters.' : 'No questions here yet.'}
          </p>
          {canManage && !search && !difficulty && !format && !favoritesOnly && (
            <button onClick={() => setFormOpen(true)} className="mt-2 text-sm text-brand-600 hover:underline">
              + Add the first question
            </button>
          )}
        </div>
      )}

      {questions.length > 0 && <p className="text-xs text-gray-400 mb-2">{total} question(s)</p>}

      {view === 'card' ? (
        <QuestionsKanbanBoard
          questions={questions}
          nodesById={nodesById}
          canManage={canManage}
          onView={(q) => setDetailId(q.id)}
          onToggleFavorite={toggleFavorite}
          onToggleComplete={toggleComplete}
          onEdit={(q) => {
            setEditingQuestion(q);
            setFormOpen(true);
          }}
          onDuplicate={duplicateQuestion}
          onDelete={deleteQuestion}
        />
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <QuestionListCard
              key={q.id}
              q={q}
              showNodeName={!nodeId}
              canManage={canManage}
              onView={() => setDetailId(q.id)}
              onToggleFavorite={() => toggleFavorite(q)}
              onToggleComplete={() => toggleComplete(q)}
              onEdit={() => {
                setEditingQuestion(q);
                setFormOpen(true);
              }}
              onDuplicate={() => duplicateQuestion(q)}
              onDelete={() => deleteQuestion(q)}
            />
          ))}
        </div>
      )}

      <QuestionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          load();
          emit('questions:changed');
        }}
        // Only pre-fill the location when viewing an actual leaf — a
        // Technology/Submodule can't hold questions directly, so the modal
        // should prompt for a real leaf instead of defaulting to one that
        // would fail on save.
        nodeId={nodeIsLeaf ? nodeId : undefined}
        question={editingQuestion}
      />
      <QuestionDetailModal open={!!detailId} onClose={() => setDetailId(null)} questionId={detailId} />
    </div>
  );
}

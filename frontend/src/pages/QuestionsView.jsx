import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, isWriterOrAdmin } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DIFFICULTIES, FORMATS, FORMAT_ICON, DIFFICULTY_COLOR } from '../constants';
import QuestionFormModal from '../components/QuestionFormModal';
import QuestionDetailModal from '../components/QuestionDetailModal';

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
  const { moduleId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const canManage = isWriterOrAdmin(user);

  const [modules, setModules] = useState([]);
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

  const [formOpen, setFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const [savedSearches, setSavedSearches] = useState([]);
  const [savedSearchOpen, setSavedSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches());

  const searchInputRef = useRef(null);

  useEffect(() => {
    api.get('/modules').then((res) => setModules(res.modules));
  }, [formOpen]);

  const loadSavedSearches = useCallback(() => {
    api.get('/saved-searches').then((res) => setSavedSearches(res.savedSearches));
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
    if (moduleId) params.set('moduleId', moduleId);
    if (search) params.set('q', search);
    if (difficulty) params.set('difficulty', difficulty);
    if (format) params.set('format', format);
    if (favoritesOnly) params.set('favoritesOnly', 'true');
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
  }, [moduleId, search, difficulty, format, sort, favoritesOnly]);

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

  const currentModule = modules.find((m) => m.id === moduleId);

  const toggleFavorite = async (q) => {
    if (q.favoritedByMe) await api.del(`/questions/${q.id}/favorite`);
    else await api.post(`/questions/${q.id}/favorite`, {});
    load();
  };

  const deleteQuestion = async (q) => {
    if (!window.confirm(`Delete question "${q.title}"?`)) return;
    await api.del(`/questions/${q.id}`);
    load();
    showToast(`Deleted "${q.title}"`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await api.post('/questions', {
              moduleId: q.moduleId,
              serialNumber: q.serialNumber,
              title: q.title,
              content: q.content,
              format: q.format,
              codeLanguage: q.codeLanguage,
              answer: q.answer,
              difficulty: q.difficulty,
              tags: q.tags,
            });
            load();
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
  };

  const currentFilters = { moduleId, difficulty, format, sort, favoritesOnly, q: search };

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
        <h1 className="text-xl font-semibold">ServiceNow Interview Questions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{currentModule ? currentModule.name : 'All Modules'}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="relative flex-1 min-w-[180px]">
          <input
            ref={searchInputRef}
            list="recent-searches"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm pr-14"
            placeholder="Search title, content, answer…"
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
      {!loading && questions.length === 0 && <p className="text-sm text-gray-500">No questions found.</p>}

      <p className="text-xs text-gray-400 mb-2">{total} question(s)</p>

      <div className={view === 'card' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-2'}>
        {questions.map((q) => (
          <div
            key={q.id}
            className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <button className="text-left flex-1" onClick={() => setDetailId(q.id)}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">#{q.serialNumber}</span>
                  <span title={q.format}>{FORMAT_ICON[q.format]}</span>
                  <span className="font-medium truncate">{q.title}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLOR[q.difficulty]}`}>
                    {q.difficulty}
                  </span>
                  {q.module && !moduleId && <span className="text-xs text-gray-400">{q.module.name}</span>}
                  <span className="text-xs text-gray-400">by {q.createdByUsername || 'unknown'}</span>
                  <span className="text-xs text-gray-400">
                    updated {new Date(q.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => toggleFavorite(q)} title="Favorite" className="text-sm">
                  {q.favoritedByMe ? '★' : '☆'}
                </button>
                <button onClick={() => setDetailId(q.id)} title="View" className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  View
                </button>
                {canManage && (
                  <>
                    <button
                      onClick={() => {
                        setEditingQuestion(q);
                        setFormOpen(true);
                      }}
                      title="Edit"
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => duplicateQuestion(q)}
                      title="Duplicate"
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      ⧉
                    </button>
                    <button
                      onClick={() => deleteQuestion(q)}
                      title="Delete"
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <QuestionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        modules={modules}
        moduleId={moduleId}
        question={editingQuestion}
      />
      <QuestionDetailModal open={!!detailId} onClose={() => setDetailId(null)} questionId={detailId} />
    </div>
  );
}

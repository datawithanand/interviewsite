import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth, isAdmin } from '../context/AuthContext';

export default function CommentThread({ questionId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api
      .get(`/questions/${questionId}/comments`)
      .then((res) => setComments(res.comments))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    if (questionId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/questions/${questionId}/comments`, { content: text.trim() });
      setText('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    await api.del(`/comments/${id}`);
    load();
  };

  const togglePin = async (comment) => {
    await api.patch(`/comments/${comment.id}/pin`, { isPinned: !comment.isPinned });
    load();
  };

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Discussion ({comments.length})</h4>

      <div className="space-y-2 max-h-56 overflow-y-auto mb-3">
        {comments.length === 0 && <p className="text-xs text-gray-500">No comments yet — start the discussion.</p>}
        {comments.map((c) => (
          <div
            key={c.id}
            className={`text-xs rounded-lg px-3 py-2 ${
              c.isPinned
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-gray-50 dark:bg-gray-900/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {c.username} {c.isPinned && <span title="Pinned">📌</span>}
              </span>
              <span className="text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
            <div className="flex gap-2 mt-1">
              {(c.userId === user.id || isAdmin(user)) && (
                <button onClick={() => remove(c.id)} className="text-red-500 hover:underline">
                  Delete
                </button>
              )}
              {isAdmin(user) && (
                <button onClick={() => togglePin(c)} className="text-gray-500 hover:underline">
                  {c.isPinned ? 'Unpin' : 'Pin'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <form onSubmit={submit} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
          placeholder="Add a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={submitting}
          className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-3 py-1.5"
        >
          Post
        </button>
      </form>
    </div>
  );
}

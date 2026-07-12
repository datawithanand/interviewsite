import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth, isAdmin, isContentManagerOrAdmin } from '../context/AuthContext';

function buildTree(comments) {
  const byId = new Map(comments.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).children.push(c);
    else roots.push(c);
  }
  return roots;
}

function CommentNode({ comment, depth, onReload }) {
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showLikers, setShowLikers] = useState(false);

  const canDelete = comment.userId === user.id || isContentManagerOrAdmin(user);

  const remove = async () => {
    if (!window.confirm('Delete this comment?')) return;
    await api.del(`/comments/${comment.id}`);
    onReload();
  };

  const togglePin = async () => {
    await api.patch(`/comments/${comment.id}/pin`, { isPinned: !comment.isPinned });
    onReload();
  };

  const toggleLike = async () => {
    await api.post(`/comments/${comment.id}/like`, {});
    onReload();
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/questions/${comment.questionId}/comments`, { content: replyText.trim(), parentId: comment.id });
      setReplyText('');
      setReplying(false);
      onReload();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={depth > 0 ? 'mt-2 pl-3 border-l border-gray-200 dark:border-gray-700' : 'mt-2'}>
      <div
        className={`text-xs rounded-lg px-3 py-2 ${
          comment.isPinned
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
            : 'bg-gray-50 dark:bg-gray-900/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {comment.username} {comment.isPinned && <span title="Pinned">📌</span>}
          </span>
          <span className="text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap">{comment.content}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="relative" onMouseEnter={() => setShowLikers(true)} onMouseLeave={() => setShowLikers(false)}>
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 hover:underline ${comment.likedByMe ? 'text-red-500' : 'text-gray-500'}`}
            >
              <span>{comment.likedByMe ? '♥' : '♡'}</span>
              {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
            </button>
            {showLikers && comment.likedByUsernames?.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 whitespace-nowrap bg-gray-900 text-white text-[11px] rounded-md px-2 py-1 shadow-lg z-10">
                Liked by {comment.likedByUsernames.join(', ')}
              </div>
            )}
          </div>
          <button onClick={() => setReplying((v) => !v)} className="text-gray-500 hover:underline">
            Reply
          </button>
          {canDelete && (
            <button onClick={remove} className="text-red-500 hover:underline">
              Delete
            </button>
          )}
          {isAdmin(user) && (
            <button onClick={togglePin} className="text-gray-500 hover:underline">
              {comment.isPinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={submitReply} className="flex gap-2 mt-2">
            <input
              autoFocus
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-xs"
              placeholder={`Reply to ${comment.username}…`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <button
              type="submit"
              disabled={submitting}
              className="text-xs bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-2 py-1"
            >
              Reply
            </button>
          </form>
        )}
      </div>

      {comment.children.length > 0 && (
        <div>
          {comment.children.map((child) => (
            <CommentNode key={child.id} comment={child} depth={depth + 1} onReload={onReload} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ questionId }) {
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

  const tree = useMemo(() => buildTree(comments), [comments]);

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

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Discussion ({comments.length})</h4>

      <div className="max-h-64 overflow-y-auto mb-3">
        {tree.length === 0 && <p className="text-xs text-gray-500">No comments yet — start the discussion.</p>}
        {tree.map((c) => (
          <CommentNode key={c.id} comment={c} depth={0} onReload={load} />
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

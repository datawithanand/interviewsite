import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import QuestionCardBody from '../components/QuestionCardBody';

const RATING_BUTTONS = [
  { rating: 'AGAIN', label: 'Again', hint: 'Didn’t know it', className: 'bg-red-600 hover:bg-red-700' },
  { rating: 'HARD', label: 'Hard', hint: 'Took a while', className: 'bg-orange-500 hover:bg-orange-600' },
  { rating: 'GOOD', label: 'Good', hint: 'Got it', className: 'bg-sky-600 hover:bg-sky-700' },
  { rating: 'EASY', label: 'Easy', hint: 'Instantly', className: 'bg-emerald-600 hover:bg-emerald-700' },
];

export default function Practice() {
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, xp: 0 });

  const load = useCallback(() => {
    api
      .get('/progress/queue?limit=20')
      .then((res) => {
        setQueue(res.queue);
        setIndex(0);
        setRevealed(false);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function onKey(e) {
      if (!queue || index >= queue.length) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed((r) => !r);
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const btn = RATING_BUTTONS[Number(e.key) - 1];
        if (btn) rate(btn.rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index, revealed]);

  const rate = async (rating) => {
    const current = queue[index];
    try {
      const res = await api.post(`/progress/${current.id}/review`, { rating });
      setSessionStats((s) => ({ reviewed: s.reviewed + 1, xp: s.xp + res.xpEarned }));
      if (res.newBadges.length > 0) {
        setToast({ type: 'badge', badges: res.newBadges });
      } else {
        setToast({ type: 'xp', xp: res.xpEarned, rating });
      }
      setRevealed(false);
      setIndex((i) => i + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!queue) return <p className="text-sm text-gray-500">Loading…</p>;

  const current = queue[index];
  const done = index >= queue.length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Practice Review</h1>
        {!done && (
          <span className="text-sm text-gray-500">
            {index + 1} / {queue.length}
          </span>
        )}
      </div>

      {sessionStats.reviewed > 0 && (
        <p className="text-xs text-gray-400">
          {sessionStats.reviewed} reviewed this session · +{sessionStats.xp} XP
        </p>
      )}

      {toast && (
        <div className="rounded-lg px-3 py-2 text-sm bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
          {toast.type === 'badge'
            ? `🎉 New badge unlocked: ${toast.badges.map((b) => `${b.icon} ${b.name}`).join(', ')}`
            : `+${toast.xp} XP`}
        </div>
      )}

      {queue.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-4xl mb-2">🎉</p>
          <p className="font-medium">You're all caught up!</p>
          <p className="text-sm text-gray-500 mt-1">No questions are due for review right now.</p>
          <Link to="/" className="inline-block mt-4 text-sm text-brand-600 hover:underline">
            Browse questions
          </Link>
        </div>
      )}

      {!done && current && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <QuestionCardBody question={current} showAnswer={revealed} />

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="mt-6 w-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Reveal Answer <span className="text-white/50">(space)</span>
            </button>
          ) : (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RATING_BUTTONS.map((b, i) => (
                <button
                  key={b.rating}
                  onClick={() => rate(b.rating)}
                  className={`${b.className} text-white rounded-lg py-2.5 text-sm font-medium transition-colors`}
                  title={b.hint}
                >
                  {b.label} <span className="text-white/60 text-xs">({i + 1})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {done && queue.length > 0 && (
        <div className="text-center py-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-4xl mb-2">✅</p>
          <p className="font-medium">Session complete — {sessionStats.reviewed} reviewed, +{sessionStats.xp} XP</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={load} className="text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2">
              Keep going
            </button>
            <Link to="/progress" className="text-sm bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
              View progress
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

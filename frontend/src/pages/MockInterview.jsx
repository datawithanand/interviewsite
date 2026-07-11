import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import QuestionCardBody from '../components/QuestionCardBody';

const SELF_RATINGS = [
  { rating: 'CORRECT', label: 'Correct', className: 'bg-emerald-600 hover:bg-emerald-700' },
  { rating: 'PARTIAL', label: 'Partial', className: 'bg-amber-500 hover:bg-amber-600' },
  { rating: 'INCORRECT', label: 'Incorrect', className: 'bg-red-600 hover:bg-red-700' },
  { rating: 'SKIPPED', label: 'Skip', className: 'bg-gray-500 hover:bg-gray-600' },
];

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SetupScreen({ nodes, onStart, error }) {
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [difficulty, setDifficulty] = useState('');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onStart({ nodeIds: selectedNodes, difficulty: difficulty || undefined, count: Number(count) });
    setBusy(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">🎤 Mock Interview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Timed, self-graded practice that feels like the real thing.</p>
      </div>

      <form onSubmit={submit} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Technologies</label>
          <select
            multiple
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm h-28"
            value={selectedNodes}
            onChange={(e) => setSelectedNodes(Array.from(e.target.selectedOptions, (o) => o.value))}
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Leave empty to draw from the entire question bank.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Difficulty</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="">Any</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Number of questions</label>
            <input
              type="number"
              min={1}
              max={50}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold"
        >
          {busy ? 'Starting…' : 'Start Mock Interview'}
        </button>
      </form>
    </div>
  );
}

function SessionScreen({ session, onFinished }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [remaining, setRemaining] = useState(session.remainingSeconds);
  const [answers, setAnswers] = useState({});
  const startedRef = useRef(Date.now());
  const finishingRef = useRef(false);

  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const res = await api.post(`/mock-interviews/${session.id}/finish`);
    onFinished(res);
  };

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          finish();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = session.questions[index];
  const isLast = index === session.questions.length - 1;
  // CODE/BOTH questions have no separate model answer to hide.
  const needsReveal = current?.format === 'TEXT';
  const effectivelyRevealed = revealed || !needsReveal;

  const answer = async (selfRating) => {
    const timeSpentSeconds = Math.round((Date.now() - startedRef.current) / 1000);
    await api.post(`/mock-interviews/${session.id}/answer`, { questionId: current.id, selfRating, timeSpentSeconds });
    setAnswers((a) => ({ ...a, [current.id]: selfRating }));
    if (isLast) {
      finish();
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
      startedRef.current = Date.now();
    }
  };

  const low = remaining <= 30;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Question {index + 1} / {session.questions.length}
        </span>
        <span className={`text-lg font-mono font-semibold ${low ? 'text-red-600 animate-pulse' : ''}`}>{formatClock(remaining)}</span>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <QuestionCardBody question={current} showAnswer={effectivelyRevealed} />

        {!effectivelyRevealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="mt-6 w-full bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white rounded-lg py-2.5 text-sm font-medium"
          >
            Reveal Model Answer
          </button>
        ) : (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SELF_RATINGS.map((r) => (
              <button key={r.rating} onClick={() => answer(r.rating)} className={`${r.className} text-white rounded-lg py-2.5 text-sm font-medium`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        End interview early
      </button>
    </div>
  );
}

function ResultsScreen({ result, onRestart }) {
  return (
    <div className="max-w-lg mx-auto space-y-4 text-center">
      <p className="text-5xl">{result.score >= 80 ? '🏆' : result.score >= 50 ? '👍' : '💪'}</p>
      <h1 className="text-2xl font-bold">{result.score}% score</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">+{result.xpEarned} XP earned this session</p>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg p-3">
          <p className="text-lg font-semibold">{result.correctCount}</p>
          <p className="text-xs">Correct</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg p-3">
          <p className="text-lg font-semibold">{result.partialCount}</p>
          <p className="text-xs">Partial</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg p-3">
          <p className="text-lg font-semibold">{result.incorrectCount}</p>
          <p className="text-xs">Incorrect</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
          <p className="text-lg font-semibold">{result.skippedCount}</p>
          <p className="text-xs">Skipped</p>
        </div>
      </div>

      {result.newBadges.length > 0 && (
        <div className="bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
          <p className="text-sm font-medium mb-1">🎉 New badges unlocked!</p>
          <div className="flex justify-center flex-wrap gap-2">
            {result.newBadges.map((b) => (
              <span key={b.code} className="text-xs px-2 py-1 rounded-full bg-white dark:bg-gray-800 border border-brand-200 dark:border-brand-800">
                {b.icon} {b.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3 pt-2">
        <button onClick={onRestart} className="text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2">
          New Mock Interview
        </button>
        <Link to="/progress" className="text-sm bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
          View progress
        </Link>
      </div>
    </div>
  );
}

export default function MockInterview() {
  const [nodes, setNodes] = useState([]);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/nodes').then((res) => setNodes(res.nodes.filter((n) => !n.parentId))).catch(() => {});
  }, []);

  const topLevelOrLeaf = useMemo(() => nodes, [nodes]);

  const start = async (payload) => {
    setError('');
    try {
      const res = await api.post('/mock-interviews', payload);
      setSession(res.session);
    } catch (err) {
      setError(err.message);
    }
  };

  if (result) return <ResultsScreen result={result} onRestart={() => { setResult(null); setSession(null); }} />;
  if (session) return <SessionScreen session={session} onFinished={setResult} />;
  return <SetupScreen nodes={topLevelOrLeaf} onStart={start} error={error} />;
}

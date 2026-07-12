import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent || ''}`}>{value}</p>
    </div>
  );
}

function accuracyColor(accuracy) {
  if (accuracy >= 75) return 'bg-emerald-500';
  if (accuracy >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function Progress() {
  const [summary, setSummary] = useState(null);
  const [badges, setBadges] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/progress/summary').then(setSummary).catch((err) => setError(err.message));
    api.get('/progress/badges').then((res) => setBadges(res.badges)).catch(() => {});
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return <p className="text-sm text-gray-500">Loading…</p>;

  const { gameStats, statusCounts, weakAreas, totalQuestions, questionsAttempted } = summary;
  const xpIntoLevel = gameStats.xp % 100;
  const earnedBadges = badges.filter((b) => b.earned);
  const lockedBadges = badges.filter((b) => !b.earned);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">My Progress</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {questionsAttempted} of {totalQuestions} questions started · keep the streak alive.
        </p>
      </div>

      <div className="bg-gradient-to-br from-brand-600 to-indigo-700 text-white rounded-xl p-5 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Level</p>
          <p className="text-3xl font-bold">{gameStats.level}</p>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex justify-between text-xs text-white/80 mb-1">
            <span>{xpIntoLevel} / 100 XP</span>
            <span>{gameStats.xp} XP total</span>
          </div>
          <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${xpIntoLevel}%` }} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-2xl">🔥</p>
          <p className="text-lg font-bold leading-none">{gameStats.currentStreak}</p>
          <p className="text-[11px] text-white/70">day streak</p>
        </div>
        <div className="text-center">
          <p className="text-2xl">🏆</p>
          <p className="text-lg font-bold leading-none">{gameStats.longestStreak}</p>
          <p className="text-[11px] text-white/70">best streak</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="New" value={statusCounts.NEW} />
        <StatCard label="Learning" value={statusCounts.LEARNING} accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Reviewing" value={statusCounts.REVIEWING} accent="text-sky-600 dark:text-sky-400" />
        <StatCard label="Mastered" value={statusCounts.MASTERED} accent="text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Weak Areas</h3>
        {weakAreas.length === 0 ? (
          <p className="text-xs text-gray-400">Review a few more questions in each technology to see where you need practice.</p>
        ) : (
          <div className="space-y-3">
            {weakAreas.map((w) => (
              <div key={w.technology}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{w.technology}</span>
                  <span className="text-gray-400">
                    {w.accuracy}% accuracy · {w.mastered}/{w.attempted} mastered
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full ${accuracyColor(w.accuracy)}`} style={{ width: `${w.accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">
          Badges <span className="text-gray-400 font-normal">({earnedBadges.length}/{badges.length})</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {earnedBadges.map((b) => (
            <div key={b.code} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
              <p className="text-2xl">{b.icon}</p>
              <p className="text-xs font-medium mt-1">{b.name}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{b.description}</p>
            </div>
          ))}
          {lockedBadges.map((b) => (
            <div key={b.code} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center opacity-50">
              <p className="text-2xl grayscale">{b.icon}</p>
              <p className="text-xs font-medium mt-1">{b.name}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

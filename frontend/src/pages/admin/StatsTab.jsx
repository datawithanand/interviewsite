import { useEffect, useState } from 'react';
import { api } from '../../api/client';

function StatCard({ label, value }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

export default function StatsTab() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/stats').then(setStats);
  }, []);

  if (!stats) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Questions" value={stats.totalQuestions} />
        <StatCard label="Total Modules" value={stats.totalModules} />
        <StatCard label="Total Users" value={stats.users.total} />
        <StatCard label="Writers" value={stats.users.writers} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Questions per Module</h4>
          <div className="space-y-2">
            {stats.questionsPerModule.map((m) => (
              <div key={m.module} className="flex items-center gap-2 text-sm">
                <span className="w-32 truncate">{m.module}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded h-3 overflow-hidden">
                  <div
                    className="bg-brand-500 h-3"
                    style={{ width: `${Math.min(100, (m.count / (stats.totalQuestions || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{m.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Difficulty Distribution</h4>
          <div className="space-y-2">
            {stats.difficultyDistribution.map((d) => (
              <div key={d.difficulty} className="flex items-center gap-2 text-sm">
                <span className="w-32">{d.difficulty}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded h-3 overflow-hidden">
                  <div
                    className="bg-brand-500 h-3"
                    style={{ width: `${Math.min(100, (d.count / (stats.totalQuestions || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Most Viewed Questions</h4>
          <ul className="text-sm space-y-1">
            {stats.mostViewedQuestions.map((q) => (
              <li key={q.id} className="flex justify-between">
                <span className="truncate">{q.title}</span>
                <span className="text-xs text-gray-400">{q.viewCount}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Recently Added</h4>
          <ul className="text-sm space-y-1">
            {stats.recentQuestions.map((q) => (
              <li key={q.id} className="flex justify-between">
                <span className="truncate">{q.title}</span>
                <span className="text-xs text-gray-400">{q.module}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

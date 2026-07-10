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

function BarList({ items, labelKey, countKey, total }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">No data yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item[labelKey]} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate">{item[labelKey]}</span>
          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded h-3 overflow-hidden">
            <div className="bg-brand-500 h-3" style={{ width: `${Math.min(100, (item[countKey] / (total || 1)) * 100)}%` }} />
          </div>
          <span className="text-xs text-gray-400">{item[countKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function StatsTab() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats').then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Users" value={stats.users.total} />
        <StatCard label="Active Users" value={stats.users.active} />
        <StatCard label="Total Questions" value={stats.totalQuestions} />
        <StatCard label="Technologies" value={stats.totalTechnologies} />
        <StatCard label="Content Managers" value={stats.users.contentManagers} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Questions by Technology</h4>
          <BarList items={stats.questionsByTechnology} labelKey="technology" countKey="count" total={stats.totalQuestions} />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Questions by Module</h4>
          <BarList items={stats.questionsByNode} labelKey="node" countKey="count" total={stats.totalQuestions} />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Difficulty Distribution</h4>
          <BarList items={stats.difficultyDistribution} labelKey="difficulty" countKey="count" total={stats.totalQuestions} />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Format Distribution</h4>
          <BarList items={stats.formatDistribution} labelKey="format" countKey="count" total={stats.totalQuestions} />
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Most Viewed Questions</h4>
          {stats.mostViewedQuestions.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {stats.mostViewedQuestions.map((q) => (
                <li key={q.id} className="flex justify-between gap-2">
                  <span className="truncate">{q.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{q.viewCount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Recently Added Questions</h4>
          {stats.recentQuestions.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {stats.recentQuestions.map((q) => (
                <li key={q.id} className="flex justify-between gap-2">
                  <span className="truncate">{q.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{q.node}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Most Active Contributors</h4>
          {stats.mostActiveContributors.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {stats.mostActiveContributors.map((c) => (
                <li key={c.userId} className="flex justify-between gap-2">
                  <span className="truncate">{c.username}</span>
                  <span className="text-xs text-gray-400 shrink-0">{c.count} question(s)</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Recently Registered Users</h4>
          {stats.recentlyRegisteredUsers.length === 0 ? (
            <p className="text-xs text-gray-400">No data yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {stats.recentlyRegisteredUsers.map((u) => (
                <li key={u.id} className="flex justify-between gap-2">
                  <span className="truncate">{u.username}</span>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(u.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

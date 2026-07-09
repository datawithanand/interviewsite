import { useEffect, useState } from 'react';
import { api } from '../api/client';

function describeAgent(ua) {
  if (!ua) return 'Unknown device';
  if (/playwright|headless/i.test(ua)) return 'Automated browser';
  if (/mobile/i.test(ua)) return 'Mobile browser';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
}

export default function SessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    api
      .get('/auth/sessions')
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (id) => {
    await api.del(`/auth/sessions/${id}`);
    load();
  };

  const revokeAll = async () => {
    if (!window.confirm('Sign out of all other devices?')) return;
    await api.post('/auth/sessions/revoke-all', {});
    load();
  };

  return (
    <div className="space-y-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Active Sessions</h3>
        {sessions.length > 1 && (
          <button onClick={revokeAll} className="text-xs text-red-600 hover:underline">
            Sign out all other devices
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-xs border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
            <div>
              <p className="font-medium">
                {describeAgent(s.userAgent)} {s.current && <span className="text-green-600">(this device)</span>}
              </p>
              <p className="text-gray-400">
                {s.ipAddress || 'unknown IP'} · last active {new Date(s.lastActivity).toLocaleString()}
              </p>
            </div>
            {!s.current && (
              <button onClick={() => revoke(s.id)} className="text-red-500 hover:underline">
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, getStoredToken } from '../../api/client';

export default function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (targetType) params.set('targetType', targetType);
    api.get(`/audit-logs?${params.toString()}`).then((res) => setLogs(res.logs));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, targetType]);

  const exportCsv = async () => {
    const token = getStoredToken();
    const res = await fetch('/api/audit-logs/export', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All actions</option>
          {['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'EDIT', 'DELETE', 'IMPORT', 'EXPORT', 'ROLE_CHANGE', 'PASSWORD_RESET', 'ACCOUNT_DEACTIVATED'].map(
            (a) => (
              <option key={a} value={a}>
                {a}
              </option>
            )
          )}
        </select>
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
        >
          <option value="">All target types</option>
          {['USER', 'QUESTION', 'MODULE', 'PASSWORD_RESET', 'SESSION'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button onClick={exportCsv} className="ml-auto text-sm text-brand-600 hover:underline">
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">{l.username || '—'}</td>
                <td className="px-3 py-2">{l.action}</td>
                <td className="px-3 py-2 text-xs">{l.targetType}</td>
                <td className="px-3 py-2">
                  <span className={l.status === 'success' ? 'text-green-600' : 'text-red-600'}>{l.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{l.ipAddress || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

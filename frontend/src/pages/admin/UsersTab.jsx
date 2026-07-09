import { useEffect, useState } from 'react';
import { api } from '../../api/client';

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    api
      .get(`/users?${params.toString()}`)
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role]);

  const changeRole = async (id, newRole) => {
    await api.patch(`/users/${id}/role`, { role: newRole });
    load();
  };

  const toggleActive = async (u) => {
    if (u.isActive) {
      if (!window.confirm(`Deactivate ${u.username}?`)) return;
      await api.patch(`/users/${u.id}/deactivate`, {});
    } else {
      await api.patch(`/users/${u.id}/reactivate`, {});
    }
    load();
  };

  const forceLogout = async (u) => {
    if (!window.confirm(`Force logout ${u.username} from all devices?`)) return;
    await api.post(`/users/${u.id}/force-logout`, {});
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { newPassword });
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
          placeholder="Search username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="REGULAR_USER">Regular User</option>
          <option value="WRITER">Writer</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last Login</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2 font-medium">{u.username}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-1.5 py-1 text-xs"
                  >
                    <option value="REGULAR_USER">Regular User</option>
                    <option value="WRITER">Writer</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <span className={u.isActive ? 'text-green-600' : 'text-gray-400'}>
                    {u.isActive ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 space-x-2">
                  <button onClick={() => setResetTarget(u)} className="text-xs text-brand-600 hover:underline">
                    Reset PW
                  </button>
                  <button onClick={() => toggleActive(u)} className="text-xs text-red-600 hover:underline">
                    {u.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button onClick={() => forceLogout(u)} className="text-xs text-gray-600 hover:underline">
                    Force Logout
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitReset}
            className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 space-y-3"
          >
            <h4 className="font-semibold text-sm">Force reset password for {resetTarget.username}</h4>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResetTarget(null)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
                Cancel
              </button>
              <button type="submit" className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white">
                Reset
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

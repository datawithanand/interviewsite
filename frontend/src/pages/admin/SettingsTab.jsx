import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import SecurityQuestionsPanel from './SecurityQuestionsPanel';

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        setSettings(res.settings);
        setForm(res.settings);
      })
      .catch((err) => setError(err.message));
  }, []);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await api.patch('/settings', {
        passwordMinLength: Number(form.passwordMinLength),
        passwordRequireLetter: form.passwordRequireLetter,
        passwordRequireNumber: form.passwordRequireNumber,
        maxFailedLoginAttempts: Number(form.maxFailedLoginAttempts),
        lockoutDurationMinutes: Number(form.lockoutDurationMinutes),
        sessionTimeoutMinutes: Number(form.sessionTimeoutMinutes),
        registrationEnabled: form.registrationEnabled,
      });
      setSettings(res.settings);
      setForm(res.settings);
      setMessage('Settings saved. New session-timeout and lockout values apply to future logins.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings || !form) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={save} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-sm">Password Policy</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Minimum length</label>
            <input
              type="number"
              min={6}
              max={64}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.passwordMinLength}
              onChange={(e) => update('passwordMinLength', e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.passwordRequireLetter}
            onChange={(e) => update('passwordRequireLetter', e.target.checked)}
          />
          Require at least one letter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.passwordRequireNumber}
            onChange={(e) => update('passwordRequireNumber', e.target.checked)}
          />
          Require at least one number
        </label>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-sm">Login Security</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Max failed login attempts</label>
            <input
              type="number"
              min={3}
              max={20}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.maxFailedLoginAttempts}
              onChange={(e) => update('maxFailedLoginAttempts', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lockout duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={1440}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.lockoutDurationMinutes}
              onChange={(e) => update('lockoutDurationMinutes', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Session timeout (minutes)</label>
            <input
              type="number"
              min={5}
              max={43200}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm"
              value={form.sessionTimeoutMinutes}
              onChange={(e) => update('sessionTimeoutMinutes', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Default 480 (8 hours). Applies to new logins only.</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-sm">Access</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.registrationEnabled}
            onChange={(e) => update('registrationEnabled', e.target.checked)}
          />
          Allow new user registration
        </label>
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      </form>

      <SecurityQuestionsPanel />
    </div>
  );
}

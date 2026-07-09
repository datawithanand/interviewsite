import { useState } from 'react';
import UsersTab from './admin/UsersTab';
import ImportExportTab from './admin/ImportExportTab';
import AuditLogsTab from './admin/AuditLogsTab';
import StatsTab from './admin/StatsTab';
import SettingsTab from './admin/SettingsTab';

const TABS = [
  { key: 'stats', label: 'Dashboard', Component: StatsTab },
  { key: 'users', label: 'Users', Component: UsersTab },
  { key: 'import-export', label: 'Import / Export', Component: ImportExportTab },
  { key: 'audit', label: 'Audit Logs', Component: AuditLogsTab },
  { key: 'settings', label: 'Settings', Component: SettingsTab },
];

export default function AdminPanel() {
  const [tab, setTab] = useState('stats');
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Admin Panel</h1>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === t.key ? 'border-brand-600 text-brand-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}

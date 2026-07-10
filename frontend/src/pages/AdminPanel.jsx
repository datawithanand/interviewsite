import { useState } from 'react';
import { useAuth, isAdmin } from '../context/AuthContext';
import UsersTab from './admin/UsersTab';
import ImportExportTab from './admin/ImportExportTab';
import AuditLogsTab from './admin/AuditLogsTab';
import StatsTab from './admin/StatsTab';
import SettingsTab from './admin/SettingsTab';

const ALL_TABS = [
  { key: 'stats', label: 'Dashboard', Component: StatsTab, adminOnly: false },
  { key: 'import-export', label: 'Import / Export', Component: ImportExportTab, adminOnly: false },
  { key: 'users', label: 'Users', Component: UsersTab, adminOnly: true },
  { key: 'audit', label: 'Audit Logs', Component: AuditLogsTab, adminOnly: true },
  { key: 'settings', label: 'Settings', Component: SettingsTab, adminOnly: true },
];

export default function AdminPanel() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const tabs = ALL_TABS.filter((t) => !t.adminOnly || admin);
  const [tab, setTab] = useState(tabs[0].key);

  const Active = (tabs.find((t) => t.key === tab) || tabs[0]).Component;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{admin ? 'Admin Panel' : 'Content Management'}</h1>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((t) => (
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

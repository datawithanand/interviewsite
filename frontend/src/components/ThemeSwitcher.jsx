import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

// Temporarily reduced to Light/Dark only — the rest are disabled, not
// deleted, so they're easy to bring back later:
// { value: 'ocean', label: 'Ocean', icon: '🌊' },
// { value: 'sunset', label: 'Sunset', icon: '🌇' },
// { value: 'forest', label: 'Forest', icon: '🌲' },
// { value: 'midnight', label: 'Midnight', icon: '🌌' },
// { value: 'slate', label: 'Slate', icon: '🪨' },
const OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = OPTIONS.find((o) => o.value === theme) || OPTIONS[0];

  const choose = (value) => {
    setTheme(value);
    setOpen(false);
    // Persist to the account so the choice follows the user across
    // browsers/devices, not just this one via localStorage.
    if (user) api.patch('/profile', { themePreference: value }).catch(() => {});
  };

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change theme"
        aria-label="Change theme"
        className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-sm"
      >
        {current.icon}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 overflow-hidden">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => choose(opt.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                opt.value === theme ? 'font-semibold text-brand-600 dark:text-brand-400' : ''
              }`}
            >
              <span>{opt.icon}</span> {opt.label}
              {opt.value === theme && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

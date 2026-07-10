import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, isAdmin, isContentManagerOrAdmin } from '../context/AuthContext';
import { api } from '../api/client';
import NotificationBell from './NotificationBell';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [gameStats, setGameStats] = useState(null);

  useEffect(() => {
    api.get('/progress/summary').then((res) => setGameStats(res.gameStats)).catch(() => {});
  }, [location.pathname]);

  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-4 gap-3 sticky top-0 z-10">
      <button className="md:hidden text-xl" onClick={onMenuClick} aria-label="Open menu">
        ☰
      </button>
      <Link to="/" className="font-semibold text-sm md:text-base flex items-center gap-1.5">
        <span aria-hidden>🧠</span> TechPrep Hub
      </Link>
      <div className="flex-1" />
      {gameStats && (
        <Link
          to="/progress"
          title={`Level ${gameStats.level} · ${gameStats.xp} XP · ${gameStats.currentStreak}-day streak`}
          className="hidden sm:flex items-center gap-2 text-xs bg-gray-100 dark:bg-gray-700 rounded-full px-2.5 py-1 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <span>🔥 {gameStats.currentStreak}</span>
          <span className="text-gray-300 dark:text-gray-500">·</span>
          <span>Lvl {gameStats.level}</span>
        </Link>
      )}
      <NotificationBell />
      {isContentManagerOrAdmin(user) && (
        <Link to="/admin" className="text-sm text-brand-600 hover:underline hidden sm:inline">
          {isAdmin(user) ? 'Admin' : 'Manage'}
        </Link>
      )}
      <Link to="/profile" className="text-sm hover:underline hidden sm:inline">
        {user?.username}
      </Link>
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hidden sm:inline">
        {user?.role?.replace('_', ' ')}
      </span>
      <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        Sign out
      </button>
    </header>
  );
}

import { Link } from 'react-router-dom';
import { useAuth, isAdmin } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <header className="h-14 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-4 gap-3 sticky top-0 z-10">
      <button className="md:hidden text-xl" onClick={onMenuClick} aria-label="Open menu">
        ☰
      </button>
      <Link to="/" className="font-semibold text-sm md:text-base">
        ServiceNow Interview Questions
      </Link>
      <div className="flex-1" />
      <button
        onClick={toggle}
        title="Toggle dark mode"
        className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-sm"
      >
        {dark ? '☀️' : '🌙'}
      </button>
      {isAdmin(user) && (
        <Link to="/admin" className="text-sm text-brand-600 hover:underline hidden sm:inline">
          Admin
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

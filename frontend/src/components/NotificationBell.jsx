import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const POLL_INTERVAL_MS = 30000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = () => {
    api
      .get('/notifications?pageSize=20')
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (n) => {
    if (!n.isRead) {
      await api.post(`/notifications/${n.id}/read`, {});
      load();
    }
    if (n.relatedQuestionId) {
      navigate('/');
      setOpen(false);
      // The question list handles focusing; simplest reliable path is just
      // taking the user home where they can search/open it. Full deep-link
      // navigation to a specific question modal is a nice-to-have for later.
    }
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all', {});
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="relative w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-sm"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && <p className="text-xs text-gray-500 px-3 py-4">No notifications yet.</p>}
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                n.isRead ? 'text-gray-500' : 'font-medium'
              }`}
            >
              <p>{n.message}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

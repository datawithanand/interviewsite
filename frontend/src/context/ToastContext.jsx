import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // action: optional { label, onClick } rendered as a button inside the toast.
  const showToast = useCallback(
    (message, { action, durationMs = 6000 } = {}) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, action }]);
      if (durationMs > 0) {
        setTimeout(() => dismiss(id), durationMs);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg shadow-lg px-4 py-2.5 text-sm flex items-center gap-3"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action.onClick();
                  dismiss(t.id);
                }}
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

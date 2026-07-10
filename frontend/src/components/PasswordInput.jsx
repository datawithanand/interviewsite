import { useState } from 'react';

export default function PasswordInput({ value, onChange, placeholder, autoComplete, required, className }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={className || 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 pr-10 text-sm'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

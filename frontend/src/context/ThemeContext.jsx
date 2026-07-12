import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

// Selectable themes — temporarily reduced to just Light/Dark at the user's
// request (the gradient/glass themes below are disabled, not deleted, so
// they can be restored later by uncommenting):
//
// const THEMES = ['ocean', 'sunset', 'forest', 'midnight', 'slate', 'light', 'dark'];
// const GLASS_THEMES = ['ocean', 'sunset', 'forest', 'midnight', 'slate'];
//
//  - 'ocean': the original branded blue/teal gradient (same as Login/
//    Register).
//  - 'sunset', 'forest', 'midnight', 'slate': four additional gradient
//    "glass" themes, following the exact same Tailwind-dark + glass-reskin
//    architecture (see styles/index.css).
//  - 'dark': a plain flat dark theme (Tailwind's dark: colors, no gradient).
//  - 'light': a plain flat light theme (Tailwind's default light colors),
//    now the default.
const THEMES = ['light', 'dark'];
const GLASS_THEMES = [];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return THEMES.includes(stored) ? stored : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme !== 'light');
    // Clear every glass class, then set only the active one, so switching
    // between glass themes never leaves a stale class behind.
    GLASS_THEMES.forEach((t) => root.classList.toggle(t, t === theme));
    localStorage.setItem('theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

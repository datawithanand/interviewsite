import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

// Selectable themes:
//  - 'ocean': the original branded blue/teal gradient (same as Login/
//    Register), default on first visit.
//  - 'sunset', 'forest', 'midnight', 'slate': four additional gradient
//    "glass" themes added alongside ocean, following the exact same
//    Tailwind-dark + glass-reskin architecture (see styles/index.css) so
//    ocean/light/dark are never touched.
//  - 'dark': a plain flat dark theme (Tailwind's dark: colors, no gradient).
//  - 'light': a plain flat light theme (Tailwind's default light colors).
const THEMES = ['ocean', 'sunset', 'forest', 'midnight', 'slate', 'light', 'dark'];

// Every theme except 'light' runs on Tailwind's dark: utility classes as its
// base. Every theme except plain 'light'/'dark' additionally gets a glass
// re-skin class matching its own name (see styles/index.css).
const GLASS_THEMES = ['ocean', 'sunset', 'forest', 'midnight', 'slate'];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return THEMES.includes(stored) ? stored : 'ocean';
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

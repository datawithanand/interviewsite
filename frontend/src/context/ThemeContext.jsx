import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

// Three selectable themes:
//  - 'ocean': the branded gradient (same as Login/Register), default on
//    first visit. Implemented as Tailwind dark mode + a glass re-skin.
//  - 'dark': a plain flat dark theme (Tailwind's dark: colors, no gradient).
//  - 'light': a plain flat light theme (Tailwind's default light colors).
const THEMES = ['ocean', 'light', 'dark'];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return THEMES.includes(stored) ? stored : 'ocean';
  });

  useEffect(() => {
    const root = document.documentElement;
    // 'ocean' needs the dark: utility classes active as its base, plus the
    // extra 'ocean' class that re-skins those surfaces as glass (see
    // styles/index.css). 'dark' uses the same base without the glass
    // layer. 'light' drops dark: entirely.
    root.classList.toggle('dark', theme === 'ocean' || theme === 'dark');
    root.classList.toggle('ocean', theme === 'ocean');
    localStorage.setItem('theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

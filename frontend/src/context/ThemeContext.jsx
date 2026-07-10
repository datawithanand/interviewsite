import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext(null);

// The app now uses a single "Ocean Slate" theme everywhere (auth pages and
// the authenticated app share the same gradient background), so there is
// no light/dark toggle anymore — the `dark` Tailwind variant classes
// already used throughout the app are simply always active.
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return <ThemeContext.Provider value={{ dark: true }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

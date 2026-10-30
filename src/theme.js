import { useEffect, useState } from 'react';

const THEME_KEY = 'prepvault-theme';

function savedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch { return null; }
}

export function preferredTheme() {
  return savedTheme() || 'dark';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0b0d' : '#f2f3f5');
}

export function useTheme() {
  const [theme, setTheme] = useState(preferredTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const update = () => {
      const next = preferredTheme();
      applyTheme(next);
      setTheme(next);
    };
    const onStorage = event => {
      if (event.key === THEME_KEY || event.key === null) update();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* The toggle still works when device storage is blocked. */ }
    applyTheme(next);
    setTheme(next);
  };
  return { theme, toggleTheme };
}

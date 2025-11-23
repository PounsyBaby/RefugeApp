import { reactive } from 'vue';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rap-theme';

const state = reactive({
  theme: 'light' as Theme,
  initialized: false,
});

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function detectInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  return media?.matches ? 'dark' : 'light';
}

export function useTheme() {
  function init() {
    if (state.initialized) return;
    const initial = detectInitialTheme();
    setTheme(initial, false);
    state.initialized = true;
  }

  function setTheme(theme: Theme, persist = true) {
    state.theme = theme;
    applyTheme(theme);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  return {
    state,
    init,
    setTheme,
    toggleTheme,
  };
}

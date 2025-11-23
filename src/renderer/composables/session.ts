import { reactive } from 'vue';

export type SessionUser = {
  id_user: number;
  email: string;
  role: 'admin' | 'agent' | 'benevole' | 'veto_ext';
  nom?: string;
  prenom?: string;
};

type SessionState = {
  user: SessionUser | null;
  ready: boolean;
};

const STORAGE_KEY = 'session';

const state = reactive<SessionState>({
  user: null,
  ready: false
});

function readStorage(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SessionUser;
  } catch (err) {
    console.warn('[session] failed to parse storage', err);
    return null;
  }
}

function writeStorage(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[session] failed to write storage', err);
  }
}

async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await window.api.invoke('auth:me');
    return res ?? null;
  } catch (err) {
    console.warn('[session] auth:me failed', err);
    return null;
  }
}

export function useSession() {
  async function init(options?: { force?: boolean }) {
    if (state.ready && !options?.force) return;

    const stored = readStorage();
    if (stored) state.user = stored;

    const me = await fetchMe();
    if (me) {
      state.user = { ...(stored ?? {}), ...me };
      writeStorage(state.user);
    } else {
      state.user = null;
      writeStorage(null);
    }
    if (!me && stored) {
      console.info('[session] backend session missing, user cleared');
    }
    state.ready = true;
  }

  function setUser(user: SessionUser | null) {
    state.user = user;
    writeStorage(user);
  }

  async function logout() {
    try {
      await window.api.invoke('auth:logout');
    } catch (err) {
      console.warn('[session] auth:logout failed', err);
    } finally {
      setUser(null);
    }
  }

  return {
    state,
    init,
    setUser,
    logout
  };
}

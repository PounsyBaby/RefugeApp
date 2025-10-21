import { ipcMain } from 'electron';

const g = global as any;

if (!g.__IPC_REGISTERED__) {
  g.__IPC_REGISTERED__ = true;

  // IMPORTANT : imports dynamiques (require) pour éviter un chargement
  // avant notre garde. Chaque module enregistre ses handlers via ipcMain.handle(...)
  // lorsqu'il est chargé.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./auth');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./people');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./animals');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sys');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./adoption');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./families');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./medical');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./species');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./dashboard');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./search');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./entries');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./vets');

  // Log de debug : liste des canaux enregistrés
  setTimeout(() => {
    try {
      console.log('[ipc] handlers enregistrés :', ipcMain.eventNames());
    } catch {}
  }, 0);
} else {
  console.log('[ipc] Handlers déjà enregistrés — on saute la ré‑init.');
}

// Fichier traité comme module
export {};

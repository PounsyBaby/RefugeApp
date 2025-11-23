import { ipcMain } from 'electron';
import './auth';
import './people';
import './animals';
import './sys';
import './adoption';
import './families';
import './medical';
import './species';
import './dashboard';
import './search';
import './entries';
import './vets';

const g = global as any;

if (!g.__IPC_REGISTERED__) {
  g.__IPC_REGISTERED__ = true;
  setTimeout(() => {
    try {
      console.log('[ipc] handlers enregistrés :', ipcMain.eventNames());
    } catch {}
  }, 0);
} else {
  console.log('[ipc] Handlers déjà enregistrés — on saute la ré‑init.');
}

export {};

import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { setSessionForSender } from './sys';
import type { Role } from './sys';

// Nom du canal centralisé pour éviter les typos
const CHANNEL = 'auth:login';

// Sécurise les rechargements (tsup/nodemon) :
// - si un handler existe déjà, on le retire avant de le ré-enregistrer
try {
  // Disponible depuis Electron v7+
  (ipcMain as any).removeHandler?.(CHANNEL);
} catch {
  // pas grave si indisponible
}

// On charge argon2 si dispo, sinon on fera un fallback comparaison "en clair"
let argon2: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  argon2 = require('argon2');
  console.log('[auth] argon2 chargé');
} catch (e) {
  console.warn('[auth] argon2 non disponible, fallback en clair');
}

// Enregistre (ou ré-enregistre) le handler d'authentification
ipcMain.handle(CHANNEL, async (event, payload) => {
  try {
    const { email, password } = (payload || {}) as { email?: string; password?: string };

    const loginEmail = (email || '').toString().trim().toLowerCase();
    const loginPass  = (password || '').toString();

    if (!loginEmail || !loginPass) {
      return { ok: false, message: 'Champs manquants' };
    }

    const userRecord = await prisma.utilisateur.findFirst({
      where: { email: loginEmail },
      select: {
        id_user: true,
        nom: true,
        prenom: true,
        email: true,
        role: true,
        motdepasse_hash: true,
        actif: true,
      },
    });

    if (!userRecord) {
      return { ok: false, message: 'Utilisateur inconnu' };
    }

    const u = {
      id_user: Number(userRecord.id_user),
      nom: userRecord.nom,
      prenom: userRecord.prenom,
      email: userRecord.email,
      role: userRecord.role,
      motdepasse_hash: userRecord.motdepasse_hash,
      actif: userRecord.actif ? 1 : 0,
    };

    if (!u.actif) {
      return { ok: false, message: 'Compte inactif' };
    }

    // 1) essai argon2 si dispo
    let valid = false;
    if (argon2?.verify) {
      try { valid = await argon2.verify(u.motdepasse_hash, loginPass); }
      catch (e) { console.warn('[auth] argon2.verify a échoué, on tente le fallback en clair.'); }
    }
    // 2) fallback "en clair" (utile pour des mots de passe seedés en clair en dev)
    if (!valid && u.motdepasse_hash === loginPass) valid = true;

    if (!valid) return { ok: false, message: 'Utilisateur inconnu' };

    const { motdepasse_hash: _omit, ...user } = u as any;
    const sessionUser = {
      id_user: user.id_user,
      email: user.email,
      role: user.role as Role,
    };
    setSessionForSender(event.sender.id, sessionUser);
    return { ok: true, user };
  } catch (err: any) {
    console.error('[auth:login] error', err?.stack || err);
    return { ok: false, message: 'Erreur serveur', detail: String(err?.message || err) };
  }
});

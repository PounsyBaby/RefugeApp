import { ipcMain } from 'electron';
import argon2 from 'argon2';
import prisma from '../db/prisma';

export type Role = 'admin' | 'agent' | 'benevole' | 'veto_ext';
export type SessionUser = {
  id_user: number;
  email: string;
  role: Role;
  nom?: string;
  prenom?: string;
};

// Session en mémoire par webContents.id
const sessions = new Map<number, SessionUser>();

export function getUserForSender(senderId: number): SessionUser | null {
  return sessions.get(senderId) ?? null;
}

export function setSessionForSender(senderId: number, user: SessionUser): void {
  sessions.set(senderId, user);
}

export function clearSessionForSender(senderId: number): void {
  sessions.delete(senderId);
}

export function requireAuthenticated(senderId: number): SessionUser {
  const user = getUserForSender(senderId);
  if (!user) throw new Error('Non authentifié');
  return user;
}

export function requireRoleForSender(senderId: number, roles: Role[]): SessionUser {
  const user = requireAuthenticated(senderId);
  if (!roles.includes(user.role)) throw new Error('Accès refusé');
  return user;
}

ipcMain.handle('auth:logout', async (event) => {
  clearSessionForSender(event.sender.id);
  return { ok: true };
});

ipcMain.handle('auth:me', async (event) => {
  return getUserForSender(event.sender.id);
});

ipcMain.handle('users:create', async (event, payload: {
  nom: string;
  prenom: string;
  email: string;
  password: string;
  role?: Role;
  actif?: boolean;
}) => {
  const creator = requireRoleForSender(event.sender.id, ['admin', 'agent']);

  const nom = (payload.nom ?? '').trim();
  const prenom = (payload.prenom ?? '').trim();
  const email = (payload.email ?? '').trim().toLowerCase();
  const password = payload.password ?? '';
  const requestedRole: Role = (payload.role as Role) ?? 'agent';
  const actif = payload.actif === false ? 0 : 1;

  if (!nom || !prenom || !email || !password) {
    throw new Error('Champs requis manquants (nom, prenom, email, password)');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Email invalide');
  }
  if (!['admin', 'agent', 'benevole', 'veto_ext'].includes(requestedRole)) {
    throw new Error('Rôle invalide');
  }
  if (creator.role === 'agent' && requestedRole !== 'benevole') {
    throw new Error('Les agents ne peuvent créer que des bénévoles');
  }

  const hash = await argon2.hash(password, { type: argon2.argon2id });

  try {
    const created = await prisma.utilisateur.create({
      data: {
        nom,
        prenom,
        email,
        motdepasse_hash: hash,
        role: requestedRole,
        actif: !!actif,
      },
      select: { id_user: true, email: true, role: true, actif: true },
    });

    return {
      id_user: Number(created.id_user),
      email: created.email,
      role: created.role,
      actif: !!created.actif,
    };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new Error('Cet email est déjà utilisé');
    }
    throw err;
  }
});

ipcMain.handle('users:list', async (event) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const users = await prisma.utilisateur.findMany({
    select: {
      id_user: true,
      nom: true,
      prenom: true,
      email: true,
      role: true,
      actif: true,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const rows = users.map((user) => ({
    id_user: Number(user.id_user),
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role,
    actif: !!user.actif,
  }));

  return { rows };
});

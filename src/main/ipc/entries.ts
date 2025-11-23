import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

type EntryPayload = {
  id_entree?: number;
  id_animal: number;
  date_entree: string;
  type: 'abandon' | 'trouve' | 'saisie' | 'transfert' | 'autre';
  source_personne?: number | null;
  details?: string | null;
};

function toDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return s || null;
}

function toId(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

ipcMain.handle('entries:list', async (event) => {
  requireAuthenticated(event.sender.id);
  const entries = await prisma.entree.findMany({
    select: {
      id_entree: true,
      id_animal: true,
      date_entree: true,
      type: true,
      source_personne: true,
      details: true,
      animal: {
        select: {
          nom_usuel: true,
        },
      },
      source: {
        select: {
          nom: true,
          prenom: true,
          email: true,
        },
      },
    },
    orderBy: [
      { date_entree: 'desc' },
      { id_entree: 'desc' },
    ],
  });

  const rows = entries.map((entry) => ({
    id_entree: Number(entry.id_entree),
    id_animal: Number(entry.id_animal),
    animal_nom: entry.animal?.nom_usuel ?? null,
    date_entree: entry.date_entree?.toISOString().slice(0, 10) ?? null,
    type: entry.type,
    source_personne: entry.source_personne ? Number(entry.source_personne) : null,
    source_nom: entry.source?.nom ?? null,
    source_prenom: entry.source?.prenom ?? null,
    source_email: entry.source?.email ?? null,
    details: entry.details ?? null,
  }));

  return { rows };
});

ipcMain.handle('entries:create', async (event, payload: EntryPayload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent', 'benevole']);
  const id_animal = toId(payload?.id_animal);
  const date_entree = toDate(payload?.date_entree);
  const type = (payload?.type || '').toString().toLowerCase() as 'abandon' | 'trouve' | 'saisie' | 'transfert' | 'autre';
  const source_personne = toId(payload?.source_personne);
  const details = payload?.details ? String(payload.details).trim() || null : null;

  if (!id_animal || !date_entree) {
    throw new Error('id_animal et date_entree sont requis');
  }
  if (!['abandon', 'trouve', 'saisie', 'transfert', 'autre'].includes(type)) {
    throw new Error('Type d’entrée invalide');
  }

  const created = await prisma.entree.create({
    data: {
      id_animal: BigInt(id_animal),
      date_entree: new Date(date_entree),
      type,
      source_personne: source_personne ? BigInt(source_personne) : null,
      details,
    },
    select: { id_entree: true },
  });

  return { id_entree: Number(created.id_entree) };
});

ipcMain.handle('entries:update', async (event, payload: EntryPayload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_entree = toId(payload?.id_entree);
  if (!id_entree) throw new Error('id_entree requis');

  const id_animal = toId(payload?.id_animal);
  const date_entree = toDate(payload?.date_entree);
  const type = (payload?.type || '').toString().toLowerCase() as 'abandon' | 'trouve' | 'saisie' | 'transfert' | 'autre';
  const source_personne = toId(payload?.source_personne);
  const details = payload?.details ? String(payload.details).trim() || null : null;

  if (!id_animal || !date_entree) {
    throw new Error('id_animal et date_entree sont requis');
  }
  if (!['abandon', 'trouve', 'saisie', 'transfert', 'autre'].includes(type)) {
    throw new Error('Type d’entrée invalide');
  }

  await prisma.entree.update({
    where: { id_entree: BigInt(id_entree) },
    data: {
      id_animal: BigInt(id_animal),
      date_entree: new Date(date_entree),
      type,
      source_personne: source_personne ? BigInt(source_personne) : null,
      details,
    },
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('entries:delete', async (event, id: number) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_entree = toId(id);
  if (!id_entree) throw new Error('id_entree requis');
  await prisma.entree.delete({
    where: { id_entree: BigInt(id_entree) },
  });
  return { ok: true, deleted: 1 };
});

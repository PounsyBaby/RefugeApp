import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { Prisma } from '@prisma/client';
import { requireAuthenticated, requireRoleForSender } from './sys';

type NullableBooleanFlag = 0 | 1 | null;

function toDateInput(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toBooleanFlag(value: boolean | null | undefined): NullableBooleanFlag {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ====== ANIMAUX ======

ipcMain.handle('animals:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const animals = await prisma.animal.findMany({
    include: {
      espece: { select: { libelle: true } },
      notes: {
        orderBy: [
          { date_note: 'desc' },
          { id_note: 'desc' },
        ],
        take: 1,
        select: {
          ok_chiens: true,
          ok_chats: true,
          ok_enfants: true,
          score: true,
          commentaire: true,
          date_note: true,
        },
      },
    },
    orderBy: { id_animal: 'desc' },
  });

  const rows = animals.map((animal) => {
    const latest = animal.notes[0] ?? null;
    return {
      id_animal: Number(animal.id_animal),
      nom_usuel: animal.nom_usuel,
      id_espece: Number(animal.id_espece),
      espece_libelle: animal.espece.libelle,
      sexe: animal.sexe,
      date_naissance: toDateInput(animal.date_naissance),
      date_arrivee: toDateInput(animal.date_arrivee),
      poids_kg: animal.poids_kg === null ? null : Number(animal.poids_kg),
      sterilise: animal.sterilise ? 1 : 0,
      description: animal.description,
      statut: animal.statut,
      comportement_ok_chiens: toBooleanFlag(latest?.ok_chiens ?? null),
      comportement_ok_chats: toBooleanFlag(latest?.ok_chats ?? null),
      comportement_ok_enfants: toBooleanFlag(latest?.ok_enfants ?? null),
      comportement_score: latest?.score ?? null,
      comportement_commentaire: latest?.commentaire ?? null,
      comportement_date_note: toDateInput(latest?.date_note ?? null),
    };
  });

  return { rows };
});

ipcMain.handle('animals:create', async (event, payload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_espece = Number(payload?.id_espece);
  const nom_usuel = (payload?.nom_usuel ?? '').toString().trim() || null;
  const sexe = (payload?.sexe ?? 'Inconnu').toString();
  const date_naissance = parseDate(payload?.date_naissance);
  const date_arrivee = parseDate(payload?.date_arrivee);
  const poids_kg = parseNumber(payload?.poids_kg);
  const sterilise = Boolean(payload?.sterilise);
  const description = (payload?.description ?? '').toString() || null;
  const statut = (payload?.statut ?? 'arrive').toString();

  if (!id_espece || !date_arrivee) {
    throw new Error('id_espece et date_arrivee sont requis');
  }

  const created = await prisma.animal.create({
    data: {
      nom_usuel,
      id_espece: BigInt(id_espece),
      sexe,
      date_naissance: date_naissance ?? undefined,
      date_arrivee: date_arrivee ?? new Date(),
      poids_kg,
      sterilise,
      description,
      statut,
    },
    select: { id_animal: true },
  });

  return { id_animal: Number(created.id_animal) };
});

ipcMain.handle('animals:update', async (event, payload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_animal = Number(payload?.id_animal);
  if (!id_animal) throw new Error('id_animal requis');

  const id_espece = Number(payload?.id_espece);
  const nom_usuel = (payload?.nom_usuel ?? '').toString().trim() || null;
  const sexe = (payload?.sexe ?? 'Inconnu').toString();
  const date_naissance = parseDate(payload?.date_naissance);
  const date_arrivee = parseDate(payload?.date_arrivee);
  const poids_kg = parseNumber(payload?.poids_kg);
  const sterilise = Boolean(payload?.sterilise);
  const description = (payload?.description ?? '').toString() || null;
  const statut = (payload?.statut ?? 'arrive').toString();

  await prisma.animal.update({
    where: { id_animal: BigInt(id_animal) },
    data: {
      nom_usuel,
      id_espece: BigInt(id_espece),
      sexe,
      date_naissance: date_naissance ?? null,
      date_arrivee: date_arrivee ?? undefined,
      poids_kg,
      sterilise,
      description,
      statut,
    },
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('animals:delete', async (event, id_animal: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(id_animal);
  if (!id) throw new Error('id_animal requis');

  try {
    await prisma.animal_race.deleteMany({ where: { id_animal: BigInt(id) } });
    await prisma.animal.delete({ where: { id_animal: BigInt(id) } });
    return { ok: true, deleted: 1 };
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2003') {
        return {
          ok: false,
          message: 'Impossible de supprimer : des enregistrements liés existent (adoptions, réservations, santé…).',
        };
      }
      if (err.code === 'P2025') {
        return { ok: false, message: 'Animal introuvable ou déjà supprimé.' };
      }
    }
    throw err;
  }
});

// ====== RACES PAR ANIMAL ======

ipcMain.handle('animal:races:list', async (event, id_animal: number) => {
  requireAuthenticated(event.sender.id);
  const id = Number(id_animal);
  if (!id) throw new Error('id_animal requis');

  const rows = await prisma.animal_race.findMany({
    where: { id_animal: BigInt(id) },
    include: {
      race: {
        select: {
          id_race: true,
          libelle: true,
          espece: { select: { libelle: true, id_espece: true } },
        },
      },
    },
    orderBy: {
      race: { libelle: 'asc' },
    },
  });

  return {
    rows: rows.map((row) => ({
      id_race: Number(row.id_race),
      pourcentage: row.pourcentage ?? null,
      race_libelle: row.race?.libelle ?? '',
      id_espece: row.race?.espece ? Number(row.race.espece.id_espece) : null,
      espece_libelle: row.race?.espece?.libelle ?? '',
    })),
  };
});

ipcMain.handle('animal:races:add', async (event, data: { id_animal: number; id_race: number; pourcentage?: number | null }) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);

  const id_animal = Number(data?.id_animal);
  const id_race = Number(data?.id_race);
  const pourcentage = parseNumber(data?.pourcentage);

  if (!id_animal || !id_race) throw new Error('id_animal et id_race requis');

  await prisma.animal_race.upsert({
    where: {
      id_animal_id_race: {
        id_animal: BigInt(id_animal),
        id_race: BigInt(id_race),
      },
    },
    update: { pourcentage },
    create: {
      id_animal: BigInt(id_animal),
      id_race: BigInt(id_race),
      pourcentage,
    },
  });

  return { ok: true };
});

ipcMain.handle('animal:races:remove', async (event, data: { id_animal: number; id_race: number }) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);

  const id_animal = Number(data?.id_animal);
  const id_race = Number(data?.id_race);
  if (!id_animal || !id_race) throw new Error('id_animal et id_race requis');

  await prisma.animal_race.delete({
    where: {
      id_animal_id_race: {
        id_animal: BigInt(id_animal),
        id_race: BigInt(id_race),
      },
    },
  });
  return { ok: true, deleted: 1 };
});

// ====== NOTES COMPORTEMENT ======

ipcMain.handle('animal:behaviour:list', async (event, id_animal: number) => {
  requireAuthenticated(event.sender.id);
  const id = Number(id_animal);
  if (!id) throw new Error('id_animal requis');

  const notes = await prisma.note_comportement.findMany({
    where: { id_animal: BigInt(id) },
    include: {
      utilisateur: {
        select: { nom: true, prenom: true },
      },
    },
    orderBy: [
      { date_note: 'desc' },
      { id_note: 'desc' },
    ],
  });

  return {
    rows: notes.map((note) => ({
      id_note: Number(note.id_note),
      id_animal: Number(note.id_animal),
      date_note: toDateInput(note.date_note),
      ok_chiens: toBooleanFlag(note.ok_chiens),
      ok_chats: toBooleanFlag(note.ok_chats),
      ok_enfants: toBooleanFlag(note.ok_enfants),
      score: note.score ?? null,
      commentaire: note.commentaire ?? null,
      id_user: Number(note.id_user),
      nom: note.utilisateur?.nom ?? '',
      prenom: note.utilisateur?.prenom ?? '',
    })),
  };
});

ipcMain.handle('animal:behaviour:add', async (event, payload: {
  id_animal: number;
  date_note?: string | null;
  ok_chiens?: 0 | 1 | null | boolean;
  ok_chats?: 0 | 1 | null | boolean;
  ok_enfants?: 0 | 1 | null | boolean;
  score?: number | null;
  commentaire?: string | null;
}) => {
  const user = requireRoleForSender(event.sender.id, ['admin', 'agent', 'benevole', 'veto_ext']);
  const id_animal = Number(payload?.id_animal);
  if (!id_animal) throw new Error('id_animal requis');

  const created = await prisma.note_comportement.create({
    data: {
      id_animal: BigInt(id_animal),
      date_note: parseDate(payload?.date_note) ?? new Date(),
      ok_chiens: parseBooleanLike(payload?.ok_chiens),
      ok_chats: parseBooleanLike(payload?.ok_chats),
      ok_enfants: parseBooleanLike(payload?.ok_enfants),
      score: payload?.score === null || payload?.score === undefined ? null : Number(payload.score),
      commentaire: payload?.commentaire ?? null,
      id_user: BigInt(user.id_user),
    },
    select: { id_note: true },
  });

  return { id_note: Number(created.id_note) };
});

ipcMain.handle('animal:behaviour:update', async (event, payload: {
  id_note: number;
  date_note?: string | null;
  ok_chiens?: 0 | 1 | null | boolean;
  ok_chats?: 0 | 1 | null | boolean;
  ok_enfants?: 0 | 1 | null | boolean;
  score?: number | null;
  commentaire?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent', 'benevole', 'veto_ext']);
  const id_note = Number(payload?.id_note);
  if (!id_note) throw new Error('id_note requis');

  await prisma.note_comportement.update({
    where: { id_note: BigInt(id_note) },
    data: {
      date_note: parseDate(payload?.date_note) ?? new Date(),
      ok_chiens: parseBooleanLike(payload?.ok_chiens),
      ok_chats: parseBooleanLike(payload?.ok_chats),
      ok_enfants: parseBooleanLike(payload?.ok_enfants),
      score: payload?.score === null || payload?.score === undefined ? null : Number(payload.score),
      commentaire: payload?.commentaire ?? null,
    },
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('animal:behaviour:delete', async (event, id_note: number) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id = Number(id_note);
  if (!id) throw new Error('id_note requis');
  await prisma.note_comportement.delete({ where: { id_note: BigInt(id) } });
  return { ok: true, deleted: 1 };
});

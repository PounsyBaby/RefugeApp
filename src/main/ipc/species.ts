import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

const toBigInt = (value: number | string | bigint) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Identifiant invalide');
  return BigInt(num);
};

/* ====================
   ESPECES
==================== */

ipcMain.handle('species:list', async (event) => {
  requireAuthenticated(event.sender.id);
  const species = await prisma.espece.findMany({
    select: {
      id_espece: true,
      libelle: true,
    },
    orderBy: { libelle: 'asc' },
  });

  const rows = species.map((item) => ({
    id_espece: Number(item.id_espece),
    libelle: item.libelle,
  }));

  return { rows };
});

ipcMain.handle('species:create', async (event, libelle: string) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const name = String(libelle || '').trim();
  if (!name) throw new Error('Libellé requis');

  try {
    const created = await prisma.espece.create({
      data: { libelle: name },
      select: { id_espece: true },
    });
    return { id_espece: Number(created.id_espece) };
  } catch (err: any) {
    if (err?.code === 'P2002') return { ok: false, message: 'Espèce déjà existante' };
    throw err;
  }
});

ipcMain.handle('species:update', async (event, data: { id_espece: number; libelle: string }) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(data?.id_espece);
  const name = String(data?.libelle || '').trim();
  if (!id || !name) throw new Error('Données invalides');

  try {
    await prisma.espece.update({
      where: { id_espece: toBigInt(id) },
      data: { libelle: name },
    });
    return { ok: true, updated: 1 };
  } catch (err: any) {
    if (err?.code === 'P2002') return { ok: false, message: 'Espèce déjà existante' };
    throw err;
  }
});

ipcMain.handle('species:delete', async (event, id_espece: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(id_espece);
  if (!id) throw new Error('id_espece requis');

  const [cntAnimals, cntRaces] = await Promise.all([
    prisma.animal.count({ where: { id_espece: toBigInt(id) } }),
    prisma.race.count({ where: { id_espece: toBigInt(id) } }),
  ]);

  if (cntAnimals > 0) return { ok: false, message: `Impossible de supprimer : ${cntAnimals} animal(aux) rattaché(s)` };
  if (cntRaces > 0) return { ok: false, message: `Impossible de supprimer : ${cntRaces} race(s) rattachée(s)` };

  await prisma.espece.delete({
    where: { id_espece: toBigInt(id) },
  });

  return { ok: true, deleted: 1 };
});

/* ====================
   RACES
==================== */

ipcMain.handle('races:list', async (event) => {
  requireAuthenticated(event.sender.id);
  const races = await prisma.race.findMany({
    include: {
      espece: { select: { libelle: true } },
    },
    orderBy: [
      { espece: { libelle: 'asc' } },
      { libelle: 'asc' },
    ],
  });

  const rows = races.map((race) => ({
    id_race: Number(race.id_race),
    id_espece: Number(race.id_espece),
    libelle: race.libelle,
    espece_libelle: race.espece?.libelle ?? null,
  }));

  return { rows };
});

ipcMain.handle('races:create', async (event, data: { id_espece: number; libelle: string }) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id_espece = Number(data?.id_espece);
  const name = String(data?.libelle || '').trim();
  if (!id_espece || !name) throw new Error('Espèce et libellé requis');

  try {
    const created = await prisma.race.create({
      data: {
        id_espece: toBigInt(id_espece),
        libelle: name,
      },
      select: { id_race: true },
    });
    return { id_race: Number(created.id_race) };
  } catch (err: any) {
    if (err?.code === 'P2002') return { ok: false, message: 'Race déjà existante pour cette espèce' };
    throw err;
  }
});

ipcMain.handle('races:update', async (event, data: { id_race: number; id_espece: number; libelle: string }) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id_race = Number(data?.id_race);
  const id_espece = Number(data?.id_espece);
  const name = String(data?.libelle || '').trim();
  if (!id_race || !id_espece || !name) throw new Error('Champs requis manquants');

  try {
    await prisma.race.update({
      where: { id_race: toBigInt(id_race) },
      data: {
        id_espece: toBigInt(id_espece),
        libelle: name,
      },
    });
    return { ok: true, updated: 1 };
  } catch (err: any) {
    if (err?.code === 'P2002') return { ok: false, message: 'Race déjà existante pour cette espèce' };
    throw err;
  }
});

ipcMain.handle('races:delete', async (event, id_race: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(id_race);
  if (!id) throw new Error('id_race requis');

  const cntUsed = await prisma.animal_race.count({
    where: { id_race: toBigInt(id) },
  });
  if (cntUsed > 0) return { ok: false, message: `Impossible : race utilisée par ${cntUsed} animal(aux)` };

  await prisma.race.delete({
    where: { id_race: toBigInt(id) },
  });

  return { ok: true, deleted: 1 };
});

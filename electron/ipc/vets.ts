import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

type VetPayload = {
  id_vet?: number;
  nom_cabinet: string;
  contact?: string | null;
  adresse?: string | null;
};

function sanitize(value: unknown): string {
  return String(value ?? '').trim();
}

ipcMain.handle('vets:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const vets = await prisma.veterinaire.findMany({
    select: {
      id_vet: true,
      nom_cabinet: true,
      contact: true,
      adresse: true,
    },
    orderBy: [
      { nom_cabinet: 'asc' },
      { id_vet: 'desc' },
    ],
  });

  const rows = vets.map((vet) => ({
    id_vet: Number(vet.id_vet),
    nom_cabinet: vet.nom_cabinet,
    contact: vet.contact,
    adresse: vet.adresse,
  }));

  return { rows };
});

ipcMain.handle('vets:create', async (event, payload: VetPayload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const nom_cabinet = sanitize(payload?.nom_cabinet);
  if (!nom_cabinet) throw new Error('nom_cabinet requis');
  const contact = sanitize(payload?.contact ?? '');
  const adresse = sanitize(payload?.adresse ?? '');

  const created = await prisma.veterinaire.create({
    data: {
      nom_cabinet,
      contact: contact || null,
      adresse: adresse || null,
    },
    select: { id_vet: true },
  });

  return { id_vet: Number(created.id_vet) };
});

ipcMain.handle('vets:update', async (event, payload: VetPayload) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_vet = Number(payload?.id_vet);
  if (!Number.isFinite(id_vet) || id_vet <= 0) throw new Error('id_vet requis');
  const nom_cabinet = sanitize(payload?.nom_cabinet);
  if (!nom_cabinet) throw new Error('nom_cabinet requis');
  const contact = sanitize(payload?.contact ?? '');
  const adresse = sanitize(payload?.adresse ?? '');
  const updated = await prisma.veterinaire.update({
    where: { id_vet: BigInt(id_vet) },
    data: {
      nom_cabinet,
      contact: contact || null,
      adresse: adresse || null,
    },
    select: { id_vet: true },
  });

  return { ok: true, updated: updated ? 1 : 0 };
});

ipcMain.handle('vets:delete', async (event, id_vet: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(id_vet);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id_vet requis');
  const deleted = await prisma.veterinaire.delete({
    where: { id_vet: BigInt(id) },
    select: { id_vet: true },
  });

  return { ok: true, deleted: deleted ? 1 : 0 };
});

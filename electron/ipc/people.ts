import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

// LISTE avec adresse/tel/jardin
ipcMain.handle('people:list', async (event) => {
  requireAuthenticated(event.sender.id);
  const people = await prisma.personne.findMany({
    select: {
      id_personne: true,
      nom: true,
      prenom: true,
      email: true,
      tel: true,
      type_personne: true,
      date_naissance: true,
      jardin: true,
      rue: true,
      numero: true,
      code_postal: true,
      ville: true,
      pays: true,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const rows = people.map((person) => ({
    id_personne: Number(person.id_personne),
    nom: person.nom,
    prenom: person.prenom,
    email: person.email,
    tel: person.tel,
    type_personne: person.type_personne,
    date_naissance: person.date_naissance ? person.date_naissance.toISOString().slice(0, 10) : null,
    jardin: person.jardin === null || person.jardin === undefined ? null : person.jardin ? 1 : 0,
    rue: person.rue,
    numero: person.numero,
    code_postal: person.code_postal,
    ville: person.ville,
    pays: person.pays,
  }));

  return { rows };
});

// CRÉATION (avec tel, adresse, jardin)
ipcMain.handle('people:create', async (event, data: {
  nom: string;
  prenom: string;
  email: string;
  type_personne?: 'prospect'|'adoptant'|'fa'|'donateur'|'multiple';
  date_naissance?: string | null; // yyyy-mm-dd ou null
  tel?: string | null;
  rue?: string | null;
  numero?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  jardin?: 0 | 1 | boolean | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  try {
    const created = await prisma.personne.create({
      data: {
        nom: (data.nom || '').trim(),
        prenom: (data.prenom || '').trim(),
        email: (data.email || '').trim(),
        type_personne: data.type_personne ?? 'prospect',
        date_naissance: data.date_naissance ? new Date(data.date_naissance) : null,
        tel: data.tel ?? null,
        rue: data.rue ?? null,
        numero: data.numero ?? null,
        code_postal: data.code_postal ?? null,
        ville: data.ville ?? null,
        pays: data.pays ?? null,
        jardin:
          data.jardin === true || data.jardin === 1
            ? true
            : data.jardin === false || data.jardin === 0
            ? false
            : null,
      },
      select: { id_personne: true },
    });
    return { id_personne: Number(created.id_personne) };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return { ok: false, message: 'Email déjà utilisé' };
    }
    throw err;
  }
});

// MISE À JOUR
ipcMain.handle('people:update', async (event, data: {
  id_personne: number;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  tel?: string | null;
  type_personne?: 'prospect'|'adoptant'|'fa'|'donateur'|'multiple' | null;
  date_naissance?: string | null;
  rue?: string | null;
  numero?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  jardin?: 0 | 1 | boolean | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_personne) throw new Error('id_personne requis');

  const updateData: any = {};

  if (data.nom !== undefined) updateData.nom = data.nom?.trim() || null;
  if (data.prenom !== undefined) updateData.prenom = data.prenom?.trim() || null;
  if (data.email !== undefined) updateData.email = data.email?.trim() || null;
  if (data.tel !== undefined) updateData.tel = data.tel || null;
  if (data.type_personne !== undefined) updateData.type_personne = data.type_personne;
  if (data.date_naissance !== undefined) {
    updateData.date_naissance = data.date_naissance ? new Date(data.date_naissance) : null;
  }
  if (data.rue !== undefined) updateData.rue = data.rue || null;
  if (data.numero !== undefined) updateData.numero = data.numero || null;
  if (data.code_postal !== undefined) updateData.code_postal = data.code_postal || null;
  if (data.ville !== undefined) updateData.ville = data.ville || null;
  if (data.pays !== undefined) updateData.pays = data.pays || null;
  if (data.jardin !== undefined) {
    if (data.jardin === null) updateData.jardin = null;
    else updateData.jardin = data.jardin === true || data.jardin === 1;
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: true, updated: 0 };
  }

  try {
    await prisma.personne.update({
      where: { id_personne: BigInt(data.id_personne) },
      data: updateData,
    });
    return { ok: true, updated: 1 };
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return { ok: false, message: 'Email déjà utilisé' };
    }
    throw err;
  }
});

// SUPPRESSION
ipcMain.handle('people:delete', async (event, id_personne: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  if (!id_personne) throw new Error('id_personne requis');
  // ⚠️ peut échouer si des FKs existent (adoption/demande/rendez_vous).
  try {
    await prisma.personne.delete({
      where: { id_personne: BigInt(id_personne) },
    });
    return { ok: true, deleted: 1 };
  } catch (err: any) {
    if (err?.code === 'P2003') {
      return { ok: false, message: 'Suppression impossible : références liées (demande, adoption, rendez-vous...)' };
    }
    throw err;
  }
});

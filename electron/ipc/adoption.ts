import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import type { Prisma } from '@prisma/client';
import { requireAuthenticated, requireRoleForSender } from './sys';

type DemandeStatut = 'soumise' | 'en_etude' | 'approuvee' | 'refusee' | 'expiree' | 'annulee';
type ReservationStatut = 'active' | 'expiree' | 'annulee' | 'convertie';
type AdoptionStatut = 'brouillon' | 'finalisee' | 'annulee' | 'retour';
type PaiementMode = 'especes' | 'carte' | 'virement';
type RetourSuite = 'repropose' | 'transfert' | 'decede' | 'autre';
type NullableBooleanFlag = 0 | 1 | null;

const TRUE_VALUES = new Set<any>([true, 1, '1', 'true', 'oui', 'yes']);

const DATE_FORMATTER = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

function toBooleanDB(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return TRUE_VALUES.has(value.trim().toLowerCase());
  return null;
}

function booleanToTinyint(value: boolean | null | undefined): 0 | 1 | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function toBooleanFlag(value: boolean | null | undefined): NullableBooleanFlag {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function decimalToNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object') {
    if (typeof value.toNumber === 'function') return value.toNumber();
    if (typeof value.valueOf === 'function') return Number(value.valueOf());
  }
  return Number(value) || 0;
}

function ensureDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ensurePositiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBigInt(id: number | string | bigint | undefined | null): bigint {
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Identifiant invalide');
  return BigInt(num);
}

const DEMANDE_INCLUDE = {
  personne: {
    select: {
      nom: true,
      prenom: true,
      email: true,
      tel: true,
      ville: true,
      pays: true,
    },
  },
  _count: { select: { animaux: true } },
} satisfies Prisma.demande_adoptionInclude;

type DemandeRow = Prisma.demande_adoptionGetPayload<{ include: typeof DEMANDE_INCLUDE }>;

const ANIMAL_WITH_NOTE_INCLUDE = {
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
} satisfies Prisma.animalInclude;

type AnimalWithNote = Prisma.animalGetPayload<{ include: typeof ANIMAL_WITH_NOTE_INCLUDE }>;

const RESERVATION_INCLUDE = {
  animal: {
    select: { nom_usuel: true, statut: true },
  },
  demande: {
    include: {
      personne: { select: { nom: true, prenom: true } },
    },
  },
} satisfies Prisma.reservationInclude;

type ReservationRow = Prisma.reservationGetPayload<{ include: typeof RESERVATION_INCLUDE }>;

const ADOPTION_INCLUDE = {
  animal: { select: { nom_usuel: true } },
  personne: {
    select: { nom: true, prenom: true, email: true, tel: true },
  },
  paiements: { select: { montant: true } },
  retour: {
    select: {
      id_retour: true,
      date_retour: true,
      suite: true,
      motif: true,
      commentaires: true,
    },
  },
} satisfies Prisma.adoptionInclude;

type AdoptionRow = Prisma.adoptionGetPayload<{ include: typeof ADOPTION_INCLUDE }>;
type PaymentRow = Prisma.paiementGetPayload<{}>;

// ============================
// DEMANDES D’ADOPTION
// ============================

ipcMain.handle('adoption:demandes:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const demandes: DemandeRow[] = await prisma.demande_adoption.findMany({
    include: DEMANDE_INCLUDE,
    orderBy: { id_demande: 'desc' },
  });

  const rows = demandes.map((demande: DemandeRow) => ({
    id_demande: Number(demande.id_demande),
    id_personne: Number(demande.id_personne),
    date_depot: DATE_FORMATTER(demande.date_depot) ?? DATE_FORMATTER(new Date()),
    statut: demande.statut,
    type_logement: demande.type_logement,
    jardin: booleanToTinyint(demande.jardin),
    accord_proprio: booleanToTinyint(demande.accord_proprio),
    enfants: booleanToTinyint(demande.enfants),
    autres_animaux: demande.autres_animaux,
    experience_animaux: demande.experience_animaux,
    preferences: demande.preferences,
    commentaire: demande.commentaire,
    nom: demande.personne.nom,
    prenom: demande.personne.prenom,
    email: demande.personne.email,
    tel: demande.personne.tel,
    ville: demande.personne.ville,
    pays: demande.personne.pays,
    nb_animaux: demande._count.animaux,
  }));

  return { rows };
});

ipcMain.handle('adoption:demandes:create', async (event, data: {
  id_personne: number;
  type_logement?: string | null;
  jardin?: 0 | 1 | boolean | null;
  accord_proprio?: 0 | 1 | boolean | null;
  enfants?: 0 | 1 | boolean | null;
  autres_animaux?: string | null;
  experience_animaux?: string | null;
  preferences?: string | null;
  commentaire?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_personne) throw new Error('id_personne requis');

  const created = await prisma.demande_adoption.create({
    data: {
      id_personne: toBigInt(data.id_personne),
      date_depot: new Date(),
      statut: 'soumise',
      type_logement: data.type_logement ?? null,
      jardin: toBooleanDB(data.jardin),
      accord_proprio: toBooleanDB(data.accord_proprio),
      enfants: toBooleanDB(data.enfants),
      autres_animaux: data.autres_animaux ?? null,
      experience_animaux: data.experience_animaux ?? null,
      preferences: data.preferences ?? null,
      commentaire: data.commentaire ?? null,
    },
    select: { id_demande: true },
  });

  return { id_demande: Number(created.id_demande) };
});

ipcMain.handle('adoption:demandes:update', async (event, data: {
  id_demande: number;
  statut?: DemandeStatut;
  type_logement?: string | null;
  jardin?: 0 | 1 | boolean | null;
  accord_proprio?: 0 | 1 | boolean | null;
  enfants?: 0 | 1 | boolean | null;
  autres_animaux?: string | null;
  experience_animaux?: string | null;
  preferences?: string | null;
  commentaire?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_demande) throw new Error('id_demande requis');

  const updateData: any = {};
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.type_logement !== undefined) updateData.type_logement = data.type_logement;
  if (data.jardin !== undefined) updateData.jardin = toBooleanDB(data.jardin);
  if (data.accord_proprio !== undefined) updateData.accord_proprio = toBooleanDB(data.accord_proprio);
  if (data.enfants !== undefined) updateData.enfants = toBooleanDB(data.enfants);
  if (data.autres_animaux !== undefined) updateData.autres_animaux = data.autres_animaux ?? null;
  if (data.experience_animaux !== undefined) updateData.experience_animaux = data.experience_animaux ?? null;
  if (data.preferences !== undefined) updateData.preferences = data.preferences ?? null;
  if (data.commentaire !== undefined) updateData.commentaire = data.commentaire ?? null;

  if (!Object.keys(updateData).length) return { ok: true, updated: 0 };

  await prisma.demande_adoption.update({
    where: { id_demande: toBigInt(data.id_demande) },
    data: updateData,
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('adoption:demandes:delete', async (event, id_demande: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  if (!id_demande) throw new Error('id_demande requis');

  await prisma.demande_adoption.delete({
    where: { id_demande: toBigInt(id_demande) },
  });

  return { ok: true, deleted: 1 };
});

ipcMain.handle('adoption:demandes:animals', async (event, id_demande: number) => {
  requireAuthenticated(event.sender.id);
  if (!id_demande) throw new Error('id_demande requis');

  const animals: AnimalWithNote[] = await prisma.animal.findMany({
    where: {
      demandes: {
        some: { id_demande: toBigInt(id_demande) },
      },
    },
    include: ANIMAL_WITH_NOTE_INCLUDE,
    orderBy: { id_animal: 'desc' },
  });

  const rows = animals.map((animal: AnimalWithNote) => {
    const latest = animal.notes[0] ?? null;
    return {
      id_animal: Number(animal.id_animal),
      nom_usuel: animal.nom_usuel,
      sexe: animal.sexe,
      date_arrivee: DATE_FORMATTER(animal.date_arrivee),
      espece_libelle: animal.espece.libelle,
      comportement_ok_chiens: toBooleanFlag(latest?.ok_chiens ?? null),
      comportement_ok_chats: toBooleanFlag(latest?.ok_chats ?? null),
      comportement_ok_enfants: toBooleanFlag(latest?.ok_enfants ?? null),
      comportement_score: latest?.score ?? null,
      comportement_commentaire: latest?.commentaire ?? null,
      comportement_date_note: DATE_FORMATTER(latest?.date_note ?? null),
    };
  });

  return { rows };
});

ipcMain.handle('adoption:demandes:addAnimal', async (event, data: { id_demande: number; id_animal: number; priorite?: number | null }) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_demande || !data?.id_animal) throw new Error('id_demande et id_animal requis');

  await prisma.demande_animal.upsert({
    where: {
      id_demande_id_animal: {
        id_demande: toBigInt(data.id_demande),
        id_animal: toBigInt(data.id_animal),
      },
    },
    update: { priorite: ensurePositiveNumber(data.priorite) },
    create: {
      id_demande: toBigInt(data.id_demande),
      id_animal: toBigInt(data.id_animal),
      priorite: ensurePositiveNumber(data.priorite),
    },
  });

  return { ok: true };
});

ipcMain.handle('adoption:demandes:removeAnimal', async (event, data: { id_demande: number; id_animal: number }) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_demande || !data?.id_animal) throw new Error('id_demande et id_animal requis');

  await prisma.demande_animal.delete({
    where: {
      id_demande_id_animal: {
        id_demande: toBigInt(data.id_demande),
        id_animal: toBigInt(data.id_animal),
      },
    },
  });

  return { ok: true, deleted: 1 };
});

// ============================
// LISTE DES ANIMAUX ADOPTABLES
// ============================

ipcMain.handle('adoption:adoptables', async (event) => {
  requireAuthenticated(event.sender.id);

  const today = new Date();
  const animals: AnimalWithNote[] = await prisma.animal.findMany({
    where: {
      statut: {
        notIn: ['adopte', 'decede', 'indisponible', 'transfere'],
      },
      reservations: {
        none: {
          statut: 'active',
          AND: [
            {
              OR: [
                { date_fin: null },
                { date_fin: { gte: today } },
              ],
            },
          ],
        },
      },
    },
    include: ANIMAL_WITH_NOTE_INCLUDE,
    orderBy: { id_animal: 'desc' },
  });

  const rows = animals.map((animal: AnimalWithNote) => {
    const latest = animal.notes[0] ?? null;
    return {
      id_animal: Number(animal.id_animal),
      id_espece: Number(animal.id_espece),
      nom_usuel: animal.nom_usuel,
      sexe: animal.sexe,
      date_arrivee: DATE_FORMATTER(animal.date_arrivee),
      espece_libelle: animal.espece.libelle,
      comportement_ok_chiens: toBooleanFlag(latest?.ok_chiens ?? null),
      comportement_ok_chats: toBooleanFlag(latest?.ok_chats ?? null),
      comportement_ok_enfants: toBooleanFlag(latest?.ok_enfants ?? null),
      comportement_score: latest?.score ?? null,
      comportement_commentaire: latest?.commentaire ?? null,
      comportement_date_note: DATE_FORMATTER(latest?.date_note ?? null),
    };
  });

  return { rows };
});

// ============================
// RÉSERVATIONS
// ============================

ipcMain.handle('adoption:reservations:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const reservations: ReservationRow[] = await prisma.reservation.findMany({
    include: RESERVATION_INCLUDE,
    orderBy: { date_debut: 'desc' },
  });

  const rows = reservations.map((res: ReservationRow) => ({
    id_reservation: Number(res.id_reservation),
    id_animal: Number(res.id_animal),
    id_demande: Number(res.id_demande),
    date_debut: DATE_FORMATTER(res.date_debut),
    date_fin: DATE_FORMATTER(res.date_fin),
    statut: res.statut,
    motif: res.motif ?? null,
    animal_nom: res.animal?.nom_usuel ?? null,
    animal_statut: res.animal?.statut ?? null,
    personne_nom: res.demande.personne.nom,
    personne_prenom: res.demande.personne.prenom,
    id_personne: Number(res.demande.personne ? res.demande.id_personne : res.demande.id_personne),
  }));

  return { rows };
});

ipcMain.handle('adoption:reservations:create', async (event, data: {
  id_animal: number;
  id_demande: number;
  date_debut: string;
  date_fin?: string | null;
  statut?: ReservationStatut;
  motif?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_animal = Number(data?.id_animal);
  const id_demande = Number(data?.id_demande);
  const date_debut = ensureDate(data?.date_debut);
  if (!id_animal || !id_demande || !date_debut) throw new Error('id_animal, id_demande et date_debut requis');

  const created = await prisma.reservation.create({
    data: {
      id_animal: BigInt(id_animal),
      id_demande: BigInt(id_demande),
      date_debut,
      date_fin: ensureDate(data?.date_fin) ?? null,
      statut: data?.statut ?? 'active',
      motif: data?.motif ?? null,
    },
    select: { id_reservation: true },
  });

  return { id_reservation: Number(created.id_reservation) };
});

ipcMain.handle('adoption:reservations:update', async (event, data: {
  id_reservation: number;
  statut?: ReservationStatut;
  date_fin?: string | null;
  motif?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_reservation = Number(data?.id_reservation);
  if (!id_reservation) throw new Error('id_reservation requis');

  const updateData: any = {};
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.date_fin !== undefined) updateData.date_fin = ensureDate(data.date_fin);
  if (data.motif !== undefined) updateData.motif = data.motif ?? null;

  if (!Object.keys(updateData).length) return { ok: true, updated: 0 };

  await prisma.reservation.update({
    where: { id_reservation: BigInt(id_reservation) },
    data: updateData,
  });

  return { ok: true, updated: 1 };
});

// ============================
// ADOPTIONS
// ============================

ipcMain.handle('adoption:records:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const adoptions: AdoptionRow[] = await prisma.adoption.findMany({
    include: ADOPTION_INCLUDE,
    orderBy: { date_contrat: 'desc' },
  });

  const rows = adoptions.map((ad: AdoptionRow) => {
    const totalPaye = ad.paiements.reduce<number>((sum, paiement) => sum + decimalToNumber(paiement.montant), 0);
    return {
      id_adoption: Number(ad.id_adoption),
      numero_contrat: ad.numero_contrat,
      id_animal: Number(ad.id_animal),
      id_personne: Number(ad.id_personne),
      date_contrat: DATE_FORMATTER(ad.date_contrat),
      frais_total: decimalToNumber(ad.frais_total),
      statut: ad.statut,
      conditions_particulieres: ad.conditions_particulieres ?? null,
      animal_nom: ad.animal?.nom_usuel ?? null,
      personne_nom: ad.personne.nom,
      personne_prenom: ad.personne.prenom,
      personne_email: ad.personne.email,
      personne_tel: ad.personne.tel,
      total_paye: totalPaye,
      retour_id: ad.retour?.id_retour ? Number(ad.retour.id_retour) : null,
      retour_date: DATE_FORMATTER(ad.retour?.date_retour ?? null),
      retour_suite: ad.retour?.suite ?? null,
      retour_motif: ad.retour?.motif ?? null,
      retour_commentaires: ad.retour?.commentaires ?? null,
    };
  });

  return { rows };
});

ipcMain.handle('adoption:records:create', async (event, data: {
  numero_contrat?: string | null;
  id_animal: number;
  id_personne: number;
  date_contrat: string;
  frais_total?: number | string;
  statut?: AdoptionStatut;
  conditions_particulieres?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_animal = Number(data?.id_animal);
  const id_personne = Number(data?.id_personne);
  const date_contrat = ensureDate(data?.date_contrat);
  if (!id_animal || !id_personne || !date_contrat) {
    throw new Error('id_animal, id_personne et date_contrat requis');
  }
  const numero = (data?.numero_contrat || '').trim() || `ADOP-${Date.now()}`;
  const frais_total = Number(data?.frais_total ?? 0);

  try {
    const created = await prisma.adoption.create({
      data: {
        numero_contrat: numero,
        id_animal: BigInt(id_animal),
        id_personne: BigInt(id_personne),
        date_contrat,
        frais_total,
        statut: data?.statut ?? 'brouillon',
        conditions_particulieres: data?.conditions_particulieres ?? null,
      },
      select: { id_adoption: true, numero_contrat: true },
    });
    return { id_adoption: Number(created.id_adoption), numero_contrat: created.numero_contrat };
  } catch (err: any) {
    throw err;
  }
});

ipcMain.handle('adoption:records:update', async (event, data: {
  id_adoption: number;
  numero_contrat?: string | null;
  date_contrat?: string;
  frais_total?: number | string;
  statut?: AdoptionStatut;
  conditions_particulieres?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_adoption = Number(data?.id_adoption);
  if (!id_adoption) throw new Error('id_adoption requis');

  const updateData: any = {};
  if (data.numero_contrat !== undefined) {
    updateData.numero_contrat = (data.numero_contrat || '').trim() || null;
  }
  if (data.date_contrat !== undefined) {
    updateData.date_contrat = ensureDate(data.date_contrat);
  }
  if (data.frais_total !== undefined) {
    const ft = Number(data.frais_total);
    updateData.frais_total = Number.isFinite(ft) ? ft : 0;
  }
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.conditions_particulieres !== undefined) {
    updateData.conditions_particulieres = data.conditions_particulieres ?? null;
  }

  if (!Object.keys(updateData).length) return { ok: true, updated: 0 };

  await prisma.adoption.update({
    where: { id_adoption: BigInt(id_adoption) },
    data: updateData,
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('adoption:records:delete', async (event, id_adoption: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  const id = Number(id_adoption);
  if (!id) throw new Error('id_adoption requis');

  await prisma.adoption.delete({
    where: { id_adoption: BigInt(id) },
  });
  return { ok: true, deleted: 1 };
});

// ============================
// PAIEMENTS
// ============================

ipcMain.handle('adoption:payments:list', async (event, id_adoption: number) => {
  requireAuthenticated(event.sender.id);
  if (!id_adoption) throw new Error('id_adoption requis');

  const payments: PaymentRow[] = await prisma.paiement.findMany({
    where: { id_adoption: toBigInt(id_adoption) },
    orderBy: [
      { date_paiement: 'desc' },
      { id_paiement: 'desc' },
    ],
  });

  const rows = payments.map((pay: PaymentRow) => ({
    id_paiement: Number(pay.id_paiement),
    id_adoption: Number(pay.id_adoption),
    date_paiement: DATE_FORMATTER(pay.date_paiement),
    montant: decimalToNumber(pay.montant),
    mode: pay.mode,
    reference: pay.reference ?? null,
  }));

  return { rows };
});

ipcMain.handle('adoption:payments:add', async (event, data: {
  id_adoption: number;
  date_paiement?: string;
  montant: number | string;
  mode: PaiementMode;
  reference?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_adoption = Number(data?.id_adoption);
  const montant = Number(data?.montant);
  if (!id_adoption || !Number.isFinite(montant) || montant <= 0) {
    throw new Error('Adoption et montant valides requis');
  }

  const created = await prisma.paiement.create({
    data: {
      id_adoption: BigInt(id_adoption),
      date_paiement: ensureDate(data?.date_paiement) ?? new Date(),
      montant,
      mode: data.mode,
      reference: data.reference ?? null,
    },
    select: { id_paiement: true },
  });

  return { id_paiement: Number(created.id_paiement) };
});

// ============================
// RETOURS POST-ADOPTION
// ============================

ipcMain.handle('adoption:returns:get', async (event, id_adoption: number) => {
  requireAuthenticated(event.sender.id);
  if (!id_adoption) throw new Error('id_adoption requis');

  const retour = await prisma.retour_post_adoption.findUnique({
    where: { id_adoption: toBigInt(id_adoption) },
  });

  if (!retour) return { retour: null };

  return {
    retour: {
      id_retour: Number(retour.id_retour),
      id_adoption: Number(retour.id_adoption),
      date_retour: DATE_FORMATTER(retour.date_retour),
      motif: retour.motif ?? null,
      suite: retour.suite ?? null,
      commentaires: retour.commentaires ?? null,
    },
  };
});

ipcMain.handle('adoption:returns:record', async (event, data: {
  id_adoption: number;
  date_retour: string;
  motif?: string | null;
  suite?: RetourSuite;
  commentaires?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  const id_adoption = Number(data?.id_adoption);
  const date_retour = ensureDate(data?.date_retour);
  if (!id_adoption || !date_retour) throw new Error('id_adoption et date_retour requis');

  const upserted = await prisma.retour_post_adoption.upsert({
    where: { id_adoption: toBigInt(id_adoption) },
    update: {
      date_retour,
      motif: data?.motif ?? null,
      suite: data?.suite ?? null,
      commentaires: data?.commentaires ?? null,
    },
    create: {
      id_adoption: toBigInt(id_adoption),
      date_retour,
      motif: data?.motif ?? null,
      suite: data?.suite ?? null,
      commentaires: data?.commentaires ?? null,
    },
    select: { id_retour: true },
  });

  return { id_retour: Number(upserted.id_retour) };
});

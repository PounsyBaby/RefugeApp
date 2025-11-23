import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

type FamilleStatut = 'active' | 'suspendue' | 'terminee';

const DATE_FORMATTER = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const ensureDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toBooleanFlag = (value: boolean | null | undefined): 0 | 1 | null => {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
};

const toBigInt = (value: number | string | bigint | null | undefined): bigint => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Identifiant invalide');
  return BigInt(num);
};

const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const isPlacementActive = (dateFin: Date | null | undefined) => {
  if (!dateFin) return true;
  const end = new Date(dateFin);
  if (Number.isNaN(end.getTime())) return false;
  end.setHours(0, 0, 0, 0);
  return end >= todayMidnight();
};

/* ====================
   FAMILLES D’ACCUEIL
==================== */

ipcMain.handle('families:list', async (event) => {
  requireAuthenticated(event.sender.id);

  const families = await prisma.famille_accueil.findMany({
    include: {
      personne: {
        select: {
          nom: true,
          prenom: true,
          email: true,
          tel: true,
          ville: true,
          pays: true,
          jardin: true,
        },
      },
      placements: {
        include: {
          animal: {
            select: {
              id_animal: true,
              espece: { select: { libelle: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { date_agrement: 'desc' },
      { id_fa: 'desc' },
    ],
  });

  const rows = families.map((fa) => {
    const activePlacements = fa.placements.filter((placement) => isPlacementActive(placement.date_fin));
    const speciesSet = new Set<string>();
    let nextEnd: string | null = null;

    activePlacements.forEach((placement) => {
      const libelle = placement.animal?.espece?.libelle;
      if (libelle) speciesSet.add(libelle);
      if (placement.date_fin) {
        const formatted = DATE_FORMATTER(placement.date_fin);
        if (formatted && (!nextEnd || formatted < nextEnd)) {
          nextEnd = formatted;
        }
      }
    });

    const speciesList = Array.from(speciesSet).sort((a, b) => a.localeCompare(b));
    const activeSpecies = speciesList.length ? speciesList.join(',') : null;

    return {
      id_fa: Number(fa.id_fa),
      id_personne: Number(fa.id_personne),
      date_agrement: DATE_FORMATTER(fa.date_agrement),
      statut: fa.statut,
      notes: fa.notes ?? null,
      nom: fa.personne.nom,
      prenom: fa.personne.prenom,
      email: fa.personne.email,
      tel: fa.personne.tel,
      ville: fa.personne.ville,
      pays: fa.personne.pays,
      jardin: toBooleanFlag(fa.personne.jardin),
      active_animals: activePlacements.length,
      total_placements: fa.placements.length,
      active_species: activeSpecies,
      next_end: nextEnd,
    };
  });

  return { rows };
});

ipcMain.handle('families:create', async (event, data: {
  id_personne: number;
  date_agrement: string;
  statut?: FamilleStatut;
  notes?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_personne) throw new Error('id_personne requis');
  const agreement = ensureDate(data.date_agrement);
  if (!agreement) throw new Error('date_agrement requise');

  const created = await prisma.famille_accueil.create({
    data: {
      id_personne: toBigInt(data.id_personne),
      date_agrement: agreement,
      statut: data.statut ?? 'active',
      notes: data.notes ?? null,
    },
    select: { id_fa: true },
  });

  return { id_fa: Number(created.id_fa) };
});

ipcMain.handle('families:update', async (event, data: {
  id_fa: number;
  date_agrement?: string;
  statut?: FamilleStatut;
  notes?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_fa) throw new Error('id_fa requis');

  const updateData: any = {};
  if (data.date_agrement !== undefined) {
    updateData.date_agrement = ensureDate(data.date_agrement);
  }
  if (data.statut !== undefined) updateData.statut = data.statut;
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  if (!Object.keys(updateData).length) return { ok: true, updated: 0 };

  await prisma.famille_accueil.update({
    where: { id_fa: toBigInt(data.id_fa) },
    data: updateData,
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('families:delete', async (event, id_fa: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  if (!id_fa) throw new Error('id_fa requis');

  const key = toBigInt(id_fa);
  const placementsCount = await prisma.placement_fa.count({
    where: { id_fa: key },
  });
  if (placementsCount > 0) {
    return { ok: false, message: `Impossible de supprimer : ${placementsCount} placement(s) lié(s)` };
  }

  try {
    await prisma.famille_accueil.delete({
      where: { id_fa: key },
    });
  } catch (err: any) {
    if (err?.code === 'P2003') {
      return { ok: false, message: 'Impossible de supprimer : contraintes liées à cette famille' };
    }
    throw err;
  }

  return { ok: true, deleted: 1 };
});

/* ====================
   PLACEMENTS
==================== */

const mapPlacementRow = (placement: any) => ({
  id_placement: Number(placement.id_placement),
  id_fa: Number(placement.id_fa),
  id_animal: Number(placement.id_animal),
  date_debut: DATE_FORMATTER(placement.date_debut),
  date_fin: DATE_FORMATTER(placement.date_fin),
  notes: placement.notes ?? null,
  animal_nom: placement.animal?.nom_usuel ?? null,
  animal_statut: placement.animal?.statut ?? null,
  espece_libelle: placement.animal?.espece?.libelle ?? null,
  fa_statut: placement.famille?.statut ?? undefined,
  fa_nom: placement.famille?.personne?.nom ?? undefined,
  fa_prenom: placement.famille?.personne?.prenom ?? undefined,
});

ipcMain.handle('families:placements:list', async (event, id_fa: number) => {
  requireAuthenticated(event.sender.id);
  if (!id_fa) throw new Error('id_fa requis');

  const placements = await prisma.placement_fa.findMany({
    where: { id_fa: toBigInt(id_fa) },
    include: {
      animal: {
        select: {
          nom_usuel: true,
          statut: true,
          espece: { select: { libelle: true } },
        },
      },
    },
    orderBy: [
      { date_debut: 'desc' },
      { id_placement: 'desc' },
    ],
  });

  const rows = placements.map((placement) => mapPlacementRow(placement));
  return { rows };
});

ipcMain.handle('families:placements:all', async (event) => {
  requireAuthenticated(event.sender.id);

  const placements = await prisma.placement_fa.findMany({
    include: {
      famille: {
        select: {
          statut: true,
          personne: {
            select: {
              nom: true,
              prenom: true,
            },
          },
        },
      },
      animal: {
        select: {
          nom_usuel: true,
          espece: { select: { libelle: true } },
        },
      },
    },
  });

  const rows = placements.map((placement) => ({
    ...mapPlacementRow(placement),
    fa_statut: placement.famille?.statut ?? null,
    fa_nom: placement.famille?.personne?.nom ?? null,
    fa_prenom: placement.famille?.personne?.prenom ?? null,
  }));

  return { rows };
});

ipcMain.handle('families:placements:create', async (event, data: {
  id_fa: number;
  id_animal: number;
  date_debut: string;
  date_fin?: string | null;
  notes?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_fa || !data?.id_animal || !data?.date_debut) {
    throw new Error('id_fa, id_animal et date_debut requis');
  }

  const date_debut = ensureDate(data.date_debut);
  if (!date_debut) throw new Error('date_debut invalide');

  const created = await prisma.placement_fa.create({
    data: {
      id_fa: toBigInt(data.id_fa),
      id_animal: toBigInt(data.id_animal),
      date_debut,
      date_fin: ensureDate(data.date_fin) ?? null,
      notes: data.notes ?? null,
    },
    select: { id_placement: true },
  });

  return { id_placement: Number(created.id_placement) };
});

ipcMain.handle('families:placements:update', async (event, data: {
  id_placement: number;
  date_debut?: string;
  date_fin?: string | null;
  notes?: string | null;
}) => {
  requireRoleForSender(event.sender.id, ['admin', 'agent']);
  if (!data?.id_placement) throw new Error('id_placement requis');

  const updateData: any = {};
  if (data.date_debut !== undefined) {
    const parsed = ensureDate(data.date_debut);
    if (!parsed) throw new Error('date_debut invalide');
    updateData.date_debut = parsed;
  }
  if (data.date_fin !== undefined) {
    updateData.date_fin = ensureDate(data.date_fin);
  }
  if (data.notes !== undefined) updateData.notes = data.notes ?? null;

  if (!Object.keys(updateData).length) return { ok: true, updated: 0 };

  await prisma.placement_fa.update({
    where: { id_placement: toBigInt(data.id_placement) },
    data: updateData,
  });

  return { ok: true, updated: 1 };
});

ipcMain.handle('families:placements:delete', async (event, id_placement: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  if (!id_placement) throw new Error('id_placement requis');

  await prisma.placement_fa.delete({
    where: { id_placement: toBigInt(id_placement) },
  });

  return { ok: true, deleted: 1 };
});

/* ====================
   MATCHING
==================== */

ipcMain.handle('families:match', async (event, id_animal: number) => {
  requireAuthenticated(event.sender.id);
  if (!id_animal) throw new Error('id_animal requis');

  const animal = await prisma.animal.findUnique({
    where: { id_animal: toBigInt(id_animal) },
    select: {
      id_animal: true,
      nom_usuel: true,
      statut: true,
      id_espece: true,
      espece: { select: { libelle: true } },
    },
  });
  if (!animal) throw new Error('Animal introuvable');

  const behaviour = await prisma.note_comportement.findFirst({
    where: { id_animal: toBigInt(id_animal) },
    orderBy: [
      { date_note: 'desc' },
      { id_note: 'desc' },
    ],
    select: {
      ok_chiens: true,
      ok_chats: true,
      ok_enfants: true,
      score: true,
      date_note: true,
    },
  });

  const families = await prisma.famille_accueil.findMany({
    include: {
      personne: {
        select: {
          nom: true,
          prenom: true,
          email: true,
          tel: true,
          ville: true,
          pays: true,
          jardin: true,
        },
      },
      placements: {
        include: {
          animal: {
            select: {
              id_animal: true,
              espece: { select: { libelle: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { personne: { nom: 'asc' } },
      { personne: { prenom: 'asc' } },
    ],
  });

  const animalSpecies = animal.espece?.libelle ?? '';
  const matches: any[] = [];

  families.forEach((fa) => {
    if (fa.statut !== 'active') return;

    const activePlacements = fa.placements.filter((placement) => isPlacementActive(placement.date_fin));
    const speciesSet = new Set<string>();
    let nextEnd: string | null = null;

    activePlacements.forEach((placement) => {
      const libelle = placement.animal?.espece?.libelle;
      if (libelle) speciesSet.add(libelle);
      if (placement.date_fin) {
        const formatted = DATE_FORMATTER(placement.date_fin);
        if (formatted && (!nextEnd || formatted < nextEnd)) {
          nextEnd = formatted;
        }
      }
    });

    const speciesList = Array.from(speciesSet).map((s) => s.toLowerCase());
    const reasons: string[] = [];
    let score = 50;
    const activeAnimals = activePlacements.length;

    if (activeAnimals === 0) {
      score += 30;
      reasons.push('Disponible immédiatement');
    } else {
      score -= 15 * activeAnimals;
      if (nextEnd) reasons.push(`Disponible après le ${nextEnd}`);
      else reasons.push(`${activeAnimals} animal(s) déjà en accueil`);
    }

    if (speciesList.includes((animalSpecies ?? '').toLowerCase())) {
      score += 15;
      reasons.push(`Expérience récente avec ${animalSpecies.toLowerCase()}`);
    } else if (speciesList.length === 0) {
      score += 10;
      reasons.push('Aucune espèce en cours, grand disponible');
    } else {
      const joined = Array.from(speciesSet).join(',');
      score += 5;
      reasons.push(`Expérience actuelle : ${joined}`);
    }

    if (behaviour) {
      const okChiens = toBooleanFlag(behaviour.ok_chiens);
      const okChats = toBooleanFlag(behaviour.ok_chats);

      if (okChiens === 0) {
        if (speciesList.includes('chien')) {
          score -= 25;
          reasons.push('Animal non compatible chiens, FA héberge déjà un chien');
        } else {
          score += 8;
          reasons.push('Pas de chien actuellement en accueil');
        }
      }

      if (okChats === 0) {
        if (speciesList.includes('chat')) {
          score -= 25;
          reasons.push('Animal non compatible chats, FA héberge déjà un chat');
        } else {
          score += 8;
          reasons.push('Pas de chat actuellement en accueil');
        }
      }
    } else {
      reasons.push('Pas de note comportement récente');
    }

    if (toBooleanFlag(fa.personne.jardin) === 1) {
      score += 5;
      reasons.push('Famille avec jardin');
    }

    matches.push({
      id_fa: Number(fa.id_fa),
      score: Math.max(0, Math.round(score)),
      reasons,
      available_at: nextEnd ?? null,
      active_animals: activeAnimals,
      total_placements: fa.placements.length,
      nom: fa.personne.nom,
      prenom: fa.personne.prenom,
      email: fa.personne.email,
      ville: fa.personne.ville,
      pays: fa.personne.pays,
      tel: fa.personne.tel,
      active_species: Array.from(speciesSet).join(','),
    });
  });

  matches.sort((a, b) => b.score - a.score);

  return {
    animal: {
      id_animal: Number(animal.id_animal),
      nom_usuel: animal.nom_usuel,
      statut: animal.statut,
      id_espece: Number(animal.id_espece),
      espece_libelle: animal.espece?.libelle ?? null,
    },
    behaviour: behaviour
      ? {
          ok_chiens: toBooleanFlag(behaviour.ok_chiens),
          ok_chats: toBooleanFlag(behaviour.ok_chats),
          ok_enfants: toBooleanFlag(behaviour.ok_enfants),
          score: behaviour.score ?? null,
          date_note: DATE_FORMATTER(behaviour.date_note),
        }
      : null,
    matches,
  };
});

/* ====================
   ANIMAUX DISPONIBLES
==================== */

ipcMain.handle('families:animals:available', async (event) => {
  requireAuthenticated(event.sender.id);

  const animals = await prisma.animal.findMany({
    where: {
      placements_fa: {
        none: {
          OR: [
            { date_fin: null },
            { date_fin: { gte: todayMidnight() } },
          ],
        },
      },
    },
    include: {
      espece: { select: { libelle: true } },
    },
    orderBy: { date_arrivee: 'desc' },
  });

  const rows = animals.map((animal) => ({
    id_animal: Number(animal.id_animal),
    nom_usuel: animal.nom_usuel,
    statut: animal.statut,
    date_arrivee: DATE_FORMATTER(animal.date_arrivee),
    espece_libelle: animal.espece?.libelle ?? null,
  }));

  return { rows };
});

import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated } from './sys';

const DATE_FORMATTER = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const todayAtMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

ipcMain.handle('dashboard:summary', async (event) => {
  requireAuthenticated(event.sender.id);

  const today = todayAtMidnight();
  const inThirtyDays = new Date(today);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);

  const [
    animalsTotal,
    adoptablesTotal,
    animalsByStatus,
    adoptablesRecent,
    demandesRecent,
    demandesOpenTotal,
    demandesTotal,
    medicalUpcoming,
  ] = await Promise.all([
    prisma.animal.count(),
    prisma.animal.count({
      where: {
        statut: { notIn: ['adopte', 'decede', 'indisponible', 'transfere'] },
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
    }),
    prisma.animal.groupBy({
      by: ['statut'],
      _count: { _all: true },
    }),
    prisma.animal.findMany({
      where: {
        statut: { notIn: ['adopte', 'decede', 'indisponible', 'transfere'] },
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
      include: {
        espece: { select: { libelle: true } },
      },
      orderBy: [
        { date_arrivee: 'desc' },
        { id_animal: 'desc' },
      ],
      take: 5,
    }),
    prisma.demande_adoption.findMany({
      where: { statut: { in: ['soumise', 'en_etude', 'approuvee'] } },
      include: {
        personne: {
          select: {
            nom: true,
            prenom: true,
            email: true,
          },
        },
        _count: { select: { animaux: true } },
      },
      orderBy: [
        { date_depot: 'desc' },
        { id_demande: 'desc' },
      ],
      take: 6,
    }),
    prisma.demande_adoption.count({
      where: { statut: { in: ['soumise', 'en_etude', 'approuvee'] } },
    }),
    prisma.demande_adoption.count(),
    prisma.evenement_medical.findMany({
      where: {
        date_validite: {
          not: null,
          lte: inThirtyDays,
        },
      },
      include: {
        animal: {
          select: {
            nom_usuel: true,
            espece: { select: { libelle: true } },
          },
        },
      },
      orderBy: [
        { date_validite: 'asc' },
        { id_evt: 'asc' },
      ],
      take: 8,
    }),
  ]);

  const animalsSummary = {
    total: animalsTotal,
    adoptablesTotal,
    byStatus: animalsByStatus
      .map((row) => ({
        statut: row.statut ?? null,
        total: row._count._all,
      }))
      .sort((a, b) => b.total - a.total),
    adoptablesRecent: adoptablesRecent.map((animal) => ({
      id_animal: Number(animal.id_animal),
      nom_usuel: animal.nom_usuel,
      statut: animal.statut,
      date_arrivee: DATE_FORMATTER(animal.date_arrivee),
      espece_libelle: animal.espece?.libelle ?? '',
    })),
  };

  const demandesSummary = {
    total: demandesTotal,
    openTotal: demandesOpenTotal,
    recent: demandesRecent.map((demande) => ({
      id_demande: Number(demande.id_demande),
      nom: demande.personne?.nom ?? '',
      prenom: demande.personne?.prenom ?? '',
      email: demande.personne?.email ?? '',
      statut: demande.statut,
      date_depot: DATE_FORMATTER(demande.date_depot) ?? '',
      nb_animaux: demande._count.animaux,
    })),
  };

  const medicalSummary = {
    upcoming: medicalUpcoming.map((evt) => {
      const validite = evt.date_validite ? new Date(evt.date_validite) : null;
      const evtDate = evt.date_evt ? new Date(evt.date_evt) : null;
      let daysUntilDue: number | null = null;
      let isExpired = false;
      if (validite) {
        const diffMs = validite.getTime() - today.getTime();
        daysUntilDue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isExpired = diffMs < 0;
      }

      return {
        id_evt: Number(evt.id_evt),
        id_animal: Number(evt.id_animal),
        type: evt.type,
        sous_type: evt.sous_type ?? null,
        date_evt: DATE_FORMATTER(evtDate),
        date_validite: DATE_FORMATTER(validite),
        days_until_due: daysUntilDue,
        is_expired: isExpired,
        animal_nom: evt.animal?.nom_usuel ?? null,
        espece_libelle: evt.animal?.espece?.libelle ?? null,
      };
    }),
  };

  return {
    animals: animalsSummary,
    demandes: demandesSummary,
    medical: medicalSummary,
  };
});

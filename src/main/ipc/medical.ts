import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated, requireRoleForSender } from './sys';

type OverviewStatus = 'overdue' | 'due_soon' | 'upcoming' | 'unknown';

const DATE_FORMATTER = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const ensureDate = (value: string | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) throw new Error(`Date invalide: ${value}`);
  return d;
};

const requireDate = (value: string | null | undefined): Date => {
  const d = ensureDate(value);
  if (!d) throw new Error('Date requise');
  return d;
};

const toBigInt = (value: number | string | bigint | null | undefined): bigint => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error('Identifiant invalide');
  return BigInt(num);
};

const todayAtMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysBetween = (target: Date | null | undefined, today: Date) => {
  if (!target) return { days: null, isExpired: false };
  const diff = target.getTime() - today.getTime();
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    isExpired: diff < 0,
  };
};

const computeStatus = (validity: Date | null, today: Date, horizon: number): OverviewStatus => {
  if (!validity) return 'unknown';
  const diff = validity.getTime() - today.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= horizon * 24 * 60 * 60 * 1000) return 'due_soon';
  return 'upcoming';
};

const mapEventRow = (event: any, today: Date, horizon: number) => {
  const validite = event.date_validite ?? null;
  const validiteDate = validite ? new Date(validite) : null;
  const { days, isExpired } = daysBetween(validiteDate, today);

  return {
    id_evt: Number(event.id_evt),
    id_animal: Number(event.id_animal),
    type: event.type,
    sous_type: event.sous_type ?? null,
    date_evt: DATE_FORMATTER(event.date_evt),
    date_validite: DATE_FORMATTER(event.date_validite),
    id_veterinaire: event.id_veterinaire ? Number(event.id_veterinaire) : null,
    vet_id: event.veterinaire ? Number(event.veterinaire.id_vet) : null,
    vet_nom: event.veterinaire?.nom_cabinet ?? null,
    vet_contact: event.veterinaire?.contact ?? null,
    vet_adresse: event.veterinaire?.adresse ?? null,
    notes: event.notes ?? null,
    days_until_due: days,
    is_expired: isExpired,
    animal_nom: event.animal?.nom_usuel ?? null,
    espece_libelle: event.animal?.espece?.libelle ?? null,
    status: computeStatus(validiteDate, today, horizon),
  };
};

/* ====================
   LISTES D’ÉVÈNEMENTS
==================== */

ipcMain.handle(
  'medical:events:list',
  async (event, params: { id_animal?: number; upcoming?: boolean; horizonDays?: number } = {}) => {
    requireAuthenticated(event.sender.id);

    const today = todayAtMidnight();
    const horizon = Number.isFinite(params?.horizonDays) ? Number(params!.horizonDays) : 30;
    const horizonDate = new Date(today);
    horizonDate.setDate(horizonDate.getDate() + horizon);

    if (params.id_animal) {
      const rows = await prisma.evenement_medical.findMany({
        where: { id_animal: toBigInt(params.id_animal) },
        include: {
          veterinaire: true,
          animal: {
            select: {
              nom_usuel: true,
              espece: { select: { libelle: true } },
            },
          },
        },
        orderBy: [
          { date_evt: 'desc' },
          { id_evt: 'desc' },
        ],
      });

      return {
        rows: rows.map((row) => mapEventRow(row, today, horizon)),
      };
    }

    if (params.upcoming) {
      const rows = await prisma.evenement_medical.findMany({
        where: {
          date_validite: {
            not: null,
            lte: horizonDate,
          },
          date_evt: { lte: today },
        },
        include: {
          veterinaire: true,
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
        take: 25,
      });

      return {
        rows: rows.map((row) => mapEventRow(row, today, horizon)),
      };
    }

    const rows = await prisma.evenement_medical.findMany({
      include: {
        veterinaire: true,
        animal: {
          select: {
            nom_usuel: true,
            espece: { select: { libelle: true } },
          },
        },
      },
      orderBy: [
        { date_evt: 'desc' },
        { id_evt: 'desc' },
      ],
      take: 50,
    });

    return {
      rows: rows.map((row) => mapEventRow(row, today, horizon)),
    };
  }
);

/* ====================
   CRÉATION / MISE À JOUR / SUPPRESSION
==================== */

ipcMain.handle(
  'medical:events:create',
  async (
    event,
    payload: {
      id_animal: number;
      type: string;
      sous_type?: string | null;
      date_evt: string;
      date_validite?: string | null;
      id_veterinaire?: number | null;
      notes?: string | null;
    }
  ) => {
    requireRoleForSender(event.sender.id, ['admin', 'agent']);
    const id_animal = toBigInt(payload?.id_animal);
    const type = (payload?.type || '').trim();
    if (!type) throw new Error('Type requis');
    const date_evt = requireDate(payload?.date_evt);

    const created = await prisma.evenement_medical.create({
      data: {
        id_animal,
        type: type as any,
        sous_type: payload?.sous_type ?? null,
        date_evt,
        date_validite: ensureDate(payload?.date_validite),
        id_veterinaire:
          payload?.id_veterinaire === null || payload?.id_veterinaire === undefined
            ? null
            : toBigInt(payload.id_veterinaire),
        notes: payload?.notes ?? null,
      },
      select: { id_evt: true },
    });

    return { id_evt: Number(created.id_evt) };
  }
);

ipcMain.handle(
  'medical:events:update',
  async (
    event,
    payload: {
      id_evt: number;
      type?: string;
      sous_type?: string | null;
      date_evt?: string;
      date_validite?: string | null;
      id_veterinaire?: number | null;
      notes?: string | null;
    }
  ) => {
    requireRoleForSender(event.sender.id, ['admin', 'agent']);
    if (!payload?.id_evt) throw new Error('id_evt requis');

    const data: any = {};

    if (payload.type !== undefined) {
      const type = (payload.type || '').trim();
      if (!type) throw new Error('Type requis');
      data.type = type as any;
    }
    if (payload.sous_type !== undefined) {
      data.sous_type = payload.sous_type ?? null;
    }
    if (payload.date_evt !== undefined) {
      data.date_evt = requireDate(payload.date_evt);
    }
    if (payload.date_validite !== undefined) {
      data.date_validite = ensureDate(payload.date_validite);
    }
    if (payload.id_veterinaire !== undefined) {
      data.id_veterinaire =
        payload.id_veterinaire === null || payload.id_veterinaire === undefined
          ? null
          : toBigInt(payload.id_veterinaire);
    }
    if (payload.notes !== undefined) {
      data.notes = payload.notes ?? null;
    }

    if (Object.keys(data).length === 0) return { ok: true, updated: 0 };

    await prisma.evenement_medical.update({
      where: { id_evt: toBigInt(payload.id_evt) },
      data,
    });

    return { ok: true, updated: 1 };
  }
);

ipcMain.handle('medical:events:delete', async (event, id_evt: number) => {
  requireRoleForSender(event.sender.id, ['admin']);
  if (!id_evt) throw new Error('id_evt requis');

  await prisma.evenement_medical.delete({
    where: { id_evt: toBigInt(id_evt) },
  });

  return { ok: true, deleted: 1 };
});

/* ====================
   OVERVIEW
==================== */

ipcMain.handle(
  'medical:events:overview',
  async (
    event,
    params: {
      status?: 'overdue' | 'due_soon' | 'upcoming';
      type?: string;
      species?: string;
      horizonDays?: number;
    } = {}
  ) => {
    requireAuthenticated(event.sender.id);

    const today = todayAtMidnight();
    const horizon = Number.isFinite(params?.horizonDays) ? Number(params!.horizonDays) : 30;
    const horizonDate = new Date(today);
    horizonDate.setDate(horizonDate.getDate() + horizon);

    const where: any = {};

    if (params?.type) {
      where.type = params.type as any;
    }
    if (params?.species) {
      where.animal = {
        espece: { libelle: params.species },
      };
    }

    if (params?.status === 'overdue') {
      where.date_validite = {
        not: null,
        lt: today,
      };
    } else if (params?.status === 'due_soon') {
      where.date_validite = {
        not: null,
        gte: today,
        lte: horizonDate,
      };
    } else if (params?.status === 'upcoming') {
      where.date_validite = {
        not: null,
        gt: horizonDate,
      };
    }

    const rows = await prisma.evenement_medical.findMany({
      where,
      include: {
        veterinaire: true,
        animal: {
          select: {
            nom_usuel: true,
            espece: { select: { libelle: true } },
          },
        },
      },
    });

    rows.sort((a, b) => {
      const aDate = a.date_validite ? new Date(a.date_validite).getTime() : Infinity;
      const bDate = b.date_validite ? new Date(b.date_validite).getTime() : Infinity;
      if (aDate === bDate) return Number(b.id_evt - a.id_evt);
      return aDate - bDate;
    });

    return {
      rows: rows.map((row) => {
        const mapped = mapEventRow(row, today, horizon);
        return {
          ...mapped,
          status:
            params?.status === undefined || params?.status === null
              ? mapped.status
              : (mapped.status as OverviewStatus),
        };
      }),
    };
  }
);

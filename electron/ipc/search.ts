import { ipcMain } from 'electron';
import prisma from '../db/prisma';
import { requireAuthenticated } from './sys';

type SearchResultRow = {
  type: 'animal' | 'person' | 'user' | 'adoption';
  id: number;
  title: string;
  subtitle: string;
  route: string;
  query: Record<string, string>;
  score: number;
};

const contains = (value: string) => ({ contains: value });
const PERSON_TYPES = ['prospect', 'adoptant', 'fa', 'donateur', 'multiple'];
const USER_ROLES = ['admin', 'agent', 'benevole', 'veto_ext'];

function sanitizeTerm(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(term: string): string[] {
  return term
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function compact<T>(values: (T | null | undefined | false)[]): T[] {
  return values.filter((value): value is T => Boolean(value));
}

function computeScore(texts: (string | null | undefined)[], term: string): number {
  const normalized = term.toLowerCase();
  let score = 0;
  for (const text of texts) {
    if (!text) continue;
    const value = text.toLowerCase();
    if (value === normalized) score += 40;
    if (value.startsWith(normalized)) score += 20;
    if (value.includes(normalized)) score += 10;
  }
  return score;
}

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

ipcMain.handle('global:search', async (event, payload: { term?: string }) => {
  requireAuthenticated(event.sender.id);

  const termRaw = sanitizeTerm(payload?.term ?? '');
  if (!termRaw) return { rows: [] as SearchResultRow[] };

  const tokens = tokenize(termRaw);
  const lowerTerm = tokens.join(' ') || termRaw.toLowerCase();
  const digitsOnly = termRaw.replace(/\D+/g, '');
  const numericTerm = digitsOnly ? Number(digitsOnly) : NaN;
  const hasNumeric = Number.isFinite(numericTerm);

  const textTokens = tokens.length ? tokens : [lowerTerm];
  const results: SearchResultRow[] = [];

  // Animaux
  {
    const textFilter = {
      AND: textTokens.map((token) => ({
        OR: [
          { nom_usuel: contains(token) },
          { microchip_no: contains(token) },
          { espece: { libelle: contains(token) } },
        ],
      })),
    };

    const animals = await prisma.animal.findMany({
      where: {
        OR: compact([
          textFilter,
          hasNumeric ? { id_animal: BigInt(numericTerm) } : null,
        ]),
      },
      include: {
        espece: { select: { libelle: true } },
      },
      orderBy: { id_animal: 'desc' },
      take: 12,
    });

    for (const animal of animals) {
      const id = Number(animal.id_animal);
      const title = animal.nom_usuel || `Animal #${id}`;
      const subtitleParts = compact([
        animal.espece?.libelle,
        animal.statut ? `Statut: ${animal.statut}` : null,
        animal.microchip_no ? `Puce: ${animal.microchip_no}` : null,
      ]);
      const subtitle = subtitleParts.join(' · ') || `ID ${id}`;
      const score = computeScore(
        [animal.nom_usuel, animal.espece?.libelle, animal.microchip_no, String(id)],
        lowerTerm
      );
      results.push({
        type: 'animal',
        id,
        title,
        subtitle,
        route: '/app/animals',
        query: { animalId: String(id) },
        score,
      });
    }
  }

  // Personnes
  {
    const textFilter = {
      AND: textTokens.map((token) => {
        const typeMatches = PERSON_TYPES.filter((type) => type.includes(token));
        const orClauses: any[] = [
          { nom: contains(token) },
          { prenom: contains(token) },
          { email: contains(token) },
        ];
        if (typeMatches.length) {
          orClauses.push({ type_personne: { in: typeMatches as any[] } });
        }
        return { OR: orClauses };
      }),
    };

    const people = await prisma.personne.findMany({
      where: {
        OR: compact([
          textFilter,
          hasNumeric ? { id_personne: BigInt(numericTerm) } : null,
          digitsOnly ? { tel: contains(digitsOnly) } : null,
        ]),
      },
      orderBy: { id_personne: 'desc' },
      take: 12,
    });

    for (const person of people) {
      const id = Number(person.id_personne);
      const title = `${person.nom ?? ''} ${person.prenom ?? ''}`.trim() || `Personne #${id}`;
      const subtitleParts = compact([
        person.email,
        person.tel,
        person.type_personne ? `Type: ${person.type_personne}` : null,
      ]);
      const subtitle = subtitleParts.join(' · ') || `ID ${id}`;
      const score = computeScore(
        [title, person.email, person.tel, person.type_personne, String(id)],
        lowerTerm
      );
      results.push({
        type: 'person',
        id,
        title,
        subtitle,
        route: '/app/people',
        query: { personId: String(id) },
        score,
      });
    }
  }

  // Utilisateurs
  {
    const textFilter = {
      AND: textTokens.map((token) => {
        const roleMatches = USER_ROLES.filter((role) => role.includes(token));
        const orClauses: any[] = [
          { nom: contains(token) },
          { prenom: contains(token) },
          { email: contains(token) },
        ];
        if (roleMatches.length) {
          orClauses.push({ role: { in: roleMatches as any[] } });
        }
        if (token === 'actif') orClauses.push({ actif: true });
        if (token === 'inactif' || token === 'inactifs' || token === 'inactif(e)' || token === 'inactive') {
          orClauses.push({ actif: false });
        }
        return { OR: orClauses };
      }),
    };

    const users = await prisma.utilisateur.findMany({
      where: {
        OR: compact([
          textFilter,
          hasNumeric ? { id_user: BigInt(numericTerm) } : null,
        ]),
      },
      orderBy: { id_user: 'desc' },
      take: 10,
    });

    for (const user of users) {
      const id = Number(user.id_user);
      const title = `${user.nom ?? ''} ${user.prenom ?? ''}`.trim() || `Utilisateur #${id}`;
      const subtitleParts = compact([
        user.email,
        user.role ? `Rôle: ${user.role}` : null,
        user.actif ? 'Actif' : 'Inactif',
      ]);
      const subtitle = subtitleParts.join(' · ') || `ID ${id}`;
      const score = computeScore(
        [title, user.email, user.role, String(id)],
        lowerTerm
      );
      results.push({
        type: 'user',
        id,
        title,
        subtitle,
        route: '/app/users',
        query: { userId: String(id) },
        score,
      });
    }
  }

  // Contrats d’adoption
  {
    const textFilter = {
      AND: textTokens.map((token) => ({
        OR: [
          { numero_contrat: contains(token) },
          { personne: { nom: contains(token) } },
          { personne: { prenom: contains(token) } },
          { animal: { nom_usuel: contains(token) } },
        ],
      })),
    };

    const adoptions = await prisma.adoption.findMany({
      where: {
        OR: compact([
          textFilter,
          hasNumeric ? { id_adoption: BigInt(numericTerm) } : null,
          hasNumeric ? { id_animal: BigInt(numericTerm) } : null,
        ]),
      },
      include: {
        animal: {
          select: { id_animal: true, nom_usuel: true },
        },
        personne: {
          select: { id_personne: true, nom: true, prenom: true },
        },
      },
      orderBy: { date_contrat: 'desc' },
      take: 12,
    });

    for (const adoption of adoptions) {
      const id = Number(adoption.id_adoption);
      const numero = adoption.numero_contrat || `Contrat #${id}`;
      const title = `Contrat ${numero}`;
      const subtitleParts = compact([
        adoption.animal?.nom_usuel
          ? `Animal: ${adoption.animal.nom_usuel}`
          : adoption.animal
          ? `Animal #${Number(adoption.animal.id_animal)}`
          : null,
        adoption.personne
          ? `Adoptant: ${(adoption.personne.nom ?? '')} ${(adoption.personne.prenom ?? '')}`.trim()
          : null,
        adoption.statut ? `Statut: ${adoption.statut}` : null,
        adoption.date_contrat ? `Date: ${formatDate(adoption.date_contrat)}` : null,
      ]);
      const subtitle = subtitleParts.join(' · ') || `ID ${id}`;
      const score = computeScore(
        [
          numero,
          adoption.animal?.nom_usuel,
          adoption.personne?.nom,
          adoption.personne?.prenom,
          String(id),
        ],
        lowerTerm
      );
      results.push({
        type: 'adoption',
        id,
        title,
        subtitle,
        route: '/app/adoption',
        query: { adoptionId: String(id) },
        score,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return { rows: results.slice(0, 40) };
});

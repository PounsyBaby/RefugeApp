import 'dotenv/config';
import prisma from './prisma';

type SpeciesMap = Record<string, number>;
type RaceKey = `${string}::${string}`;
type RaceMap = Record<RaceKey, number>;
type PersonMap = Record<string, number>;
type AnimalMap = Record<string, number>;

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide: ${value}`);
  }
  return date;
};

async function ensureSpecies(): Promise<SpeciesMap> {
  const labels = ['Chien', 'Chat', 'Lapin'];
  await Promise.all(
    labels.map((libelle) =>
      prisma.espece.upsert({
        where: { libelle },
        update: {},
        create: { libelle },
      })
    )
  );

  const rows = await prisma.espece.findMany({
    select: { id_espece: true, libelle: true },
  });

  return rows.reduce<SpeciesMap>((acc, row) => {
    acc[row.libelle] = Number(row.id_espece);
    return acc;
  }, {});
}

async function ensureRaces(species: SpeciesMap): Promise<RaceMap> {
  const races = [
    { espece: 'Chien', libelle: 'Berger Australien' },
    { espece: 'Chien', libelle: 'Labrador' },
    { espece: 'Chat', libelle: 'Européen' },
    { espece: 'Chat', libelle: 'Siamois' },
    { espece: 'Lapin', libelle: 'Nain' },
  ] as const;

  for (const race of races) {
    const idEspece = species[race.espece];
    if (!idEspece) continue;

    await prisma.race.upsert({
      where: {
        id_espece_libelle: {
          id_espece: BigInt(idEspece),
          libelle: race.libelle,
        },
      },
      update: {},
      create: {
        id_espece: BigInt(idEspece),
        libelle: race.libelle,
      },
    });
  }

  const rows = await prisma.race.findMany({
    select: { id_race: true, libelle: true, id_espece: true },
  });

  return rows.reduce<RaceMap>((acc, row) => {
    const especeEntry = Object.entries(species).find(
      ([, id]) => id === Number(row.id_espece)
    );
    if (!especeEntry) return acc;
    const [espece] = especeEntry;
    acc[`${espece}::${row.libelle}`] = Number(row.id_race);
    return acc;
  }, {});
}

async function ensurePeople(): Promise<PersonMap> {
  const people = [
    {
      nom: 'Dupont',
      prenom: 'Paul',
      email: 'paul.dupont@example.com',
      tel: '+33 6 00 00 00 01',
      date_naissance: '1990-03-12',
      rue: 'Rue des Lilas',
      numero: '12',
      code_postal: '75011',
      ville: 'Paris',
      pays: 'France',
      type_personne: 'adoptant',
      jardin: true,
    },
    {
      nom: 'Martin',
      prenom: 'Sophie',
      email: 'sophie.martin@example.com',
      tel: '+33 6 00 00 00 02',
      date_naissance: '1988-10-05',
      rue: 'Avenue Victor Hugo',
      numero: '5',
      code_postal: '69002',
      ville: 'Lyon',
      pays: 'France',
      type_personne: 'fa',
      jardin: false,
    },
    {
      nom: 'Bernard',
      prenom: 'Lucie',
      email: 'lucie.bernard@example.com',
      tel: '+33 6 00 00 00 03',
      date_naissance: '1995-05-20',
      rue: 'Chemin des Prés',
      numero: '27',
      code_postal: '31000',
      ville: 'Toulouse',
      pays: 'France',
      type_personne: 'multiple',
      jardin: true,
    },
  ] as const;

  for (const p of people) {
    await prisma.personne.upsert({
      where: { email: p.email.toLowerCase() },
      update: {
        nom: p.nom,
        prenom: p.prenom,
        tel: p.tel,
        date_naissance: toDate(p.date_naissance),
        rue: p.rue,
        numero: p.numero,
        code_postal: p.code_postal,
        ville: p.ville,
        pays: p.pays,
        type_personne: p.type_personne,
        jardin: p.jardin,
      },
      create: {
        nom: p.nom,
        prenom: p.prenom,
        email: p.email.toLowerCase(),
        tel: p.tel,
        date_naissance: toDate(p.date_naissance),
        rue: p.rue,
        numero: p.numero,
        code_postal: p.code_postal,
        ville: p.ville,
        pays: p.pays,
        type_personne: p.type_personne,
        jardin: p.jardin,
      },
    });
  }

  const rows = await prisma.personne.findMany({
    select: { id_personne: true, email: true },
  });

  return rows.reduce<PersonMap>((acc, row) => {
    acc[row.email] = Number(row.id_personne);
    return acc;
  }, {});
}

async function ensureEmplacements(): Promise<Record<string, number>> {
  const emplacements = [
    { code: 'CHENIL-A1', type: 'Box chien', capacite: 2, actif: true },
    { code: 'CHENIL-B1', type: 'Box chien', capacite: 1, actif: true },
    { code: 'CHAT-R1', type: 'Salle chat', capacite: 6, actif: true },
  ] as const;

  for (const e of emplacements) {
    await prisma.emplacement.upsert({
      where: { code: e.code },
      update: {
        type: e.type,
        capacite: e.capacite,
        actif: e.actif,
      },
      create: {
        code: e.code,
        type: e.type,
        capacite: e.capacite,
        actif: e.actif,
      },
    });
  }

  const rows = await prisma.emplacement.findMany({
    select: { id_emplacement: true, code: true },
  });

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.code] = Number(row.id_emplacement);
    return acc;
  }, {});
}

async function ensureAnimals(species: SpeciesMap): Promise<AnimalMap> {
  const animals = [
    {
      nom_usuel: 'Mina',
      espece: 'Chat',
      sexe: 'F',
      date_naissance: '2021-06-01',
      date_arrivee: '2023-07-15',
      statut: 'adoptable',
      couleur_robe: 'Tigrée',
      poids_kg: 4.2,
      sterilise: true,
      date_sterilisation: '2022-02-01',
      microchip_no: 'CHIP-CAT-0001',
      description: 'Chatte très sociable et joueuse.',
    },
    {
      nom_usuel: 'Rex',
      espece: 'Chien',
      sexe: 'M',
      date_naissance: '2019-03-11',
      date_arrivee: '2024-01-20',
      statut: 'reserve',
      couleur_robe: 'Noir et feu',
      poids_kg: 28.5,
      sterilise: true,
      date_sterilisation: '2021-08-18',
      microchip_no: 'CHIP-DOG-0001',
      description: 'Berger australien énergique, adore les balades.',
    },
    {
      nom_usuel: 'Cookie',
      espece: 'Lapin',
      sexe: 'Inconnu',
      date_naissance: '2022-04-05',
      date_arrivee: '2024-03-02',
      statut: 'arrive',
      couleur_robe: 'Blanc et brun',
      poids_kg: 1.4,
      sterilise: false,
      date_sterilisation: null,
      microchip_no: 'CHIP-RAB-0001',
      description: 'Lapin curieux, habitué aux enfants.',
    },
  ] as const;

  for (const a of animals) {
    const idEspece = species[a.espece];
    if (!idEspece) continue;

    await prisma.animal.upsert({
      where: { microchip_no: a.microchip_no },
      update: {
        nom_usuel: a.nom_usuel,
        id_espece: BigInt(idEspece),
        sexe: a.sexe,
        date_naissance: toDate(a.date_naissance),
        date_arrivee: toDate(a.date_arrivee) ?? new Date(),
        statut: a.statut,
        couleur_robe: a.couleur_robe,
        poids_kg: a.poids_kg,
        sterilise: a.sterilise,
        date_sterilisation: toDate(a.date_sterilisation),
        description: a.description,
      },
      create: {
        nom_usuel: a.nom_usuel,
        id_espece: BigInt(idEspece),
        sexe: a.sexe,
        date_naissance: toDate(a.date_naissance),
        date_arrivee: toDate(a.date_arrivee) ?? new Date(),
        statut: a.statut,
        couleur_robe: a.couleur_robe,
        poids_kg: a.poids_kg,
        sterilise: a.sterilise,
        date_sterilisation: toDate(a.date_sterilisation),
        microchip_no: a.microchip_no,
        description: a.description,
      },
    });
  }

  const rows = await prisma.animal.findMany({
    select: { id_animal: true, microchip_no: true },
    where: { microchip_no: { not: null } },
  });

  return rows.reduce<AnimalMap>((acc, row) => {
    if (row.microchip_no) {
      acc[row.microchip_no] = Number(row.id_animal);
    }
    return acc;
  }, {});
}

async function linkAnimalRaces(animals: AnimalMap, races: RaceMap) {
  const links = [
    { microchip: 'CHIP-DOG-0001', race: 'Chien::Berger Australien', pourcentage: 100 },
    { microchip: 'CHIP-CAT-0001', race: 'Chat::Siamois', pourcentage: 50 },
    { microchip: 'CHIP-CAT-0001', race: 'Chat::Européen', pourcentage: 50 },
  ] as const;

  for (const link of links) {
    const idAnimal = animals[link.microchip];
    const idRace = races[link.race];
    if (!idAnimal || !idRace) continue;

    await prisma.animal_race.upsert({
      where: {
        id_animal_id_race: {
          id_animal: BigInt(idAnimal),
          id_race: BigInt(idRace),
        },
      },
      update: { pourcentage: link.pourcentage ?? null },
      create: {
        id_animal: BigInt(idAnimal),
        id_race: BigInt(idRace),
        pourcentage: link.pourcentage ?? null,
      },
    });
  }
}

async function placeAnimals(animals: AnimalMap, emplacements: Record<string, number>) {
  const placements = [
    { microchip: 'CHIP-DOG-0001', code: 'CHENIL-A1', date_debut: '2024-01-21', date_fin: null },
    { microchip: 'CHIP-CAT-0001', code: 'CHAT-R1', date_debut: '2023-07-16', date_fin: null },
  ] as const;

  for (const placement of placements) {
    const idAnimal = animals[placement.microchip];
    const idEmplacement = emplacements[placement.code];
    if (!idAnimal || !idEmplacement) continue;

    await prisma.animal_emplacement.upsert({
      where: {
        id_animal_date_debut: {
          id_animal: BigInt(idAnimal),
          date_debut: toDate(placement.date_debut) ?? new Date(),
        },
      },
      update: {
        id_emplacement: BigInt(idEmplacement),
        date_fin: toDate(placement.date_fin),
      },
      create: {
        id_animal: BigInt(idAnimal),
        id_emplacement: BigInt(idEmplacement),
        date_debut: toDate(placement.date_debut) ?? new Date(),
        date_fin: toDate(placement.date_fin),
      },
    });
  }
}

async function seedAdoptionFlow(animals: AnimalMap, people: PersonMap) {
  const paulId = people['paul.dupont@example.com'];
  if (!paulId) return;

  const kommentar = 'Demande demo Mina & Rex';
  const existingDemande = await prisma.demande_adoption.findFirst({
    where: {
      id_personne: BigInt(paulId),
      commentaire: kommentar,
    },
    select: { id_demande: true },
  });

  let demandeId = existingDemande ? Number(existingDemande.id_demande) : null;

  if (!demandeId) {
    const dateDepot = new Date();
    dateDepot.setDate(dateDepot.getDate() - 10);

    const created = await prisma.demande_adoption.create({
      data: {
        id_personne: BigInt(paulId),
        date_depot: dateDepot,
        statut: 'en_etude',
        type_logement: 'Maison',
        jardin: true,
        accord_proprio: true,
        enfants: true,
        autres_animaux: 'Un chat',
        experience_animaux: 'Expérience avec chiens de berger',
        preferences: 'Animal sportif',
        commentaire: kommentar,
      },
      select: { id_demande: true },
    });
    demandeId = Number(created.id_demande);
  }

  if (!demandeId) return;

  const rexId = animals['CHIP-DOG-0001'];
  const minaId = animals['CHIP-CAT-0001'];

  if (rexId) {
    await prisma.demande_animal.upsert({
      where: {
        id_demande_id_animal: {
          id_demande: BigInt(demandeId),
          id_animal: BigInt(rexId),
        },
      },
      update: { priorite: 1 },
      create: {
        id_demande: BigInt(demandeId),
        id_animal: BigInt(rexId),
        priorite: 1,
      },
    });
  }

  if (minaId) {
    await prisma.demande_animal.upsert({
      where: {
        id_demande_id_animal: {
          id_demande: BigInt(demandeId),
          id_animal: BigInt(minaId),
        },
      },
      update: { priorite: 2 },
      create: {
        id_demande: BigInt(demandeId),
        id_animal: BigInt(minaId),
        priorite: 2,
      },
    });
  }
}

async function main() {
  const species = await ensureSpecies();
  const races = await ensureRaces(species);
  const people = await ensurePeople();
  const emplacements = await ensureEmplacements();
  const animals = await ensureAnimals(species);

  await linkAnimalRaces(animals, races);
  await placeAnimals(animals, emplacements);
  await seedAdoptionFlow(animals, people);

  console.log('✔ Données de démonstration insérées');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Erreur seed sample', err);
    await prisma.$disconnect();
    process.exit(1);
  });

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import prisma from '../src/main/db/prisma';

async function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log('🔎 Smoke test démarré');

  const admin = await prisma.utilisateur.findFirst({
    where: { role: 'admin', actif: true },
    select: { id_user: true },
  });
  await assert(!!admin, 'Aucun administrateur actif présent dans la base');
  console.log('✅ Admin trouvé');

  const animalsRows = await prisma.animal.findMany({
    select: {
      id_animal: true,
      nom_usuel: true,
      statut: true,
    },
    orderBy: [{ id_animal: 'desc' }],
    take: 5,
  });
  const animals = animalsRows.map((row) => ({
    id_animal: Number(row.id_animal),
    nom_usuel: row.nom_usuel,
    statut: row.statut,
  }));

  await assert(animals.length > 0, 'Aucun animal en base');
  console.log(`✅ Animaux disponibles (${animals.length} échantillons)`);

  const adoptable = animals.find((a) => a.statut !== 'decede');
  await assert(!!adoptable, 'Aucun animal admissible pour la démo');

  const email = `smoke+${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const person = await prisma.personne.create({
    data: {
      nom: 'Test',
      prenom: 'Smoke',
      email,
      type_personne: 'prospect',
      jardin: false,
    },
    select: { id_personne: true },
  });
  const personId = Number(person.id_personne);
  console.log(`✅ Personne temporaire créée (#${personId})`);

  const demande = await prisma.demande_adoption.create({
    data: {
      id_personne: BigInt(personId),
      date_depot: new Date(),
      statut: 'soumise',
      type_logement: 'Appartement',
      jardin: false,
    },
    select: { id_demande: true },
  });
  const demandeId = Number(demande.id_demande);
  console.log(`✅ Demande créée (#${demandeId})`);

  await prisma.demande_animal.create({
    data: {
      id_demande: BigInt(demandeId),
      id_animal: BigInt(adoptable!.id_animal),
      priorite: 1,
    },
  });
  console.log(`✅ Animal #${adoptable!.id_animal} lié à la demande`);

  // Cleanup
  await prisma.demande_animal.deleteMany({
    where: { id_demande: BigInt(demandeId) },
  });
  await prisma.demande_adoption.delete({
    where: { id_demande: BigInt(demandeId) },
  });
  await prisma.personne.delete({
    where: { id_personne: BigInt(personId) },
  });
  console.log('🧹 Nettoyage effectué');

  console.log('🎉 Smoke test terminé avec succès');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('❌ Smoke test échoué', err);
    await prisma.$disconnect();
    process.exit(1);
  });

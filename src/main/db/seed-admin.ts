import 'dotenv/config';
import argon2 from 'argon2';
import prisma from './prisma';

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@test.com';
  const password = process.env.SEED_ADMIN_PASSWORD || '123456';
  const hash = await argon2.hash(password);

  await prisma.utilisateur.upsert({
    where: { email: email.toLowerCase() },
    update: {
      motdepasse_hash: hash,
      actif: true,
      nom: 'Admin',
      prenom: 'Test',
      role: 'admin',
    },
    create: {
      nom: 'Admin',
      prenom: 'Test',
      email: email.toLowerCase(),
      motdepasse_hash: hash,
      role: 'admin',
      actif: true,
    },
  });

  console.log(`✅ Admin seedé : ${email} / ${password}`);
}

seedAdmin()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Erreur seed admin', err);
    await prisma.$disconnect();
    process.exit(1);
  });

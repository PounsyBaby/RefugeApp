# Refuge Animalier Pro

Client lourd Electron + Vue 3 + TypeScript + MySQL. Application desktop pour gérer un refuge (personnes, animaux, adoptions, familles d’accueil, santé…).

---

## Aperçu rapide (nouvelle machine)

```bash
git clone .../refugeapp
cd refugeapp
cp .env.example .env   # compléter les secrets et l’URL MySQL
npm install            # installe les deps + prisma generate
npm run db:setup       # crée le schéma
npm run seed:admin     # crée l’admin de démo
npm run seed:sample    # données d’exemple
npm run dev            # lance l’app Electron en watch
```

---

## Prérequis

- **Node.js ≥ 18** (développé/testé en **20.x**). Sur macOS : `nvm use 20` recommandé.
- **npm** (10+) ou équivalent.
- **MySQL ≥ 8.0** accessible localement ou via réseau.
- Accès disque en écriture pour `.vite/`, `out/` et la base.

---

## Configuration

Modèle : `.env.example` → `.env`.

| Variable                    | Description |
| --------------------------- | ----------- |
| `DATABASE_URL`              | URL Prisma `mysql://user:pass@host:port/db` |
| `JWT_SECRET`                | Secret JWT pour la session |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Identifiants de l’admin de démo |

> Assurez-vous que la base MySQL ciblée existe et que l’utilisateur a les droits (CREATE/ALTER/INSERT).

---

## Scripts utiles

| Script | Usage |
| ------ | ----- |
| `npm run dev` | Démarre l’app via Electron Forge + Vite en watch |
| `npm run build` / `npm run package` | Compile sans créer d’installeur (sorties dans `.vite/`) |
| `npm run make` | Génère les artefacts (Squirrel/Zip/Deb/RPM) dans `out/` |
| `npm run db:setup` | Applique le schéma SQL (Prisma) |
| `npm run seed:admin` | Crée l’admin de démo |
| `npm run seed:sample` | Données d’exemple (espèces, animaux…) |
| `npm run prisma:generate` | Régénère le client Prisma (déjà fait en `postinstall`) |
| `npm run lint` | ESLint |
| `npm run test:smoke` | Vérifie qu’on peut créer/supprimer une demande d’adoption |

Les scripts `seed:*` et `test:smoke` utilisent `ts-node` avec `tsconfig.node.json`.

---

## Structure

```
src/
  main/          # Process main, IPC, Prisma
    db/          # Prisma client, setup, seeds
    ipc/         # Cas métiers (adoption, familles, santé…)
    security/    # Hardening fenêtre/session
  preload/       # bridge exposé au renderer
  renderer/      # Vue 3, router, vues
  shared/        # Types partagés
prisma/          # schema.prisma (génère .prisma/client)
scripts/         # utilitaires (smoke-test)
```

---

## Build / packaging

```bash
npm run make
```

Les bundles intermédiaires sont dans `.vite/`; les artefacts finaux dans `out/`.

---

## Dépannage (problèmes fréquents)

- **`Cannot find module 'vue-router'` ou écran blanc** : `vue-router@^4` est une dépendance directe du renderer. Vérifier que l’installation s’est bien faite (`npm install` à la racine). Si besoin : `npm install vue-router@4` puis relancer `npm run dev`.
- **Version de Node incompatible** (erreurs Vite/Electron ou Prisma engine) : utiliser Node 20 LTS (`nvm use 20`). Supprimer `node_modules` si nécessaire puis réinstaller.
- **MySQL inaccessible** (`ECONNREFUSED`, `ER_ACCESS_DENIED_ERROR`, `CLIENT_UNSUPPORTED_AUTH`) : vérifier `DATABASE_URL`, que MySQL écoute sur le bon host/port et que l’utilisateur possède les droits. Sur macOS avec MySQL 8, préférer l’auth `mysql_native_password` pour l’utilisateur utilisé.
- **Prisma ne se génère pas** (`Binary for current platform not found`) : `npm run prisma:generate` après avoir vidé `node_modules`; vérifier que le poste a accès au réseau pour télécharger les engines Prisma lors de la première install.
- **Electron Forge ne démarre pas** : s’assurer que `npm run dev` est lancé depuis la racine, que `node_modules/.bin/electron` existe, et qu’aucun port critique n’est occupé.
- **Base non initialisée** : toujours lancer `npm run db:setup` puis `npm run seed:admin` avant les tests ou la démo. `test:smoke` suppose ces données présentes.

---

## Support rapide

- Logs main/preload : console du terminal qui lance `npm run dev`.
- Logs renderer : devtools Electron (`Cmd+Opt+I` sur macOS).
- Inspection de la base : `npx prisma studio`.
- Santé minimale : `npm run test:smoke`.

---

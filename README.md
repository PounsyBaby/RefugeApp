# Refuge Animalier Pro

Client lourd Electron + Vue 3 pour la gestion d’un refuge : personnes, animaux, adoptions, familles d’accueil, santé…  

---

## Prérequis

- **Node.js** ≥ 18 (développé avec Node 20)
- **npm** (ou pnpm/yarn si adapté)
- **MySQL** ≥ 8.0
- Une base dédiée (par défaut `refuge`)

---

## Installation

```bash
cd refugeapp
npm install
```

Les modules Prisma sont générés automatiquement via le `postinstall`.  
Si besoin, régénérer manuellement :

```bash
npm run prisma:generate
```

---

## Configuration

1. Copier le modèle `.env.example` :

   ```bash
   cp .env.example .env
   ```

2. Ajuster les variables :

   | Variable              | Description                                     |
   | --------------------- | ----------------------------------------------- |
   | `MYSQL_HOST`          | Hôte MySQL                                      |
   | `MYSQL_PORT`          | Port MySQL                                      |
   | `MYSQL_USER`/`PASSWORD` | Identifiants MySQL                           |
   | `MYSQL_DB`            | Base utilisée par Prisma et les scripts         |
   | `DATABASE_URL`        | URL complète pour Prisma (`mysql://…`)          |
   | `JWT_SECRET`          | Secret JWT pour l’authentification              |
   | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Identifiants du compte admin de démonstration |

Assurez-vous que la connexion MySQL fonctionne avant de lancer les scripts.

---

## Base de données & seeds

1. **Initialiser le schéma** (exécute `src/main/db/schema.sql`) :

   ```bash
   npm run db:setup
   ```

2. **Créer l’admin de démo** :

   ```bash
   npm run seed:admin
   ```

3. **Insérer des données d’exemple** (espèces, animaux, demandes, etc.) :

   ```bash
   npm run seed:sample
   ```

Ces scripts utilisent Prisma (`src/main/db/seed-*.ts`). Ils peuvent être relancés sans casser les données : upsert sur les clés naturelles quand c’est possible.

---

## Lancer l’application en développement

```bash
npm run dev
```

Cette commande est un alias de `electron-forge start` :

- le plugin Vite gère automatiquement le hot-reload du renderer, du preload et du process main ;
- Electron Forge relance la fenêtre dès que le bundle main/preload change ;
- Les logs renderer/main sont regroupés dans la console.

---

## Scripts utiles

| Script           | Description |
| ---------------- | ----------- |
| `npm run dev`    | Lance l’appli via Electron Forge (Vite en mode watch) |
| `npm run build` / `npm run package` | Compile l’appli sans générer d’installeur (sortie dans `.vite/`) |
| `npm run make`   | Génère les artefacts (Squirrel/Zip/Deb/RPM) via Forge |
| `npm run lint`   | ESLint sur tout le projet |
| `npm run test:smoke` | Vérification rapide : présence admin, création/suppression d’une demande d’adoption |

> `test:smoke`, `seed:admin` et `seed:sample` utilisent `ts-node` avec `tsconfig.node.json`. Assurez-vous que MySQL tourne et que les variables d’environnement sont correctes avant exécution.

---

## Structure principale

```
src/
  main/            # Process main, handlers IPC et accès Prisma
    db/            # Scripts DB (setup, seeds, client Prisma)
    ipc/           # Modules métier (adoption, familles, ...)
    security/      # Hardening des sessions/contexts
  preload/         # Pont contextBridge exposé au renderer
  renderer/        # App Vue 3 (composants, vues, router)
  shared/          # Types/interfaces partagés entre process
prisma/            # schema.prisma, généré par Prisma
scripts/           # Scripts utilitaires (smoke-test)
.vite/             # Sorties Vite (main, preload, renderer)
out/               # Paquets générés par Electron Forge
```

Tous les modules IPC (`src/main/ipc/*.ts`) parlent désormais à Prisma (`src/main/db/prisma.ts`).  
Aucun accès SQL brut n’est conservé.

Les styles communs (`.page`, `.card`, `.btn`, `.banner`, `.table`, …) sont centralisés dans `src/renderer/style.css`. Les vues ne gardent désormais que leurs ajustements spécifiques ; réutilisez ces classes pour conserver une interface homogène.

---

## Notes de migration Prisma

- Les scripts de seed et de test ont été convertis à Prisma (`src/main/db/seed-admin.ts`, `src/main/db/seed-sample.ts`, `scripts/smoke-test.ts`).
- L’ancien helper `src/main/db/repo.ts` (SQL brut) a été supprimé.
- Les enums Prisma sont utilisés via leurs valeurs (ex. `type_personne: 'prospect'`), ce qui évite toute dépendance à `$Enums` côté scripts.

---

## Déploiement / build

Pour générer l’application prête à empaqueter :

```bash
npm run make
```

Les bundles intermédiaires sont produits dans `.vite/` (main, preload, renderer) et les artefacts (Squirrel/zip/deb/rpm) se retrouvent dans `out/`.

---

## Support / debug

- Vérifier la console main (bundle `.vite/build/main.js`) pour toute erreur IPC.
- Prisma : `npx prisma studio` pour inspecter rapidement la base.
- Tests rapides : `npm run test:smoke`.

---

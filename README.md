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
cd refuge-pro-vue
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

1. **Initialiser le schéma** (exécute `electron/db/schema.sql`) :

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

Ces scripts utilisent Prisma (`electron/db/seed-*.ts`). Ils peuvent être relancés sans casser les données : upsert sur les clés naturelles quand c’est possible.

---

## Lancer l’application en développement

```bash
npm run dev
```

Cette commande lance :

- `npm:dev:renderer` – Vite (front Vue 3)
- `npm:dev:main` – compilation TS → `dist-electron`
- `npm:dev:electron` – instance Electron avec rechargement (throttle 1,2 s via `nodemon.json` pour éviter les redémarrages multiples pendant la recompilation)

L’app s’ouvre automatiquement après que Vite soit prêt (port 5173).

---

## Scripts utiles

| Script           | Description |
| ---------------- | ----------- |
| `npm run build`  | Build production (renderer + main process) |
| `npm run lint`   | ESLint sur tout le projet |
| `npm run test:smoke` | Vérification rapide : présence admin, création/suppression d’une demande d’adoption |

> `test:smoke`, `seed:admin` et `seed:sample` utilisent `ts-node` avec `tsconfig.node.json`. Assurez-vous que MySQL tourne et que les variables d’environnement sont correctes avant exécution.

---

## Structure principale

```
electron/          # Process main & handlers IPC
  db/              # Scripts DB (setup, seeds, client Prisma)
  ipc/             # Modules métier (adoption, families, ...)
prisma/            # schema.prisma, généré par Prisma
scripts/           # Scripts utilitaires (smoke-test)
src/               # Renderer Vue 3
dist-electron/     # Code TS compilé pour Electron (généré)
```

Tous les modules IPC (`electron/ipc/*.ts`) parlent désormais à Prisma (`electron/db/prisma.ts`).  
Aucun accès SQL brut n’est conservé.

Les styles communs (`.page`, `.card`, `.btn`, `.banner`, `.table`, …) sont centralisés dans `src/style.css`. Les vues ne gardent désormais que leurs ajustements spécifiques ; réutilisez ces classes pour conserver une interface homogène.

---

## Notes de migration Prisma

- Les scripts de seed et de test ont été convertis à Prisma (`electron/db/seed-admin.ts`, `electron/db/seed-sample.ts`, `scripts/smoke-test.ts`).
- L’ancien helper `electron/db/repo.ts` (SQL brut) a été supprimé.
- Les enums Prisma sont utilisés via leurs valeurs (ex. `type_personne: 'prospect'`), ce qui évite toute dépendance à `$Enums` côté scripts.

---

## Déploiement / build

Pour générer l’application prête à empaqueter :

```bash
npm run build
```

La sortie se trouve dans `dist/` (renderer) et `dist-electron/` (main process compilé).  
L’empaquetage Electron (makers) n’est pas fourni dans ce repo — à adapter selon votre outil (Electron Forge, Electron Builder, etc.).

---

## Support / debug

- Vérifier la console main (`dist-electron/main.js`) pour toute erreur IPC.
- Prisma : `npx prisma studio` pour inspecter rapidement la base.
- Tests rapides : `npm run test:smoke`.

---

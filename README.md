# Flux Atelier

Application web de gestion d'un atelier automobile. Elle centralise les entrées des véhicules, leur affectation aux équipes, leur emplacement sur le plan de l'atelier et le suivi des opérations jusqu'à la livraison.

Les données sont désormais enregistrées dans **PostgreSQL**. L'application React communique avec un serveur API Node.js ; aucun accès à Google Sheets ni aucun déploiement Google Apps Script n'est requis pour son fonctionnement.

## Fonctions de l'application

Le tableau de bord propose douze espaces de travail :

| Espace | Utilité |
| --- | --- |
| **Tableaux de chargement** | Voir les véhicules en atelier, filtrer par état, rechercher un véhicule et suivre son équipe, ses techniciens, son avancement et son emplacement. |
| **Parc véhicules & engins** | Rechercher et parcourir l'inventaire importé d'Excel. Chaque ligne donne accès aux 38 champs d'origine; les données sont enregistrées dans PostgreSQL. |
| **En cours** | Consulter les véhicules pris en charge et les opérations en cours. |
| **Essai** | Suivre les essais routiers et les contrôles qualité. |
| **Attente achat** | Créer et suivre les demandes d'achat de pièces et leurs statuts. |
| **Devis** | Suivre les demandes de devis, les appels clients, les relances et les décisions. |
| **Plan atelier** | Visualiser les véhicules sur le plan et leur emplacement dans l'atelier. |
| **Suivi des entrées** | Enregistrer une réception, modifier ou supprimer un dossier, retrouver les informations VIN et transmettre le véhicule à l'atelier. |
| **Suivi des temps** | Consulter les étapes chronologiques et les temps d'attente ou de travail associés à un véhicule. |
| **Gestion des accès** | Administrer les comptes, les rôles et les équipes attribuées. |
| **Gestion des équipes** | Gérer la liste des collaborateurs, leur équipe, leur matricule et leur fonction. |
| **Moyennes** | Consulter les indicateurs mensuels par équipe et modèle et régler la période affichée. |

### Rôles

- **Administration** : accès global et gestion des comptes.
- **Chef d'atelier** : supervision de l'atelier, des équipes et des indicateurs.
- **Réception** : entrées des véhicules, gestion des devis et consultation de l'inventaire du parc. L'accès à l'achat, aux essais et au suivi des temps est masqué.
- **Chef d'équipe** : tableaux de chargement, affectation et suivi des véhicules de son périmètre. La réception des véhicules, les devis, les achats et le suivi des temps sont masqués.

Les rôles sont définis dans `src/context/RoleContext.tsx` et `src/types/roles.ts`. Le serveur vérifie la session et réserve la gestion des comptes et des données d'équipe/moyennes aux rôles de direction.

## Architecture technique

```text
Navigateur (React + TypeScript)
        │ requêtes HTTP same-origin (/api)
        ▼
Serveur Node.js (server/index.mjs)
        │ pilote pg
        ▼
PostgreSQL
```

- **Interface** : React 19, TypeScript, Vite, Tailwind CSS et React Router.
- **API** : serveur HTTP Node.js sans framework, avec endpoints REST pour les sessions, les comptes et les collections de données.
- **Base de données** : PostgreSQL, connectée uniquement depuis le serveur avec `DATABASE_URL`. Cette variable ne doit jamais être préfixée par `VITE_` ni intégrée au code navigateur.
- **Session** : cookie `HttpOnly` signé par le serveur. Les mots de passe sont hachés côté serveur avec `scrypt` ; les réponses API ne transmettent pas de mot de passe.
- **Cache navigateur** : certaines vues gardent une copie locale pour accélérer l'affichage. PostgreSQL reste la source de données partagée entre utilisateurs.

### Schéma SQL

Le schéma est défini dans [`server/schema.sql`](server/schema.sql) et créé automatiquement au démarrage de l'API.

- `accounts` : utilisateurs, rôle, équipe et empreinte du mot de passe.
- `vehicles` : dossiers d'atelier, entrées de réception et fiches VIN. Les champs de recherche courants sont indexés ; le dossier complet est conservé dans `payload` en `JSONB` pour garder les données métier souples.
- `vehicle_inventory` : lignes du classeur « Liste des véhicules _ Engins »; les champs utilisés pour l'affichage et la recherche sont indexés dans des colonnes dédiées, et les 38 valeurs Excel d'origine sont conservées dans `raw_data` en `JSONB`.
- `app_records` : équipes, moyennes, achats, devis, contrôles/essais, temps, transferts, réaffectations et notifications. Chaque collection a une clé stable et un contenu `JSONB`.

Les endpoints principaux sont `/api/auth/*`, `/api/accounts`, `/api/data/:collection`, `/api/inventory/vehicles` et `/api/health`. Les actions métier historiques sont servies par `/api/actions` en JSON.

## Démarrage local

Prérequis : Node.js 22 ou plus récent et un serveur PostgreSQL accessible.

1. Créez une base et un utilisateur PostgreSQL avec les droits nécessaires.
2. Copiez `.env.example` vers `.env`, puis renseignez au minimum `DATABASE_URL`, `SESSION_SECRET`, `INITIAL_ADMIN_EMAIL` et `INITIAL_ADMIN_PASSWORD`. Choisissez des secrets propres à l'environnement et ne partagez pas `.env`.
3. Installez les dépendances et démarrez l'application :

   ```powershell
   npm install
   npm run dev
   ```

`npm run dev` démarre le serveur API sur `http://localhost:3001` et Vite sur `http://localhost:5174`. Le proxy Vite transmet `/api` au serveur Node.js. L'administrateur initial est créé uniquement si `accounts` est vide.

Commandes disponibles :

| Commande | Fonction |
| --- | --- |
| `npm run dev` | Démarre l'API et l'interface pour le développement. |
| `npm run api` | Démarre seulement le serveur API. |
| `npm run build` | Vérifie les types TypeScript et construit l'interface dans `dist/`. |
| `npm run preview` | Prévisualise le build Vite. Pour l'utiliser avec l'API, configurez aussi un proxy `/api` vers le serveur Node. |
| `npm run lint` | Lance Oxlint. |

En production, déployez `dist/` sur un serveur statique et configurez le reverse proxy `/api` vers le processus Node.js. `npm start` démarre seulement l'API. Définissez alors `NODE_ENV=production`, une valeur persistante et privée pour `SESSION_SECRET`, et activez HTTPS afin que le cookie soit transmis avec l'attribut `Secure`.

## Import des données existantes

Le code peut importer un export JSON normalisé de l'ancien système. Un gabarit vide est fourni dans [`data/postgres-import.example.json`](data/postgres-import.example.json). Remplissez ses tableaux avec les exports des feuilles, en conservant les champs métier attendus par l'application, puis exécutez :

```powershell
npm run import:data -- data/postgres-export.json
```

Le script importe les collections `flux`, `reception` et `vin`, les collections métier listées dans le gabarit, ainsi que les comptes fournis dans le bundle. Il utilise `DATABASE_URL` depuis l'environnement ou le fichier `.env`. L'import est transactionnel et peut être relancé : les clés existantes sont mises à jour.

### Importer le classeur des véhicules et engins

L'inventaire est enregistré dans la table PostgreSQL `vehicle_inventory` et visible dans l'application sous **Parc véhicules & engins**. Le tableau conserve les champs d'origine dans `raw_data`; une ligne peut être développée pour afficher toutes les colonnes. Pour réimporter un classeur `.xlsx`, Python et `openpyxl` doivent être disponibles :

```powershell
python -m pip install openpyxl
npm run import:vehicle-inventory -- "C:\chemin\vers\Liste des véhicules _ Engins.xlsx"
```

L'import est transactionnel et peut être relancé; les numéros de lignes Excel existants sont mis à jour.

Les anciens comptes peuvent être importés directement depuis `data/accounts.json` :

```powershell
npm run import:accounts
```

Ce script transforme les mots de passe en empreintes `scrypt` avant de les enregistrer. Le fichier source historique contient des mots de passe en clair ; protégez-le et ne le publiez pas. L'option `--redact-source` vide ce fichier après un import réussi. Elle est irréversible pour son contenu local : gardez une sauvegarde protégée si vous en avez besoin.

L'import du classeur remplit uniquement `vehicle_inventory`. Les autres exports historiques (`flux`, `reception`, `vin` et comptes) doivent être importés séparément avec les commandes correspondantes ci-dessus.

## Organisation du dépôt

```text
src/
  components/      vues, tableaux, modales, graphiques et plan de l'atelier
  config/          types de comptes et données d'équipe par défaut
  context/         session utilisateur et droits par rôle
  data/            types et données d'affichage de secours
  pages/           page de connexion et tableau de bord principal
  services/        client API, accès aux données SQL et calcul des temps
  types/           types partagés, dont les rôles
server/
  index.mjs        serveur HTTP, authentification et opérations PostgreSQL
  schema.sql       tables et index PostgreSQL
scripts/
  dev.mjs                          lancement local API + Vite
  import-postgres-bundle.mjs        import de données JSON normalisées
  import-vehicle-inventory.mjs      import du classeur véhicules/engins
  stream-vehicle-inventory.py       extraction en flux des lignes Excel
  import-legacy-accounts.mjs        conversion/import des anciens comptes
data/
  accounts.json                     source locale historique des comptes
  postgres-import.example.json      gabarit du bundle d'import
google-apps-script/
  Code.gs                           ancien script conservé comme référence
```

`src/App.tsx` configure les routes `/auth` et `/`. `src/pages/Dashboard.tsx` orchestre les onze espaces du tableau de bord. `src/services/api.ts` regroupe les appels REST et l'hydratation du cache ; `src/services/database.ts` porte les opérations métier et l'accès aux collections ; `src/services/timeTracking.ts` calcule la chronologie et enregistre les temps.

Le dossier `google-apps-script/` et les scripts ponctuels sous `scratch/` sont des archives de l'ancien fonctionnement. Ils ne sont ni chargés par Vite ni appelés par le serveur PostgreSQL.

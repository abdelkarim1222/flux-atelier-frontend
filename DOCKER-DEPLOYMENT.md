# Déploiement Docker – Flux Atelier

Cette configuration démarre l'interface, l'API et PostgreSQL. La sauvegarde
`docker/postgres-init/flux_atelier.backup` est restaurée seulement lors de la
création initiale du volume PostgreSQL. Elle ne modifie jamais la base locale
source depuis laquelle elle a été exportée.

## Sur le serveur de l'entreprise

1. Copiez le dossier du projet, y compris `docker/postgres-init`.
2. Copiez `.env.docker.example` vers `.env`, puis définissez des mots de passe
   forts pour `POSTGRES_PASSWORD` et `SESSION_SECRET`.
3. Ajustez l'adresse dans `docker-compose.yml` si le serveur n'utilise pas
   `172.16.6.100`.
4. Lancez `docker compose up --build -d`.

L'application sera exposée sur `http://172.16.6.100:5174`.

Les données Docker sont stockées dans le volume `postgres_data`. Pour mettre à
jour l'application sans supprimer les données : `docker compose up --build -d`.
N'utilisez pas `docker compose down -v`, car cette commande efface le volume
PostgreSQL et donc la copie de la base.

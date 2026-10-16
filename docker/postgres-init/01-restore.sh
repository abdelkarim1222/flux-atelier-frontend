#!/bin/sh
set -eu

echo "Restauration de la sauvegarde Flux Atelier..."
pg_restore --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" /docker-entrypoint-initdb.d/flux_atelier.backup
echo "Restauration terminée."

#!/bin/sh
# Prisma Studio nel compose locale (servizio prisma-studio di compose.local.yaml).
#
# Prisma Studio ascolta solo su 127.0.0.1 e non ha un'opzione per cambiarlo; inoltre
# rifiuta (403) le richieste con un Origin su un'altra porta. Gira quindi sulla stessa
# porta pubblicata sul computer, e forward.mjs la espone sugli indirizzi di rete del
# container. Si collega al database con --url: non servono schema né config.
set -eu

: "${DATABASE_URL:?manca DATABASE_URL}"
cd /studio

# Prisma resta nel volume prisma-studio-modules: si installa solo al primo avvio o
# quando cambia PRISMA_VERSION.
if [ "$(cat node_modules/.prisma-version 2>/dev/null)" != "$PRISMA_VERSION" ]; then
  echo "installo prisma@$PRISMA_VERSION"
  npm install --no-save --no-audit --no-fund --loglevel=error "prisma@$PRISMA_VERSION"
  echo "$PRISMA_VERSION" > node_modules/.prisma-version
fi

PORT="${PRISMA_STUDIO_PORT:-5555}"
node /forward.mjs "$PORT" &
exec npx prisma studio --port "$PORT" --browser none --url "$DATABASE_URL"

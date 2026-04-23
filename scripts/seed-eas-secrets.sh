#!/usr/bin/env bash
# Lee .env y crea/actualiza los EAS secrets necesarios para el build.
# Uso: bash scripts/seed-eas-secrets.sh

set -e

ENV_FILE="$(dirname "$0")/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no encuentro $ENV_FILE"
  exit 1
fi

for NAME in \
  EXPO_PUBLIC_FIREBASE_API_KEY \
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN \
  EXPO_PUBLIC_FIREBASE_PROJECT_ID \
  EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
do
  VALUE=$(grep "^${NAME}=" "$ENV_FILE" | cut -d= -f2- | sed 's/^"//;s/"$//;s/^\x27//;s/\x27$//')
  if [ -z "$VALUE" ]; then
    echo "SALTADO: $NAME no está en .env"
    continue
  fi
  echo "→ Creando secret: $NAME"
  eas secret:create --scope project --name "$NAME" --value "$VALUE" --type string --force
done

echo ""
echo "Listo. Verifica con: eas secret:list"

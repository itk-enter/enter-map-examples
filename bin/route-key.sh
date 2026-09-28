#!/usr/bin/env bash
# Writes SEPTIMA_ROUTE_APIKEY from .env into public/config/key.json, which the
# pages read at load. The file is git-ignored; the key is not in the repository.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example and fill in SEPTIMA_ROUTE_APIKEY." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && . ./.env && set +a

: "${SEPTIMA_ROUTE_APIKEY:?not set in .env}"

jq -n --arg key "$SEPTIMA_ROUTE_APIKEY" '{routeApiKey: $key}' >public/config/key.json

echo "Wrote public/config/key.json. \"Find de nærmeste pladser\" is now on parkering.html."

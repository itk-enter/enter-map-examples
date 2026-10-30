#!/usr/bin/env bash
# Refreshes public/data/<source>.geojson from the sources of an Enter instance.
#
# Enter lists its sources in /sources.json, and the broker returns the entities
# of one source with `q=sourceId=="<id>"`. Each source gets its own file, named
# after its id with ":" turned into "-", so the Leaflet pages can show the
# sources side by side and say which one a place came from.
#
# The snapshot in the repository was made with this script, so the demo runs
# without it. It needs the basic auth for the Enter instance in .env or
# .env.local.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ] && [ ! -f .env.local ]; then
  echo "Missing .env — copy .env.example and fill in the credentials." >&2
  exit 1
fi

# .env.local wins over .env, so a personal login can sit next to shared values.
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
# shellcheck disable=SC1091
[ -f .env.local ] && . ./.env.local
set +a

: "${ENTER_BASE_URL:?not set in .env}"
: "${ENTER_BASIC_AUTH:?not set in .env}"
# The sources the bench and toilet pages show.
ENTER_SOURCES=${ENTER_SOURCES:-test:osm-bench,test:osm-public-toilet,test:mtm_spatialmaps-toilet-city,test:mtm_spatialmaps-toilet-other}

PAGE_SIZE=1000

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p public/data

enter() {
  curl --silent --show-error --fail --user "$ENTER_BASIC_AUTH" "$@"
}

enter --output "$work/sources.json" "$ENTER_BASE_URL/sources.json"

for id in ${ENTER_SOURCES//,/ }; do
  source=$(jq --arg id "$id" '.[] | select(.id == $id)' "$work/sources.json")

  if [ -z "$source" ]; then
    echo "$ENTER_BASE_URL has no source $id." >&2
    exit 1
  fi

  model=$(jq -r '.model' <<<"$source")
  context=$(jq -r '.context_url' <<<"$source")
  pages="$work/$id.pages"
  offset=0
  : >"$pages"

  # The model's context is what makes the broker answer with short attribute
  # names (`name`, `address`) instead of full URIs. `format=simplified` is
  # NGSI-LD key-values: `name` rather than `name.value`.
  while :; do
    page=$(enter --get "$ENTER_BASE_URL/ngsi-ld/v1/entities" \
      --header 'accept: application/geo+json' \
      --header "link: <$context>; rel=\"http://www.w3.org/ns/json-ld#context\"; type=\"application/ld+json\"" \
      --data-urlencode "q=sourceId==\"$id\"" \
      --data-urlencode "type=$model" \
      --data-urlencode "format=simplified" \
      --data-urlencode "limit=$PAGE_SIZE" \
      --data-urlencode "offset=$offset")
    count=$(jq '.features | length' <<<"$page")
    printf '%s\n' "$page" >>"$pages"
    [ "$count" -lt "$PAGE_SIZE" ] && break
    offset=$((offset + PAGE_SIZE))
  done

  # `location` repeats the geometry, and `source` is the broker's internal
  # harvest URL; neither is any use to a page.
  file="public/data/${id//:/-}.geojson"
  jq --slurp '{
      type: "FeatureCollection",
      features: map(.features) | add | map(.properties |= del(.location, .source))
    }' "$pages" >"$file"

  echo "$id: $(jq '.features | length' "$file") features → $file"
done

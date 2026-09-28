#!/usr/bin/env bash
# Refreshes public/data/<type>.geojson from an Enter instance.
#
# The snapshot in the repository was made with this script, so the demo runs
# without it. Run it only to bring the data up to date; it needs credentials for
# the Enter instance in .env.
#
# The broker publishes normalized NGSI-LD, where every attribute is an object.
# The snapshot is flattened to key-values so the widget templates can read
# `navn` rather than `navn.value`; a page inside Enter asks the broker for the
# same shape with `options=keyValues`.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example and fill in the credentials." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && . ./.env && set +a

: "${ENTER_BASE_URL:?not set in .env}"
: "${ENTER_BASIC_AUTH:?not set in .env}"
: "${ENTER_TYPES:?not set in .env}"

PAGE_SIZE=1000

# Pages are collected outside public/, so a failed run leaves nothing behind
# next to the snapshot it was going to replace.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p public/data

# `geometryProperty` picks the attribute used as the GeoJSON geometry. Without
# it the broker uses `location`, which is a centroid, so areas such as the dog
# forests would arrive as points.
fetch_page() {
  local status body="$work/page.json"

  status=$(curl --silent --show-error --user "$ENTER_BASIC_AUTH" \
    --output "$body" --write-out '%{http_code}' \
    --get "$ENTER_BASE_URL/data/ngsi-ld/v1/entities.geojson" \
    --data-urlencode "type=$1" \
    --data-urlencode "limit=$PAGE_SIZE" \
    --data-urlencode "offset=$2" \
    --data-urlencode "geometryProperty=geometry")

  if [ "$status" != "200" ]; then
    echo "$ENTER_BASE_URL answered $status for type=$1." >&2
    if [ "$status" = "500" ]; then
      echo "The site itself is up, so this is the context broker behind it, not the snapshot." >&2
    fi
    exit 1
  fi

  cat "$body"
}

# Attributes are `{"type":"Property","value":…}` in normalized form; take the
# value and leave plain members (such as the entity type) untouched.
FLATTEN='
  .features |= map(
    .properties |= with_entries(
      .value |= (if type == "object" and has("value") then .value else . end)
    )
  )
'

for type in ${ENTER_TYPES//,/ }; do
  offset=0
  pages="$work/$type.pages"
  : >"$pages"

  while :; do
    page=$(fetch_page "$type" "$offset")
    count=$(jq '.features | length' <<<"$page")
    printf '%s\n' "$page" >>"$pages"
    [ "$count" -lt "$PAGE_SIZE" ] && break
    offset=$((offset + PAGE_SIZE))
  done

  jq --slurp "{type: \"FeatureCollection\", features: map(.features) | add} | $FLATTEN" \
    "$pages" >"public/data/$type.geojson"

  # The detail view shows the distance to the nearest other place of the same
  # type, which is a relation between two features and so cannot be derived
  # from one. Enter would carry it in production.
  bin/nearest.py "public/data/$type.geojson"

  echo "$type: $(jq '.features | length' "public/data/$type.geojson") features"

  # The range filters in the widget configuration carry fixed bounds, so report
  # the numbers the data actually holds.
  jq -r '
    [.features[].properties | to_entries[] | select(.value | type == "number")]
    | group_by(.key)[]
    | "  \(.[0].key): \([.[].value] | min)–\([.[].value] | max)"
  ' "public/data/$type.geojson" | sort -u
done

#!/usr/bin/env bash
# Serves public/ the way GitHub Pages will: only the files Git would publish
# (so the git-ignored config/key.json is left out) and under the repository
# subpath, so a root-relative URL that would break on Pages breaks here too.
#
# Uncommitted changes are included, so the preview can be checked before a
# commit. Usage: pages-preview.sh [PORT], default 8089.

set -euo pipefail

cd "$(dirname "$0")/.."

port="${1:-8089}"
subpath="enter-map-examples"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

# Tracked files plus new files that are not ignored: what a commit would hold.
git ls-files -z --cached --others --exclude-standard -- public |
  while IFS= read -r -d '' file; do
    # A tracked file deleted in the working tree is not part of the next commit.
    [ -e "$file" ] || continue
    target="$stage/$subpath/${file#public/}"
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
  done

echo "Preview of the GitHub Pages site: http://localhost:$port/$subpath/"
bin/serve.py "$port" "$stage"

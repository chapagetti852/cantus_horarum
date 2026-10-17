#!/bin/sh
# Fetch GABC files straight from GregoBase into data/gabc/ (when the dump's cache/ is not
# at hand): sh scripts/gregobase/fetch_gabc.sh 4321 15303 ...
mkdir -p data/gabc
for id in "$@"; do
  [ -s "data/gabc/$id.gabc" ] && continue
  curl -sfL "https://gregobase.selapa.net/download.php?id=$id&format=gabc&elem=1" -o "data/gabc/$id.gabc" || echo "failed: $id" >&2
  sleep 1
done

#!/bin/sh
# Usage: tools/world/debug/sweep.sh [tree]
# The junction and spike counts of every stage, one line each (a tree of another commit with at-commit.sh: run it as
# tools/world/debug/at-commit.sh <commit> sh tools/world/debug/sweep.sh)
cd "${1:-.}"
for st in tremola gotthard-north airolo-lookout lookout-andermatt andermatt-goeschenen goeschenen-susten susten-gadmen gadmen-innertkirchen innertkirchen-guttannen guttannen-grimsel; do
  j=$(node tools/world/debug/junction.mjs $st 2>&1 | grep -v '^  ' | tr '\n' ' ')
  k=$(node tools/world/debug/spikes.mjs $st 2>&1 | head -1)
  echo "$st J: $j"
  echo "$st S: $k"
done

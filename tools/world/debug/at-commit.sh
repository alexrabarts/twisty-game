#!/bin/sh
# Usage: tools/world/debug/at-commit.sh <commit> <command...>
# Runs a command (a debug script here, a jest file) in a throwaway worktree of <commit>, with this checkout's
# node_modules and tools/world/debug copied in, then removes the worktree. For bisecting a fault to the commit that
# made it: tools/world/debug/at-commit.sh f0d7e29 node tools/world/debug/junction.mjs gadmen-innertkirchen
set -e
commit=$1; shift
here=$(cd "$(dirname "$0")/../../.." && pwd)
tree=$(mktemp -d "${TMPDIR:-/tmp}/twisty-at-XXXXXX")
git -C "$here" worktree add --detach "$tree" "$commit" >/dev/null 2>&1
trap 'git -C "$here" worktree remove --force "$tree" >/dev/null 2>&1 || true' EXIT
modules=$(readlink "$here/node_modules" 2>/dev/null || echo "$here/node_modules")
ln -s "$modules" "$tree/node_modules"
mkdir -p "$tree/tools/world/debug"
cp "$here"/tools/world/debug/*.mjs "$here"/tools/world/debug/sweep.sh "$tree/tools/world/debug/"
cd "$tree" && "$@"

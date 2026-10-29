#!/bin/bash
# usage: regress.sh <port> <outfile> [listfile]
# Runs every test of the list (lines: "dir script [args]", paths relative to the scratchpad) against the server on <port>, each through the
# shared browser lock, and writes the key lines of each to <outfile>.
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
PORT=$1; OUT=$2; LIST=${3:-$S/gfx/integ/list_all.txt}
: > $OUT
while read -r dir script args; do
  [ -z "$dir" ] && continue
  case "$dir" in \#*) continue;; esac
  echo "=== $dir/$script $args" >> $OUT
  ( cd $S/$dir && CW_PORT=$PORT TMO=${TMO:-1500} $S/gfx/b.sh $script $args 2>&1 | grep -E "${KEEP:-FAIL|errors|ALL|RESULT|FAILED|passed|failed|Error|error:|pageerror|state}" | tail -${TAILN:-14} ) >> $OUT
  echo "[exit ${PIPESTATUS[0]}]" >> $OUT
done < $LIST
echo ALLDONE >> $OUT

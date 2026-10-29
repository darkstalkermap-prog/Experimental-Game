#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
$S/startservers.sh > /dev/null
run() { echo "=== $1"; shift; timeout 1200 "$@" 2>&1 | grep -E "${KEEP:-.}" | tail -${TAILN:-12}; echo "[exit ${PIPESTATUS[0]}]"; }
KEEP='FAIL|errors|ALL|FAILED' run hill node v5/hill.js
KEEP='PASS|FAIL|errors|ALL|FAILED' TAILN=30 run hillai node v5/hillai.js
cd $S/v5
KEEP='FAIL|errors|ALL' TAILN=30 run mphill node mphill.js
cd $S/v4
KEEP='FAIL|errors|ALL' run mpvolley node mpvolley.js
echo ALLDONE

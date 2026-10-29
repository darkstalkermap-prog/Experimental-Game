#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
run() { echo "=== $1"; shift; timeout 900 "$@" 2>&1 | grep -E "${KEEP:-.}" | tail -${TAILN:-12}; echo "[exit ${PIPESTATUS[0]}]"; }
KEEP='FAIL|errors|ALL|FAILED' run climbduck node v4/climbduck.js
KEEP='FAIL|errors|ALL|FAILED' run volley node v4/volley.js
KEEP='errors|state' run smoke node v2/smoke.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run basics node v3/basics.js
KEEP='FAIL|errors|ALL' run flow node v3/flow.js
KEEP='FAIL|errors|ALL' run classswitch node v3/classswitch.js
KEEP='FAIL|errors|ALL' run menutest node menutest.js
cd $S/v4
KEEP='FAIL|errors|ALL' run mpvolley node mpvolley.js
cd $S
KEEP='FAIL|errors|ALL' run mpclass node v3/mpclass.js
echo ALLDONE

#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
run() { echo "=== $1"; shift; timeout 900 "$@" 2>&1 | grep -E "${KEEP:-.}" | tail -${TAILN:-12}; echo "[exit ${PIPESTATUS[0]}]"; }
KEEP='PASS|FAIL|errors|ALL|FAILED|RESULT|problem' TAILN=30 run climbduck node v4/climbduck.js
KEEP='FAIL|errors|ALL|FAILED' run volley node v4/volley.js
run smoke node v2/smoke.js
KEEP='volley|ranger|errors' run abilities node v2/abilities.js
run localabil node v2/localabil.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run basics node v3/basics.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run flow node v3/flow.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run tower node v3/tower.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run classswitch node v3/classswitch.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run upgrades node v3/upgrades.js
KEEP='FAIL|errors|ALL|flagged|stall|RESULT' TAILN=12 run navtest node v3/navtest.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run orders node v3/orders.js
run crew node v2/crew.js
run roster node v2/roster.js
KEEP='PASS|FAIL|errors|ALL' TAILN=20 run menutest node menutest.js
cd $S/v4
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run mpvolley node mpvolley.js
cd $S
run mpnew node v2/mpnew.js
run mpcav node v2/mpcav.js
KEEP='PASS|FAIL|errors|ALL' TAILN=30 run mpclass node v3/mpclass.js
cd $S/mp_run
KEEP='ok|FAIL|errors|RESULT' TAILN=14 run relay_a node relay_a.js
KEEP='PASS|FAIL|errors|RESULT' TAILN=20 run relay_b_versus4 node relay_b.js versus4
KEEP='PASS|FAIL|errors|RESULT' TAILN=20 run relay_b_coop4 node relay_b.js coop4
KEEP='PASS|FAIL|errors|RESULT' TAILN=20 run leave node leave.js relay
echo ALLDONE

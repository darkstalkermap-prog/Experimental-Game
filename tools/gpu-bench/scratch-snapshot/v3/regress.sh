#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
run() { echo "=== $1"; shift; timeout 600 "$@" 2>&1 | tail -${TAILN:-14}; echo "[exit ${PIPESTATUS[0]}]"; }
run smoke node v2/smoke.js
run abilities node v2/abilities.js
run localabil node v2/localabil.js
run crew node v2/crew.js
run roster node v2/roster.js
run menutest node menutest.js
run mpnew node v2/mpnew.js
run mpcav node v2/mpcav.js
cd $S/mp_run
run relay_a node relay_a.js
run relay_b_versus4 node relay_b.js versus4
run relay_b_coop4 node relay_b.js coop4
run leave node leave.js relay
echo ALLDONE

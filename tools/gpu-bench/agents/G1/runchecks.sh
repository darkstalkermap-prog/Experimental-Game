#!/bin/bash
# usage: runchecks.sh <port> [tag]   the checks the wave brief asks for, each through the browser lock, output in checks_<tag>_<name>.txt
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
T=${2:-x}
cd $S/gfx/G1
run() { name=$1; shift; CW_PORT=$PORT TMO=900 $S/gfx/b.sh "$@" > checks_${T}_$name.txt 2>&1; echo "$name exit $?" >> checks_${T}_summary.txt; }
PORT=$1
: > checks_${T}_summary.txt
run smoke $S/v2/smoke.js
run basics $S/v3/basics.js
run classswitch $S/v3/classswitch.js
run abilities $S/v2/abilities.js
run crowdtest $S/gfx/A1/crowdtest.js
run qcycle $S/gfx/A4/qcycle.js
run shimmer $S/gfx/A4/shimmer.js
run prof $S/gfx/prof.js medium high 6
echo done >> checks_${T}_summary.txt

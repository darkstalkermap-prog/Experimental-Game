#!/bin/bash
# the summon tests, the hero and practice tests, then the whole regression, then the v6 tests (pings, alerts, talents, levels)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
$S/startservers.sh > /dev/null
rm -f $S/v10/all.done
TAILN=8 $S/runlist.sh $S/v10/first.out v10/summon.js v10/mpsummon.js v9/herofull.js v8b/herorules.js v8c/herohud.js v7/practice.js v7/gate.js
bash $S/v5/regress.sh > $S/v10/regress.out 2>&1
TAILN=10 $S/runlist.sh $S/v10/v6.out v6a/ping.js v6a/mpping.js v6b/alerts.js v6b/mpalerts.js v6c/talents.js v6c/layout.js v6c/mptalents.js v6d/levels.js v6d/mplevels.js
echo FINISHED > $S/v10/all.done

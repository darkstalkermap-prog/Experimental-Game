#!/bin/bash
# after rising at the ally's own keep: the hero tests, then the whole regression (the pings, alerts, talents and levels tests did not change)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S
$S/startservers.sh > /dev/null
rm -f $S/v10/all2.done
TAILN=8 $S/runlist.sh $S/v10/second.out v9/herofull.js v8b/herorules.js v7/practice.js v7/gate.js
bash $S/v5/regress.sh > $S/v10/regress2.out 2>&1
echo FINISHED > $S/v10/all2.done

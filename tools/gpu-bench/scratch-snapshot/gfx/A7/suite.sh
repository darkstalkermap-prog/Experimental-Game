#!/bin/bash
# Runs the gameplay regression scripts one at a time through the browser lock and prints a short digest of each.
# usage: CW_PORT=8217 suite.sh [name ...]   (names: smoke basics classswitch flow orders navtest tower hill hillai gate practice herorules relay_a relay_b)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
OUT=$S/gfx/A7/suite_out
mkdir -p $OUT
declare -A CMD=(
  [smoke]="v2/smoke.js" [basics]="v3/basics.js" [classswitch]="v3/classswitch.js" [flow]="v3/flow.js" [orders]="v3/orders.js"
  [navtest]="v3/navtest.js" [tower]="v3/tower.js" [hill]="v5/hill.js" [hillai]="v5/hillai.js" [gate]="v7/gate.js"
  [practice]="v7/practice.js" [herorules]="v8b/herorules.js" [relay_a]="mp_run/relay_a.js" [relay_b]="mp_run/relay_b.js coop4"
)
ORDER="smoke basics classswitch flow orders navtest tower hill hillai gate practice herorules relay_a relay_b"
LIST="${@:-$ORDER}"
cd $S
for n in $LIST; do
  start=$(date +%s)
  TMO=${TMO:-1200} $S/gfx/b.sh ${CMD[$n]} > $OUT/$n.txt 2>&1
  rc=$?
  fails=$(grep -ci "fail\|error\|exception" $OUT/$n.txt)
  pass=$(grep -c "^PASS\|PASS " $OUT/$n.txt)
  echo "== $n rc=$rc pass=$pass failish=$fails $(( $(date +%s) - start ))s :: $(tail -n 1 $OUT/$n.txt | cut -c1-110)"
done

#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
for q in high medium low; do
  SHOT=$S/gfx/G1/shots:before CW_PORT=8252 $S/gfx/b.sh $S/gfx/fixed.js $q >> $S/gfx/G1/before.txt 2>&1
done
echo done >> $S/gfx/G1/before.txt

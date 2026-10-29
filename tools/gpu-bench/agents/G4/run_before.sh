#!/bin/bash
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
for q in high medium low; do
  CW_PORT=8252 SHOT=$S/gfx/G4/shots:before $S/gfx/b.sh $S/gfx/fixed.js $q
done

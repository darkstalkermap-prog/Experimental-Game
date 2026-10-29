#!/bin/bash
# Prints one line when each profile of the p4 series lands and a last one when the series is done.
I=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/integ
n=0
while true; do
  c=$(ls $I/prof_p4_*.json 2>/dev/null | wc -l)
  d=0
  for f in $I/prof_p4_*.json; do if [ -s "$f" ] && grep -q '^errors' "$f"; then d=$((d + 1)); fi; done
  if [ "$d" != "$n" ]; then echo "profiles finished: $d"; n=$d; fi
  if [ -f $I/prof_p4_done.txt ]; then echo "P4DONE: $d profiles"; exit 0; fi
  sleep 20
done

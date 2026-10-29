#!/bin/bash
# usage: cmp.sh <tagA> <tagB> <quality>   compares shots/<tagA>_<q>_<view>.png with shots/<tagB>_<q>_<view>.png for the three views
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
D=$S/gfx/G1/shots
for v in castle field sun; do
  echo -n "$3 $v: "
  python3 -I $S/gfx/gpu/imgdiff.py $D/$1_$3_$v.png $D/$2_$3_$v.png $D/diff_$1_$2_$3_$v.png
done

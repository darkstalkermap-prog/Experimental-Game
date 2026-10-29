#!/bin/bash
# usage: runprogs.sh <port> <tag>   (program lists of the fixed scene at three levels and of a battle frame at High)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S/gfx/G1
for q in high medium low; do
  OUT=$S/gfx/G1/progs_$2_$q.json CW_PORT=$1 TMO=600 $S/gfx/b.sh programs.js $q > progs_$2_$q.txt 2>&1
done
BATTLE=60 OUT=$S/gfx/G1/progs_$2_high_battle.json CW_PORT=$1 TMO=900 $S/gfx/b.sh programs.js high > progs_$2_high_battle.txt 2>&1
echo done > progs_$2_done.txt

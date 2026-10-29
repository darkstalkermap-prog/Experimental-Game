#!/bin/bash
# usage: profall.sh <tag>  -- prof2 at every quality (castle view, medium map) plus High on the field view and the large map; JSON into gfx/integ/prof_<tag>_*.json
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
I=$S/gfx/integ
T=$1
cd /home/user/experimental-game/.claude/worktrees/agent-a29f55762314eff94
for q in low medium high ultra; do $I/t.sh gfx/integ/prof2.js medium $q 6 castle > $I/prof_${T}_${q}_castle.json 2>&1; done
$I/t.sh gfx/integ/prof2.js medium high 6 field > $I/prof_${T}_high_field.json 2>&1
$I/t.sh gfx/integ/prof2.js large high 6 castle > $I/prof_${T}_high_large.json 2>&1
$I/t.sh gfx/integ/prof2.js small high 6 castle > $I/prof_${T}_high_small.json 2>&1
echo PROFDONE > $I/prof_${T}_done.txt

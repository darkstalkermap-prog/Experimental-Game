#!/bin/bash
# usage: sheet.sh <tag> [tile geometry]  -- a 2x3 contact sheet of the six standard viewpoints of <tag> (out/<tag>_*.png) -> out/sheet_<tag>.png
O=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/integ/out
T=$1; G=${2:-640x360}
cd $O
montage ${T}_castle_front.png ${T}_field.png ${T}_soldiers.png ${T}_landscape.png ${T}_landscape2.png ${T}_sunward.png -tile 2x3 -geometry ${G}+4+4 -background '#202020' png24:sheet_${T}.png
ls -la sheet_${T}.png

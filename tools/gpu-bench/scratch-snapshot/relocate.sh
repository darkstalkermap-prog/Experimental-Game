#!/bin/bash
# usage: relocate.sh <dir>
# The scripts in this snapshot were written for one scratch folder and name it in full (const S = '/tmp/claude-0/.../scratchpad/').
# Copy this folder to <dir> and run this on the COPY: it rewrites that prefix to <dir>, after which "dir script" lines of
# gfx/integ/list_all.txt run as in the briefs (regress.sh <port> <outfile> [list]). They need `npm i playwright` (or NODE_PATH to it) and a server
# for the game on the port you pass (node server/server.js with PORT=<port> from a checkout of the branch under test).
OLD=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
DIR=$(cd "$1" && pwd)
grep -rlI "$OLD" "$DIR" | xargs sed -i "s|$OLD|$DIR|g"
echo "rewrote $(grep -rlI "$DIR" "$DIR" | wc -l) files"

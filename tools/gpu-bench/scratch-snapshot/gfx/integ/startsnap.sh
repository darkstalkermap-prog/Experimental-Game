#!/bin/bash
# usage: startsnap.sh <snapshot dir name under gfx/integ> <port>  -- serve a frozen copy of the game (static files and relay) on <port>
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
D=$S/gfx/integ/$1; P=$2
if curl -s -o /dev/null http://localhost:$P/; then echo "$P already up"; exit 0; fi
cd $D
NODE_PATH=/home/user/experimental-game/node_modules PORT=$P nohup node server/server.js > $S/gfx/integ/server$P.log 2>&1 &
echo $! > $S/gfx/integ/server$P.pid
sleep 1
curl -s -o /dev/null -w "$P:%{http_code}\n" http://localhost:$P/

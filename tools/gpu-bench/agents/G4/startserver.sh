#!/bin/bash
# serve the snapshot (G4/serve) on 8264
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd $S/gfx/G4/serve
NODE_PATH=/home/user/experimental-game/node_modules PORT=8264 nohup node server/server.js > $S/gfx/server8264.log 2>&1 &
echo $! > $S/gfx/G4/server.pid
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8264/

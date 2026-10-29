#!/bin/bash
# (re)start my static + relay server on 8220 from my worktree (it dies when the session is restarted)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
if curl -s -o /dev/null http://localhost:8220/; then echo "8220 already up"; exit 0; fi
cd /home/user/experimental-game/.claude/worktrees/agent-a29f55762314eff94
NODE_PATH=/home/user/experimental-game/node_modules PORT=8220 nohup node server/server.js > $S/gfx/server8220.log 2>&1 &
echo $! > $S/gfx/server8220.pid
sleep 1
curl -s -o /dev/null -w "8220:%{http_code}\n" http://localhost:8220/

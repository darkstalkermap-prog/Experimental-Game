#!/bin/bash
# (re)start the static server (8090) and the relay (8080) used by the browser tests
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
cd /home/user/experimental-game
for port in 8090 8080; do
  if ! curl -s -o /dev/null http://localhost:$port/; then
    (PORT=$port nohup node server/server.js > $S/server$port.log 2>&1 &)
  fi
done
sleep 1
for port in 8090 8080; do curl -s -o /dev/null -w "$port:%{http_code}\n" http://localhost:$port/; done

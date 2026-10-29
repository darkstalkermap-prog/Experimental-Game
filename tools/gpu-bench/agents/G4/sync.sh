#!/bin/bash
# copy the worktree's served files into the snapshot that port 8264 serves (so edits never change a queued browser run)
W=/home/user/experimental-game/.claude/worktrees/agent-a5e7d644289939b43
D=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/G4/serve
mkdir -p $D/src $D/vendor $D/server
cp -r $W/src/. $D/src/
cp -r $W/vendor/. $D/vendor/
cp -r $W/server/. $D/server/
cp $W/index.html $D/index.html
echo synced

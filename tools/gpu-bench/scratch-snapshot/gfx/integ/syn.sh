#!/bin/bash
# syntax check every module of the worktree in the current directory
cd /home/user/experimental-game/.claude/worktrees/agent-a29f55762314eff94
bad=0
for f in src/*.js server/*.js; do node --input-type=module --check < "$f" || { echo FAIL $f; bad=1; }; done
[ $bad = 0 ] && echo SYNTAX-OK

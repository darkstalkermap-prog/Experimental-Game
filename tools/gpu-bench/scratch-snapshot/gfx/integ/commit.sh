#!/bin/bash
# usage: commit.sh "subject" ["body paragraph"]  -- stages everything and commits with the attribution trailer
cd /home/user/experimental-game/.claude/worktrees/agent-a29f55762314eff94
M=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/integ/msg.txt
{ echo "$1"; echo; if [ -n "$2" ]; then echo "$2"; echo; fi; echo "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"; echo "Claude-Session: https://claude.ai/code/session_012vMGjmdremazzBEZVSfDaT"; } > $M
git add -A
git commit -q -F $M
git log --oneline -1

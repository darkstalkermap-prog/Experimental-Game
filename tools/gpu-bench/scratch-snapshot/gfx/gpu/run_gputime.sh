#!/bin/bash
# usage: run_gputime.sh <outfile> <script> <args...>   (runs one browser script through the shared lock on port 8240 and keeps the last lines)
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
OUTF="$1"; shift
CW_PORT=8240 TMO=1700 "$S/gfx/b.sh" "$@" > "$OUTF" 2>&1
echo "done rc=$?" >> "$OUTF"

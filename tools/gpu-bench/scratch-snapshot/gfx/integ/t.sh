#!/bin/bash
# usage: t.sh <test path relative to the scratchpad, or absolute> [args]  -- runs it against my server (8220) through the shared browser lock
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
t=$1; shift
case "$t" in /*) ;; *) t=$S/$t;; esac
cd $(dirname $t)
CW_PORT=8220 exec $S/gfx/b.sh $t "$@"

#!/bin/bash
# Emits one line per ten finished tests, one per new failure signal, and one when the whole regression (main list, then extras) is done.
I=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad/gfx/integ
last=0
seenfail=0
while true; do
  n=$(grep -c '^===' $I/reg_r3.out 2>/dev/null)
  n=${n:-0}
  e=0
  if [ -f $I/reg_r3_extra.out ]; then e=$(grep -c '^===' $I/reg_r3_extra.out 2>/dev/null); fi
  tot=$((n + e))
  f=$(cat $I/reg_r3.out $I/reg_r3_extra.out 2>/dev/null | grep -c -E 'FAIL|pageerror|exit [1-9]|Error:|RESULT: [1-9]')
  if [ "$f" != "$seenfail" ]; then echo "failure-like lines now $f (was $seenfail)"; seenfail=$f; fi
  if [ $((tot / 10)) -gt $((last / 10)) ]; then echo "tests started: $tot"; fi
  last=$tot
  if [ -f $I/reg_r3_extra.out ] && grep -q FULLDONE $I/reg_r3_extra.out; then echo "FULLDONE: tests $tot, failure-like lines $f"; exit 0; fi
  sleep 30
done

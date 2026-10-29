#!/bin/bash
# usage: fullrun.sh <snapshot dir> <port> <tag>  -- the whole regression list, then the extra (A1/A4/A7) tests, against a frozen copy
S=/tmp/claude-0/-home-user-experimental-game/719c8a26-07b1-5861-a870-b607db9e7522/scratchpad
I=$S/gfx/integ
$I/startsnap.sh $1 $2
$I/regress.sh $2 $I/reg_$3.out $I/list_all.txt
KEEP='.' TAILN=40 $I/regress.sh $2 $I/reg_$3_extra.out $I/list_extra.txt
echo FULLDONE >> $I/reg_$3_extra.out

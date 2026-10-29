#!/bin/bash
# usage: b.sh <script.js> [args...]  (CW_PORT=<your port> in the environment)
# Runs a node + Playwright script while holding the one browser lock that every agent shares: headless Chromium renders in
# software here and the machine has 4 cores, so two browsers at once make every test slow and flaky. You may wait for your turn.
exec flock /tmp/cw-browser.lock timeout ${TMO:-900} node "$@"

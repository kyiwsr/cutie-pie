#!/usr/bin/env sh
# Starts Cutie Pie and opens it in your browser. Press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org and run this again."
  exit 1
fi
exec node server.mjs --open

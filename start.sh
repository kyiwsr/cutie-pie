#!/usr/bin/env sh
# Starts Cutie Pie and opens it in your browser. Press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org and run this again."
  exit 1
fi
# Check for opencode 2+ on every start. Never blocks the server: Claude users
# can skip it, and the UI already explains a missing opencode.
_opencode_bin() {
  if [ -n "$OPENCODE_BIN" ]; then
    printf '%s' "$OPENCODE_BIN"
  else
    printf 'opencode'
  fi
}

_opencode_major() {
  # First number in "--version" output, leading v stripped. Empty = unparseable.
  printf '%s' "$1" | grep -o -E '[Vv]?[0-9]+' | head -n 1 | tr -d 'Vv'
}

_opencode_status() {
  # Prints one of: ok | missing | upgrade
  _s_bin="$(_opencode_bin)"
  _s_out="$("$_s_bin" --version 2>/dev/null)"
  _s_code=$?
  if [ "$_s_code" -ne 0 ]; then
    printf 'missing'
    return
  fi
  _s_major="$(_opencode_major "$_s_out")"
  if [ -z "$_s_major" ]; then
    printf 'ok' # fail open so a future version format never blocks startup
    return
  fi
  if [ "$_s_major" = "1" ]; then
    printf 'upgrade'
  else
    printf 'ok'
  fi
}

_opencode_manual_hint() {
  echo "Install it manually, then restart Cutie Pie:"
  echo "  npm install -g opencode-ai@latest"
  echo "Other installs: curl -fsSL https://opencode.ai/install | bash"
  echo "See https://opencode.ai/v2/docs"
  echo "If it is installed somewhere unusual, set OPENCODE_BIN to its full path."
}

_opencode_install() {
  if command -v npm >/dev/null 2>&1; then
    if npm install -g opencode-ai@latest; then
      return 0
    fi
    echo "npm install failed (you may need sudo, or npm permissions)."
  else
    echo "npm not found, trying the opencode install script."
  fi
  if command -v curl >/dev/null 2>&1 && command -v bash >/dev/null 2>&1; then
    if curl -fsSL https://opencode.ai/install | bash; then
      return 0
    fi
    echo "Install script failed."
  elif ! command -v curl >/dev/null 2>&1; then
    echo "curl not found, cannot try the install script."
  elif ! command -v bash >/dev/null 2>&1; then
    echo "bash not found, cannot try the install script."
  fi
  return 1
}

_s_status="$(_opencode_status)"
if [ "$_s_status" != "ok" ]; then
  if [ "$_s_status" = "upgrade" ]; then
    echo "Found opencode 1.x, but Cutie Pie needs opencode 2 or newer."
  else
    echo "opencode 2 or newer was not found."
  fi
  if [ ! -t 0 ]; then
    _opencode_manual_hint
  else
    printf '%s' "Install/upgrade opencode now? [Y/n] "
    read -r _s_reply || _s_reply="n"
    case "$_s_reply" in
      [Nn]*)
        _opencode_manual_hint
        ;;
      *)
        if _opencode_install; then
          _s_after="$(_opencode_status)"
          if [ "$_s_after" = "ok" ]; then
            echo "opencode is ready."
          else
            _opencode_manual_hint
          fi
        else
          _opencode_manual_hint
        fi
        ;;
    esac
  fi
  unset _s_status _s_reply _s_after _s_bin _s_out _s_code _s_major
else
  unset _s_status
fi
exec node server.mjs --open

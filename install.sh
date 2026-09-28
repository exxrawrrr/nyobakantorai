#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/nyobakantorai"
WITH_HERMES=0
START=0
PORT=4322
HERMES_HOME_OVERRIDE=""
REF="main"
REPO_URL="https://github.com/exxrawrrr/nyobakantorai.git"
ARCHIVE_URL="https://github.com/exxrawrrr/nyobakantorai/archive/refs/heads/main.tar.gz"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-hermes) WITH_HERMES=1; shift ;;
    --start) START=1; shift ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --hermes-home) HERMES_HOME_OVERRIDE="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Port must be between 1024 and 65535." >&2; exit 2
fi

if (( WITH_HERMES )) && ! command -v hermes >/dev/null 2>&1; then
  echo "Installing Hermes Agent from its official upstream installer..."
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
  export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  command -v git >/dev/null 2>&1 || { echo "Existing install is a Git checkout but git is unavailable." >&2; exit 1; }
  git -C "$INSTALL_DIR" pull --ff-only
elif [[ -e "$INSTALL_DIR" ]] && [[ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "Install directory exists and is not an empty Git checkout: $INSTALL_DIR" >&2; exit 1
else
  rm -rf "$INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
  else
    command -v curl >/dev/null 2>&1 || { echo "curl or git is required to download nyobakantorai." >&2; exit 1; }
    command -v tar >/dev/null 2>&1 || { echo "tar or git is required to unpack nyobakantorai." >&2; exit 1; }
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    ARCHIVE_URL="https://github.com/exxrawrrr/nyobakantorai/archive/refs/heads/$REF.tar.gz"
    curl -fsSL "$ARCHIVE_URL" -o "$tmp/source.tar.gz"
    mkdir -p "$tmp/src"
    tar -xzf "$tmp/source.tar.gz" -C "$tmp/src" --strip-components=1
    mv "$tmp/src" "$INSTALL_DIR"
  fi
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" && -d "$HOME/.hermes" ]]; then
  NODE="$(find "$HOME/.hermes" -type f -name node -perm -u+x 2>/dev/null | head -n 1 || true)"
fi
[[ -n "$NODE" ]] || { echo "Node.js 20+ was not found. Install Node.js 20+ or install Hermes with --with-hermes, then retry." >&2; exit 1; }
MAJOR="$("$NODE" -p "process.versions.node.split('.')[0]")"
(( MAJOR >= 20 )) || { echo "Node.js 20+ is required; found $MAJOR at $NODE." >&2; exit 1; }

export NYOBAKANTORAI_PORT="$PORT"
if [[ -n "$HERMES_HOME_OVERRIDE" ]]; then
  export HERMES_HOME="$HERMES_HOME_OVERRIDE"
  export NYOBAKANTORAI_HERMES_HOME="$HERMES_HOME_OVERRIDE"
fi
if command -v hermes >/dev/null 2>&1; then export NYOBAKANTORAI_HERMES_EXE="$(command -v hermes)"; fi

echo "Running runtime preflight..."
"$NODE" "$INSTALL_DIR/scripts/preflight.mjs" --runtime

if command -v hermes >/dev/null 2>&1; then
  args=("$INSTALL_DIR/scripts/hermes-bootstrap.mjs" "--upgrade")
  [[ -n "$HERMES_HOME_OVERRIDE" ]] && args+=("--home=$HERMES_HOME_OVERRIDE")
  "$NODE" "${args[@]}"
elif (( WITH_HERMES )); then
  echo "Hermes installer completed but hermes is not on PATH. Open a new shell and rerun." >&2; exit 1
else
  echo "Hermes not detected. Core-only office install is ready; rerun with --with-hermes for the reference runtime."
fi

echo "nyobakantorai installed at: $INSTALL_DIR"
echo "Office URL: http://127.0.0.1:$PORT"
if command -v hermes >/dev/null 2>&1; then echo "If needed, configure your model/provider with: hermes setup --portal"; fi

if (( START )); then
  echo "Starting nyobakantorai..."
  nohup env NYOBAKANTORAI_PORT="$PORT" NYOBAKANTORAI_HERMES_HOME="${NYOBAKANTORAI_HERMES_HOME:-}" NYOBAKANTORAI_HERMES_EXE="${NYOBAKANTORAI_HERMES_EXE:-hermes}" "$NODE" "$INSTALL_DIR/office/server.mjs" >"$INSTALL_DIR/nyobakantorai.log" 2>&1 &
  echo "PID: $!"
else
  echo "Start later with: NYOBAKANTORAI_PORT=$PORT $NODE $INSTALL_DIR/office/server.mjs"
fi
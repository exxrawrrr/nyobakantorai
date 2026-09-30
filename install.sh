#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/nyobakantorai"
WITH_HERMES=0
START=0
PORT=4322
HERMES_HOME_OVERRIDE=""
EMPLOYEES="all"
CHANNEL="stable"
CHANNEL_EXPLICIT=0
VERSION=""
REF=""
REF_EXPLICIT=0
REPO_URL="https://github.com/exxrawrrr/nyobakantorai.git"
RELEASE_API="https://api.github.com/repos/exxrawrrr/nyobakantorai/releases/latest"
RELEASE_BASE="https://github.com/exxrawrrr/nyobakantorai/releases/download"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-hermes) WITH_HERMES=1; shift ;;
    --start) START=1; shift ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --hermes-home) HERMES_HOME_OVERRIDE="$2"; shift 2 ;;
    --employees) EMPLOYEES="$2"; shift 2 ;;
    --employees=*) EMPLOYEES="${1#--employees=}"; shift ;;
    --channel) CHANNEL="$2"; CHANNEL_EXPLICIT=1; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --ref) REF="$2"; REF_EXPLICIT=1; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1024 || PORT > 65535 )); then
  echo "Port must be between 1024 and 65535." >&2
  exit 2
fi

if (( REF_EXPLICIT )); then
  if (( CHANNEL_EXPLICIT )) && [[ "$CHANNEL" != "development" ]]; then
    echo "--ref is a mutable development source and requires --channel development." >&2
    exit 2
  fi
  CHANNEL="development"
fi

case "$CHANNEL" in
  stable|development) ;;
  *) echo "Channel must be stable or development." >&2; exit 2 ;;
esac

if [[ "$CHANNEL" == "development" ]]; then
  [[ -z "$VERSION" ]] || { echo "--version is only valid for the stable channel." >&2; exit 2; }
  [[ -n "$REF" ]] || REF="main"
fi

if [[ "$CHANNEL" == "stable" ]] && [[ -n "$REF" ]]; then
  echo "Stable installation does not accept a mutable --ref." >&2
  exit 2
fi

if [[ -e "$INSTALL_DIR" ]] && [[ -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  if [[ "$CHANNEL" == "stable" ]]; then
    echo "Stable install refuses to mutate an existing non-empty directory: $INSTALL_DIR" >&2
    echo "Choose a new --dir, or explicitly use --channel development for a mutable checkout." >&2
    exit 1
  fi
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    echo "Development install directory exists and is not a Git checkout: $INSTALL_DIR" >&2
    exit 1
  fi
fi

if (( WITH_HERMES )) && ! command -v hermes >/dev/null 2>&1; then
  echo "Installing Hermes Agent from its official upstream installer..."
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
  export PATH="$HOME/.local/bin:$HOME/.hermes/bin:$PATH"
fi

NODE="$(command -v node || true)"
if [[ -z "$NODE" && -d "$HOME/.hermes" ]]; then
  NODE="$(find "$HOME/.hermes" -type f -name node -perm -u+x 2>/dev/null | head -n 1 || true)"
fi
[[ -n "$NODE" ]] || { echo "Node.js 20+ was not found. Install Node.js 20+ or install Hermes with --with-hermes, then retry." >&2; exit 1; }
MAJOR="$("$NODE" -p "process.versions.node.split('.')[0]")"
(( MAJOR >= 20 )) || { echo "Node.js 20+ is required; found $MAJOR at $NODE." >&2; exit 1; }

INSTALL_VERSION=""
SOURCE_COMMIT=""
ARTIFACT_SHA=""

if [[ "$CHANNEL" == "stable" ]]; then
  command -v curl >/dev/null 2>&1 || { echo "curl is required for stable installation." >&2; exit 1; }
  command -v tar >/dev/null 2>&1 || { echo "tar is required for stable installation." >&2; exit 1; }

  if [[ -z "$VERSION" ]]; then
    echo "Resolving latest stable release..."
    release_json="$(curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: nyobakantorai-installer' "$RELEASE_API")"
    VERSION="$(printf '%s' "$release_json" | "$NODE" -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const j=JSON.parse(s);if(!j.tag_name)process.exit(2);process.stdout.write(j.tag_name)})')"
  fi

  [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$ ]] || {
    echo "Unknown or non-immutable release identifier: $VERSION" >&2
    exit 1
  }

  artifact="nyobakantorai-core-$VERSION.tar.gz"
  base="$RELEASE_BASE/$VERSION"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  echo "Downloading immutable release $VERSION..."
  curl -fsSL "$base/install-manifest.json" -o "$tmp/install-manifest.json"
  curl -fsSL "$base/INSTALL-SHA256SUMS.txt" -o "$tmp/INSTALL-SHA256SUMS.txt"
  curl -fsSL "$base/$artifact" -o "$tmp/$artifact"

  verify_info="$("$NODE" -e '
    const fs=require("fs"),crypto=require("crypto");
    const [manifestPath,sumsPath,artifactPath,tag,name]=process.argv.slice(1);
    const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    const sums=fs.readFileSync(sumsPath,"utf8");
    const bytes=fs.readFileSync(artifactPath);
    const fail=(msg)=>{console.error(msg);process.exit(3)};
    if(m.schema!==1||m.project!=="nyobakantorai"||m.channel!=="stable"||m.integrity!=="sha256") fail("install manifest contract invalid");
    if(m.release_tag!==tag) fail("install manifest release tag mismatch");
    if(m.package_version!=null&&m.package_version!==tag.slice(1)) fail("install manifest package version mismatch");
    if(!/^[a-f0-9]{40}$/.test(m.source_commit||"")) fail("install manifest source commit invalid");
    const a=Array.isArray(m.artifacts)?m.artifacts.find(x=>x&&x.name===name):null;
    if(!a||!/^[a-f0-9]{64}$/.test(a.sha256||"")) fail("artifact missing from install manifest");
    const line=sums.split(/\r?\n/).map(x=>x.trim()).find(x=>x.endsWith("  "+name)||x.endsWith(" *"+name));
    if(!line) fail("artifact checksum missing");
    const declared=line.split(/\s+/)[0].toLowerCase();
    const actual=crypto.createHash("sha256").update(bytes).digest("hex");
    if(declared!==a.sha256) fail("checksum and manifest disagree");
    if(actual!==a.sha256||actual!==declared) fail("artifact SHA-256 mismatch");
    if(a.bytes!==bytes.length) fail("artifact byte size mismatch");
    process.stdout.write(m.source_commit+"\t"+actual);
  ' "$tmp/install-manifest.json" "$tmp/INSTALL-SHA256SUMS.txt" "$tmp/$artifact" "$VERSION" "$artifact")" || {
    echo "Stable release integrity verification failed. No fallback source will be used." >&2
    exit 1
  }

  IFS=$'\t' read -r SOURCE_COMMIT ARTIFACT_SHA <<< "$verify_info"
  rm -rf "$INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")" "$tmp/src"
  tar -xzf "$tmp/$artifact" -C "$tmp/src"
  mv "$tmp/src" "$INSTALL_DIR"
  INSTALL_VERSION="$VERSION"
  echo "Integrity verified: $artifact · $ARTIFACT_SHA"
else
  echo "DEVELOPMENT CHANNEL: mutable source ref '$REF' selected explicitly."
  command -v git >/dev/null 2>&1 || { echo "git is required for development-channel installation." >&2; exit 1; }

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$REF"
    git -C "$INSTALL_DIR" checkout --detach FETCH_HEAD
  else
    rm -rf "$INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
  fi

  SOURCE_COMMIT="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
  INSTALL_VERSION="development:$REF"
fi

export NYOBAKANTORAI_PORT="$PORT"
if [[ -n "$HERMES_HOME_OVERRIDE" ]]; then
  export HERMES_HOME="$HERMES_HOME_OVERRIDE"
  export NYOBAKANTORAI_HERMES_HOME="$HERMES_HOME_OVERRIDE"
fi
if command -v hermes >/dev/null 2>&1; then
  export NYOBAKANTORAI_HERMES_EXE="$(command -v hermes)"
fi

echo "Running runtime preflight..."
"$NODE" "$INSTALL_DIR/scripts/preflight.mjs" --runtime

"$NODE" - "$INSTALL_DIR" "$CHANNEL" "$INSTALL_VERSION" "$SOURCE_COMMIT" "$ARTIFACT_SHA" "$EMPLOYEES" <<'NODEMETA'
const fs=require("fs"),path=require("path");
const [dir,channel,version,commit,checksum,employees]=process.argv.slice(2);
const metadata={
  schema:1,
  install_channel:channel,
  version,
  source_commit:commit||null,
  artifact_sha256:checksum||null,
  integrity_verified:channel==="stable",
  installed_at:new Date().toISOString(),
  selected_employees:employees
};
fs.writeFileSync(path.join(dir,".nyobakantorai-install.json"),JSON.stringify(metadata,null,2)+"\n");
NODEMETA

if command -v hermes >/dev/null 2>&1; then
  args=("$INSTALL_DIR/scripts/hermes-bootstrap.mjs" "--upgrade" "--employees=$EMPLOYEES")
  [[ -n "$HERMES_HOME_OVERRIDE" ]] && args+=("--home=$HERMES_HOME_OVERRIDE")
  "$NODE" "${args[@]}"
elif (( WITH_HERMES )); then
  echo "Hermes installer completed but hermes is not on PATH. Open a new shell and rerun." >&2
  exit 1
else
  echo "Hermes not detected. Core-only office install is ready; rerun with --with-hermes for the reference runtime."
fi

echo "Selected employees: $EMPLOYEES"
echo "Install channel: $CHANNEL"
echo "Installed source: $INSTALL_VERSION"
echo "Source commit: $SOURCE_COMMIT"
[[ -z "$ARTIFACT_SHA" ]] || echo "Artifact SHA-256: $ARTIFACT_SHA"
echo "nyobakantorai installed at: $INSTALL_DIR"
echo "Office URL: http://127.0.0.1:$PORT"
if command -v hermes >/dev/null 2>&1; then
  echo "If needed, configure your model/provider with: hermes setup --portal"
fi

if (( START )); then
  echo "Starting nyobakantorai..."
  nohup env NYOBAKANTORAI_PORT="$PORT" NYOBAKANTORAI_HERMES_HOME="${NYOBAKANTORAI_HERMES_HOME:-}" NYOBAKANTORAI_HERMES_EXE="${NYOBAKANTORAI_HERMES_EXE:-hermes}" "$NODE" "$INSTALL_DIR/office/server.mjs" >"$INSTALL_DIR/nyobakantorai.log" 2>&1 &
  echo "PID: $!"
else
  echo "Start later with: NYOBAKANTORAI_PORT=$PORT $NODE $INSTALL_DIR/office/server.mjs"
fi

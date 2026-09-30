param(
  [string]$InstallDir = (Join-Path $HOME "nyobakantorai"),
  [switch]$WithHermes,
  [switch]$Start,
  [int]$Port = 4322,
  [string]$HermesHome = "",
  [string]$Employees = "all",
  [ValidateSet("stable","development")]
  [string]$Channel = "stable",
  [string]$Version = "",
  [string]$Ref = ""
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/exxrawrrr/nyobakantorai.git"
$ReleaseApi = "https://api.github.com/repos/exxrawrrr/nyobakantorai/releases/latest"
$ReleaseBase = "https://github.com/exxrawrrr/nyobakantorai/releases/download"

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path","Machine")
  $user = [Environment]::GetEnvironmentVariable("Path","User")
  $env:Path = "$machine;$user"
}

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $roots = @()
  if ($env:LOCALAPPDATA) { $roots += (Join-Path $env:LOCALAPPDATA "hermes") }
  $roots += (Join-Path $HOME ".hermes")
  foreach ($root in $roots) {
    if (Test-Path $root) {
      $found = Get-ChildItem $root -Recurse -File -Filter node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($found) { return $found.FullName }
    }
  }
  return $null
}

function Find-Hermes {
  $cmd = Get-Command hermes -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  if ($env:LOCALAPPDATA) {
    $candidates = @(
      (Join-Path $env:LOCALAPPDATA "hermes\bin\hermes.exe"),
      (Join-Path $env:LOCALAPPDATA "hermes\bin\hermes.cmd")
    )
    foreach ($candidate in $candidates) {
      if (Test-Path $candidate) { return $candidate }
    }
  }
  return $null
}

function Get-ChecksumMap {
  param([string]$Path)

  $map = @{}
  foreach ($line in (Get-Content -LiteralPath $Path -ErrorAction Stop)) {
    $trimmed = $line.Trim()
    if (-not $trimmed) { continue }
    if ($trimmed -notmatch '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
      throw "Invalid checksum line: $trimmed"
    }
    $name = $Matches[2].Trim()
    if ($map.ContainsKey($name)) {
      throw "Duplicate checksum entry: $name"
    }
    $map[$name] = $Matches[1].ToLowerInvariant()
  }
  return $map
}

if ($Port -lt 1024 -or $Port -gt 65535) {
  throw "Port must be between 1024 and 65535."
}

if ($Ref) {
  if ($PSBoundParameters.ContainsKey("Channel") -and $Channel -ne "development") {
    throw "-Ref is a mutable development source and requires -Channel development."
  }
  $Channel = "development"
}

if ($Channel -eq "development") {
  if ($Version) { throw "-Version is only valid for the stable channel." }
  if (-not $Ref) { $Ref = "main" }
}

if ($Channel -eq "stable" -and $Ref) {
  throw "Stable installation does not accept a mutable -Ref."
}

if (Test-Path $InstallDir) {
  $items = @(Get-ChildItem $InstallDir -Force -ErrorAction SilentlyContinue)
  if ($items.Count -gt 0) {
    if ($Channel -eq "stable") {
      throw "Stable install refuses to mutate an existing non-empty directory: $InstallDir. Choose another -InstallDir, or explicitly use -Channel development."
    }

    $gitDir = Join-Path $InstallDir ".git"
    if (-not (Test-Path $gitDir)) {
      throw "Development install directory exists and is not a Git checkout: $InstallDir"
    }
  }
}

if ($WithHermes -and -not (Find-Hermes)) {
  Write-Host "Installing Hermes Agent from its official upstream installer..."
  $installer = irm "https://hermes-agent.nousresearch.com/install.ps1"
  & ([scriptblock]::Create($installer)) -NonInteractive
  Refresh-Path
}

$node = Find-Node
if (-not $node) {
  throw "Node.js 20+ was not found. Install Node.js 20+ or install Hermes with -WithHermes, then retry."
}

$major = [int](& $node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  throw "Node.js 20+ is required; found major version $major at $node."
}

$installVersion = ""
$sourceCommit = ""
$artifactSha = ""

if ($Channel -eq "stable") {
  if (-not $Version) {
    Write-Host "Resolving latest stable release..."
    $headers = @{
      "Accept" = "application/vnd.github+json"
      "User-Agent" = "nyobakantorai-installer"
    }
    $latest = Invoke-RestMethod -Uri $ReleaseApi -Headers $headers -Method Get
    $Version = [string]$latest.tag_name
  }

  if ($Version -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
    throw "Unknown or non-immutable release identifier: $Version"
  }

  $artifact = "nyobakantorai-core-$Version.zip"
  $base = "$ReleaseBase/$Version"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("nyobakantorai-" + [guid]::NewGuid().ToString("N"))
  $manifestPath = Join-Path $tmp "install-manifest.json"
  $checksumsPath = Join-Path $tmp "INSTALL-SHA256SUMS.txt"
  $artifactPath = Join-Path $tmp $artifact

  try {
    New-Item -ItemType Directory -Force $tmp | Out-Null

    Write-Host "Downloading immutable release $Version..."
    Invoke-WebRequest -Uri "$base/install-manifest.json" -OutFile $manifestPath -UseBasicParsing
    Invoke-WebRequest -Uri "$base/INSTALL-SHA256SUMS.txt" -OutFile $checksumsPath -UseBasicParsing
    Invoke-WebRequest -Uri "$base/$artifact" -OutFile $artifactPath -UseBasicParsing

    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ($manifest.schema -ne 1) { throw "install manifest schema invalid" }
    if ($manifest.project -ne "nyobakantorai") { throw "install manifest project invalid" }
    if ($manifest.channel -ne "stable") { throw "install manifest channel invalid" }
    if ($manifest.integrity -ne "sha256") { throw "install manifest integrity invalid" }
    if ($manifest.release_tag -ne $Version) { throw "install manifest release tag mismatch" }
    if ([string]$manifest.source_commit -notmatch '^[a-f0-9]{40}$') {
      throw "install manifest source commit invalid"
    }

    $artifactEntry = @($manifest.artifacts | Where-Object { $_.name -eq $artifact })
    if ($artifactEntry.Count -ne 1) {
      throw "artifact missing or duplicated in install manifest"
    }

    $entry = $artifactEntry[0]
    if ([string]$entry.sha256 -notmatch '^[a-f0-9]{64}$') {
      throw "artifact hash in manifest invalid"
    }

    $checksums = Get-ChecksumMap -Path $checksumsPath
    if (-not $checksums.ContainsKey($artifact)) {
      throw "artifact checksum missing"
    }

    $declared = ([string]$checksums[$artifact]).ToLowerInvariant()
    $manifestSha = ([string]$entry.sha256).ToLowerInvariant()
    $actualSha = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualBytes = (Get-Item -LiteralPath $artifactPath).Length

    if ($declared -ne $manifestSha) {
      throw "checksum and manifest disagree"
    }
    if ($actualSha -ne $manifestSha -or $actualSha -ne $declared) {
      throw "artifact SHA-256 mismatch"
    }
    if ([int64]$entry.bytes -ne $actualBytes) {
      throw "artifact byte size mismatch"
    }

    if (Test-Path $InstallDir) {
      Remove-Item -Recurse -Force $InstallDir
    }
    $parent = Split-Path -Parent $InstallDir
    if ($parent) { New-Item -ItemType Directory -Force $parent | Out-Null }
    New-Item -ItemType Directory -Force $InstallDir | Out-Null
    Expand-Archive -LiteralPath $artifactPath -DestinationPath $InstallDir -Force

    $sourceCommit = [string]$manifest.source_commit
    $artifactSha = $actualSha
    $installVersion = $Version
    Write-Host "Integrity verified: $artifact · $artifactSha"
  } catch {
    throw "Stable release integrity verification failed. No fallback source will be used. $($_.Exception.Message)"
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "DEVELOPMENT CHANNEL: mutable source ref '$Ref' selected explicitly."

  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    throw "git is required for development-channel installation."
  }

  $parent = Split-Path -Parent $InstallDir
  if ($parent) { New-Item -ItemType Directory -Force $parent | Out-Null }

  if (Test-Path (Join-Path $InstallDir ".git")) {
    & git -C $InstallDir fetch --depth 1 origin $Ref
    if ($LASTEXITCODE -ne 0) { throw "git fetch failed." }
    & git -C $InstallDir checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw "git checkout failed." }
  } else {
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    & git clone --depth 1 --branch $Ref $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed." }
  }

  $sourceCommit = (& git -C $InstallDir rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "git rev-parse failed." }
  $installVersion = "development:$Ref"
}

$env:NYOBAKANTORAI_PORT = [string]$Port
if ($HermesHome) {
  $env:NYOBAKANTORAI_HERMES_HOME = [IO.Path]::GetFullPath($HermesHome)
  $env:HERMES_HOME = $env:NYOBAKANTORAI_HERMES_HOME
}

$hermesExe = Find-Hermes
if ($hermesExe) {
  $env:NYOBAKANTORAI_HERMES_EXE = $hermesExe
}

Write-Host "Running runtime preflight..."
& $node (Join-Path $InstallDir "scripts\preflight.mjs") --runtime
if ($LASTEXITCODE -ne 0) {
  throw "Runtime preflight failed."
}

$installMetadata = [ordered]@{
  schema = 1
  install_channel = $Channel
  version = $installVersion
  source_commit = $sourceCommit
  artifact_sha256 = $(if ($artifactSha) { $artifactSha } else { $null })
  integrity_verified = ($Channel -eq "stable")
  installed_at = [DateTime]::UtcNow.ToString("o")
  selected_employees = $Employees
}
$installMetadata |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $InstallDir ".nyobakantorai-install.json") -Encoding UTF8

if ($hermesExe) {
  Write-Host "Installing/upgrading selected Hermes employee profiles: $Employees"
  $bootstrap = @((Join-Path $InstallDir "scripts\hermes-bootstrap.mjs"), "--upgrade", "--employees=$Employees")
  if ($HermesHome) { $bootstrap += "--home=$env:NYOBAKANTORAI_HERMES_HOME" }
  & $node @bootstrap
  if ($LASTEXITCODE -ne 0) { throw "Hermes profile bootstrap failed." }
} elseif ($WithHermes) {
  throw "Hermes installation finished but the hermes command could not be resolved in this shell. Open a new PowerShell and rerun the installer."
} else {
  Write-Host "Hermes not detected. Core-only office install is ready; rerun with -WithHermes for the reference runtime."
}

Write-Host ""
Write-Host "Selected employees: $Employees"
Write-Host "Install channel: $Channel"
Write-Host "Installed source: $installVersion"
Write-Host "Source commit: $sourceCommit"
if ($artifactSha) { Write-Host "Artifact SHA-256: $artifactSha" }
Write-Host "nyobakantorai installed at: $InstallDir"
Write-Host "Runtime: $node"

if ($hermesExe) {
  Write-Host "Hermes: $hermesExe"
  Write-Host "If you have not configured a model/provider yet, run: hermes setup --portal"
}

Write-Host "Office URL: http://127.0.0.1:$Port"

if ($Start) {
  Write-Host "Starting nyobakantorai..."
  Start-Process -FilePath $node -ArgumentList @((Join-Path $InstallDir "office\server.mjs")) -WorkingDirectory (Join-Path $InstallDir "office")
  Start-Sleep -Milliseconds 900
  Start-Process "http://127.0.0.1:$Port"
} else {
  Write-Host "Start later by setting NYOBAKANTORAI_PORT=$Port and running office\server.mjs with Node."
}

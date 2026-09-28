param(
  [string]$InstallDir = (Join-Path $HOME "nyobakantorai"),
  [switch]$WithHermes,
  [switch]$Start,
  [int]$Port = 4322,
  [string]$HermesHome = "",
  [string]$Ref = "main"
)
$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/exxrawrrr/nyobakantorai.git"
$ZipUrl = "https://github.com/exxrawrrr/nyobakantorai/archive/refs/heads/$Ref.zip"

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
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  }
  return $null
}

if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535." }

if ($WithHermes -and -not (Find-Hermes)) {
  Write-Host "Installing Hermes Agent from its official upstream installer..."
  $installer = irm "https://hermes-agent.nousresearch.com/install.ps1"
  & ([scriptblock]::Create($installer)) -NonInteractive
  Refresh-Path
}

$parent = Split-Path -Parent $InstallDir
if ($parent) { New-Item -ItemType Directory -Force $parent | Out-Null }
if (Test-Path $InstallDir) {
  $gitDir = Join-Path $InstallDir ".git"
  $items = @(Get-ChildItem $InstallDir -Force -ErrorAction SilentlyContinue)
  if (Test-Path $gitDir) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { throw "Existing install is a Git checkout but git is not available." }
    & git -C $InstallDir pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull failed." }
  } elseif ($items.Count -gt 0) {
    throw "InstallDir exists and is not an empty Git checkout: $InstallDir"
  } else {
    Remove-Item -Recurse -Force $InstallDir
  }
}

if (-not (Test-Path $InstallDir)) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    & git clone --depth 1 --branch $Ref $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed." }
  } else {
    Write-Host "Git not found; using the public GitHub source archive."
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("nyobakantorai-" + [guid]::NewGuid().ToString("N"))
    $zip = "$tmp.zip"
    try {
      irm $ZipUrl -OutFile $zip
      Expand-Archive $zip $tmp -Force
      $source = Get-ChildItem $tmp -Directory | Select-Object -First 1
      if (-not $source) { throw "GitHub archive did not contain a source directory." }
      Move-Item $source.FullName $InstallDir
    } finally {
      Remove-Item $zip -Force -ErrorAction SilentlyContinue
      Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

$node = Find-Node
if (-not $node) { throw "Node.js 20+ was not found. Install Node.js 20+ or install Hermes with -WithHermes, then retry." }
$major = [int](& $node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) { throw "Node.js 20+ is required; found major version $major at $node." }

$env:NYOBAKANTORAI_PORT = [string]$Port
if ($HermesHome) {
  $env:NYOBAKANTORAI_HERMES_HOME = [IO.Path]::GetFullPath($HermesHome)
  $env:HERMES_HOME = $env:NYOBAKANTORAI_HERMES_HOME
}
$hermesExe = Find-Hermes
if ($hermesExe) { $env:NYOBAKANTORAI_HERMES_EXE = $hermesExe }

Write-Host "Running runtime preflight..."
& $node (Join-Path $InstallDir "scripts\preflight.mjs") --runtime
if ($LASTEXITCODE -ne 0) { throw "Runtime preflight failed." }

if ($hermesExe) {
  Write-Host "Installing/verifying six Hermes employee profiles..."
  $bootstrap = @((Join-Path $InstallDir "scripts\hermes-bootstrap.mjs"))
  if ($HermesHome) { $bootstrap += "--home=$env:NYOBAKANTORAI_HERMES_HOME" }
  & $node @bootstrap
  if ($LASTEXITCODE -ne 0) { throw "Hermes profile bootstrap failed." }
} elseif ($WithHermes) {
  throw "Hermes installation finished but the hermes command could not be resolved in this shell. Open a new PowerShell and rerun the installer."
} else {
  Write-Host "Hermes not detected. Core-only office install is ready; rerun with -WithHermes for the reference runtime."
}

Write-Host ""
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
  Write-Host "Start later with: `$env:NYOBAKANTORAI_PORT=$Port; & `"$node`" `"$InstallDir\office\server.mjs`""
}
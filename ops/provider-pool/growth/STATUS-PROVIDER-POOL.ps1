$ErrorActionPreference='SilentlyContinue'
$poolRoot=if($env:KANTORAI_PROVIDER_POOL_HOME){$env:KANTORAI_PROVIDER_POOL_HOME}else{Join-Path $env:LOCALAPPDATA 'KANTORAI\provider-pool'}
$ollamaExe=Join-Path $poolRoot 'ollama\runtime\ollama.exe'
$modelsDir=Join-Path $poolRoot 'ollama\models'
$h=$env:KANTORAI_HERMES_EXE
if(-not $h){
  $cmd=Get-Command hermes.exe -ErrorAction SilentlyContinue
  if(-not $cmd){$cmd=Get-Command hermes -ErrorAction SilentlyContinue}
  if($cmd){$h=$cmd.Source}
}

Write-Host ''
Write-Host 'KANTORAI PROVIDER POOL STATUS' -ForegroundColor Cyan
Write-Host '-----------------------------'
Write-Host 'Production default: Nous / nous-welcome (UNCHANGED)' -ForegroundColor Green
Write-Host ('Provider pool root: '+$poolRoot) -ForegroundColor DarkGray

$os=Get-CimInstance Win32_OperatingSystem
$freeGB=[math]::Round($os.FreePhysicalMemory*1KB/1GB,2)
$totalGB=[math]::Round($os.TotalVisibleMemorySize*1KB/1GB,2)
Write-Host ('RAM: '+$freeGB+' GB free / '+$totalGB+' GB total')
if($freeGB -lt 2.0){Write-Host 'Local inference: BLOCKED by memory guard (<2 GB free)' -ForegroundColor Yellow}
else{Write-Host 'Local inference: ELIGIBLE by memory guard' -ForegroundColor Green}

if(Test-Path $ollamaExe){
  $fileVersion=(Get-Item $ollamaExe).VersionInfo.ProductVersion
  if([string]::IsNullOrWhiteSpace($fileVersion)){$fileVersion='unknown'}
  Write-Host ('Ollama binary: READY | version '+$fileVersion) -ForegroundColor Green
}else{
  Write-Host 'Ollama binary: MISSING' -ForegroundColor Red
}

try{
  $tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
  Write-Host 'Ollama API: ONLINE' -ForegroundColor Green
  foreach($m in @($tags.models)){Write-Host ('  model: '+$m.name+' | '+[math]::Round($m.size/1MB)+' MB')}
}catch{
  Write-Host 'Ollama API: OFFLINE'
  $manifestRoot=Join-Path $modelsDir 'manifests'
  if(Test-Path $manifestRoot){
    foreach($f in Get-ChildItem $manifestRoot -Recurse -File){
      Write-Host ('  manifest: '+$f.FullName.Substring($manifestRoot.Length).TrimStart('\'))
    }
  }
}

Write-Host ''
if(-not $h -or -not (Test-Path $h)){
  Write-Host 'Hermes CLI: NOT FOUND — set KANTORAI_HERMES_EXE or add hermes to PATH.' -ForegroundColor Yellow
  exit 0
}
Write-Host ('Hermes CLI: '+$h) -ForegroundColor Green
Write-Host 'Hermes provider labs:' -ForegroundColor Cyan
foreach($lab in @(
  @{Name='Qwen local';Home=(Join-Path $poolRoot 'hermes-lab-qwen')},
  @{Name='DeepSeek local';Home=(Join-Path $poolRoot 'hermes-lab-deepseek')},
  @{Name='Gemini';Home=(Join-Path $poolRoot 'hermes-lab-gemini')}
)){
  $env:HERMES_HOME=$lab.Home
  $provider=(& $h config get model.provider 2>$null | Out-String).Trim()
  $model=(& $h config get model.default 2>$null | Out-String).Trim()
  Write-Host ('  '+$lab.Name+': '+$provider+' / '+$model)
}
$env:HERMES_HOME=Join-Path $poolRoot 'hermes-lab-gemini'
$auth=(& $h auth list 2>$null | Out-String)
$geminiReady=[bool]($auth -match '(?im)^gemini\b|Google')
Write-Host ('Gemini credential: '+$(if($geminiReady){'PRESENT'}else{'NOT CONFIGURED'})) -ForegroundColor $(if($geminiReady){'Green'}else{'Yellow'})
Write-Host 'Keys are never printed by this status tool.' -ForegroundColor DarkGray

param(
  [ValidateSet('qwen','deepseek','gemini')]
  [string]$Provider,
  [string]$Prompt
)
$ErrorActionPreference='Stop'
$poolRoot=if($env:KANTORAI_PROVIDER_POOL_HOME){$env:KANTORAI_PROVIDER_POOL_HOME}else{Join-Path $env:LOCALAPPDATA 'KANTORAI\provider-pool'}
$h=$env:KANTORAI_HERMES_EXE
if(-not $h){
  $cmd=Get-Command hermes.exe -ErrorAction SilentlyContinue
  if(-not $cmd){$cmd=Get-Command hermes -ErrorAction SilentlyContinue}
  if($cmd){$h=$cmd.Source}
}
if(-not $h -or -not (Test-Path $h)){throw 'Hermes CLI not found. Set KANTORAI_HERMES_EXE to the Hermes executable.'}

if(-not $Provider){
  Write-Host 'Provider: qwen | deepseek | gemini' -ForegroundColor Cyan
  $Provider=(Read-Host 'Pilih provider').Trim().ToLowerInvariant()
}
if($Provider -notin @('qwen','deepseek','gemini')){throw 'Provider tidak valid.'}
if([string]::IsNullOrWhiteSpace($Prompt)){$Prompt=Read-Host 'Prompt'}
if([string]::IsNullOrWhiteSpace($Prompt)){throw 'Prompt kosong.'}

Remove-Item Env:HERMES_GEMINI_AQ_STUDIO_PILOT -ErrorAction SilentlyContinue
switch($Provider){
  'qwen' {
    & (Join-Path $PSScriptRoot 'START-OLLAMA.ps1')
    if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
    $providerHome=Join-Path $poolRoot 'hermes-lab-qwen'
  }
  'deepseek' {
    & (Join-Path $PSScriptRoot 'START-OLLAMA.ps1')
    if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
    $providerHome=Join-Path $poolRoot 'hermes-lab-deepseek'
  }
  'gemini' {
    $env:HERMES_GEMINI_AQ_STUDIO_PILOT='1'
    $providerHome=Join-Path $poolRoot 'hermes-lab-gemini'
  }
}
$env:HERMES_HOME=$providerHome
$usageDir=Join-Path $poolRoot 'usage'
New-Item -ItemType Directory -Force -Path $usageDir | Out-Null
$usage=Join-Path $usageDir ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$Provider+'.json')

Write-Host ''
Write-Host ('=== KANTORAI SPECIALIST: '+$Provider.ToUpper()+' ===') -ForegroundColor Cyan
& $h --ignore-rules --usage-file $usage -z $Prompt
$rc=$LASTEXITCODE
Write-Host ''
Write-Host ('Provider='+$Provider+' | exit='+$rc+' | usage='+$usage) -ForegroundColor DarkGray
exit $rc

param(
  [ValidateSet('qwen','deepseek','gemini')]
  [string]$Provider,
  [string]$Prompt
)
$ErrorActionPreference='Stop'
$base='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool'
$h='D:\RAFDI_DATA\03_AI_OFFICE\Hermes\hermes-agent\venv\Scripts\hermes.exe'

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
    & (Join-Path $base 'START-OLLAMA.ps1')
    if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
    $providerHome=Join-Path $base 'hermes-lab-qwen'
  }
  'deepseek' {
    & (Join-Path $base 'START-OLLAMA.ps1')
    if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
    $providerHome=Join-Path $base 'hermes-lab-deepseek'
  }
  'gemini' {
    $env:HERMES_GEMINI_AQ_STUDIO_PILOT='1'
    $providerHome=Join-Path $base 'hermes-lab-gemini'
  }
}

$env:HERMES_HOME=$providerHome
$usageDir=Join-Path $base 'usage'
New-Item -ItemType Directory -Force -Path $usageDir | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$usage=Join-Path $usageDir ($stamp+'-'+$Provider+'.json')

Write-Host ''
Write-Host ('=== KANTORAI SPECIALIST: '+$Provider.ToUpper()+' ===') -ForegroundColor Cyan
& $h --ignore-rules --usage-file $usage -z $Prompt
$rc=$LASTEXITCODE
Write-Host ''
Write-Host ('Provider='+$Provider+' | exit='+$rc+' | usage='+$usage) -ForegroundColor DarkGray
exit $rc

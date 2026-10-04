$ErrorActionPreference='Stop'
$poolRoot=if($env:KANTORAI_PROVIDER_POOL_HOME){$env:KANTORAI_PROVIDER_POOL_HOME}else{Join-Path $env:LOCALAPPDATA 'KANTORAI\provider-pool'}
$env:HERMES_HOME=Join-Path $poolRoot 'hermes-lab-gemini'
$env:HERMES_GEMINI_AQ_STUDIO_PILOT='1'
$h=$env:KANTORAI_HERMES_EXE
if(-not $h){
  $cmd=Get-Command hermes.exe -ErrorAction SilentlyContinue
  if(-not $cmd){$cmd=Get-Command hermes -ErrorAction SilentlyContinue}
  if($cmd){$h=$cmd.Source}
}
if(-not $h -or -not (Test-Path $h)){throw 'Hermes CLI not found. Set KANTORAI_HERMES_EXE to the Hermes executable.'}

Write-Host ''
Write-Host 'KANTORAI - GEMINI AI STUDIO SETUP' -ForegroundColor Cyan
Write-Host 'Consumer Gemini subscription and Gemini API billing/quota are separate.' -ForegroundColor Yellow
Write-Host 'No secret is printed by this script.' -ForegroundColor DarkGray
Write-Host ''

New-Item -ItemType Directory -Force -Path $env:HERMES_HOME | Out-Null
$auth=(& $h auth list 2>$null | Out-String)
if($auth -notmatch '(?im)^gemini\b'){
  Write-Host 'No Gemini credential found in this isolated lab.' -ForegroundColor Yellow
  Write-Host 'Create/copy an AI Studio API key, then paste it ONLY when Hermes asks.' -ForegroundColor Yellow
  Start-Process 'https://aistudio.google.com/api-keys'
  & $h auth add gemini --type api-key --label 'kantorai-gemini-aistudio'
  if($LASTEXITCODE -ne 0){throw 'Gemini credential setup failed.'}
}else{
  Write-Host 'Existing Gemini credential found; reusing it.' -ForegroundColor Green
}

$models=@('gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash')
$passed=$false
foreach($m in $models){
  Write-Host ''
  Write-Host ('Testing '+$m+'...') -ForegroundColor Cyan
  & $h --ignore-rules --model $m -z 'Reply exactly: GEMINI_KANTORAI_OK'
  if($LASTEXITCODE -eq 0){
    Write-Host ($m+' PASS') -ForegroundColor Green
    $passed=$true
    break
  }
}
if(-not $passed){throw 'Gemini connectivity test failed on all configured models.'}
Write-Host ''
Write-Host 'GEMINI AI STUDIO LAB PASS.' -ForegroundColor Green

$ErrorActionPreference='Stop'
$env:HERMES_HOME='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\hermes-lab-gemini'
$env:HERMES_GEMINI_AQ_STUDIO_PILOT='1'
$h='D:\RAFDI_DATA\03_AI_OFFICE\Hermes\hermes-agent\venv\Scripts\hermes.exe'

Write-Host ''
Write-Host 'KANTORAI - GEMINI AI STUDIO SETUP' -ForegroundColor Cyan
Write-Host 'Consumer Gemini subscription and Gemini API billing/quota are separate.' -ForegroundColor Yellow
Write-Host 'No secret is printed by this script.' -ForegroundColor DarkGray
Write-Host ''

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

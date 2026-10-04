$ErrorActionPreference='Continue'
$base='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool'
$h='D:\RAFDI_DATA\03_AI_OFFICE\Hermes\hermes-agent\venv\Scripts\hermes.exe'
& (Join-Path $base 'START-OLLAMA.ps1')
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$tests=@(
  @{Name='QWEN';Home=(Join-Path $base 'hermes-lab-qwen');Marker='QWEN_KANTORAI_OK'},
  @{Name='DEEPSEEK';Home=(Join-Path $base 'hermes-lab-deepseek');Marker='DEEPSEEK_KANTORAI_OK'}
)
foreach($t in $tests){
  Write-Host ('Testing '+$t.Name+'...') -ForegroundColor Cyan
  $env:HERMES_HOME=$t.Home
  $out=(& $h --ignore-rules -z ('Reply exactly: '+$t.Marker) 2>&1 | Out-String).Trim()
  if($LASTEXITCODE -eq 0 -and $out -match [regex]::Escape($t.Marker)){
    Write-Host ($t.Name+' PASS') -ForegroundColor Green
  }else{
    Write-Host ($t.Name+' FAIL') -ForegroundColor Red
    Write-Host $out
  }
}

$ErrorActionPreference='Continue'
$poolRoot=if($env:KANTORAI_PROVIDER_POOL_HOME){$env:KANTORAI_PROVIDER_POOL_HOME}else{Join-Path $env:LOCALAPPDATA 'KANTORAI\provider-pool'}
$h=$env:KANTORAI_HERMES_EXE
if(-not $h){
  $cmd=Get-Command hermes.exe -ErrorAction SilentlyContinue
  if(-not $cmd){$cmd=Get-Command hermes -ErrorAction SilentlyContinue}
  if($cmd){$h=$cmd.Source}
}
if(-not $h -or -not (Test-Path $h)){throw 'Hermes CLI not found. Set KANTORAI_HERMES_EXE to the Hermes executable.'}

& (Join-Path $PSScriptRoot 'START-OLLAMA.ps1')
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$tests=@(
  @{Name='QWEN';Home=(Join-Path $poolRoot 'hermes-lab-qwen');Marker='QWEN_KANTORAI_OK'},
  @{Name='DEEPSEEK';Home=(Join-Path $poolRoot 'hermes-lab-deepseek');Marker='DEEPSEEK_KANTORAI_OK'}
)
$failed=0
foreach($t in $tests){
  Write-Host ('Testing '+$t.Name+'...') -ForegroundColor Cyan
  $env:HERMES_HOME=$t.Home
  $out=(& $h --ignore-rules -z ('Reply exactly: '+$t.Marker) 2>&1 | Out-String).Trim()
  if($LASTEXITCODE -eq 0 -and $out -match [regex]::Escape($t.Marker)){
    Write-Host ($t.Name+' PASS') -ForegroundColor Green
  }else{
    $failed++
    Write-Host ($t.Name+' FAIL') -ForegroundColor Red
    Write-Host $out
  }
}
if($failed){exit 1}

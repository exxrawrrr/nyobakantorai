$ErrorActionPreference='SilentlyContinue'
$listeners=Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue
foreach($l in $listeners){
  $p=Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue
  if($p -and ($p.ProcessName -match 'ollama')){
    Stop-Process -Id $p.Id -Force
  }
}
Write-Host 'OLLAMA STOPPED' -ForegroundColor Yellow

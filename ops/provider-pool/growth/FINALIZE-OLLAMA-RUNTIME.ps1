$ErrorActionPreference='Stop'
Import-Module BitsTransfer
$job=Get-BitsTransfer -Name 'KANTORAI Ollama v0.35.1' -ErrorAction SilentlyContinue
if(-not $job){throw 'BITS job tidak ditemukan.'}
if($job.JobState -ne 'Transferred'){throw ('Download belum selesai: '+$job.JobState)}
Complete-BitsTransfer -BitsJob $job
$zip='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\ollama\ollama-windows-amd64-v0.35.1.zip'
$expected='dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93'
$actual=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ('SHA256='+$actual)
if($actual -ne $expected){throw 'SHA256 mismatch. Refusing to extract or execute.'}
$runtime='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\ollama\runtime'
if(Test-Path $runtime){Get-ChildItem $runtime -Force | Remove-Item -Recurse -Force}
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $runtime -Force
$exe=Get-ChildItem $runtime -Filter 'ollama.exe' -File -Recurse | Select-Object -First 1
if(-not $exe){throw 'ollama.exe not found after extraction.'}
if($exe.DirectoryName -ne $runtime){
  $items=Get-ChildItem $exe.DirectoryName -Force
  foreach($item in $items){Move-Item $item.FullName $runtime -Force}
}
$exe=Join-Path $runtime 'ollama.exe'
Write-Host ('OLLAMA_EXE='+$exe)
& $exe --version
if($LASTEXITCODE -ne 0){throw 'ollama --version failed'}
Write-Host 'OLLAMA_RUNTIME_VERIFIED' -ForegroundColor Green

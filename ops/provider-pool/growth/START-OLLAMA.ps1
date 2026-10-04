$ErrorActionPreference='Stop'
$base='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\ollama'
$exe=Join-Path $base 'runtime\ollama.exe'
$log=Join-Path $base 'logs\ollama-serve.log'
if(-not (Test-Path $exe)){throw 'Ollama runtime belum tersedia. Tunggu download/extract selesai.'}

try{
  $r=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
  Write-Host 'OLLAMA ALREADY READY' -ForegroundColor Green
  exit 0
}catch{}

$os=Get-CimInstance Win32_OperatingSystem
$freeGB=[math]::Round($os.FreePhysicalMemory*1KB/1GB,2)
if($freeGB -lt 2.0){
  throw ('RAM guard: free memory '+$freeGB+' GB < 2.0 GB. Refusing to start local AI.')
}

$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_MODELS=Join-Path $base 'models'
$env:OLLAMA_MAX_LOADED_MODELS='1'
$env:OLLAMA_NUM_PARALLEL='1'
$env:OLLAMA_KEEP_ALIVE='30s'
$p=Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError (Join-Path $base 'logs\ollama-serve.err.log') -PassThru
for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 500
  try{
    $r=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
    Write-Host ('OLLAMA READY | PID='+$p.Id+' | freeRAM='+$freeGB+' GB') -ForegroundColor Green
    exit 0
  }catch{}
}
throw 'Ollama did not become ready.'

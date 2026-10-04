$ErrorActionPreference='Stop'
& 'D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\START-OLLAMA.ps1'
$exe='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\ollama\runtime\ollama.exe'
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_MODELS='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool\ollama\models'
Write-Host ''
Write-Host 'Pulling Qwen3 0.6B (primary low-memory local utility)...' -ForegroundColor Cyan
& $exe pull qwen3:0.6b
if($LASTEXITCODE -ne 0){throw 'Qwen pull failed'}
Write-Host ''
Write-Host 'Pulling DeepSeek-R1 1.5B (optional local reasoning; requires more free RAM)...' -ForegroundColor Cyan
& $exe pull deepseek-r1:1.5b
if($LASTEXITCODE -ne 0){throw 'DeepSeek pull failed'}
Write-Host ''
Write-Host 'LOCAL MODELS READY.' -ForegroundColor Green

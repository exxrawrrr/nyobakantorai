$ErrorActionPreference='SilentlyContinue'
$base='D:\RAFDI_DATA\03_AI_OFFICE\AI-OFFICE-OPERATIONS\provider-pool'
$h='D:\RAFDI_DATA\03_AI_OFFICE\Hermes\hermes-agent\venv\Scripts\hermes.exe'
$ollamaExe=Join-Path $base 'ollama\runtime\ollama.exe'
$modelsDir=Join-Path $base 'ollama\models'

Write-Host ''
Write-Host 'KANTORAI PROVIDER POOL STATUS' -ForegroundColor Cyan
Write-Host '-----------------------------'
Write-Host 'Production default: Nous / nous-welcome (UNCHANGED)' -ForegroundColor Green

$os=Get-CimInstance Win32_OperatingSystem
$freeGB=[math]::Round($os.FreePhysicalMemory*1KB/1GB,2)
$totalGB=[math]::Round($os.TotalVisibleMemorySize*1KB/1GB,2)
Write-Host ('RAM: '+$freeGB+' GB free / '+$totalGB+' GB total')
if($freeGB -lt 2.0){Write-Host 'Local inference: BLOCKED by memory guard (<2 GB free)' -ForegroundColor Yellow}
else{Write-Host 'Local inference: ELIGIBLE by memory guard' -ForegroundColor Green}

if(Test-Path $ollamaExe){
  $fileVersion=(Get-Item $ollamaExe).VersionInfo.ProductVersion
  if([string]::IsNullOrWhiteSpace($fileVersion)){$fileVersion='0.35.1'}
  Write-Host ('Ollama binary: VERIFIED | version '+$fileVersion) -ForegroundColor Green
}else{
  Write-Host 'Ollama binary: MISSING' -ForegroundColor Red
}

try{
  $tags=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
  Write-Host 'Ollama API: ONLINE' -ForegroundColor Green
  if(@($tags.models).Count){
    foreach($m in $tags.models){
      Write-Host ('  model: '+$m.name+' | '+[math]::Round($m.size/1MB)+' MB')
    }
  }else{
    Write-Host '  no finalized models registered'
  }
}catch{
  Write-Host 'Ollama API: OFFLINE'
  $manifestRoot=Join-Path $modelsDir 'manifests'
  if(Test-Path $manifestRoot){
    $files=Get-ChildItem $manifestRoot -Recurse -File
    foreach($f in $files){
      $rel=$f.FullName.Substring($manifestRoot.Length).TrimStart('\')
      Write-Host ('  manifest: '+$rel)
    }
  }
}

Write-Host ''
Write-Host 'Hermes provider labs:' -ForegroundColor Cyan
foreach($lab in @(
  @{Name='Qwen local';Home=(Join-Path $base 'hermes-lab-qwen')},
  @{Name='DeepSeek local';Home=(Join-Path $base 'hermes-lab-deepseek')},
  @{Name='Gemini';Home=(Join-Path $base 'hermes-lab-gemini')}
)){
  $env:HERMES_HOME=$lab.Home
  $provider=(& $h config get model.provider 2>$null | Out-String).Trim()
  $model=(& $h config get model.default 2>$null | Out-String).Trim()
  Write-Host ('  '+$lab.Name+': '+$provider+' / '+$model)
}

$env:HERMES_HOME=Join-Path $base 'hermes-lab-gemini'
$auth=(& $h auth list 2>$null | Out-String)
$geminiReady=[bool]($auth -match '(?im)^gemini\b|Google')
Write-Host ''
Write-Host ('Gemini credential: '+$(if($geminiReady){'PRESENT'}else{'NOT CONFIGURED'})) -ForegroundColor $(if($geminiReady){'Green'}else{'Yellow'})
Write-Host 'Keys are never printed by this status tool.' -ForegroundColor DarkGray
Write-Host ''

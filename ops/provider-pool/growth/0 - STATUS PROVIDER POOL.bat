@echo off
title KANTORAI Provider Pool - Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0STATUS-PROVIDER-POOL.ps1"
pause

@echo off
title KANTORAI Provider Pool - Local AI Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0TEST-LOCAL-MODELS.ps1"
pause

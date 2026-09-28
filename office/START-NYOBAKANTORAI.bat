@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required.& exit /b 1)
node build.mjs || exit /b 1
node server.mjs

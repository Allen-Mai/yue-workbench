@echo off
rem ============================================================
rem  Yue Workbench - stop local service
rem ============================================================
echo Stopping Yue Workbench service...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*serve-loop.cmd*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 800; if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { 'STILL RUNNING' } else { 'STOPPED - port 5173 is free' }"
echo.
echo Note: the startup entry brings it back at next logon.
echo       To disable autostart, delete the Yue Workbench .cmd in your Startup folder.
echo.
pause
@echo off
rem ============================================================
rem  Yue Workbench - start local service (visible window)
rem  Close this window to stop the service.
rem ============================================================
cd /d "%~dp0"
echo Starting Yue Workbench...
echo URL: http://localhost:5173/
echo Close this window to stop the service.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173/"
call "scripts\serve-loop.cmd"
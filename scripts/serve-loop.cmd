@echo off
rem ============================================================
rem  Yue Workbench - persistent local server (auto restart)
rem  Started by scripts\serve-hidden.vbs or manually.
rem  Stop with: ?????.bat  (StopWorkbench.bat)
rem ============================================================
cd /d "%~dp0.."

set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo [ERROR] Node runtime not found: %NODE%
  timeout /t 30 >nul
  exit /b 1
)

set "VITE=node_modules\vite\bin\vite.js"
if not exist "%VITE%" (
  echo [ERROR] %VITE% not found. Run: pnpm install
  timeout /t 30 >nul
  exit /b 1
)

:loop
"%NODE%" "%VITE%" --port 5173 --strictPort
echo.
echo [service exited] restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
@echo off
chcp 65001 >nul
title 月月的工作台 · 本地服务（关闭此窗口即停止服务）
cd /d "%~dp0"

echo ============================================
echo   月月的工作台 · 正在启动本地服务
echo ============================================
echo.

rem ---- 找 Node：优先系统 PATH，找不到就用 DSH 自带运行时 ----
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "NODE=C:\Users\月月\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist "%NODE%" (
  if not "%NODE%"=="node" (
    echo [错误] 找不到 Node.js 运行时：
    echo        %NODE%
    echo        请先安装 Node.js 18+，或修改本脚本里的 NODE 路径。
    echo.
    pause
    exit /b 1
  )
)

set "VITE=%~dp0node_modules\vite\bin\vite.js"
if not exist "%VITE%" (
  echo [错误] 还没有安装依赖。
  echo        请在本目录打开终端执行：pnpm install
  echo.
  pause
  exit /b 1
)

echo Node   : %NODE%
echo 地址   : http://localhost:5173/
echo.
echo 稍等 2 秒会自动打开浏览器；关闭本窗口即停止服务。
echo --------------------------------------------
echo.

start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173/"
"%NODE%" "%VITE%" --port 5173 --strictPort

echo.
echo 服务已停止。
pause

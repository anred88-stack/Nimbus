@echo off
REM ============================================================
REM VIS - Visual Impact Software
REM One-click launcher: setup-on-first-run + dev server.
REM Double-click this file from Explorer, or run "vis [cmd]"
REM from a terminal.
REM
REM Subcommands:
REM   vis            -> dev server (default)
REM   vis setup      -> install deps and stop
REM   vis test       -> unit tests
REM   vis build      -> production build
REM   vis preview    -> build + serve production locally
REM   vis e2e        -> Playwright end-to-end tests
REM   vis report     -> open Playwright HTML report
REM ============================================================

setlocal EnableDelayedExpansion

REM Always run from the repo root, even if the user double-clicks
REM from inside a subfolder.
cd /d "%~dp0"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=dev"

echo.
echo ============================================
echo  VIS - Visual Impact Software
echo ============================================
echo.

REM 1) Verify Node is installed
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found on PATH.
  echo         Install Node 20 LTS from https://nodejs.org/ and re-run this script.
  pause
  exit /b 1
)

REM 2) Verify Node major >= 20
for /f "delims=" %%i in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%i
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node 20 LTS or newer required.
  echo         You have:
  node -v
  echo         Upgrade from https://nodejs.org/ and re-run.
  pause
  exit /b 1
)

REM 3) Enable Corepack so the right pnpm version comes online
call corepack enable >nul 2>nul

REM 4) Install dependencies if node_modules is missing or stale
if not exist "node_modules\.modules.yaml" (
  echo [SETUP] First-run install ^(this takes ~1 minute^)...
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    echo [ERROR] pnpm install failed. Check the messages above.
    pause
    exit /b 1
  )
  echo [OK] Dependencies installed.
)

REM 5) Branch on subcommand
if /i "%CMD%"=="setup" (
  echo.
  echo [OK] Setup complete. Run "vis" or double-click vis.cmd to start the dev server.
  pause
  exit /b 0
)

if /i "%CMD%"=="test" (
  echo [RUN] Unit tests...
  call pnpm test
  pause
  exit /b
)

if /i "%CMD%"=="build" (
  echo [RUN] Production build...
  call pnpm build
  pause
  exit /b
)

if /i "%CMD%"=="preview" (
  echo [RUN] Build + preview server...
  call pnpm build
  call pnpm preview
  exit /b
)

if /i "%CMD%"=="e2e" (
  REM Install Playwright browsers on first E2E run only.
  if not exist "%LocalAppData%\ms-playwright" (
    echo [SETUP] Installing Playwright browsers ^(first-run, ~3 minutes^)...
    call pnpm exec playwright install --with-deps
  )
  call pnpm test:e2e
  pause
  exit /b
)

if /i "%CMD%"=="report" (
  call pnpm exec playwright show-report
  exit /b
)

if /i "%CMD%"=="dev" (
  echo [RUN] Dev server on http://localhost:5173
  echo       Press Ctrl+C to stop.
  echo.
  call pnpm dev
  exit /b
)

echo [ERROR] Unknown command: %CMD%
echo         Usage: vis [dev^|setup^|test^|build^|preview^|e2e^|report]
pause
exit /b 1

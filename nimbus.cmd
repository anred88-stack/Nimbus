@echo off
REM ============================================================
REM Nimbus - Nuclear & Impact Modeling & Blast Understanding System
REM One-click launcher: setup-on-first-run + dev server +
REM optional Tier-3 GeoClaw fixture pipeline (WSL2).
REM
REM Double-click from Explorer, or run "nimbus [cmd]" from a terminal.
REM
REM Standard subcommands:
REM   nimbus                -> dev server (default)
REM   nimbus setup          -> install pnpm deps and stop
REM   nimbus check          -> typecheck + lint + unit tests (CI sanity)
REM   nimbus test           -> unit tests
REM   nimbus build          -> production build
REM   nimbus preview        -> build + serve production locally
REM   nimbus e2e            -> Playwright end-to-end tests
REM   nimbus report         -> open Playwright HTML report
REM   nimbus validate       -> Tier 0/1/2/3 validation suite (no GeoClaw needed)
REM
REM GeoClaw Tier-3 pipeline (optional, requires WSL2 + ~1 GB):
REM   nimbus geoclaw setup           -> one-time WSL toolchain install (~5 min)
REM   nimbus geoclaw run <scenario>  -> run one scenario (id from scenarios.json)
REM   nimbus geoclaw batch named     -> regenerate all 7 historical fixtures
REM   nimbus geoclaw batch custom    -> regenerate all 8 custom-grid fixtures
REM   nimbus geoclaw batch all       -> regenerate the lot
REM   nimbus geoclaw test            -> just the geoclawComparison.test.ts
REM ============================================================

setlocal EnableDelayedExpansion

REM Always run from the repo root, even if the user double-clicks
REM from inside a subfolder.
cd /d "%~dp0"

set "CMD=%~1"
set "SUBCMD=%~2"
set "ARG3=%~3"
if "%CMD%"=="" set "CMD=dev"

echo.
echo ============================================
echo  Nimbus - Nuclear ^& Impact Modeling ^& Blast Understanding System
echo ============================================
echo.

REM ---------- 1) GeoClaw subcommands route early ----------
REM (these don't need Node, only WSL — handle before the Node check)
if /i "%CMD%"=="geoclaw" goto :geoclaw_dispatch

REM ---------- 2) Verify Node is installed ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found on PATH.
  echo         Install Node 20 LTS from https://nodejs.org/ and re-run this script.
  pause
  exit /b 1
)

REM ---------- 3) Verify Node major ^>= 20 ----------
for /f "delims=" %%i in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%i
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node 20 LTS or newer required.
  echo         You have:
  node -v
  echo         Upgrade from https://nodejs.org/ and re-run.
  pause
  exit /b 1
)

REM ---------- 4) Enable Corepack so the right pnpm version comes online ----------
call corepack enable >nul 2>nul

REM ---------- 5) Install pnpm dependencies if node_modules is missing ----------
if not exist "node_modules\.modules.yaml" (
  echo [SETUP] First-run pnpm install ^(~1 minute^)...
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    echo [ERROR] pnpm install failed. Check the messages above.
    pause
    exit /b 1
  )
  echo [OK] pnpm dependencies installed.
)

REM ---------- 5b) First-run Playwright browsers ----------
REM Needed for `nimbus e2e`. Skipped silently on subsequent launches.
if not exist "%LocalAppData%\ms-playwright" (
  echo [SETUP] Installing Playwright browsers ^(one-time, ~3 minutes, ~500 MB^)...
  call pnpm exec playwright install --with-deps
  if errorlevel 1 (
    echo [WARN] Playwright install failed - E2E tests will not work until you run "nimbus e2e".
  ) else (
    echo [OK] Playwright browsers installed.
  )
)

REM ---------- 5c) First-run GeoClaw toolchain (WSL2-backed) ----------
REM Needed for `nimbus geoclaw run/batch` to regenerate Tier-3 fixtures.
REM The committed fixtures + `nimbus validate` work without it; this is
REM only for re-running GeoClaw against new model changes.
where wsl >nul 2>nul
if errorlevel 1 (
  echo [INFO] WSL2 not installed - skipping GeoClaw Tier-3 toolchain setup.
  echo        To enable fixture regeneration, install WSL once via:
  echo            wsl --install -d Ubuntu-22.04
  echo        then re-run this script.
) else (
  wsl -d Ubuntu-22.04 -- bash -c "test -x /root/clawenv/bin/python && /root/clawenv/bin/python -c 'import clawpack' 2>/dev/null" >nul 2>nul
  if errorlevel 1 (
    echo [SETUP] Installing GeoClaw Tier-3 toolchain via WSL2 ^(one-time, ~5 minutes, ~1 GB^)...
    wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/install.sh
    if errorlevel 1 (
      echo [WARN] GeoClaw install failed - Tier-3 fixture regeneration will not work.
      echo        You can retry with: nimbus geoclaw setup
    ) else (
      echo [OK] GeoClaw toolchain installed.
    )
  )
)

REM ---------- 6) Branch on subcommand ----------
if /i "%CMD%"=="setup" (
  echo.
  echo [OK] Setup complete. Run "nimbus" or double-click nimbus.cmd to start the dev server.
  pause
  exit /b 0
)

if /i "%CMD%"=="test" (
  echo [RUN] Unit tests...
  call pnpm test
  pause
  exit /b
)

if /i "%CMD%"=="check" (
  echo [RUN] Typecheck + lint + unit tests...
  call pnpm typecheck
  if errorlevel 1 ( pause & exit /b 1 )
  call pnpm lint
  if errorlevel 1 ( pause & exit /b 1 )
  call pnpm test
  pause
  exit /b
)

if /i "%CMD%"=="validate" (
  echo [RUN] Validation suite ^(Tier 0/1/2/3 — uses committed GeoClaw fixtures, no install needed^)...
  call pnpm test src/physics/validation
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
echo         Usage: nimbus [dev^|setup^|check^|test^|validate^|build^|preview^|e2e^|report^|geoclaw ...]
pause
exit /b 1


REM ============================================================
REM GeoClaw Tier-3 fixture pipeline (WSL2-backed)
REM ============================================================
:geoclaw_dispatch
if /i "%SUBCMD%"=="setup" goto :geoclaw_setup
if /i "%SUBCMD%"=="run" goto :geoclaw_run
if /i "%SUBCMD%"=="batch" goto :geoclaw_batch
if /i "%SUBCMD%"=="test" goto :geoclaw_test
echo [ERROR] Unknown geoclaw subcommand: %SUBCMD%
echo         Usage: nimbus geoclaw [setup^|run ^<id^>^|batch named^|custom^|all^|test]
pause
exit /b 1

:geoclaw_check_wsl
where wsl >nul 2>nul
if errorlevel 1 (
  echo [ERROR] WSL not found on PATH.
  echo         Install WSL2 + Ubuntu 22.04 ^(in an admin PowerShell^):
  echo             wsl --install -d Ubuntu-22.04
  echo         Then re-run this command.
  pause
  exit /b 1
)
exit /b 0

:geoclaw_setup
echo [GEOCLAW] One-time toolchain setup via WSL2 ^(Ubuntu 22.04^).
echo           Installs gfortran + python3-venv + clawpack 5.14 + numpy/matplotlib/scipy.
echo           Disk: ~1 GB. Time: ~5 minutes on first run, instant on re-runs.
echo.
call :geoclaw_check_wsl
if errorlevel 1 exit /b 1
wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/install.sh
if errorlevel 1 (
  echo [ERROR] GeoClaw install failed. See messages above.
  pause
  exit /b 1
)
echo.
echo [OK] GeoClaw toolchain ready. Try:
echo       nimbus geoclaw run tohoku-2011
echo       nimbus geoclaw batch all
pause
exit /b 0

:geoclaw_run
if "%ARG3%"=="" (
  echo [ERROR] Usage: nimbus geoclaw run ^<scenario-id^>
  echo         See scripts\geoclaw\scenarios.json for available IDs.
  pause
  exit /b 1
)
call :geoclaw_check_wsl
if errorlevel 1 exit /b 1
echo [GEOCLAW] Running scenario: %ARG3%
wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/_run_one.sh "%ARG3%"
pause
exit /b

:geoclaw_batch
call :geoclaw_check_wsl
if errorlevel 1 exit /b 1
if /i "%ARG3%"=="named" (
  echo [GEOCLAW] Re-running all 7 named historical scenarios...
  wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/_batch_named.sh
  pause
  exit /b
)
if /i "%ARG3%"=="custom" (
  echo [GEOCLAW] Re-running all 8 custom-input scenarios...
  wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/_batch_custom.sh
  pause
  exit /b
)
if /i "%ARG3%"=="all" (
  echo [GEOCLAW] Re-running ALL named + custom scenarios...
  wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/_batch_named.sh
  wsl -d Ubuntu-22.04 --cd "%~dp0" -- bash scripts/geoclaw/_batch_custom.sh
  echo.
  echo [GEOCLAW] All fixtures regenerated. Re-run "nimbus geoclaw test" to pin Nimbus against them.
  pause
  exit /b
)
echo [ERROR] Usage: nimbus geoclaw batch [named^|custom^|all]
pause
exit /b 1

:geoclaw_test
echo [GEOCLAW] Running comparator against committed fixtures ^(no GeoClaw install needed^)...
call pnpm test src/physics/validation/geoclawComparison
pause
exit /b

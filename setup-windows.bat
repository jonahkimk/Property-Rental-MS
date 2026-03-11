@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Rental Management System — Windows Setup (Batch Version)
::  Double-click this file OR right-click → Run as Administrator
:: ============================================================

title RentalMS Setup

echo.
echo  ====================================================
echo    Rental Management System -- Windows Setup
echo  ====================================================
echo.

:: ── Check Admin rights ───────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  ERROR: Please run this file as Administrator.
    echo  Right-click setup-windows.bat then click "Run as administrator"
    pause
    exit /b 1
)

:: ── Locate folders ───────────────────────────────────────────
set "ROOT=%~dp0"
:: Remove trailing backslash
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"
set "SCHEMA=%ROOT%\rmsdb.sql"

if not exist "%BACKEND%" (
    echo  ERROR: backend\ folder not found.
    echo  Make sure setup-windows.bat is in the rental-ms root folder.
    pause & exit /b 1
)
if not exist "%FRONTEND%" (
    echo  ERROR: frontend\ folder not found.
    pause & exit /b 1
)

echo  [OK] Project folders found.
echo.

:: ── Check / Install Winget ───────────────────────────────────
echo  [1/9] Checking Winget...
winget --version >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  ERROR: Winget not found.
    echo  Please install "App Installer" from the Microsoft Store:
    echo  https://apps.microsoft.com/detail/9nblggh4nns1
    pause & exit /b 1
)
echo  [OK] Winget found.
echo.

:: ── Install Node.js ──────────────────────────────────────────
echo  [2/9] Checking Node.js...
node --version >nul 2>&1
if %errorLevel% EQU 0 (
    for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js already installed: %%v
) else (
    echo  Installing Node.js 20 LTS...
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    :: Refresh PATH
    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=%%b;%PATH%"
    echo  [OK] Node.js installed.
)
echo.

:: ── Install PostgreSQL ───────────────────────────────────────
echo  [3/9] Checking PostgreSQL...
psql --version >nul 2>&1
if %errorLevel% EQU 0 (
    for /f "tokens=*" %%v in ('psql --version') do echo  [OK] PostgreSQL already installed: %%v
) else (
    echo  Installing PostgreSQL 16...
    winget install --id PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements --silent
    echo  Adding PostgreSQL to PATH...
    set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"
    setx PATH "%PATH%;%PG_BIN%" /M >nul 2>&1
    set "PATH=%PATH%;%PG_BIN%"
    echo  [OK] PostgreSQL installed.
)
echo.

:: ── Install Git ──────────────────────────────────────────────
echo  [4/9] Checking Git...
git --version >nul 2>&1
if %errorLevel% EQU 0 (
    for /f "tokens=*" %%v in ('git --version') do echo  [OK] Git already installed: %%v
) else (
    echo  Installing Git...
    winget install --id Git.Git --accept-source-agreements --accept-package-agreements --silent
    echo  [OK] Git installed.
)
echo.

:: ── PostgreSQL password ──────────────────────────────────────
echo  [5/9] PostgreSQL password setup
echo.
echo  Enter a password for the PostgreSQL 'postgres' user.
echo  You will need this to connect to the database.
echo.
set /p "PGPASS=  Enter password (min 6 chars): "
echo.

if "%PGPASS%"=="" (
    echo  ERROR: Password cannot be empty.
    pause & exit /b 1
)

:: Set password for session
set "PGPASSWORD=%PGPASS%"

:: Try to set the postgres superuser password
echo  Setting postgres superuser password...
psql -U postgres -h localhost -p 5432 -c "ALTER USER postgres WITH PASSWORD '%PGPASS%';" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [OK] PostgreSQL password configured.
) else (
    echo  [WARN] Could not set password automatically.
    echo         You may need to set it manually via pgAdmin.
)
echo.

:: ── Create database ──────────────────────────────────────────
echo  [6/9] Creating database 'rental_management'...
psql -U postgres -h localhost -p 5432 -c "SELECT 1 FROM pg_database WHERE datname='rental_management';" 2>nul | find "1 row" >nul
if %errorLevel% EQU 0 (
    echo  [OK] Database already exists.
) else (
    psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE rental_management;" >nul 2>&1
    echo  [OK] Database 'rental_management' created.
)
echo.

:: ── Run schema ───────────────────────────────────────────────
echo  [7/9] Running database schema (rmsdb.sql)...
if exist "%SCHEMA%" (
    psql -U postgres -h localhost -p 5432 -d rental_management -f "%SCHEMA%" >nul 2>&1
    echo  [OK] Schema applied.
) else (
    echo  [WARN] rmsdb.sql not found. Run it manually later:
    echo         psql -U postgres -d rental_management -f rmsdb.sql
)
echo.

:: ── Create backend .env ──────────────────────────────────────
echo  [8/9] Creating backend\.env...
set "ENV_FILE=%BACKEND%\.env"

:: Generate a simple random string for JWT (using timestamp + random)
set "JWT=%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%"

(
echo # ── DATABASE ─────────────────────────────────────────────────
echo DB_HOST=localhost
echo DB_PORT=5432
echo DB_NAME=rental_management
echo DB_USER=postgres
echo DB_PASSWORD=%PGPASS%
echo.
echo # ── JWT ──────────────────────────────────────────────────────
echo JWT_SECRET=%JWT%
echo JWT_EXPIRY=8h
echo.
echo # ── BCRYPT ───────────────────────────────────────────────────
echo BCRYPT_ROUNDS=12
echo.
echo # ── SERVER ───────────────────────────────────────────────────
echo PORT=5000
echo NODE_ENV=development
echo.
echo # ── CORS ─────────────────────────────────────────────────────
echo CLIENT_URL=http://localhost:5173
) > "%ENV_FILE%"

echo  [OK] .env created.
echo.

:: ── npm install ──────────────────────────────────────────────
echo  [9/9] Installing npm dependencies...
echo.
echo  -- Backend --
cd /d "%BACKEND%"
call npm install
if %errorLevel% NEQ 0 (
    echo  ERROR: npm install failed in backend\.
    pause & exit /b 1
)
echo  [OK] Backend dependencies installed.
echo.

echo  -- Frontend --
cd /d "%FRONTEND%"
call npm install
if %errorLevel% NEQ 0 (
    echo  ERROR: npm install failed in frontend\.
    pause & exit /b 1
)
echo  [OK] Frontend dependencies installed.
echo.

:: ── Clear PGPASSWORD ─────────────────────────────────────────
set "PGPASSWORD="

:: ── Done ─────────────────────────────────────────────────────
cd /d "%ROOT%"
echo.
echo  ====================================================
echo    Setup Complete!
echo  ====================================================
echo.
echo  To start the system, open TWO Command Prompt windows:
echo.
echo  Window 1 - Backend:
echo    cd "%BACKEND%"
echo    npm run dev
echo.
echo  Window 2 - Frontend:
echo    cd "%FRONTEND%"
echo    npm run dev
echo.
echo  Then open: http://localhost:5173
echo.
echo  Default login credentials:
echo    Manager  -^> username: manager  / password: manager123
echo    Landlord -^> username: admin    / password: admin123
echo    Tenant   -^> username: [unit number e.g. 1A] / password: tenant123
echo.
pause

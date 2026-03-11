# ============================================================
#  Rental Management System — Windows Setup Script
#  Run as Administrator in PowerShell:
#    Right-click PowerShell → "Run as Administrator"
#    then: .\setup-windows.ps1
# ============================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# ── Colours ──────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✘  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   Rental Management System — Windows Setup       ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── 0. Verify script is in the right place ───────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir  = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$SchemaFile  = Join-Path $ScriptDir "rmsdb.sql"

foreach ($dir in @($BackendDir, $FrontendDir)) {
    if (-not (Test-Path $dir)) {
        Write-Fail "Folder not found: $dir`nMake sure setup-windows.ps1 is in the rental-ms root folder."
    }
}
if (-not (Test-Path $SchemaFile)) {
    Write-Warn "rmsdb.sql not found at $SchemaFile — you will need to run the schema manually."
}

# ── 1. Check / install Winget ─────────────────────────────────
Write-Step "Checking Winget (Windows Package Manager)"
try {
    $wv = winget --version 2>&1
    Write-OK "Winget found: $wv"
} catch {
    Write-Warn "Winget not found. Attempting to install via Microsoft Store App Installer..."
    Start-Process "ms-windows-store://pdp/?productid=9NBLGGH4NNS1" -Wait
    Write-Warn "Please install App Installer from the Store, then re-run this script."
    exit 1
}

# ── 2. Install Node.js 20 LTS ────────────────────────────────
Write-Step "Checking Node.js"
$nodeInstalled = $false
try {
    $nv = node --version 2>&1
    if ($nv -match "v(\d+)") {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            Write-OK "Node.js already installed: $nv"
            $nodeInstalled = $true
        }
    }
} catch {}

if (-not $nodeInstalled) {
    Write-Host "  Installing Node.js 20 LTS via Winget..." -ForegroundColor White
    winget install --id OpenJS.NodeJS.LTS --version "20.*" --accept-source-agreements --accept-package-agreements --silent
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    $nv = node --version 2>&1
    Write-OK "Node.js installed: $nv"
}

# ── 3. Install PostgreSQL 16 ──────────────────────────────────
Write-Step "Checking PostgreSQL"
$pgInstalled = $false
$pgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\17\bin"
)

foreach ($p in $pgPaths) {
    if (Test-Path (Join-Path $p "psql.exe")) {
        $env:Path = "$p;" + $env:Path
        [System.Environment]::SetEnvironmentVariable("Path", "$p;" + [System.Environment]::GetEnvironmentVariable("Path","Machine"), "Machine")
        $pgInstalled = $true
        Write-OK "PostgreSQL found at: $p"
        break
    }
}

if (-not $pgInstalled) {
    Write-Host "  Installing PostgreSQL 16 via Winget..." -ForegroundColor White
    winget install --id PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements --silent

    # Wait for installation then locate bin
    Start-Sleep -Seconds 10
    foreach ($p in $pgPaths) {
        if (Test-Path (Join-Path $p "psql.exe")) {
            $env:Path = "$p;" + $env:Path
            [System.Environment]::SetEnvironmentVariable("Path", "$p;" + [System.Environment]::GetEnvironmentVariable("Path","Machine"), "Machine")
            $pgInstalled = $true
            Write-OK "PostgreSQL installed at: $p"
            break
        }
    }
    if (-not $pgInstalled) {
        Write-Fail "PostgreSQL install completed but psql.exe not found. Add PostgreSQL\bin to PATH manually and re-run."
    }
}

# ── 4. Install Git ────────────────────────────────────────────
Write-Step "Checking Git"
try {
    $gv = git --version 2>&1
    Write-OK "Git already installed: $gv"
} catch {
    Write-Host "  Installing Git via Winget..." -ForegroundColor White
    winget install --id Git.Git --accept-source-agreements --accept-package-agreements --silent
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    Write-OK "Git installed."
}

# ── 5. Configure PostgreSQL password ─────────────────────────
Write-Step "Configuring PostgreSQL"

Write-Host ""
Write-Host "  Enter a password for the PostgreSQL 'postgres' superuser." -ForegroundColor White
Write-Host "  (This is the password used to access your local database.)" -ForegroundColor Gray
Write-Host ""

$pgPass = ""
do {
    $pgSecure  = Read-Host "  PostgreSQL password" -AsSecureString
    $pgSecure2 = Read-Host "  Confirm password"    -AsSecureString
    $pgPass    = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                     [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgSecure))
    $pgPass2   = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
                     [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgSecure2))

    if ($pgPass -ne $pgPass2) {
        Write-Warn "Passwords do not match. Please try again."
        $pgPass = ""
    } elseif ($pgPass.Length -lt 6) {
        Write-Warn "Password must be at least 6 characters."
        $pgPass = ""
    }
} while ($pgPass -eq "")

# Set PGPASSWORD for this session so psql doesn't prompt
$env:PGPASSWORD = $pgPass

# Update postgres superuser password
Write-Host "  Setting postgres superuser password..." -ForegroundColor White
try {
    $alterCmd = "ALTER USER postgres WITH PASSWORD '$pgPass';"
    echo $alterCmd | psql -U postgres -h localhost -p 5432 2>&1 | Out-Null
    Write-OK "PostgreSQL password set."
} catch {
    Write-Warn "Could not set password automatically. You may need to set it manually via pgAdmin."
}

# ── 6. Create database ────────────────────────────────────────
Write-Step "Creating database 'rental_management'"

$dbExists = psql -U postgres -h localhost -p 5432 -tAc `
    "SELECT 1 FROM pg_database WHERE datname='rental_management';" 2>&1

if ($dbExists -match "1") {
    Write-OK "Database 'rental_management' already exists."
} else {
    psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE rental_management;" 2>&1 | Out-Null
    Write-OK "Database 'rental_management' created."
}

# ── 7. Run schema ─────────────────────────────────────────────
Write-Step "Running database schema"

if (Test-Path $SchemaFile) {
    psql -U postgres -h localhost -p 5432 -d rental_management -f $SchemaFile 2>&1 | Out-Null
    Write-OK "Schema applied successfully."
} else {
    Write-Warn "rmsdb.sql not found — skipping. Run it manually:"
    Write-Warn "  psql -U postgres -d rental_management -f rmsdb.sql"
}

# ── 8. Create backend .env ────────────────────────────────────
Write-Step "Creating backend\.env"

$EnvFile = Join-Path $BackendDir ".env"

# Generate a 64-char hex JWT secret
$jwtBytes  = New-Object byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($jwtBytes)
$jwtSecret = ($jwtBytes | ForEach-Object { $_.ToString("x2") }) -join ""

$envContent = @"
# ── DATABASE ─────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rental_management
DB_USER=postgres
DB_PASSWORD=$pgPass

# ── JWT ──────────────────────────────────────────────────────
JWT_SECRET=$jwtSecret
JWT_EXPIRY=8h

# ── BCRYPT ───────────────────────────────────────────────────
BCRYPT_ROUNDS=12

# ── SERVER ───────────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ── CORS ─────────────────────────────────────────────────────
CLIENT_URL=http://localhost:5173
"@

Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
Write-OK ".env created at $EnvFile"

# ── 9. npm install — backend ──────────────────────────────────
Write-Step "Installing backend dependencies (npm install)"
Push-Location $BackendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed in backend." }
Write-OK "Backend dependencies installed."
Pop-Location

# ── 10. npm install — frontend ────────────────────────────────
Write-Step "Installing frontend dependencies (npm install)"
Push-Location $FrontendDir
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed in frontend." }
Write-OK "Frontend dependencies installed."
Pop-Location

# ── 11. Windows Firewall rules ────────────────────────────────
Write-Step "Adding Windows Firewall rules for ports 5000 and 5173"
$rules = @(
    @{ Name = "RentalMS Backend (5000)";  Port = 5000 },
    @{ Name = "RentalMS Frontend (5173)"; Port = 5173 }
)
foreach ($rule in $rules) {
    $exists = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if (-not $exists) {
        New-NetFirewallRule -DisplayName $rule.Name `
            -Direction Inbound -Protocol TCP -LocalPort $rule.Port `
            -Action Allow -Profile Any | Out-Null
        Write-OK "Firewall rule added: $($rule.Name)"
    } else {
        Write-OK "Firewall rule already exists: $($rule.Name)"
    }
}

# ── 12. Clear PGPASSWORD from session ─────────────────────────
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            Setup Complete!                       ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the system, open TWO PowerShell windows:" -ForegroundColor White
Write-Host ""
Write-Host "  Window 1 — Backend API:" -ForegroundColor Cyan
Write-Host "    cd $BackendDir" -ForegroundColor Gray
Write-Host "    npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  Window 2 — Frontend:" -ForegroundColor Cyan
Write-Host "    cd $FrontendDir" -ForegroundColor Gray
Write-Host "    npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  Then open: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "  Default credentials:" -ForegroundColor White
Write-Host "    Manager  → manager  / manager123" -ForegroundColor Gray
Write-Host "    Landlord → admin    / admin123" -ForegroundColor Gray
Write-Host "    Tenant   → [unit number e.g. 1A] / tenant123" -ForegroundColor Gray
Write-Host ""

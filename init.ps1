# Check for administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "This script works best with Administrator privileges for some operations."
}

Write-Host "🚀 Initializing PulseWeave Development Environment..." -ForegroundColor Cyan

# 1. Check Prerequisites
Write-Host "`n📦 Checking Prerequisites..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install Node.js (LTS recommended)."
    exit 1
}
if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Installing pnpm..."
    npm install -g pnpm
}

# 2. Install Dependencies
Write-Host "`n📚 Installing Dependencies..." -ForegroundColor Yellow
pnpm install

# 3. Environment Setup
Write-Host "`n⚙️  Setting up Environment..." -ForegroundColor Yellow
if (!(Test-Path "packages/database/.env")) {
    if (Test-Path "packages/database/.env.example") {
        Copy-Item "packages/database/.env.example" "packages/database/.env"
        Write-Host "Created packages/database/.env from example." -ForegroundColor Green
    } else {
        Write-Warning "No .env.example found for database."
    }
}

# 4. Database Setup
Write-Host "`n🗄️  Setting up Database..." -ForegroundColor Yellow
# Generate Prisma Client
pnpm db:generate

# Push schema to DB (using sqlite for dev as per implied spec)
pnpm db:push

# 5. Build/Pre-check
Write-Host "`n🏗️  Building packages..." -ForegroundColor Yellow
pnpm typecheck

Write-Host "`n✅ Initialization Complete!" -ForegroundColor Green
Write-Host "`nTo start the development server, run:" -ForegroundColor Cyan
Write-Host "  pnpm dev" -ForegroundColor Magenta
Write-Host "`nTo view the feature list:" -ForegroundColor Cyan
Write-Host "  Get-Content .\feature_list.json" -ForegroundColor Magenta

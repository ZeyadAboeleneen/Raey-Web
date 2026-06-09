Write-Host "=== Building Next.js standalone ===" -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Copying static assets ===" -ForegroundColor Cyan
Copy-Item -Path ".next\static" -Destination ".next\standalone\.next\static" -Recurse -Force

Write-Host "=== Copying public folder ===" -ForegroundColor Cyan
# Remove destination first to avoid PowerShell nesting public\public\ on repeat runs
if (Test-Path ".next\standalone\public") {
    Remove-Item -Path ".next\standalone\public" -Recurse -Force
}
Copy-Item -Path "public" -Destination ".next\standalone\public" -Recurse -Force

Write-Host "=== Copying Prisma schema ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Path ".next\standalone\prisma" -Force | Out-Null
Copy-Item -Path "prisma\schema.prisma" -Destination ".next\standalone\prisma\schema.prisma" -Force

Write-Host "=== Copying .env.local ===" -ForegroundColor Cyan
Copy-Item -Path ".env.local" -Destination ".next\standalone\.env.local" -Force

# Ensure UPLOAD_DIR is set for production (SmarterASP path)
$envContent = Get-Content ".next\standalone\.env.local" -Raw
if ($envContent -notmatch "^UPLOAD_DIR=h:\\") {
    Add-Content -Path ".next\standalone\.env.local" -Value "`nUPLOAD_DIR=h:\root\home\ettisalsql-002\www\uploads"
    Write-Host "  → Added UPLOAD_DIR for SmarterASP production" -ForegroundColor Yellow
}

Write-Host "=== Copying web.config ===" -ForegroundColor Cyan
Copy-Item -Path "web.config" -Destination ".next\standalone\web.config" -Force

Write-Host "`n=== Standalone folder ready! ===" -ForegroundColor Green
Write-Host "Location: .next\standalone\" -ForegroundColor Yellow
Write-Host "Upload ALL contents of that folder to SmarterASP.NET" -ForegroundColor Yellow
Get-ChildItem -Name ".next\standalone"

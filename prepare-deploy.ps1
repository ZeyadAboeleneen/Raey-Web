Write-Host "=== Building Next.js standalone ===" -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Copying static assets ===" -ForegroundColor Cyan
Copy-Item -Path ".next\static" -Destination ".next\standalone\.next\static" -Recurse -Force

Write-Host "=== Copying public folder ===" -ForegroundColor Cyan
Copy-Item -Path "public" -Destination ".next\standalone\public" -Recurse -Force

Write-Host "=== Copying Prisma schema ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Path ".next\standalone\prisma" -Force | Out-Null
Copy-Item -Path "prisma\schema.prisma" -Destination ".next\standalone\prisma\schema.prisma" -Force

Write-Host "=== Copying .env.local ===" -ForegroundColor Cyan
Copy-Item -Path ".env.local" -Destination ".next\standalone\.env.local" -Force

Write-Host "=== Copying web.config ===" -ForegroundColor Cyan
Copy-Item -Path "web.config" -Destination ".next\standalone\web.config" -Force

Write-Host "`n=== Standalone folder ready! ===" -ForegroundColor Green
Write-Host "Location: .next\standalone\" -ForegroundColor Yellow
Write-Host "Upload ALL contents of that folder to SmarterASP.NET" -ForegroundColor Yellow
Get-ChildItem -Name ".next\standalone"

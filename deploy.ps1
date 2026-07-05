# CloudBase 一键部署脚本
# 用法: 在项目根目录运行 .\deploy.ps1

Write-Host "🚀 开始部署到 CloudBase..." -ForegroundColor Green

# 进入项目目录
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

# 1. 部署云函数
Write-Host "`n📦 部署云函数..." -ForegroundColor Cyan
tcb fn deploy api --force
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 云函数部署失败！" -ForegroundColor Red
    exit 1
}

# 2. 准备静态文件
Write-Host "`n📄 准备静态文件..." -ForegroundColor Cyan
if (Test-Path "deploy_tmp") {
    Remove-Item -Recurse -Force "deploy_tmp"
}
New-Item -ItemType Directory -Path "deploy_tmp" | Out-Null
Copy-Item "index.html" "deploy_tmp\"
Copy-Item -Recurse "css" "deploy_tmp\"
Copy-Item -Recurse "js" "deploy_tmp\"

# 3. 部署静态网站
Write-Host "`n🌐 部署静态网站..." -ForegroundColor Cyan
tcb hosting deploy .\deploy_tmp
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 静态网站部署失败！" -ForegroundColor Red
    Remove-Item -Recurse -Force "deploy_tmp"
    exit 1
}

# 4. 清理临时文件
Remove-Item -Recurse -Force "deploy_tmp"

Write-Host "`n✅ 部署完成！" -ForegroundColor Green
Write-Host "🌐 网站地址: https://reliability-tool-d8erocv8e9979b2-1327689319.tcloudbaseapp.com" -ForegroundColor Yellow

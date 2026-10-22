# 材料對應確認工具一鍵啟動：後端 :8090，前端 :5180
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "[1/2] 啟動後端（Go，http://127.0.0.1:8090）..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; go run ."

Write-Host "[2/2] 啟動前端（React，http://localhost:5180）..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; if (-not (Test-Path node_modules)) { npm install }; npm run dev"

Write-Host ""
Write-Host "兩個視窗都 ready 後，瀏覽器開 http://localhost:5180" -ForegroundColor Cyan

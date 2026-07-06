@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo   音域回响壁纸部署脚本
echo ========================================

:: 设置 Wallpaper Engine 项目目录
set WE_PROJECT_DIR=E:\STEAM\steamapps\common\wallpaper_engine\projects\myprojects\sonic-topography

:: 检查 dist-wallpaper 目录是否存在
if not exist "dist-wallpaper" (
    echo [错误] dist-wallpaper 目录不存在，请先运行 pnpm build
    pause
    exit /b 1
)

:: 创建目标目录（如果不存在）
if not exist "%WE_PROJECT_DIR%" (
    mkdir "%WE_PROJECT_DIR%"
)

:: 使用 PowerShell Copy-Item 复制所有文件
echo 正在复制文件到 Wallpaper Engine 项目目录...
powershell -Command "Copy-Item -Path 'dist-wallpaper\*' -Destination '%WE_PROJECT_DIR%' -Recurse -Force"

echo.
echo [完成] 壁纸已部署到:
echo %WE_PROJECT_DIR%
echo.
echo 请在 Wallpaper Engine 中刷新项目列表查看效果。
echo ========================================
pause
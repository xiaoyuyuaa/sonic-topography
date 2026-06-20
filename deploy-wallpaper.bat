@echo off
setlocal enabledelayedexpansion

set SOURCE=%~dp0dist-wallpaper
set TARGET=E:\STEAM\steamapps\common\wallpaper_engine\projects\myprojects\index

echo ========================================
echo  Sonic Topography - 壁纸部署脚本
echo ========================================
echo.
echo  源路径: %SOURCE%
echo  目标路径: %TARGET%
echo.

if not exist "%SOURCE%" (
    echo [错误] 源目录不存在！请先运行 npm run build:wallpaper
    pause
    exit /b 1
)

if not exist "%TARGET%" (
    echo [提示] 目标目录不存在，正在创建...
    mkdir "%TARGET%"
)

echo [步骤 1/2] 清除旧文件...
if exist "%TARGET%\*" (
    del /f /s /q "%TARGET%\*" >nul 2>&1
    for /d %%d in ("%TARGET%\*") do rmdir /s /q "%%d"
)

echo [步骤 2/2] 复制新文件...
xcopy "%SOURCE%\*" "%TARGET%\" /e /h /q

echo.
echo [完成] 壁纸已部署到:
echo   %TARGET%
echo.
pause

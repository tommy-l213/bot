@echo off
chcp 65001 >nul
title RION 自动交易机器人 - 安装脚本

echo 🤖 RION 自动交易机器人 - 环境设置
echo ==================================

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js
    echo 请先安装 Node.js ^(建议版本 16 或更高^)
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo ✅ Node.js 版本: %NODE_VERSION%
)

REM 检查 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到 npm
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo ✅ npm 版本: %NPM_VERSION%
)

echo.
echo 📦 开始安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 安装依赖失败
    pause
    exit /b 1
)

echo.
echo 🔨 编译 TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ 编译失败
    pause
    exit /b 1
)

echo.
echo 📱 创建可执行文件...
call npm run package
if %errorlevel% neq 0 (
    echo ❌ 创建可执行文件失败
    pause
    exit /b 1
)

echo.
echo ✅ 安装完成！
echo.
echo 🚀 使用方法:
echo 1. 直接运行: npm run dev
echo 2. 使用可执行文件: .\dist\executables\rion-trading-bot-win.exe
echo.
echo 📖 更多详情请查看 README.md
echo.
echo ⚠️  风险提示:
echo • 请确保钱包有足够的 APT 用于 Gas 费用
echo • 交易有风险，请谨慎操作  
echo • 建议先小额测试
echo.
pause
#!/bin/bash

# RION 自动交易机器人 - 安装脚本
# 支持 macOS 和 Linux

set -e

echo "🤖 RION 自动交易机器人 - 环境设置"
echo "=================================="

# 检查操作系统
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "📍 检测到操作系统: ${MACHINE}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js"
    echo "请先安装 Node.js (建议版本 16 或更高)"
    echo "下载地址: https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo "✅ Node.js 版本: ${NODE_VERSION}"
fi

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 未检测到 npm"
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo "✅ npm 版本: ${NPM_VERSION}"
fi

echo ""
echo "📦 开始安装依赖..."
npm install

echo ""
echo "🔨 编译 TypeScript..."
npm run build

echo ""
echo "📱 创建可执行文件..."
npm run package

echo ""
echo "✅ 安装完成！"
echo ""
echo "🚀 使用方法:"
echo "1. 直接运行: npm run dev"
echo "2. 使用可执行文件:"

if [ "${MACHINE}" = "Mac" ]; then
    echo "   ./dist/executables/rion-trading-bot-macos"
elif [ "${MACHINE}" = "Linux" ]; then
    echo "   ./dist/executables/rion-trading-bot-linux"
fi

echo ""
echo "📖 更多详情请查看 README.md"
echo ""
echo "⚠️  风险提示:"
echo "• 请确保钱包有足够的 APT 用于 Gas 费用"
echo "• 交易有风险，请谨慎操作"
echo "• 建议先小额测试"
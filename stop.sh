#!/bin/bash
# 停止金蟾开发服务

echo "正在停止服务..."

# 用 pkill 直接按进程名/参数杀，避免 lsof 卡死
pkill -f "node.*JinChan.*vite" 2>/dev/null && echo "✓ Vite 已停止" || echo "- 无 Vite 进程"
pkill -f "cargo-tauri.*JinChan" 2>/dev/null && echo "✓ Tauri 已停止" || echo "- 无 Tauri 进程"
pkill -f "npm.*JinChan" 2>/dev/null && echo "✓ npm 已停止" || echo "- 无 npm 进程"

echo "完成"

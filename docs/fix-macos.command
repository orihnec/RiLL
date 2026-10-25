#!/bin/bash
# Rill 首次打开修复脚本（macOS）
#
# 为什么需要它：安装包没有 Apple 开发者签名，从浏览器/微信下载的文件会被系统
# 打上 com.apple.quarantine 标记，双击时提示「Rill 已损坏，无法打开」。
# 这个脚本只做两件事：去掉隔离标记、打开 App。不改动任何系统安全设置。

APP="/Applications/Rill.app"

echo "== Rill 首次打开修复 =="

if [ ! -d "$APP" ]; then
  echo "没有在 /Applications 找到 Rill.app。"
  echo "请先把 Rill 从 dmg 窗口拖进「应用程序」文件夹，再运行本脚本。"
  read -r -p "按回车退出…" _
  exit 1
fi

echo "1/2 去掉隔离标记…"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null

echo "2/2 打开 Rill…"
open "$APP"

echo "完成。如果仍然打不开，在「终端」里执行下面这行并把输出发给我："
echo "  codesign -dv --verbose=4 \"$APP\" 2>&1 | head -20"
sleep 2

#!/bin/sh
# 抽帧拼图。用法: ./stills.sh 0,1.2,3 [34|169]  → out/stills/sheet.jpg（默认 3:4 竖版）
FMT="${2:-34}"; [ "$FMT" = 169 ] && TILE="scale=640:-1,tile=4x4" || TILE="scale=405:-1,tile=6x3"
cd "$(dirname "$0")" && rm -rf out/stills && node render.mjs --fmt "$FMT" --stills "$1" 2>&1 | grep -v 404
cd out/stills && ffmpeg -v error -y -pattern_type glob -i 't*.jpg' -vf "$TILE" -frames:v 1 -update 1 sheet.jpg

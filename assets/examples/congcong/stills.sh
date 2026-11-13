#!/bin/sh
# 用法: ./stills.sh 0,1.2,3  → out/stills/sheet.jpg
cd "$(dirname "$0")" && rm -rf out/stills && node render.mjs --stills "$1" 2>&1 | grep -v 404
cd out/stills && ffmpeg -v error -y -pattern_type glob -i 't*.jpg' -vf "scale=640:-1,tile=4x4" -frames:v 1 -update 1 sheet.jpg

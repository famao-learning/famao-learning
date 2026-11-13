#!/bin/sh
# 把旁白和音乐混进渲染好的画面：./mix.sh out/master.mp4 out/成片.mp4
# 可用环境变量换曲：BGM=文件 BGM_START=起点秒
cd "$(dirname "$0")"
VO="${VO:-audio/vo.mp3}"
VO_DELAY_MS="${VO_DELAY_MS:-800}"
BGM="${BGM:?用 BGM=文件 指定配乐}"
BGM_START="${BGM_START:-0}"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
FO=$(echo "$D - 2.4" | bc)
ffmpeg -v error -y -i "$1" -i "$VO" -ss $BGM_START -t $D -i "$BGM" -filter_complex "
[1:a]aformat=channel_layouts=stereo,highpass=f=95,equalizer=f=260:t=q:w=1.2:g=-2,equalizer=f=9000:t=h:w=4000:g=3,
     acompressor=threshold=0.09:ratio=3:attack=8:release=160:makeup=2,asplit=2[dry][tofx];
[tofx]aecho=0.9:0.9:55|97|143|211:0.30|0.22|0.15|0.09,lowpass=f=5200,highpass=f=220,volume=0.55[wet];
[dry][wet]amix=inputs=2:normalize=0,adelay=${VO_DELAY_MS}:all=1,apad=whole_dur=$D,loudnorm=I=-17:TP=-2:LRA=7,asplit=2[vo][sc];
[2:a]loudnorm=I=-19:TP=-2:LRA=9,afade=t=in:d=0.8,afade=t=out:st=$FO:d=2.4[m];
[m][sc]sidechaincompress=threshold=0.05:ratio=2.2:attack=80:release=700[md];
[vo][md]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9[a]" \
 -map 0:v -map "[a]" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -t $D -movflags +faststart "$2"

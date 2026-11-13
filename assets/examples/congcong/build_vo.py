# 把旁白的逐字时间转成 src/vo.js。用法：python3 build_vo.py
import json, re
VO_OFFSET = 0.8
QUOTES = {'A': '燕子去了，有再来的时候；杨柳枯了，有再青的时候；桃花谢了，有再开的时候。但是，聪明的，你告诉我，我们的日子为什么一去不复返呢？',
          'B': '我不知道他们给了我多少日子，但我的手确乎是渐渐空虚了。',
          'C': '我赤裸裸来到这世界，转眼间也将赤裸裸的回去罢？但不能平的，为什么偏要白白走这一遭啊？',
          'D': '你聪明的，告诉我，我们的日子为什么一去不复返呢？'}
MARKS = [('title', '匆匆'), ('yanzi', '燕子去了'), ('yangliu', '杨柳枯了'), ('taohua', '桃花谢了'), ('danshi', '但是聪明的'),
         ('B', '我不知道'), ('C', '我赤裸裸'), ('buneng', '但不能平的'), ('D', '你聪明的')]
SUBS = ['我赤裸裸来到这世界', '转眼间也将赤裸裸的回去罢', '但不能平的', '为什么偏要白白走这一遭啊', '你聪明的告诉我', '我们的日子为什么一去不复返呢']
han = lambda c: re.match(r'[一-鿿]', c)
d = json.load(open('audio/vo_words.json'))
chars = [(w['w'], w['t'] + VO_OFFSET, w['t'] + w['d'] + VO_OFFSET) for w in d['words'] if han(w['w'])]
s = ''.join(c[0] for c in chars)
groups = {}; pos = 0
for gid, quote in QUOTES.items():
    k = s.index(''.join(c for c in quote if han(c)), pos); hl = []
    for c in quote:
        if han(c): hl.append(round(chars[k][1], 3)); k += 1
        else: hl.append(round(chars[k-1][2], 3))
    hl.append(round(chars[k-1][2], 3)); groups[gid] = hl; pos = k
marks = {}; pos = 0
for name, ph in MARKS:
    i = s.index(ph, pos); marks[name] = round(chars[i][1], 2); pos = i
subs = []; pos = s.index('我赤裸裸')
for cue in SUBS:
    i = s.index(cue, pos); j = i + len(cue) - 1; pos = j + 1
    subs.append([round(chars[i][1] - 0.05, 2), round(chars[j][2] + 0.3, 2), cue])
for a, b in zip(subs, subs[1:]): a[1] = min(a[1], round(b[0] - 0.04, 2))
out = {'offset': VO_OFFSET, 'end': round(chars[-1][2], 2), 'groups': groups, 'marks': marks, 'subs': subs}
open('src/vo.js', 'w').write('// 由 build_vo.py 生成，不要手改\nexport const VO = ' + json.dumps(out, ensure_ascii=False) + ';\n')
print(out['end'], marks, subs)

# 把旁白的逐字时间转成 src/vo.js。用法：python3 build_vo.py
import json, re
VO_OFFSET = 1.2
QUOTES = {'A': '枯藤老树昏鸦②，小桥流水人家，古道西风瘦马。夕阳西下，断肠③人在天涯④。'}
MARKS = [('title', '天净沙'), ('kuteng', '枯藤'), ('laoshu', '老树'), ('hunya', '昏鸦'), ('xiaoqiao', '小桥'), ('liushui', '流水'),
         ('renjia', '人家'), ('gudao', '古道'), ('xifeng', '西风'), ('shouma', '瘦马'), ('xiyang', '夕阳'), ('xixia', '西下'),
         ('duanchang', '断肠人'), ('tianya', '在天涯')]
# 字幕：每句 (原文, 英文)。逐字时间一并写出，字跟着旁白一个个出现
SUBS = [('枯藤老树昏鸦', 'Withered vines, an old tree, crows at dusk'), ('小桥流水人家', 'A small bridge, a running stream, a few homes'),
        ('古道西风瘦马', 'An ancient road, the west wind, a lean horse'), ('夕阳西下', 'The evening sun sinks in the west'),
        ('断肠人在天涯', 'A heartbroken traveler, far at the edge of the world')]
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
subs = []; pos = 0
for key_, en in SUBS:
    i = s.index(key_, pos); j = i + len(key_) - 1; pos = j + 1
    subs.append([round(chars[i][1] - 0.15, 2), round(chars[j][2] + 0.9, 2), key_, en, [round(chars[n][1], 2) for n in range(i, j + 1)]])
for a, b in zip(subs, subs[1:]): a[1] = min(a[1], round(b[0] - 0.12, 2))
subs[-1][1] = round(subs[-1][1] + 1.4, 2)   # 最后一句和红印多停一会儿
out = {'offset': VO_OFFSET, 'end': round(chars[-1][2], 2), 'groups': groups, 'marks': marks, 'subs': subs}
open('src/vo.js', 'w').write('// 由 build_vo.py 生成，不要手改\nexport const VO = ' + json.dumps(out, ensure_ascii=False) + ';\n')
print(out['end'], marks, subs)

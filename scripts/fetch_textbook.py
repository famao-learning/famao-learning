#!/usr/bin/env python3
"""从国家中小学智慧教育平台的公开目录查找电子课本，并下载公开预览页面图（约 1303x1842）。

  python3 fetch_textbook.py find 语文 六年级 下册          # 列出标题同时含这些词的课本
  python3 fetch_textbook.py pages <课本id> 1,44-50 <输出目录>   # 下载第 N 张预览图为 <输出目录>/N.jpg

N 是预览图序号，不是课本页码（通常 序号 ≈ 页码 + 5，下载相邻几张后看图确认）。
只用公开预览图；需要登录的 PDF 不碰。页面上的版权水印不要去掉。
"""
import json, os, sys, urllib.request
UA = {'User-Agent': 'Mozilla/5.0'}
BASE = 'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material'
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))

def find(words):
    v = get(f'{BASE}/version/data_version.json'); urls = v['urls'].split(',') if isinstance(v['urls'], str) else v['urls']
    for u in urls:
        for b in get(u):
            t = b.get('title', '')
            if all(w in t for w in words):
                print(b['id'], t, '|', ' '.join(x.get('tag_name', '') for x in b.get('tag_list', [])[:8]))

def pages(book, spec, out):
    d = get(f'{BASE}/details/{book}.json')
    folder = next(s for i in d['ti_items'] if i.get('ti_file_flag') == 'image' for s in i['ti_storages'])
    nums = []
    for part in spec.split(','):
        a, _, b = part.partition('-'); nums += range(int(a), int(b or a) + 1)
    os.makedirs(out, exist_ok=True)
    for n in nums:
        data = urllib.request.urlopen(urllib.request.Request(f'{folder}/{n}.jpg', headers=UA), timeout=60).read()
        open(os.path.join(out, f'{n}.jpg'), 'wb').write(data); print(n, len(data))

if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'find': find(sys.argv[2:])
    elif len(sys.argv) == 5 and sys.argv[1] == 'pages': pages(*sys.argv[2:])
    else: sys.exit(__doc__)

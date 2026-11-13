# 把白底生成图抠成透明贴图：按“与边缘连通的白色”抠底（保住物体内部的浅色），去白边溢色
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as ndi

def cut(path, T=0.93, hole=36):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255
    mn = im.min(axis=2); sat = im.max(axis=2) - mn
    white = (mn > T) & (sat < 0.05)
    lab, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # 被围住的大块纯白（藤和树干之间的空隙等）也算背景
    pure = (mn > 0.972) & (sat < 0.03) & ~bg
    l2, k = ndi.label(pure)
    if k:
        sizes = ndi.sum(pure, l2, range(1, k + 1))
        bg |= np.isin(l2, [i + 1 for i, s in enumerate(sizes) if s > hole])
    a = ndi.gaussian_filter((~bg).astype(np.float32), 0.9)
    a = np.clip((a - 0.4) / 0.4, 0, 1)
    # 边缘半透明处按白底反推颜色
    soft = np.clip(np.maximum((0.985 - mn) / 0.2, sat / 0.12), 0, 1)
    edge = ndi.binary_dilation(bg, iterations=3)
    a = np.where(edge, a * np.maximum(soft, 0.0), a)
    a3 = a[..., None]
    rgb = np.where(a3 > 0.04, np.clip((im - (1 - a3)) / np.maximum(a3, 0.04), 0, 1), im)
    rgb = np.where(edge[..., None], rgb, im)
    return rgb, a

def save(rgb, a, out, pad=10, bottom_pad=0):
    ys, xs = np.where(a > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    y0 = max(0, y0 - pad); x0 = max(0, x0 - pad); x1 = min(a.shape[1], x1 + pad); y1 = min(a.shape[0], y1 + bottom_pad)
    o = np.dstack([rgb, a])[y0:y1, x0:x1]
    Image.fromarray((o * 255).astype(np.uint8), 'RGBA').save(out); print(out, o.shape[1], o.shape[0])

G = 'assets/gen/'
which = sys.argv[1:] or ['tree', 'bridge', 'house', 'man3d', 'horse3d', 'man', 'horse', 'vine', 'crow', 'perch']
for n in which:
    src = f'{G}{n}/{n}.png'
    if not os.path.exists(src): print('skip', n); continue
    if n == 'crow':
        im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
        H, W, _ = im.shape; C = 720; AX, AY = 70, 360
        atlas = np.zeros((C, C * 4, 4), np.float32)
        for k, (r, c) in enumerate([(0, 0), (0, 1), (1, 0), (1, 1)]):
            tmp = f'tmp/_crow{k}.png'
            Image.fromarray((im[r * H // 2:(r + 1) * H // 2, c * W // 2:(c + 1) * W // 2] * 255).astype(np.uint8)).save(tmp)
            rgb, a = cut(tmp, hole=10**9)
            cols = np.where((a > 0.5).sum(axis=0) > 0)[0]; bx = cols[0]; by = int(np.mean(np.where(a[:, bx:bx + 6] > 0.5)[0]))
            h, w = a.shape; ox, oy = AX - bx, AY - by
            y0, y1 = max(0, oy), min(C, oy + h); x0, x1 = max(0, ox), min(C, ox + w)
            atlas[y0:y1, k * C + x0:k * C + x1, :3] = rgb[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
            atlas[y0:y1, k * C + x0:k * C + x1, 3] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
            print('crow', k, 'beak', bx, by)
        Image.fromarray((atlas * 255).astype(np.uint8), 'RGBA').save('assets/crow.png')
    elif n == 'vine':
        rgb, a = cut(src)
        Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA').save('assets/vine.png')
        col = (a > 0.3).sum(axis=0) > 0; segs = []; s = None
        for x, v in enumerate(list(col) + [False]):
            if v and s is None: s = x
            if not v and s is not None:
                if x - s > 20: segs.append((s, x))
                s = None
        ys = np.where((a > 0.3).sum(axis=1) > 0)[0]
        print('vine', a.shape, segs, 'rows', ys.min(), ys.max())
    else:
        rgb, a = cut(src)
        save(rgb, a, f'assets/{n}.png')

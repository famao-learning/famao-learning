# 把生成的燕子四帧图、垂柳图处理成透明贴图
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

# ---- 燕子：按与边缘连通的白色抠底（保住白肚子），四帧按喙尖对齐排成一行
im = np.asarray(Image.open('assets/gen/swallow_sheet.png').convert('RGB')).astype(np.float32) / 255
H, W, _ = im.shape; CW_, CH_ = 760, 760; AX, AY = 150, 400
EYES = [(140, 370), (138, 372), (140, 268), (138, 268)]
atlas = np.zeros((CH_, CW_ * 4, 4), np.float32)
for n, (r, c) in enumerate([(0, 0), (0, 1), (1, 0), (1, 1)]):
    cell = im[r * H // 2:(r + 1) * H // 2, c * W // 2:(c + 1) * W // 2]
    white = cell.min(axis=2) > 0.9
    lab, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    a = ndi.gaussian_filter((~bg).astype(np.float32), 0.8)
    a = np.clip((a - 0.35) / 0.4, 0, 1)
    ys, xs = np.where(a > 0.5); bx, by = EYES[n]
    a3 = a[..., None]; rgb = np.where(a3 > 0.05, np.clip((cell - (1 - a3)) / np.maximum(a3, 0.05), 0, 1), cell)
    ox, oy = n * CW_ + AX - bx, AY - by
    h, w = cell.shape[:2]
    y0, y1 = max(0, oy), min(CH_, oy + h); x0, x1 = max(n * CW_, ox), min((n + 1) * CW_, ox + w)
    atlas[y0:y1, x0:x1, :3] = rgb[y0 - oy:y1 - oy, x0 - ox:x1 - ox]; atlas[y0:y1, x0:x1, 3] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    print('swallow', n, 'beak', bx, by, 'bbox', xs.min(), xs.max(), ys.min(), ys.max())
Image.fromarray((atlas * 255).astype(np.uint8), 'RGBA').save('assets/swallow.png')

# ---- 垂柳：按“非白”抠底，自动按空隙切成几条
im = np.asarray(Image.open('assets/gen/willow_sheet.png').convert('RGB')).astype(np.float32) / 255
mn = im.min(axis=2); sat = im.max(axis=2) - mn
a = np.clip(np.maximum((0.985 - mn) / 0.16, sat / 0.14), 0, 1)
a3 = a[..., None]; rgb = np.where(a3 > 0.04, np.clip((im - (1 - a3)) / np.maximum(a3, 0.04), 0, 1), im)
rgb = np.clip(rgb * np.array([0.92, 1.0, 0.9]), 0, 1)
a = np.clip(a * 1.5, 0, 1)
Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA').save('assets/willow.png')
col = (a > 0.3).sum(axis=0) > 0; segs = []; s = None
for x, v in enumerate(list(col) + [False]):
    if v and s is None: s = x
    if not v and s is not None:
        if x - s > 30: segs.append((s, x))
        s = None
print('willow', im.shape, segs)

# 把书页上印着的两只燕子“擦掉”：找出燕子像素，用周围的底色平滑补上，做成两块羽化补丁（不动水印）
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
page = np.asarray(Image.open('assets/book/50.jpg').convert('RGB')).astype(np.float32)
out = page.copy()
BOX = [(465, 120, 740, 335), (725, 65, 930, 245)]
for n, (x0, y0, x1, y1) in enumerate(BOX, 1):
    reg = page[y0:y1, x0:x1]; r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    green = (g > r + 6) & (g > b + 6)
    bird = ((reg.min(axis=2) < 185) | ((r > g + 14) & (r > b + 14))) & ~green
    bird = ndi.binary_opening(bird, iterations=1)
    lab, k = ndi.label(ndi.binary_dilation(bird, iterations=5))
    sizes = ndi.sum(bird, lab, range(1, k + 1)); keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 250])
    mask = ndi.binary_fill_holes(ndi.binary_dilation(keep, iterations=5))
    w = (~mask).astype(np.float32); fill = reg.copy()
    for s in (6, 14, 30, 60):                                   # 归一化卷积：由近到远用周围颜色填
        num = np.dstack([ndi.gaussian_filter(reg[..., c] * w, s) for c in range(3)]); den = ndi.gaussian_filter(w, s)[..., None]
        ok = (den[..., 0] > 0.05) & mask & ~np.isfinite(fill).all(axis=2) if False else (den[..., 0] > 0.05)
        cand = num / np.maximum(den, 1e-4)
        todo = mask & ok & ~np.any(fill != reg, axis=2)
        fill[todo] = cand[todo]
    soft = ndi.gaussian_filter(mask.astype(np.float32), 3)[..., None]
    blur = np.dstack([ndi.gaussian_filter(fill[..., c], 4) for c in range(3)])
    res = reg * (1 - soft) + blur * soft
    a = np.clip(ndi.gaussian_filter(ndi.binary_dilation(mask, iterations=6).astype(np.float32), 3) * 1.4, 0, 1)
    Image.fromarray(np.dstack([np.clip(res, 0, 255), a * 255]).astype(np.uint8), 'RGBA').save(f'assets/patch{n}.png')
    out[y0:y1, x0:x1] = reg * (1 - a[..., None]) + res * a[..., None]
    print(n, 'mask px', int(mask.sum()))
Image.fromarray(out[0:420, 300:1303].astype(np.uint8)).save('assets/ref/patched_preview.jpg')

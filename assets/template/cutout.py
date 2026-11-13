# 把白底生成图抠成透明 PNG（含藤椅镂空），并去掉白边
import sys, numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255
mn = im.min(axis=2); sat = im.max(axis=2) - mn
# 越白越透明；有颜色（饱和度高）的浅色像素保留
a = np.clip((0.97 - mn) / 0.10, 0, 1)
a = np.maximum(a, np.clip((sat - 0.06) / 0.08, 0, 1))
a3 = a[..., None]
rgb = np.where(a3 > 0.02, (im - (1 - a3)) / np.maximum(a3, 0.02), im)   # 去白底溢色
out = np.dstack([np.clip(rgb, 0, 1), a])
ys, xs = np.where(a > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = 12
out = out[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
Image.fromarray((out * 255).astype(np.uint8), 'RGBA').save(sys.argv[2])
print('cut', out.shape)

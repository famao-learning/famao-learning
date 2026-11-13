// 所有可替换的内容都在这里。
export const FPS = 30;
export const DURATION = 26.4;
export const TITLE = '天净沙·秋思　马致远';
export const TITLE_EN = 'Autumn Thoughts · to the tune of “Tian Jing Sha”';
export const SUB_EN = false;                  // 标题和字幕下面要不要配英文小字（英文写在 TITLE_EN 和 build_vo.py 的 SUBS 里）
export const SEAL = '秋思';                   // 字幕后面的红印
// 字幕每个字的大小（倍数），按 vo.js 里 subs 的顺序；不写就用 1
export const SUB_SIZES = [[1.12, .92, 1.0, 1.16, .9, 1.1], [.9, 1.12, 1.0, .92, 1.16, 1.02], [1.1, .94, .9, 1.14, 1.0, 1.2], [1.18, 1.0, .9, 1.12], [1.16, 1.06, .9, .84, 1.08, 1.24]];
export const PAGE = [1847, 2610];            // 页面图原始像素

// 页面图：assets/book/N.jpg（统编版语文七年级上册，N 为电子课本的图片序号）；坐标用页面图像素
export const BOOK = {
  cover: 1, left: 23, right: 24,             // 课本第 16、17 页
  leafFronts: [1, 18, 20, 18, 20, 22],
  leafBacks: [0, 19, 21, 19, 21, 23],
  lineHeight: 58,
};

// 荧光笔：quote 是课本原文（含标点和注释角标），lines 每行 [起点x, 终点x, 行中心y, 这一行的原文]
export const HL = [
  { id: 'A', side: 'L', quote: '枯藤老树昏鸦②，小桥流水人家，古道西风瘦马。夕阳西下，断肠③人在天涯④。',
    lines: [[245, 949, 555, '枯藤老树昏鸦②，小桥流水人家，古道'], [162, 926, 622, '西风瘦马。夕阳西下，断肠③人在天涯④。']] },
];

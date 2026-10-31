import type { PaperPage } from "../types";
export type Point = { x: number; y: number };
export type QrLocation = {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomRightCorner: Point;
  bottomLeftCorner: Point;
};
export interface ScanMark {
  questionId: string;
  answer: string | null;
  status: "marked" | "blank" | "uncertain" | "multiple" | "written";
}
export const MARKERS: Point[] = [
  { x: 40, y: 40 },
  { x: 960, y: 40 },
  { x: 960, y: 1374 },
  { x: 40, y: 1374 },
];
export const pageMarkers = (page: PaperPage): Point[] =>
  page.height
    ? [
        { x: 40, y: 40 },
        { x: 960, y: 40 },
        { x: 960, y: page.height - 40 },
        { x: 40, y: page.height - 40 },
      ]
    : MARKERS;
export const QR_POINTS: Point[] = [
  { x: 780, y: 70 },
  { x: 920, y: 70 },
  { x: 920, y: 210 },
  { x: 780, y: 210 },
];
// Eight-variable projective transform, solved with partial-pivot Gaussian elimination.
export function homography(from: Point[], to: Point[]) {
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i],
      u = to[i].x,
      v = to[i].y;
    m.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++)
      if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    const d = m[c][c];
    if (Math.abs(d) < 1e-9)
      throw Error("Retake the photo with all four corner squares visible.");
    for (let k = c; k < 9; k++) m[c][k] /= d;
    for (let r = 0; r < 8; r++)
      if (r !== c) {
        const f = m[r][c];
        for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k];
      }
  }
  const h = m.map((row) => row[8]);
  return (p: Point): Point => {
    const d = h[6] * p.x + h[7] * p.y + 1;
    return {
      x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
      y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
    };
  };
}
export function alignPaperPage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  location: QrLocation,
  page: PaperPage,
) {
  const qr = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];
  const initial = homography(QR_POINTS, qr);
  const luminance = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 255;
    const i = (y * width + x) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  const scale = Math.hypot(qr[1].x - qr[0].x, qr[1].y - qr[0].y) / 140;
  if (scale < 0.45)
    throw Error("Move closer. The answer sheet is too small to read reliably.");
  const markers = pageMarkers(page);
  const centers = markers.map((marker) => {
    const predicted = initial(marker),
      // QR corner rounding is amplified far down a long page. Expand the
      // bounded search with distance; keep the four-marker/QR validation below.
      radius = Math.max(22, Math.round(Math.min(
        260 * scale,
        (85 + 0.13 * Math.hypot(marker.x - 850, marker.y - 140)) * scale,
      )));
    const x0 = Math.max(0, Math.floor(predicted.x - radius)),
      y0 = Math.max(0, Math.floor(predicted.y - radius));
    const x1 = Math.min(width - 1, Math.ceil(predicted.x + radius)),
      y1 = Math.min(height - 1, Math.ceil(predicted.y + radius));
    if (x1 <= x0 || y1 <= y0)
      throw Error(
        "Keep the whole page and its four corner squares inside the photo.",
      );
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1,
      visited = new Uint8Array(w * h);
    let best: Point | null = null,
      bestDistance = Infinity;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const start = (y - y0) * w + x - x0;
        if (visited[start] || luminance(x, y) > 130) continue;
        const queue = [start];
        visited[start] = 1;
        let count = 0,
          sumX = 0,
          sumY = 0,
          minX = x,
          maxX = x,
          minY = y,
          maxY = y;
        for (let n = 0; n < queue.length; n++) {
          const id = queue[n],
            xx = (id % w) + x0,
            yy = Math.floor(id / w) + y0;
          count++;
          sumX += xx;
          sumY += yy;
          minX = Math.min(minX, xx);
          maxX = Math.max(maxX, xx);
          minY = Math.min(minY, yy);
          maxY = Math.max(maxY, yy);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = xx + dx,
              ny = yy + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            const next = (ny - y0) * w + nx - x0;
            if (!visited[next] && luminance(nx, ny) < 130) {
              visited[next] = 1;
              queue.push(next);
            }
          }
        }
        const bw = maxX - minX + 1,
          bh = maxY - minY + 1;
        if (
          count < Math.max(20, 180 * scale * scale) ||
          count / (bw * bh) < 0.7 ||
          bw / bh < 0.45 ||
          bw / bh > 2.2 ||
          bw > 50 * scale ||
          bh > 50 * scale
        )
          continue;
        const center = { x: sumX / count, y: sumY / count },
          // Filled answer bubbles are smaller than the printed 20×20 marker.
          // Prefer the expected marker area as well as proximity to the QR estimate.
          distance = Math.hypot(center.x - predicted.x, center.y - predicted.y)
            + 140 * scale * Math.abs(Math.log(count / (400 * scale * scale)));
        if (distance < bestDistance) {
          best = center;
          bestDistance = distance;
        }
      }
    if (!best)
      throw Error(
        "Could not align all four corner squares. Retake a sharper, evenly lit photo.",
      );
    return best;
  });
  const project = homography(markers, centers);
  if (
    QR_POINTS.some((p, i) => {
      const a = project(p);
      return Math.hypot(a.x - qr[i].x, a.y - qr[i].y) > 22 * scale;
    })
  )
    throw Error(
      "Page alignment is unclear. Flatten the sheet and retake the photo.",
    );
  return project;
}
export function readMarks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  location: QrLocation,
  page: PaperPage,
): ScanMark[] {
  const project = alignPaperPage(data, width, height, location, page);
  const luminance = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 255;
    const i = (y * width + x) * 4;
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  return page.rows.map((row) => {
    if (!row.options.length)
      return {
        questionId: row.questionId,
        answer: null,
        status: "written" as const,
      };
    const fills = row.options
      .map((option) => {
        const bgPoints = [
          [-22, -18],
          [22, -18],
          [-22, 18],
          [22, 18],
        ].map(([dx, dy]) => {
          const p = project({ x: option.x + dx, y: row.y + dy });
          return luminance(p.x, p.y);
        });
        const bg = bgPoints.reduce((a, b) => a + b, 0) / 4;
        let dark = 0,
          total = 0;
        for (let dy = -7; dy <= 7; dy += 2)
          for (let dx = -7; dx <= 7; dx += 2)
            if (dx * dx + dy * dy < 49) {
              const p = project({ x: option.x + dx, y: row.y + dy });
              if (luminance(p.x, p.y) < Math.min(205, bg - 40)) dark++;
              total++;
            }
        return { id: option.id, fill: dark / total };
      })
      .sort((a, b) => b.fill - a.fill);
    const marked = fills.filter((f) => f.fill >= 0.25);
    if (marked.length > 1)
      return {
        questionId: row.questionId,
        answer: null,
        status: "multiple" as const,
      };
    if (fills[0].fill >= 0.55 && (!fills[1] || fills[1].fill < 0.12))
      return {
        questionId: row.questionId,
        answer: fills[0].id,
        status: "marked" as const,
      };
    if (fills[0].fill < 0.12)
      return {
        questionId: row.questionId,
        answer: null,
        status: "blank" as const,
      };
    return {
      questionId: row.questionId,
      answer: null,
      status: "uncertain" as const,
    };
  });
}

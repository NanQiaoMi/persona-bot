// 用法：node scripts/gen-mascot-shapes.mjs > shapes.json，再把 path/eye 填回 src/components/workspace/mascot-palette.ts
// 统一生成 13 个吉祥物轮廓：同一中心、相近的视觉面积、同样柔和的圆角，输出 SVG path + 眼睛中心
const TAU = Math.PI * 2;
const N = 96;

// ---------- 基础几何 ----------
function polar(fn, n = N) { const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; const r = fn(t); pts.push([Math.cos(t) * r, Math.sin(t) * r]); } return pts; }
function param(fn, n = N) { const pts = []; for (let i = 0; i < n; i++) pts.push(fn((i / n) * TAU)); return pts; }
// 圆角多边形：Minkowski 和（小多边形 + 圆），沿边界均匀取点
function roundedPolygon(verts, r, n = N) {
  const k = verts.length;
  // 求顶点外法线方向，构造：每条边平移 r，每个角一段圆弧
  const path = [];
  for (let i = 0; i < k; i++) {
    const p0 = verts[(i - 1 + k) % k], p1 = verts[i], p2 = verts[(i + 1) % k];
    const n1 = norm(sub(p1, p0)), n2 = norm(sub(p2, p1));
    const a1 = Math.atan2(n1[1], n1[0]) - Math.PI / 2, a2 = Math.atan2(n2[1], n2[0]) - Math.PI / 2;
    let da = a2 - a1; while (da < 0) da += TAU; while (da > TAU) da -= TAU;
    path.push({ c: p1, a1, da });
  }
  // 总长度
  const items = [];
  for (let i = 0; i < k; i++) {
    const { c, a1, da } = path[i];
    items.push({ type: 'arc', c, a1, da, len: r * da });
    const nx = path[(i + 1) % k];
    const s = [c[0] + Math.cos(a1 + da) * r, c[1] + Math.sin(a1 + da) * r];
    const e = [nx.c[0] + Math.cos(nx.a1) * r, nx.c[1] + Math.sin(nx.a1) * r];
    items.push({ type: 'line', s, e, len: Math.hypot(e[0] - s[0], e[1] - s[1]) });
  }
  const total = items.reduce((a, b) => a + b.len, 0);
  const pts = [];
  for (let j = 0; j < n; j++) {
    let d = (j / n) * total;
    for (const it of items) {
      if (d <= it.len || it === items[items.length - 1]) {
        const f = it.len ? d / it.len : 0;
        if (it.type === 'arc') { const a = it.a1 + it.da * f; pts.push([it.c[0] + Math.cos(a) * r, it.c[1] + Math.sin(a) * r]); }
        else pts.push([it.s[0] + (it.e[0] - it.s[0]) * f, it.s[1] + (it.e[1] - it.s[1]) * f]);
        break;
      }
      d -= it.len;
    }
  }
  return pts;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const regular = (k, R, rot = -Math.PI / 2) => Array.from({ length: k }, (_, i) => [Math.cos(rot + (i / k) * TAU) * R, Math.sin(rot + (i / k) * TAU) * R]);
// 圆的并集：从中心发射射线，取最远交点（形状对中心是星形的）
function circlesUnion(circles, n = N) {
  return polar((t) => { const d = [Math.cos(t), Math.sin(t)]; let best = 0; for (const [cx, cy, r] of circles) { const b = d[0] * cx + d[1] * cy; const c = cx * cx + cy * cy - r * r; const disc = b * b - c; if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc)); } return best; }, n);
}
// 平滑：圆周卷积（让尖角也带一点肉感）
function smooth(pts, w = 1) { const n = pts.length; return pts.map((_, i) => { let x = 0, y = 0, s = 0; for (let k = -w; k <= w; k++) { const p = pts[(i + k + n) % n]; const g = 1 / (1 + Math.abs(k)); x += p[0] * g; y += p[1] * g; s += g; } return [x / s, y / s]; }); }

function area(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function centroid(pts) { let a = 0, cx = 0, cy = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; } a /= 2; return [cx / (6 * a), cy / (6 * a)]; }
function bbox(pts) { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }

// 归一化：放到 64×64 画布中心，视觉面积一致，最长边不超出 54
function normalize(pts, { targetArea = 1700, maxExtent = 54 } = {}) {
  if (area(pts) < 0) pts = pts.slice().reverse();
  let [x0, y0, x1, y1] = bbox(pts);
  let s = Math.sqrt(targetArea / Math.abs(area(pts)));
  s = Math.min(s, maxExtent / (x1 - x0), maxExtent / (y1 - y0));
  pts = pts.map(([x, y]) => [x * s, y * s]);
  [x0, y0, x1, y1] = bbox(pts);
  const ox = 32 - (x0 + x1) / 2, oy = 32 - (y0 + y1) / 2;
  return pts.map(([x, y]) => [x + ox, y + oy]);
}

// 按弧长重新均匀取点（控制路径体积）
function resample(pts, n) {
  const L = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = L[L.length - 1]; const out = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = (k / n) * total; while (L[j + 1] < d) j++; const f = (d - L[j]) / (L[j + 1] - L[j] || 1); const a = pts[j], b = pts[(j + 1) % pts.length]; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return out;
}
// 闭合 Catmull-Rom → 三次贝塞尔
function toPath(pts) {
  const f = (v) => (Math.round(v * 10) / 10).toString();
  const n = pts.length; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

// ---------- 13 个形状（全部正立、左右对称） ----------
const shapes = {
  circle: polar(() => 25),
  cloud: smooth(circlesUnion([[-12, 4, 10.5], [12, 4, 10.5], [-1, -4, 13.5], [0, 6, 11], [-5, 8, 9], [5, 8, 9]], 160), 3),
  square: roundedPolygon(regular(4, 20, -Math.PI / 4), 9),
  star4: smooth(polar((t) => 15.5 + 12.5 * Math.pow(Math.abs(Math.cos(2 * t)), 3.2), 160), 5),
  clover: smooth(circlesUnion([[-8.5, -8.5, 10.5], [8.5, -8.5, 10.5], [-8.5, 8.5, 10.5], [8.5, 8.5, 10.5], [0, 0, 12]], 160), 3),
  heart: smooth(param((t) => { const x = 16 * Math.pow(Math.sin(t), 3); const y = -(13 * Math.cos(t) - 4.2 * Math.cos(2 * t) - 1.6 * Math.cos(3 * t) - 0.6 * Math.cos(4 * t)); return [x * 1.06, y]; }, 160), 5),
  scallop: smooth(polar((t) => 22 + 3.4 * Math.cos(8 * t), 128), 1),
  droplet: smooth(param((t) => [24 * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 1.15), -25 * Math.cos(t)], 160), 6),
  pill: roundedPolygon([[-11, -1], [11, -1], [11, 1], [-11, 1]], 15),
  triangle: roundedPolygon(regular(3, 15, -Math.PI / 2), 13),
  pentagon: roundedPolygon(regular(5, 18, -Math.PI / 2), 7),
  splat: smooth(polar((t) => 18 + 8 * Math.pow((Math.cos(5 * (t + Math.PI / 2)) + 1) / 2, 1.6), 140), 2),
  hexagon: roundedPolygon(regular(6, 21, -Math.PI / 2), 6),
};

const out = {};
for (const [id, raw] of Object.entries(shapes)) {
  const pts0 = normalize(raw, { targetArea: id === 'star4' || id === 'splat' ? 1500 : id === 'triangle' ? 1550 : 1650 });
  const pts = resample(pts0, ['star4', 'splat', 'scallop', 'clover', 'cloud', 'heart', 'droplet'].includes(id) ? 64 : 40);
  const [cx, cy] = centroid(pts);
  const eyeY = id === 'heart' ? cy + 3 : id === 'droplet' ? cy + 1 : cy - 1.5;
  out[id] = { path: toPath(pts), eye: [Math.round(cx * 10) / 10, Math.round(eyeY * 10) / 10] };
}
console.log(JSON.stringify(out, null, 1));

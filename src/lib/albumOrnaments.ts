// Decorative overlay graphics (עיטורים) a photographer can drop onto an album page — distinct
// from masks (albumMasks.ts), which clip a photo's own pixels: an ornament is a standalone,
// recolorable line-art element (its own position/size/rotation/color/opacity), rendered with
// `currentColor` so the app can tint it via a plain CSS `color`. Same procedural-generator spirit
// as albumMasks.ts (parametric variety rather than 70 hand-authored path files) — this file is the
// single source of truth, hand-copied into the Electron main process (electron/albumOrnaments.ts)
// for PSD rasterization the same way albumMasks.ts is.

export type AlbumOrnamentCategory = "floral" | "geometric" | "vintage";
export type AlbumOrnament = { id: string; label: string; category: AlbumOrnamentCategory; svg: string };

function svg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;
}

function arcPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// A single leaf, tip pointing along +angleDeg from (x,y) (0deg = pointing right, measured the SVG
// way — clockwise from +x). Slightly asymmetric (one side more curved than the other) and drawn
// with a thin center vein so it reads as an actual leaf silhouette, not a generic teardrop.
function leaf(x: number, y: number, angleDeg: number, len: number, width: number, curl = 1): string {
  const veinLen = len * 0.82;
  return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${(angleDeg - 90).toFixed(1)})">
    <path d="M0,0 Q${(width * 1.05).toFixed(2)},${(-len * 0.38).toFixed(2)} 0,${-len} Q${(-width * curl).toFixed(2)},${(-len * 0.44).toFixed(2)} 0,0 Z" fill="currentColor" />
    <path d="M0,${-len * 0.1} Q${(width * 0.15).toFixed(2)},${(-veinLen * 0.5).toFixed(2)} 0,${-veinLen}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="${Math.max(0.4, width * 0.12)}" />
  </g>`;
}

// A filled tapering ribbon along `points` (wide at the start, narrow at the end by default) —
// this is what gives the stems their calligraphic-swash look instead of a flat, uniform-width
// stroke: real pen/brush flourishes taper, and a constant-width polyline reads as mechanical/CAD
// rather than hand-drawn no matter how curved the path is.
function taperedStemPath(points: { x: number; y: number }[], startWidth: number, endWidth: number): string {
  const n = points.length;
  if (n < 2) return "";
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const w = (startWidth + (endWidth - startWidth) * t) / 2;
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[Math.min(n - 1, i + 1)];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: points[i].x + nx * w, y: points[i].y + ny * w });
    right.push({ x: points[i].x - nx * w, y: points[i].y - ny * w });
  }
  const d =
    "M" +
    left.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L") +
    " L" +
    right
      .slice()
      .reverse()
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" L") +
    " Z";
  return `<path d="${d}" fill="currentColor" />`;
}

// A trailing row of dots that shrink toward the end of `points` — the little decorative "bead
// trail" flourish illustrations commonly run alongside part of a curling stem.
function dotTrail(points: { x: number; y: number }[], startR: number, endR: number): string {
  const n = points.length;
  if (n === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const r = startR + (endR - startR) * t;
    if (r <= 0.15) continue;
    parts.push(`<circle cx="${points[i].x.toFixed(2)}" cy="${points[i].y.toFixed(2)}" r="${r.toFixed(2)}" fill="currentColor" />`);
  }
  return parts.join("");
}

// A small logarithmic-ish curl (a tapering spiral) — used to finish a flourish's stem with the
// coiled tip that reads as "hand-lettered swash," rather than the stem just stopping abruptly.
function spiralAccent(cx: number, cy: number, startAngleDeg: number, turns: number, radius: number, widthStart: number): string {
  const steps = 28;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngleDeg + t * turns * 360;
    const r = radius * (1 - t) ** 1.3;
    pts.push(arcPoint(cx, cy, r, angle));
  }
  return taperedStemPath(pts, widthStart, widthStart * 0.15);
}

function polylinePath(points: { x: number; y: number }[], strokeWidth: number): string {
  if (points.length < 2) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
}

// --- Floral (~40): corner flourishes, wreaths, branches ---

function cornerFlourish(opts: { cx: number; cy: number; radius: number; startAngle: number; endAngle: number; leafCount: number; leafLenStart: number; leafLenEnd: number; leafWidth: number; stemWidth: number; curl: number }): string {
  const { cx, cy, radius, startAngle, endAngle, leafCount, leafLenStart, leafLenEnd, leafWidth, stemWidth, curl } = opts;
  const steps = 28;
  const stemPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    // Eased (not linear) radius growth — an ease-out curve reads as a hand-drawn swash
    // accelerating outward, where a straight linear taper reads mechanical.
    const t = i / steps;
    const eased = 1 - (1 - t) ** 2;
    stemPts.push(arcPoint(cx, cy, radius * (0.18 + 0.82 * eased), startAngle + (endAngle - startAngle) * t));
  }
  const dir = endAngle > startAngle ? 1 : -1;
  const parts = [taperedStemPath(stemPts, stemWidth * 0.5, stemWidth * 2.4)];
  // A small coiled curl finishes the stem's inner (low-radius) end, like a pen flourish that
  // loops back on itself instead of just stopping.
  parts.push(spiralAccent(stemPts[0].x, stemPts[0].y, startAngle + 180, 0.85 * dir, radius * 0.13, stemWidth * 0.7));
  // A thin bead trail runs alongside the outer half of the stem, echoing the reference flourish's
  // dotted accent line.
  parts.push(dotTrail(stemPts.slice(Math.floor(steps * 0.45)), 1.6, 0.3));
  for (let i = 0; i < leafCount; i++) {
    const t = leafCount === 1 ? 1 : i / (leafCount - 1);
    const angle = startAngle + (endAngle - startAngle) * t;
    const r = radius * (0.28 + 0.78 * t);
    const p = arcPoint(cx, cy, r, angle);
    const len = leafLenStart + (leafLenEnd - leafLenStart) * t;
    parts.push(leaf(p.x, p.y, angle + dir * 90, len, leafWidth, curl));
  }
  return svg(parts.join(""));
}

function wreath(leafCount: number, radius: number, leafLen: number, leafWidth: number, curl: number): string {
  const ringSteps = 72;
  const ringPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= ringSteps; i++) {
    ringPts.push(arcPoint(50, 50, radius * 0.7, (360 / ringSteps) * i));
  }
  const parts = [taperedStemPath(ringPts, 0.9, 0.9)];
  for (let i = 0; i < leafCount; i++) {
    const angle = (360 / leafCount) * i;
    const p = arcPoint(50, 50, radius, angle);
    parts.push(leaf(p.x, p.y, angle + 90, leafLen, leafWidth, curl));
  }
  return svg(parts.join(""));
}

function branch(startX: number, startY: number, endX: number, endY: number, leafCount: number, leafLen: number, leafWidth: number, stemWidth: number): string {
  const dx = endX - startX;
  const dy = endY - startY;
  const baseAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // A gentle S-curve (offset perpendicular to the straight line, opposite ways at the 1/3 and
  // 2/3 marks) instead of a dead-straight stem — a live branch/vine is never perfectly straight.
  const len = Math.hypot(dx, dy);
  const px = -dy / (len || 1);
  const py = dx / (len || 1);
  const bow = len * 0.06;
  const steps = 20;
  const stemPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = Math.sin(t * Math.PI * 1.4) * bow;
    stemPts.push({ x: startX + dx * t + px * wobble, y: startY + dy * t + py * wobble });
  }
  const parts = [taperedStemPath(stemPts, stemWidth * 1.6, stemWidth * 0.3)];
  for (let i = 0; i < leafCount; i++) {
    const t = (i + 1) / (leafCount + 1);
    const wobble = Math.sin(t * Math.PI * 1.4) * bow;
    const x = startX + dx * t + px * wobble;
    const y = startY + dy * t + py * wobble;
    const side = i % 2 === 0 ? 1 : -1;
    const taper = 0.6 + 0.5 * (1 - t);
    parts.push(leaf(x, y, baseAngle + side * 55, leafLen * taper, leafWidth * taper, 1));
  }
  return svg(parts.join(""));
}

const FLORAL: AlbumOrnament[] = [];
{
  const radii = [30, 42, 54];
  const leafCounts = [5, 7, 9];
  const curls = [0.6, 1.1];
  let n = 1;
  for (const radius of radii) {
    for (const leafCount of leafCounts) {
      for (const curl of curls) {
        FLORAL.push({
          id: `floral-corner-${n}`,
          label: `זר פינתי ${n}`,
          category: "floral",
          svg: cornerFlourish({ cx: 0, cy: 100, radius, startAngle: -85, endAngle: -5, leafCount, leafLenStart: 5, leafLenEnd: 12, leafWidth: 3.2, stemWidth: 1.2, curl }),
        });
        n++;
      }
    }
  }
}
{
  const leafCounts = [6, 8, 10, 12];
  const radii = [28, 36, 44];
  let n = 1;
  for (const leafCount of leafCounts) {
    for (const radius of radii) {
      FLORAL.push({
        id: `floral-wreath-${n}`,
        label: `זר עגול ${n}`,
        category: "floral",
        svg: wreath(leafCount, radius, 11, 4.5, 1),
      });
      n++;
    }
  }
}
{
  const leafCounts = [3, 5, 7];
  const angles: [number, number, number, number][] = [
    [10, 90, 90, 10],
    [15, 15, 85, 85],
    [50, 5, 50, 95],
    [5, 50, 95, 50],
  ];
  let n = 1;
  for (const leafCount of leafCounts) {
    for (const [x1, y1, x2, y2] of angles) {
      FLORAL.push({
        id: `floral-branch-${n}`,
        label: `ענף ${n}`,
        category: "floral",
        svg: branch(x1, y1, x2, y2, leafCount, 9, 3.6, 1.2),
      });
      n++;
    }
  }
}

// --- Geometric (~15): corner brackets, chevrons, dot borders, sunbursts ---

function cornerBracket(size: number, gap: number, strokeWidth: number): string {
  const parts = [
    `<path d="M0,${size} L0,0 L${size},0" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="square" />`,
    `<path d="M${gap},${size + gap} L${gap},${gap} L${size + gap},${gap}" fill="none" stroke="currentColor" stroke-width="${strokeWidth * 0.6}" stroke-linecap="square" />`,
  ];
  return svg(parts.join(""));
}

function chevronRow(count: number, size: number, strokeWidth: number): string {
  const parts: string[] = [];
  const totalWidth = count * size * 1.4;
  const startX = 50 - totalWidth / 2;
  for (let i = 0; i < count; i++) {
    const cx = startX + i * size * 1.4 + size * 0.7;
    parts.push(`<path d="M${cx - size / 2},${50 - size / 2} L${cx},50 L${cx - size / 2},${50 + size / 2}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`);
  }
  return svg(parts.join(""));
}

function dotRow(count: number, r: number): string {
  const parts: string[] = [];
  const spacing = 90 / (count - 1 || 1);
  for (let i = 0; i < count; i++) {
    parts.push(`<circle cx="${(5 + i * spacing).toFixed(1)}" cy="50" r="${r}" fill="currentColor" />`);
  }
  return svg(parts.join(""));
}

function sunburst(rayCount: number, innerR: number, outerR: number, strokeWidth: number): string {
  const parts: string[] = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = (360 / rayCount) * i;
    const p1 = arcPoint(50, 50, innerR, angle);
    const p2 = arcPoint(50, 50, outerR, angle);
    parts.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" />`);
  }
  return svg(parts.join(""));
}

const GEOMETRIC: AlbumOrnament[] = [
  { id: "geo-bracket-1", label: "מסגרת פינה 1", category: "geometric", svg: cornerBracket(35, 8, 2.5) },
  { id: "geo-bracket-2", label: "מסגרת פינה 2", category: "geometric", svg: cornerBracket(45, 10, 3.2) },
  { id: "geo-bracket-3", label: "מסגרת פינה 3", category: "geometric", svg: cornerBracket(28, 6, 2) },
  { id: "geo-bracket-4", label: "מסגרת פינה 4", category: "geometric", svg: cornerBracket(55, 12, 3.6) },
  { id: "geo-chevron-1", label: "שברונים 1", category: "geometric", svg: chevronRow(3, 14, 3) },
  { id: "geo-chevron-2", label: "שברונים 2", category: "geometric", svg: chevronRow(5, 10, 2.4) },
  { id: "geo-chevron-3", label: "שברונים 3", category: "geometric", svg: chevronRow(4, 12, 2.8) },
  { id: "geo-chevron-4", label: "שברונים 4", category: "geometric", svg: chevronRow(6, 8, 2) },
  { id: "geo-dots-1", label: "שורת נקודות 1", category: "geometric", svg: dotRow(7, 3) },
  { id: "geo-dots-2", label: "שורת נקודות 2", category: "geometric", svg: dotRow(11, 2) },
  { id: "geo-dots-3", label: "שורת נקודות 3", category: "geometric", svg: dotRow(5, 4.5) },
  { id: "geo-dots-4", label: "שורת נקודות 4", category: "geometric", svg: dotRow(9, 2.6) },
  { id: "geo-sun-1", label: "קרני שמש 1", category: "geometric", svg: sunburst(16, 14, 34, 1.8) },
  { id: "geo-sun-2", label: "קרני שמש 2", category: "geometric", svg: sunburst(24, 10, 42, 1.3) },
  { id: "geo-sun-3", label: "קרני שמש 3", category: "geometric", svg: sunburst(12, 20, 30, 2.4) },
];

// --- Vintage (~15): scrollwork frames, laurel pairs, ribbons ---

function scrollCorner(size: number, turns: number, strokeWidth: number): string {
  const pts: { x: number; y: number }[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * 360;
    const r = size * (1 - t) * 0.9 + 2;
    const p = arcPoint(0, 0, r, angle - 90);
    pts.push({ x: p.x + size * 0.15, y: p.y + size * 0.15 });
  }
  const spine = `<path d="M0,${size} Q0,0 ${size},0" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" />`;
  const spiral = polylinePath(pts, strokeWidth * 0.8);
  return svg(spine + spiral);
}

function laurelPair(leafCount: number, spread: number, leafLen: number): string {
  const parts: string[] = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < leafCount; i++) {
      const t = i / (leafCount - 1 || 1);
      const y = 85 - t * 65;
      const x = 50 + side * (6 + t * spread);
      const angle = side * (30 + t * 35);
      parts.push(leaf(x, y, angle, leafLen, leafLen * 0.4, 1));
    }
  }
  parts.push(`<path d="M50,85 Q50,${85 - 70 / 2} 50,15" fill="none" stroke="currentColor" stroke-width="1" opacity="0.5" />`);
  return svg(parts.join(""));
}

function ribbonBanner(width: number, height: number, notchDepth: number): string {
  const x0 = 50 - width / 2;
  const x1 = 50 + width / 2;
  const y0 = 50 - height / 2;
  const y1 = 50 + height / 2;
  const d = `M${x0},${y0} L${x1},${y0} L${x1 - notchDepth},50 L${x1},${y1} L${x0},${y1} L${x0 + notchDepth},50 Z`;
  return svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /><line x1="${x0 + notchDepth * 1.6}" y1="50" x2="${x1 - notchDepth * 1.6}" y2="50" stroke="currentColor" stroke-width="1" opacity="0.5" />`);
}

const VINTAGE: AlbumOrnament[] = [
  { id: "vint-scroll-1", label: "קישוט פינה 1", category: "vintage", svg: scrollCorner(38, 2.2, 2) },
  { id: "vint-scroll-2", label: "קישוט פינה 2", category: "vintage", svg: scrollCorner(50, 2.8, 2.4) },
  { id: "vint-scroll-3", label: "קישוט פינה 3", category: "vintage", svg: scrollCorner(30, 1.8, 1.6) },
  { id: "vint-scroll-4", label: "קישוט פינה 4", category: "vintage", svg: scrollCorner(44, 3.2, 2.2) },
  { id: "vint-scroll-5", label: "קישוט פינה 5", category: "vintage", svg: scrollCorner(58, 2.4, 2.8) },
  { id: "vint-laurel-1", label: "זר דפנה 1", category: "vintage", svg: laurelPair(6, 14, 9) },
  { id: "vint-laurel-2", label: "זר דפנה 2", category: "vintage", svg: laurelPair(8, 18, 7) },
  { id: "vint-laurel-3", label: "זר דפנה 3", category: "vintage", svg: laurelPair(5, 10, 12) },
  { id: "vint-laurel-4", label: "זר דפנה 4", category: "vintage", svg: laurelPair(7, 16, 8) },
  { id: "vint-laurel-5", label: "זר דפנה 5", category: "vintage", svg: laurelPair(9, 20, 6) },
  { id: "vint-ribbon-1", label: "סרט 1", category: "vintage", svg: ribbonBanner(70, 20, 8) },
  { id: "vint-ribbon-2", label: "סרט 2", category: "vintage", svg: ribbonBanner(80, 26, 10) },
  { id: "vint-ribbon-3", label: "סרט 3", category: "vintage", svg: ribbonBanner(60, 16, 6) },
  { id: "vint-ribbon-4", label: "סרט 4", category: "vintage", svg: ribbonBanner(75, 22, 9) },
  { id: "vint-ribbon-5", label: "סרט 5", category: "vintage", svg: ribbonBanner(85, 30, 12) },
];

export const ALBUM_ORNAMENTS: AlbumOrnament[] = [...FLORAL, ...GEOMETRIC, ...VINTAGE];

export const ORNAMENT_TABS: { key: AlbumOrnamentCategory; label: string }[] = [
  { key: "floral", label: "פרחוני" },
  { key: "geometric", label: "גיאומטרי" },
  { key: "vintage", label: "וינטג׳" },
];

export function findOrnament(id: string | undefined): AlbumOrnament | undefined {
  return ALBUM_ORNAMENTS.find((o) => o.id === id);
}

export function ornamentDataUrl(o: AlbumOrnament, color: string): string {
  const colored = o.svg.replace("<svg ", `<svg style="color:${color}" `);
  return `data:image/svg+xml,${encodeURIComponent(colored)}`;
}

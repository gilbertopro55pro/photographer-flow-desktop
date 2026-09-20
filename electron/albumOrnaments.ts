// Decorative overlay graphics (עיטורים) a photographer can drop onto an album page — distinct
// from masks (albumMasks.ts), which clip a photo's own pixels: an ornament is a standalone,
// recolorable line-art element (its own position/size/rotation/color/opacity), rendered with
// `currentColor` so the app can tint it via a plain CSS `color`. Same procedural-generator spirit
// as albumMasks.ts (parametric variety rather than 70 hand-authored path files). Imported directly
// by both the client editor and the server-side export routes (albumRaster.ts/albumPsd.ts/
// albumPdf.ts) — unlike the separate desktop app, there's no Electron main-process compile
// boundary here, so no hand-duplicated copy is needed.

export type AlbumOrnamentCategory = "floral" | "geometric" | "vintage" | "symbols";
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

// --- Symbols (~20): hearts, stars, and small clusters of them — single standalone glyphs, unlike
// the corner/border-oriented floral/geometric/vintage sets above. Added for the magnet-frame
// design tool's "elements" tab (heart/star/sparkle motifs), but lives here alongside everything
// else since findOrnament/ornamentDataUrl/server-side compositing all key off one shared id space.
function heartPath(cx: number, cy: number, size: number): string {
  const s = size / 100;
  const d = `M${cx},${cy + 38 * s} C${cx - 30 * s},${cy + 15 * s} ${cx - 45 * s},${cy - 5 * s} ${cx - 45 * s},${cy - 22 * s} C${cx - 45 * s},${cy - 38 * s} ${cx - 30 * s},${cy - 48 * s} ${cx - 15 * s},${cy - 48 * s} C${cx - 7 * s},${cy - 48 * s} ${cx - 2 * s},${cy - 42 * s} ${cx},${cy - 35 * s} C${cx + 2 * s},${cy - 42 * s} ${cx + 7 * s},${cy - 48 * s} ${cx + 15 * s},${cy - 48 * s} C${cx + 30 * s},${cy - 48 * s} ${cx + 45 * s},${cy - 38 * s} ${cx + 45 * s},${cy - 22 * s} C${cx + 45 * s},${cy - 5 * s} ${cx + 30 * s},${cy + 15 * s} ${cx},${cy + 38 * s} Z`;
  return `<path d="${d}" fill="currentColor" />`;
}
function heartOutlinePath(cx: number, cy: number, size: number, strokeWidth: number): string {
  const s = size / 100;
  const d = `M${cx},${cy + 38 * s} C${cx - 30 * s},${cy + 15 * s} ${cx - 45 * s},${cy - 5 * s} ${cx - 45 * s},${cy - 22 * s} C${cx - 45 * s},${cy - 38 * s} ${cx - 30 * s},${cy - 48 * s} ${cx - 15 * s},${cy - 48 * s} C${cx - 7 * s},${cy - 48 * s} ${cx - 2 * s},${cy - 42 * s} ${cx},${cy - 35 * s} C${cx + 2 * s},${cy - 42 * s} ${cx + 7 * s},${cy - 48 * s} ${cx + 15 * s},${cy - 48 * s} C${cx + 30 * s},${cy - 48 * s} ${cx + 45 * s},${cy - 38 * s} ${cx + 45 * s},${cy - 22 * s} C${cx + 45 * s},${cy - 5 * s} ${cx + 30 * s},${cy + 15 * s} ${cx},${cy + 38 * s} Z`;
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round" />`;
}
function starPath(cx: number, cy: number, points: number, outerR: number, innerR: number, rotationDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotationDeg + (i * 180) / points;
    const p = arcPoint(cx, cy, r, angle);
    pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `<path d="${pts.join(" ")} Z" fill="currentColor" />`;
}
function sparkleCluster(specs: { cx: number; cy: number; points: number; outerR: number; innerR: number }[]): string {
  return svg(specs.map((s) => starPath(s.cx, s.cy, s.points, s.outerR, s.innerR)).join(""));
}

const SYMBOLS: AlbumOrnament[] = [
  { id: "sym-heart-1", label: "לב 1", category: "symbols", svg: svg(heartPath(50, 50, 100)) },
  { id: "sym-heart-2", label: "לב 2", category: "symbols", svg: svg(heartPath(50, 50, 72)) },
  { id: "sym-heart-3", label: "לב 3", category: "symbols", svg: svg(heartOutlinePath(50, 50, 100, 4)) },
  { id: "sym-heart-4", label: "לב 4", category: "symbols", svg: svg(heartOutlinePath(50, 50, 72, 5.5)) },
  {
    id: "sym-heart-5",
    label: "צרור לבבות",
    category: "symbols",
    svg: svg(heartPath(30, 62, 46) + heartPath(68, 62, 46) + heartPath(50, 32, 40)),
  },
  {
    id: "sym-heart-6",
    label: "לב וניצוצות",
    category: "symbols",
    svg: svg(heartPath(50, 55, 78) + starPath(80, 22, 4, 10, 4) + starPath(20, 30, 4, 7, 3)),
  },
  { id: "sym-star-1", label: "כוכב 1", category: "symbols", svg: svg(starPath(50, 50, 5, 46, 18)) },
  { id: "sym-star-2", label: "כוכב 2", category: "symbols", svg: svg(starPath(50, 50, 5, 46, 30)) },
  { id: "sym-star-3", label: "כוכב 3", category: "symbols", svg: svg(starPath(50, 50, 6, 46, 22)) },
  { id: "sym-star-4", label: "כוכב 4", category: "symbols", svg: svg(starPath(50, 50, 4, 46, 16)) },
  { id: "sym-star-5", label: "כוכב 5 (דק)", category: "symbols", svg: svg(starPath(50, 50, 5, 46, 10)) },
  {
    id: "sym-star-6",
    label: "מקבץ כוכבים",
    category: "symbols",
    svg: sparkleCluster([
      { cx: 50, cy: 50, points: 5, outerR: 34, innerR: 14 },
      { cx: 80, cy: 24, points: 4, outerR: 12, innerR: 4 },
      { cx: 18, cy: 30, points: 4, outerR: 9, innerR: 3 },
      { cx: 78, cy: 76, points: 4, outerR: 8, innerR: 3 },
    ]),
  },
  {
    id: "sym-star-7",
    label: "שמיים זרועי כוכבים",
    category: "symbols",
    svg: sparkleCluster([
      { cx: 24, cy: 26, points: 4, outerR: 14, innerR: 5 },
      { cx: 68, cy: 20, points: 4, outerR: 10, innerR: 4 },
      { cx: 80, cy: 58, points: 4, outerR: 12, innerR: 5 },
      { cx: 30, cy: 74, points: 4, outerR: 9, innerR: 3.5 },
      { cx: 58, cy: 62, points: 4, outerR: 7, innerR: 3 },
    ]),
  },
  { id: "sym-sparkle-1", label: "ניצוץ 1", category: "symbols", svg: svg(starPath(50, 50, 4, 46, 10)) },
  { id: "sym-sparkle-2", label: "ניצוץ 2", category: "symbols", svg: svg(starPath(50, 50, 4, 46, 16)) },
  {
    id: "sym-sparkle-3",
    label: "שני ניצוצות",
    category: "symbols",
    svg: sparkleCluster([
      { cx: 38, cy: 50, points: 4, outerR: 32, innerR: 8 },
      { cx: 76, cy: 26, points: 4, outerR: 14, innerR: 4 },
    ]),
  },
  { id: "sym-diamond-1", label: "יהלום 1", category: "symbols", svg: svg(starPath(50, 50, 4, 46, 30, -90)) },
  { id: "sym-diamond-2", label: "יהלום 2", category: "symbols", svg: svg(`<path d="M50,6 L82,50 L50,94 L18,50 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" />`) },
  { id: "sym-moon-1", label: "ירח", category: "symbols", svg: svg(`<path d="M62,10 A42,42 0 1 0 62,90 A34,34 0 1 1 62,10 Z" fill="currentColor" />`) },
  { id: "sym-sun-1", label: "שמש", category: "symbols", svg: svg(sunburst(12, 22, 42, 3) + `<circle cx="50" cy="50" r="18" fill="currentColor" />`) },
  {
    id: "sym-leaves-1",
    label: "עלים",
    category: "symbols",
    svg: svg(leaf(35, 65, -40, 34, 12, 1) + leaf(65, 65, -140, 34, 12, 1)),
  },
  // Event-specific additions (rings/couple/etc.) — added for the magnet-frame design tool's
  // element picker, which needed motifs beyond the album editor's generic decor set.
  {
    id: "sym-rings-1",
    label: "טבעות",
    category: "symbols",
    svg: svg(`<circle cx="36" cy="58" r="22" fill="none" stroke="currentColor" stroke-width="6" /><circle cx="64" cy="58" r="22" fill="none" stroke="currentColor" stroke-width="6" />`),
  },
  {
    id: "sym-rings-2",
    label: "טבעות עם ניצוץ",
    category: "symbols",
    svg: svg(
      `<circle cx="36" cy="58" r="22" fill="none" stroke="currentColor" stroke-width="6" /><circle cx="64" cy="58" r="22" fill="none" stroke="currentColor" stroke-width="6" />` +
        starPath(70, 17, 4, 9, 3)
    ),
  },
  {
    id: "sym-champagne-1",
    label: "כוסות שמפניה",
    category: "symbols",
    svg: svg(
      `<g transform="translate(35,60) rotate(14)"><path d="M-9,-45 L9,-45 L4,-8 L-4,-8 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" /><line x1="0" y1="-8" x2="0" y2="18" stroke="currentColor" stroke-width="4" /><line x1="-9" y1="18" x2="9" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /></g><g transform="translate(65,60) rotate(-14)"><path d="M-9,-45 L9,-45 L4,-8 L-4,-8 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" /><line x1="0" y1="-8" x2="0" y2="18" stroke="currentColor" stroke-width="4" /><line x1="-9" y1="18" x2="9" y2="18" stroke="currentColor" stroke-width="4" stroke-linecap="round" /></g>`
    ),
  },
  {
    id: "sym-cake-1",
    label: "עוגת אירוע",
    category: "symbols",
    svg: svg(
      `<rect x="22" y="58" width="56" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="5" /><rect x="32" y="34" width="36" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="5" /><line x1="50" y1="34" x2="50" y2="20" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M50,20 Q54,12 50,8 Q46,12 50,20 Z" fill="currentColor" />`
    ),
  },
  {
    id: "sym-balloon-1",
    label: "בלון",
    category: "symbols",
    svg: svg(
      `<ellipse cx="50" cy="38" rx="24" ry="30" fill="currentColor" /><path d="M50,68 L46,74 L54,74 Z" fill="currentColor" /><path d="M50,74 Q56,84 50,92 Q44,84 50,74" fill="none" stroke="currentColor" stroke-width="3" />`
    ),
  },
  {
    id: "sym-balloon-2",
    label: "צרור בלונים",
    category: "symbols",
    svg: svg(
      `<g transform="translate(36,42)"><ellipse cx="0" cy="0" rx="16" ry="20" fill="currentColor" /><path d="M0,20 L-2.88,27 L2.88,27 Z" fill="currentColor" /></g><g transform="translate(58,32)"><ellipse cx="0" cy="0" rx="14" ry="18" fill="currentColor" /><path d="M0,18 L-2.52,25 L2.52,25 Z" fill="currentColor" /></g><g transform="translate(50,58)"><ellipse cx="0" cy="0" rx="13" ry="16" fill="currentColor" /><path d="M0,16 L-2.34,23 L2.34,23 Z" fill="currentColor" /></g>`
    ),
  },
  {
    id: "sym-couple-1",
    label: "זוג",
    category: "symbols",
    svg: svg(
      `<circle cx="30" cy="24" r="9" fill="currentColor" /><path d="M30,34 C14,34 12,60 16,90 L44,90 C48,60 46,34 30,34 Z" fill="currentColor" /><circle cx="70" cy="24" r="9" fill="currentColor" /><rect x="58" y="34" width="24" height="40" rx="4" fill="currentColor" /><rect x="60" y="74" width="8" height="16" fill="currentColor" /><rect x="72" y="74" width="8" height="16" fill="currentColor" /><line x1="44" y1="66" x2="58" y2="66" stroke="currentColor" stroke-width="5" stroke-linecap="round" />`
    ),
  },
  {
    id: "sym-dove-1",
    label: "יונת שלום",
    category: "symbols",
    svg: svg(
      `<ellipse cx="50" cy="55" rx="26" ry="15" fill="currentColor" transform="rotate(-12 50 55)" /><circle cx="26" cy="42" r="9" fill="currentColor" /><path d="M15,42 L4,38 L15,48 Z" fill="currentColor" /><path d="M55,45 Q75,20 92,38 Q72,36 62,50 Q58,46 55,45 Z" fill="currentColor" opacity="0.95" />`
    ),
  },
  {
    id: "sym-confetti-1",
    label: "קונפטי",
    category: "symbols",
    svg: svg(
      `<rect x="20" y="20" width="8" height="8" rx="2" fill="currentColor" transform="rotate(15 24 24)" /><rect x="70" y="15" width="7" height="7" rx="2" fill="currentColor" transform="rotate(-20 73 18)" /><circle cx="55" cy="30" r="4" fill="currentColor" /><circle cx="30" cy="60" r="5" fill="currentColor" /><rect x="65" y="55" width="8" height="8" rx="2" fill="currentColor" transform="rotate(35 69 59)" /><circle cx="80" cy="75" r="4" fill="currentColor" /><rect x="40" y="75" width="7" height="7" rx="2" fill="currentColor" transform="rotate(-10 43 78)" /><circle cx="15" cy="45" r="3.5" fill="currentColor" />`
    ),
  },
  {
    id: "sym-arch-1",
    label: "קשת חתונה",
    category: "symbols",
    svg: svg(
      `<path d="M20,90 L20,45 A30,30 0 0 1 80,45 L80,90" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />` +
        leaf(20, 45, 160, 14, 6, 1) +
        leaf(80, 45, 20, 14, 6, 1) +
        leaf(50, 15, -90, 12, 5, 1)
    ),
  },
  {
    id: "sym-candle-1",
    label: "נר",
    category: "symbols",
    svg: svg(
      `<rect x="42" y="40" width="16" height="50" rx="3" fill="currentColor" /><ellipse cx="50" cy="40" rx="8" ry="4" fill="currentColor" opacity="0.85" /><path d="M50,30 Q56,20 50,12 Q44,20 50,30 Z" fill="currentColor" />`
    ),
  },
  // Every motif above landed in whichever single style (filled "vector" or stroked "outline") was
  // simplest to draw well — these fill in the missing half of each pair, so every event motif has
  // both a solid and a line-art rendering to choose from, matching how hearts/stars/diamonds above
  // already had both from the start.
  {
    id: "sym-rings-vector",
    label: "טבעות (וקטור)",
    category: "symbols",
    svg: svg(
      `<path fill-rule="evenodd" d="M36,58 m-22,0 a22,22 0 1,0 44,0 a22,22 0 1,0 -44,0 M36,58 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -14,0" fill="currentColor" /><path fill-rule="evenodd" d="M64,58 m-22,0 a22,22 0 1,0 44,0 a22,22 0 1,0 -44,0 M64,58 m-14,0 a14,14 0 1,0 28,0 a14,14 0 1,0 -14,0" fill="currentColor" />`
    ),
  },
  {
    id: "sym-champagne-vector",
    label: "כוסות שמפניה (וקטור)",
    category: "symbols",
    svg: svg(
      `<g transform="translate(35,60) rotate(14)"><path d="M-9,-45 L9,-45 L4,-8 L-4,-8 Z" fill="currentColor" /><rect x="-2" y="-8" width="4" height="26" fill="currentColor" /><rect x="-9" y="14" width="18" height="4" rx="2" fill="currentColor" /></g><g transform="translate(65,60) rotate(-14)"><path d="M-9,-45 L9,-45 L4,-8 L-4,-8 Z" fill="currentColor" /><rect x="-2" y="-8" width="4" height="26" fill="currentColor" /><rect x="-9" y="14" width="18" height="4" rx="2" fill="currentColor" /></g>`
    ),
  },
  {
    id: "sym-cake-vector",
    label: "עוגת אירוע (וקטור)",
    category: "symbols",
    svg: svg(
      `<rect x="22" y="58" width="56" height="28" rx="3" fill="currentColor" /><rect x="32" y="32" width="36" height="24" rx="3" fill="currentColor" /><line x1="50" y1="32" x2="50" y2="20" stroke="currentColor" stroke-width="4" stroke-linecap="round" /><path d="M50,20 Q54,12 50,8 Q46,12 50,20 Z" fill="currentColor" />`
    ),
  },
  {
    id: "sym-balloon-outline",
    label: "בלון (קו מתאר)",
    category: "symbols",
    svg: svg(
      `<ellipse cx="50" cy="38" rx="24" ry="30" fill="none" stroke="currentColor" stroke-width="4" /><path d="M50,68 L46,74 L54,74 Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" /><path d="M50,74 Q56,84 50,92 Q44,84 50,74" fill="none" stroke="currentColor" stroke-width="3" />`
    ),
  },
  {
    id: "sym-couple-outline",
    label: "זוג (קו מתאר)",
    category: "symbols",
    svg: svg(
      `<circle cx="30" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3.5" /><path d="M30,34 C14,34 12,60 16,90 L44,90 C48,60 46,34 30,34 Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" /><circle cx="70" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="3.5" /><rect x="58" y="34" width="24" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="3.5" /><rect x="60" y="74" width="8" height="16" fill="none" stroke="currentColor" stroke-width="3.5" /><rect x="72" y="74" width="8" height="16" fill="none" stroke="currentColor" stroke-width="3.5" /><line x1="44" y1="66" x2="58" y2="66" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" />`
    ),
  },
  {
    id: "sym-dove-outline",
    label: "יונת שלום (קו מתאר)",
    category: "symbols",
    svg: svg(
      `<ellipse cx="50" cy="55" rx="26" ry="15" fill="none" stroke="currentColor" stroke-width="3" transform="rotate(-12 50 55)" /><circle cx="26" cy="42" r="9" fill="none" stroke="currentColor" stroke-width="3" /><path d="M15,42 L4,38 L15,48 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" /><path d="M55,45 Q75,20 92,38 Q72,36 62,50 Q58,46 55,45 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />`
    ),
  },
  {
    id: "sym-candle-outline",
    label: "נר (קו מתאר)",
    category: "symbols",
    svg: svg(
      `<rect x="42" y="40" width="16" height="50" rx="3" fill="none" stroke="currentColor" stroke-width="3.5" /><ellipse cx="50" cy="40" rx="8" ry="4" fill="none" stroke="currentColor" stroke-width="2.5" /><path d="M50,30 Q56,20 50,12 Q44,20 50,30 Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />`
    ),
  },
  {
    id: "sym-confetti-outline",
    label: "קונפטי (קו מתאר)",
    category: "symbols",
    svg: svg(
      `<rect x="20" y="20" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(15 24 24)" /><rect x="70" y="15" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-20 73 18)" /><circle cx="55" cy="30" r="4" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="30" cy="60" r="5" fill="none" stroke="currentColor" stroke-width="2" /><rect x="65" y="55" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(35 69 59)" /><circle cx="80" cy="75" r="4" fill="none" stroke="currentColor" stroke-width="2" /><rect x="40" y="75" width="7" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-10 43 78)" /><circle cx="15" cy="45" r="3.5" fill="none" stroke="currentColor" stroke-width="2" />`
    ),
  },
  // 50 additional clean-outline, event-themed elements (hearts, florals, wedding/luck motifs,
  // romantic misc, decorative extras) — see the standalone draft/preview script this batch was
  // authored and visually verified with before landing here (not checked in; scratch-only).
  { id: "heart-classic-outline", label: "לב קלאסי (קו מתאר)", category: "symbols", svg: svg(`<path d="M50,88 C20,65 8,45 8,28 C8,12 22,4 35,4 C42,4 47,8 50,15 C53,8 58,4 65,4 C78,4 92,12 92,28 C92,45 80,65 50,88 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>`) },
  { id: "heart-scroll-outline", label: "לב מסולסל", category: "symbols", svg: svg(`<path d="M50,80 C28,63 18,48 18,35 C18,23 28,16 37,16 C43,16 47,19 50,25 C53,19 57,16 63,16 C72,16 82,23 82,35 C82,48 72,63 50,80 Z" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/><path d="M22,26 Q6,22 8,6 Q22,8 20,22" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M78,26 Q94,22 92,6 Q78,8 80,22" fill="none" stroke="currentColor" stroke-width="2.4"/>`) },
  { id: "heart-arrow-outline", label: "לב וחץ", category: "symbols", svg: svg(`<path d="M50,86 C24,65 14,47 14,32 C14,18 26,10 37,10 C43,10 47,13 50,19 C53,13 57,10 63,10 C74,10 86,18 86,32 C86,47 76,65 50,86 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><line x1="6" y1="92" x2="88" y2="12" stroke="currentColor" stroke-width="2.2"/><path d="M78,8 L92,10 L86,22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: "heart-double-outline", label: "שני לבבות שלובים", category: "symbols", svg: svg(`<path d="M40,76 C20,60 12,46 12,34 C12,23 21,17 29,17 C34,17 38,20 40,25 C42,20 46,17 51,17 C59,17 68,23 68,34 C68,46 60,60 40,76 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M60,76 C40,60 32,46 32,34 C32,23 41,17 49,17 C54,17 58,20 60,25 C62,20 66,17 71,17 C79,17 88,23 88,34 C88,46 80,60 60,76 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: "heart-key-outline", label: "מפתח בצורת לב", category: "symbols", svg: svg(`<path d="M50,10 C40,2 28,2 24,12 C20,20 28,28 50,42 C72,28 80,20 76,12 C72,2 60,2 50,10 Z" fill="none" stroke="currentColor" stroke-width="2.6"/><line x1="50" y1="42" x2="50" y2="88" stroke="currentColor" stroke-width="2.6"/><line x1="50" y1="70" x2="63" y2="70" stroke="currentColor" stroke-width="2.6"/><line x1="50" y1="81" x2="59" y2="81" stroke="currentColor" stroke-width="2.6"/>`) },
  { id: "heart-infinity-outline", label: "לב ואינסוף", category: "symbols", svg: svg(`<path d="M15,58 C15,44 29,44 42,58 C55,72 68,72 68,58 C68,44 55,44 42,58 C29,72 15,72 15,58 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M42,30 C36,25 28,28 28,34 C28,39 34,43 42,48 C50,43 56,39 56,34 C56,28 48,25 42,30 Z" fill="none" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "heart-crown-outline", label: "לב עם כתר", category: "symbols", svg: svg(`<path d="M50,88 C26,68 16,52 16,38 C16,25 27,18 36,18 C42,18 46,21 50,27 C54,21 58,18 64,18 C73,18 84,25 84,38 C84,52 74,68 50,88 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M34,16 L38,4 L46,12 L50,2 L54,12 L62,4 L66,16 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: "heart-banner-outline", label: "לב עם סרט", category: "symbols", svg: svg(`<path d="M50,84 C26,64 16,48 16,34 C16,21 27,14 36,14 C42,14 46,17 50,23 C54,17 58,14 64,14 C73,14 84,21 84,34 C84,48 74,64 50,84 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M10,52 L28,46 L28,58 L72,58 L72,46 L90,52 L72,64 L72,56 L28,56 L28,64 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: "heart-lace-outline", label: "לב מתחרה", category: "symbols", svg: svg(`<path d="M50,86 C24,65 14,47 14,32 C14,18 26,10 37,10 C43,10 47,13 50,19 C53,13 57,10 63,10 C74,10 86,18 86,32 C86,47 76,65 50,86 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="30" cy="30" r="2" fill="currentColor"/><circle cx="50" cy="22" r="2" fill="currentColor"/><circle cx="70" cy="30" r="2" fill="currentColor"/><circle cx="24" cy="48" r="2" fill="currentColor"/><circle cx="76" cy="48" r="2" fill="currentColor"/>`) },
  { id: "heart-flourish-outline", label: "לב עם עיטור", category: "symbols", svg: svg(`<circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M50,68 C34,54 27,42 27,32 C27,23 34,18 41,18 C45,18 48,20 50,24 C52,20 55,18 59,18 C66,18 73,23 73,32 C73,42 66,54 50,68 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`) },
  { id: "flower-blossom-outline", label: "פריחה", category: "symbols", svg: svg(`<g fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="50" cy="30" rx="10" ry="16"/><ellipse cx="50" cy="30" rx="10" ry="16" transform="rotate(72 50 50)"/><ellipse cx="50" cy="30" rx="10" ry="16" transform="rotate(144 50 50)"/><ellipse cx="50" cy="30" rx="10" ry="16" transform="rotate(216 50 50)"/><ellipse cx="50" cy="30" rx="10" ry="16" transform="rotate(288 50 50)"/></g><circle cx="50" cy="50" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "rose-outline", label: "ורד", category: "symbols", svg: svg(`<circle cx="50" cy="38" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M50,32 C40,32 36,40 42,46 C34,44 30,52 38,58 C48,60 56,56 56,48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M50,32 C60,32 64,40 58,46 C66,44 70,52 62,58" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M50,60 Q50,80 50,94" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M50,76 Q38,78 34,70 M50,86 Q62,88 66,80" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "bouquet-outline", label: "זר פרחים", category: "symbols", svg: svg(`<path d="M50,90 L38,55 M50,90 L50,50 M50,90 L62,55" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="38" cy="48" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="40" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="62" cy="48" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M44,88 L38,96 M50,90 L50,98 M56,88 L62,96" fill="none" stroke="currentColor" stroke-width="2"/>`) },
  { id: "flower-crown-outline", label: "זר פרחים לראש", category: "symbols", svg: svg(`<path d="M14,55 A36,20 0 0 1 86,55" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="22" cy="50" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="38" cy="38" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="50" cy="34" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="62" cy="38" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="78" cy="50" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "sprig-outline", label: "ענף עלים", category: "symbols", svg: svg(`<path d="M50,92 Q46,60 54,20" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M52,72 Q40,66 36,54" fill="none" stroke="currentColor" stroke-width="2"/><path d="M53,56 Q65,50 70,38" fill="none" stroke="currentColor" stroke-width="2"/><path d="M53,40 Q42,34 38,24" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="55" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="2"/>`) },
  { id: "laurel-single-outline", label: "ענף דפנה בודד", category: "symbols", svg: svg(`<path d="M50,92 Q48,55 50,14" fill="none" stroke="currentColor" stroke-width="2.2"/><g fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="40" cy="30" rx="8" ry="4" transform="rotate(-35 40 30)"/><ellipse cx="60" cy="30" rx="8" ry="4" transform="rotate(35 60 30)"/><ellipse cx="38" cy="48" rx="8" ry="4" transform="rotate(-35 38 48)"/><ellipse cx="62" cy="48" rx="8" ry="4" transform="rotate(35 62 48)"/><ellipse cx="42" cy="66" rx="8" ry="4" transform="rotate(-35 42 66)"/><ellipse cx="58" cy="66" rx="8" ry="4" transform="rotate(35 58 66)"/></g>`) },
  { id: "wildflower-cluster-outline", label: "צרור פרחי בר", category: "symbols", svg: svg(`<g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M30,80 Q28,50 34,30"/><path d="M50,84 Q50,48 50,20"/><path d="M70,80 Q72,50 66,30"/></g><circle cx="34" cy="26" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="50" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="66" cy="26" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "bells-pair-outline", label: "פעמוני חתונה", category: "symbols", svg: svg(`<g fill="none" stroke="currentColor" stroke-width="2.2"><path d="M32,20 C32,14 37,10 42,10 C47,10 52,14 52,20 L54,52 C54,58 48,62 42,62 C36,62 30,58 30,52 Z"/><circle cx="42" cy="68" r="3"/><path d="M52,26 C52,20 57,16 62,16 C67,16 72,20 72,26 L74,52 C74,58 68,62 62,62 C56,62 50,58 50,52 Z"/><circle cx="62" cy="68" r="3"/></g>`) },
  { id: "bell-single-outline", label: "פעמון", category: "symbols", svg: svg(`<path d="M32,58 C32,32 40,16 50,16 C60,16 68,32 68,58 Z" fill="none" stroke="currentColor" stroke-width="2.6"/><line x1="26" y1="58" x2="74" y2="58" stroke="currentColor" stroke-width="2.6"/><circle cx="50" cy="74" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="50" y1="16" x2="50" y2="8" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "horseshoe-outline", label: "פרסה למזל", category: "symbols", svg: svg(`<path d="M28,44 C28,18 72,18 72,44 L72,80 L60,80 L60,46 C60,32 40,32 40,46 L40,80 L28,80 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>`) },
  { id: "clover-outline", label: "תלתן בעל 4 עלים", category: "symbols", svg: svg(`<g fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="38" cy="38" r="12"/><circle cx="62" cy="38" r="12"/><circle cx="38" cy="62" r="12"/><circle cx="62" cy="62" r="12"/></g><line x1="50" y1="50" x2="50" y2="90" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "infinity-outline", label: "אינסוף", category: "symbols", svg: svg(`<path d="M12,50 C12,34 28,34 40,50 C52,66 68,66 68,50 C68,34 52,34 40,50 C28,66 12,66 12,50 Z" fill="none" stroke="currentColor" stroke-width="2.8"/>`) },
  { id: "love-lock-outline", label: "מנעול אהבה", category: "symbols", svg: svg(`<path d="M36,44 L36,32 C36,20 42,14 50,14 C58,14 64,20 64,32 L64,44" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="26" y="44" width="48" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="50" cy="62" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="50" y1="67" x2="50" y2="74" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "key-ornate-outline", label: "מפתח מעוטר", category: "symbols", svg: svg(`<circle cx="30" cy="30" r="16" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="30" cy="30" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="42" y1="42" x2="86" y2="86" stroke="currentColor" stroke-width="2.6"/><line x1="72" y1="72" x2="80" y2="64" stroke="currentColor" stroke-width="2.2"/><line x1="78" y1="78" x2="88" y2="72" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "crown-outline", label: "כתר", category: "symbols", svg: svg(`<path d="M18,74 L18,42 L34,58 L50,30 L66,58 L82,42 L82,74 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><line x1="18" y1="80" x2="82" y2="80" stroke="currentColor" stroke-width="2.6"/>`) },
  { id: "tiara-outline", label: "עטרה", category: "symbols", svg: svg(`<path d="M10,66 Q50,20 90,66" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M10,66 L90,66" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="50" cy="30" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="30" cy="46" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="70" cy="46" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "swan-pair-heart-outline", label: "ברבורים בצורת לב", category: "symbols", svg: svg(`<path d="M20,70 C20,50 30,36 30,50 C30,58 24,58 22,52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M80,70 C80,50 70,36 70,50 C70,58 76,58 78,52" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20,70 Q50,90 80,70" fill="none" stroke="currentColor" stroke-width="2.4"/>`) },
  { id: "love-birds-outline", label: "זוג ציפורים", category: "symbols", svg: svg(`<path d="M14,60 Q22,50 34,54 Q28,58 30,64 Q20,64 14,60 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="10" y1="70" x2="90" y2="70" stroke="currentColor" stroke-width="1.6"/><path d="M66,60 Q74,50 86,54 Q80,58 82,64 Q72,64 66,60 Z" fill="none" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "envelope-outline", label: "מעטפה", category: "symbols", svg: svg(`<rect x="14" y="26" width="72" height="50" rx="4" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14,28 L50,58 L86,28" fill="none" stroke="currentColor" stroke-width="2.4"/>`) },
  { id: "wine-glass-outline", label: "כוס יין", category: "symbols", svg: svg(`<path d="M32,10 L68,10 C68,32 58,40 50,40 C42,40 32,32 32,10 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="50" y1="40" x2="50" y2="80" stroke="currentColor" stroke-width="2.4"/><line x1="34" y1="88" x2="66" y2="88" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="50" y1="80" x2="50" y2="88" stroke="currentColor" stroke-width="2.4"/>`) },
  { id: "feather-outline", label: "נוצה", category: "symbols", svg: svg(`<path d="M50,92 Q40,60 58,10" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M50,80 Q38,74 32,64 M52,66 Q42,58 38,48 M54,52 Q46,44 44,34 M56,38 Q50,30 50,22" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "butterfly-outline", label: "פרפר", category: "symbols", svg: svg(`<line x1="50" y1="20" x2="50" y2="80" stroke="currentColor" stroke-width="2.2"/><path d="M50,26 C50,10 20,8 18,24 C16,38 34,42 50,34" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M50,26 C50,10 80,8 82,24 C84,38 66,42 50,34" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M50,40 C50,54 26,58 24,70 C22,80 38,84 50,72" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M50,40 C50,54 74,58 76,70 C78,80 62,84 50,72" fill="none" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "moon-stars-outline", label: "ירח וכוכבים", category: "symbols", svg: svg(`<path d="M60,14 A26,26 0 1 0 60,66 A20,20 0 1 1 60,14 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M20,70 L22,76 L28,78 L22,80 L20,86 L18,80 L12,78 L18,76 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M80,50 L81.5,54 L86,55 L81.5,56 L80,60 L78.5,56 L74,55 L78.5,54 Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`) },
  { id: "sparkler-outline", label: "זיקוקי חתונה", category: "symbols", svg: svg(`<line x1="50" y1="90" x2="60" y2="20" stroke="currentColor" stroke-width="2.4"/><g fill="none" stroke="currentColor" stroke-width="1.6"><line x1="60" y1="20" x2="60" y2="6"/><line x1="60" y1="20" x2="72" y2="12"/><line x1="60" y1="20" x2="48" y2="10"/><line x1="60" y1="20" x2="76" y2="24"/><line x1="60" y1="20" x2="48" y2="26"/></g>`) },
  { id: "gift-box-outline", label: "מתנה", category: "symbols", svg: svg(`<rect x="18" y="42" width="64" height="46" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="18" y1="58" x2="82" y2="58" stroke="currentColor" stroke-width="2.4"/><line x1="50" y1="42" x2="50" y2="88" stroke="currentColor" stroke-width="2.4"/><path d="M50,42 C50,26 34,22 34,32 C34,40 42,42 50,42 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M50,42 C50,26 66,22 66,32 C66,40 58,42 50,42 Z" fill="none" stroke="currentColor" stroke-width="2"/>`) },
  { id: "cupcake-outline", label: "קאפקייק", category: "symbols", svg: svg(`<path d="M28,54 L72,54 L64,88 L36,88 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M22,54 Q22,34 34,32 Q34,20 50,20 Q66,20 66,32 Q78,34 78,54" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="50" y1="18" x2="50" y2="8" stroke="currentColor" stroke-width="2"/>`) },
  { id: "photo-frame-outline", label: "מסגרת תמונה קטנה", category: "symbols", svg: svg(`<rect x="16" y="16" width="68" height="68" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="26" y="26" width="48" height="48" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>`) },
  { id: "bow-ribbon-outline", label: "פפיון סרט", category: "symbols", svg: svg(`<path d="M50,50 L14,28 C10,38 10,62 14,72 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M50,50 L86,28 C90,38 90,62 86,72 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="50" cy="50" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "lantern-outline", label: "פנס", category: "symbols", svg: svg(`<path d="M38,20 L62,20 L62,30 L38,30 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M32,30 Q50,24 68,30 L64,78 Q50,84 36,78 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="50" y1="10" x2="50" y2="20" stroke="currentColor" stroke-width="2"/><line x1="50" y1="30" x2="50" y2="78" stroke="currentColor" stroke-width="1.4"/>`) },
  { id: "wreath-circle-outline", label: "זר עגול", category: "symbols", svg: svg(`<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="2.2"/><g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="50" cy="18" rx="6" ry="3"/><ellipse cx="72" cy="28" rx="6" ry="3" transform="rotate(45 72 28)"/><ellipse cx="82" cy="50" rx="6" ry="3" transform="rotate(90 82 50)"/><ellipse cx="72" cy="72" rx="6" ry="3" transform="rotate(-45 72 72)"/><ellipse cx="50" cy="82" rx="6" ry="3"/><ellipse cx="28" cy="72" rx="6" ry="3" transform="rotate(45 28 72)"/><ellipse cx="18" cy="50" rx="6" ry="3" transform="rotate(90 18 50)"/><ellipse cx="28" cy="28" rx="6" ry="3" transform="rotate(-45 28 28)"/></g>`) },
  { id: "cocktail-glass-outline", label: "כוס קוקטייל", category: "symbols", svg: svg(`<path d="M22,16 L78,16 L50,50 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><line x1="50" y1="50" x2="50" y2="82" stroke="currentColor" stroke-width="2.4"/><line x1="34" y1="88" x2="66" y2="88" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="50" y1="82" x2="50" y2="88" stroke="currentColor" stroke-width="2.4"/><circle cx="58" cy="28" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "cake-slice-outline", label: "פרוסת עוגה", category: "symbols", svg: svg(`<path d="M50,20 L80,80 L20,80 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><line x1="27" y1="66" x2="73" y2="66" stroke="currentColor" stroke-width="2"/><line x1="50" y1="20" x2="50" y2="66" stroke="currentColor" stroke-width="1.6"/><circle cx="50" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "ring-box-outline", label: "קופסת טבעת", category: "symbols", svg: svg(`<path d="M16,44 L84,44 L84,80 L16,80 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16,44 L26,24 L74,24 L84,44" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="50" cy="60" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`) },
  { id: "star-flourish-outline", label: "כוכב מעוטר", category: "symbols", svg: svg(`<path d="M50,10 L58,38 L88,38 L64,56 L72,86 L50,68 L28,86 L36,56 L12,38 L42,38 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>`) },
  { id: "filigree-divider-outline", label: "פס מעוטר", category: "symbols", svg: svg(`<line x1="4" y1="50" x2="34" y2="50" stroke="currentColor" stroke-width="1.8"/><line x1="66" y1="50" x2="96" y2="50" stroke="currentColor" stroke-width="1.8"/><path d="M34,50 C40,42 48,42 50,50 C52,42 60,42 66,50 C60,58 52,58 50,50 C48,58 40,58 34,50 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "filigree-corner-outline", label: "עיטור פינה", category: "symbols", svg: svg(`<path d="M6,94 L6,46 Q6,6 46,6 L94,6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6,64 Q26,64 26,44" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M64,6 Q64,26 44,26" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="26" cy="26" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "dove-pair-outline", label: "זוג יונים", category: "symbols", svg: svg(`<path d="M20,55 Q10,48 14,38 Q22,40 22,48 Q30,42 38,46 Q30,52 20,55 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M80,55 Q90,48 86,38 Q78,40 78,48 Q70,42 62,46 Q70,52 80,55 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20,55 Q50,70 80,55" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "champagne-bottle-outline", label: "בקבוק שמפניה", category: "symbols", svg: svg(`<path d="M42,92 L42,50 Q42,40 46,34 L46,14 Q46,8 50,8 Q54,8 54,14 L54,34 Q58,40 58,50 L58,92 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><line x1="42" y1="66" x2="58" y2="66" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "candle-pair-outline", label: "זוג נרות", category: "symbols", svg: svg(`<rect x="26" y="46" width="12" height="42" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M32,40 Q37,32 32,24 Q27,32 32,40 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="62" y="34" width="12" height="54" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M68,28 Q73,20 68,12 Q63,20 68,28 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "garland-swag-outline", label: "גרלנד תלוי", category: "symbols", svg: svg(`<path d="M6,20 Q50,60 94,20" fill="none" stroke="currentColor" stroke-width="1.8"/><g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="22" cy="30" rx="5" ry="2.6" transform="rotate(30 22 30)"/><ellipse cx="40" cy="46" rx="5" ry="2.6" transform="rotate(60 40 46)"/><ellipse cx="60" cy="46" rx="5" ry="2.6" transform="rotate(-60 60 46)"/><ellipse cx="78" cy="30" rx="5" ry="2.6" transform="rotate(-30 78 30)"/></g>`) },
  // 30 more clean-outline elements — protective/luck motifs (חמסה, מגן דוד, עין), wedding-ceremony
  // specifics (חופה, כוס לשבירה, נר יחוד), more heart+curl variants, and assorted event/blessing
  // symbols (רימון, זית, מצלמה, עוגת שכבות…).
  { id: "hamsa-outline", label: "חמסה", category: "symbols", svg: svg(`<path d="M30,58 Q28,80 40,92 Q50,98 60,92 Q72,80 70,58 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M30,58 Q14,54 12,42 Q10,34 18,34 Q26,34 28,44 Q30,50 30,58" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M70,58 Q86,54 88,42 Q90,34 82,34 Q74,34 72,44 Q70,50 70,58" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="45" y="6" width="10" height="40" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="30" y="14" width="9" height="34" rx="4.5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-8 34.5 31)"/><rect x="61" y="14" width="9" height="34" rx="4.5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(8 65.5 31)"/><circle cx="50" cy="72" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "hamsa-heart-outline", label: "חמסה עם לב", category: "symbols", svg: svg(`<path d="M30,58 Q28,80 40,92 Q50,98 60,92 Q72,80 70,58 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M30,58 Q14,54 12,42 Q10,34 18,34 Q26,34 28,44 Q30,50 30,58" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M70,58 Q86,54 88,42 Q90,34 82,34 Q74,34 72,44 Q70,50 70,58" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="45" y="6" width="10" height="40" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="30" y="14" width="9" height="34" rx="4.5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-8 34.5 31)"/><rect x="61" y="14" width="9" height="34" rx="4.5" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(8 65.5 31)"/><path d="M50,66 C46,61 41,63 41,68 C41,72 46,75 50,80 C54,75 59,72 59,68 C59,63 54,61 50,66 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "star-of-david-outline", label: "מגן דוד", category: "symbols", svg: svg(`<path d="M50,10 L86,72 L14,72 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M50,90 L14,28 L86,28 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`) },
  { id: "evil-eye-outline", label: "עין להגנה", category: "symbols", svg: svg(`<path d="M8,50 Q50,14 92,50 Q50,86 8,50 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="50" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="50" cy="50" r="8" fill="currentColor"/>`) },
  { id: "diamond-ring-outline", label: "טבעת יהלום", category: "symbols", svg: svg(`<circle cx="50" cy="66" r="24" fill="none" stroke="currentColor" stroke-width="3"/><path d="M38,38 L44,20 L56,20 L62,38 L50,50 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><line x1="44" y1="20" x2="50" y2="34" stroke="currentColor" stroke-width="1.4"/><line x1="56" y1="20" x2="50" y2="34" stroke="currentColor" stroke-width="1.4"/>`) },
  { id: "rings-floral-outline", label: "טבעות ופרח", category: "symbols", svg: svg(`<circle cx="38" cy="56" r="18" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="62" cy="56" r="18" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M50,38 Q44,28 50,20 Q56,28 50,38 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M40,30 Q34,24 38,16" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M60,30 Q66,24 62,16" fill="none" stroke="currentColor" stroke-width="1.4"/>`) },
  { id: "heart-double-curl-outline", label: "לב עם קווים מסולסלים", category: "symbols", svg: svg(`<path d="M50,82 C26,63 16,47 16,33 C16,20 27,13 37,13 C43,13 47,16 50,23 C53,16 57,13 63,13 C73,13 84,20 84,33 C84,47 74,63 50,82 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M20,24 Q6,20 8,4 Q22,6 20,20" fill="none" stroke="currentColor" stroke-width="2"/><path d="M80,24 Q94,20 92,4 Q78,6 80,20" fill="none" stroke="currentColor" stroke-width="2"/><path d="M50,82 Q40,92 26,88 Q34,80 44,84" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M50,82 Q60,92 74,88 Q66,80 56,84" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "heart-monogram-outline", label: "לב מונוגרם", category: "symbols", svg: svg(`<path d="M50,88 C24,66 12,48 12,32 C12,17 25,8 37,8 C44,8 48,12 50,20 C52,12 56,8 63,8 C75,8 88,17 88,32 C88,48 76,66 50,88 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M32,40 Q50,20 68,40 Q50,60 32,40 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "heart-ribbon-tied-outline", label: "לב קשור בסרט", category: "symbols", svg: svg(`<path d="M50,86 C26,66 16,49 16,35 C16,21 27,14 37,14 C43,14 47,17 50,24 C53,17 57,14 63,14 C73,14 84,21 84,35 C84,49 74,66 50,86 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M50,30 L34,18 C30,24 30,34 34,38 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M50,30 L66,18 C70,24 70,34 66,38 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="50" cy="30" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "chuppah-outline", label: "חופה", category: "symbols", svg: svg(`<line x1="14" y1="30" x2="14" y2="86" stroke="currentColor" stroke-width="2.4"/><line x1="86" y1="30" x2="86" y2="86" stroke="currentColor" stroke-width="2.4"/><line x1="34" y1="20" x2="34" y2="86" stroke="currentColor" stroke-width="2"/><line x1="66" y1="20" x2="66" y2="86" stroke="currentColor" stroke-width="2"/><path d="M10,28 Q50,10 90,28" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M14,30 Q50,44 86,30" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "breaking-glass-outline", label: "כוס לשבירה", category: "symbols", svg: svg(`<path d="M36,10 L64,10 C64,30 56,36 50,36 C44,36 36,30 36,10 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="50" y1="36" x2="50" y2="54" stroke="currentColor" stroke-width="2.2"/><path d="M30,58 L40,64 L34,72 L46,70 L42,80 L54,68 L50,80 L62,70 L58,62 L70,58" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`) },
  { id: "unity-candle-outline", label: "נר יחוד", category: "symbols", svg: svg(`<rect x="46" y="30" width="8" height="56" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M50,30 Q56,20 50,12 Q44,20 50,30 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="22" y="48" width="7" height="38" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M25.5,48 Q30,40 25.5,34 Q21,40 25.5,48 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="71" y="48" width="7" height="38" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M74.5,48 Q79,40 74.5,34 Q70,40 74.5,48 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "ring-pillow-outline", label: "כרית טבעות", category: "symbols", svg: svg(`<path d="M18,50 Q10,50 12,62 L16,80 Q18,88 26,88 L74,88 Q82,88 84,80 L88,62 Q90,50 82,50 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="50" cy="58" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M18,50 L10,38 M82,50 L90,38" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "pomegranate-outline", label: "רימון", category: "symbols", svg: svg(`<path d="M50,26 C68,26 76,42 76,58 C76,76 64,90 50,90 C36,90 24,76 24,58 C24,42 32,26 50,26 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M42,26 L38,12 L46,18 L50,8 L54,18 L62,12 L58,26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="42" cy="52" r="2.2" fill="currentColor"/><circle cx="56" cy="50" r="2.2" fill="currentColor"/><circle cx="50" cy="64" r="2.2" fill="currentColor"/><circle cx="38" cy="68" r="2.2" fill="currentColor"/><circle cx="62" cy="66" r="2.2" fill="currentColor"/>`) },
  { id: "olive-branch-outline", label: "ענף זית", category: "symbols", svg: svg(`<path d="M12,86 Q40,60 88,16" fill="none" stroke="currentColor" stroke-width="2.2"/><g fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="30" cy="66" rx="9" ry="4" transform="rotate(-30 30 66)"/><ellipse cx="44" cy="52" rx="9" ry="4" transform="rotate(-30 44 52)"/><ellipse cx="58" cy="38" rx="9" ry="4" transform="rotate(-30 58 38)"/><ellipse cx="72" cy="24" rx="9" ry="4" transform="rotate(-30 72 24)"/></g><circle cx="22" cy="78" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="34" cy="74" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/>`) },
  { id: "mandala-outline", label: "מנדלה", category: "symbols", svg: svg(`<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" stroke-width="1.4"/><g stroke="currentColor" stroke-width="1.4"><line x1="50" y1="10" x2="50" y2="24"/><line x1="50" y1="76" x2="50" y2="90"/><line x1="10" y1="50" x2="24" y2="50"/><line x1="76" y1="50" x2="90" y2="50"/><line x1="22" y1="22" x2="31" y2="31"/><line x1="69" y1="69" x2="78" y2="78"/><line x1="78" y1="22" x2="69" y2="31"/><line x1="31" y1="69" x2="22" y2="78"/></g>`) },
  { id: "wedding-arch-flowers-outline", label: "קשת פרחים לחתונה", category: "symbols", svg: svg(`<path d="M14,88 L14,50 Q14,10 50,10 Q86,10 86,50 L86,88" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="18" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="30" cy="18" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="50" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="70" cy="18" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="82" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "hourglass-outline", label: "שעון חול", category: "symbols", svg: svg(`<path d="M28,14 L72,14 L72,20 L54,50 L72,80 L72,86 L28,86 L28,80 L46,50 L28,20 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><line x1="28" y1="14" x2="72" y2="14" stroke="currentColor" stroke-width="3"/><line x1="28" y1="86" x2="72" y2="86" stroke="currentColor" stroke-width="3"/>`) },
  { id: "camera-outline", label: "מצלמה", category: "symbols", svg: svg(`<rect x="12" y="30" width="76" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M36,30 L42,18 L58,18 L64,30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="50" cy="56" r="16" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="74" cy="40" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "vintage-key-house-outline", label: "מפתח בית", category: "symbols", svg: svg(`<circle cx="26" cy="26" r="14" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M26,40 L26,80" stroke="currentColor" stroke-width="2.4"/><path d="M26,64 L36,64 M26,72 L34,72" stroke="currentColor" stroke-width="2.2"/><path d="M14,20 L20,14 L26,20 L32,14 L38,20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`) },
  { id: "invitation-card-outline", label: "כרטיס הזמנה", category: "symbols", svg: svg(`<rect x="14" y="20" width="72" height="52" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="26" y1="34" x2="62" y2="34" stroke="currentColor" stroke-width="1.6"/><line x1="26" y1="44" x2="54" y2="44" stroke="currentColor" stroke-width="1.6"/><circle cx="70" cy="52" r="12" fill="none" stroke="currentColor" stroke-width="2"/><path d="M70,48 C67,45 63,46 63,50 C63,53 67,55 70,58 C73,55 77,53 77,50 C77,46 73,45 70,48 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>`) },
  { id: "music-notes-outline", label: "תווי מוזיקה", category: "symbols", svg: svg(`<circle cx="24" cy="76" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="32" y1="76" x2="32" y2="24" stroke="currentColor" stroke-width="2.2"/><path d="M32,24 L64,32 L64,48" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="56" cy="56" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="64" y1="56" x2="64" y2="32" stroke="currentColor" stroke-width="2.2"/>`) },
  { id: "dancing-couple-outline", label: "זוג רוקד", category: "symbols", svg: svg(`<circle cx="34" cy="18" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M34,26 L34,54 M34,54 L22,80 M34,54 L44,78 M34,32 L18,44 M34,32 L52,40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="70" cy="14" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M70,22 L70,50 M70,50 L58,78 M70,50 L82,74 M70,28 L52,40 M70,28 L86,36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`) },
  { id: "wedding-cake-tiered-outline", label: "עוגת חתונה מרובדת", category: "symbols", svg: svg(`<rect x="30" y="66" width="40" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="35" y="46" width="30" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="40" y="28" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="50" y1="28" x2="50" y2="18" stroke="currentColor" stroke-width="2"/><path d="M50,18 Q54,10 50,4 Q46,10 50,18 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "toast-clink-outline", label: "כוסות לחיים", category: "symbols", svg: svg(`<path d="M20,14 L40,14 C40,30 34,36 30,36 C26,36 20,30 20,14 Z" fill="none" stroke="currentColor" stroke-width="2.2" transform="rotate(-18 30 25)"/><line x1="30" y1="36" x2="30" y2="60" stroke="currentColor" stroke-width="2.2" transform="rotate(-18 30 25)"/><path d="M60,14 L80,14 C80,30 74,36 70,36 C66,36 60,30 60,14 Z" fill="none" stroke="currentColor" stroke-width="2.2" transform="rotate(18 70 25)"/><line x1="70" y1="36" x2="70" y2="60" stroke="currentColor" stroke-width="2.2" transform="rotate(18 70 25)"/>`) },
  { id: "heart-lock-outline", label: "מנעול לב", category: "symbols", svg: svg(`<path d="M50,50 C34,50 30,60 30,68 L30,82 C30,88 36,92 50,92 C64,92 70,88 70,82 L70,68 C70,60 66,50 50,50 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M38,50 L38,36 C38,26 43,20 50,20 C57,20 62,26 62,36 L62,50" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="50" cy="68" r="5" fill="none" stroke="currentColor" stroke-width="2"/>`) },
  { id: "birdcage-open-outline", label: "כלוב ציפורים פתוח", category: "symbols", svg: svg(`<path d="M30,86 L30,40 Q30,16 50,16 Q70,16 70,40 L70,86" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="24" y1="86" x2="76" y2="86" stroke="currentColor" stroke-width="2.4"/><line x1="50" y1="16" x2="50" y2="6" stroke="currentColor" stroke-width="1.8"/><path d="M38,50 Q30,50 30,60" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M78,30 Q86,26 84,34 Q90,32 86,38 Q80,40 78,34 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "paper-plane-heart-outline", label: "מטוס נייר עם לב", category: "symbols", svg: svg(`<path d="M8,50 L92,20 L58,88 L48,58 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M48,58 L92,20 L38,66" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M70,12 C67,8 62,10 62,14 C62,18 67,21 70,25 C73,21 78,18 78,14 C78,10 73,8 70,12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
  { id: "floral-monogram-frame-outline", label: "מסגרת עגולה עם עלים", category: "symbols", svg: svg(`<circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="2.2"/><g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="50" cy="14" rx="6" ry="3"/><ellipse cx="50" cy="86" rx="6" ry="3"/><ellipse cx="14" cy="50" rx="3" ry="6"/><ellipse cx="86" cy="50" rx="3" ry="6"/></g>`) },
  { id: "curly-divider-heart-outline", label: "פס מסולסל עם לב", category: "symbols", svg: svg(`<path d="M4,50 Q20,36 30,50 Q40,64 44,50" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M96,50 Q80,36 70,50 Q60,64 56,50" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M50,46 C47,42 43,44 43,47 C43,50 47,52 50,56 C53,52 57,50 57,47 C57,44 53,42 50,46 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>`) },
];

export const ALBUM_ORNAMENTS: AlbumOrnament[] = [...FLORAL, ...GEOMETRIC, ...VINTAGE, ...SYMBOLS];

// The "symbols" category (hearts/stars/etc.) is deliberately NOT in this list — it's used by the
// magnet-frame design tool's own tab config (MagnetFrameEditor.tsx), not the album editor's
// ornament picker, which stays exactly as it was (unrequested UI changes to an already-shipped,
// unrelated tool aren't worth the surface-area risk).
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

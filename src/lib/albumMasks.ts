// 50 photo mask effects for the album editor's "מסכות" tool. Every mask is a single self-contained
// SVG string (viewBox 0-100, white shapes/gradients on a transparent background, using opacity —
// never color luminance — to encode "how visible") so the exact same string can be used two ways
// without any duplicated logic:
//  - live preview: set directly as the photo <img>'s CSS mask-image (data URI), mask-type "alpha".
//  - export (JPG/PSD/PDF): rasterized via sharp to a WxH PNG and composited onto the photo buffer
//    with a "dest-in" blend, so the exported file matches the on-screen preview exactly.
// Shapes are authored in a 100x100 square and stretched to fill whatever frame they're dropped on
// (mask-size/resize: 100% 100%) — a "circle" becomes an ellipse in a non-square frame, matching how
// shape-based image masking behaves in most design tools by default.

export type AlbumMask = { id: string; label: string; svg: string };

// The exact same SVG string used server-side (rasterized by sharp for exports) works here directly
// as a CSS mask-image data URI — no separate "preview version" of each mask to keep in sync.
export function maskCssUrl(svgString: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svgString)}")`;
}

export function findMask(maskId: string | undefined): AlbumMask | undefined {
  return maskId ? ALBUM_MASKS.find((m) => m.id === maskId) : undefined;
}

function svg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`;
}

// A linear fade along one axis. `angle` is 0 (left→right) or 90 (top→bottom) — both are exact
// under non-uniform stretch since they're pure axis rotations of a square gradient space, unlike
// diagonals (which drift slightly when stretched to a non-square frame — an acceptable look here,
// not a precision tool).
function linearFade(stops: { offset: number; opacity: number }[], angle: 0 | 90 | 45 | 135 = 0): string {
  const stopsXml = stops.map((s) => `<stop offset="${s.offset}%" stop-color="#fff" stop-opacity="${s.opacity}"/>`).join("");
  return svg(
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${angle} 50 50)">${stopsXml}</linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}

function fadeRight(pct: number): string {
  return linearFade([{ offset: 0, opacity: 1 }, { offset: 100 - pct, opacity: 1 }, { offset: 100, opacity: 0 }]);
}
function fadeLeft(pct: number): string {
  return linearFade([{ offset: 0, opacity: 0 }, { offset: pct, opacity: 1 }, { offset: 100, opacity: 1 }]);
}
function fadeBothSides(pct: number): string {
  return linearFade([
    { offset: 0, opacity: 0 },
    { offset: pct, opacity: 1 },
    { offset: 100 - pct, opacity: 1 },
    { offset: 100, opacity: 0 },
  ]);
}
function fadeTop(pct: number): string {
  return linearFade([{ offset: 0, opacity: 0 }, { offset: pct, opacity: 1 }, { offset: 100, opacity: 1 }], 90);
}
function fadeBottom(pct: number): string {
  return linearFade([{ offset: 0, opacity: 1 }, { offset: 100 - pct, opacity: 1 }, { offset: 100, opacity: 0 }], 90);
}
function fadeTopAndBottom(pct: number): string {
  return linearFade(
    [
      { offset: 0, opacity: 0 },
      { offset: pct, opacity: 1 },
      { offset: 100 - pct, opacity: 1 },
      { offset: 100, opacity: 0 },
    ],
    90
  );
}
function diagonalFade(reverse: boolean): string {
  return linearFade([{ offset: 0, opacity: reverse ? 0 : 1 }, { offset: 100, opacity: reverse ? 1 : 0 }], reverse ? 135 : 45);
}

function radialVignette(innerStop: number, outerStop: number): string {
  return svg(
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="${innerStop}%" stop-color="#fff" stop-opacity="1"/><stop offset="${outerStop}%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function invertedVignette(): string {
  return svg(
    `<defs><radialGradient id="g" cx="50%" cy="50%" r="65%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="55%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#fff" stop-opacity="1"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function cornerFade(cx: number, cy: number): string {
  return svg(
    `<defs><radialGradient id="g" cx="${cx}%" cy="${cy}%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="60%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#fff" stop-opacity="1"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`
  );
}
function softRectVignette(): string {
  return svg(
    `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs><rect x="8" y="8" width="84" height="84" fill="#fff" filter="url(#b)"/>`
  );
}
function roundedCorners(r: number): string {
  return svg(`<rect x="0" y="0" width="100" height="100" rx="${r}" ry="${r}" fill="#fff"/>`);
}

function ellipseShape(rx: number, ry: number): string {
  return svg(`<ellipse cx="50" cy="50" rx="${rx}" ry="${ry}" fill="#fff"/>`);
}

function starPoints(spikes: number, outerR: number, innerR: number, rotDeg = -90): string {
  const pts: string[] = [];
  const step = Math.PI / spikes;
  let angle = (rotDeg * Math.PI) / 180;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`);
    angle += step;
  }
  return pts.join(" ");
}
function starShape(spikes: number, outerR: number, innerR: number): string {
  return svg(`<polygon points="${starPoints(spikes, outerR, innerR)}" fill="#fff"/>`);
}

function polygonPoints(sides: number, r: number, rotDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = ((rotDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(`${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}
function polygonShape(sides: number, r: number, rotDeg = -90): string {
  return svg(`<polygon points="${polygonPoints(sides, r, rotDeg)}" fill="#fff"/>`);
}

function pathShape(d: string): string {
  return svg(`<path d="${d}" fill="#fff"/>`);
}

function pattern(width: number, height: number, inner: string): string {
  return svg(
    `<defs><pattern id="p" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${inner}</pattern></defs><rect width="100" height="100" fill="url(#p)"/>`
  );
}
function bandedFade(bandOpacities: number[], angle: 0 | 90 | 45 | 135): string {
  const n = bandOpacities.length;
  const stops: { offset: number; opacity: number }[] = [];
  bandOpacities.forEach((op, i) => {
    const start = (i / n) * 100;
    const end = ((i + 1) / n) * 100;
    stops.push({ offset: start, opacity: op }, { offset: end - 1.5, opacity: op }, { offset: end, opacity: bandOpacities[i + 1] ?? op });
  });
  return linearFade(stops, angle);
}

export const ALBUM_MASKS: AlbumMask[] = [
  // The 5 required directional fades.
  { id: "fade-right-25", label: "דהייה ימינה 25%", svg: fadeRight(25) },
  { id: "fade-left-25", label: "דהייה שמאלה 25%", svg: fadeLeft(25) },
  { id: "fade-right-40", label: "דהייה ימינה 40%", svg: fadeRight(40) },
  { id: "fade-left-40", label: "דהייה שמאלה 40%", svg: fadeLeft(40) },
  { id: "fade-both-15", label: "דהייה משני הצדדים 15%", svg: fadeBothSides(15) },

  // More directional fades.
  { id: "fade-top-25", label: "דהייה למעלה 25%", svg: fadeTop(25) },
  { id: "fade-bottom-25", label: "דהייה למטה 25%", svg: fadeBottom(25) },
  { id: "fade-top-40", label: "דהייה למעלה 40%", svg: fadeTop(40) },
  { id: "fade-bottom-40", label: "דהייה למטה 40%", svg: fadeBottom(40) },
  { id: "fade-vert-15", label: "דהייה מלמעלה ומלמטה 15%", svg: fadeTopAndBottom(15) },
  { id: "fade-diag-1", label: "דהייה אלכסונית", svg: diagonalFade(false) },
  { id: "fade-diag-2", label: "דהייה אלכסונית הפוכה", svg: diagonalFade(true) },
  { id: "vignette-soft", label: "ויניאט עגול רך", svg: radialVignette(35, 75) },
  { id: "vignette-hard", label: "ויניאט עגול חד", svg: radialVignette(62, 68) },
  { id: "vignette-rect", label: "ויניאט מרובע רך", svg: softRectVignette() },
  { id: "vignette-inverted", label: "דהייה מהמרכז החוצה", svg: invertedVignette() },
  { id: "corner-fade-tl", label: "פינה שמאלית-עליונה דוהה", svg: cornerFade(0, 0) },
  { id: "corner-fade-br", label: "פינה ימנית-תחתונה דוהה", svg: cornerFade(100, 100) },
  { id: "rounded-corners-soft", label: "פינות מעוגלות עדינות", svg: roundedCorners(10) },
  { id: "rounded-corners-strong", label: "פינות מעוגלות בולטות", svg: roundedCorners(28) },

  // Shape crops.
  { id: "shape-circle", label: "עיגול", svg: ellipseShape(46, 46) },
  { id: "shape-ellipse", label: "אליפסה", svg: ellipseShape(48, 32) },
  { id: "shape-star-5", label: "כוכב 5 קודקודים", svg: starShape(5, 46, 18) },
  { id: "shape-star-6", label: "כוכב 6 קודקודים", svg: starShape(6, 46, 24) },
  { id: "shape-star-8", label: "כוכב 8 קודקודים", svg: starShape(8, 46, 30) },
  { id: "shape-hexagon", label: "משושה", svg: polygonShape(6, 46) },
  { id: "shape-diamond", label: "מעוין", svg: polygonShape(4, 48) },
  { id: "shape-triangle", label: "משולש", svg: polygonShape(3, 50, -90) },
  { id: "shape-pentagon", label: "מחומש", svg: polygonShape(5, 46) },
  {
    id: "shape-heart",
    label: "לב",
    svg: pathShape("M50,90 C20,68 5,46 5,28 C5,12 20,2 35,10 C42,14 47,20 50,28 C53,20 58,14 65,10 C80,2 95,12 95,28 C95,46 80,68 50,90 Z"),
  },
  {
    id: "shape-drop",
    label: "טיפה",
    svg: pathShape("M50,8 C70,34 85,54 85,70 A35,35 0 1 1 15,70 C15,54 30,34 50,8 Z"),
  },
  {
    id: "shape-cloud",
    label: "ענן",
    svg: svg(
      `<ellipse cx="50" cy="62" rx="38" ry="18" fill="#fff"/><circle cx="28" cy="46" r="17" fill="#fff"/><circle cx="52" cy="38" r="21" fill="#fff"/><circle cx="74" cy="47" r="16" fill="#fff"/>`
    ),
  },
  {
    id: "shape-arrow",
    label: "חץ",
    svg: pathShape("M8,38 L55,38 L55,15 L92,50 L55,85 L55,62 L8,62 Z"),
  },
  {
    id: "shape-splash",
    label: "רסס",
    svg: pathShape("M50,4 C76,4 96,25 93,50 C91,73 70,96 44,92 C19,89 4,66 7,40 C9,18 27,4 50,4 Z"),
  },
  {
    id: "shape-ribbon",
    label: "סרט",
    svg: pathShape("M5,18 L95,18 L95,52 L50,80 L5,52 Z"),
  },
  {
    id: "shape-torn",
    label: "קצה קרוע",
    svg: pathShape("M0,14 L9,7 L17,17 L25,5 L33,15 L41,8 L49,18 L57,6 L65,16 L73,9 L81,19 L89,7 L100,14 L100,100 L0,100 Z"),
  },
  {
    id: "shape-leaf",
    label: "עלה",
    svg: pathShape("M14,86 C14,44 44,14 86,14 C86,56 56,86 14,86 Z"),
  },
  {
    id: "shape-shield",
    label: "מגן",
    svg: pathShape("M50,4 L90,18 L90,48 C90,74 70,90 50,96 C30,90 10,74 10,48 L10,18 Z"),
  },
  {
    id: "shape-butterfly",
    label: "פרפר",
    svg: svg(
      `<ellipse cx="30" cy="35" rx="23" ry="17" fill="#fff" transform="rotate(-20 30 35)"/><ellipse cx="70" cy="35" rx="23" ry="17" fill="#fff" transform="rotate(20 70 35)"/><ellipse cx="32" cy="63" rx="16" ry="13" fill="#fff" transform="rotate(-15 32 63)"/><ellipse cx="68" cy="63" rx="16" ry="13" fill="#fff" transform="rotate(15 68 63)"/><rect x="46" y="18" width="8" height="68" rx="4" fill="#fff"/>`
    ),
  },
  {
    id: "shape-rounded-square",
    label: "ריבוע מעוגל",
    svg: svg(`<rect x="6" y="6" width="88" height="88" rx="22" ry="22" fill="#fff"/>`),
  },
  {
    id: "shape-octagon",
    label: "תמנית",
    svg: polygonShape(8, 46, -90),
  },

  // Pattern masks.
  { id: "pattern-vstripes", label: "פסים אנכיים", svg: pattern(10, 100, `<rect x="0" y="0" width="5" height="100" fill="#fff"/>`) },
  { id: "pattern-hstripes", label: "פסים אופקיים", svg: pattern(100, 10, `<rect x="0" y="0" width="100" height="5" fill="#fff"/>`) },
  {
    id: "pattern-diagstripes",
    label: "פסים אלכסוניים",
    svg: svg(
      `<defs><pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect x="0" y="0" width="7" height="14" fill="#fff"/></pattern></defs><rect width="140" height="140" x="-20" y="-20" fill="url(#p)"/>`
    ),
  },
  { id: "pattern-dots", label: "רשת נקודות", svg: pattern(13, 13, `<circle cx="6.5" cy="6.5" r="4.2" fill="#fff"/>`) },
  {
    id: "pattern-checker",
    label: "שחמט",
    svg: pattern(20, 20, `<rect x="0" y="0" width="10" height="10" fill="#fff"/><rect x="10" y="10" width="10" height="10" fill="#fff"/>`),
  },
  {
    id: "pattern-waves",
    label: "גלים",
    svg: pattern(40, 20, `<path d="M0,10 Q10,0 20,10 T40,10" stroke="#fff" stroke-width="8" fill="none"/>`),
  },
  {
    id: "pattern-zigzag",
    label: "זיגזג",
    svg: pattern(20, 20, `<path d="M0,20 L10,2 L20,20" stroke="#fff" stroke-width="6" fill="none"/>`),
  },

  // "Echo"-style banded fades — a stepped, repeating opacity pattern that reads as a layered/ghost-
  // trail effect without needing separate offset copies of the photo.
  { id: "echo-diagonal", label: "הד מדורג אלכסוני", svg: bandedFade([1, 0.7, 0.4, 0.15], 45) },
  { id: "echo-horizontal", label: "הד מדורג אופקי", svg: bandedFade([1, 0.65, 0.35, 0.12], 0) },
  { id: "echo-vertical", label: "הד מדורג אנכי", svg: bandedFade([1, 0.65, 0.35, 0.12], 90) },
  { id: "echo-center-out", label: "הד מהמרכז החוצה", svg: radialVignette(20, 95) },
];

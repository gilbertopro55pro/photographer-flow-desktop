import { writePsd, writePsdBuffer, type Layer } from "ag-psd";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { ALBUM_MASKS } from "./albumMasks.js";
import { applyAdjustmentsToRgba, hasAdjustments, type PhotoAdjustments } from "./albumAdjustments.js";
import { sharpSharpenOptions } from "./albumSharpen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "../public/fonts");

// A shared cap so a blur % looks the same here as in the web editor/preview — mirrors
// ALBUM_BLUR_MAX_PX in AlbumSpreadCanvasEditor.tsx and albumRaster.ts on the web app.
const ALBUM_BLUR_MAX_PX = 40;

// Same DPI convention as src/pxFromCm.ts (the renderer-side conversion the caller already used to
// compute widthPx/heightPx) — used here only to stamp the PSD's own resolution metadata to match,
// since ag-psd doesn't infer it from pixel count on its own.
const DPI = 300;

function solidFill(width: number, height: number, r: number, g: number, b: number, a = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

export async function writeTestPsd(savePath: string): Promise<void> {
  const width = 1200;
  const height = 1200;
  const psd = {
    width,
    height,
    children: [
      { name: "רקע", imageData: solidFill(width, height, 245, 240, 230) },
      { name: "מלבן בדיקה", left: 200, top: 200, imageData: solidFill(400, 400, 224, 122, 95) },
      { name: "מלבן בדיקה 2", left: 600, top: 600, imageData: solidFill(350, 350, 63, 107, 82) },
    ],
  };
  const buffer = writePsd(psd);
  await fs.writeFile(savePath, Buffer.from(buffer));
}

// --- Fonts (mirrors src/lib/albumFontFiles.ts on the web app — duplicated here rather than
// cross-imported, since electron/ compiles as its own separate tsc project from src/) ---

type FontCategory = "hebrew" | "latin";
const FONT_DEFS: { key: string; category: FontCategory; file: string }[] = [
  { key: "heebo", category: "hebrew", file: "Heebo-Hebrew-Bold.ttf" },
  { key: "rubik", category: "hebrew", file: "Rubik-Hebrew.ttf" },
  { key: "assistant", category: "hebrew", file: "Assistant-Hebrew.ttf" },
  { key: "frank-ruhl-libre", category: "hebrew", file: "FrankRuhlLibre-Hebrew.ttf" },
  { key: "david-libre", category: "hebrew", file: "DavidLibre-Hebrew.ttf" },
  { key: "secular-one", category: "hebrew", file: "SecularOne-Hebrew.ttf" },
  { key: "suez-one", category: "hebrew", file: "SuezOne-Hebrew.ttf" },
  { key: "alef", category: "hebrew", file: "Alef-Hebrew.ttf" },
  { key: "miriam-libre", category: "hebrew", file: "MiriamLibre-Hebrew.ttf" },
  { key: "noto-sans-hebrew", category: "hebrew", file: "NotoSansHebrew-Hebrew.ttf" },
  { key: "montserrat", category: "latin", file: "Montserrat-Latin.ttf" },
  { key: "playfair-display", category: "latin", file: "PlayfairDisplay-Latin.ttf" },
  { key: "lora", category: "latin", file: "Lora-Latin.ttf" },
  { key: "poppins", category: "latin", file: "Poppins-Latin.ttf" },
  { key: "merriweather", category: "latin", file: "Merriweather-Latin.ttf" },
  { key: "dancing-script", category: "latin", file: "DancingScript-Latin.ttf" },
  { key: "great-vibes", category: "latin", file: "GreatVibes-Latin.ttf" },
  { key: "pacifico", category: "latin", file: "Pacifico-Latin.ttf" },
  { key: "caveat", category: "latin", file: "Caveat-Latin.ttf" },
  { key: "sacramento", category: "latin", file: "Sacramento-Latin.ttf" },
];
const FALLBACK_HEBREW_FILE = "Heebo-Hebrew-Bold.ttf";
const FALLBACK_LATIN_FILE = "Heebo-Latin-Bold.ttf";

function getAlbumFontFiles(key: string | undefined): { hebrewFile: string; latinFile: string } {
  const def = FONT_DEFS.find((d) => d.key === key) ?? FONT_DEFS[0];
  return {
    hebrewFile: def.category === "hebrew" ? def.file : FALLBACK_HEBREW_FILE,
    latinFile: def.category === "latin" ? def.file : FALLBACK_LATIN_FILE,
  };
}

// Text is rendered as raw glyph-outline SVG paths via fontkit (not an SVG <text> + @font-face) —
// mirrors the web app's albumRaster.ts exactly, same rationale: sidesteps sharp/librsvg's text
// shaping (Pango/HarfBuzz + fontconfig) entirely, which is finicky to get right across platforms.
const fontkitFontCache = new Map<string, ReturnType<typeof fontkit.create>>();
async function loadFontkitFont(file: string): Promise<ReturnType<typeof fontkit.create>> {
  const cached = fontkitFontCache.get(file);
  if (cached) return cached;
  const buf = await fs.readFile(path.join(FONTS_DIR, file));
  const font = fontkit.create(buf);
  fontkitFontCache.set(file, font);
  return font;
}

// Ported from the web app's src/lib/pdfText.ts (splitRuns/segmentsByGlyphCoverage/
// splitBoundaryNeutrals) — this desktop copy used to reverse the CHARACTERS within each Hebrew run
// (`[...r.text].reverse()`), which is exactly the bug that file's own comment warns against:
// fontkit already shapes a same-font Hebrew run correctly on its own, so reversing the characters
// ourselves just scrambles the word (confirmed live: real Hebrew text came out backwards in the
// exported PSD). The correct approach only reverses the ORDER of same-direction runs relative to
// each other — each run's own characters stay in logical (unreversed) order.
const HEBREW_RANGE = /[֐-׿]/;
// Only actual Latin letters and digits force a run to switch to the Latin font — punctuation/
// spaces are bidi-neutral and attach to whichever run they're adjacent to (see splitBoundaryNeutrals).
const LATIN_STRONG_RANGE = /[A-Za-z0-9]/;
type BidiRun = { text: string; rtl: boolean };

function isStrongForDirection(ch: string, rtl: boolean): boolean {
  return rtl ? HEBREW_RANGE.test(ch) : LATIN_STRONG_RANGE.test(ch);
}

function splitBoundaryNeutrals(runs: BidiRun[]): BidiRun[] {
  const result = [...runs];
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].rtl === result[i + 1].rtl) continue;
    let text = result[i].text;
    let migrated = "";
    while (text.length > 0 && !isStrongForDirection(text[text.length - 1], result[i].rtl)) {
      migrated = text[text.length - 1] + migrated;
      text = text.slice(0, -1);
    }
    if (migrated && text) {
      result[i] = { ...result[i], text };
      result.splice(i + 1, 0, { text: [...migrated].reverse().join(""), rtl: false });
      i++;
    }
  }
  return result;
}

function splitBidiRuns(text: string): BidiRun[] {
  const runs: BidiRun[] = [];
  let current = "";
  let currentRtl: boolean | null = null;
  for (const ch of text) {
    const isRtl: boolean = HEBREW_RANGE.test(ch) ? true : LATIN_STRONG_RANGE.test(ch) ? false : (currentRtl ?? HEBREW_RANGE.test(text));
    if (currentRtl === null) currentRtl = isRtl;
    if (isRtl !== currentRtl) {
      runs.push({ text: current, rtl: currentRtl });
      current = "";
      currentRtl = isRtl;
    }
    current += ch;
  }
  if (current) runs.push({ text: current, rtl: currentRtl ?? true });
  return splitBoundaryNeutrals(runs);
}

// A run classified "rtl" can still contain characters the Hebrew font has no glyph for (ASCII
// punctuation like "." ":" "," "%") — those need the Latin font to actually render instead of a
// missing-glyph box. Segments keep their OWN characters in natural order; only the segments
// themselves get reversed relative to each other, mirroring splitBidiRuns' own top-level rule one
// level deeper (see pdfText.ts's segmentsByGlyphCoverage for the fuller rationale).
const HEBREW_FONT_EXTRA_CHARS = new Set([" ", "-"]);
function hebrewFontCovers(ch: string): boolean {
  return HEBREW_RANGE.test(ch) || HEBREW_FONT_EXTRA_CHARS.has(ch);
}
function segmentsByGlyphCoverage(
  text: string,
  hebrewFont: ReturnType<typeof fontkit.create>,
  latinFont: ReturnType<typeof fontkit.create>
): { text: string; font: ReturnType<typeof fontkit.create> }[] {
  const segments: { text: string; font: ReturnType<typeof fontkit.create> }[] = [];
  let current = "";
  let currentFont: ReturnType<typeof fontkit.create> | null = null;
  for (const ch of text) {
    const font = hebrewFontCovers(ch) ? hebrewFont : latinFont;
    if (currentFont === null) currentFont = font;
    if (font !== currentFont) {
      segments.push({ text: current, font: currentFont });
      current = "";
      currentFont = font;
    }
    current += ch;
  }
  if (current && currentFont) segments.push({ text: current, font: currentFont });
  return segments.reverse();
}

async function layoutTextAsSvgPaths(text: string, fontFamily: string | undefined, fontSizePx: number): Promise<{ pathsSvg: string; width: number }> {
  const { hebrewFile, latinFile } = getAlbumFontFiles(fontFamily);
  const [hebrewFont, latinFont] = await Promise.all([loadFontkitFont(hebrewFile), loadFontkitFont(latinFile)]);

  // Runs are reordered right-to-left overall (the last logical run is drawn leftmost, since
  // cursorX below only ever advances rightward), but each run's OWN characters — and each
  // glyph-coverage segment's own characters — stay in logical (unreversed) order.
  const visualRuns = splitBidiRuns(text)
    .reverse()
    .flatMap((r) => (r.rtl ? segmentsByGlyphCoverage(r.text, hebrewFont, latinFont) : [{ text: r.text, font: latinFont }]));

  let cursorX = 0;
  const parts: string[] = [];
  for (const run of visualRuns) {
    if (!run.text) continue;
    const glyphRun = run.font.layout(run.text);
    const scale = fontSizePx / run.font.unitsPerEm;
    for (let i = 0; i < glyphRun.glyphs.length; i++) {
      const glyph = glyphRun.glyphs[i];
      const pos = glyphRun.positions[i];
      const d = glyph.path.toSVG();
      if (d) {
        const gx = cursorX + (pos.xOffset ?? 0) * scale;
        const gy = -(pos.yOffset ?? 0) * scale;
        parts.push(`<path d="${d}" transform="translate(${gx},${gy}) scale(${scale},${-scale})" />`);
      }
      cursorX += pos.xAdvance * scale;
    }
  }
  return { pathsSvg: parts.join(""), width: cursorX };
}

async function svgTextLayer(
  text: string,
  opts: { xPx: number; yPx: number; widthPx: number; fontSizePx: number; color: string; align: "right" | "center" | "left"; pageWidthPx: number; pageHeightPx: number; fontFamily?: string }
): Promise<Buffer> {
  const { pathsSvg, width } = await layoutTextAsSvgPaths(text, opts.fontFamily, opts.fontSizePx);
  const startX = opts.align === "right" ? opts.xPx + opts.widthPx - width : opts.align === "left" ? opts.xPx : opts.xPx + (opts.widthPx - width) / 2;
  const baselineY = opts.yPx + opts.fontSizePx;
  const svg = `<svg width="${opts.pageWidthPx}" height="${opts.pageHeightPx}" xmlns="http://www.w3.org/2000/svg">
<g fill="${opts.color}" transform="translate(${startX},${baselineY})">${pathsSvg}</g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function pngToRawRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// --- Photo compositing (mirrors src/lib/albumRaster.ts) ---

type AlbumPhotoFilter = "none" | "bw" | "sepia" | undefined;

async function applyMaskToRaw(data: Buffer, width: number, height: number, maskId: string): Promise<Buffer> {
  const mask = ALBUM_MASKS.find((m) => m.id === maskId);
  if (!mask) return data;
  const sized = mask.svg.replace("<svg ", `<svg width="${Math.round(width)}" height="${Math.round(height)}" `);
  const maskPng = await sharp(Buffer.from(sized)).ensureAlpha().png().toBuffer();
  return sharp(data, { raw: { width, height, channels: 4 } })
    .composite([{ input: maskPng, blend: "dest-in" }])
    .ensureAlpha()
    .raw()
    .toBuffer();
}

// A geometric shape is a plain solid-color rectangle, optionally clipped by one of the same
// ALBUM_MASKS outlines used on photos (applyMaskToRaw above) and rotated as a whole — mirrors the
// live canvas/preview's CSS mask-image + background-color rendering.
async function composeShapeTile(width: number, height: number, color: string, maskId?: string, rotationDeg?: number): Promise<{ data: Buffer; width: number; height: number; left: number; top: number }> {
  const { r, g, b } = hexToRgb(color);
  const fill = solidFill(width, height, r, g, b, 255);
  let data: Buffer = Buffer.from(fill.data);
  let w = width;
  let h = height;
  if (maskId) {
    data = await applyMaskToRaw(data, w, h, maskId);
  }
  let left = 0;
  let top = 0;
  if (rotationDeg) {
    const rotated = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    left = -(rotated.info.width - w) / 2;
    top = -(rotated.info.height - h) / 2;
    w = rotated.info.width;
    h = rotated.info.height;
    data = rotated.data;
  }
  return { data, width: w, height: h, left, top };
}

async function coverCropRaw(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  focalXPct: number,
  focalYPct: number,
  filter: AlbumPhotoFilter,
  bakeInBw: boolean,
  extra?: { opacity?: number; blur?: number; zoom?: number; adjustments?: PhotoAdjustments; sharpness?: number }
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    let img = sharp(buffer).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const imgAspect = meta.width / meta.height;
    const boxAspect = targetWidth / targetHeight;
    const drawW = imgAspect > boxAspect ? Math.round(targetHeight * imgAspect) : targetWidth;
    const drawH = imgAspect > boxAspect ? targetHeight : Math.round(targetWidth / imgAspect);
    img = img.resize(drawW, drawH);
    if (filter === "sepia") img = img.tint({ r: 112, g: 66, b: 20 });
    else if (filter === "bw" && bakeInBw) img = img.modulate({ saturation: 0 });
    if (extra?.blur) img = img.blur(Math.max(0.3, (extra.blur / 100) * ALBUM_BLUR_MAX_PX));
    // Ported from the web app's own export pipeline (albumRaster.ts) — sharp's own .sharpen()
    // ahead of the raw extract, mirroring the live preview's SVG convolution filter.
    const sharpenOpts = sharpSharpenOptions(extra?.sharpness);
    if (sharpenOpts) img = img.sharpen(sharpenOpts);
    const left = Math.min(Math.max(0, Math.round((drawW - targetWidth) * (focalXPct / 100))), Math.max(0, drawW - targetWidth));
    const top = Math.min(Math.max(0, Math.round((drawH - targetHeight) * (focalYPct / 100))), Math.max(0, drawH - targetHeight));
    let data = await img.extract({ left, top, width: targetWidth, height: targetHeight }).ensureAlpha().raw().toBuffer();

    if (extra?.zoom && extra.zoom !== 100) {
      const zf = extra.zoom / 100;
      const subW = Math.max(1, Math.round(targetWidth / zf));
      const subH = Math.max(1, Math.round(targetHeight / zf));
      const subLeft = Math.round((targetWidth - subW) / 2);
      const subTop = Math.round((targetHeight - subH) / 2);
      data = await sharp(data, { raw: { width: targetWidth, height: targetHeight, channels: 4 } })
        .extract({ left: subLeft, top: subTop, width: subW, height: subH })
        .resize(targetWidth, targetHeight)
        .ensureAlpha()
        .raw()
        .toBuffer();
    }

    // Ported from the web app's own export pipeline — same tone-curve/color-matrix math the live
    // preview's SVG filter uses (see albumAdjustments.ts), applied to the final raw buffer so it
    // matches the already-cropped/zoomed pixels exactly.
    if (extra?.adjustments && hasAdjustments(extra.adjustments)) applyAdjustmentsToRgba(data, extra.adjustments);

    if (extra?.opacity !== undefined && extra.opacity < 100) {
      const factor = Math.max(0, extra.opacity) / 100;
      for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * factor);
    }

    return { data, width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

async function composePhotoTile(
  buffer: Buffer,
  width: number,
  height: number,
  focalX: number,
  focalY: number,
  filter: AlbumPhotoFilter,
  bakeInBw: boolean,
  extra: {
    rotation?: number;
    opacity?: number;
    blur?: number;
    zoom?: number;
    borderWidth?: number;
    borderColor?: string;
    maskId?: string;
    adjustments?: PhotoAdjustments;
    sharpness?: number;
  }
): Promise<{ data: Buffer; width: number; height: number; left: number; top: number } | null> {
  const cropped = await coverCropRaw(buffer, width, height, focalX, focalY, filter, bakeInBw, {
    opacity: extra.opacity,
    blur: extra.blur,
    zoom: extra.zoom,
    adjustments: extra.adjustments,
    sharpness: extra.sharpness,
  });
  if (!cropped) return null;
  let data = cropped.data;
  let w = width;
  let h = height;

  if (extra.borderWidth) {
    const strokeSvg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${extra.borderWidth / 2}" y="${extra.borderWidth / 2}" width="${w - extra.borderWidth}" height="${h - extra.borderWidth}" fill="none" stroke="${extra.borderColor ?? "#ffffff"}" stroke-width="${extra.borderWidth}"/></svg>`;
    data = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: Buffer.from(strokeSvg) }])
      .ensureAlpha()
      .raw()
      .toBuffer();
  }

  if (extra.maskId) {
    data = await applyMaskToRaw(data, w, h, extra.maskId);
  }

  let left = 0;
  let top = 0;
  if (extra.rotation) {
    const rotated = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .rotate(extra.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    left = -(rotated.info.width - w) / 2;
    top = -(rotated.info.height - h) / 2;
    w = rotated.info.width;
    h = rotated.info.height;
    data = rotated.data;
  }
  return { data, width: w, height: h, left, top };
}

async function shadowLayerPng(
  width: number,
  height: number,
  shadowPct: number | undefined,
  frameX: number,
  frameY: number,
  rotationDeg?: number,
  distancePct?: number,
  blurPct?: number
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  if (!shadowPct) return null;
  const blurPx = Math.max(1, ((blurPct ?? shadowPct) / 100) * 24);
  const offsetPx = Math.round(((distancePct ?? shadowPct) / 100) * 10);
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  const pad = Math.ceil(blurPx * 3);
  let canvasW = width + pad * 2;
  let canvasH = height + pad * 2;
  const rectSvg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg"><rect x="${pad}" y="${pad}" width="${width}" height="${height}" fill="rgba(0,0,0,${alpha})"/></svg>`;
  let buffer = await sharp(Buffer.from(rectSvg)).blur(blurPx).png().toBuffer();

  if (rotationDeg) {
    const rotated = await sharp(buffer).rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
    buffer = rotated.data;
    canvasW = rotated.info.width;
    canvasH = rotated.info.height;
  }

  const centerX = frameX + width / 2;
  const centerY = frameY + height / 2;
  let left = Math.round(centerX + offsetPx - canvasW / 2);
  let top = Math.round(centerY + offsetPx - canvasH / 2);
  const cropLeft = Math.max(0, -left);
  const cropTop = Math.max(0, -top);
  if (cropLeft || cropTop) {
    const cropW = canvasW - cropLeft;
    const cropH = canvasH - cropTop;
    if (cropW <= 0 || cropH <= 0) return null;
    buffer = await sharp(buffer).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).png().toBuffer();
    left = Math.max(0, left);
    top = Math.max(0, top);
  }
  return { buffer, left, top };
}

// --- Public export types + entry point ---

export type ExportPhotoElement = {
  kind: "photo";
  name: string;
  imageBytes: Uint8Array;
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  focalX: number;
  focalY: number;
  filter?: "none" | "bw" | "sepia";
  borderWidth?: number;
  borderColor?: string;
  rotation?: number;
  opacity?: number;
  blur?: number;
  shadow?: number;
  shadowDistance?: number;
  shadowBlur?: number;
  zoom?: number;
  maskId?: string;
  // Ported from the web app's own export pipeline — see PhotoAdjustments' own comment.
  adjustments?: PhotoAdjustments;
  sharpness?: number;
};
export type ExportTextElement = {
  kind: "text";
  text: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  fontSizePx: number;
  color: string;
  align: "right" | "center" | "left";
  fontFamily?: string;
};
export type ExportOrnamentElement = {
  kind: "ornament";
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  rotation?: number;
  opacity?: number;
} & ({ svg: string; color: string; imageBytes?: undefined; tintColor?: undefined } | { imageBytes: Uint8Array; svg?: undefined; color?: undefined; tintColor?: string });
export type ExportShapeElement = {
  kind: "shape";
  xPx: number;
  yPx: number;
  wPx: number;
  hPx: number;
  color: string;
  rotation?: number;
  opacity?: number;
  maskId?: string;
};
export type ExportElement = ExportPhotoElement | ExportTextElement | ExportOrnamentElement | ExportShapeElement;
export type ExportBackground = { imageBytes: Uint8Array; blur: number; opacity: number; zoom?: number } | null;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Rasterizes a decorative ornament (a currentColor SVG, or an uploaded raster image) at its
// target pixel size, rotated as a whole — mirrors the live canvas/preview rendering. Procedural
// ornaments arrive already tinted via the SVG's own `style="color:X"`. An uploaded raster ornament
// can optionally be tinted here too (tintColor), by replacing its pixels with a solid color masked
// by its own alpha channel — same technique as the CSS `mask-image`+`background-color` used for
// the live canvas/preview tint.
async function ornamentLayerRaw(source: Buffer, width: number, height: number, rotationDeg?: number, tintColor?: string): Promise<{ data: Buffer; width: number; height: number } | null> {
  let src = source;
  if (tintColor) {
    const meta = await sharp(source).metadata();
    const solid = await sharp({
      create: { width: meta.width ?? width, height: meta.height ?? height, channels: 4, background: { ...hexToRgb(tintColor), alpha: 1 } },
    })
      .png()
      .toBuffer();
    src = await sharp(solid).composite([{ input: source, blend: "dest-in" }]).png().toBuffer();
  }
  let img = sharp(src).resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (rotationDeg) img = img.rotate(rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function writeAlbumPagePsd(savePath: string, widthPx: number, heightPx: number, elements: ExportElement[], background: ExportBackground): Promise<void> {
  const children: Layer[] = [
    {
      name: "רקע",
      top: 0,
      left: 0,
      bottom: heightPx,
      right: widthPx,
      imageData: solidFill(widthPx, heightPx, 255, 255, 255),
    },
  ];

  if (background) {
    const bgCropped = await coverCropRaw(Buffer.from(background.imageBytes), widthPx, heightPx, 50, 50, undefined, false, { blur: background.blur, zoom: background.zoom });
    if (bgCropped) {
      children.push({
        name: "רקע עמוד",
        top: 0,
        left: 0,
        bottom: heightPx,
        right: widthPx,
        opacity: background.opacity / 100,
        imageData: { data: bgCropped.data, width: bgCropped.width, height: bgCropped.height },
      });
    }
  }

  for (const el of elements) {
    if (el.kind === "text") {
      const png = await svgTextLayer(el.text, {
        xPx: el.xPx,
        yPx: el.yPx,
        widthPx: el.widthPx,
        fontSizePx: el.fontSizePx,
        color: el.color,
        align: el.align,
        pageWidthPx: widthPx,
        pageHeightPx: heightPx,
        fontFamily: el.fontFamily,
      });
      const rgba = await pngToRawRgba(png);
      children.push({ name: "טקסט", top: 0, left: 0, bottom: rgba.height, right: rgba.width, imageData: { data: rgba.data, width: rgba.width, height: rgba.height } });
      continue;
    }

    if (el.kind === "ornament") {
      const w = Math.max(1, Math.round(el.wPx));
      const h = Math.max(1, Math.round(el.hPx));
      const source = el.imageBytes !== undefined ? Buffer.from(el.imageBytes) : Buffer.from(el.svg!.replace("<svg ", `<svg style="color:${el.color}" `));
      const rendered = await ornamentLayerRaw(source, w, h, el.rotation, el.tintColor);
      if (!rendered) continue;
      const centerX = el.xPx + w / 2;
      const centerY = el.yPx + h / 2;
      const top = Math.round(centerY - rendered.height / 2);
      const left = Math.round(centerX - rendered.width / 2);
      children.push({
        name: "עיטור",
        top,
        left,
        bottom: top + rendered.height,
        right: left + rendered.width,
        opacity: (el.opacity ?? 100) / 100,
        imageData: { data: rendered.data, width: rendered.width, height: rendered.height },
      });
      continue;
    }

    if (el.kind === "shape") {
      const w = Math.max(1, Math.round(el.wPx));
      const h = Math.max(1, Math.round(el.hPx));
      const frameTop = Math.round(el.yPx);
      const frameLeft = Math.round(el.xPx);
      const tile = await composeShapeTile(w, h, el.color, el.maskId, el.rotation);
      const top = Math.round(frameTop + tile.top);
      const left = Math.round(frameLeft + tile.left);
      children.push({
        name: "צורה",
        top,
        left,
        bottom: top + tile.height,
        right: left + tile.width,
        opacity: (el.opacity ?? 100) / 100,
        imageData: { data: tile.data, width: tile.width, height: tile.height },
      });
      continue;
    }

    const width = Math.max(1, Math.round(el.wPx));
    const height = Math.max(1, Math.round(el.hPx));
    const frameTop = Math.round(el.yPx);
    const frameLeft = Math.round(el.xPx);

    // Border and shadow are baked into raster layers here, NOT live Photoshop Layer Style
    // effects — tried three times now (twice on the web app's own export, once here), every time
    // real Photoshop reported "problems reading layers" and rendered blank pages, even after the
    // field values were checked against a real Photoshop-authored fixture. Don't retry this
    // without new information (e.g. an ag-psd fix upstream).
    const tile = await composePhotoTile(Buffer.from(el.imageBytes), width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false, {
      rotation: el.rotation,
      blur: el.blur,
      zoom: el.zoom,
      borderWidth: el.borderWidth,
      borderColor: el.borderColor,
      maskId: el.maskId,
      adjustments: el.adjustments,
      sharpness: el.sharpness,
    });
    if (!tile) continue;

    const shadow = await shadowLayerPng(width, height, el.shadow, frameLeft, frameTop, el.rotation, el.shadowDistance, el.shadowBlur);
    if (shadow) {
      const shadowRgba = await pngToRawRgba(shadow.buffer);
      children.push({
        name: "צל",
        top: shadow.top,
        left: shadow.left,
        bottom: shadow.top + shadowRgba.height,
        right: shadow.left + shadowRgba.width,
        imageData: { data: shadowRgba.data, width: shadowRgba.width, height: shadowRgba.height },
      });
    }

    const top = Math.round(frameTop + tile.top);
    const left = Math.round(frameLeft + tile.left);
    children.push({
      name: el.name,
      top,
      left,
      bottom: top + tile.height,
      right: left + tile.width,
      opacity: (el.opacity ?? 100) / 100,
      imageData: { data: tile.data, width: tile.width, height: tile.height },
    });
    if (el.filter === "bw") {
      children.push({ name: "שחור-לבן", clipping: true, adjustment: { type: "black & white" } });
    }
  }

  // widthPx/heightPx (pxFromCm.ts) are already computed AT 300 DPI — this only stamps that same
  // number as the file's own metadata, since ag-psd doesn't infer it from pixel count. Without it,
  // Photoshop assumed the usual default (72 PPI) and reported the page's print size as roughly 4x
  // its real physical dimensions in the Image Size dialog, even though the pixel data itself was
  // always genuinely print-resolution.
  const buffer = writePsdBuffer({
    width: widthPx,
    height: heightPx,
    children,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: DPI,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Inches",
        verticalResolution: DPI,
        verticalResolutionUnit: "PPI",
        heightUnit: "Inches",
      },
    },
  });
  await fs.writeFile(savePath, buffer);
}

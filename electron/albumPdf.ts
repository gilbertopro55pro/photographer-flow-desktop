import fs from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  concatTransformationMatrix,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { textColorRgb01, isLightTextColor } from "./textColor.js";
import { drawAlignedBidiText, drawCenteredBidiText } from "./pdfText.js";
import { getAlbumFontFiles } from "./albumFontFiles.js";
import { ALBUM_BLUR_MAX_PX, coverCropRaw, applyMaskToRaw, ornamentLayerRaw, composeShapeTile, type PhotoSource } from "./albumRaster.js";
import { findOrnament } from "./albumOrnaments.js";
import { hasAdjustments, applyAdjustmentsToRgba, type PhotoAdjustments } from "./albumAdjustments.js";
import { sharpSharpenOptions } from "./albumSharpen.js";
import { FONTS_DIR } from "./paths.js";
import type { AlbumPhotoFilter, AlbumTextElement, GalleryAlbumRow, GalleryAlbumSpreadRow } from "./albumTypes.js";

// Thrown between pages when the user cancels — the orchestrator (albumExport.ts) recognizes it and
// reports a clean "cancelled" result instead of a failure.
export class ExportCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "ExportCancelledError";
  }
}

// Module-scope (not per-export) since the same handful of font files back every album regardless
// of which request is rendering it — parsed once per server process, same lifetime rationale as
// albumRaster.ts's own fontkitFontCache.
const hebrewMetricsCache = new Map<string, { ascentRatio: number; descentRatio: number }>();
async function hebrewMetricsFor(fontsDir: string, hebrewFile: string): Promise<{ ascentRatio: number; descentRatio: number }> {
  const cached = hebrewMetricsCache.get(hebrewFile);
  if (cached) return cached;
  const raw = fontkit.create(await fs.readFile(path.join(fontsDir, hebrewFile)));
  const metrics = { ascentRatio: raw.ascent / raw.unitsPerEm, descentRatio: Math.abs(raw.descent) / raw.unitsPerEm };
  hebrewMetricsCache.set(hebrewFile, metrics);
  return metrics;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

// Applied server-side via sharp before the buffer ever reaches pdf-lib — pdf-lib itself has no
// image color-transform primitive, so this is the only way the PDF's B&W/sepia frames actually
// match what the CSS `filter: grayscale()/sepia()` preview shows in the builder and proofing view.
// Always runs (even with no filter/blur at all) because pdf-lib's embedJpg has no concept of EXIF
// orientation — it embeds the raw sensor-orientation pixels as-is — while a plain <img> tag (the
// builder/proofing preview) and the JPG/PSD raster exports (via coverCropRaw's unconditional
// sharp(...).rotate()) both auto-correct for it. Skipping this step whenever a photo had no other
// filter applied (the common case) used to mean the PDF alone could show a photo cover-cropped
// against its wrong (sensor-native) dimensions — visibly different rotation/crop from every other
// surface, for any photo whose camera wrote an EXIF orientation flag.
async function applyPhotoFilter(
  buffer: Buffer,
  filter: AlbumPhotoFilter | undefined,
  blurPct?: number,
  adjustments?: PhotoAdjustments,
  jpegQuality: number = 90,
  sharpness?: number,
  maxPx: number = 3200
): Promise<Buffer> {
  let img = sharp(buffer).rotate(); // .rotate() with no args auto-applies EXIF orientation first
  // Capped BEFORE the rest of the pipeline — the photo is embedded at its FULL pixel dimensions
  // (pdf-lib's own vector clip does the cover-fit crop at DRAW time, not here — see embedByPhotoId's
  // comment), and this is a proof/layout export at PAGE_WIDTH×PAGE_HEIGHT points, not a certified
  // press file. A real camera original can be 20MB+ at 40-60+ megapixels; decoding, filtering, and
  // re-encoding one at FULL resolution for every photo on a page is real, avoidable cost — found
  // 2026-09-01 as the likely cause behind one specific page (5 originals in the 6-22MB range)
  // consistently being the one export batches died on, no matter how the invocation/batching
  // architecture around it was hardened. 3200px comfortably covers even a full-bleed photo at good
  // quality for this page size with real margin to spare.
  img = img.resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true });
  // Sepia = tinted — sharp's tint() already desaturates internally before recoloring, so this is
  // the standard sepia approximation. Chaining an explicit .grayscale() *before* .tint() looks
  // like the obvious way to write it, but empirically neutralizes the tint entirely (confirmed:
  // grayscale().tint() produces pure gray, R=G=B, while tint() alone produces the expected warm
  // tone) — so grayscale must never precede tint in this pipeline.
  if (filter === "sepia") img = img.tint({ r: 112, g: 66, b: 20 });
  else if (filter === "bw") img = img.grayscale();
  // pdf-lib has no blur primitive at all, so this is the only place a blurred photo can come from
  // for the PDF export — baked into the pixels before embedding, same as the filter above.
  if (blurPct) img = img.blur(Math.max(0.3, (blurPct / 100) * ALBUM_BLUR_MAX_PX));
  const sharpenOpts = sharpSharpenOptions(sharpness);
  if (sharpenOpts) img = img.sharpen(sharpenOpts);
  if (adjustments && hasAdjustments(adjustments)) {
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    applyAdjustmentsToRgba(data, adjustments);
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).jpeg({ quality: jpegQuality }).toBuffer();
  }
  return img.jpeg({ quality: jpegQuality }).toBuffer();
}

// One "spread" page in the exported PDF, in points — a landscape rectangle standing in for one
// printed album opening. Not tied to any specific print lab's trim/bleed spec (this app has no
// print vendor integration); it's a proof/layout export, not a certified press-ready file.
const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1000;
const GAP = 8;

async function embedImageAuto(pdfDoc: PDFDocument, buffer: Buffer): Promise<PDFImage | null> {
  // pdf-lib's JPEG/PNG embedders don't respect a Buffer's byteOffset — they end up reading from
  // the start of its underlying (possibly pooled, possibly shared, possibly larger) ArrayBuffer
  // instead of the actual slice, silently misreading unrelated bytes as the image. Buffers coming
  // back from the S3 SDK's byte-array transform aren't guaranteed byteOffset 0, so copy into a
  // fresh, zero-offset Uint8Array before handing it to pdf-lib — confirmed via direct testing that
  // this is what actually fixes it (a same-length "identical" Buffer with a nonzero byteOffset
  // reliably fails with "SOI not found in JPEG" even though its bytes compare equal).
  const clean = new Uint8Array(buffer);
  const isPng = clean.length > 8 && clean[0] === 0x89 && clean[1] === 0x50 && clean[2] === 0x4e && clean[3] === 0x47;
  try {
    return isPng ? await pdfDoc.embedPng(clean) : await pdfDoc.embedJpg(clean);
  } catch {
    return null;
  }
}

// Pushes a rotation transform (CSS convention degrees, positive = clockwise) pivoting around the
// rect's own center — callers draw everything that should visually spin as one rigid piece (clip,
// image, border, shadow) between this and popFrameRotation, all using the rect's ORIGINAL
// (unrotated-local) coordinates; the active transform is what makes them appear rotated in
// absolute page space. This is what makes the border/shadow rotate together with the photo instead
// of only the image content spinning inside a frame that itself stays visually fixed.
function pushFrameRotation(page: PDFPage, rect: { x: number; y: number; width: number; height: number }, rotationDeg: number | undefined) {
  const ops = [pushGraphicsState()];
  if (rotationDeg) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    // PDF's CTM rotation is counter-clockwise for a positive angle in its bottom-up y-axis space —
    // negating the CSS-convention degrees here makes a positive value turn clockwise on screen,
    // same as the CSS `rotate()` used everywhere else this value is applied.
    const rad = (-rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    ops.push(
      concatTransformationMatrix(1, 0, 0, 1, cx, cy),
      concatTransformationMatrix(cos, sin, -sin, cos, 0, 0),
      concatTransformationMatrix(1, 0, 0, 1, -cx, -cy)
    );
  }
  page.pushOperators(...ops);
}
function popFrameRotation(page: PDFPage) {
  page.pushOperators(popGraphicsState());
}

// Places an image "cover-cropped" into a rect, clipped to that rect and aimed at the given focal
// point (0-100 on each axis) — the same crop math as the CSS `object-fit: cover` +
// `object-position` used in the builder and proofing views, so the PDF matches what was approved.
// Any active rotation transform (see pushFrameRotation) must already be pushed by the caller —
// this function only owns its OWN nested clip, which is scoped to just the image draw so a
// border drawn after it (still inside the caller's rotation block) isn't clipped by it.
// `zoom` (100 = cover-fit baseline) is applied to the cover-fit size BEFORE the focal-point
// position is computed — mirroring computePhotoFraming (the canvas editor's own source of truth)
// and coverCropRaw (this file's own JPG-side equivalent). An earlier version here instead
// positioned the plain cover-fit image first and then scaled that already-positioned box around
// the RECT'S OWN CENTER to apply zoom — a fundamentally different operation from "zoom around the
// focal point" that visibly drifted away from whichever edge the photographer pinned (a photo
// focused near the top, at any real zoom, crept downward and lost its top edge). Fixed the same
// way as the web app's own identical bug in its albumPdf.ts, since this file is a hand-duplicated
// copy of it.
function drawCoverImage(
  page: PDFPage,
  image: PDFImage,
  rect: { x: number; y: number; width: number; height: number },
  focalXPct: number,
  focalYPct: number,
  opts?: { opacity?: number; zoom?: number }
) {
  const { x, y, width: w, height: h } = rect;
  const imgAspect = image.width / image.height;
  const boxAspect = w / h;
  let baseW: number;
  let baseH: number;
  if (imgAspect >= boxAspect) {
    baseH = h;
    baseW = h * imgAspect;
  } else {
    baseW = w;
    baseH = w / imgAspect;
  }
  // zoomPct > 100 (not !== 100) matches computePhotoFraming's own guard — zoom is only ever meant
  // to grow past cover-fit, never shrink below it.
  const zf = opts?.zoom && opts.zoom > 100 ? opts.zoom / 100 : 1;
  const drawW = baseW * zf;
  const drawH = baseH * zf;
  const fx = focalXPct / 100;
  const fy = focalYPct / 100;
  const dx = x - (drawW - w) * fx;
  // PDF's y-axis runs bottom-up, while focalY follows the CSS convention (0 = top) — flip it.
  const dy = y - (drawH - h) * (1 - fy);

  page.pushOperators(pushGraphicsState(), moveTo(x, y), lineTo(x + w, y), lineTo(x + w, y + h), lineTo(x, y + h), closePath(), clip(), endPath());
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH, opacity: opts?.opacity });
  page.pushOperators(popGraphicsState());
}

// pdf-lib has no blur primitive, so a true Gaussian-soft shadow (like the CSS box-shadow the
// builder/proofing views use) isn't reproducible here — this fakes softness by stacking a few
// concentric, growing, increasingly-transparent rectangles behind the frame instead of one flat
// one. Offset direction mirrors boxShadowFor's CSS convention (positive = shifts right and down on
// screen), flipped on the y-axis since PDF space runs bottom-up. Draw this INSIDE the caller's
// active rotation block (before the clipped image) so it rotates together with the frame too.
// distancePct/blurPct independently override the offset/spread that would otherwise be derived
// from shadowPct alone — undefined (ornaments/shapes, and every already-saved album) keeps the old
// coupled-to-intensity behavior exactly, matching boxShadowFor's own CSS-side convention.
function drawPhotoShadow(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  shadowPct: number | undefined,
  distancePct?: number,
  blurPct?: number,
  angleDeg?: number
) {
  if (!shadowPct) return;
  const offsetPt = ((distancePct ?? shadowPct) / 100) * 10;
  const maxSpread = ((blurPct ?? shadowPct) / 100) * 24;
  const baseAlpha = 0.15 + (shadowPct / 100) * 0.45;
  const magnitude = offsetPt * Math.SQRT2;
  const angleRad = ((angleDeg ?? 45) * Math.PI) / 180;
  const offsetX = magnitude * Math.cos(angleRad);
  const offsetY = magnitude * Math.sin(angleRad);
  const layers = 4;
  for (let i = layers; i >= 1; i--) {
    const spread = (maxSpread * i) / layers;
    page.drawRectangle({
      x: rect.x - spread + offsetX,
      y: rect.y - spread - offsetY,
      width: rect.width + spread * 2,
      height: rect.height + spread * 2,
      color: rgb(0, 0, 0),
      opacity: (baseAlpha / layers) * 0.9,
    });
  }
}

// `el.fontSize` is points on the album's 1600pt-wide REFERENCE canvas (see the AlbumFontSizePt
// comment in types.ts) — on a normal page (pageWidth === PAGE_WIDTH === 1600) that ratio is
// exactly 1, so `size` reduces to `el.fontSize` unchanged, same as before this took a pageWidth
// param. A custom-sized cover page (see pageW/pageH in the caller) needs the same `/1600 * pageW`
// scaling the canvas editor's own CSS (`calc(fontSize / 1600 * 100cqw)`) and albumRaster.ts's
// `fontSizePx` already apply, so text reads at a consistent relative size across every export
// format regardless of that one page's own physical size.
// Drawn twice — a shadow pass offset by a couple points, then the real text on top — since pdf-lib
// has no text-shadow primitive and a flat color alone can vanish against a busy photo background.
function drawTextElement(
  page: PDFPage,
  el: AlbumTextElement,
  fonts: { hebrewFont: PDFFont; latinFont: PDFFont; hebrewAscentRatio: number; hebrewDescentRatio: number },
  pageWidth: number = PAGE_WIDTH,
  pageHeight: number = PAGE_HEIGHT
) {
  const boxX = (el.xPct / 100) * pageWidth;
  const boxWidth = (el.widthPct / 100) * pageWidth;
  const size = (el.fontSize / 1600) * pageWidth;
  // Box top in PDF's bottom-up y space — heightPct falls back to 15 to match both the editor's own
  // CSS fallback (AlbumSpreadCanvasEditor.tsx) and albumRaster.ts's resolvePageElements, so a
  // legacy element with no heightPct saved centers identically everywhere.
  const boxTopY = pageHeight - (el.yPct / 100) * pageHeight;
  const boxHeight = ((el.heightPct ?? 15) / 100) * pageHeight;
  const ascent = fonts.hebrewAscentRatio * size;
  const descent = fonts.hebrewDescentRatio * size;
  // Center the text's line box within the editor's own box, same "boxTop + H/2 + (ascent-descent)/2
  // below the top" formula as svgTextLayer in albumRaster.ts uses (see its own comment for the
  // derivation) — just flipped for PDF's y-up axis, so "below the top" is a SUBTRACTION here.
  const y = boxTopY - boxHeight / 2 - (ascent - descent) / 2;
  const mainColor = rgb(...textColorRgb01(el.color));
  const shadowColor = isLightTextColor(el.color) ? rgb(0, 0, 0) : rgb(1, 1, 1);
  for (const [dx, dy, color] of [
    [2, -2, shadowColor],
    [0, 0, mainColor],
  ] as const) {
    drawAlignedBidiText(page, el.text, {
      boxX: boxX + dx,
      boxWidth,
      y: y + dy,
      size,
      align: el.align,
      color,
      hebrewFont: fonts.hebrewFont,
      latinFont: fonts.latinFont,
    });
  }
}

export async function generateAlbumPdf({
  album,
  spreads,
  source,
  jpegQuality = 90,
  maxPhotoPx = 3200,
  onPageStart,
  isCancelled,
}: {
  album: GalleryAlbumRow;
  spreads: GalleryAlbumSpreadRow[];
  source: PhotoSource;
  jpegQuality?: number;
  // Longest edge, in pixels, every embedded photo is downscaled to before embedding — the "file
  // size vs. sharpness" dial of the local PDF export (the server pipeline uses a fixed 3200 and a
  // descending quality ladder to hit a size target; locally the photographer just picks a preset).
  maxPhotoPx?: number;
  // Fired as each page (cover first, when the album has one) starts rendering — 0-based page index.
  onPageStart?: (pageIndex: number) => Promise<void> | void;
  isCancelled?: () => boolean;
}): Promise<Uint8Array> {
  let pageCounter = 0;
  const startPage = async () => {
    if (isCancelled?.()) throw new ExportCancelledError();
    await onPageStart?.(pageCounter++);
  };
  const downloadCached = async (_bucket: string, id: string): Promise<Buffer | null> => (_bucket === "custom-ornaments" ? source.getCustomOrnament(id) : source.getPhoto(id));

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontsDir = FONTS_DIR;
  const [hebrewFont, latinFont, hebrewMetrics] = await Promise.all([
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Hebrew-Bold.ttf"))),
    pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, "Heebo-Latin-Bold.ttf"))),
    hebrewMetricsFor(fontsDir, "Heebo-Hebrew-Bold.ttf"),
  ]);
  const defaultFonts = { hebrewFont, latinFont, hebrewAscentRatio: hebrewMetrics.ascentRatio, hebrewDescentRatio: hebrewMetrics.descentRatio };

  // Fonts are embedded lazily, one pair per distinct selection actually used in this album — a
  // full 20-family embed on every export would bloat every single PDF regardless of use.
  type FontPair = { hebrewFont: PDFFont; latinFont: PDFFont; hebrewAscentRatio: number; hebrewDescentRatio: number };
  const fontPairCache = new Map<string, FontPair>();
  const getFontsForFamily = async (fontFamily: string | undefined): Promise<FontPair> => {
    const key = fontFamily ?? "heebo";
    if (key === "heebo") return defaultFonts;
    const cached = fontPairCache.get(key);
    if (cached) return cached;
    const { hebrewFile, latinFile } = getAlbumFontFiles(key);
    const isDefaultHebrewFile = hebrewFile === "Heebo-Hebrew-Bold.ttf";
    const [pairFonts, metrics] = await Promise.all([
      Promise.all([
        isDefaultHebrewFile ? hebrewFont : pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, hebrewFile))),
        latinFile === "Heebo-Latin-Bold.ttf" ? latinFont : pdfDoc.embedFont(await fs.readFile(path.join(fontsDir, latinFile))),
      ]),
      isDefaultHebrewFile ? Promise.resolve(hebrewMetrics) : hebrewMetricsFor(fontsDir, hebrewFile),
    ]);
    const pair: FontPair = {
      hebrewFont: pairFonts[0],
      latinFont: pairFonts[1],
      hebrewAscentRatio: metrics.ascentRatio,
      hebrewDescentRatio: metrics.descentRatio,
    };
    fontPairCache.set(key, pair);
    return pair;
  };

  const imageCache = new Map<string, PDFImage | null>();
  const embedByPhotoId = async (
    photoId: string | null,
    filter?: AlbumPhotoFilter,
    blurPct?: number,
    adjustments?: PhotoAdjustments,
    sharpness?: number
  ): Promise<PDFImage | null> => {
    if (!photoId) return null;
    const adjKey = adjustments && hasAdjustments(adjustments) ? JSON.stringify(adjustments) : "none";
    const cacheKey = `${photoId}:${filter ?? "none"}:${blurPct ?? 0}:${adjKey}:${sharpness ?? 0}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
    let buffer = await downloadCached("galleries", photoId);
    // Always runs — even with no filter/blur — since this is also where EXIF orientation gets
    // normalized (see applyPhotoFilter's comment); skipping it silently would un-fix that.
    if (buffer) {
      try {
        buffer = await applyPhotoFilter(buffer, filter, blurPct, adjustments, jpegQuality, sharpness, maxPhotoPx);
      } catch {
        // Fall back to the unfiltered (and un-EXIF-corrected) image rather than dropping it entirely.
      }
    }
    const image = buffer ? await embedImageAuto(pdfDoc, buffer) : null;
    imageCache.set(cacheKey, image);
    return image;
  };

  // Masked photos take a completely different path from every other PDF photo: the rest of this
  // exporter places images by embedding the FULL, uncropped photo once and letting pdf-lib's own
  // vector clip do the cover-fit crop at draw time (see drawCoverImage) — there's no pixel-level
  // cropping step to hook a mask into. A mask, though, has to end up pixel-aligned to the exact
  // cropped frame content (same as the JPG/PSD exports' composePhotoTile), so this pre-crops via
  // the SAME coverCropRaw used there, applies the mask as a dest-in alpha composite, and embeds
  // the result as a PNG sized exactly to the frame — pdf-lib then just places it 1:1, no clip
  // needed. Rendered at 2x the frame's point size for reasonable sharpness on this proof export
  // (not a certified press file — see the PAGE_WIDTH/PAGE_HEIGHT comment above).
  const embedMaskedPhoto = async (
    photoId: string | null,
    maskId: string,
    widthPt: number,
    heightPt: number,
    focalX: number,
    focalY: number,
    filter: AlbumPhotoFilter | undefined,
    blurPct: number | undefined,
    zoom: number | undefined,
    adjustments: PhotoAdjustments | undefined,
    sharpness: number | undefined
  ): Promise<PDFImage | null> => {
    if (!photoId) return null;
    const buffer = await downloadCached("galleries", photoId);
    if (!buffer) return null;
    const scale = 2;
    const pxW = Math.max(1, Math.round(widthPt * scale));
    const pxH = Math.max(1, Math.round(heightPt * scale));
    try {
      const cropped = await coverCropRaw(buffer, pxW, pxH, focalX, focalY, filter, true, { blur: blurPct, zoom, adjustments, sharpness });
      if (!cropped) return null;
      const masked = await applyMaskToRaw(cropped.data, pxW, pxH, maskId);
      const png = await sharp(masked, { raw: { width: pxW, height: pxH, channels: 4 } }).png().toBuffer();
      return await embedImageAuto(pdfDoc, png);
    } catch {
      return null;
    }
  };

  // Ornaments/shapes are rendered UNROTATED at 2x the frame's point size (same supersampling as
  // embedMaskedPhoto above), then embedded as a plain PNG — rotation is applied at draw time via
  // pushFrameRotation/popFrameRotation, same page-transform technique as every other rotated
  // element here, rather than pre-rotating the raster itself.
  const embedOrnament = async (
    ornamentId: string | undefined,
    customOrnamentId: string | undefined,
    color: string | undefined,
    widthPt: number,
    heightPt: number
  ): Promise<PDFImage | null> => {
    const scale = 2;
    const pxW = Math.max(1, Math.round(widthPt * scale));
    const pxH = Math.max(1, Math.round(heightPt * scale));
    let ornamentSource: Buffer | null = null;
    let tintColor: string | undefined;
    if (customOrnamentId) {
      ornamentSource = await downloadCached("custom-ornaments", customOrnamentId);
      tintColor = color;
    } else if (ornamentId) {
      const ornament = findOrnament(ornamentId);
      if (ornament) ornamentSource = Buffer.from(ornament.svg.replace("<svg ", `<svg style="color:${color ?? "#2e3142"}" `));
    }
    if (!ornamentSource) return null;
    try {
      const rendered = await ornamentLayerRaw(ornamentSource, pxW, pxH, undefined, tintColor);
      if (!rendered) return null;
      const png = await sharp(rendered.data, { raw: { width: rendered.width, height: rendered.height, channels: 4 } }).png().toBuffer();
      return await embedImageAuto(pdfDoc, png);
    } catch {
      return null;
    }
  };

  const embedShape = async (
    color: string,
    maskId: string | undefined,
    widthPt: number,
    heightPt: number,
    shapeStyle?: "rect-outline" | "circle-outline" | "line",
    borderWidth?: number,
    borderColor?: string
  ): Promise<PDFImage | null> => {
    const scale = 2;
    const pxW = Math.max(1, Math.round(widthPt * scale));
    const pxH = Math.max(1, Math.round(heightPt * scale));
    try {
      const isOutline = shapeStyle === "rect-outline" || shapeStyle === "circle-outline";
      const tile = await composeShapeTile(
        pxW,
        pxH,
        color,
        maskId,
        undefined,
        isOutline ? { shapeStyle, borderWidth: borderWidth ? borderWidth * scale : undefined, borderColor } : undefined
      );
      const png = await sharp(tile.data, { raw: { width: tile.width, height: tile.height, channels: 4 } }).png().toBuffer();
      return await embedImageAuto(pdfDoc, png);
    } catch {
      return null;
    }
  };

  if (album.cover_photo_id) {
    await startPage();
    const coverImage = await embedByPhotoId(album.cover_photo_id);
    if (coverImage) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawCoverImage(page, coverImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, 50, 50);
      page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: 190, color: rgb(0, 0, 0), opacity: 0.45 });
      drawCenteredBidiText(page, album.title, {
        centerX: PAGE_WIDTH / 2,
        y: 75,
        size: 52,
        hebrewFont,
        latinFont,
        color: rgb(1, 1, 1),
      });
    }
  }

  // Points-per-cm, anchored to the album's own width — lets a spread that carries its own
  // width_cm/height_cm (currently only ever a custom-sized cover) get a genuinely differently-
  // proportioned PDF page instead of being forced into the fixed PAGE_WIDTH/PAGE_HEIGHT box every
  // other page uses. A page WITHOUT an override stays byte-for-byte the same [PAGE_WIDTH,
  // PAGE_HEIGHT] as before this existed — this scale factor is only ever consulted for the override
  // case, never applied to change any existing page's size.
  const ptPerCm = PAGE_WIDTH / album.width_cm;

  for (const spread of spreads) {
    await startPage();
    if (spread.layout === "custom") {
      const hasCustomSize = spread.width_cm != null && spread.height_cm != null;
      const pageW = hasCustomSize ? spread.width_cm! * ptPerCm : PAGE_WIDTH;
      const pageH = hasCustomSize ? spread.height_cm! * ptPerCm : PAGE_HEIGHT;
      // A free-form page can be text-only (no photo elements at all) — unlike the preset
      // layouts, it always gets a page even if every photo element fails to embed.
      const page = pdfDoc.addPage([pageW, pageH]);
      if (spread.background_photo_id) {
        const bgImage = await embedByPhotoId(spread.background_photo_id, undefined, spread.background_blur);
        if (bgImage) drawCoverImage(page, bgImage, { x: 0, y: 0, width: pageW, height: pageH }, 50, 50, { opacity: spread.background_opacity / 100, zoom: spread.background_zoom });
      }
      for (const el of spread.elements) {
        if (el.type === "text") {
          drawTextElement(page, el, await getFontsForFamily(el.fontFamily), pageW, pageH);
          continue;
        }
        if (el.type === "ornament") {
          const width = (el.widthPct / 100) * pageW;
          const height = (el.heightPct / 100) * pageH;
          const x = (el.xPct / 100) * pageW;
          const y = pageH - (el.yPct / 100) * pageH - height;
          const image = await embedOrnament(el.ornamentId, el.customOrnamentId, el.color, width, height);
          if (!image) continue;
          const rect = { x, y, width, height };
          pushFrameRotation(page, rect, el.rotation);
          drawPhotoShadow(page, rect, el.shadow, undefined, undefined, el.shadowAngle);
          page.drawImage(image, { x, y, width, height, opacity: el.opacity !== undefined ? el.opacity / 100 : undefined });
          if (el.borderWidth) {
            page.drawRectangle({ x, y, width, height, borderWidth: el.borderWidth, borderColor: rgb(...hexToRgbTuple(el.borderColor ?? "#ffffff")) });
          }
          popFrameRotation(page);
          continue;
        }
        if (el.type === "shape") {
          const width = (el.widthPct / 100) * pageW;
          const height = (el.heightPct / 100) * pageH;
          const x = (el.xPct / 100) * pageW;
          const y = pageH - (el.yPct / 100) * pageH - height;
          const isOutlineShape = el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline";
          const image = await embedShape(el.color, el.maskId, width, height, el.shapeStyle, el.borderWidth, el.borderColor);
          if (!image) continue;
          const rect = { x, y, width, height };
          pushFrameRotation(page, rect, el.rotation);
          drawPhotoShadow(page, rect, el.shadow, undefined, undefined, el.shadowAngle);
          page.drawImage(image, { x, y, width, height, opacity: el.opacity !== undefined ? el.opacity / 100 : undefined });
          // The stroke is already baked into the image itself for outline shapes (see embedShape) —
          // drawing the usual decorative rect border on top would double it, and would be flatly
          // wrong-shaped for a circle outline.
          if (el.borderWidth && !isOutlineShape) {
            page.drawRectangle({ x, y, width, height, borderWidth: el.borderWidth, borderColor: rgb(...hexToRgbTuple(el.borderColor ?? "#ffffff")) });
          }
          popFrameRotation(page);
          continue;
        }
        const width = (el.widthPct / 100) * pageW;
        const height = (el.heightPct / 100) * pageH;
        const x = (el.xPct / 100) * pageW;
        const y = pageH - (el.yPct / 100) * pageH - height;
        const rect = { x, y, width, height };

        if (el.maskId) {
          // Pre-cropped and pre-masked to the frame's exact box (see embedMaskedPhoto) — opacity
          // still applies at draw time same as the unmasked path, but no cover-fit clip is needed
          // since the raster already fills the rect exactly.
          const maskedImage = await embedMaskedPhoto(
            el.photoId,
            el.maskId,
            width,
            height,
            el.focalX,
            el.focalY,
            el.filter,
            el.blur,
            el.zoom,
            {
              exposure: el.exposure,
              contrast: el.contrast,
              highlights: el.highlights,
              shadows2: el.shadows2,
              whites: el.whites,
              blacks: el.blacks,
              temp: el.temp,
              tint: el.tint,
              vibrance: el.vibrance,
              saturation2: el.saturation2,
            },
            el.sharpness
          );
          if (!maskedImage) continue;
          pushFrameRotation(page, rect, el.rotation);
          drawPhotoShadow(page, rect, el.shadow, el.shadowDistance, el.shadowBlur, el.shadowAngle);
          page.drawImage(maskedImage, { x, y, width, height, opacity: el.opacity !== undefined ? el.opacity / 100 : undefined });
          if (el.borderWidth) {
            page.drawRectangle({ x, y, width, height, borderWidth: el.borderWidth, borderColor: rgb(...hexToRgbTuple(el.borderColor ?? "#ffffff")) });
          }
          popFrameRotation(page);
          continue;
        }

        const image = await embedByPhotoId(
          el.photoId,
          el.filter,
          el.blur,
          {
            exposure: el.exposure,
            contrast: el.contrast,
            highlights: el.highlights,
            shadows2: el.shadows2,
            whites: el.whites,
            blacks: el.blacks,
            temp: el.temp,
            tint: el.tint,
            vibrance: el.vibrance,
            saturation2: el.saturation2,
          },
          el.sharpness
        );
        if (!image) continue;
        pushFrameRotation(page, rect, el.rotation);
        drawPhotoShadow(page, rect, el.shadow, el.shadowDistance, el.shadowBlur, el.shadowAngle);
        drawCoverImage(page, image, rect, el.focalX, el.focalY, { opacity: el.opacity !== undefined ? el.opacity / 100 : undefined, zoom: el.zoom });
        if (el.borderWidth) {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            borderWidth: el.borderWidth,
            borderColor: rgb(...hexToRgbTuple(el.borderColor ?? "#ffffff")),
          });
        }
        popFrameRotation(page);
      }
      continue;
    }

    const image1 = await embedByPhotoId(spread.photo_id_1);
    if (!image1) continue;
    const image2 = await embedByPhotoId(spread.photo_id_2);

    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    if (spread.background_photo_id) {
      const bgImage = await embedByPhotoId(spread.background_photo_id, undefined, spread.background_blur);
      if (bgImage) drawCoverImage(page, bgImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, 50, 50, { opacity: spread.background_opacity / 100, zoom: spread.background_zoom });
    }

    if (!image2) {
      drawCoverImage(page, image1, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT }, spread.focal_x_1, spread.focal_y_1);
    } else if (spread.layout === "stack") {
      const halfH = (PAGE_HEIGHT - GAP) / 2;
      // Vertical stacking order is unaffected by RTL (dir only reorders the inline/horizontal
      // axis) — photo1 on top, photo2 below, same as the app's flex-col rendering.
      drawCoverImage(page, image1, { x: 0, y: halfH + GAP, width: PAGE_WIDTH, height: halfH }, spread.focal_x_1, spread.focal_y_1);
      drawCoverImage(page, image2, { x: 0, y: 0, width: PAGE_WIDTH, height: halfH }, spread.focal_x_2, spread.focal_y_2);
    } else {
      const ratio1 = spread.layout === "feature" ? 1.6 : 1;
      const width1 = ((PAGE_WIDTH - GAP) * ratio1) / (ratio1 + 1);
      const width2 = PAGE_WIDTH - GAP - width1;
      // The app's UI is RTL (photo1 is the first flex child, so it renders on the *right*) —
      // mirrored here so the exported PDF matches what was actually reviewed and approved.
      drawCoverImage(page, image2, { x: 0, y: 0, width: width2, height: PAGE_HEIGHT }, spread.focal_x_2, spread.focal_y_2);
      drawCoverImage(page, image1, { x: width2 + GAP, y: 0, width: width1, height: PAGE_HEIGHT }, spread.focal_x_1, spread.focal_y_1);
    }

    for (const el of spread.elements) {
      if (el.type === "text") drawTextElement(page, el, await getFontsForFamily(el.fontFamily));
    }
  }

  return pdfDoc.save();
}

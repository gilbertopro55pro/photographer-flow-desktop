import sharp from "sharp";
import { writePsdBuffer, type Layer, type LayerEffectsInfo } from "ag-psd";
import { infoHandlers } from "ag-psd/dist/additionalInfo.js";
import { resolvePageElements, coverCropRaw, composePhotoTile, svgTextLayer, ornamentLayerRaw, composeShapeTile, DPI, type PhotoSource } from "./albumRaster.js";
import { findOrnament } from "./albumOrnaments.js";
import type { GalleryAlbumRow, GalleryAlbumSpreadRow } from "./albumTypes.js";

// pageWidthPx/pageHeightPx (pxFromCm in albumRaster.ts) are already computed AT this same DPI —
// this only stamps that number as the file's own metadata, since ag-psd doesn't infer it from
// pixel count on its own. Without it, Photoshop assumed the usual 72 PPI default and reported the
// page's print size as roughly 4x its real physical dimensions, even though the pixel data itself
// was always genuinely print-resolution.
const PSD_RESOLUTION_INFO = {
  horizontalResolution: DPI,
  horizontalResolutionUnit: "PPI" as const,
  widthUnit: "Inches" as const,
  verticalResolution: DPI,
  verticalResolutionUnit: "PPI" as const,
  heightUnit: "Inches" as const,
};

async function pngToRawRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ag-psd writes TWO separate binary blocks for a layer's effects whenever any are present: the
// legacy Photoshop-5-era `lrFX` block (a fixed binary layout that CANNOT represent Stroke at all,
// and omits contour/noise/choke/antialiased) and the modern descriptor-based `lfx2` block (which
// has everything). It writes both, redundantly, for the same layer. Real Photoshop reported
// "problems reading layers" on files built this way across three earlier attempts at live layer
// effects here — the earlier fixes (correct 0-1 opacity scale, field shapes verified against a
// real Photoshop-authored fixture) only ever verified round-tripping through ag-psd's OWN reader,
// which happily parses back what its own writer produced either way, so none of that caught the
// real problem. Removing the legacy `lrFX` handler so only the complete `lfx2` block gets written
// was verified against real Photoshop 2026 (RG0 web repo, same ag-psd version, same code): opens
// clean with no warning, Drop Shadow and Stroke both live/editable in the Layer Style dialog, and
// correctly follow a rotated/mask-shaped photo's actual silhouette rather than its bounding box.
const lrFXHandlerIndex = infoHandlers.findIndex((h) => h.key === "lrFX");
if (lrFXHandlerIndex !== -1) infoHandlers.splice(lrFXHandlerIndex, 1);

// Real, live Photoshop Layer Style effects — shared by photos, ornaments, and (non-outline) shapes
// — editable in Photoshop's own Layer Style dialog exactly as if applied by hand. Distance/angle
// approximate the app's fixed down-right CSS shadow as Photoshop's polar distance+angle form; the
// blur/opacity numbers mirror boxShadowFor()/the old shadowLayerPng() so it looks the same as the
// live editor and JPG export. `position: "inside"` for the stroke matches the app's own convention
// everywhere else (CSS inset box-shadow live, and the SVG-rect-inset-by-half-width technique baked
// into JPG/PDF export) — the border paints inward from the layer's own edge, never outside it.
// Every field below (noise, antialiased, contour, layerConceals, choke, showInDialog) is included
// because real Photoshop-authored files always write the full descriptor; ag-psd's types mark most
// of them optional, but omitting them was never actually verified against real Photoshop before
// the first attempt at this (photos only) — see that commit for the investigation.
// angleDeg is in this app's own screen convention (0=right, 90=down, 180=left, 270=up, clockwise —
// see boxShadowFor in AlbumSpreadCanvasEditor.tsx/SpreadPreview.tsx). Photoshop's own dropShadow.angle
// is a DIFFERENT convention: it's the LIGHT source direction (standard math angle, counterclockwise
// from east, Y-up), and the shadow falls opposite the light — confirmed against Adobe's own docs:
// angle=90 means light from straight above, shadow straight down. Converting our screen-space
// shadow-direction angle to Photoshop's light-direction angle needs both a handedness flip (CW vs
// CCW) and a 180° flip (shadow direction vs light direction), which combine to: psAngle = 180 -
// angleDeg. The default (45, down-right) converts to 135 — exactly this function's old hardcoded
// value, a good sanity check the conversion is right.
// Photoshop's own per-effect Angle field only accepts/displays -180..180, not the full 0..360 a
// naive conversion produces — confirmed by real-Photoshop testing on the RG0 web repo (same ag-psd
// version, same code): a value written outside that range (e.g. 270, 340) silently displayed as a
// stuck 180 in the Layer Style dialog, even though the file's own bytes were independently verified
// correct via raw byte parsing. So the raw 0..360 result is re-wrapped into -180..180 before writing.
function psAngleFromScreenAngle(angleDeg: number): number {
  const normalized = ((180 - angleDeg) % 360 + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function buildLayerEffects(shadowPct: number | undefined, borderWidth: number | undefined, borderColor: string | undefined, angleDeg: number | undefined): LayerEffectsInfo | undefined {
  const effects: LayerEffectsInfo = {};
  const linearContour = { name: "Linear", curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
  if (shadowPct) {
    const blurPx = Math.max(1, (shadowPct / 100) * 24);
    const offsetPx = (shadowPct / 100) * 10;
    const opacity = 0.15 + (shadowPct / 100) * 0.45;
    effects.dropShadow = [
      {
        enabled: true,
        present: true,
        showInDialog: true,
        useGlobalLight: false,
        angle: psAngleFromScreenAngle(angleDeg ?? 45),
        distance: { units: "Pixels", value: Math.round(offsetPx * Math.SQRT2) },
        choke: { units: "Pixels", value: 0 },
        size: { units: "Pixels", value: Math.round(blurPx) },
        color: { r: 0, g: 0, b: 0 },
        opacity,
        blendMode: "multiply",
        antialiased: false,
        layerConceals: true,
        contour: linearContour,
      },
    ];
  }
  if (borderWidth) {
    effects.stroke = [
      {
        enabled: true,
        present: true,
        showInDialog: true,
        position: "inside",
        fillType: "color",
        color: hexToRgb(borderColor ?? "#ffffff"),
        opacity: 1,
        blendMode: "normal",
        size: { units: "Pixels", value: borderWidth },
        overprint: false,
      },
    ];
  }
  return Object.keys(effects).length > 0 ? effects : undefined;
}

// Builds a real, layered .psd — each photo is its own positioned raster layer, and a black & white
// filter becomes an actual clipped Photoshop "Black & White" adjustment layer (not baked into
// pixels), so it stays live and removable/tweakable once opened in Photoshop. Sepia is baked into
// the pixel data instead (same as the JPG export) — ag-psd supports adjustment layers in general,
// but there's no clean native "sepia" one, and approximating it via a chain of adjustments wasn't
// worth the added complexity for a first version.
export async function renderAlbumPagePsd({
  album,
  spread,
  isCover,
  pageWidthPx,
  pageHeightPx,
  source,
}: {
  album: GalleryAlbumRow;
  spread: GalleryAlbumSpreadRow | null;
  isCover: boolean;
  pageWidthPx: number;
  pageHeightPx: number;
  source: PhotoSource;
}): Promise<Buffer | null> {
  const children: Layer[] = [
    {
      name: "רקע",
      top: 0,
      left: 0,
      bottom: pageHeightPx,
      right: pageWidthPx,
      imageData: { data: new Uint8Array(pageWidthPx * pageHeightPx * 4).fill(255), width: pageWidthPx, height: pageHeightPx },
    },
  ];

  if (isCover) {
    const buffer = album.cover_photo_id ? await source.getPhoto(album.cover_photo_id) : null;
    const cropped = buffer ? await coverCropRaw(buffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false) : null;
    if (!cropped) return null;
    children.push({ name: "תמונת שער", top: 0, left: 0, bottom: pageHeightPx, right: pageWidthPx, imageData: { data: cropped.data, width: cropped.width, height: cropped.height } });
    const bandHeight = Math.round(pageHeightPx * 0.19);
    const titlePng = await svgTextLayer(album.title, {
      xPx: 0,
      yPx: pageHeightPx - bandHeight * 0.62,
      widthPx: pageWidthPx,
      fontSizePx: Math.round(pageWidthPx * 0.032),
      color: "#ffffff",
      align: "center",
      pageWidthPx,
      pageHeightPx,
    });
    const titleRgba = await pngToRawRgba(titlePng);
    children.push({ name: "כותרת", top: 0, left: 0, bottom: titleRgba.height, right: titleRgba.width, imageData: { data: titleRgba.data, width: titleRgba.width, height: titleRgba.height } });
    return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children, imageResources: { resolutionInfo: PSD_RESOLUTION_INFO } });
  }

  if (!spread) return null;

  if (spread.background_photo_id) {
    const bgBuffer = await source.getPhoto(spread.background_photo_id);
    const bgCropped = bgBuffer ? await coverCropRaw(bgBuffer, pageWidthPx, pageHeightPx, 50, 50, undefined, false, { blur: spread.background_blur, zoom: spread.background_zoom }) : null;
    if (bgCropped) {
      children.push({
        name: "רקע עמוד",
        top: 0,
        left: 0,
        bottom: pageHeightPx,
        right: pageWidthPx,
        opacity: spread.background_opacity / 100,
        imageData: { data: bgCropped.data, width: bgCropped.width, height: bgCropped.height },
      });
    }
  }

  const elements = resolvePageElements(spread, pageWidthPx, pageHeightPx);
  let any = false;
  for (const el of elements) {
    if (el.kind === "text") {
      const png = await svgTextLayer(el.text, {
        xPx: el.x,
        yPx: el.y,
        widthPx: el.width,
        heightPx: el.height,
        fontSizePx: el.fontSizePx,
        color: el.color,
        align: el.align,
        pageWidthPx,
        pageHeightPx,
        fontFamily: el.fontFamily,
      });
      const rgba = await pngToRawRgba(png);
      children.push({ name: "טקסט", top: 0, left: 0, bottom: rgba.height, right: rgba.width, imageData: { data: rgba.data, width: rgba.width, height: rgba.height } });
      continue;
    }
    if (el.kind === "ornament") {
      const w = Math.max(1, Math.round(el.width));
      const h = Math.max(1, Math.round(el.height));
      let ornamentSource: Buffer | null = null;
      let tintColor: string | undefined;
      if (el.customOrnamentId) {
        ornamentSource = await source.getCustomOrnament(el.customOrnamentId);
        tintColor = el.color;
      } else if (el.ornamentId) {
        const ornament = findOrnament(el.ornamentId);
        if (ornament) ornamentSource = Buffer.from(ornament.svg.replace("<svg ", `<svg style="color:${el.color ?? "#2e3142"}" `));
      }
      if (!ornamentSource) continue;
      // Border used to be baked as a rectangular trace around the ornament's bounding box (see
      // ornamentLayerRaw's own comment — it never followed the ornament's real silhouette even
      // baked). A live Stroke effect follows the actual alpha shape instead, so a non-rectangular
      // ornament (most of them) gets a correctly-shaped outline now instead of a bounding rectangle.
      const rendered = await ornamentLayerRaw(ornamentSource, w, h, el.rotation, tintColor);
      if (!rendered) continue;
      any = true;
      const centerX = el.x + w / 2;
      const centerY = el.y + h / 2;
      const top = Math.round(centerY - rendered.height / 2);
      const left = Math.round(centerX - rendered.width / 2);
      const ornamentEffects = buildLayerEffects(el.shadow, el.borderWidth, el.borderColor, el.shadowAngle);
      children.push({
        name: "עיטור",
        top,
        left,
        bottom: top + rendered.height,
        right: left + rendered.width,
        opacity: (el.opacity ?? 100) / 100,
        imageData: { data: rendered.data, width: rendered.width, height: rendered.height },
        ...(ornamentEffects ? { effects: ornamentEffects } : {}),
      });
      continue;
    }
    if (el.kind === "shape") {
      const w = Math.max(1, Math.round(el.width));
      const h = Math.max(1, Math.round(el.height));
      const frameTop = Math.round(el.y);
      const frameLeft = Math.round(el.x);
      // rect-outline/circle-outline shapes have no fill of their own — borderWidth/borderColor
      // ARE the shape's own stroke (see composeShapeTile's own comment), not a decorative extra
      // to peel off into a live effect, so those stay exactly as baked. Every other shape (filled,
      // optionally mask-shaped) gets a live Stroke effect instead, same as photos/ornaments — for a
      // mask-shaped fill (a heart, say) that also means a correctly heart-shaped outline instead of
      // the old baked rectangle-then-cropped-by-mask border.
      const isOutlineShape = el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline";
      const tile = await composeShapeTile(w, h, el.color, el.maskId, el.rotation, {
        borderWidth: isOutlineShape ? el.borderWidth : undefined,
        borderColor: isOutlineShape ? el.borderColor : undefined,
        shapeStyle: el.shapeStyle,
      });
      any = true;
      const top = Math.round(frameTop + tile.top);
      const left = Math.round(frameLeft + tile.left);
      const shapeEffects = buildLayerEffects(el.shadow, isOutlineShape ? undefined : el.borderWidth, el.borderColor, el.shadowAngle);
      children.push({
        name: "צורה",
        top,
        left,
        bottom: top + tile.height,
        right: left + tile.width,
        opacity: (el.opacity ?? 100) / 100,
        imageData: { data: tile.data, width: tile.width, height: tile.height },
        ...(shapeEffects ? { effects: shapeEffects } : {}),
      });
      continue;
    }
    if (!el.photoId) continue;
    const buffer = await source.getPhoto(el.photoId);
    if (!buffer) continue;
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    const frameTop = Math.round(el.y);
    const frameLeft = Math.round(el.x);

    // Border and shadow are real, live Photoshop Layer Style effects on this layer (see
    // buildLayerEffects above) — editable in Photoshop's own dialog, not baked into pixels.
    // Both effects key off the layer's actual alpha silhouette, not its rectangular bounds, so a
    // rotated or mask-shaped photo still gets a correctly-shaped stroke/shadow with no special
    // handling needed here. Opacity stays a live PSD layer property. Blur has no
    // from-scratch-authorable Smart Filter equivalent, so it's still baked into the pixels.
    const tile = await composePhotoTile(buffer, width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false, {
      rotation: el.rotation,
      blur: el.blur,
      zoom: el.zoom,
      maskId: el.maskId,
      adjustments: el.adjustments,
      sharpness: el.sharpness,
    });
    if (!tile) continue;
    any = true;
    const top = Math.round(frameTop + tile.top);
    const left = Math.round(frameLeft + tile.left);
    const effects = buildLayerEffects(el.shadow, el.borderWidth, el.borderColor, el.shadowAngle);
    children.push({
      name: "תמונה",
      top,
      left,
      bottom: top + tile.height,
      right: left + tile.width,
      opacity: (el.opacity ?? 100) / 100,
      imageData: { data: tile.data, width: tile.width, height: tile.height },
      ...(effects ? { effects } : {}),
    });
    if (el.filter === "bw") {
      children.push({ name: "שחור-לבן", clipping: true, adjustment: { type: "black & white" } });
    }
  }
  if (!any && !elements.some((e) => e.kind === "text") && !spread.background_photo_id) return null;

  return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children, imageResources: { resolutionInfo: PSD_RESOLUTION_INFO } });
}

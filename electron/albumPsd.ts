import sharp from "sharp";
import { writePsdBuffer, type Layer } from "ag-psd";
import { resolvePageElements, coverCropRaw, composePhotoTile, svgTextLayer, shadowLayerPng, ornamentLayerRaw, composeShapeTile, DPI, type PhotoSource } from "./albumRaster.js";
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

// Both border and shadow are baked into raster layers here, NOT live Photoshop Layer Style
// effects (`effects.stroke`/`effects.dropShadow`) — that was tried across several rounds
// (correct field shapes verified against a real Photoshop-authored fixture, correct 0-1 opacity
// scale, clean round-trips through ag-psd's own reader) and real Photoshop still reported
// "problems reading layers" and rendered some pages as blank/black. Without access to real
// Photoshop to iterate against, that gap can't be closed reliably from outside — this reverts
// fully to the plain-raster-layers approach that was verified working (real photographer testing,
// no errors) before that attempt.

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
      const rendered = await ornamentLayerRaw(ornamentSource, w, h, el.rotation, tintColor, { borderWidth: el.borderWidth, borderColor: el.borderColor });
      if (!rendered) continue;
      any = true;
      const centerX = el.x + w / 2;
      const centerY = el.y + h / 2;
      const top = Math.round(centerY - rendered.height / 2);
      const left = Math.round(centerX - rendered.width / 2);
      const ornamentShadow = await shadowLayerPng(w, h, el.shadow, Math.round(el.x), Math.round(el.y), el.rotation, undefined, undefined, pageWidthPx, pageHeightPx);
      if (ornamentShadow) {
        const shadowRgba = await pngToRawRgba(ornamentShadow.buffer);
        children.push({
          name: "צל",
          top: ornamentShadow.top,
          left: ornamentShadow.left,
          bottom: ornamentShadow.top + shadowRgba.height,
          right: ornamentShadow.left + shadowRgba.width,
          imageData: { data: shadowRgba.data, width: shadowRgba.width, height: shadowRgba.height },
        });
      }
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
      const w = Math.max(1, Math.round(el.width));
      const h = Math.max(1, Math.round(el.height));
      const frameTop = Math.round(el.y);
      const frameLeft = Math.round(el.x);
      const tile = await composeShapeTile(w, h, el.color, el.maskId, el.rotation, { borderWidth: el.borderWidth, borderColor: el.borderColor, shapeStyle: el.shapeStyle });
      any = true;
      const top = Math.round(frameTop + tile.top);
      const left = Math.round(frameLeft + tile.left);
      const shapeShadow = await shadowLayerPng(w, h, el.shadow, frameLeft, frameTop, el.rotation, undefined, undefined, pageWidthPx, pageHeightPx);
      if (shapeShadow) {
        const shadowRgba = await pngToRawRgba(shapeShadow.buffer);
        children.push({
          name: "צל",
          top: shapeShadow.top,
          left: shapeShadow.left,
          bottom: shapeShadow.top + shadowRgba.height,
          right: shapeShadow.left + shadowRgba.width,
          imageData: { data: shadowRgba.data, width: shadowRgba.width, height: shadowRgba.height },
        });
      }
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
    if (!el.photoId) continue;
    const buffer = await source.getPhoto(el.photoId);
    if (!buffer) continue;
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    const frameTop = Math.round(el.y);
    const frameLeft = Math.round(el.x);

    // Border is baked into the photo's own pixels (bundled into the same rotated tile as the
    // photo when rotated, so it spins together as one rigid unit — see composePhotoTile).
    // Opacity stays a live PSD layer property. Blur has no from-scratch-authorable Smart Filter
    // equivalent, so it's baked into the pixels too. Shadow is a separate baked raster layer,
    // composited just underneath — see the module comment above for why none of these are live
    // Layer Style effects.
    const tile = await composePhotoTile(buffer, width, height, el.focalX, el.focalY, el.filter === "sepia" ? "sepia" : undefined, false, {
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
    any = true;
    const shadow = await shadowLayerPng(width, height, el.shadow, frameLeft, frameTop, el.rotation, undefined, undefined, pageWidthPx, pageHeightPx);
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
      name: "תמונה",
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
  if (!any && !elements.some((e) => e.kind === "text") && !spread.background_photo_id) return null;

  return writePsdBuffer({ width: pageWidthPx, height: pageHeightPx, children, imageResources: { resolutionInfo: PSD_RESOLUTION_INFO } });
}

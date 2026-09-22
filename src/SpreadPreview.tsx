import { ALBUM_BLUR_MAX_PX } from "./components/AlbumSpreadCanvasEditor";
import { albumFontFamilyCss } from "./lib/albumFonts";
import { isLightTextColor } from "./lib/textColor";
import { maskCssUrl, findMask } from "./lib/albumMasks";
import { findOrnament, ornamentDataUrl } from "./lib/albumOrnaments";
import type { AlbumElement, AlbumOrnamentElement, AlbumPhotoElement, AlbumShapeElement, AlbumTextElement } from "./types";

// Ported from the web app's GalleryAlbumProofing.tsx (custom-mode branch) — the read-only render
// of a spread that actually reflects every effect the canvas editor can produce (masks, border,
// shadow, rotation, opacity, blur, filter, zoom, text), not just position/size/focal point. The
// previous version of this preview only drew left/top/width/height/objectPosition, so anything
// edited beyond a plain move/resize (a mask, text, a border, a shadow...) silently vanished from
// the page-detail view even though it was correctly saved to the database.

export function cssFilterFor(filter: "none" | "bw" | "sepia" | undefined, blurPct?: number): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  return parts.length ? parts.join(" ") : undefined;
}

export function boxShadowFor(shadowPct: number | undefined, angleDeg?: number): string | undefined {
  if (!shadowPct) return undefined;
  const blurPx = (shadowPct / 100) * 24;
  const offsetPx = (shadowPct / 100) * 10;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  const magnitude = offsetPx * Math.SQRT2;
  const angleRad = ((angleDeg ?? 45) * Math.PI) / 180;
  const offsetX = (magnitude * Math.cos(angleRad)).toFixed(2);
  const offsetY = (magnitude * Math.sin(angleRad)).toFixed(2);
  return `${offsetX}px ${offsetY}px ${blurPx}px rgba(0,0,0,${alpha})`;
}

function TextOverlay({ el }: { el: AlbumTextElement }) {
  return (
    <div
      className="absolute px-1 font-bold flex items-center"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct ?? 15}%`,
        justifyContent: el.align === "right" ? "flex-end" : el.align === "left" ? "flex-start" : "center",
        textAlign: el.align,
        color: el.color,
        fontSize: `calc(${el.fontSize} / 1600 * 100cqw)`,
        fontFamily: albumFontFamilyCss(el.fontFamily),
        textShadow: isLightTextColor(el.color) ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
      }}
    >
      <span>{el.text}</span>
    </div>
  );
}

function PhotoTile({ el, url }: { el: AlbumPhotoElement; url: string | undefined }) {
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct}%`,
        background: "var(--color-line)",
        // Drop shadow only — stays on this element (not clipped by its own overflow-hidden, so
        // it can bleed past the cropped frame; a CHILD's box-shadow would be clipped by this
        // parent's overflow, which is why the border below is handled differently).
        boxShadow: boxShadowFor(el.shadow, el.shadowAngle),
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      }}
    >
      {url && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img
          src={url}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: `${el.focalX}% ${el.focalY}%`,
            filter: cssFilterFor(el.filter, el.blur),
            opacity: (el.opacity ?? 100) / 100,
            transform: el.zoom && el.zoom !== 100 ? `scale(${el.zoom / 100})` : undefined,
            ...(el.maskId
              ? {
                  WebkitMaskImage: maskCssUrl(findMask(el.maskId)?.svg ?? ""),
                  maskImage: maskCssUrl(findMask(el.maskId)?.svg ?? ""),
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat: "no-repeat",
                }
              : null),
          }}
        />
      )}
      {!!el.borderWidth && (
        // A later sibling than the <img>, not an `outline` on the parent — guarantees the border
        // paints ON TOP of the photo regardless of stacking-context edge cases (this is what was
        // actually going wrong: a full-bleed opaque photo could visually cover an inset outline
        // drawn on the parent, which only became visible once opacity/blur made the photo itself
        // partially see-through). An inset box-shadow paints as this div's own decoration, always
        // above its z-index:auto siblings drawn earlier in source order.
        //
        // Width is scaled relative to the album's 1600pt reference canvas (same convention as
        // TextOverlay's fontSize below) instead of a raw px value — this preview renders at
        // whatever small thumbnail width the grid/page-switcher gives it, and a border authored
        // to look thin on the full-size editing canvas otherwise stays visually just as many
        // pixels wide here, i.e. disproportionately thick relative to the shrunken photo.
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 calc(${el.borderWidth} / 1600 * 100cqw) ${el.borderColor ?? "#fff"}` }}
        />
      )}
    </div>
  );
}

function OrnamentOverlay({ el, customUrl }: { el: AlbumOrnamentElement; customUrl: string | undefined }) {
  const ornament = el.customOrnamentId ? null : findOrnament(el.ornamentId);
  const imgSrc = customUrl ?? (ornament ? ornamentDataUrl(ornament, el.color ?? "#2e3142") : undefined);
  const customTint = el.customOrnamentId && el.color ? el.color : undefined;
  if (!imgSrc) return null;
  return (
    <div
      className="absolute"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct}%`,
        opacity: (el.opacity ?? 100) / 100,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        // Same 1600pt-reference cqw scaling as PhotoTile's border above — see its comment.
        outline: el.borderWidth ? `calc(${el.borderWidth} / 1600 * 100cqw) solid ${el.borderColor ?? "#fff"}` : "none",
        outlineOffset: el.borderWidth ? `calc(${el.borderWidth} / -1600 * 100cqw)` : undefined,
        boxShadow: boxShadowFor(el.shadow, el.shadowAngle),
      }}
    >
      {customTint ? (
        <div
          className="w-full h-full"
          style={{
            backgroundColor: customTint,
            WebkitMaskImage: `url(${imgSrc})`,
            maskImage: `url(${imgSrc})`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ) : (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={imgSrc} className="w-full h-full" style={{ objectFit: "contain" }} />
      )}
    </div>
  );
}

function ShapeOverlay({ el }: { el: AlbumShapeElement }) {
  const mask = el.maskId ? findMask(el.maskId) : undefined;
  return (
    <div
      className="absolute"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        height: `${el.heightPct}%`,
        opacity: (el.opacity ?? 100) / 100,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        boxShadow: boxShadowFor(el.shadow, el.shadowAngle),
      }}
    >
      <div
        className="w-full h-full"
        style={{
          backgroundColor: el.color,
          ...(mask
            ? {
                WebkitMaskImage: maskCssUrl(mask.svg),
                maskImage: maskCssUrl(mask.svg),
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
            : null),
        }}
      />
    </div>
  );
}

function BackgroundLayer({ background }: { background: { url: string; blur: number; opacity: number } | null | undefined }) {
  // A background photo missing its own preview has url === "" — an <img src=""> would resolve to
  // THIS page's own URL and render Chromium's broken-image glyph, so this guards on the URL
  // itself, not just whether a background object was passed at all.
  if (!background?.url) return null;
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      src={background.url}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ opacity: background.opacity / 100, filter: background.blur ? `blur(${(background.blur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined }}
    />
  );
}

export default function SpreadPreview({
  elements,
  previewUrls,
  background,
  customOrnamentUrls,
}: {
  elements: AlbumElement[];
  previewUrls: Map<string, string>;
  background?: { url: string; blur: number; opacity: number } | null;
  customOrnamentUrls?: Map<string, string>;
}) {
  return (
    <div className="relative w-full h-full" style={{ containerType: "inline-size" }}>
      <BackgroundLayer background={background} />
      {elements.map((el) => {
        if (el.type === "photo") return <PhotoTile key={el.id} el={el} url={el.photoId ? previewUrls.get(el.photoId) : undefined} />;
        if (el.type === "ornament") return <OrnamentOverlay key={el.id} el={el} customUrl={el.customOrnamentId ? customOrnamentUrls?.get(el.customOrnamentId) : undefined} />;
        if (el.type === "shape") return <ShapeOverlay key={el.id} el={el} />;
        return <TextOverlay key={el.id} el={el} />;
      })}
    </div>
  );
}

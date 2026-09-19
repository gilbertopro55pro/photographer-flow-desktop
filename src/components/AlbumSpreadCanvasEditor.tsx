"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AlbumElement, AlbumFrame, AlbumOrnamentElement, AlbumPhotoElement, AlbumPhotoFilter, AlbumShapeElement, AlbumTemplateRow, AlbumTextElement, GalleryAlbumSpreadRow } from "@/lib/types";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { TEXT_COLOR_PALETTE, isLightTextColor } from "@/lib/textColor";
import { TEMPLATE_TABS, TEMPLATE_BANK, type TemplateTabKey } from "@/lib/albumTemplateBank";
import { ALBUM_MASKS, maskCssUrl, findMask } from "@/lib/albumMasks";
import { ALBUM_ORNAMENTS, ORNAMENT_TABS, findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { textHeightPctForFontSize, MAX_TEXT_HEIGHT_OVERSIZE_RATIO } from "@/lib/albumTextSizing";
import { hasAdjustments, adjustmentsFilterId, adjustmentsSvgFilter, type PhotoAdjustments } from "@/lib/albumAdjustments";
import { sharpenFilterId, sharpenSvgFilter } from "@/lib/albumSharpen";
import AlbumEditorGuideModal from "@/components/AlbumEditorGuideModal";
import SpreadPreview from "@/SpreadPreview";

type PhotoWithUrl = { id: string; url: string; is_favorite?: boolean; folder_id?: string | null; original_filename?: string; created_at?: string };

const BORDER_COLORS = ["#ffffff", "#000000", "#d4af37", "#e07a5f"];
const PX_PER_CM = 96 / 2.54;
// A shared cap so a given blur % looks (and exports) the same whether it's applied to a framed
// photo or the full-page background — also the sigma sharp/PDF baking uses server-side, since
// CSS blur(px) and sharp's Gaussian blur sigma are both "pixels of std-deviation" and line up
// closely enough in practice not to need a separate conversion factor.
export const ALBUM_BLUR_MAX_PX = 40;

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-semibold bg-chip text-ink-soft"
      >
        <span>{label}</span>
        <span dir="ltr" className="font-data">
          {value}
          {unit}
        </span>
      </button>
      {open && (
        <div className="absolute z-10 top-full inset-x-0 mt-1 rounded-lg border border-line bg-white p-2.5 shadow-sheet">
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full gf-slider-thumb" />
        </div>
      )}
    </div>
  );
}

// Line-style icons matching the app's existing icon set (GalleryStyleIcons.tsx's Base pattern) —
// 24x24 viewBox, currentColor stroke, no fill — used in the floating menu below instead of emoji,
// which read as a mismatched, oversized, platform-dependent style next to everything else here.
function MenuIconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconBW() {
  return (
    <MenuIconBase>
      <circle cx={12} cy={12} r={8} />
      <path d="M12 4a8 8 0 000 16z" fill="currentColor" stroke="none" />
    </MenuIconBase>
  );
}
function IconAdjust() {
  return (
    <MenuIconBase>
      <path d="M5 4v7M5 15v5M12 4v3M12 11v9M19 4v11M19 19v1" />
      <circle cx={5} cy={13} r={1.8} />
      <circle cx={12} cy={9} r={1.8} />
      <circle cx={19} cy={17} r={1.8} />
    </MenuIconBase>
  );
}
function IconSepia() {
  return (
    <MenuIconBase>
      <path d="M12 3.5c3 3.6 5.5 6.9 5.5 9.8a5.5 5.5 0 11-11 0c0-2.9 2.5-6.2 5.5-9.8z" />
    </MenuIconBase>
  );
}
function IconOpacity() {
  return (
    <MenuIconBase>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx={12} cy={12} r={2.6} />
    </MenuIconBase>
  );
}
function IconBlur() {
  return (
    <MenuIconBase>
      <path d="M3 8.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 13c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
      <path d="M3 17.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
    </MenuIconBase>
  );
}
function IconRotate() {
  return (
    <MenuIconBase>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M3 17.5v-4h4" />
    </MenuIconBase>
  );
}
function IconShadow() {
  return (
    <MenuIconBase>
      <rect x={8.5} y={8.5} width={12} height={12} rx={1.5} opacity={0.4} />
      <rect x={3.5} y={3.5} width={12} height={12} rx={1.5} />
    </MenuIconBase>
  );
}
function IconFocal() {
  return (
    <MenuIconBase>
      <circle cx={12} cy={12} r={7.5} />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21" />
    </MenuIconBase>
  );
}
function IconTrueSize() {
  return (
    <MenuIconBase>
      <rect x={3.5} y={6.5} width={17} height={11} rx={1} />
      <path d="M3.5 3.5h4M3.5 3.5v4M20.5 3.5h-4M20.5 3.5v4M3.5 20.5h4M3.5 20.5v-4M20.5 20.5h-4M20.5 20.5v-4" />
    </MenuIconBase>
  );
}
function IconAspectLock() {
  return (
    <MenuIconBase>
      <rect x={5.5} y={10.5} width={13} height={9} rx={1.5} />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" />
    </MenuIconBase>
  );
}
function IconTrash() {
  return (
    <MenuIconBase>
      <path d="M4.5 7h15M9.5 7V4.8a1 1 0 011-1h3a1 1 0 011 1V7m-8 0l.8 12.2a1.5 1.5 0 001.5 1.4h5.4a1.5 1.5 0 001.5-1.4L18.5 7" />
      <path d="M10 11v6M14 11v6" />
    </MenuIconBase>
  );
}
function IconX() {
  return (
    <MenuIconBase>
      <path d="M6 6l12 12M18 6L6 18" />
    </MenuIconBase>
  );
}
function IconLock() {
  return (
    <MenuIconBase>
      <rect x={5.5} y={10.5} width={13} height={9} rx={1.5} />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 017 0v3" />
      <circle cx={12} cy={14.5} r={1.3} fill="currentColor" stroke="none" />
    </MenuIconBase>
  );
}
function IconToFront() {
  return (
    <MenuIconBase>
      <rect x={3.5} y={3.5} width={11} height={11} rx={1.5} opacity={0.4} />
      <rect x={9.5} y={9.5} width={11} height={11} rx={1.5} />
    </MenuIconBase>
  );
}
function IconToBack() {
  return (
    <MenuIconBase>
      <rect x={9.5} y={9.5} width={11} height={11} rx={1.5} opacity={0.4} />
      <rect x={3.5} y={3.5} width={11} height={11} rx={1.5} />
    </MenuIconBase>
  );
}

// Matches the app's canonical icon convention (NavIcons.tsx / GalleryStyleIcons.tsx: 24x24
// viewBox, currentColor stroke, no fill, strokeWidth 1.6) — used for the editor's own chrome
// buttons (close/save/templates/info/check), as opposed to MenuIconBase above which is scoped to
// the floating photo-controls menu.
function UiIconBase({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconClose({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M5 5l14 14M19 5L5 19" />
    </UiIconBase>
  );
}
function IconPlusSmall({ size }: { size?: number }) {
  return (
    <UiIconBase size={size ?? 14}>
      <path d="M12 5v14M5 12h14" />
    </UiIconBase>
  );
}
function IconGrid({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <rect x={3.5} y={3.5} width={7} height={7} rx={1} />
      <rect x={13.5} y={3.5} width={7} height={7} rx={1} />
      <rect x={3.5} y={13.5} width={7} height={7} rx={1} />
      <rect x={13.5} y={13.5} width={7} height={7} rx={1} />
    </UiIconBase>
  );
}
function IconMask({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={9} cy={12} r={6.5} />
      <path d="M13.5 6.7A6.5 6.5 0 1113.5 17.3" />
    </UiIconBase>
  );
}
function IconOrnament({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M12 3c2.5 3 4.5 5.6 4.5 8a4.5 4.5 0 11-9 0c0-2.4 2-5 4.5-8z" />
      <path d="M6 15c-1.5 1-2.5 2.3-2.5 3.5M18 15c1.5 1 2.5 2.3 2.5 3.5" />
    </UiIconBase>
  );
}
function IconShape({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={8} cy={8} r={4.5} />
      <rect x={13} y={13} width={8} height={8} rx={1.2} />
      <path d="M12 3.5L4.5 20.5h15L12 3.5z" />
    </UiIconBase>
  );
}
function IconSave({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M5 3.5h11l4.5 4.5V19a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V5A1.5 1.5 0 015 3.5z" />
      <path d="M7.5 3.5v6h8v-6M7 20.5v-6h10v6" />
    </UiIconBase>
  );
}
function IconInfo({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 11v5.5" />
      <circle cx={12} cy={7.8} r={0.9} fill="currentColor" stroke="none" />
    </UiIconBase>
  );
}
function IconCheck({ size }: { size?: number }) {
  return (
    <UiIconBase size={size}>
      <path d="M4.5 12.5l5 5 10-11" />
    </UiIconBase>
  );
}

function CircleButton({
  label,
  active,
  onClick,
  children,
  scale = 1,
  danger = false,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  // Resizes the button's REAL width/height (not a `transform: scale()`) — a transform only
  // repaints the button larger while its actual layout/hit-test box stays at the original size.
  // Always 1 on this desktop-only app (no compact/phone mode), but kept as a real prop for parity
  // with the web app's own CircleButton.
  scale?: number;
  // Red outline + red icon variant, used for the trailing "delete" circle so it reads as a
  // distinct, harder-to-misclick destructive action rather than just another tool icon.
  danger?: boolean;
}) {
  const size = 28 * scale;
  return (
    <button
      onClick={onClick}
      title={label}
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: active ? "var(--color-amber-deep)" : "#fff",
        // Fixed dark icon color, not the theme-flipped --color-ink token — this button's own
        // background stays white in both themes, so the icon must too or it goes near-invisible
        // (light-on-white) once --color-ink flips light for dark mode's page text.
        color: danger ? "var(--color-rose)" : active ? "#fff" : "#201f33",
        boxShadow: danger
          ? "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1.5px var(--color-rose)"
          : "0 2px 6px rgba(46,49,66,0.22), 0 0 0 1px var(--color-line)",
      }}
    >
      {children}
    </button>
  );
}

function FlyoutPanel({ side, width = 130, children }: { side: "left" | "right"; width?: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 rounded-xl border border-line bg-white p-2.5 space-y-2"
      style={{ [side]: "calc(100% + 8px)", width, boxShadow: "0 4px 16px rgba(46,49,66,0.3)" } as React.CSSProperties}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function MiniSlider({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-soft mb-1">
        <span>{label}</span>
        <span dir="ltr" className="font-data">
          {value}
          {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full gf-slider-thumb" />
    </div>
  );
}

// Ported verbatim from the web app's own editor. Shared by every one of the free-drag side panels
// (ornament/shape/text/photo-adjust) — one instance covers all four since only one of them is ever
// mounted at a time.
const MENU_ANCHOR_TIE_EPS_PCT = 1;
// Which selected photo the circular floating menu visually hangs from — the topmost selected
// photo (ties within MENU_ANCHOR_TIE_EPS_PCT broken by whichever sits furthest right, matching
// this RTL app's own reading order). Deliberately a SEPARATE reference photo from `anchorPhoto` in
// the main component (which is "whichever selected photo receives single-target actions") — usually
// the same photo, but not guaranteed to be when several photos are selected.
function pickMenuAnchorPhoto(photos: AlbumPhotoElement[]): AlbumPhotoElement | null {
  if (photos.length === 0) return null;
  const minY = Math.min(...photos.map((p) => p.yPct));
  const topCandidates = photos.filter((p) => p.yPct <= minY + MENU_ANCHOR_TIE_EPS_PCT);
  return topCandidates.reduce((best, p) => (p.xPct + p.widthPct > best.xPct + best.widthPct ? p : best), topCandidates[0]);
}

// Normally the menu hangs from the anchor photo's own top edge, bounded below by the green
// print-safe frame's bottom edge. But a photo sitting on or near that bottom edge leaves no room to
// hang the menu down from — so once any selected photo's own bottom edge comes within
// FLIP_TRIGGER_CM of the frame's bottom, the menu flips: it hangs UP from the anchor's own bottom
// edge instead, with the frame's top edge as its ceiling.
//
// The menu's FAR edge is first clamped to the SELECTED PHOTO's own top/bottom edge (not the green
// frame) — with PHOTO_BOUND_SLACK_CM of allowed overflow past that edge. menuHeightPct is the
// menu's own actually-rendered height (measured via a ref, not guessed), so this clamp is exact
// regardless of how many buttons happen to be in it. The flip TRIGGER itself is intentionally still
// measured against the frame's bottom — that decision is about whether there's room in the frame to
// hang the menu down at all, a separate question from how big the menu's own box is once a
// direction is picked.
// On TOP of that photo-relative clamp, a hard CANVAS-relative clamp always applies too — the menu's
// own top and bottom edges must never cross the canvas's own top (0%) / bottom (100%) boundary, no
// matter where the anchor photo itself sits (a photo near the very top/bottom edge could otherwise
// still let the photo-relative clamp above push the menu off the canvas entirely).
const FLIP_TRIGGER_CM = 3;
const PHOTO_BOUND_SLACK_CM = 1;
function photoMenuPositionStyle(
  selectedPhotos: AlbumPhotoElement[],
  anchor: AlbumPhotoElement,
  album: { height_cm: number },
  marginInsetPct: { x: number; y: number } | null,
  menuHeightPct: number | null
): React.CSSProperties {
  const heightCm = album.height_cm > 0 ? album.height_cm : 1;
  const frameTopPct = marginInsetPct?.y ?? 0;
  const frameBottomPct = 100 - frameTopPct;
  const slackPct = (PHOTO_BOUND_SLACK_CM / heightCm) * 100;
  const photoTopPct = anchor.yPct;
  const photoBottomPct = anchor.yPct + anchor.heightPct;

  const bottomDistancesCm = selectedPhotos.map((p) => ((frameBottomPct - (p.yPct + p.heightPct)) / 100) * heightCm);
  const shouldFlip = bottomDistancesCm.length > 0 && Math.min(...bottomDistancesCm) < FLIP_TRIGGER_CM;

  if (shouldFlip) {
    let bottomPct = 100 - photoBottomPct;
    if (menuHeightPct != null) {
      const maxBottomPct = 100 - (photoTopPct - slackPct) - menuHeightPct;
      bottomPct = Math.min(bottomPct, maxBottomPct);
      bottomPct = Math.max(0, Math.min(bottomPct, 100 - menuHeightPct));
    }
    return { top: "auto", bottom: `${bottomPct}%` };
  }

  let topPct = photoTopPct;
  if (menuHeightPct != null) {
    const maxTopPct = photoBottomPct + slackPct - menuHeightPct;
    topPct = Math.min(topPct, maxTopPct);
    topPct = Math.max(0, Math.min(topPct, 100 - menuHeightPct));
  }
  return { top: `${topPct}%`, bottom: "auto" };
}

function useDraggablePanelOffset(
  resetKey: string | null,
  clampOffset?: (offset: { x: number; y: number }) => { x: number; y: number },
  controlled?: { offset: { x: number; y: number }; onChange: (offset: { x: number; y: number }) => void }
) {
  const [internalOffset, setInternalOffset] = useState({ x: 0, y: 0 });
  const [trackedKey, setTrackedKey] = useState(resetKey);
  if (!controlled && resetKey !== trackedKey) {
    setTrackedKey(resetKey);
    setInternalOffset({ x: 0, y: 0 });
  }
  const offset = controlled ? controlled.offset : internalOffset;
  const setOffset = controlled ? controlled.onChange : setInternalOffset;
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  // Exposed so the panel can turn OFF its own open/close CSS transition on the same `transform`
  // property while a real drag is in progress — without this, every pointermove during a drag was
  // fighting a 220ms eased transition on `transform`, so the panel visibly lagged/rubber-banded
  // behind the cursor instead of tracking it 1:1.
  const [isDragging, setIsDragging] = useState(false);

  // preventDefault on both down and move — without it, dragging the grip across the page still
  // kicks off the browser's own native text-selection-drag (since the grip sits outside the
  // canvas's `select-none`), highlighting whatever text the cursor passes over while the panel
  // moves. stopPropagation alone doesn't suppress that; preventDefault does.
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: offset.x, startY: offset.y };
    setIsDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const raw = {
      x: dragRef.current.startX + (e.clientX - dragRef.current.startClientX),
      y: dragRef.current.startY + (e.clientY - dragRef.current.startClientY),
    };
    setOffset(clampOffset ? clampOffset(raw) : raw);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
    setIsDragging(false);
  };

  return { offset, isDragging, gripHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}

// The small grabbable strip every draggable panel renders at its own top edge — a dedicated grip
// rather than making the whole panel draggable so it never steals a click/drag meant for one of
// the panel's own sliders or buttons.
function PanelDragGrip({ handlers }: { handlers: ReturnType<typeof useDraggablePanelOffset>["gripHandlers"] }) {
  return (
    <div
      {...handlers}
      title="גררו כדי להזיז את הפאנל"
      className="flex items-center justify-center gap-1 h-5 -mt-0.5 -mx-0.5 mb-0.5 rounded-t-lg cursor-grab active:cursor-grabbing touch-none"
      style={{ background: "var(--color-amber-deep)", userSelect: "none", WebkitUserSelect: "none" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
      <span className="text-[8px] font-bold text-white">גררו להזזה</span>
    </div>
  );
}

// A user-resizable panel size, layered on top of a fixed default (widthPx/heightPx) via a
// bottom-right-corner handle. Deliberately does NOT reset per element selection (unlike
// useDraggablePanelOffset's offset) — the panel should stay the same size every time, so once
// resized, that becomes the new standing default for every subsequent photo too.
function useResizablePanelSize(defaultWidthPx: number, defaultHeightPx: number) {
  const [override, setOverride] = useState<{ width: number; height: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startWidth: number; startHeight: number } | null>(null);
  const MIN_SIZE_PX = 70;

  const width = override?.width ?? defaultWidthPx;
  const height = override?.height ?? defaultHeightPx;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startWidth: width, startHeight: height };
    setIsResizing(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setOverride({
      width: Math.max(MIN_SIZE_PX, dragRef.current.startWidth + (e.clientX - dragRef.current.startClientX)),
      height: Math.max(MIN_SIZE_PX, dragRef.current.startHeight + (e.clientY - dragRef.current.startClientY)),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
    setIsResizing(false);
  };

  return { width, height, isResizing, resizeHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}

// The small corner handle that drives useResizablePanelSize — bottom-right, matching the panel's
// top-left anchor (its top/left position is fixed) so growing the box always extends AWAY from the
// anchor, never fighting the fixed position.
function PanelResizeHandle({ handlers }: { handlers: ReturnType<typeof useResizablePanelSize>["resizeHandlers"] }) {
  return (
    <div
      {...handlers}
      title="גררו כדי לשנות את גודל הפאנל"
      className="absolute -bottom-1 -right-1 h-4 w-4 flex items-end justify-end cursor-nwse-resize touch-none"
    >
      <svg width="12" height="12" viewBox="0 0 24 24">
        <circle cx="19" cy="19" r="2" fill="var(--color-amber-deep)" />
        <circle cx="19" cy="12" r="2" fill="var(--color-amber-deep)" />
        <circle cx="12" cy="19" r="2" fill="var(--color-amber-deep)" />
      </svg>
    </div>
  );
}

// A vertical strip of circular controls that floats beside the selected photo — deliberately
// rendered outside the canvas's own overflow-hidden ancestor (see the wrapping <div> around
// canvasRef in the main component) so it, and the flyout sliders it opens, can bleed past the
// photo's own frame instead of getting cropped by it.
function PhotoFloatingMenu({
  el,
  positionStyle,
  menuRef,
  panning,
  onTogglePan,
  onUpdate,
  onTrueSize,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
  buttonScale = 1,
  dragOffset,
  dragGripHandlers,
  shadowPanelOpen,
  onToggleShadowPanel,
  photoAdjustPanelOpen,
  onTogglePhotoAdjustPanel,
}: {
  el: AlbumPhotoElement;
  // Computed by photoMenuPositionStyle() from the group's own topmost-selected photo, not
  // necessarily this same `el` — see that function's own comment for the full anchor/flip/clamp
  // logic.
  positionStyle: React.CSSProperties;
  // The parent measures this root div's real rendered height to clamp the position precisely
  // against the green frame — see menuHeightPct's own comment.
  menuRef?: React.Ref<HTMLDivElement>;
  panning: boolean;
  onTogglePan: () => void;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  onTrueSize: () => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  buttonScale?: number;
  // Free drag-anywhere offset, layered on top of the computed positionStyle via `transform` — see
  // useDraggablePanelOffset's own comment.
  dragOffset: { x: number; y: number };
  dragGripHandlers: ReturnType<typeof useDraggablePanelOffset>["gripHandlers"];
  // Whether the shadow/border sliders are showing — lifted to the parent since that panel no
  // longer renders as a small flyout attached to this button (see PhotoShadowOverlayPanel) but as
  // a layer positioned over the "עריכת תמונה" panel instead, which the parent owns.
  shadowPanelOpen: boolean;
  onToggleShadowPanel: () => void;
  // Whether the "עריכת תמונה" color/tone adjustments panel is showing — no longer opens
  // automatically the moment a photo is selected; this button opens/closes it manually, same
  // lifted-to-the-parent pattern as shadowPanelOpen above.
  photoAdjustPanelOpen: boolean;
  onTogglePhotoAdjustPanel: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<null | "opacity" | "blur" | "rotation">(null);
  // Always pinned to the photo's own right edge (screen-right — el.xPct/widthPct are plain
  // left-to-right canvas percentages regardless of the app's RTL text direction) and following it
  // as it's dragged — it used to flip to the photo's left edge once the photo got close to the
  // canvas's right edge, which felt inconsistent/unpredictable.
  const side: "left" | "right" = "right";
  const rotationDeg = Math.round((((el.rotation ?? 0) % 360) + 360) % 360);
  const toggle = (panel: typeof openPanel) => setOpenPanel((p) => (p === panel ? null : panel));

  return (
    <div
      ref={menuRef}
      className="absolute z-20 flex flex-col gap-0.5"
      style={{
        ...positionStyle,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <PanelDragGrip handlers={dragGripHandlers} />
      <CircleButton scale={buttonScale} label="עריכת תמונה — חשיפה, ניגודיות, איזון לבן ועוד" active={photoAdjustPanelOpen} onClick={onTogglePhotoAdjustPanel}>
        <IconAdjust />
      </CircleButton>
      <CircleButton scale={buttonScale} label="שחור-לבן" active={el.filter === "bw"} onClick={() => onUpdate({ filter: el.filter === "bw" ? "none" : "bw" })}>
        <IconBW />
      </CircleButton>
      <CircleButton scale={buttonScale} label="גווני ספיה" active={el.filter === "sepia"} onClick={() => onUpdate({ filter: el.filter === "sepia" ? "none" : "sepia" })}>
        <IconSepia />
      </CircleButton>
      {/* No flyout here any more — double-clicking the photo now centers it directly (see the
          canvas's own onDoubleClick), so a "מרכז תמונה" flyout button was pure redundancy. The
          circle's own active state is enough of a marker that pan mode is on. */}
      <CircleButton scale={buttonScale} label="מיקום התמונה במסגרת — גררו את התמונה כדי למקם אותה, או לחצו פעמיים על התמונה כדי למרכז" active={panning} onClick={onTogglePan}>
        <IconFocal />
      </CircleButton>
      <CircleButton scale={buttonScale} label="הצגה בגודל נכון — מתאים את המסגרת ליחס הרוחב/גובה האמיתי של התמונה" onClick={onTrueSize}>
        <IconTrueSize />
      </CircleButton>
      <CircleButton
        scale={buttonScale}
        label="שמירת יחס גובה-רוחב בשינוי גודל מהפינות"
        active={!!el.lockAspect}
        onClick={() => onUpdate({ lockAspect: !el.lockAspect })}
      >
        <IconAspectLock />
      </CircleButton>
      <CircleButton
        scale={buttonScale}
        label={el.locked ? "נעולה — לחצו לשחרור המיקום והגודל" : "נעילת מיקום וגודל"}
        active={!!el.locked}
        onClick={() => onUpdate({ locked: !el.locked })}
      >
        <IconLock />
      </CircleButton>
      <div className="relative">
        <CircleButton scale={buttonScale} label="שקיפות" active={openPanel === "opacity" || (el.opacity ?? 100) < 100} onClick={() => toggle("opacity")}>
          <IconOpacity />
        </CircleButton>
        {openPanel === "opacity" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton scale={buttonScale} label="טשטוש" active={openPanel === "blur" || !!el.blur} onClick={() => toggle("blur")}>
          <IconBlur />
        </CircleButton>
        {openPanel === "blur" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="טשטוש (Blur)" value={el.blur ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ blur: v })} />
          </FlyoutPanel>
        )}
      </div>
      <div className="relative">
        <CircleButton scale={buttonScale} label="סיבוב" active={openPanel === "rotation" || !!el.rotation} onClick={() => toggle("rotation")}>
          <IconRotate />
        </CircleButton>
        {openPanel === "rotation" && (
          <FlyoutPanel side={side}>
            <MiniSlider label="סיבוב" value={rotationDeg} min={0} max={360} unit="°" onChange={(deg) => onUpdate({ rotation: deg })} />
          </FlyoutPanel>
        )}
      </div>
      <CircleButton scale={buttonScale} label="צל וקו מתאר" active={shadowPanelOpen || !!el.shadow || !!el.borderWidth} onClick={onToggleShadowPanel}>
        <IconShadow />
      </CircleButton>
      <CircleButton scale={buttonScale} label="קדימה — לשכבה העליונה" onClick={onBringToFront}>
        <IconToFront />
      </CircleButton>
      <CircleButton scale={buttonScale} label="אחורה — לשכבה התחתונה" onClick={onSendToBack}>
        <IconToBack />
      </CircleButton>
      <CircleButton scale={buttonScale} label="מחיקת התמונה/ות שנבחרו" danger onClick={onDeleteSelected}>
        <IconX />
      </CircleButton>
    </div>
  );
}

// The shadow/border-outline controls used to be a small flyout attached directly to the circle
// menu's own "צל" button — moved out to render as its own layer positioned exactly over the
// "עריכת תמונה" panel instead (see the parent's own photoShadowPanelOpen), since that flyout's 4-5
// controls were the single biggest contributor to the circle menu needing to scroll or shrink.
// This panel disappears the moment the photo is deselected (the parent resets photoShadowPanelOpen
// whenever the anchor photo changes), and reopens fresh — not still open — next time it's clicked.
function PhotoShadowOverlayPanel({
  el,
  onUpdate,
  onApplyShadowToAll,
  widthPx,
}: {
  el: AlbumPhotoElement;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  onApplyShadowToAll: () => void;
  widthPx: number;
}) {
  // מרחק/טשטוש (distance/blur) fall back to el.shadow (עוצמה) while unset, so an existing shadow
  // that predates these two fields still shows a sensible starting point. Left purely reactive,
  // that fallback would make dragging עוצמה visually drag distance/blur's thumbs along with it, so
  // both are materialized into real, independent stored values the moment a shadow first becomes
  // active (0 → positive) — from that tick on, all three are backed by separate fields.
  const shadowActiveTrackRef = useRef<{ id: string; wasActive: boolean } | null>(null);
  useEffect(() => {
    const isActive = !!el.shadow;
    const prev = shadowActiveTrackRef.current;
    const justActivated = !prev || prev.id !== el.id ? isActive : isActive && !prev.wasActive;
    if (justActivated && (el.shadowDistance === undefined || el.shadowBlur === undefined)) {
      onUpdate({ shadowDistance: el.shadowDistance ?? el.shadow, shadowBlur: el.shadowBlur ?? el.shadow });
    }
    shadowActiveTrackRef.current = { id: el.id, wasActive: isActive };
  }, [el.id, el.shadow, el.shadowDistance, el.shadowBlur, onUpdate]);

  return (
    <div
      className="rounded-xl border border-line bg-white shadow-sheet p-3 space-y-2.5"
      style={{ width: widthPx, boxShadow: "0 4px 16px rgba(46,49,66,0.3)" }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-bold">צל וקו מתאר</p>
      <MiniSlider label="עוצמת צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
      {!!el.shadow && (
        <>
          <MiniSlider
            label="מרחק צל"
            value={el.shadowDistance ?? el.shadow ?? 0}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onUpdate({ shadowDistance: v })}
          />
          <MiniSlider
            label="טשטוש צל"
            value={el.shadowBlur ?? el.shadow ?? 0}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => onUpdate({ shadowBlur: v })}
          />
        </>
      )}
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <button onClick={onApplyShadowToAll} className="w-full rounded-lg py-1.5 text-[10px] font-semibold bg-chip text-ink-soft">
        החל על כל התמונות בדף
      </button>
    </div>
  );
}

// Small section-group label for PhotoAdjustFloatingMenu below — purely visual grouping (WB/Tone/
// Presence/Detail), ported from the web app's own editor.
function AdjustSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-bold text-ink-soft uppercase tracking-wide text-[10px] pt-1 first:pt-0">{children}</p>;
}

// Ported from the web app's own editor. Opens for one or more selected photos (broadcasts to the
// whole selection via the same applyToSelectedPhotos already used for opacity/rotation/etc) — a
// plain object of small numeric sliders in the same visual language as Ornament/Shape's own
// menus, just wider since there's more to fit per row. See src/lib/albumAdjustments.ts for what
// each slider actually does to the pixels, and why Texture/Clarity/Dehaze aren't here. Dropped
// web's compact/maxHeightPx/widthPx props (phone-specific sizing) — not applicable to a fixed-size
// Electron window.
function PhotoAdjustFloatingMenu({
  el,
  onUpdate,
  maxHeightPx,
  widthPx,
}: {
  el: AlbumPhotoElement;
  onUpdate: (patch: Partial<AlbumPhotoElement>) => void;
  // Caller-driven size — see useResizablePanelSize/photoPanelSize where this is computed — so the
  // panel's real-world size stays whatever the photographer last resized/dragged it to, not a
  // fixed default forever.
  maxHeightPx?: number;
  widthPx?: number;
}) {
  const hasAny = hasAdjustments(el);
  return (
    <div
      className={`rounded-xl border border-line bg-white shadow-sheet ${widthPx != null ? "" : "w-[280px]"} p-3 space-y-2.5`}
      style={{ ...(widthPx != null ? { width: `${widthPx}px` } : null), ...(maxHeightPx != null ? { maxHeight: `${maxHeightPx}px`, overflowY: "auto" as const } : null) }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">עריכת תמונה</p>
        {hasAny && (
          <button
            onClick={() =>
              onUpdate({
                exposure: 0,
                contrast: 0,
                highlights: 0,
                shadows2: 0,
                whites: 0,
                blacks: 0,
                temp: 0,
                tint: 0,
                vibrance: 0,
                saturation2: 0,
                sharpness: 0,
              })
            }
            className="font-semibold text-ink-soft underline text-[10px]"
          >
            איפוס
          </button>
        )}
      </div>
      <AdjustSectionLabel>איזון לבן</AdjustSectionLabel>
      <MiniSlider label="חום" value={el.temp ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ temp: v })} />
      <MiniSlider label="גוון" value={el.tint ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ tint: v })} />
      <AdjustSectionLabel>גוונים</AdjustSectionLabel>
      <MiniSlider label="חשיפה" value={el.exposure ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ exposure: v })} />
      <MiniSlider label="ניגודיות" value={el.contrast ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ contrast: v })} />
      <MiniSlider label="אורות גבוהים" value={el.highlights ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ highlights: v })} />
      <MiniSlider label="צללים" value={el.shadows2 ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ shadows2: v })} />
      <MiniSlider label="לבנים" value={el.whites ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ whites: v })} />
      <MiniSlider label="שחורים" value={el.blacks ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ blacks: v })} />
      <AdjustSectionLabel>עוצמת צבע</AdjustSectionLabel>
      <MiniSlider label="עוצמה" value={el.vibrance ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ vibrance: v })} />
      <MiniSlider label="רוויה" value={el.saturation2 ?? 0} min={-100} max={100} onChange={(v) => onUpdate({ saturation2: v })} />
      <AdjustSectionLabel>פירוט</AdjustSectionLabel>
      <MiniSlider label="חידוד" value={el.sharpness ?? 0} min={0} max={100} onChange={(v) => onUpdate({ sharpness: v })} />
    </div>
  );
}

// Color + opacity + rotation are ALWAYS visible here (not behind a per-control toggle click like
// the photo menu's flyouts) — an ornament has far fewer controls than a photo, and hiding them
// behind an extra click read as "nothing happened" the first time someone selected one.
function OrnamentFloatingMenu({
  el,
  onUpdate,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
}: {
  el: AlbumOrnamentElement;
  onUpdate: (patch: Partial<AlbumOrnamentElement>) => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}) {
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {el.customOrnamentId && (
          <button
            onClick={() => onUpdate({ color: undefined })}
            title="צבע מקורי"
            className="h-6 w-6 rounded-full bg-[linear-gradient(45deg,#ddd_25%,transparent_25%,transparent_75%,#ddd_75%),linear-gradient(45deg,#ddd_25%,transparent_25%,transparent_75%,#ddd_75%)] bg-white"
            style={{
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
              boxShadow: !el.color ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        )}
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: (el.customOrnamentId ? el.color : el.color ?? "#2e3142") === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button onClick={onBringToFront} title="קדימה — לשכבה העליונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToFront />
        </button>
        <button onClick={onSendToBack} title="אחורה — לשכבה התחתונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToBack />
        </button>
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          title={el.locked ? "נעול — לחצו לשחרור" : "נעילת מיקום וגודל"}
          className="flex-1 h-7 rounded-lg flex items-center justify-center"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          <IconLock />
        </button>
        <button onClick={onDeleteSelected} title="מחיקה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-rose">
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

// Same always-visible pattern as OrnamentFloatingMenu above, plus a "מסכה" button — a shape can
// have any of the same 50 masks a photo can, applied via the masks picker panel (opened here,
// anchored to this button, sharing that same panel/state with the photo/sidebar entry points).
function ShapeFloatingMenu({
  el,
  albumHeightCm,
  onUpdate,
  onDeleteSelected,
  onBringToFront,
  onSendToBack,
  onOpenMasksPicker,
}: {
  el: AlbumShapeElement;
  albumHeightCm: number;
  onUpdate: (patch: Partial<AlbumShapeElement>) => void;
  onDeleteSelected: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onOpenMasksPicker: (rect: { top: number; left: number; width: number }) => void;
}) {
  const maskButtonRef = useRef<HTMLButtonElement>(null);
  const isLine = el.shapeStyle === "line";
  const linePx = Math.max(1, Math.min(100, Math.round((el.heightPct / 100) * albumHeightCm * PX_PER_CM)));
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: el.color === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      <button
        ref={maskButtonRef}
        onClick={() => {
          const r = maskButtonRef.current?.getBoundingClientRect();
          if (r) onOpenMasksPicker({ top: r.bottom, left: r.left, width: r.width });
        }}
        className="w-full h-7 rounded-lg bg-chip flex items-center justify-center gap-1.5 text-[11px] font-semibold text-ink-soft"
      >
        <IconMask size={12} />
        {el.maskId ? "שינוי מסכה" : "החלת מסכה"}
      </button>
      {isLine && (
        <MiniSlider
          label="עובי הקו"
          value={linePx}
          min={1}
          max={100}
          unit="px"
          onChange={(px) => {
            // Keeps the line's vertical center fixed while its thickness (heightPct) changes — same
            // recentering the resize handles already do — so nudging this slider doesn't also
            // silently drift the line's position.
            const newHeightPct = albumHeightCm > 0 ? (px / PX_PER_CM / albumHeightCm) * 100 : el.heightPct;
            const centerY = el.yPct + el.heightPct / 2;
            onUpdate({ heightPct: newHeightPct, yPct: centerY - newHeightPct / 2 });
          }}
        />
      )}
      <MiniSlider label="שקיפות" value={el.opacity ?? 100} min={0} max={100} unit="%" onChange={(v) => onUpdate({ opacity: v })} />
      <MiniSlider label="עוצמת צל" value={el.shadow ?? 0} min={0} max={100} unit="%" onChange={(v) => onUpdate({ shadow: v })} />
      <MiniSlider label="קו מתאר" value={el.borderWidth ?? 0} min={0} max={50} unit="px" onChange={(v) => onUpdate({ borderWidth: v })} />
      {!!el.borderWidth && (
        <div className="flex items-center gap-1.5">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ borderColor: c })}
              className="h-5 w-5 rounded-full"
              style={{ background: c, boxShadow: (el.borderColor ?? "#ffffff") === c ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button onClick={onBringToFront} title="קדימה — לשכבה העליונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToFront />
        </button>
        <button onClick={onSendToBack} title="אחורה — לשכבה התחתונה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-ink-soft">
          <IconToBack />
        </button>
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          title={el.locked ? "נעול — לחצו לשחרור" : "נעילת מיקום וגודל"}
          className="flex-1 h-7 rounded-lg flex items-center justify-center"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          <IconLock />
        </button>
        <button onClick={onDeleteSelected} title="מחיקה" className="flex-1 h-7 rounded-lg bg-chip flex items-center justify-center text-rose">
          <IconTrash />
        </button>
      </div>
    </div>
  );
}

// Ported from the web app's own editor, which has this as a floating panel (same pattern as
// Ornament/Shape above) — this used to be a static, always-visible sidebar block here instead.
// No lock button (unlike web's version): element locking isn't ported to desktop yet.
function TextFloatingMenu({
  el,
  album,
  onUpdate,
  onDeleteSelected,
}: {
  el: AlbumTextElement;
  album: { width_cm: number; height_cm: number };
  onUpdate: (patch: Partial<AlbumTextElement>) => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div
      className="w-[150px] rounded-xl border border-line bg-white p-2.5 shadow-sheet space-y-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5">
        {TEXT_COLOR_PALETTE.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onUpdate({ color: value })}
            title={label}
            className="h-6 w-6 rounded-full"
            style={{
              background: value,
              boxShadow: el.color === value ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
            }}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {(["right", "center", "left"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onUpdate({ align: a })}
            className="flex-1 rounded-full py-1 text-[9px] font-semibold"
            style={{
              background: el.align === a ? "var(--color-amber-deep)" : "var(--color-chip)",
              color: el.align === a ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
          </button>
        ))}
      </div>
      <select
        value={el.fontFamily ?? "heebo"}
        onChange={(e) => onUpdate({ fontFamily: e.target.value })}
        className="w-full rounded-lg px-2 py-1.5 text-[10px] font-semibold bg-white border border-line"
        style={{ fontFamily: albumFontFamilyCss(el.fontFamily) }}
      >
        <optgroup label="פונטים בעברית">
          {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
              {f.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="פונטים באנגלית">
          {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
              {f.label}
            </option>
          ))}
        </optgroup>
      </select>
      <MiniSlider
        label="גודל טקסט"
        value={el.fontSize}
        min={2}
        max={250}
        unit="pt"
        // Same bound as the web app's own version — see textHeightPctForFontSize's/
        // MAX_TEXT_HEIGHT_OVERSIZE_RATIO's own comments in src/lib/albumTextSizing.ts.
        onChange={(v) => {
          const natural = textHeightPctForFontSize(v, album);
          onUpdate({ fontSize: v, heightPct: Math.min(Math.max(el.heightPct ?? 0, natural), natural * MAX_TEXT_HEIGHT_OVERSIZE_RATIO) });
        }}
      />
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate({ locked: !el.locked })}
          className="flex-1 h-7 rounded-lg text-[10px] font-semibold"
          style={{ background: el.locked ? "var(--color-amber-deep)" : "var(--color-chip)", color: el.locked ? "#fff" : "var(--color-ink-soft)" }}
        >
          {el.locked ? "נעול" : "נעילה"}
        </button>
        <button onClick={onDeleteSelected} className="flex-1 h-7 rounded-lg bg-chip text-rose text-[10px] font-semibold">
          מחיקה
        </button>
      </div>
    </div>
  );
}

// The print-safe margin is a hard constraint for anything placed AUTOMATICALLY (templates, the
// multi-photo auto-layout) — every frame designed on a nominal 0-100 full-bleed canvas gets
// linearly rescaled into the album's actual safe-print box, so no automatically-generated layout
// can ever cross the green line regardless of which album size it's applied to. Manual dragging is
// deliberately NOT clamped by this — a photographer can always drag a photo past the margin on
// purpose; only automatic placement is constrained.
export function marginInsetPctFor(album: { width_cm: number; height_cm: number; safe_margin_cm?: number }): { x: number; y: number } | null {
  const marginCm = album.safe_margin_cm ?? 0.5;
  return album.width_cm > 0 && album.height_cm > 0 ? { x: (marginCm / album.width_cm) * 100, y: (marginCm / album.height_cm) * 100 } : null;
}

export function fitFramesToSafeArea(frames: AlbumFrame[], marginInsetPct: { x: number; y: number } | null): AlbumFrame[] {
  if (!marginInsetPct) return frames;
  const { x: mx, y: my } = marginInsetPct;
  const safeWidth = 100 - 2 * mx;
  const safeHeight = 100 - 2 * my;
  if (safeWidth <= 0 || safeHeight <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    xPct: mx + (f.xPct / 100) * safeWidth,
    yPct: my + (f.yPct / 100) * safeHeight,
    widthPct: (f.widthPct / 100) * safeWidth,
    heightPct: (f.heightPct / 100) * safeHeight,
  }));
}

// adjust/sharpness params ported from the web app's own editor (src/lib/albumRender.ts) — the
// url(#...) filter ids reference the <svg><defs> block rendered alongside the canvas.
export function cssFilterFor(
  filter: AlbumPhotoFilter | undefined,
  blurPct: number | undefined,
  adjust?: { id: string; adj: PhotoAdjustments },
  sharpness?: number
): string | undefined {
  const parts: string[] = [];
  if (filter === "bw") parts.push("grayscale(1)");
  else if (filter === "sepia") parts.push("sepia(0.85)");
  if (blurPct) parts.push(`blur(${(blurPct / 100) * ALBUM_BLUR_MAX_PX}px)`);
  if (adjust && hasAdjustments(adjust.adj)) parts.push(`url(#${adjustmentsFilterId(adjust.id, adjust.adj)})`);
  if (adjust && sharpness) parts.push(`url(#${sharpenFilterId(adjust.id, sharpness)})`);
  return parts.length ? parts.join(" ") : undefined;
}

// box-shadow (unlike filter: drop-shadow on a descendant) isn't clipped by the frame's own
// overflow-hidden, so it's the one that can actually bleed outside a cropped photo frame.
export function boxShadowFor(shadowPct: number | undefined, distancePct?: number, blurPct?: number): string | undefined {
  if (!shadowPct) return undefined;
  const blurPx = ((blurPct ?? shadowPct) / 100) * 24;
  const offsetPx = ((distancePct ?? shadowPct) / 100) * 10;
  const alpha = 0.15 + (shadowPct / 100) * 0.45;
  return `${offsetPx}px ${offsetPx}px ${blurPx}px rgba(0,0,0,${alpha})`;
}

// An `outline` (even with a negative offset) gets silently clipped by this same element's own
// overflow-hidden, so the border is folded into an inset box-shadow entry instead — box-shadow,
// unlike outline, isn't subject to that clipping.
export function combinedBoxShadowFor(
  shadowPct: number | undefined,
  borderWidthPx: number | undefined,
  borderColor: string | undefined,
  distancePct?: number,
  blurPct?: number
): string | undefined {
  const drop = boxShadowFor(shadowPct, distancePct, blurPct);
  const border = borderWidthPx ? `inset 0 0 0 ${borderWidthPx}px ${borderColor ?? "#fff"}` : undefined;
  return [drop, border].filter(Boolean).join(", ") || undefined;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

// Resizes a frame from any of its 8 handles, anchored at the OPPOSITE edge/corner (dragging the
// top-left corner keeps the bottom-right fixed, dragging the right edge keeps the left edge
// fixed, etc). widthPct/heightPct are both percentages of the same canvas box, so keeping their
// ratio constant while aspect-locked also keeps the true on-screen aspect ratio constant — no
// canvas-aspect correction needed since both axes scale by the same "% to px" factor.
function computeResize(
  handle: ResizeHandle,
  start: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  dxPct: number,
  dyPct: number,
  lockAspect: boolean,
  // Outline-only shapes (rect-outline/circle-outline/line) are explicitly allowed to be dragged
  // past the page's own edges — they're stroke/line decorations that photographers sometimes want
  // to bleed off the page on purpose, unlike a photo or a filled shape where that would just be a
  // mistake. Skips the 0..100 clamp entirely for these; MIN_W/MIN_H still apply either way.
  allowOverflow = false,
  // Alt-held resize — ported from the web app's own editor: grows/shrinks symmetrically from the
  // element's own ORIGINAL center on whichever axis is being dragged, instead of the normal
  // "opposite edge stays fixed" behavior. Doubling the delta on that axis while re-centering on
  // the start box's own center achieves this — both edges move by the raw cursor delta each,
  // simultaneously.
  symmetric = false
): { xPct: number; yPct: number; widthPct: number; heightPct: number } {
  const MIN_W = 8;
  const MIN_H = 6;
  const h: "w" | "e" | "" = handle.includes("w") ? "w" : handle.includes("e") ? "e" : "";
  const v: "n" | "s" | "" = handle.includes("n") ? "n" : handle.includes("s") ? "s" : "";
  const isCorner = h !== "" && v !== "";
  const symMult = symmetric ? 2 : 1;

  let newWidth = start.widthPct;
  let newHeight = start.heightPct;
  if (h === "e") newWidth = start.widthPct + dxPct * symMult;
  else if (h === "w") newWidth = start.widthPct - dxPct * symMult;
  if (v === "s") newHeight = start.heightPct + dyPct * symMult;
  else if (v === "n") newHeight = start.heightPct - dyPct * symMult;

  if (lockAspect && isCorner && start.widthPct > 0 && start.heightPct > 0) {
    const ratio = start.widthPct / start.heightPct;
    const scaleW = Math.abs(newWidth / start.widthPct - 1);
    const scaleH = Math.abs(newHeight / start.heightPct - 1);
    if (scaleW >= scaleH) newHeight = newWidth / ratio;
    else newWidth = newHeight * ratio;
  }

  newWidth = Math.max(MIN_W, newWidth);
  newHeight = Math.max(MIN_H, newHeight);

  let newLeft: number;
  let newTop: number;
  if (symmetric) {
    const startCenterX = start.xPct + start.widthPct / 2;
    const startCenterY = start.yPct + start.heightPct / 2;
    newLeft = h !== "" ? startCenterX - newWidth / 2 : start.xPct;
    newTop = v !== "" ? startCenterY - newHeight / 2 : start.yPct;
  } else {
    newLeft = h === "w" ? start.xPct + start.widthPct - newWidth : start.xPct;
    newTop = v === "n" ? start.yPct + start.heightPct - newHeight : start.yPct;
  }

  if (allowOverflow) {
    return { xPct: newLeft, yPct: newTop, widthPct: newWidth, heightPct: newHeight };
  }

  const clampedLeft = Math.max(0, Math.min(newLeft, 100 - newWidth));
  const clampedTop = Math.max(0, Math.min(newTop, 100 - newHeight));
  const clampedWidth = Math.min(newWidth, 100 - clampedLeft);
  const clampedHeight = Math.min(newHeight, 100 - clampedTop);

  return { xPct: clampedLeft, yPct: clampedTop, widthPct: clampedWidth, heightPct: clampedHeight };
}

const RESIZE_HANDLE_CURSORS: Record<ResizeHandle, string> = {
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
};

// One handle per edge/corner so the whole frame boundary is grabbable, not just one corner —
// every handle stays fully inside the box (never straddling its edge) since the parent's
// overflow-hidden (needed to crop the photo) would clip, and make unclickable, anything bleeding
// past it. Corner handles are small visible squares; edge handles are thin invisible hit-strips
// along the middle of each side so hovering the frame's border itself shows the resize cursor.
function renderResizeHandles(el: AlbumElement, startDrag: (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize", handle?: ResizeHandle) => void) {
  const corner = (handle: ResizeHandle, style: React.CSSProperties) => (
    <span
      key={handle}
      onPointerDown={(e) => startDrag(e, el, "resize", handle)}
      className={`absolute h-3 w-3 bg-amber-deep rounded-sm z-10 ${RESIZE_HANDLE_CURSORS[handle]}`}
      style={style}
    />
  );
  const edge = (handle: ResizeHandle, style: React.CSSProperties) => (
    <span
      key={handle}
      onPointerDown={(e) => startDrag(e, el, "resize", handle)}
      className={`absolute ${RESIZE_HANDLE_CURSORS[handle]}`}
      style={style}
    />
  );
  return (
    <>
      {corner("nw", { top: 2, left: 2 })}
      {corner("ne", { top: 2, right: 2 })}
      {corner("sw", { bottom: 2, left: 2 })}
      {corner("se", { bottom: 2, right: 2 })}
      {edge("n", { top: 0, left: "20%", right: "20%", height: 8 })}
      {edge("s", { bottom: 0, left: "20%", right: "20%", height: 8 })}
      {edge("w", { left: 0, top: "20%", bottom: "20%", width: 8 })}
      {edge("e", { right: 0, top: "20%", bottom: "20%", width: 8 })}
    </>
  );
}

const SNAP_THRESHOLD = 1.2; // % of canvas

function elementBox(el: AlbumElement): { left: number; top: number; right: number; bottom: number; centerX: number; centerY: number } {
  const height = el.type === "photo" ? el.heightPct : (el.heightPct ?? 15);
  return {
    left: el.xPct,
    top: el.yPct,
    right: el.xPct + el.widthPct,
    bottom: el.yPct + height,
    centerX: el.xPct + el.widthPct / 2,
    centerY: el.yPct + height / 2,
  };
}

// While dragging an element, checks its candidate position against the page center and every
// other element's edges/center on the same page — returns guide lines to draw plus a snapped
// position when within SNAP_THRESHOLD, so aligning two frames (or centering one on the page)
// is something the photographer can see and feel, not just eyeball.
function computeAlignment(
  dragging: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[]
): { guides: { axis: "v" | "h"; pos: number }[]; snapXPct?: number; snapYPct?: number } {
  const guides: { axis: "v" | "h"; pos: number }[] = [];
  let snapXPct: number | undefined;
  let snapYPct: number | undefined;
  const left = dragging.xPct;
  const right = dragging.xPct + dragging.widthPct;
  const centerX = dragging.xPct + dragging.widthPct / 2;
  const top = dragging.yPct;
  const bottom = dragging.yPct + dragging.heightPct;
  const centerY = dragging.yPct + dragging.heightPct / 2;

  if (Math.abs(centerX - 50) < SNAP_THRESHOLD) {
    guides.push({ axis: "v", pos: 50 });
    snapXPct = 50 - dragging.widthPct / 2;
  }
  if (Math.abs(centerY - 50) < SNAP_THRESHOLD) {
    guides.push({ axis: "h", pos: 50 });
    snapYPct = 50 - dragging.heightPct / 2;
  }

  for (const other of others) {
    const box = elementBox(other);
    const xChecks: [number, number, number][] = [
      [left, box.left, box.left],
      [right, box.right, box.right - dragging.widthPct],
      [centerX, box.centerX, box.centerX - dragging.widthPct / 2],
    ];
    for (const [dragVal, otherVal, snapTo] of xChecks) {
      if (Math.abs(dragVal - otherVal) < SNAP_THRESHOLD) {
        guides.push({ axis: "v", pos: otherVal });
        if (snapXPct === undefined) snapXPct = snapTo;
      }
    }
    const yChecks: [number, number, number][] = [
      [top, box.top, box.top],
      [bottom, box.bottom, box.bottom - dragging.heightPct],
      [centerY, box.centerY, box.centerY - dragging.heightPct / 2],
    ];
    for (const [dragVal, otherVal, snapTo] of yChecks) {
      if (Math.abs(dragVal - otherVal) < SNAP_THRESHOLD) {
        guides.push({ axis: "h", pos: otherVal });
        if (snapYPct === undefined) snapYPct = snapTo;
      }
    }
  }
  return { guides, snapXPct, snapYPct };
}

function boxesIntersect(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Detects the classic "sandwiched between two neighbors" equal-spacing case on each axis
// independently: the nearest same-row (or same-column) neighbor on either side of the dragged
// element. When both gaps are already close to equal, snaps the drag so they become EXACTLY
// equal and returns a pair of guide segments (one per gap) so the photographer can see which two
// gaps just matched, mirroring Figma-style spacing indicators.
function computeSpacingGuides(
  dragging: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[]
): { guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[]; snapXPct?: number; snapYPct?: number } {
  const guides: { orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[] = [];
  let snapXPct: number | undefined;
  let snapYPct: number | undefined;
  const boxes = others.map(elementBox);
  const dLeft = dragging.xPct;
  const dRight = dragging.xPct + dragging.widthPct;
  const dTop = dragging.yPct;
  const dBottom = dragging.yPct + dragging.heightPct;
  const dCenterY = dragging.yPct + dragging.heightPct / 2;
  const dCenterX = dragging.xPct + dragging.widthPct / 2;

  const rowMates = boxes.filter((b) => b.top < dBottom && b.bottom > dTop);
  const leftN = rowMates.filter((b) => b.right <= dLeft + 0.5).sort((a, b) => b.right - a.right)[0];
  const rightN = rowMates.filter((b) => b.left >= dRight - 0.5).sort((a, b) => a.left - b.left)[0];
  if (leftN && rightN) {
    const gapLeft = dLeft - leftN.right;
    const gapRight = rightN.left - dRight;
    if (gapLeft > 0.3 && gapRight > 0.3 && Math.abs(gapLeft - gapRight) < SNAP_THRESHOLD) {
      const avgGap = (gapLeft + gapRight) / 2;
      snapXPct = leftN.right + avgGap;
      guides.push({ orientation: "horizontal", x: leftN.right, y: dCenterY, length: avgGap });
      guides.push({ orientation: "horizontal", x: snapXPct + dragging.widthPct, y: dCenterY, length: avgGap });
    }
  }

  const colMates = boxes.filter((b) => b.left < dRight && b.right > dLeft);
  const topN = colMates.filter((b) => b.bottom <= dTop + 0.5).sort((a, b) => b.bottom - a.bottom)[0];
  const bottomN = colMates.filter((b) => b.top >= dBottom - 0.5).sort((a, b) => a.top - b.top)[0];
  if (topN && bottomN) {
    const gapTop = dTop - topN.bottom;
    const gapBottom = bottomN.top - dBottom;
    if (gapTop > 0.3 && gapBottom > 0.3 && Math.abs(gapTop - gapBottom) < SNAP_THRESHOLD) {
      const avgGap = (gapTop + gapBottom) / 2;
      snapYPct = topN.bottom + avgGap;
      guides.push({ orientation: "vertical", x: dCenterX, y: topN.bottom, length: avgGap });
      guides.push({ orientation: "vertical", x: dCenterX, y: snapYPct + dragging.heightPct, length: avgGap });
    }
  }

  return { guides, snapXPct, snapYPct };
}

// Guide lines while RESIZING — checks only the edge(s) actually moving (per the active handle)
// against every other element's matching edge, the page's own edges, and the page center, so
// growing/shrinking a frame shows the same kind of "you've reached another photo's border" line
// that dragging already shows, on both the width and the height axis independently.
function computeResizeGuides(
  handle: ResizeHandle,
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  others: AlbumElement[],
  // Ported from the web app's own editor — the print-safe margin line is now itself a snap
  // target (like the page edges/center and other elements already were), and marginSnapX/Y report
  // back whether the resize actually landed on it so the caller can brighten the margin guide as
  // visual confirmation, the same way an element-to-element snap already shows its own guide line.
  marginInsetPct: { x: number; y: number } | null
): {
  guides: { axis: "v" | "h"; pos: number }[];
  box: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  marginSnapX: boolean;
  marginSnapY: boolean;
} {
  const guides: { axis: "v" | "h"; pos: number }[] = [];
  const result = { ...box };
  const marginX = marginInsetPct ? [marginInsetPct.x, 100 - marginInsetPct.x] : [];
  const marginY = marginInsetPct ? [marginInsetPct.y, 100 - marginInsetPct.y] : [];
  const targetsX = [0, 50, 100, ...marginX, ...others.map((o) => elementBox(o).left), ...others.map((o) => elementBox(o).right)];
  const targetsY = [0, 50, 100, ...marginY, ...others.map((o) => elementBox(o).top), ...others.map((o) => elementBox(o).bottom)];
  let marginSnapX = false;
  let marginSnapY = false;

  if (handle.includes("e")) {
    const right = box.xPct + box.widthPct;
    const hit = targetsX.find((t) => Math.abs(right - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "v", pos: hit });
      result.widthPct = Math.max(8, hit - box.xPct);
      if (marginX.includes(hit)) marginSnapX = true;
    }
  } else if (handle.includes("w")) {
    const hit = targetsX.find((t) => Math.abs(box.xPct - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "v", pos: hit });
      const right = box.xPct + box.widthPct;
      result.xPct = hit;
      result.widthPct = Math.max(8, right - hit);
      if (marginX.includes(hit)) marginSnapX = true;
    }
  }

  if (handle.includes("s")) {
    const bottom = box.yPct + box.heightPct;
    const hit = targetsY.find((t) => Math.abs(bottom - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "h", pos: hit });
      result.heightPct = Math.max(6, hit - box.yPct);
      if (marginY.includes(hit)) marginSnapY = true;
    }
  } else if (handle.includes("n")) {
    const hit = targetsY.find((t) => Math.abs(box.yPct - t) < SNAP_THRESHOLD);
    if (hit !== undefined) {
      guides.push({ axis: "h", pos: hit });
      const bottom = box.yPct + box.heightPct;
      result.yPct = hit;
      result.heightPct = Math.max(6, bottom - hit);
      if (marginY.includes(hit)) marginSnapY = true;
    }
  }

  return { guides, box: result, marginSnapX, marginSnapY };
}

// Seeds a brand-new "custom" canvas from the spread's existing preset-layout photos (matching the
// same position math the split/feature/stack renderers use) so switching a page to free-form
// never silently loses the photos it already had.
function seedElementsFromPreset(spread: GalleryAlbumSpreadRow): AlbumElement[] {
  const hasPhotoElement = spread.elements.some((el) => el.type === "photo");
  if (hasPhotoElement || !spread.photo_id_1) return spread.elements;

  const seeded: AlbumElement[] = [];
  if (!spread.photo_id_2) {
    seeded.push({
      id: "seed-1",
      type: "photo",
      photoId: spread.photo_id_1,
      xPct: 0,
      yPct: 0,
      widthPct: 100,
      heightPct: 100,
      focalX: spread.focal_x_1,
      focalY: spread.focal_y_1,
    });
  } else if (spread.layout === "stack") {
    seeded.push(
      { id: "seed-1", type: "photo", photoId: spread.photo_id_1, xPct: 0, yPct: 0, widthPct: 100, heightPct: 49, focalX: spread.focal_x_1, focalY: spread.focal_y_1 },
      { id: "seed-2", type: "photo", photoId: spread.photo_id_2, xPct: 0, yPct: 51, widthPct: 100, heightPct: 49, focalX: spread.focal_x_2, focalY: spread.focal_y_2 }
    );
  } else {
    const width1 = spread.layout === "feature" ? 64 : 49;
    const width2 = spread.layout === "feature" ? 34 : 49;
    // photo1 renders on the right in the app's RTL UI — same mirroring as the PDF export.
    seeded.push(
      { id: "seed-2", type: "photo", photoId: spread.photo_id_2, xPct: 0, yPct: 0, widthPct: width2, heightPct: 100, focalX: spread.focal_x_2, focalY: spread.focal_y_2 },
      { id: "seed-1", type: "photo", photoId: spread.photo_id_1, xPct: 100 - width1, yPct: 0, widthPct: width1, heightPct: 100, focalX: spread.focal_x_1, focalY: spread.focal_y_1 }
    );
  }
  return [...seeded, ...spread.elements];
}

// A free-form drag/resize canvas — used two ways:
// - "overlay" mode: the spread's existing preset photo layout (split/feature/stack) renders as a
//   static, non-interactive backdrop, and only text elements are draggable on top of it. Text
//   works on every spread this way, not just custom-layout ones.
// - "custom" mode: nothing is fixed — photo and text elements live in the same array and are all
//   draggable/resizable, giving a genuinely free-form page instead of the three presets.
export default function AlbumSpreadCanvasEditor({
  spread,
  album,
  photos,
  folders,
  photo1,
  photo2,
  mode,
  templates,
  usedElsewhere,
  onSave,
  onSaveTemplate,
  onClose,
  customOrnamentTabs,
  customOrnaments,
  onCreateCustomOrnamentTab,
  onUploadCustomOrnament,
  onDeleteCustomOrnament,
  spreads,
  onSwitchSpread,
  sidePanelOffset,
  onSidePanelOffsetChange,
}: {
  spread: GalleryAlbumSpreadRow;
  // Physical print dimensions plus the album's own configured safe-margin (cm) — used to size the
  // print-safe margin guide; safe_margin_cm defaults to 0.5 if omitted.
  album: { width_cm: number; height_cm: number; safe_margin_cm?: number };
  photos: PhotoWithUrl[];
  // Gallery tabs/folders, used only to group the draggable favorites panel below the save button
  // — an empty/omitted list just renders that panel as one flat, ungrouped area.
  folders?: { id: string; name: string }[];
  photo1: PhotoWithUrl | undefined;
  photo2: PhotoWithUrl | undefined | null;
  mode: "overlay" | "custom";
  templates: AlbumTemplateRow[];
  // Photo ids already placed elsewhere in the album (other pages) — badged with ✅ in every
  // picker below so the photographer doesn't accidentally place the same photo twice.
  usedElsewhere?: Set<string>;
  // void | Promise<void> (not just void) so callers that need to wait for the save to actually
  // land — the exit-confirm dialog's "שמירה ויציאה" — can await it: handleSave in
  // AlbumPageEditor.tsx is async and, on the web app, an earlier bug traced back to exactly this
  // — a caller that didn't await it let its own follow-up action race the save's own side effects.
  onSave: (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number; zoom: number }) => void | Promise<void>;
  onSaveTemplate: (name: string, frames: AlbumFrame[]) => Promise<void>;
  onClose: () => void;
  // Photographer-uploaded ornament tabs (desktop-only feature) — an empty/omitted list just means
  // the ornaments panel shows only the three built-in procedural tabs.
  customOrnamentTabs?: { id: string; name: string }[];
  customOrnaments?: { id: string; tab_id: string; url: string }[];
  onCreateCustomOrnamentTab?: (name: string) => Promise<void>;
  onUploadCustomOrnament?: (tabId: string, name: string, bytes: ArrayBuffer, contentType: string) => Promise<void>;
  onDeleteCustomOrnament?: (ornamentId: string) => Promise<void>;
  // Every other page in the same album (including this one), for the bottom quick-switch strip —
  // omitted-safe: no strip renders without it, same as the customOrnament* props above.
  spreads?: GalleryAlbumSpreadRow[];
  onSwitchSpread?: (spreadId: string) => void;
  // The "עריכת תמונה" panel's drag offset, owned by the PARENT page (AlbumPageEditor, not this
  // component) so it survives this editor's own full remount on every page switch — see
  // sidePanelDrag's own comment for why that remount would otherwise reset a locally-owned offset
  // back to (0,0).
  sidePanelOffset: { x: number; y: number };
  onSidePanelOffsetChange: (offset: { x: number; y: number }) => void;
}) {
  const [elements, setElementsRaw] = useState<AlbumElement[]>(() => (mode === "custom" ? seedElementsFromPreset(spread) : spread.elements));
  // Undo history — ported from the web app's own editor: up to 20 past snapshots of `elements`. A
  // snapshot is recorded on every mutation EXCEPT while a move/resize drag is actively in progress
  // (dragRef.current set) — a continuous drag fires this on every pointermove tick, and recording
  // each tick would make one Cmd/Ctrl+Z barely move anything back. startDrag instead records a
  // single snapshot up front, before the drag's own ticks begin, so one undo reverts the whole
  // gesture at once. Every other mutation in this file is already a single setElements call per
  // user action, so it naturally gets exactly one snapshot each.
  const MAX_UNDO_HISTORY = 20;
  const undoHistoryRef = useRef<AlbumElement[][]>([]);
  const setElements = useCallback((update: React.SetStateAction<AlbumElement[]>) => {
    setElementsRaw((prev) => {
      if (!dragRef.current) {
        undoHistoryRef.current = [...undoHistoryRef.current, prev].slice(-MAX_UNDO_HISTORY);
      }
      return typeof update === "function" ? (update as (p: AlbumElement[]) => AlbumElement[])(prev) : update;
    });
  }, []);
  const undo = useCallback(() => {
    setElementsRaw((prev) => {
      const hist = undoHistoryRef.current;
      if (hist.length === 0) return prev;
      undoHistoryRef.current = hist.slice(0, -1);
      return hist[hist.length - 1];
    });
  }, []);
  // Multiple photo elements can be selected at once (shift-click or a rubber-band marquee drag)
  // so circular-menu actions and resize can apply to the whole group; text elements stay
  // single-select only (a Set of size 1 for those).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Live rectangle while dragging a selection marquee on empty canvas — null when not marqueeing.
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [frameTargetId, setFrameTargetId] = useState<string | null>(null);
  const [pickingBackground, setPickingBackground] = useState(false);
  const [backgroundPhotoId, setBackgroundPhotoId] = useState(spread.background_photo_id);
  const [backgroundBlur, setBackgroundBlur] = useState(spread.background_blur);
  const [backgroundOpacity, setBackgroundOpacity] = useState(spread.background_opacity);
  const [backgroundZoom, setBackgroundZoom] = useState(spread.background_zoom ?? 100);
  // Ported from the web app's own editor — snapshot of the page's saved state, captured once from
  // the actual initial state values (not recomputed from spread/seedElementsFromPreset
  // separately, which could disagree on seeded element ids and falsely read as "dirty" from the
  // very first render). Used only to detect unsaved changes when the photographer clicks the X.
  const initialSnapshotRef = useRef<string | null>(null);
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = JSON.stringify([elements, backgroundPhotoId, backgroundBlur, backgroundOpacity, backgroundZoom]);
  }
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [skipExitConfirm, setSkipExitConfirm] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("albumEditorSkipExitConfirm") === "1"
  );
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  // "+ תמונה" opens the picker in multi-select mode — pick any number of photos, and the system
  // builds a fresh orientation-aware layout for all of them at once (replacing the page's current
  // photo elements, same as applying a template) instead of adding one photo at a fixed spot.
  const [addingMultiplePhotos, setAddingMultiplePhotos] = useState(false);
  const [multiPhotoIds, setMultiPhotoIds] = useState<Set<string>>(new Set());
  const [loadingMultiLayout, setLoadingMultiLayout] = useState(false);
  const [showAllInPicker, setShowAllInPicker] = useState(false);
  const [photoSizePickerOpen, setPhotoSizePickerOpen] = useState(false);
  const [photoSizePanelRect, setPhotoSizePanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const photoSizeButtonRef = useRef<HTMLButtonElement>(null);
  // Opens before the picker modal itself — picking a size here overrides the usual
  // aspect-ratio-matched auto sizing in confirmMultiPhotos (see its own comment).
  const [pendingPhotoSize, setPendingPhotoSize] = useState<"auto" | "rect" | "circle" | "square">("auto");
  const [guideOpen, setGuideOpen] = useState(false);
  // Separate toggle for the drag-to-frame favorites panel below the save button — independent of
  // the "+ תמונה" picker modal's own "show all" toggle above.
  const [showAllDragPanel, setShowAllDragPanel] = useState(false);
  // Ported from the web app's editor — lets the drag panel be ordered by filename or upload date
  // instead of only the gallery's own sort_order.
  const [dragPanelSort, setDragPanelSort] = useState<"default" | "name" | "date">("default");
  // Off by default on every page open — per the web app's own explicit request there, rather than
  // always-on.
  const [dragPanelHoverZoomEnabled, setDragPanelHoverZoomEnabled] = useState(false);
  // Fixed-position (viewport-relative, computed from the icon's own live rect) instead of a plain
  // CSS absolute+group-hover popup — the info icon lives inside the controls sidebar, which has its
  // own overflow-y-auto scroll region; a plain absolute popup that pops out sideways gets its edges
  // silently clipped by that ancestor's overflow box. position:fixed escapes it.
  const [hoverZoomTooltipPos, setHoverZoomTooltipPos] = useState<{ top: number; right: number } | null>(null);
  // Click a favorites-panel thumbnail to toggle it in/out of this set without starting a drag —
  // dragging any thumbnail that's part of a 2+ selection then carries the whole group together,
  // dragging one that ISN'T selected still drags just that one (selection is left untouched).
  const [dragPanelSelectedIds, setDragPanelSelectedIds] = useState<Set<string>>(new Set());
  const [dragPanelHoverPreview, setDragPanelHoverPreview] = useState<{ url: string; top: number; left: number; width: number; height: number } | null>(null);
  // Token bumped on every hover so a slow-loading preview from a PREVIOUS hover can't land after
  // the pointer has already moved to a different (or no) thumbnail.
  const hoverPreviewTokenRef = useRef(0);
  // Right-click menu on a favorite-panel thumbnail — ported from the web app's own editor, lets a
  // photographer set/unset a page background without dragging the photo in first.
  const [photoContextMenu, setPhotoContextMenu] = useState<{ photoId: string; top: number; left: number } | null>(null);
  // Ported from the web app's own editor — brightens the print-safe margin guide while a resize
  // is actively snapped to it, same visual-confirmation pattern as an element-to-element snap.
  const [marginSnap, setMarginSnap] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [masksPickerOpen, setMasksPickerOpen] = useState(false);
  const [masksPickerClosing, setMasksPickerClosing] = useState(false);
  // Anchors the masks dropdown directly below the מסכות button, at that button's own width —
  // computed from the real DOM rect (not CSS alone) and rendered `position: fixed` so it can't get
  // clipped by the side panel's own `overflow-y-auto`, and stays correctly placed regardless of
  // where in that scrollable panel the button currently sits.
  const [masksPanelRect, setMasksPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const masksButtonRef = useRef<HTMLButtonElement>(null);
  // Ornaments dropdown — same anchored-below-the-button pattern as the masks picker above.
  const [ornamentsPickerOpen, setOrnamentsPickerOpen] = useState(false);
  const [ornamentsPickerClosing, setOrnamentsPickerClosing] = useState(false);
  const [ornamentsPanelRect, setOrnamentsPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const ornamentsButtonRef = useRef<HTMLButtonElement>(null);
  // "floral"/"geometric"/"vintage" for a built-in tab, or a custom tab's own id.
  const [ornamentTab, setOrnamentTab] = useState<string>("floral");
  const [customTabModalOpen, setCustomTabModalOpen] = useState(false);
  const [customTabNameDraft, setCustomTabNameDraft] = useState("");
  const [creatingCustomTab, setCreatingCustomTab] = useState(false);
  const [uploadingOrnament, setUploadingOrnament] = useState(false);
  const [ornamentDropActive, setOrnamentDropActive] = useState(false);
  // Shapes dropdown — same anchored-below-the-button pattern as masks/ornaments above.
  const [shapesPickerOpen, setShapesPickerOpen] = useState(false);
  const [shapesPickerClosing, setShapesPickerClosing] = useState(false);
  const [shapesPanelRect, setShapesPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const shapesButtonRef = useRef<HTMLButtonElement>(null);
  const [templateTab, setTemplateTab] = useState<TemplateTabKey>("2");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  // "Position image" mode — while active for an element, dragging its photo pans the image's
  // focal point inside the fixed frame instead of moving the frame itself.
  const [panModeId, setPanModeId] = useState<string | null>(null);
  // Smart guide lines shown (and lightly snapped to) while dragging a photo/text frame — page
  // center and edges/centers of other elements on the same page, matching common design-tool
  // "alignment guide" behavior so the photographer can see when things line up.
  const [guides, setGuides] = useState<{ axis: "v" | "h"; pos: number }[]>([]);
  // Equal-spacing guides — a distinct indicator (sage, not rose) shown when the dragged element
  // sits between two same-axis neighbors with a matching gap on both sides.
  const [spacingGuides, setSpacingGuides] = useState<{ orientation: "horizontal" | "vertical"; x: number; y: number; length: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Ported from the web app's own later fix to this exact bug: `width: min(100%, calc(66vh *
  // ratio))` combined with aspect-ratio silently stops being clamped by the min() in this
  // rendering environment once the window is wide enough that 100% would exceed the vh-based
  // alternative — a genuinely square (or any non-16:10) cover rendered as a stretched rectangle at
  // real desktop widths, only "looking right" at narrower/shorter windows by coincidence. Fixed the
  // same way: measure the wrap's real available width AND height and compute the canvas's actual
  // pixel box in plain JS — no CSS min()/aspect-ratio involved, so there's nothing left for this
  // engine quirk to skip.
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [canvasWrapSize, setCanvasWrapSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const update = () => setCanvasWrapSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canvasRatio = album.width_cm > 0 && album.height_cm > 0 ? album.width_cm / album.height_cm : 1.6;
  const canvasSizePx = canvasWrapSize
    ? (() => {
        const availW = Math.max(0, canvasWrapSize.width - 24);
        const availH = Math.max(0, canvasWrapSize.height - 24);
        return availW / canvasRatio <= availH
          ? { width: availW, height: availW / canvasRatio }
          : { width: availH * canvasRatio, height: availH };
      })()
    : null;
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    resizeHandle?: ResizeHandle;
    startClientX: number;
    startClientY: number;
    startFocalX: number;
    startFocalY: number;
    startZoom: number;
    // Starting box for every element in the active group — every selected element for a group
    // move (all translate by the same delta), every selected photo for a group resize (the
    // dragged one resizes via computeResize, the rest scale proportionally around their own
    // center) — a plain single-element drag is just a group of one.
    groupStart: Record<string, { xPct: number; yPct: number; widthPct: number; heightPct: number }>;
  } | null>(null);
  // Rubber-band marquee drag state — `base` is the selection to preserve (shift-drag) or empty
  // (plain drag), so shrinking the marquee mid-drag correctly drops elements no longer inside it
  // without ever discarding a selection that existed before the marquee started.
  const marqueeRef = useRef<{ startXPct: number; startYPct: number; base: Set<string> } | null>(null);
  // Suppresses the canvas's own deselect-on-click right after a real marquee drag — a click event
  // still fires on pointerup even after a multi-pixel drag, which would otherwise immediately wipe
  // out the selection the marquee just made.
  const justMarqueedRef = useRef(false);

  const selectedElements = elements.filter((e) => selectedIds.has(e.id));
  const selectedPhotos = selectedElements.filter((e): e is AlbumPhotoElement => e.type === "photo");
  const selectedText = selectedElements.length === 1 && selectedElements[0].type === "text" ? selectedElements[0] : null;
  const selectedOrnament = selectedElements.length === 1 && selectedElements[0].type === "ornament" ? selectedElements[0] : null;
  const selectedShape = selectedElements.length === 1 && selectedElements[0].type === "shape" ? selectedElements[0] : null;
  // The photo the floating circular menu anchors to and reads toggle-state from — the first
  // selected element that actually has an image (an empty placeholder frame has nothing to
  // filter/blur/rotate, so it's skipped even if selected).
  const anchorPhoto = selectedPhotos.find((p) => p.photoId) ?? null;
  // Kept for the few call sites that only make sense for a single element (info hint, delete
  // button, side-panel text controls) — any non-empty selection, not just size 1.
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;

  // Ported from the web app's own editor — the "עריכת תמונה" and shadow/border panels no longer
  // open automatically the moment a photo is selected; each opens only via its own circle-menu
  // button. Both reset back to closed whenever the selection moves to a different photo (or away
  // from a photo entirely), so neither panel carries over onto a photo it was never opened for.
  const [photoAdjustPanelOpen, setPhotoAdjustPanelOpen] = useState(false);
  const [photoShadowPanelOpen, setPhotoShadowPanelOpen] = useState(false);
  useEffect(() => {
    setPhotoAdjustPanelOpen(false);
    setPhotoShadowPanelOpen(false);
  }, [anchorPhoto?.id]);
  // The text styling panel (font/color/alignment/size) — toggled by its own circle-menu "T" button
  // next to the selected text, same manual-toggle pattern as photoAdjustPanelOpen, not
  // ornament/shape's always-open one, so a stray click on the canvas doesn't repeatedly pop the
  // panel open every time a text box is merely selected.
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  useEffect(() => {
    setTextPanelOpen(false);
  }, [selectedText?.id]);
  const sidePanelOpen = !!selectedOrnament || !!selectedShape || (!!anchorPhoto && photoAdjustPanelOpen) || (!!selectedText && textPanelOpen);
  // Keeps the side panel's last content around through its own fade-out — without this,
  // deselecting would unmount the panel instantly (React removes it from the DOM the same render,
  // giving a CSS transition nothing to animate), so the panel would just vanish instead of fading.
  // Only ever written while something IS selected; while closing (sidePanelOpen false) it
  // deliberately keeps showing the last real selection.
  const [lastSideSelection, setLastSideSelection] = useState<
    | { type: "ornament"; el: AlbumOrnamentElement }
    | { type: "shape"; el: AlbumShapeElement }
    | { type: "photo"; el: AlbumPhotoElement }
    | { type: "text"; el: AlbumTextElement }
    | null
  >(null);
  useEffect(() => {
    if (selectedOrnament) setLastSideSelection({ type: "ornament", el: selectedOrnament });
    else if (selectedShape) setLastSideSelection({ type: "shape", el: selectedShape });
    else if (anchorPhoto) setLastSideSelection({ type: "photo", el: anchorPhoto });
    else if (selectedText) setLastSideSelection({ type: "text", el: selectedText });
  }, [selectedOrnament, selectedShape, anchorPhoto, selectedText]);
  // The side panel is anchored to the canvas's own live position (not a hardcoded viewport
  // offset), measured at REST (no slide applied) and re-measured only on window resize — never
  // while `sidePanelOpen` is changing, since reading getBoundingClientRect() mid-CSS-transition
  // would race the animation and could capture an in-between position.
  const [canvasRestRect, setCanvasRestRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (r) setCanvasRestRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Fixed DEFAULT size for the photo-adjustments panel (27×14cm), freely resizable on top of that
  // default via useResizablePanelSize's own corner-handle — see its comment for why the override
  // persists across photo selections instead of resetting.
  const PHOTO_PANEL_DEFAULT_HEIGHT_CM = 27;
  const PHOTO_PANEL_DEFAULT_WIDTH_CM = 14;
  const photoPanelDefaultHeightPx =
    album.height_cm > 0 && canvasRestRect ? Math.max(80, PHOTO_PANEL_DEFAULT_HEIGHT_CM * (canvasRestRect.height / album.height_cm)) : 300;
  const photoPanelDefaultWidthPx =
    album.width_cm > 0 && canvasRestRect ? Math.max(80, PHOTO_PANEL_DEFAULT_WIDTH_CM * (canvasRestRect.width / album.width_cm)) : 150;
  const photoPanelSize = useResizablePanelSize(photoPanelDefaultWidthPx, photoPanelDefaultHeightPx);
  // The "עריכת תמונה" panel's default screen position is shifted 5cm further left than its plain
  // canvas-edge anchor — computed here (not inline where it's used) so both that panel's own
  // position AND the shadow overlay's (which shares this same left anchor) apply the identical shift.
  const PHOTO_PANEL_LEFT_SHIFT_CM = 5;
  const panelLeftShiftPx = album.width_cm > 0 && canvasRestRect ? (PHOTO_PANEL_LEFT_SHIFT_CM / album.width_cm) * canvasRestRect.width : 0;
  // Free drag-anywhere offset for the ornament/shape/photo-adjust/text side panel — see
  // useDraggablePanelOffset's own comment. One shared instance covers all four panel kinds since
  // only one of them is ever mounted at a time (whichever lastSideSelection currently is).
  // CONTROLLED by the parent page (AlbumPageEditor, via sidePanelOffset/onSidePanelOffsetChange)
  // rather than owning its own state — once the photographer drags this panel somewhere on ANY
  // page of the album, that position stays the new default on every OTHER page too, until dragged
  // again. A plain internal useState here could never survive that: this whole editor remounts on
  // every page switch (key={spread.id} in AlbumPageEditor, so each page starts with fresh
  // elements/undo-state), which would silently reset any local offset back to (0,0). Lifting the
  // value one level up, to a component that does NOT remount on page switches, is what makes it
  // durable across them. (Position only — size is NOT lifted; photoPanelSize above keeps its own
  // sticky-within-this-mount behavior.)
  // The vertical drag range is clamped to the canvas's own top/bottom edges — the panel's default
  // position sits right at the canvas's own top edge (see panelTopPx at the render site), and
  // dragging it must never be able to push it up past that edge nor down past the canvas's own
  // bottom edge. Only clamps the Y axis; X is still free to drag anywhere. Scoped to the PHOTO
  // panel specifically via lastSideSelection — the ornament/shape/text panels use a different
  // (centered, content-sized) default position this same offset math doesn't apply to, so they're
  // left free/unclamped.
  const sidePanelDrag = useDraggablePanelOffset(
    "sidePanel",
    (offset) => {
      if (!canvasRestRect || lastSideSelection?.type !== "photo") return offset;
      const maxOffsetY = Math.max(0, canvasRestRect.height - photoPanelSize.height);
      return { x: offset.x, y: Math.max(0, Math.min(offset.y, maxOffsetY)) };
    },
    { offset: sidePanelOffset, onChange: onSidePanelOffsetChange }
  );

  const usedPhotoIds = new Set(elements.filter((e): e is AlbumPhotoElement => e.type === "photo" && !!e.photoId).map((e) => e.photoId as string));
  const favoritePhotos = (() => {
    const base = photos.filter((p) => p.is_favorite);
    if (dragPanelSort === "name") {
      return [...base].sort((a, b) => (a.original_filename ?? "").localeCompare(b.original_filename ?? "", "he"));
    }
    if (dragPanelSort === "date") {
      return [...base].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    }
    return base;
  })();
  // The album's cover page (always sort_order 0) is exempt from the cross-page "already used"
  // exclusion below — a cover photo is commonly also placed again inside the album itself, so it
  // shouldn't disappear from either picker just because it's the cover.
  const isCoverPage = spread.sort_order === 0;
  // Photos already placed on OTHER pages of the album are dropped entirely (not just badged) so a
  // photo used earlier in the book never shows up as an option on a later page — except when
  // picking a page BACKGROUND (a different, non-exclusive kind of "use"), or on the cover page.
  const pickerPhotosBase = showAllInPicker || favoritePhotos.length === 0 ? photos : favoritePhotos;
  const pickerPhotos = pickingBackground || isCoverPage ? pickerPhotosBase : pickerPhotosBase.filter((p) => !usedElsewhere?.has(p.id));
  // Drag-to-frame panel: cross-page duplicates are always excluded (except on the cover page);
  // same-page duplicates are excluded by default (so a placed photo disappears once dragged in)
  // but "הצג הכל" reveals everything, badged ✅, purely for review — including same-page AND
  // cross-page duplicates alike once that toggle is on. Grouped by folder/tab when the gallery
  // actually has any; otherwise every favorite sits in one flat, unlabeled group.
  const dragPanelPool = favoritePhotos.filter((p) => showAllDragPanel || ((isCoverPage || !usedElsewhere?.has(p.id)) && !usedPhotoIds.has(p.id)));
  const dragPanelGroups: { id: string; name: string | null; items: PhotoWithUrl[] }[] =
    folders && folders.length > 0
      ? [
          ...folders.map((f) => ({ id: f.id, name: f.name, items: dragPanelPool.filter((p) => p.folder_id === f.id) })),
          { id: "__none__", name: "ללא לשונית", items: dragPanelPool.filter((p) => !p.folder_id) },
        ].filter((g) => g.items.length > 0)
      : dragPanelPool.length > 0
      ? [{ id: "__all__", name: null, items: dragPanelPool }]
      : [];
  const backgroundPhoto = backgroundPhotoId ? photos.find((p) => p.id === backgroundPhotoId) : null;
  // A 0.5cm trim-safe inset expressed as a % of each axis — proportional, so it looks right on a
  // 20x30 album and a 60x40 one alike.
  const marginInsetPct = marginInsetPctFor(album);
  // Drives the circular floating menu's position — see photoMenuPositionStyle's own comment for the
  // full anchor/flip/clamp logic.
  const menuAnchorPhoto = pickMenuAnchorPhoto(selectedPhotos);
  // Free drag-anywhere offset for the circular photo menu — see useDraggablePanelOffset's own
  // comment. Reset key is the anchor photo's id, so the offset clears when a different photo
  // becomes the menu's anchor.
  const photoMenuDrag = useDraggablePanelOffset(menuAnchorPhoto?.id ?? null);
  // The hard "never cross the green frame" clamp (in photoMenuPositionStyle) needs the menu's own
  // actually-rendered height, not a guess, since it varies with however many buttons happen to be
  // visible. Measured after every paint where it's mounted — a single cheap offsetHeight read, not
  // worth the bug surface of an incomplete dependency array.
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const [photoMenuHeightPx, setPhotoMenuHeightPx] = useState(0);
  useLayoutEffect(() => {
    setPhotoMenuHeightPx(photoMenuRef.current?.offsetHeight ?? 0);
  });
  const menuHeightPct = canvasRestRect && photoMenuHeightPx > 0 ? (photoMenuHeightPx / canvasRestRect.height) * 100 : null;
  const menuPositionStyle = menuAnchorPhoto ? photoMenuPositionStyle(selectedPhotos, menuAnchorPhoto, album, marginInsetPct, menuHeightPct) : null;

  // Leaving "position image" mode whenever the selection changes elsewhere keeps its green ring
  // tied to whatever's actually selected, rather than lingering on a no-longer-selected element.
  useEffect(() => {
    setPanModeId((prev) => (prev && !selectedIds.has(prev) ? null : prev));
  }, [selectedIds]);

  // Arrow keys nudge every currently-selected element together — a fine 0.5% step, or 3% with
  // Shift held for bigger moves. Skipped while focus is inside a form field so normal keyboard
  // navigation there (e.g. arrowing through a <select>) isn't hijacked. xPct/yPct are plain LTR
  // canvas coordinates regardless of the app's RTL UI (see the AlbumSpreadLayout type comment), so
  // ArrowLeft/ArrowRight map to decreasing/increasing x exactly like every other drag on this
  // canvas already does — no RTL flip needed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? 3 : 0.5;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      setElements((prev) =>
        prev.map((el) =>
          selectedIds.has(el.id) && !el.locked
            ? { ...el, xPct: Math.max(0, Math.min(95, el.xPct + dx)), yPct: Math.max(0, Math.min(95, el.yPct + dy)) }
            : el
        )
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds]);

  const updateElement = (id: string, patch: Partial<AlbumElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as AlbumElement) : e)));
  };

  // Applies the same patch to every currently-selected PHOTO element — an empty toggle-value
  // (bw/sepia/lockAspect) is decided by the caller from the anchor photo's own current state
  // before calling this, so every selected photo lands on the SAME final value rather than each
  // toggling independently.
  const applyToSelectedPhotos = (patch: Partial<AlbumPhotoElement>) => {
    setElements((prev) => prev.map((e) => (e.type === "photo" && selectedIds.has(e.id) ? { ...e, ...patch } : e)));
  };

  const removeSelected = () => {
    setElements((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
  };

  // Stacking order = array order (later elements paint on top, plain DOM order — no z-index in
  // play) — moving an element to the end/start of `elements` is the whole implementation.
  const bringToFront = (id: string) => {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [...prev.filter((e) => e.id !== id), el];
    });
  };
  const sendToBack = (id: string) => {
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      return [el, ...prev.filter((e) => e.id !== id)];
    });
  };

  // Deletes whatever's currently selected on Delete/Backspace — skipped while focus is inside a
  // text input (template name, text-draft box, etc.) so those keys keep editing text as expected.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (selectedIds.size === 0) return;
      e.preventDefault();
      removeSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Ported from the web app's own editor: Cmd/Ctrl+Z undoes the last change; Cmd/Ctrl+A selects
  // every photo/ornament/shape on the page (text stays single-select only, matching web's own
  // comment on why); a bare T opens the add-text draft panel. All skipped while focus is inside a
  // form field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const typing = active && (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) || (active as HTMLElement).isContentEditable);
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(elements.filter((el) => el.type === "photo" || el.type === "ornament" || el.type === "shape").map((el) => el.id)));
        return;
      }
      if (!meta && !e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setTextDraftOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [elements, undo]);

  // "+ מסגרת" — inserts one empty, freely movable/resizable frame into the current layout without
  // touching any existing element, for a photographer who wants to hand-extend a template/auto
  // layout with one more spot instead of regenerating the whole page.
  const addFrame = () => {
    const id = `frame-${Date.now()}`;
    setElements((prev) => [...prev, { id, type: "photo", photoId: null, xPct: 32, yPct: 32, widthPct: 36, heightPct: 36, focalX: 50, focalY: 50 }]);
    setSelectedIds(new Set([id]));
  };

  // Plays the slide-up close animation before actually unmounting the masks panel — mirrors the
  // CLOSE_ANIMATION_MS pattern used for other animated panels in this app.
  const closeMasksPicker = () => {
    setMasksPickerClosing(true);
    setTimeout(() => {
      setMasksPickerOpen(false);
      setMasksPickerClosing(false);
    }, 200);
  };

  const closeOrnamentsPicker = () => {
    setOrnamentsPickerClosing(true);
    setTimeout(() => {
      setOrnamentsPickerOpen(false);
      setOrnamentsPickerClosing(false);
    }, 200);
  };

  // Adds a new, freely movable/resizable ornament element — ornaments aren't tied to a photo
  // (unlike masks), so picking one just drops a fresh instance the photographer can then
  // drag/resize into place. `at` centers it on a drag-and-drop's actual drop point; omitted (a
  // plain click in the picker) falls back to a default spot near the top-left.
  const addOrnament = (ornamentId: string, at?: { xPct: number; yPct: number }) => {
    const id = `ornament-${Date.now()}`;
    const widthPct = 30;
    const heightPct = 30;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 35;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 35;
    setElements((prev) => [...prev, { id, type: "ornament", ornamentId, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeOrnamentsPicker();
  };

  // Same as addOrnament above but for a photographer-uploaded image — no `color` (an arbitrary
  // raster/vector file has its own colors already) and `customOrnamentId` instead of `ornamentId`.
  const addCustomOrnament = (customOrnamentId: string, at?: { xPct: number; yPct: number }) => {
    const id = `ornament-${Date.now()}`;
    const widthPct = 30;
    const heightPct = 30;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 35;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 35;
    setElements((prev) => [...prev, { id, type: "ornament", customOrnamentId, xPct, yPct, widthPct, heightPct, rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeOrnamentsPicker();
  };

  const closeShapesPicker = () => {
    setShapesPickerClosing(true);
    setTimeout(() => {
      setShapesPickerOpen(false);
      setShapesPickerClosing(false);
    }, 200);
  };

  // Adds a new, freely movable/resizable solid-color shape — `maskId` picks one of the same
  // ALBUM_MASKS "shape-*" outlines (undefined = a plain rectangle). Same drop-point-or-default
  // placement as addOrnament above.
  const addShape = (maskId: string | undefined, at?: { xPct: number; yPct: number }) => {
    const id = `shape-${Date.now()}`;
    const widthPct = 25;
    const heightPct = 25;
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 37.5;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 37.5;
    setElements((prev) => [...prev, { id, type: "shape", maskId, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100 }]);
    setSelectedIds(new Set([id]));
    closeShapesPicker();
  };

  // Outline-only presets — square/rectangle share the same rect-stroke rendering and differ only
  // in their default aspect ratio; "line" stays a plain solid fill (just very thin) but still gets
  // its own shapeStyle tag so the floating menu can show it a dedicated thickness slider and the
  // resize handles can let it (like the two true outline kinds) extend past the page edge.
  const addOutlineShape = (kind: "square" | "rectangle" | "circle" | "line", at?: { xPct: number; yPct: number }) => {
    const id = `shape-${Date.now()}`;
    let widthPct = 24;
    let heightPct = 24;
    let shapeStyle: AlbumShapeElement["shapeStyle"];
    let borderWidth: number | undefined;
    if (kind === "square") {
      shapeStyle = "rect-outline";
      borderWidth = 5;
    } else if (kind === "rectangle") {
      widthPct = 32;
      heightPct = 20;
      shapeStyle = "rect-outline";
      borderWidth = 5;
    } else if (kind === "circle") {
      shapeStyle = "circle-outline";
      borderWidth = 5;
    } else {
      widthPct = 35;
      heightPct = 1.2;
      shapeStyle = "line";
    }
    const xPct = at ? Math.max(0, Math.min(100 - widthPct, at.xPct - widthPct / 2)) : 37.5;
    const yPct = at ? Math.max(0, Math.min(100 - heightPct, at.yPct - heightPct / 2)) : 37.5;
    setElements((prev) => [
      ...prev,
      { id, type: "shape", shapeStyle, xPct, yPct, widthPct, heightPct, color: "#2e3142", rotation: 0, opacity: 100, borderWidth },
    ]);
    setSelectedIds(new Set([id]));
    closeShapesPicker();
  };

  const openPickerForNewPhoto = () => {
    setFrameTargetId(null);
    setPickingBackground(false);
    setAddingMultiplePhotos(true);
    setMultiPhotoIds(new Set());
    setPhotoPickerOpen(true);
  };

  const openPickerForBackground = () => {
    setFrameTargetId(null);
    setPickingBackground(true);
    setAddingMultiplePhotos(false);
    setPhotoPickerOpen(true);
  };

  const openPickerForFrame = (id: string) => {
    setFrameTargetId(id);
    setAddingMultiplePhotos(false);
    setPhotoPickerOpen(true);
  };

  const choosePhoto = (photoId: string) => {
    if (pickingBackground) {
      setBackgroundPhotoId(photoId);
    } else if (frameTargetId) {
      updateElement(frameTargetId, { photoId, focalX: 50, focalY: 50 });
    } else {
      const id = `el-${Date.now()}`;
      setElements((prev) => [...prev, { id, type: "photo", photoId, xPct: 20, yPct: 20, widthPct: 40, heightPct: 40, focalX: 50, focalY: 50 }]);
      setSelectedIds(new Set([id]));
    }
    setPhotoPickerOpen(false);
    setFrameTargetId(null);
    setPickingBackground(false);
  };

  const toggleMultiPhoto = (photoId: string) => {
    setMultiPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  // Detects each selected photo's real orientation (client-side, via its actual pixel dimensions
  // — the app doesn't store width/height for gallery photos) so the generated layout can give
  // portrait photos a portrait-shaped frame and landscape photos a landscape-shaped one, instead
  // of an orientation-blind uniform grid.
  const loadImageAspect = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
      img.onerror = () => resolve(1);
      img.src = url;
    });

  // "הצגה בגודל נכון" — resizes the frame to the photo's own true aspect ratio (no crop needed
  // once matched) instead of whatever ratio the frame happened to have. Keeps the frame's current
  // WIDTH fixed and solves for the height that ratio implies in real cm, re-centered on the
  // frame's previous vertical center — deliberately allowed to grow past other elements or the
  // green safe-print margin, since this is a manual per-photo action, not automatic placement.
  // Loops every id given so a multi-selection true-sizes each photo against its OWN aspect ratio,
  // not a single shared one.
  const showTrueSize = async (ids: string[]) => {
    for (const id of ids) {
      const el = elements.find((e) => e.id === id);
      if (!el || el.type !== "photo" || !el.photoId || album.width_cm <= 0 || album.height_cm <= 0) continue;
      const photo = photoById.get(el.photoId);
      if (!photo) continue;
      const aspect = await loadImageAspect(photo.url);
      const widthCm = (el.widthPct / 100) * album.width_cm;
      const heightCm = widthCm / aspect;
      const newHeightPct = (heightCm / album.height_cm) * 100;
      const centerY = el.yPct + el.heightPct / 2;
      updateElement(id, { heightPct: newHeightPct, yPct: centerY - newHeightPct / 2, focalX: 50, focalY: 50 });
    }
  };

  // "החל על כל התמונות בדף" — copies one photo's border/shadow styling onto every other photo
  // element on this page, so matching a whole spread's frames doesn't mean opening each one's own
  // flyout and re-entering the same shadow%/border-width/color by hand.
  const applyShadowToAllPhotos = (id: string) => {
    const source = elements.find((e) => e.id === id);
    if (!source || source.type !== "photo") return;
    const { shadow, shadowDistance, shadowBlur, borderWidth, borderColor } = source;
    setElements((prev) =>
      prev.map((e) => (e.type === "photo" ? { ...e, shadow, shadowDistance, shadowBlur, borderWidth, borderColor } : e))
    );
  };

  // Adds each newly-picked photo as its own medium-sized, orientation-aware frame ALONGSIDE
  // whatever's already on the page — this used to regenerate a fresh full-page layout for just
  // the new selection, silently wiping every existing photo element in the process. Sizing
  // mirrors addFrame's own default scale (a photo-shaped frame, not a full-bleed one); multiple
  // photos added in the same batch cascade diagonally so they land visibly apart instead of
  // stacked exactly on top of each other.
  const confirmMultiPhotos = async () => {
    const ids = Array.from(multiPhotoIds);
    if (ids.length === 0) return;
    setLoadingMultiLayout(true);
    const items = await Promise.all(
      ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))
    );
    const baseSize = 36;
    // A chosen fixed real-world size (rect 10x7.5cm / circle Ø5cm / square 5x5cm) overrides the
    // usual aspect-ratio-matched auto sizing — converted from cm using the album's own print
    // dimensions, same as every other cm-based measurement in this editor.
    const fixedCm =
      pendingPhotoSize === "rect"
        ? { w: 10, h: 7.5 }
        : pendingPhotoSize === "circle"
        ? { w: 5, h: 5 }
        : pendingPhotoSize === "square"
        ? { w: 5, h: 5 }
        : null;
    const fixedWidthPct = fixedCm && album.width_cm > 0 ? (fixedCm.w / album.width_cm) * 100 : null;
    const fixedHeightPct = fixedCm && album.height_cm > 0 ? (fixedCm.h / album.height_cm) * 100 : null;
    const newPhotoElements: AlbumPhotoElement[] = items.map((item, i) => {
      const autoWidthPct = item.aspect >= 1 ? baseSize : baseSize * item.aspect;
      const autoHeightPct = item.aspect >= 1 ? baseSize / item.aspect : baseSize;
      const widthPct = fixedWidthPct ?? autoWidthPct;
      const heightPct = fixedHeightPct ?? autoHeightPct;
      const cascade = i * 4;
      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: Math.min(100 - widthPct, 20 + cascade),
        yPct: Math.min(100 - heightPct, 20 + cascade),
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
        maskId: pendingPhotoSize === "circle" ? "shape-circle" : undefined,
      };
    });
    setElements((prev) => [...prev, ...newPhotoElements]);
    setLoadingMultiLayout(false);
    setPhotoPickerOpen(false);
    setAddingMultiplePhotos(false);
    setMultiPhotoIds(new Set());
    setSelectedIds(new Set(newPhotoElements.map((e) => e.id)));
    setPendingPhotoSize("auto");
  };

  // Same orientation-aware sizing as confirmMultiPhotos above, but anchored at an actual drop
  // point on the canvas instead of a fixed corner — used when one or several favorite photos are
  // dragged straight onto the page (from the drag panel) instead of picked in the "+ תמונה" modal.
  const buildOrientedPhotoFrames = async (ids: string[], centerXPct: number, centerYPct: number): Promise<AlbumPhotoElement[]> => {
    const items = await Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") })));
    const baseSize = 36;
    return items.map((item, i) => {
      const widthPct = item.aspect >= 1 ? baseSize : baseSize * item.aspect;
      const heightPct = item.aspect >= 1 ? baseSize / item.aspect : baseSize;
      const cascade = i * 4;
      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: Math.max(0, Math.min(100 - widthPct, centerXPct - widthPct / 2 + cascade)),
        yPct: Math.max(0, Math.min(100 - heightPct, centerYPct - heightPct / 2 + cascade)),
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
      };
    });
  };

  // Dragging 2+ favorite photos onto an otherwise-empty page (no pre-existing empty frames to
  // fill — see the "multi:" drop handler below) auto-arranges them into a grid collage instead of
  // the single-photo cascade above: a roughly-square grid of cells covering 85% of the page, each
  // photo sized to fit its own cell via contain (not cover) so it's never cropped — its frame
  // exactly matches its own aspect ratio, same as buildOrientedPhotoFrames, just fit inside a grid
  // cell instead of a fixed base size.
  const buildCollageLayout = async (ids: string[]): Promise<AlbumPhotoElement[]> => {
    const items = await Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") })));
    const n = items.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const GAP_PCT = 2;
    const USABLE_PCT = 85;
    const outerOffset = (100 - USABLE_PCT) / 2;
    const cellW = (USABLE_PCT - GAP_PCT * (cols - 1)) / cols;
    const cellH = (USABLE_PCT - GAP_PCT * (rows - 1)) / rows;
    const canvasW = album.width_cm || 1;
    const canvasH = album.height_cm || 1;
    const itemsInLastRow = n - cols * (rows - 1);
    return items.map((item, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Centers a short last row within the full grid width instead of leaving it flush left,
      // e.g. 5 photos → a 3-wide grid whose 2-photo last row sits centered under the row above.
      const rowItemCount = row === rows - 1 ? itemsInLastRow : cols;
      const rowStartOffset = outerOffset + ((cols - rowItemCount) * (cellW + GAP_PCT)) / 2;
      const cellLeft = rowStartOffset + col * (cellW + GAP_PCT);
      const cellTop = outerOffset + row * (cellH + GAP_PCT);

      // Contain-fit (not cover) within the cell, in real cm so the aspect ratio is honest — same
      // math as orientedFrameSizePct, just constrained to the cell's own box instead of a fixed
      // base size, and clamped down (never up) so the photo never overflows its cell.
      const cellWCm = (cellW / 100) * canvasW;
      const cellHCm = (cellH / 100) * canvasH;
      const cellAspect = cellWCm / cellHCm;
      let widthCm: number;
      let heightCm: number;
      if (item.aspect > cellAspect) {
        widthCm = cellWCm;
        heightCm = widthCm / item.aspect;
      } else {
        heightCm = cellHCm;
        widthCm = heightCm * item.aspect;
      }
      const widthPct = (widthCm / canvasW) * 100;
      const heightPct = (heightCm / canvasH) * 100;

      return {
        id: `el-${Date.now()}-${i}`,
        type: "photo",
        photoId: item.id,
        xPct: cellLeft + (cellW - widthPct) / 2,
        yPct: cellTop + (cellH - heightPct) / 2,
        widthPct,
        heightPct,
        focalX: 50,
        focalY: 50,
      };
    });
  };

  const removeBackground = () => setBackgroundPhotoId(null);

  const addText = () => {
    if (!textDraft.trim()) return;
    const id = `el-${Date.now()}`;
    // Ported from the web app's own addText() fix: a flat xPct:10/yPct:40/heightPct:15 every
    // time meant a second text box landed exactly on top of the first one, pixel for pixel — not
    // a paint-order bug, every new box was simply created at the identical position. Successive
    // additions now cascade, and height tracks the actual font size (see textHeightPctForFontSize)
    // instead of a flat 15% that was wildly oversized for a short word.
    const fontSize = 40;
    const widthPct = 60;
    const heightPct = textHeightPctForFontSize(fontSize, album);
    const existingTextCount = elements.filter((e) => e.type === "text").length;
    const cascade = (existingTextCount % 8) * 4;
    setElements((prev) => [
      ...prev,
      {
        id,
        type: "text",
        text: textDraft.trim(),
        xPct: Math.min(100 - widthPct, 10 + cascade),
        yPct: Math.min(100 - heightPct, 40 + cascade),
        widthPct,
        heightPct,
        fontSize,
        fontFamily: "heebo",
        color: "white",
        align: "center",
      },
    ]);
    setTextDraft("");
    setTextDraftOpen(false);
    setSelectedIds(new Set([id]));
  };

  // Replaces the photo layout with the template's empty frames, best-effort auto-filling them in
  // order from favorited photos not already placed elsewhere on this page — text elements (which
  // aren't part of any template) are kept as-is. Frames are rescaled into the album's print-safe
  // area every time a template is applied — this re-fit happens regardless of the template's
  // source (built-in or the photographer's own saved one), so a template built for one album size
  // never crosses the green margin when applied to a differently-sized one.
  const applyTemplate = (rawFrames: AlbumFrame[]) => {
    const frames = fitFramesToSafeArea(rawFrames, marginInsetPct);
    const available = favoritePhotos.filter((p) => !usedPhotoIds.has(p.id));
    const newPhotoElements: AlbumPhotoElement[] = frames.map((f, i) => ({
      id: `frame-${Date.now()}-${i}`,
      type: "photo",
      photoId: available[i]?.id ?? null,
      xPct: f.xPct,
      yPct: f.yPct,
      widthPct: f.widthPct,
      heightPct: f.heightPct,
      focalX: 50,
      focalY: 50,
      rotation: f.rotation,
      borderWidth: f.borderWidth,
      borderColor: f.borderColor,
      shadow: f.shadow,
    }));
    setElements((prev) => [...newPhotoElements, ...prev.filter((e) => e.type === "text")]);
    setTemplatePickerOpen(false);
    setSelectedIds(new Set());
  };

  const saveCurrentAsTemplate = async () => {
    if (!templateNameDraft.trim()) return;
    const frames: AlbumFrame[] = elements
      .filter((e): e is AlbumPhotoElement => e.type === "photo")
      .map((e) => ({
        id: e.id,
        xPct: e.xPct,
        yPct: e.yPct,
        widthPct: e.widthPct,
        heightPct: e.heightPct,
        rotation: e.rotation,
        borderWidth: e.borderWidth,
        borderColor: e.borderColor,
        shadow: e.shadow,
      }));
    if (frames.length === 0) return;
    setSavingTemplate(true);
    await onSaveTemplate(templateNameDraft.trim(), frames);
    setSavingTemplate(false);
    setTemplateNameDraft("");
    setSaveTemplateOpen(false);
  };

  // `moveGroupIds`, when given, is the exact set of elements a MOVE drag should translate together
  // (a multi-selection being dragged as one); omitted for everything else, where the group is
  // just the one dragged element. A resize's group is always every currently-selected photo (so
  // grabbing one handle scales the whole selection), computed here rather than passed in since
  // resize handles don't know about selection state themselves.
  const startDrag = (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize", resizeHandle?: ResizeHandle, moveGroupIds?: string[]) => {
    // Never drag FROM a locked element — still selectable (handled elsewhere), so the photographer
    // can still reach its own menu to unlock it.
    if (el.locked) return;
    e.stopPropagation();
    // One undo snapshot for the whole upcoming gesture, taken before dragRef.current is set below
    // — the wrapped setElements skips recording while dragRef.current is set, so without this the
    // drag's own pointermove ticks would never get captured at all.
    undoHistoryRef.current = [...undoHistoryRef.current, elements].slice(-MAX_UNDO_HISTORY);
    // Can throw in edge cases (pointer id no longer "active" by the time this runs, some
    // browsers on fast multi-touch sequences) — losing implicit capture just means a drag that
    // leaves the frame won't keep tracking, not a broken interaction, so it's not worth aborting
    // the whole gesture over.
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignored — see above
    }
    const rawGroupIds =
      kind === "resize" ? (selectedPhotos.length > 1 && selectedIds.has(el.id) ? selectedPhotos.map((p) => p.id) : [el.id]) : moveGroupIds ?? [el.id];
    // Locked elements are excluded from the group entirely, even when part of the current
    // multi-selection — `el` itself already passed the guard above, so it's always kept.
    const groupIds = rawGroupIds.filter((id) => id === el.id || !elements.find((x) => x.id === id)?.locked);
    const groupStart: Record<string, { xPct: number; yPct: number; widthPct: number; heightPct: number }> = {};
    for (const id of groupIds) {
      const ge = elements.find((x) => x.id === id);
      if (!ge) continue;
      groupStart[id] = { xPct: ge.xPct, yPct: ge.yPct, widthPct: ge.widthPct, heightPct: ge.type === "photo" ? ge.heightPct : ge.heightPct ?? 15 };
    }
    dragRef.current = {
      id: el.id,
      kind,
      resizeHandle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFocalX: el.type === "photo" ? el.focalX : 50,
      startFocalY: el.type === "photo" ? el.focalY : 50,
      startZoom: el.type === "photo" ? (el.zoom ?? 100) : 100,
      groupStart,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (marqueeRef.current) {
      const curX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const curY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      const { startXPct, startYPct, base } = marqueeRef.current;
      const x = Math.min(startXPct, curX);
      const y = Math.min(startYPct, curY);
      const w = Math.abs(curX - startXPct);
      const h = Math.abs(curY - startYPct);
      setMarqueeBox({ x, y, w, h });
      const marquee = { left: x, top: y, right: x + w, bottom: y + h };
      const hitIds = elements.filter((el) => el.type === "photo" && boxesIntersect(elementBox(el), marquee)).map((el) => el.id);
      setSelectedIds(new Set([...base, ...hitIds]));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    const el = elements.find((x) => x.id === drag.id);
    const primaryStart = drag.groupStart[drag.id];
    if (!primaryStart) return;

    if (drag.kind === "resize") {
      const lockAspect = el?.type === "photo" && !!el.lockAspect;
      const allowOverflow = el?.type === "shape" && (el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline" || el.shapeStyle === "line");
      const handle = drag.resizeHandle ?? "se";
      const isSingleResize = Object.keys(drag.groupStart).length === 1;

      if (isSingleResize) {
        let primaryResult = computeResize(handle, primaryStart, dxPct, dyPct, lockAspect, allowOverflow, e.altKey);
        const others = elements.filter((x) => x.id !== drag.id);
        const { guides: resizeGuides, box: snappedBox, marginSnapX, marginSnapY } = computeResizeGuides(handle, primaryResult, others, marginInsetPct);
        setGuides(resizeGuides);
        setMarginSnap({ x: marginSnapX, y: marginSnapY });
        primaryResult = snappedBox;
        setElements((prev) => prev.map((e2) => (e2.id === drag.id ? { ...e2, ...primaryResult } : e2)));
        return;
      }

      // Group resize (2+ selected): treated as one rigid frame — ported from the web app's own
      // fix for a real bug report. The PREVIOUS approach (scaling each photo by the same factor,
      // anchored on its OWN center) meant the GAPS between photos weren't preserved: two adjacent
      // photos with a small gap between them, both growing around their own separate centers
      // instead of moving apart together, would start overlapping well before either photo
      // individually grew by much. Fixed by running computeResize on the GROUP's own shared
      // bounding box instead of any individual photo's box, then mapping every selected photo by
      // its own fractional position/size WITHIN that shared box into the new one — every photo's
      // position AND size scale together proportionally with the whole selection, so relative
      // spacing is preserved exactly regardless of which handle was actually grabbed.
      setGuides([]);
      setMarginSnap({ x: false, y: false });
      const starts = Object.values(drag.groupStart);
      const groupStartBox = {
        xPct: Math.min(...starts.map((s) => s.xPct)),
        yPct: Math.min(...starts.map((s) => s.yPct)),
        widthPct: Math.max(...starts.map((s) => s.xPct + s.widthPct)) - Math.min(...starts.map((s) => s.xPct)),
        heightPct: Math.max(...starts.map((s) => s.yPct + s.heightPct)) - Math.min(...starts.map((s) => s.yPct)),
      };
      const groupResult = computeResize(handle, groupStartBox, dxPct, dyPct, lockAspect, allowOverflow, e.altKey);
      const scaleW = groupStartBox.widthPct > 0 ? groupResult.widthPct / groupStartBox.widthPct : 1;
      const scaleH = groupStartBox.heightPct > 0 ? groupResult.heightPct / groupStartBox.heightPct : 1;
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          const relX = groupStartBox.widthPct > 0 ? (gs.xPct - groupStartBox.xPct) / groupStartBox.widthPct : 0;
          const relY = groupStartBox.heightPct > 0 ? (gs.yPct - groupStartBox.yPct) / groupStartBox.heightPct : 0;
          const newW = Math.max(8, Math.min(100, gs.widthPct * scaleW));
          const newH = Math.max(6, Math.min(100, gs.heightPct * scaleH));
          const nx = groupResult.xPct + relX * groupResult.widthPct;
          const ny = groupResult.yPct + relY * groupResult.heightPct;
          const clampedX = Math.max(0, Math.min(nx, 100 - newW));
          const clampedY = Math.max(0, Math.min(ny, 100 - newH));
          return { ...e2, xPct: clampedX, yPct: clampedY, widthPct: newW, heightPct: newH };
        })
      );
      return;
    }

    if (el?.type === "photo" && e.ctrlKey) {
      // Ctrl + horizontal drag = zoom — moving the mouse left zooms in, right zooms out, using raw
      // pixel delta (not %) so the feel stays consistent regardless of canvas size.
      const dxPx = e.clientX - drag.startClientX;
      updateElement(drag.id, { zoom: Math.max(100, Math.min(400, drag.startZoom - dxPx * 0.5)) });
      if (guides.length) setGuides([]);
      return;
    }

    if (el?.type === "photo" && panModeId === el.id) {
      // "Position image" mode — drag pans the focal point inside the fixed frame instead of
      // moving the frame; distance is normalized to the frame's own size so a drag across the
      // whole frame sweeps the full 0-100 focal range. Subtracting (not adding) the raw delta is
      // deliberate: focalX/focalY is "which part of the source image shows," which moves OPPOSITE
      // the photo's own apparent on-screen motion — dragging the mouse right should make the photo
      // itself appear to slide right, which means revealing more of its left side, i.e. a LOWER
      // focalX. Ported from the web app's own editor, which made this same fix.
      const focalX = Math.max(0, Math.min(100, drag.startFocalX - (dxPct / Math.max(1, primaryStart.widthPct)) * 100));
      const focalY = Math.max(0, Math.min(100, drag.startFocalY - (dyPct / Math.max(1, primaryStart.heightPct)) * 100));
      updateElement(drag.id, { focalX, focalY });
      if (guides.length) setGuides([]);
      return;
    }

    const groupIds = Object.keys(drag.groupStart);
    if (groupIds.length > 1) {
      // Multiple selected elements move together by the same delta. Guides/snapping are computed
      // from the PRIMARY (dragged) element against everything NOT in the group, exactly like a
      // single-element move — the resulting correction is then applied to every group member so
      // the whole selection snaps together instead of just the one frame under the cursor.
      // Clamped against the PRIMARY element's own width/height, not a flat 95 — a flat cap only
      // bounds the anchor CORNER, so anything wider/taller than 5% of the page could still be
      // dragged clean off the right/bottom edge with zero resistance. Ported from the web app's
      // own editor: no element may cross the page boundary on any side, including group drags.
      const groupCandidateX = Math.max(0, Math.min(100 - primaryStart.widthPct, primaryStart.xPct + dxPct));
      const groupCandidateY = Math.max(0, Math.min(100 - primaryStart.heightPct, primaryStart.yPct + dyPct));
      const groupOthers = elements.filter((x) => !drag.groupStart[x.id]);
      const groupCandidateBox = { xPct: groupCandidateX, yPct: groupCandidateY, widthPct: primaryStart.widthPct, heightPct: primaryStart.heightPct };
      const { guides: gAlignGuides, snapXPct: gaSnapX, snapYPct: gaSnapY } = computeAlignment(groupCandidateBox, groupOthers);
      const { guides: gSpacingGuides, snapXPct: gsSnapX, snapYPct: gsSnapY } = computeSpacingGuides(groupCandidateBox, groupOthers);
      setGuides(gAlignGuides);
      setSpacingGuides(gSpacingGuides);
      const correctionX = (gaSnapX ?? gsSnapX ?? groupCandidateX) - groupCandidateX;
      const correctionY = (gaSnapY ?? gsSnapY ?? groupCandidateY) - groupCandidateY;
      setElements((prev) =>
        prev.map((e2) => {
          const gs = drag.groupStart[e2.id];
          if (!gs) return e2;
          // Each group member clamped against its OWN width/height too — the shared delta keeps
          // the group moving together in the common case, but no individual member is ever let
          // through the page edge even if it's larger than the primary dragged element.
          const nx = Math.max(0, Math.min(100 - gs.widthPct, gs.xPct + dxPct + correctionX));
          const ny = Math.max(0, Math.min(100 - gs.heightPct, gs.yPct + dyPct + correctionY));
          return { ...e2, xPct: nx, yPct: ny };
        })
      );
      return;
    }

    // See the group-drag branch above for why this is clamped against the element's own
    // width/height rather than a flat 95 — same "never cross the page edge" fix.
    const candidateX = Math.max(0, Math.min(100 - primaryStart.widthPct, primaryStart.xPct + dxPct));
    const candidateY = Math.max(0, Math.min(100 - primaryStart.heightPct, primaryStart.yPct + dyPct));
    const others = elements.filter((x) => x.id !== drag.id);
    const candidateBox = { xPct: candidateX, yPct: candidateY, widthPct: primaryStart.widthPct, heightPct: primaryStart.heightPct };
    const { guides: nextGuides, snapXPct: aSnapX, snapYPct: aSnapY } = computeAlignment(candidateBox, others);
    const { guides: nextSpacingGuides, snapXPct: sSnapX, snapYPct: sSnapY } = computeSpacingGuides(candidateBox, others);
    setGuides(nextGuides);
    setSpacingGuides(nextSpacingGuides);
    updateElement(drag.id, {
      xPct: aSnapX ?? sSnapX ?? candidateX,
      yPct: aSnapY ?? sSnapY ?? candidateY,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
    if (marqueeRef.current) {
      justMarqueedRef.current = !!marqueeBox && (marqueeBox.w > 0.5 || marqueeBox.h > 0.5);
      marqueeRef.current = null;
      setMarqueeBox(null);
    }
    setGuides([]);
    setSpacingGuides([]);
    setMarginSnap({ x: false, y: false });
  };

  const photoById = new Map(photos.map((p) => [p.id, p]));
  // SpreadPreview (the page-switcher strip's thumbnail renderer) takes already-resolved id→url
  // maps rather than raw photo/ornament rows — built here from the same `photos`/`customOrnaments`
  // props everything else on this page already uses, so no separate fetch is needed.
  const previewUrls = new Map(photos.map((p) => [p.id, p.url]));
  const customOrnamentUrls = new Map((customOrnaments ?? []).map((o) => [o.id, o.url]));

  // Ported from the web app's own editor — unsaved-changes gate for closing the editor, and (once
  // `spreads`/`onSwitchSpread` are supplied) for the bottom page-switcher strip too. Skips web's
  // renderPreviewNow() call — that regenerates a cloud preview thumbnail used by the web app's own
  // gallery list view, which has no desktop equivalent.
  const isDirty = () => JSON.stringify([elements, backgroundPhotoId, backgroundBlur, backgroundOpacity, backgroundZoom]) !== initialSnapshotRef.current;

  const requestLeave = async (action: () => void) => {
    if (!isDirty()) {
      action();
      return;
    }
    if (skipExitConfirm) {
      // onSave may be async (AlbumPageEditor.tsx's handleSave is) — awaiting it here ensures any
      // of its own trailing state resets land BEFORE action() runs, not after.
      await onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom });
      action();
      return;
    }
    setPendingLeaveAction(() => action);
    setExitConfirmOpen(true);
  };

  const handleCloseAttempt = () => requestLeave(onClose);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 overflow-hidden ${ALBUM_FONT_CLASS_NAMES}`}
      style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      // Right-click (and the page's own custom menu, if it ever grows one) does nothing here —
      // there's no editor context menu to show. Shift+right-click specifically forces the
      // browser/OS's OWN native menu open regardless of this handler — that's a deliberate
      // browser-level user override with no JS hook to intercept, not something this can block.
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Ported from the web app — every slider here used to fall through to each browser's own
          default range-input thumb (whatever size/shape that happens to be), which read as visibly
          out of proportion once these controls started living in narrower panels. One explicit,
          consistent thumb for all of them. */}
      <style>{`
        .gf-slider-thumb {
          height: 4px;
          border-radius: 2px;
          background: var(--color-line);
          -webkit-appearance: none;
          appearance: none;
        }
        .gf-slider-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--color-amber-deep);
          box-shadow: 0 1px 3px rgba(30, 27, 46, 0.35);
          cursor: pointer;
          margin-top: -6px;
        }
        .gf-slider-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 50%;
          background: var(--color-amber-deep);
          box-shadow: 0 1px 3px rgba(30, 27, 46, 0.35);
          cursor: pointer;
        }
        .gf-slider-thumb::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: var(--color-line);
        }
      `}</style>
      {/* Mobile keeps the original compact bottom-sheet-ish modal (single column, whole-panel
          scroll). From the lg: breakpoint up, the panel expands to fill nearly the whole window
          and splits into two flex columns — a large centered canvas on one side and a
          scrollable controls sidebar on the other — since the cramped max-w-sm modal was a real
          problem on desktop, where there's plenty of room to work more comfortably. */}
      <div className="w-full max-w-sm lg:max-w-none lg:w-[95vw] lg:h-[92vh] rounded-3xl p-4 lg:px-6 lg:pt-2 lg:pb-4 bg-paper shadow-sheet max-h-[92vh] overflow-y-auto overscroll-contain lg:overflow-visible lg:flex lg:flex-row lg:gap-6">
        <div className="lg:flex-1 lg:flex lg:flex-col lg:min-w-0 lg:min-h-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold font-display">{mode === "custom" ? "עיצוב חופשי" : "הוספת טקסט לעמוד"}</h2>
          <div className="flex items-center gap-2">
            {mode === "custom" && (
              <button
                onClick={() => setGuideOpen(true)}
                className="h-8 pr-3 pl-2.5 rounded-full flex items-center gap-1 bg-white border border-line text-xs font-bold whitespace-nowrap"
                style={{ color: "var(--color-amber-deep)" }}
              >
                <IconInfo size={13} />
                מדריך למשתמש
              </button>
            )}
            <button onClick={handleCloseAttempt} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center bg-white border border-line">
              <IconClose />
            </button>
          </div>
        </div>
        {guideOpen && <AlbumEditorGuideModal onClose={() => setGuideOpen(false)} />}

        <div
          ref={canvasWrapRef}
          className="lg:flex-1 lg:flex lg:items-center lg:justify-center lg:min-h-0"
          style={{ background: "#d7d5df", borderRadius: 20, padding: 12 }}
        >
        {/* Not overflow-hidden (unlike the canvas below) so the floating photo menu — and the
            flyout sliders it opens — can bleed past the canvas's own edge, not just the photo's. */}
        <div className="relative w-full lg:max-w-full">
        <div
          ref={canvasRef}
          onPointerDown={(e) => {
            // A press directly on the empty canvas (not bubbled from an element, which all
            // stopPropagation their own pointerdown) starts a rubber-band marquee — held Shift
            // adds newly-enclosed photos to whatever's already selected instead of replacing it.
            if (e.target !== e.currentTarget) return;
            const rect = canvasRef.current!.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            marqueeRef.current = { startXPct: xPct, startYPct: yPct, base: e.shiftKey ? new Set(selectedIds) : new Set() };
            setMarqueeBox({ x: xPct, y: yPct, w: 0, h: 0 });
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const dropped = e.dataTransfer.getData("text/plain");
            if (!dropped) return;
            const rect = canvasRef.current!.getBoundingClientRect();
            const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            if (dropped.startsWith("multi:")) {
              // A bundle of favorite photos dragged together from the panel. If a template was
              // already applied (or frames added manually) leaving empty photo frames on the
              // page, fill those first — each photo goes into whichever empty frame's own aspect
              // ratio is closest to its own (portrait photos into portrait-shaped frames, etc, a
              // simple greedy best-fit rather than a full optimal assignment). Only once every
              // empty frame is used does this fall back to fresh cascaded/collage frames.
              e.preventDefault();
              const ids = dropped.slice(6).split(",").filter(Boolean);
              const emptyFrames = elements.filter((el): el is AlbumPhotoElement => el.type === "photo" && !el.photoId);
              Promise.all(ids.map(async (id) => ({ id, aspect: await loadImageAspect(photoById.get(id)?.url ?? "") }))).then(async (items) => {
                if (emptyFrames.length === 0) {
                  const frames = ids.length >= 2 ? await buildCollageLayout(ids) : await buildOrientedPhotoFrames(ids, xPct, yPct);
                  setElements((prev) => [...prev, ...frames]);
                  setSelectedIds(new Set(frames.map((f) => f.id)));
                  return;
                }
                const canvasW = album.width_cm || 1;
                const canvasH = album.height_cm || 1;
                const frameAspect = (f: AlbumPhotoElement) => ((f.widthPct / 100) * canvasW) / ((f.heightPct / 100) * canvasH);
                const remainingItems = [...items];
                const assignments: { frameId: string; photoId: string }[] = [];
                for (const frame of emptyFrames) {
                  if (remainingItems.length === 0) break;
                  const fa = frameAspect(frame);
                  let bestIdx = 0;
                  let bestDiff = Infinity;
                  remainingItems.forEach((item, idx) => {
                    const diff = Math.abs(item.aspect - fa);
                    if (diff < bestDiff) {
                      bestDiff = diff;
                      bestIdx = idx;
                    }
                  });
                  assignments.push({ frameId: frame.id, photoId: remainingItems.splice(bestIdx, 1)[0].id });
                }
                const leftoverIds = remainingItems.map((it) => it.id);
                const leftoverFrames = leftoverIds.length > 0 ? await buildOrientedPhotoFrames(leftoverIds, xPct, yPct) : [];
                setElements((prev) => [
                  ...prev.map((el) => {
                    const a = assignments.find((x) => x.frameId === el.id);
                    if (!a || el.type !== "photo") return el;
                    const matchedItem = items.find((it) => it.id === a.photoId);
                    if (!matchedItem) return { ...el, photoId: a.photoId, focalX: 50, focalY: 50 };
                    const boxWCm = (el.widthPct / 100) * canvasW;
                    const boxHCm = (el.heightPct / 100) * canvasH;
                    const boxAspect = boxWCm / boxHCm;
                    let widthCm: number;
                    let heightCm: number;
                    if (matchedItem.aspect > boxAspect) {
                      widthCm = boxWCm;
                      heightCm = widthCm / matchedItem.aspect;
                    } else {
                      heightCm = boxHCm;
                      widthCm = heightCm * matchedItem.aspect;
                    }
                    const widthPct = (widthCm / canvasW) * 100;
                    const heightPct = (heightCm / canvasH) * 100;
                    const centerX = el.xPct + el.widthPct / 2;
                    const centerY = el.yPct + el.heightPct / 2;
                    return {
                      ...el,
                      photoId: a.photoId,
                      focalX: 50,
                      focalY: 50,
                      widthPct,
                      heightPct,
                      xPct: centerX - widthPct / 2,
                      yPct: centerY - heightPct / 2,
                    };
                  }),
                  ...leftoverFrames,
                ]);
                setSelectedIds(new Set([...assignments.map((a) => a.frameId), ...leftoverFrames.map((f) => f.id)]));
              });
              setDragPanelSelectedIds(new Set());
              return;
            }
            if (
              !dropped.startsWith("ornament:") &&
              !dropped.startsWith("customOrnament:") &&
              !dropped.startsWith("shape:") &&
              !dropped.startsWith("shapeOutline:") &&
              !dropped.startsWith("mask:")
            ) {
              // A single favorite photo dropped on empty canvas (not consumed by any frame's own
              // onDrop, which stops propagation when it lands on an existing frame) — create a new
              // frame sized to match the photo's real orientation instead of silently doing nothing.
              e.preventDefault();
              buildOrientedPhotoFrames([dropped], xPct, yPct).then((frames) => {
                setElements((prev) => [...prev, ...frames]);
                setSelectedIds(new Set(frames.map((f) => f.id)));
              });
              return;
            }
            if (dropped.startsWith("mask:")) return;
            e.preventDefault();
            if (dropped.startsWith("customOrnament:")) addCustomOrnament(dropped.slice(15), { xPct, yPct });
            else if (dropped.startsWith("shapeOutline:")) addOutlineShape(dropped.slice(13) as "square" | "rectangle" | "circle" | "line", { xPct, yPct });
            else if (dropped.startsWith("shape:")) addShape(dropped.slice(6) === "__plain__" ? undefined : dropped.slice(6), { xPct, yPct });
            else addOrnament(dropped.slice(9), { xPct, yPct });
          }}
          onClick={(e) => {
            // Deselect only when the canvas background itself was clicked — a click on an
            // element bubbles up here too (pointerdown selecting it happens first, but a plain
            // stopPropagation on that pointerdown doesn't stop the separate click event that
            // follows on pointerup), so without this check every selection immediately
            // undid itself before the resize handle even had a chance to render. A click that
            // follows a real marquee drag is suppressed once so finishing the marquee doesn't
            // immediately wipe out the selection it just made.
            if (e.target !== e.currentTarget) return;
            if (justMarqueedRef.current) {
              justMarqueedRef.current = false;
              return;
            }
            setSelectedIds(new Set());
          }}
          className="relative w-full lg:mx-auto rounded-xl overflow-hidden select-none"
          style={{
            containerType: "inline-size",
            // Always literal white — the physical printed page, not an app surface, so it doesn't
            // follow any theme. The gray backdrop around it (canvasWrapRef's own style above) is
            // what keeps a white page from disappearing into its surroundings.
            background: "#ffffff",
            aspectRatio: `${album.width_cm || 16} / ${album.height_cm || 10}`,
            ...(canvasSizePx ? { width: `${canvasSizePx.width}px`, height: `${canvasSizePx.height}px` } : {}),
          }}
        >
          {backgroundPhoto?.url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={backgroundPhoto.url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                opacity: backgroundOpacity / 100,
                filter: backgroundBlur ? `blur(${(backgroundBlur / 100) * ALBUM_BLUR_MAX_PX}px)` : undefined,
                transform: backgroundZoom !== 100 ? `scale(${backgroundZoom / 100})` : undefined,
              }}
            />
          )}
          {mode === "overlay" && (
            <div className={`absolute inset-0 flex ${spread.layout === "stack" ? "flex-col" : "flex-row"} gap-0.5 pointer-events-none`}>
              {photo1 && (
                <div className="relative overflow-hidden" style={{ flex: photo2 && spread.layout === "feature" ? 1 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo1.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_1}% ${spread.focal_y_1}%` }} />
                </div>
              )}
              {photo2 && (
                <div className="relative overflow-hidden" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo2.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_2}% ${spread.focal_y_2}%` }} />
                </div>
              )}
            </div>
          )}

          <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
            {/* One <defs> per photo, keyed by id — ported from the web app's own editor. So
                dragging one photo's adjustment sliders only touches that photo's own filter DOM
                node (React skips unchanged siblings), instead of re-parsing every adjusted
                photo's filter on every tick. */}
            {elements
              .filter((el): el is AlbumPhotoElement => el.type === "photo" && hasAdjustments(el))
              .map((el) => (
                <defs key={el.id} dangerouslySetInnerHTML={{ __html: adjustmentsSvgFilter(el.id, el) }} />
              ))}
            {elements
              .filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.sharpness)
              .map((el) => (
                <defs key={`sharpen-${el.id}`} dangerouslySetInnerHTML={{ __html: sharpenSvgFilter(el.id, el.sharpness) }} />
              ))}
          </svg>

          {elements
            .filter((el) => mode === "custom" || el.type === "text")
            .map((el) => {
              const isSelected = selectedIds.has(el.id);
              if (el.type === "photo") {
                const photo = el.photoId ? photoById.get(el.photoId) : null;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      // Alt/Cmd+click centers the PHOTO inside its own fixed frame (resets its
                      // focal point) — it never moves the frame itself across the page.
                      if (photo && (e.altKey || e.metaKey)) {
                        e.stopPropagation();
                        setSelectedIds(new Set([el.id]));
                        updateElement(el.id, { focalX: 50, focalY: 50 });
                        return;
                      }
                      if (e.shiftKey) {
                        // Shift-click toggles this frame in/out of the selection instead of
                        // starting a drag — mixing in a text element (which isn't part of this
                        // multi-select model) just drops it and starts a fresh photo-only set.
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const photoOnly = [...prev].every((id) => elements.find((x) => x.id === id)?.type === "photo");
                          const next = new Set(photoOnly ? prev : []);
                          if (next.has(el.id)) next.delete(el.id);
                          else next.add(el.id);
                          return next;
                        });
                        return;
                      }
                      // A plain click on a frame already part of a multi-selection keeps the whole
                      // group selected (so the drag that follows moves all of them); otherwise it
                      // collapses selection down to just this one, matching every other design tool.
                      const group = selectedIds.has(el.id) && selectedIds.size > 1 ? Array.from(selectedIds) : [el.id];
                      setSelectedIds(new Set(group));
                      startDrag(e, el, "move", undefined, group);
                    }}
                    onDoubleClick={(e) => {
                      // A double-click centers the photo within its frame directly (no extra click
                      // needed) and also drops straight into "position image" mode — the same mode
                      // the floating menu's מיקום התמונה button opens — so a following drag pans the
                      // now-centered photo inside its own fixed frame instead of moving the frame.
                      if (!photo) return;
                      e.stopPropagation();
                      updateElement(el.id, { focalX: 50, focalY: 50 });
                      setSelectedIds(new Set([el.id]));
                      setPanModeId(el.id);
                    }}
                    onContextMenu={(e) => {
                      // Right-click still never shows an OS/browser context menu (see the modal
                      // root's own onContextMenu), but now selects the frame first, which is what
                      // actually makes the floating design menu appear — previously this was a
                      // dead click that needed a left-click first regardless.
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.getData("text/plain");
                      if (!dropped) return;
                      if (dropped.startsWith("mask:")) {
                        const maskId = dropped.slice(5);
                        updateElement(el.id, { maskId: maskId === "__none__" ? undefined : maskId });
                      } else if (dropped.startsWith("ornament:") || dropped.startsWith("customOrnament:")) {
                        // Not a photo/mask drop — leave it to bubble up to the canvas's own
                        // onDrop, which places a new ornament element at the actual drop point
                        // regardless of what it happened to land on top of.
                      } else {
                        updateElement(el.id, { photoId: dropped, focalX: 50, focalY: 50 });
                      }
                    }}
                    className={`absolute overflow-hidden ${photo ? (panModeId === el.id ? "cursor-crosshair" : "cursor-move") : "cursor-move flex items-center justify-center bg-chip"}`}
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      outline: el.borderWidth
                        ? undefined
                        : panModeId === el.id
                        ? "2px solid var(--color-sage)"
                        : isSelected
                        ? "2px solid var(--color-amber-deep)"
                        : "1px dashed rgba(255,255,255,0.6)",
                      // box-shadow (unlike outline, and unlike a filter on the img) isn't clipped
                      // by this div's own overflow-hidden — it's what lets the shadow bleed past
                      // the frame, and the border below folds into it for the same reason.
                      boxShadow: combinedBoxShadowFor(el.shadow, el.borderWidth, el.borderColor, el.shadowDistance, el.shadowBlur),
                      // Rotation lives on THIS element (not the <img>) so the outline and
                      // box-shadow — both decorations of this same box — rotate along with the
                      // clipped photo as one rigid tile, instead of only the image content
                      // spinning inside a frame that stays visually fixed.
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    }}
                  >
                    {photo?.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        style={{
                          objectPosition: `${el.focalX}% ${el.focalY}%`,
                          filter: cssFilterFor(el.filter, el.blur, { id: el.id, adj: el }, el.sharpness),
                          opacity: (el.opacity ?? 100) / 100,
                          // Zoom is a crop-level operation (how much of the image shows inside the
                          // already-fixed, already-rotated frame) so it stays on the image itself,
                          // separate from the frame's own rotation above.
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
                    ) : (
                      <span
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPickerForFrame(el.id);
                        }}
                        className="text-ink-soft text-2xl cursor-pointer"
                      >
                        +
                      </span>
                    )}
                    {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
                  </div>
                );
              }
              if (el.type === "ornament") {
                const ornament = el.customOrnamentId ? null : findOrnament(el.ornamentId);
                const customUrl = el.customOrnamentId ? customOrnaments?.find((o) => o.id === el.customOrnamentId)?.url : undefined;
                const imgSrc = customUrl ?? (ornament ? ornamentDataUrl(ornament, el.color ?? "#2e3142") : undefined);
                const customTint = el.customOrnamentId && el.color ? el.color : undefined;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      setSelectedIds(new Set([el.id]));
                      startDrag(e, el, "move");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                    }}
                    className="absolute cursor-move"
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      opacity: (el.opacity ?? 100) / 100,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      outline: el.borderWidth
                        ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
                        : isSelected
                        ? "2px dashed var(--color-amber-deep)"
                        : "none",
                      outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
                    }}
                  >
                    {imgSrc &&
                      (customTint ? (
                        <div
                          className="w-full h-full pointer-events-none"
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
                        <img src={imgSrc} draggable={false} className="w-full h-full pointer-events-none" style={{ objectFit: "contain" }} />
                      ))}
                    {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
                  </div>
                );
              }
              if (el.type === "shape") {
                const mask = el.maskId ? findMask(el.maskId) : undefined;
                const isOutline = el.shapeStyle === "rect-outline" || el.shapeStyle === "circle-outline";
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => {
                      setSelectedIds(new Set([el.id]));
                      startDrag(e, el, "move");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds(new Set([el.id]));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dropped = e.dataTransfer.getData("text/plain");
                      if (!dropped?.startsWith("mask:")) return;
                      const maskId = dropped.slice(5);
                      updateElement(el.id, { maskId: maskId === "__none__" ? undefined : maskId });
                    }}
                    className="absolute cursor-move"
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      opacity: (el.opacity ?? 100) / 100,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      borderRadius: el.shapeStyle === "circle-outline" ? "50%" : undefined,
                      border: isOutline ? `${el.borderWidth ?? 5}px solid ${el.borderColor ?? el.color}` : undefined,
                      outline: isOutline
                        ? isSelected
                          ? "2px dashed var(--color-amber-deep)"
                          : "none"
                        : el.borderWidth
                        ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}`
                        : isSelected
                        ? "2px dashed var(--color-amber-deep)"
                        : "none",
                      outlineOffset: isOutline ? "2px" : el.borderWidth ? `-${el.borderWidth}px` : undefined,
                      boxShadow: boxShadowFor(el.shadow),
                    }}
                  >
                    {!isOutline && (
                      <div
                        className="w-full h-full pointer-events-none"
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
                    )}
                    {isSelected && !el.locked && renderResizeHandles(el, startDrag)}
                  </div>
                );
              }
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => {
                    setSelectedIds(new Set([el.id]));
                    startDrag(e, el, "move");
                  }}
                  className="absolute cursor-move px-1 flex items-center overflow-visible"
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.widthPct}%`,
                    height: `${el.heightPct ?? 15}%`,
                    justifyContent: el.align === "right" ? "flex-end" : el.align === "left" ? "flex-start" : "center",
                    textAlign: el.align,
                    color: el.color,
                    // fontSize is stored in points on the album's fixed 1600pt PDF reference canvas
                    // (matches PAGE_WIDTH in albumPdf.ts) — cqw here is "% of this canvas's own
                    // rendered width," so the same ratio keeps the same visual size everywhere.
                    fontSize: `calc(${el.fontSize} / 1600 * 100cqw)`,
                    fontFamily: albumFontFamilyCss(el.fontFamily),
                    fontWeight: 700,
                    textShadow: isLightTextColor(el.color) ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
                    outline: isSelected ? "2px dashed var(--color-amber-deep)" : "none",
                  }}
                >
                  <span>{el.text}</span>
                  {isSelected && (
                    <span
                      onPointerDown={(e) => startDrag(e, el, "resize")}
                      className="absolute bottom-0.5 left-0.5 h-4 w-4 bg-amber-deep cursor-nwse-resize rounded-sm"
                    />
                  )}
                </div>
              );
            })}

          {/* Print-safe margin guide — visual-only (never exported), shows where a 0.5cm trim
              margin falls on every edge regardless of the album's physical size, so nothing
              important gets designed too close to where a printer might trim it off. */}
          {marginInsetPct && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${marginInsetPct.x}%`,
                top: `${marginInsetPct.y}%`,
                right: `${marginInsetPct.x}%`,
                bottom: `${marginInsetPct.y}%`,
                // Brightens while an active resize is snapped to this line (either axis) — ported
                // from the web app's own editor, same visual-confirmation idea as an
                // element-to-element snap guide.
                border: `${marginSnap.x || marginSnap.y ? 3 : 2}px solid #2fae5c`,
                opacity: marginSnap.x || marginSnap.y ? 1 : 0.55,
              }}
            />
          )}

          {/* Page-center guide — always visible (not just while dragging), same green as the
              print-safe margin frame above, so the page's own center is a fixed visual reference
              alongside it rather than something that only appears mid-drag. */}
          <div className="absolute pointer-events-none" style={{ left: "50%", top: 0, bottom: 0, width: 0, borderRight: "2px solid #2fae5c", opacity: 0.55 }} />
          <div className="absolute pointer-events-none" style={{ top: "50%", left: 0, right: 0, height: 0, borderBottom: "2px solid #2fae5c", opacity: 0.55 }} />

          {/* Smart alignment guides — page-center and edge/center lines against other elements,
              shown only while actively dragging a frame. */}
          {guides.map((g, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={
                g.axis === "v"
                  ? { left: `${g.pos}%`, top: 0, bottom: 0, width: 0, borderRight: "1px solid var(--color-rose)" }
                  : { top: `${g.pos}%`, left: 0, right: 0, height: 0, borderBottom: "1px solid var(--color-rose)" }
              }
            />
          ))}

          {/* Equal-spacing guides — a different color (sage) from the rose alignment lines so the
              two kinds of snap read as distinct: "lined up" vs "evenly spaced". */}
          {spacingGuides.map((g, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={
                g.orientation === "horizontal"
                  ? { left: `${g.x}%`, top: `${g.y}%`, width: `${g.length}%`, height: 0, borderTop: "2px dashed var(--color-sage)" }
                  : { left: `${g.x}%`, top: `${g.y}%`, width: 0, height: `${g.length}%`, borderLeft: "2px dashed var(--color-sage)" }
              }
            />
          ))}

          {/* Rubber-band marquee selection box — live while dragging on empty canvas. */}
          {marqueeBox && (
            <div
              className="absolute pointer-events-none border-2"
              style={{
                left: `${marqueeBox.x}%`,
                top: `${marqueeBox.y}%`,
                width: `${marqueeBox.w}%`,
                height: `${marqueeBox.h}%`,
                borderColor: "var(--color-amber-deep)",
                background: "rgba(74,95,217,0.08)",
              }}
            />
          )}
        </div>
        {anchorPhoto && menuAnchorPhoto && menuPositionStyle && (() => {
          // Used to track the selected photo's own x position (and flip left/right depending on
          // which canvas half it sat in) — dropped entirely: the menu now opens at one fixed spot
          // on the canvas's own right edge no matter where the photo is.
          const sidePosition: React.CSSProperties = { right: "8px", left: "auto" };
          return (
          <PhotoFloatingMenu
            el={anchorPhoto}
            positionStyle={{ ...menuPositionStyle, ...sidePosition }}
            menuRef={photoMenuRef}
            panning={selectedIds.size === 1 && panModeId === anchorPhoto.id}
            onTogglePan={() => {
              if (selectedIds.size !== 1) return;
              setPanModeId((prev) => (prev === anchorPhoto.id ? null : anchorPhoto.id));
            }}
            onUpdate={(patch) => applyToSelectedPhotos(patch)}
            onTrueSize={() => showTrueSize(selectedPhotos.filter((p) => p.photoId).map((p) => p.id))}
            onDeleteSelected={removeSelected}
            onBringToFront={() => bringToFront(anchorPhoto.id)}
            onSendToBack={() => sendToBack(anchorPhoto.id)}
            dragOffset={photoMenuDrag.offset}
            dragGripHandlers={photoMenuDrag.gripHandlers}
            shadowPanelOpen={photoShadowPanelOpen}
            onToggleShadowPanel={() => setPhotoShadowPanelOpen((v) => !v)}
            photoAdjustPanelOpen={photoAdjustPanelOpen}
            onTogglePhotoAdjustPanel={() => setPhotoAdjustPanelOpen((v) => !v)}
          />
          );
        })()}
        {/* A single dedicated toggle for the text styling panel, positioned at the canvas's own top
            edge (not tracking the selected text box's position) — same "stop making panels jump
            around when the selection changes" reasoning as the big side panel below. Text has no
            multi-button circular strip of its own the way photos do; one button is enough since
            everything else (color/font/align/size/delete) lives inside the panel this opens. */}
        {selectedText && canvasRestRect && (
          <div className="fixed z-20" style={{ top: canvasRestRect.top + 8, right: "8px" }}>
            <CircleButton label="עריכת טקסט — גופן, צבע, יישור ועוד" active={textPanelOpen} onClick={() => setTextPanelOpen((v) => !v)}>
              <span className="font-display font-bold" style={{ fontSize: 15 }}>T</span>
            </CircleButton>
          </div>
        )}
        {lastSideSelection && canvasRestRect && (() => {
          // A single fixed screen position — never computed from the selected element's own
          // position, so the panel doesn't jump around every time a different element is selected.
          const openOnLeft = true;
          const panelWidth = lastSideSelection.type === "photo" ? photoPanelSize.width : 150;
          const photoAdjustMaxHeightPx = lastSideSelection.type === "photo" ? photoPanelSize.height : undefined;
          // Sits right at the canvas's own top edge for the photo panel; ornament/shape/text keep
          // the canvas-centered fallback. sidePanelDrag's own clamp (see its declaration) keeps the
          // photo panel from being dragged past the canvas's own top/bottom edges from here.
          const centerY = canvasRestRect.top + canvasRestRect.height / 2;
          const panelTopPx = lastSideSelection.type === "photo" ? canvasRestRect.top : centerY;
          // Suspends the open/close transition during EITHER a live drag OR a live resize — both
          // change this element's own size/position every pointermove, and a CSS transition on
          // those same properties would otherwise fight the real-time updates.
          const suspendTransition = sidePanelDrag.isDragging || photoPanelSize.isResizing;
          return (
          <div
            className="fixed z-20"
            style={{
              top: panelTopPx,
              left: openOnLeft
                ? Math.max(8, canvasRestRect.left + 8 - (lastSideSelection.type === "photo" ? panelLeftShiftPx : 0))
                : Math.max(canvasRestRect.left + 8, Math.min(canvasRestRect.left + canvasRestRect.width - panelWidth - 8, window.innerWidth - panelWidth - 16)),
              // The open/close slide-in transform composes with the free drag offset by appending a
              // second translate() — CSS applies multiple translate()s additively, so the panel
              // still opens/closes with its usual animation AND stays wherever it was last dragged to.
              transform: `${
                photoAdjustMaxHeightPx != null
                  ? sidePanelOpen ? "translateX(0)" : "translateX(10px)"
                  : sidePanelOpen ? "translateY(-50%) translateX(0)" : "translateY(-50%) translateX(10px)"
              } translate(${sidePanelDrag.offset.x}px, ${sidePanelDrag.offset.y}px)`,
              opacity: sidePanelOpen ? 1 : 0,
              pointerEvents: sidePanelOpen ? "auto" : "none",
              transition: suspendTransition ? "none" : "opacity 220ms ease, transform 220ms ease",
            }}
          >
            <PanelDragGrip handlers={sidePanelDrag.gripHandlers} />
            {lastSideSelection.type === "photo" && <PanelResizeHandle handlers={photoPanelSize.resizeHandlers} />}
            {lastSideSelection.type === "ornament" ? (
              <OrnamentFloatingMenu
                el={lastSideSelection.el}
                onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)}
                onDeleteSelected={removeSelected}
                onBringToFront={() => bringToFront(lastSideSelection.el.id)}
                onSendToBack={() => sendToBack(lastSideSelection.el.id)}
              />
            ) : lastSideSelection.type === "shape" ? (
              <ShapeFloatingMenu
                el={lastSideSelection.el}
                albumHeightCm={album.height_cm}
                onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)}
                onDeleteSelected={removeSelected}
                onBringToFront={() => bringToFront(lastSideSelection.el.id)}
                onSendToBack={() => sendToBack(lastSideSelection.el.id)}
                onOpenMasksPicker={(rect) => {
                  setMasksPanelRect(rect);
                  setMasksPickerOpen(true);
                }}
              />
            ) : lastSideSelection.type === "text" ? (
              <TextFloatingMenu el={lastSideSelection.el} album={album} onUpdate={(patch) => updateElement(lastSideSelection.el.id, patch)} onDeleteSelected={removeSelected} />
            ) : (
              <PhotoAdjustFloatingMenu
                el={lastSideSelection.el}
                onUpdate={(patch) => applyToSelectedPhotos(patch)}
                maxHeightPx={photoAdjustMaxHeightPx}
                widthPx={panelWidth}
              />
            )}
          </div>
          );
        })()}
        {/* The shadow/border overlay — appears as a layer ON TOP of the "עריכת תמונה" panel (same
            position/left-shift/drag-offset, higher z-index) rather than as a small flyout attached
            to the circle menu's own "צל" button. Only mounted while open — it disappears the
            instant the photo is deselected, since photoShadowPanelOpen itself resets to false
            whenever anchorPhoto changes, and the next click on "צל" reopens it fresh. */}
        {photoShadowPanelOpen && anchorPhoto && canvasRestRect && (
          <div
            className="fixed z-[25]"
            style={{
              top: canvasRestRect.top,
              left: Math.max(8, canvasRestRect.left + 8 - panelLeftShiftPx),
              transform: `translate(${sidePanelDrag.offset.x}px, ${sidePanelDrag.offset.y}px)`,
            }}
          >
            <PhotoShadowOverlayPanel
              el={anchorPhoto}
              onUpdate={(patch) => applyToSelectedPhotos(patch)}
              onApplyShadowToAll={() => applyShadowToAllPhotos(anchorPhoto.id)}
              widthPx={photoPanelSize.width}
            />
          </div>
        )}
        </div>
        </div>

        {/* The current page used to be filtered OUT of this list, which meant every page switch
            removed a different item from the strip and the whole row visibly reflowed even though
            the underlying page order never actually changed. Always rendering every page keeps the
            row's order and positions stable across switches; the current one is just marked
            instead of vanishing. */}
        {mode === "custom" && spreads && spreads.length > 1 && onSwitchSpread && (
          // Pinned to the canvas's own actually-rendered width (not the wider column it sits in —
          // the canvas itself can be narrower than the column once its own aspect ratio makes
          // height the binding dimension) and centered under it, with a thin separator line above
          // so it reads as its own region rather than bleeding into the canvas.
          <div
            className="mt-3 pt-3 rounded-2xl border-t border-line"
            style={{ width: canvasRestRect ? canvasRestRect.width : undefined, margin: "12px auto 0" }}
          >
            <div className="rounded-2xl p-3" style={{ background: "var(--color-chip)" }}>
            <p className="text-[11px] font-bold text-ink-soft mb-2">שאר העמודים באלבום</p>
            <div className="flex items-center gap-2 overflow-x-auto overscroll-contain pb-1">
              {spreads.map((s, i) => {
                const isCurrent = s.id === spread.id;
                const bg = s.background_photo_id ? photoById.get(s.background_photo_id) : undefined;
                return (
                  <div
                    key={s.id}
                    className="relative shrink-0 rounded-lg overflow-hidden w-[calc(25%-5px)]"
                    style={{
                      // The page's own real proportions, not a flat square — matches the grid's
                      // own SpreadPreview wrapper (AlbumBrowser.tsx) so a page's thumbnail looks
                      // the same shape everywhere it's shown.
                      aspectRatio: `${s.width_cm ?? album.width_cm} / ${s.height_cm ?? album.height_cm}`,
                      outline: isCurrent ? "2px solid var(--color-amber-deep)" : "1px solid var(--color-line)",
                      outlineOffset: isCurrent ? "-2px" : undefined,
                      opacity: isCurrent ? 0.7 : 1,
                      cursor: isCurrent ? "default" : "pointer",
                    }}
                    onClick={isCurrent ? undefined : () => requestLeave(() => onSwitchSpread(s.id))}
                  >
                    <SpreadPreview
                      elements={s.elements}
                      previewUrls={previewUrls}
                      background={bg ? { url: bg.url, blur: s.background_blur, opacity: s.background_opacity } : null}
                      customOrnamentUrls={customOrnamentUrls}
                    />
                    <span
                      className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: isCurrent ? "var(--color-amber-deep)" : "rgba(46,49,66,0.65)" }}
                    >
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {mode === "custom" && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <p className="text-[11px] font-bold text-ink-soft shrink-0">גררו תמונה מועדפת אל המסגרת הרצויה</p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* The switch itself has no visible label text (just a bare pill), so its native
                    title tooltip is easy to miss entirely — this adds an always-discoverable (?)
                    icon with a custom tooltip that explains what the toggle does. */}
                <span
                  className="text-ink-soft/70 cursor-help flex items-center shrink-0"
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setHoverZoomTooltipPos({ top: r.top, right: window.innerWidth - r.right });
                  }}
                  onMouseLeave={() => setHoverZoomTooltipPos(null)}
                >
                  <IconInfo size={13} />
                </span>
                {hoverZoomTooltipPos && (
                  <div
                    className="pointer-events-none fixed w-40 rounded-lg bg-ink text-white text-[10px] leading-snug p-2 z-[95] text-right"
                    style={{ top: hoverZoomTooltipPos.top, right: hoverZoomTooltipPos.right, transform: "translateY(calc(-100% - 6px))" }}
                  >
                    כשהמתג פעיל, ריחוף עם העכבר מעל תמונה בפאנל מציג תצוגה מקדימה מוגדלת שלה
                  </div>
                )}
                <button
                  onClick={() => setDragPanelHoverZoomEnabled((v) => !v)}
                  role="switch"
                  aria-checked={dragPanelHoverZoomEnabled}
                  title="תצוגה מוגדלת בריחוף עכבר"
                  className="relative shrink-0 rounded-full flex items-center px-0.5 h-4.5 w-8"
                  style={{
                    background: dragPanelHoverZoomEnabled ? "var(--color-amber-deep)" : "var(--color-line)",
                    justifyContent: dragPanelHoverZoomEnabled ? "flex-start" : "flex-end",
                  }}
                >
                  <span className="rounded-full shadow h-3.5 w-3.5" style={{ background: "#fff" }} />
                </button>
                {dragPanelSelectedIds.size > 0 && (
                  <button
                    onClick={() => setDragPanelSelectedIds(new Set())}
                    className="text-[11px] font-semibold shrink-0"
                    style={{ color: "var(--color-amber-deep)" }}
                  >
                    {dragPanelSelectedIds.size} נבחרו — ניקוי
                  </button>
                )}
                {favoritePhotos.length > 1 && (
                  <select
                    value={dragPanelSort}
                    onChange={(e) => setDragPanelSort(e.target.value as "default" | "name" | "date")}
                    title="סדר הצגת התמונות ברשימה"
                    className="text-[11px] font-semibold text-ink-soft bg-transparent underline shrink-0"
                  >
                    <option value="default">מיון: ברירת מחדל</option>
                    <option value="name">מיון: שם</option>
                    <option value="date">מיון: תאריך</option>
                  </select>
                )}
                {favoritePhotos.length > 0 && (
                  <button onClick={() => setShowAllDragPanel((v) => !v)} className="text-[11px] font-semibold text-ink-soft underline shrink-0">
                    {showAllDragPanel ? "רק זמינות" : "הצג הכל"}
                  </button>
                )}
              </div>
            </div>
            {dragPanelGroups.length > 0 && (
              <p className="text-[10px] text-ink-soft mb-1.5">
                לחיצה בוחרת כמה תמונות יחד — גוררים כל אחת מהן כדי לשבץ את כולן בעמוד, לפי הכיוון של כל תמונה
              </p>
            )}
            {dragPanelGroups.length === 0 ? (
              <p className="text-[11px] text-ink-soft text-center py-3">
                {favoritePhotos.length === 0 ? "אין תמונות מועדפות בגלריה הזו עדיין." : "כל התמונות המועדפות כבר שובצו בעמוד."}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-0.5" onMouseLeave={() => { hoverPreviewTokenRef.current++; setDragPanelHoverPreview(null); }}>
                {dragPanelGroups.map((group) => (
                  <div key={group.id}>
                    {group.name && <p className="text-[10px] font-semibold text-ink-soft mb-1">{group.name}</p>}
                    <div className="grid grid-cols-5 gap-1.5">
                      {group.items.map((p) => {
                        // Same-page OR cross-page use — both are only ever visible here at all once
                        // showAllDragPanel reveals them, so both need the same ✅ "already used"
                        // badge, not just the same-page case. Cover page is exempt from the
                        // cross-page half, matching pickerPhotos/dragPanelPool above.
                        const alreadyUsed = usedPhotoIds.has(p.id) || (!isCoverPage && !!usedElsewhere?.has(p.id));
                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => {
                              hoverPreviewTokenRef.current++;
                              setDragPanelHoverPreview(null);
                              // Dragging a thumbnail that's part of a 2+ selection carries the
                              // whole group; dragging one that isn't selected drags just that one,
                              // leaving whatever else is selected untouched.
                              const bundle = dragPanelSelectedIds.has(p.id) && dragPanelSelectedIds.size > 1 ? Array.from(dragPanelSelectedIds) : [p.id];
                              e.dataTransfer.setData("text/plain", bundle.length > 1 ? `multi:${bundle.join(",")}` : bundle[0]);
                            }}
                            onClick={() => {
                              setDragPanelSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              });
                            }}
                            onMouseEnter={(e) => {
                              if (!dragPanelHoverZoomEnabled) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const url = p.url;
                              const token = ++hoverPreviewTokenRef.current;
                              // Loads the real image first so the floating preview box is sized to
                              // match its actual orientation (portrait vs. landscape) instead of a
                              // fixed square that crops one dimension — the box is only shown once
                              // the true aspect ratio is known, so it never has to reflow/jump.
                              const img = new window.Image();
                              img.onload = () => {
                                if (hoverPreviewTokenRef.current !== token) return;
                                const maxDim = 260;
                                const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
                                const width = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
                                const height = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim;
                                const showOnLeftSide = rect.left >= width + 12;
                                setDragPanelHoverPreview({
                                  url,
                                  width,
                                  height,
                                  top: Math.min(Math.max(rect.top + rect.height / 2 - height / 2, 8), window.innerHeight - height - 8),
                                  left: showOnLeftSide ? rect.left - width - 12 : rect.right + 12,
                                });
                              };
                              img.src = url;
                            }}
                            onMouseLeave={() => { hoverPreviewTokenRef.current++; setDragPanelHoverPreview(null); }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              hoverPreviewTokenRef.current++;
                              setDragPanelHoverPreview(null);
                              setPhotoContextMenu({ photoId: p.id, top: e.clientY, left: e.clientX });
                            }}
                            className="relative aspect-square rounded-md overflow-hidden cursor-grab active:cursor-grabbing"
                            style={{
                              background: "var(--color-line)",
                              boxShadow: dragPanelSelectedIds.has(p.id) ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
                              opacity: alreadyUsed ? 0.5 : 1,
                            }}
                          >
                            {/* A favorite photo missing its own preview (e.g. never finished
                                processing) has p.url === "" — an <img src=""> would resolve to
                                THIS page's own URL and render Chromium's broken-image glyph, which
                                is exactly the bug this guard exists to avoid; the plain gray
                                background above shows instead. */}
                            {p.url && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={p.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
                            )}
                            {dragPanelSelectedIds.has(p.id) && (
                              <span
                                className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                                style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                              >
                                <IconCheck size={9} />
                              </span>
                            )}
                            {alreadyUsed && (
                              <span
                                className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center"
                                style={{ background: "var(--color-sage)", color: "#fff" }}
                                title="כבר שובצה בעמוד הזה"
                              >
                                <IconCheck size={9} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Controls sidebar — stacks below the canvas on mobile same as before; becomes an
            independently-scrolling side column on desktop so a tall control list never forces
            the canvas itself to scroll out of view. */}
        <div className="lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:pr-1 lg:min-h-0">
        {selectedElements.length > 0 && (
          <div className="space-y-2 mt-2.5">
            {selectedText && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                צבע, יישור, גופן, גודל ומחיקה נמצאים בתפריט הצף ליד הטקסט
              </p>
            )}
            {selectedOrnament && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                צבע, שקיפות, סיבוב, סדר שכבות ומחיקה נמצאים בתפריט הצף ליד העיטור
              </p>
            )}
            {selectedShape && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                צבע, מסכה, שקיפות, סיבוב, סדר שכבות ומחיקה נמצאים בתפריט הצף ליד הצורה
              </p>
            )}
            {selectedPhotos.length === 1 && anchorPhoto && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                לחצו על התמונה כדי לפתוח את תפריט העיצוב הצף (שחור-לבן, ספיה, שקיפות, טשטוש, סיבוב, צל וקו מתאר)
              </p>
            )}
            {selectedPhotos.length > 1 && (
              <p className="text-[11px] text-ink-soft text-center flex items-center justify-center gap-1">
                <IconInfo size={13} />
                נבחרו {selectedPhotos.length} תמונות — גרירה, שינוי גודל ופעולות מהתפריט הצף יחולו על כולן
              </p>
            )}
            <button onClick={removeSelected} className="w-full h-8 rounded-full bg-chip text-rose text-xs font-semibold">
              מחיקה
            </button>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-[11px] font-bold text-ink-soft mb-1.5">רקע לכל העמוד</p>
          {backgroundPhoto?.url ? (
            <div className="space-y-2">
              <div className="relative h-16 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={backgroundPhoto.url} alt="" className="w-full h-full object-cover" style={{ opacity: backgroundOpacity / 100 }} />
                <button onClick={removeBackground} className="absolute top-1 left-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                  <IconClose size={13} />
                </button>
              </div>
              <SliderControl label="שקיפות רקע" value={backgroundOpacity} min={0} max={100} unit="%" onChange={setBackgroundOpacity} />
              <SliderControl label="טשטוש רקע (Blur)" value={backgroundBlur} min={0} max={100} unit="%" onChange={setBackgroundBlur} />
              <SliderControl label="זום רקע" value={backgroundZoom} min={100} max={400} unit="%" onChange={setBackgroundZoom} />
            </div>
          ) : (
            <button onClick={openPickerForBackground} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
              + בחירת תמונת רקע
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-3">
          {mode === "custom" && (
            <>
              <button
                ref={photoSizeButtonRef}
                onClick={() => {
                  const rect = photoSizeButtonRef.current?.getBoundingClientRect();
                  if (rect) setPhotoSizePanelRect({ top: rect.bottom, left: rect.left, width: Math.max(rect.width, 190) });
                  setPhotoSizePickerOpen(true);
                }}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
              >
                + תמונה
              </button>
              <button onClick={addFrame} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
                + מסגרת
              </button>
              <button onClick={() => setTemplatePickerOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink flex items-center justify-center gap-1.5">
                <IconGrid size={14} />
                תבניות
              </button>
            </>
          )}
          <button onClick={() => setTextDraftOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            + טקסט
          </button>
        </div>
        {mode === "custom" && (
          <button
            ref={masksButtonRef}
            onClick={() => {
              const r = masksButtonRef.current?.getBoundingClientRect();
              if (r) setMasksPanelRect({ top: r.bottom, left: r.left, width: r.width });
              setMasksPickerOpen(true);
            }}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 flex items-center justify-center gap-1.5"
          >
            <IconMask size={14} />
            מסכות — גררו על תמונה כדי להחיל
          </button>
        )}
        {mode === "custom" && (
          <button
            ref={ornamentsButtonRef}
            onClick={() => {
              const r = ornamentsButtonRef.current?.getBoundingClientRect();
              if (r) setOrnamentsPanelRect({ top: r.bottom, left: r.left, width: r.width });
              setOrnamentsPickerOpen(true);
            }}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 flex items-center justify-center gap-1.5"
          >
            <IconOrnament size={14} />
            עיטורים
          </button>
        )}
        {mode === "custom" && (
          <button
            ref={shapesButtonRef}
            onClick={() => {
              const r = shapesButtonRef.current?.getBoundingClientRect();
              if (r) setShapesPanelRect({ top: r.bottom, left: r.left, width: r.width });
              setShapesPickerOpen(true);
            }}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 flex items-center justify-center gap-1.5"
          >
            <IconShape size={14} />
            צורות
          </button>
        )}

        {mode === "custom" && (
          <button
            onClick={() => setSaveTemplateOpen(true)}
            disabled={!elements.some((e) => e.type === "photo")}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink mt-2 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <IconSave size={14} />
            שמירת הפריסה כתבנית
          </button>
        )}

        <button
          onClick={() => onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom })}
          className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white mt-2.5"
        >
          שמירה
        </button>
        </div>
      </div>

      {photoPickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setPhotoPickerOpen(false)}>
          <div className="w-full max-w-sm lg:max-w-2xl rounded-3xl p-4 lg:p-6 bg-paper max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="text-sm font-bold">
                {pickingBackground ? "בחירת תמונת רקע — " : ""}
                {addingMultiplePhotos ? "בחירת תמונות להוספה — " : ""}
                {showAllInPicker || favoritePhotos.length === 0 ? "כל התמונות" : "תמונות מועדפות"}
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                {favoritePhotos.length > 0 && (
                  <button onClick={() => setShowAllInPicker((v) => !v)} className="text-xs font-semibold text-ink-soft underline">
                    {showAllInPicker ? "רק מועדפות" : "כל התמונות"}
                  </button>
                )}
                <button onClick={() => setPhotoPickerOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                  <IconClose />
                </button>
              </div>
            </div>
            {addingMultiplePhotos && (
              <p className="text-[11px] text-ink-soft mb-2.5">
                אפשר לבחור כמה תמונות שרוצים — המערכת תסדר אותן בעמוד בפריסה אוטומטית, כשתמונות לאורך מקבלות מסגרת לאורך ותמונות לרוחב מקבלות מסגרת לרוחב.
              </p>
            )}
            {pickerPhotos.length === 0 ? (
              <p className="text-xs text-ink-soft text-center py-6">אין תמונות מועדפות בגלריה הזו עדיין.</p>
            ) : (
              <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 mb-2.5">
                {pickerPhotos.map((p) => {
                  const multiIdx = addingMultiplePhotos ? Array.from(multiPhotoIds).indexOf(p.id) : -1;
                  return (
                    <button
                      key={p.id}
                      onClick={() => (addingMultiplePhotos ? toggleMultiPhoto(p.id) : choosePhoto(p.id))}
                      className="relative aspect-square rounded-lg overflow-hidden"
                      style={{
                        background: "var(--color-line)",
                        boxShadow: multiIdx !== -1 ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)",
                      }}
                    >
                      {/* A favorite photo missing its own preview has p.url === "" — see the drag
                          panel's own identical guard/comment above. */}
                      {p.url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                      )}
                      {multiIdx !== -1 && (
                        <span
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-data"
                          style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                        >
                          {multiIdx + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {addingMultiplePhotos && (
              <button
                onClick={confirmMultiPhotos}
                disabled={multiPhotoIds.size === 0 || loadingMultiLayout}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {loadingMultiLayout ? "בונה פריסה..." : `הוספת ${multiPhotoIds.size || ""} תמונות`}
              </button>
            )}
          </div>
        </div>
      )}

      {textDraftOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTextDraftOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold">טקסט חדש (עברית או אנגלית)</p>
              <button onClick={() => setTextDraftOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button onClick={addText} disabled={!textDraft.trim()} className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
              הוספה
            </button>
          </div>
        </div>
      )}

      {templatePickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-end lg:items-center justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTemplatePickerOpen(false)}>
          <div className="w-full max-w-sm lg:max-w-4xl rounded-t-3xl lg:rounded-3xl p-5 lg:p-6 bg-paper max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">תבניות מובנות</p>
              <button onClick={() => setTemplatePickerOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
              {TEMPLATE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTemplateTab(tab.key)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                  style={{
                    background: templateTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: templateTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
              {TEMPLATE_BANK[templateTab].map((t) => (
                <button key={t.name} onClick={() => applyTemplate(t.frames)} className="rounded-xl border border-line p-2 text-center">
                  <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                    {t.frames.map((f) => (
                      <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold">{t.name}</span>
                </button>
              ))}
            </div>
            {templates.length > 0 && (
              <>
                <p className="text-sm font-bold mb-3">התבניות שלי</p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {templates.map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t.frames)} className="rounded-xl border border-line p-2 text-center">
                      <div className="relative aspect-[16/10] rounded-md bg-chip mb-1.5">
                        {t.frames.map((f) => (
                          <div key={f.id} className="absolute rounded-sm bg-white border border-line" style={{ left: `${f.xPct}%`, top: `${f.yPct}%`, width: `${f.widthPct}%`, height: `${f.heightPct}%` }} />
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold">{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(masksPickerOpen || masksPickerClosing) && masksPanelRect && (
        <>
          <style>{`
            @keyframes maskPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes maskPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .mask-panel-opening { animation: maskPanelSlideDown 160ms ease forwards; }
            .mask-panel-closing { animation: maskPanelSlideUp 160ms ease forwards; }
          `}</style>
          {/* A transparent click-catcher for closing on outside click — the panel itself is
              anchored directly below the מסכות button (see masksPanelRect), not a full-screen
              overlay, so this stays invisible rather than dimming the canvas. */}
          <div className="fixed inset-0 z-[84]" onClick={closeMasksPicker} />
          <div
            className={`fixed z-[85] rounded-xl p-4 bg-paper shadow-sheet max-h-[65vh] overflow-y-auto ${
              masksPickerClosing ? "mask-panel-closing" : "mask-panel-opening"
            }`}
            style={{ top: masksPanelRect.top + 4, left: masksPanelRect.left, width: masksPanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">מסכות — גררו מסכה אל תמונה/צורה, או לחצו כשתמונה/צורה נבחרת</p>
              <button onClick={closeMasksPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", "mask:__none__")}
                onClick={() => {
                  if (selected?.type === "photo" || selected?.type === "shape") updateElement(selected.id, { maskId: undefined });
                }}
                className="rounded-xl border border-line p-2 text-center cursor-grab active:cursor-grabbing"
              >
                <div className="aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center text-ink-soft text-[10px] font-semibold">
                  ללא
                </div>
                <span className="text-[10px] font-semibold">הסרת מסכה</span>
              </button>
              {ALBUM_MASKS.map((mask) => (
                <div
                  key={mask.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `mask:${mask.id}`)}
                  onClick={() => {
                    if (selected?.type === "photo" && selected.photoId) updateElement(selected.id, { maskId: mask.id });
                    else if (selected?.type === "shape") updateElement(selected.id, { maskId: mask.id });
                  }}
                  className="rounded-xl border border-line p-2 text-center cursor-grab active:cursor-grabbing"
                >
                  <div
                    className="aspect-square rounded-md mb-1.5"
                    style={{
                      background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))",
                      WebkitMaskImage: maskCssUrl(mask.svg),
                      maskImage: maskCssUrl(mask.svg),
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                    }}
                  />
                  <span className="text-[10px] font-semibold">{mask.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {(ornamentsPickerOpen || ornamentsPickerClosing) && ornamentsPanelRect && (
        <>
          <style>{`
            @keyframes ornamentPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes ornamentPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .ornament-panel-opening { animation: ornamentPanelSlideDown 160ms ease forwards; }
            .ornament-panel-closing { animation: ornamentPanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeOrnamentsPicker} />
          <div
            className={`fixed z-[85] rounded-xl p-4 bg-paper shadow-sheet max-h-[65vh] overflow-y-auto ${
              ornamentsPickerClosing ? "ornament-panel-closing" : "ornament-panel-opening"
            }`}
            style={{ top: ornamentsPanelRect.top + 4, left: ornamentsPanelRect.left, width: ornamentsPanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">עיטורים — לחצו כדי להוסיף לעמוד</p>
              <button onClick={closeOrnamentsPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
              {ORNAMENT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setOrnamentTab(tab.key)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                  style={{
                    background: ornamentTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: ornamentTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {(customOrnamentTabs ?? []).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrnamentTab(tab.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                  style={{
                    background: ornamentTab === tab.id ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: ornamentTab === tab.id ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {tab.name}
                </button>
              ))}
              {onCreateCustomOrnamentTab && (
                <button
                  onClick={() => setCustomTabModalOpen(true)}
                  title="לשונית עיטורים חדשה"
                  className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-chip text-ink-soft"
                >
                  <IconPlusSmall />
                </button>
              )}
            </div>
            {ORNAMENT_TABS.some((t) => t.key === ornamentTab) ? (
              <div className="grid grid-cols-3 gap-2.5">
                {ALBUM_ORNAMENTS.filter((o) => o.category === ornamentTab).map((ornament) => (
                  <button
                    key={ornament.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", `ornament:${ornament.id}`)}
                    onClick={() => addOrnament(ornament.id)}
                    className="rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
                  >
                    <div className="aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center p-2">
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img src={ornamentDataUrl(ornament, "#2e3142")} className="w-full h-full" style={{ objectFit: "contain" }} />
                    </div>
                    <span className="text-[10px] font-semibold">{ornament.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  if (Array.from(e.dataTransfer.types).includes("Files")) {
                    e.preventDefault();
                    setOrnamentDropActive(true);
                  }
                }}
                onDragLeave={() => setOrnamentDropActive(false)}
                onDrop={async (e) => {
                  if (e.dataTransfer.files.length === 0) return;
                  e.preventDefault();
                  setOrnamentDropActive(false);
                  if (!onUploadCustomOrnament) return;
                  setUploadingOrnament(true);
                  try {
                    for (const file of Array.from(e.dataTransfer.files)) {
                      const bytes = await file.arrayBuffer();
                      await onUploadCustomOrnament(ornamentTab, file.name, bytes, file.type || "application/octet-stream");
                    }
                  } finally {
                    setUploadingOrnament(false);
                  }
                }}
                className="rounded-xl p-2 min-h-[140px]"
                style={{ background: ornamentDropActive ? "var(--color-amber-bg)" : "transparent", outline: ornamentDropActive ? "2px dashed var(--color-amber-deep)" : "none" }}
              >
                <div className="grid grid-cols-3 gap-2.5">
                  {onUploadCustomOrnament && (
                    <button
                      disabled={uploadingOrnament}
                      onClick={async () => {
                        const picked = await window.desktopApi.pickImageFiles();
                        if (picked.length === 0) return;
                        setUploadingOrnament(true);
                        try {
                          for (const file of picked) {
                            const ext = file.name.split(".").pop()?.toLowerCase();
                            const contentType = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
                            await onUploadCustomOrnament(ornamentTab, file.name, new Uint8Array(file.bytes).buffer, contentType);
                          }
                        } finally {
                          setUploadingOrnament(false);
                        }
                      }}
                      className="rounded-xl border border-dashed border-line p-2 text-center bg-white flex flex-col items-center justify-center aspect-square disabled:opacity-50"
                    >
                      <IconPlusSmall />
                      <span className="text-[10px] font-semibold mt-1 text-ink-soft">{uploadingOrnament ? "מעלה..." : "העלאה"}</span>
                    </button>
                  )}
                  {(customOrnaments ?? [])
                    .filter((o) => o.tab_id === ornamentTab)
                    .map((o) => (
                      <div key={o.id} className="relative">
                        <button
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", `customOrnament:${o.id}`)}
                          onClick={() => addCustomOrnament(o.id)}
                          className="w-full rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
                        >
                          <div className="aspect-square rounded-md bg-chip mb-1.5 flex items-center justify-center p-1">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img src={o.url} className="w-full h-full" style={{ objectFit: "contain" }} />
                          </div>
                        </button>
                        {onDeleteCustomOrnament && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCustomOrnament(o.id);
                            }}
                            title="מחיקת העיטור"
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full flex items-center justify-center bg-white text-rose"
                            style={{ boxShadow: "0 0 0 1px var(--color-line)" }}
                          >
                            <IconClose size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {(customOrnaments ?? []).filter((o) => o.tab_id === ornamentTab).length === 0 && (
                  <p className="text-[11px] text-ink-soft text-center py-4">גררו קבצי תמונה לכאן, או השתמשו בכפתור ההעלאה</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {(shapesPickerOpen || shapesPickerClosing) && shapesPanelRect && (
        <>
          <style>{`
            @keyframes shapePanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            @keyframes shapePanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
            .shape-panel-opening { animation: shapePanelSlideDown 160ms ease forwards; }
            .shape-panel-closing { animation: shapePanelSlideUp 160ms ease forwards; }
          `}</style>
          <div className="fixed inset-0 z-[84]" onClick={closeShapesPicker} />
          <div
            className={`fixed z-[85] rounded-xl p-4 bg-paper shadow-sheet max-h-[65vh] overflow-y-auto ${
              shapesPickerClosing ? "shape-panel-closing" : "shape-panel-opening"
            }`}
            style={{ top: shapesPanelRect.top + 4, left: shapesPanelRect.left, width: shapesPanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">צורות — לחצו כדי להוסיף לעמוד</p>
              <button onClick={closeShapesPicker} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", "shape:__plain__")}
                onClick={() => addShape(undefined)}
                className="rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
              >
                <div className="aspect-square rounded-md mb-1.5" style={{ background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))" }} />
                <span className="text-[10px] font-semibold">מלבן</span>
              </button>
              {ALBUM_MASKS.filter((mask) => mask.id.startsWith("shape-")).map((mask) => (
                <button
                  key={mask.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `shape:${mask.id}`)}
                  onClick={() => addShape(mask.id)}
                  className="rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
                >
                  <div
                    className="aspect-square rounded-md mb-1.5"
                    style={{
                      background: "linear-gradient(135deg, var(--color-amber-deep), var(--color-sage))",
                      WebkitMaskImage: maskCssUrl(mask.svg),
                      maskImage: maskCssUrl(mask.svg),
                      WebkitMaskSize: "100% 100%",
                      maskSize: "100% 100%",
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat: "no-repeat",
                    }}
                  />
                  <span className="text-[10px] font-semibold">{mask.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-semibold text-ink-soft mt-3 mb-2">קו מתאר בלבד, ללא רקע</p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { kind: "square", label: "ריבוע" },
                  { kind: "rectangle", label: "מלבן" },
                  { kind: "circle", label: "עיגול" },
                  { kind: "line", label: "קו" },
                ] as const
              ).map(({ kind, label }) => (
                <button
                  key={kind}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `shapeOutline:${kind}`)}
                  onClick={() => addOutlineShape(kind)}
                  className="rounded-xl border border-line p-2 text-center bg-white cursor-grab active:cursor-grabbing"
                >
                  <div className="aspect-square rounded-md mb-1.5 flex items-center justify-center">
                    {kind === "line" ? (
                      <div className="w-4/5 h-[3px] rounded-full" style={{ background: "var(--color-ink)" }} />
                    ) : (
                      <div
                        className={kind === "square" ? "w-3/5 h-3/5" : kind === "rectangle" ? "w-4/5 h-1/2" : "w-3/5 h-3/5 rounded-full"}
                        style={{ border: "3px solid var(--color-ink)" }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {photoSizePickerOpen && photoSizePanelRect && (
        <>
          <div className="fixed inset-0 z-[84]" onClick={() => setPhotoSizePickerOpen(false)} />
          <div
            className="fixed z-[85] rounded-xl p-2 bg-paper shadow-sheet"
            style={{ top: photoSizePanelRect.top + 4, left: photoSizePanelRect.left, width: photoSizePanelRect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            {(
              [
                { size: "auto", label: "אוטומטי — לפי צורת התמונה" },
                { size: "rect", label: "מלבן 10x7.5 ס״מ" },
                { size: "circle", label: "עיגול Ø5 ס״מ" },
                { size: "square", label: "ריבוע 5x5 ס״מ" },
              ] as const
            ).map(({ size, label }) => (
              <button
                key={size}
                onClick={() => {
                  setPendingPhotoSize(size);
                  setPhotoSizePickerOpen(false);
                  openPickerForNewPhoto();
                }}
                className="w-full text-right rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-chip"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {dragPanelHoverPreview && (
        <div
          className="fixed z-[90] rounded-xl overflow-hidden pointer-events-none"
          style={{
            top: dragPanelHoverPreview.top,
            left: dragPanelHoverPreview.left,
            width: dragPanelHoverPreview.width,
            height: dragPanelHoverPreview.height,
            boxShadow: "0 12px 32px rgba(32,31,51,0.35), 0 0 0 3px var(--color-paper)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dragPanelHoverPreview.url} alt="" className="w-full h-full object-contain" />
        </div>
      )}

      {customTabModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.55)" }} onClick={() => setCustomTabModalOpen(false)}>
          <div className="w-full max-w-xs rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">לשונית עיטורים חדשה</p>
              <button onClick={() => setCustomTabModalOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={customTabNameDraft}
              onChange={(e) => setCustomTabNameDraft(e.target.value)}
              placeholder="שם הלשונית"
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button
              onClick={async () => {
                if (!customTabNameDraft.trim() || !onCreateCustomOrnamentTab) return;
                setCreatingCustomTab(true);
                try {
                  await onCreateCustomOrnamentTab(customTabNameDraft.trim());
                  setCustomTabNameDraft("");
                  setCustomTabModalOpen(false);
                } finally {
                  setCreatingCustomTab(false);
                }
              }}
              disabled={!customTabNameDraft.trim() || creatingCustomTab}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {creatingCustomTab ? "יוצר..." : "אישור"}
            </button>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setSaveTemplateOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold">שם התבנית</p>
              <button onClick={() => setSaveTemplateOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line shrink-0">
                <IconClose />
              </button>
            </div>
            <input
              value={templateNameDraft}
              onChange={(e) => setTemplateNameDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button
              onClick={saveCurrentAsTemplate}
              disabled={!templateNameDraft.trim() || savingTemplate}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {savingTemplate ? "שומר..." : "שמירה בספריית התבניות"}
            </button>
          </div>
        </div>
      )}

      {/* Unsaved-changes gate — ported from the web app's own editor (see handleCloseAttempt). */}
      {exitConfirmOpen && (
        <div
          className="fixed inset-0 z-[96] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.55)" }}
          onClick={() => {
            setExitConfirmOpen(false);
            setPendingLeaveAction(null);
          }}
        >
          <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold font-display mb-2">השינויים בעמוד לא נשמרו</h2>
            <p className="text-sm text-ink-soft leading-relaxed mb-4">לשמור אותם עכשיו, או לצאת בלי לשמור?</p>

            <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip mb-4">
              <span className="text-xs text-ink-soft leading-relaxed flex-1">
                אל תציג לי את החלון הזה שוב — תמיד שמור אוטומטית ביציאה
              </span>
              <button
                onClick={() => {
                  const next = !skipExitConfirm;
                  setSkipExitConfirm(next);
                  localStorage.setItem("albumEditorSkipExitConfirm", next ? "1" : "0");
                }}
                role="switch"
                aria-checked={skipExitConfirm}
                className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                style={{
                  background: skipExitConfirm ? "var(--color-amber-deep)" : "var(--color-line)",
                  justifyContent: skipExitConfirm ? "flex-start" : "flex-end",
                }}
              >
                <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  await onSave(elements, { photoId: backgroundPhotoId, blur: backgroundBlur, opacity: backgroundOpacity, zoom: backgroundZoom });
                  setExitConfirmOpen(false);
                  pendingLeaveAction?.();
                  setPendingLeaveAction(null);
                }}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white"
              >
                שמירה ויציאה
              </button>
              <button
                onClick={() => {
                  setExitConfirmOpen(false);
                  pendingLeaveAction?.();
                  setPendingLeaveAction(null);
                }}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose"
              >
                יציאה בלי שמירה
              </button>
              <button
                onClick={() => {
                  setExitConfirmOpen(false);
                  setPendingLeaveAction(null);
                }}
                className="w-full rounded-lg py-2 text-xs font-semibold text-ink-soft"
              >
                ביטול, המשך לעריכה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-click menu on a favorite-panel thumbnail (see onContextMenu above) — replaces the
          OS's own context menu so the same right-click gesture is available for the actions that
          matter here instead of a generic browser menu with nothing relevant on it. */}
      {photoContextMenu && (
        <>
          <div className="fixed inset-0 z-[84]" onClick={() => setPhotoContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setPhotoContextMenu(null); }} />
          <div
            className="fixed z-[85] rounded-xl bg-paper shadow-sheet p-1.5 w-40"
            style={{
              top: Math.min(photoContextMenu.top, window.innerHeight - 100),
              left: Math.min(photoContextMenu.left, window.innerWidth - 170),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setBackgroundPhotoId(photoContextMenu.photoId);
                setPhotoContextMenu(null);
              }}
              className="w-full text-right rounded-lg px-3 py-2 text-xs font-semibold hover:bg-chip"
            >
              קביעה כרקע
            </button>
            {backgroundPhotoId === photoContextMenu.photoId && (
              <button
                onClick={() => {
                  removeBackground();
                  setPhotoContextMenu(null);
                }}
                className="w-full text-right rounded-lg px-3 py-2 text-xs font-semibold text-rose hover:bg-chip"
              >
                הסרה
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Mirrors the relevant slice of src/lib/types.ts in the web app (photographer-flow) — same
// database, same tables, kept as a hand-copied subset here since this is a separate project with
// its own build and no shared package between the two.

export type GalleryRow = {
  id: string;
  title: string;
  photographer_id: string;
};

export type GalleryAlbumRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  title: string;
  status: string;
  cover_photo_id: string | null;
  width_cm: number;
  height_cm: number;
  safe_margin_cm: number;
  approved_at: string | null;
};

export type AlbumPhotoFilter = "none" | "bw" | "sepia";

export type AlbumPhotoElement = {
  id: string;
  type: "photo";
  photoId: string | null;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  focalX: number;
  focalY: number;
  filter?: AlbumPhotoFilter;
  borderWidth?: number;
  borderColor?: string;
  rotation?: number;
  opacity?: number;
  blur?: number;
  shadow?: number;
  // Ported from the web app's own editor — independent overrides for the shadow's offset/softness;
  // undefined means "derive from `shadow` itself", same coupled behavior as before these existed.
  shadowDistance?: number;
  shadowBlur?: number;
  // Ported from the web app's own editor — screen-space direction the shadow falls in (0=right,
  // 90=down, 180=left, 270=up, clockwise), independent of intensity/distance/blur. Undefined means
  // 45° (down-right), the app's old fixed direction — kept as the default so every already-designed
  // album stays pixel-identical unless a photographer explicitly touches the angle slider.
  shadowAngle?: number;
  zoom?: number;
  lockAspect?: boolean;
  maskId?: string;
  // Color/tone adjustments, all -100..100, undefined/0 = no change from the original photo — see
  // src/lib/albumAdjustments.ts (ported from the web app's own) for the shared math.
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows2?: number; // suffixed to avoid colliding with the unrelated page-level `shadow` above
  whites?: number;
  blacks?: number;
  temp?: number; // white balance: cool (-) to warm (+)
  tint?: number; // green (-) to magenta (+)
  vibrance?: number;
  saturation2?: number; // suffixed — `filter: "bw"` already means "fully desaturated" and is separate
  // 0-100 edge-enhancement intensity — see src/lib/albumSharpen.ts (ported from the web app's own).
  sharpness?: number;
  // When true, blocks both move and resize (see startDrag's own guard) — a photographer's
  // final-position safeguard against nudging something out of place by accident. Still selectable
  // (so the lock can be toggled back off) and still fully editable in every OTHER way.
  locked?: boolean;
};

export type AlbumFontSizePt = number;

export type AlbumTextElement = {
  id: string;
  type: "text";
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number;
  fontSize: AlbumFontSizePt;
  fontFamily?: string;
  color: string;
  align: "right" | "center" | "left";
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

// A standalone decorative overlay graphic (see src/lib/albumOrnaments.ts) — distinct from a
// mask (which clips a photo's own pixels): an ornament is its own positioned/resizable element,
// recolorable via `color`, not tied to any specific photo. Also part of the web app's own
// AlbumElement union (src/lib/types.ts) and handled by its server-side export routes — this type
// is a hand-duplicated copy, not a desktop-only addition (see albumOrnaments.ts's own top comment
// for why this app needs its own copy at all).
export type AlbumOrnamentElement = {
  id: string;
  type: "ornament";
  // Exactly one of these is set: `ornamentId` for a built-in procedural ornament (albumOrnaments.ts,
  // recolorable via `color`), `customOrnamentId` for a photographer-uploaded image (rendered as-is,
  // `color` ignored — it's a real raster/vector graphic with its own colors already).
  ornamentId?: string;
  customOrnamentId?: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  color?: string;
  rotation?: number;
  opacity?: number;
  shadow?: number; // 0-100, same scale/meaning as AlbumPhotoElement.shadow — set by the web editor, exported by both
  shadowAngle?: number; // see AlbumPhotoElement.shadowAngle's own comment
  borderWidth?: number; // px, same scale/meaning as AlbumPhotoElement.borderWidth
  borderColor?: string;
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

// A freely positioned solid-color geometric shape — a plain rectangle by default, or clipped to
// any of the same ALBUM_MASKS "shape-*" outlines (circle, star, hexagon, etc.) used to mask
// photos. `maskId` here isn't limited to "shape-*" — any mask in the bank can be applied, exactly
// like on a photo.
export type AlbumShapeElement = {
  id: string;
  type: "shape";
  maskId?: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  color: string;
  rotation?: number;
  opacity?: number;
  shadow?: number;
  shadowAngle?: number; // see AlbumPhotoElement.shadowAngle's own comment
  borderWidth?: number;
  borderColor?: string;
  // undefined = the normal solid-fill (optionally mask-clipped) shape. The two outline kinds have
  // no fill at all — borderWidth/borderColor double as the stroke's own width/color instead of a
  // decorative extra border, and maskId is unused. "line" is still a plain solid fill (unlike the
  // two outline kinds) — it's just a thin bar — the tag exists only so the UI can show it a
  // dedicated thickness slider and let it resize past the page edge like the two true outline kinds.
  shapeStyle?: "rect-outline" | "circle-outline" | "line";
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

export type AlbumElement = AlbumPhotoElement | AlbumTextElement | AlbumOrnamentElement | AlbumShapeElement;

export type AlbumSpreadLayout = "split" | "feature" | "stack" | "custom";

export type GalleryAlbumSpreadRow = {
  id: string;
  album_id: string;
  sort_order: number;
  photo_id_1: string;
  photo_id_2: string | null;
  layout: AlbumSpreadLayout;
  focal_x_1: number;
  focal_y_1: number;
  focal_x_2: number;
  focal_y_2: number;
  elements: AlbumElement[];
  background_photo_id: string | null;
  background_blur: number;
  background_opacity: number;
  background_zoom: number;
  width_cm: number | null;
  height_cm: number | null;
};

export type GalleryPhotoRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  storage_path: string;
  preview_storage_path: string | null;
  original_filename: string;
  is_favorite: boolean;
  folder_id: string | null;
  sort_order: number;
  created_at: string;
};

export type GalleryFolderRow = {
  id: string;
  gallery_id: string;
  name: string;
  sort_order: number;
};

// A frame is a photo element's shape (position/size) plus a few optional presentation fields —
// the reusable unit a saved template stores.
export type AlbumFrame = Pick<AlbumPhotoElement, "id" | "xPct" | "yPct" | "widthPct" | "heightPct"> &
  Partial<Pick<AlbumPhotoElement, "rotation" | "borderWidth" | "borderColor" | "shadow">>;

export type AlbumTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  frames: AlbumFrame[];
  created_at: string;
};

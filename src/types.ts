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
  zoom?: number;
  lockAspect?: boolean;
  maskId?: string;
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
};

// A standalone decorative overlay graphic (see src/lib/albumOrnaments.ts) — distinct from a
// mask (which clips a photo's own pixels): an ornament is its own positioned/resizable element,
// recolorable via `color`, not tied to any specific photo. Desktop-only addition, not part of the
// web app's own AlbumElement union.
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

// Shared by every renderer of AlbumTextElement (editor canvas, client proofing viewer, thumbnail
// preview, PDF/PSD/JPG export) — turns a free-form color (a legacy "white"/"black" literal or a
// "#rrggbb" hex from the palette) into an RGB triple and a light/dark verdict, so the drop-shadow
// used for legibility against a busy photo background can always contrast correctly, not just for
// the two colors that used to be the only option.

export const TEXT_COLOR_PALETTE: { value: string; label: string }[] = [
  { value: "#ffffff", label: "לבן" },
  { value: "#000000", label: "שחור" },
  { value: "#d4af37", label: "זהב" },
  { value: "#e07a5f", label: "אדמדם" },
  { value: "#8a9b6e", label: "זית" },
  { value: "#2f3142", label: "פחם" },
  { value: "#c9a0dc", label: "לילך" },
  { value: "#5b7c99", label: "כחול אבן" },
  { value: "#a44a3f", label: "בורדו" },
  { value: "#e8c4c4", label: "פודרה" },
  { value: "#3f6b52", label: "ירוק יער" },
  { value: "#cf9a3e", label: "חרדל" },
];

export function textColorRgb01(color: string): [number, number, number] {
  if (color === "white") return [1, 1, 1];
  if (color === "black") return [0, 0, 0];
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 1, Number.isFinite(g) ? g : 1, Number.isFinite(b) ? b : 1];
}

// Perceived luminance (ITU-R BT.601) — decides whether a dark or light shadow reads better behind
// this color's text.
export function isLightTextColor(color: string): boolean {
  const [r, g, b] = textColorRgb01(color);
  return r * 0.299 + g * 0.587 + b * 0.114 > 0.6;
}

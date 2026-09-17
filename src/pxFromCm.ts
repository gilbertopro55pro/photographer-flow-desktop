// Same DPI convention as the web app (src/lib/albumRaster.ts) — kept identical so a page exported
// here comes out the same physical print size as one exported from the web app.
const DPI = 300;

export function pxFromCm(cm: number): number {
  return Math.max(200, Math.round((cm / 2.54) * DPI));
}

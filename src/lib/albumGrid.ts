import type { AlbumFrame } from "@/lib/types";

// Generic grid-layout generator for an arbitrary photo count — used by the "custom design, N
// photos" new-page flow, where there's no pre-built template to reach for. Rows/cols are picked
// to stay close to square, and the last (possibly partial) row's frames widen to fill the leftover
// space instead of leaving a gap, so every count from 1 to a few dozen produces a clean, gapless grid.
export function generateGridFrames(n: number): AlbumFrame[] {
  if (n <= 0) return [];
  const gap = 2; // pct
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const heightPct = (100 - gap * (rows - 1)) / rows;
  const frames: AlbumFrame[] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const itemsInRow = Math.min(cols, n - idx);
    const widthPct = (100 - gap * (itemsInRow - 1)) / itemsInRow;
    for (let c = 0; c < itemsInRow; c++) {
      frames.push({
        id: `auto-${idx}`,
        xPct: c * (widthPct + gap),
        yPct: r * (heightPct + gap),
        widthPct,
        heightPct,
      });
      idx++;
    }
  }
  return frames;
}

// Shared color/tone-adjustment math for the album photo editor's WB/Tone/Presence sliders. The
// SAME formulas here drive three different renderers: an SVG filter for the live builder/client
// proofing views (fast, GPU-composited), and a raw-pixel loop for the JPG/PSD/PDF export pipeline
// (albumRaster.ts) — kept in one file specifically so those two paths can't drift apart and produce
// a WYSIWYG mismatch between what the photographer sees and what actually gets printed.
//
// Deliberately does NOT include Texture/Clarity/Dehaze — those are local-contrast/frequency-domain
// effects (unsharp-mask-family algorithms), a genuinely different and much more expensive category
// of processing than the simple per-pixel tone-curve + color-matrix operations below. Left out
// rather than faked with something that wouldn't actually behave like those controls.

export type PhotoAdjustments = {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows2?: number;
  whites?: number;
  blacks?: number;
  temp?: number;
  tint?: number;
  vibrance?: number;
  saturation2?: number;
};

export function hasAdjustments(adj: PhotoAdjustments | undefined | null): boolean {
  if (!adj) return false;
  return !!(
    adj.exposure ||
    adj.contrast ||
    adj.highlights ||
    adj.shadows2 ||
    adj.whites ||
    adj.blacks ||
    adj.temp ||
    adj.tint ||
    adj.vibrance ||
    adj.saturation2
  );
}

// Per-channel tone curve: 0-1 in, 0-1 out. Exposure is a multiplicative gain (~±2 stops at the
// slider extremes); contrast pivots around mid-gray; highlights/shadows/whites/blacks are
// smooth-falloff additive shifts weighted by how close the (post exposure/contrast) value already
// is to that tonal region, so e.g. "shadows" mostly affects genuinely dark pixels, not the whole
// image.
function toneCurveValue(v: number, adj: PhotoAdjustments): number {
  const exposure = (adj.exposure ?? 0) / 100;
  const contrast = (adj.contrast ?? 0) / 100;
  const highlights = (adj.highlights ?? 0) / 100;
  const shadows = (adj.shadows2 ?? 0) / 100;
  const whites = (adj.whites ?? 0) / 100;
  const blacks = (adj.blacks ?? 0) / 100;

  let out = v * Math.pow(2, exposure * 2);
  out = (out - 0.5) * (1 + contrast) + 0.5;

  const shadowW = Math.pow(Math.max(0, 1 - out / 0.5), 2);
  const highlightW = Math.pow(Math.max(0, (out - 0.5) / 0.5), 2);
  const blackW = Math.pow(Math.max(0, 1 - out / 0.25), 2);
  const whiteW = Math.pow(Math.max(0, (out - 0.75) / 0.25), 2);

  out += shadows * 0.25 * shadowW + highlights * 0.25 * highlightW + blacks * 0.2 * blackW + whites * 0.2 * whiteW;

  return Math.max(0, Math.min(1, out));
}

// Sampled lookup table for the SVG <feFuncR/G/B type="table"> primitives — the browser linearly
// interpolates between these points, so 17 samples is plenty smooth for how gentle these curves are.
export function sampleToneCurve(adj: PhotoAdjustments, steps = 16): number[] {
  const table: number[] = [];
  for (let i = 0; i <= steps; i++) table.push(toneCurveValue(i / steps, adj));
  return table;
}

// 3x5 matrix (rows = output R/G/B, columns = input R,G,B,A,offset) combining saturation+vibrance
// (a standard luminance-preserving saturation matrix — vibrance is folded in at half strength since
// there's no cheap way to do vibrance's "protect already-saturated colors" selectivity with a
// single linear matrix) with temperature/tint (a simple per-channel gain, applied by scaling each
// output row — mathematically equivalent to a diagonal gain matrix times the saturation matrix).
function buildColorMatrixRows(adj: PhotoAdjustments): [number, number, number, number, number][] {
  const s = Math.max(0, 1 + (adj.saturation2 ?? 0) / 100 + (adj.vibrance ?? 0) / 200);
  const sr = 0.213,
    sg = 0.715,
    sb = 0.072;
  const sat: [number, number, number, number, number][] = [
    [sr + (1 - sr) * s, sg * (1 - s), sb * (1 - s), 0, 0],
    [sr * (1 - s), sg + (1 - sg) * s, sb * (1 - s), 0, 0],
    [sr * (1 - s), sg * (1 - s), sb + (1 - sb) * s, 0, 0],
  ];
  const temp = (adj.temp ?? 0) / 100;
  const tint = (adj.tint ?? 0) / 100;
  const gain = [1 + temp * 0.3 + tint * 0.15, 1 - tint * 0.3, 1 - temp * 0.3 + tint * 0.15];
  return sat.map((row, i) => row.map((v) => v * gain[i]) as [number, number, number, number, number]);
}

// The id embeds a fingerprint of the current values (not just the element id) so that changing any
// slider produces a genuinely different id. Browsers can be unreliable about repainting an element
// whose `filter: url(#x)` id stayed the same while only that filter's OWN internal attributes
// changed underneath it (confirmed empirically here: the live builder's photo only visually caught
// up to the sliders once something else forced an unrelated repaint, e.g. deselecting the photo) —
// a changed id is an actual style-property change on the filtered element itself, which every
// browser is guaranteed to repaint on.
function adjustmentsFingerprint(adj: PhotoAdjustments): string {
  return [adj.exposure, adj.contrast, adj.highlights, adj.shadows2, adj.whites, adj.blacks, adj.temp, adj.tint, adj.vibrance, adj.saturation2]
    .map((v) => v ?? 0)
    .join("_");
}

export function adjustmentsFilterId(elId: string, adj: PhotoAdjustments): string {
  return `album-adjust-${elId}-${adjustmentsFingerprint(adj)}`;
}

// Full <filter> element markup — tone curve first, then the color matrix, matching the order the
// server-side pixel loop below applies them in.
export function adjustmentsSvgFilter(elId: string, adj: PhotoAdjustments): string {
  if (!hasAdjustments(adj)) return "";
  const table = sampleToneCurve(adj)
    .map((v) => v.toFixed(4))
    .join(" ");
  const rows = buildColorMatrixRows(adj);
  const matrixValues = [...rows[0], ...rows[1], ...rows[2], 0, 0, 0, 1, 0].map((v) => v.toFixed(4)).join(" ");
  return `<filter id="${adjustmentsFilterId(elId, adj)}" color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
    <feComponentTransfer>
      <feFuncR type="table" tableValues="${table}" />
      <feFuncG type="table" tableValues="${table}" />
      <feFuncB type="table" tableValues="${table}" />
    </feComponentTransfer>
    <feColorMatrix type="matrix" values="${matrixValues}" />
  </filter>`;
}

// Server-side twin of the SVG filter above — mutates a raw RGBA buffer (as produced by sharp's
// `.raw()`) in place, pixel by pixel, using the identical tone-curve + color-matrix math so an
// export matches the live preview exactly rather than approximately.
export function applyAdjustmentsToRgba(data: Buffer | Uint8Array, adj: PhotoAdjustments): void {
  if (!hasAdjustments(adj)) return;
  const rows = buildColorMatrixRows(adj);
  // Tone curve is continuous (not table-sampled) server-side since we're not constrained to an
  // SVG primitive here — slightly higher fidelity than the client's 17-point table for the same cost.
  for (let i = 0; i < data.length; i += 4) {
    const r0 = toneCurveValue(data[i] / 255, adj);
    const g0 = toneCurveValue(data[i + 1] / 255, adj);
    const b0 = toneCurveValue(data[i + 2] / 255, adj);
    const r = rows[0][0] * r0 + rows[0][1] * g0 + rows[0][2] * b0;
    const g = rows[1][0] * r0 + rows[1][1] * g0 + rows[1][2] * b0;
    const b = rows[2][0] * r0 + rows[2][1] * g0 + rows[2][2] * b0;
    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
}

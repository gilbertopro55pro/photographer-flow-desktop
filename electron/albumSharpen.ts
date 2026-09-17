// Sharpness (unsharp-mask-family edge enhancement) — deliberately kept OUT of albumAdjustments.ts's
// shared tone-curve/color-matrix pipeline (see that file's own top comment for why): it's a spatial
// convolution, a genuinely different algorithm class from a per-pixel curve, and the two paths that
// pipeline keeps in lockstep (an SVG filter for the live preview, a raw-pixel loop server-side)
// can't be made to match exactly for a convolution the way they can for a curve. The live preview
// below is a REAL convolution-based sharpen (not faked) via SVG's feConvolveMatrix — it's an
// approximation of sharp()'s own unsharp mask used server-side (see applySharpenToSharp in
// albumRaster.ts), close in character and strength, not guaranteed pixel-identical. Given a real
// choice between shipping nothing and shipping an honest, clearly-scoped approximation, this ships
// the approximation — the photographer sees a genuine sharpening effect while adjusting the slider,
// even if the exact edge contrast differs by a few percent from the final export.

const MAX_KERNEL_STRENGTH = 0.55; // convolution strength at sharpness=100 — kept moderate to avoid visible haloing

export function sharpenFilterId(elId: string, sharpness: number): string {
  return `album-sharpen-${elId}-${Math.round(sharpness)}`;
}

export function sharpenSvgFilter(elId: string, sharpness: number | undefined): string {
  if (!sharpness) return "";
  const k = (Math.max(0, Math.min(100, sharpness)) / 100) * MAX_KERNEL_STRENGTH;
  const center = (1 + 4 * k).toFixed(4);
  const side = (-k).toFixed(4);
  return `<filter id="${sharpenFilterId(elId, sharpness)}" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
    <feConvolveMatrix order="3 3" kernelMatrix="0 ${side} 0 ${side} ${center} ${side} 0 ${side} 0" divisor="1" edgeMode="duplicate" preserveAlpha="true" />
  </filter>`;
}

// Server-side: sharp() already has a real, well-tuned unsharp-mask implementation, so this just
// maps the same 0-100 slider to its sigma/flat/jagged parameters instead of hand-rolling pixel math
// (unlike albumAdjustments.ts's tone-curve/color-matrix, which had no equivalent library primitive
// to lean on). sigma scales the effect radius, m1/m2 scale how strongly flat vs jagged edges react —
// mirroring the client's own "moderate, not haloing" intent at sharpness=100.
export function sharpSharpenOptions(sharpness: number | undefined): { sigma: number; m1: number; m2: number } | null {
  if (!sharpness) return null;
  const t = Math.max(0, Math.min(100, sharpness)) / 100;
  return { sigma: 1 + t * 1.5, m1: 0.5 + t * 1.5, m2: 0.5 + t * 2.5 };
}

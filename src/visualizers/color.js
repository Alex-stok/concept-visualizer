// src/visualizers/color.js
//
// Small color helper shared by the hue-cycling renderers (nebula,
// cloud). `accent` can be any valid CSS color string (hex, a
// named color, rgb()/hsl(), ...), not just hex — so resolving it to a
// hue for cycling needs the browser to actually parse it. A 1x1 offscreen
// canvas does that: fill it with the color, read the pixel back, convert
// RGB -> HSL hue. Cheap, and callers should only call this when `accent`
// actually changes (not every frame) — see each renderer's `_resolveHue`.

let probeCtx = null;
function getProbeCtx() {
  if (!probeCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    probeCtx = c.getContext('2d');
  }
  return probeCtx;
}

/** Resolves any valid CSS color string to its HSL hue (0-359). Falls back
 * to 200 (a cool teal) if the color can't be resolved for any reason. */
export function hueFromColor(color) {
  try {
    const ctx = getProbeCtx();
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return rgbToHue(r, g, b);
  } catch {
    return 200;
  }
}

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return Math.round(h * 60);
}

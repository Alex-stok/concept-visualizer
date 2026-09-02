// src/visualizers/size.js
//
// The canvas's user-space coordinate system is CSS pixels (av-visualizer.js
// applies ctx.setTransform(dpr, 0, 0, dpr, ...) so 1 user-space unit = dpr
// device pixels). Renderers must size themselves in CSS pixels, not the
// backing store's device-pixel width/height — reading ctx.canvas.width/
// height directly gives a space `dpr`x too large on any HiDPI display.
export function cssSize(ctx) {
  const c = ctx.canvas;
  return { width: c.clientWidth || c.width, height: c.clientHeight || c.height };
}

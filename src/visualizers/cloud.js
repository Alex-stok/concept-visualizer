// src/visualizers/cloud.js
//
// SoundCloud's own mark: a rounded cloud body on the right, blending into
// a row of vertical bars on the left. Drawn in a fixed logical grid (like
// an SVG viewBox) scaled + letterboxed into the canvas so proportions stay
// faithful regardless of the host element's aspect ratio, then everything
// is clipped to a shared baseline so the circles making up the cloud body
// and the bars share one flat bottom edge, the way the source mark does.
//
// Each bar's height is `restHeight * (floor + spectrumValue * (1-floor))`
// — same log-weighted bin mapping as the Equalizer renderer — so the
// shape stays recognizable at rest (never collapses to a flat line) and
// comes alive with real per-bin spectrum data on top. Bass swells the
// whole mark; treble adds a brightness flash on transients.

import { cssSize } from './size.js';
import { hueFromColor } from './color.js';

// Logical design grid the mark is drawn in (see module comment).
const GRID_W = 300;
const GRID_H = 170;
const BASELINE = 142;

const BAR_COUNT = 6;
const BAR_WIDTH = 20;
const BAR_GAP = 7;
const BAR_START_X = 8;
// Rest-height envelope (logical units), tallest nearest the cloud body —
// the source mark's own bar proportions.
const BAR_BASE_HEIGHTS = [20, 32, 48, 66, 86, 108];
const BAR_REST_FLOOR = 0.4; // fraction of base height shown even in silence

// Cloud body: two overlapping circles, clipped at BASELINE.
const HUMP_SMALL = { cx: 185, cy: 110, r: 40 };
const HUMP_MAIN = { cx: 236, cy: 90, r: 58 };

export class CloudRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
    this._hueSeed = null;
    this._lastAccent = null;
    this.t = 0;
  }

  /** Resolves `accent` to a hue once, and again whenever it changes — not every frame. */
  _resolveHue() {
    if (this.accent !== this._lastAccent) {
      this._lastAccent = this.accent;
      this._hueSeed = hueFromColor(this.accent);
    }
    return this._hueSeed;
  }

  render(ctx, bands, dt) {
    const { width, height } = cssSize(ctx);
    ctx.fillStyle = '#121111';
    ctx.fillRect(0, 0, width, height);

    this.t += dt;

    const scale = Math.min(width / GRID_W, height / GRID_H) * 0.86;
    const offsetX = (width - GRID_W * scale) / 2;
    const offsetY = (height - GRID_H * scale) / 2;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    // Whole mark breathes gently with bass, from its own center.
    const swell = 1 + bands.bass * 0.06;
    ctx.translate(GRID_W / 2, BASELINE);
    ctx.scale(swell, swell);
    ctx.translate(-GRID_W / 2, -BASELINE);

    // Clip to the shared baseline so the circles' round bottoms and the
    // bars' rectangular bottoms line up into one flat edge.
    ctx.beginPath();
    ctx.rect(-40, -40, GRID_W + 80, BASELINE + 40);
    ctx.clip();

    const hue = (this._resolveHue() + this.t * 4) % 360;
    const loud = bands.treble > 0.6;
    ctx.fillStyle = loud
      ? `hsl(${hue}, 85%, 68%)`
      : `hsl(${hue}, 55%, 58%)`;
    if (loud) {
      ctx.shadowColor = `hsl(${hue}, 90%, 65%)`;
      ctx.shadowBlur = 18;
    }

    ctx.beginPath();

    const spectrum = bands.spectrum;
    for (let i = 0; i < BAR_COUNT; i++) {
      let value = 0.5;
      if (spectrum && spectrum.length) {
        const t0 = i / BAR_COUNT;
        const bin = Math.floor(Math.pow(t0, 1.6) * spectrum.length);
        value = spectrum[Math.min(spectrum.length - 1, bin)] / 255;
      }
      const barHeight = BAR_BASE_HEIGHTS[i] * (BAR_REST_FLOOR + value * (1 - BAR_REST_FLOOR));
      const x = BAR_START_X + i * (BAR_WIDTH + BAR_GAP);
      ctx.rect(x, BASELINE - barHeight, BAR_WIDTH, barHeight);
    }
    ctx.fill();

    // Separate path for the two humps — appending arcs onto the bars' path
    // would draw an implicit connecting line between the two shapes' start
    // points, filling a stray triangle between them.
    ctx.beginPath();
    ctx.arc(HUMP_SMALL.cx, HUMP_SMALL.cy, HUMP_SMALL.r, 0, Math.PI * 2);
    ctx.arc(HUMP_MAIN.cx, HUMP_MAIN.cy, HUMP_MAIN.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

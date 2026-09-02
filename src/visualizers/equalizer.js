// src/visualizers/equalizer.js
//
// Vertical bar spectrum, frequency-weighted across the frequency range so
// bass isn't crushed into the first bar or two. Fed the full spectrum from
// AudioEngine#update() (bands.spectrum), not just bass/mid/treble.

import { cssSize } from './size.js';

const BAR_COUNT = 56;

export class EqualizerRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
  }

  render(ctx, bands, dt) {
    const { width, height } = cssSize(ctx);
    ctx.fillStyle = '#121111';
    ctx.fillRect(0, 0, width, height);
    const spectrum = bands.spectrum;
    if (!spectrum || spectrum.length === 0) return;

    const barWidth = width / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      // Power-law mapping: bar i pulls from an exponentially increasing
      // slice of the spectrum, so low bars (bass) aren't just 1-2 bins.
      const t0 = i / BAR_COUNT;
      const t1 = (i + 1) / BAR_COUNT;
      const lo = Math.floor(Math.pow(t0, 2) * spectrum.length);
      const hi = Math.max(lo + 1, Math.floor(Math.pow(t1, 2) * spectrum.length));
      let sum = 0;
      let count = 0;
      for (let b = lo; b < hi && b < spectrum.length; b++) { sum += spectrum[b]; count++; }
      const value = count > 0 ? sum / count / 255 : 0;

      const barHeight = value * height * 0.9;
      const x = i * barWidth;
      const y = height - barHeight;
      ctx.fillStyle = value > 0.75 ? this.accent : 'rgba(247,245,243,0.85)';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }
  }
}

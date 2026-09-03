// src/visualizers/equalizer.js
//
// Vertical bar spectrum. Fed the full spectrum from AudioEngine#update()
// (bands.spectrum), not just bass/mid/treble.
//
// Two things keep this filling the canvas properly at any size:
// - Bar count scales with the canvas width (about one bar per
//   BAR_TARGET_WIDTH px) instead of a fixed count, so a wide canvas (e.g.
//   fullscreen) gets more, narrower bars — finer pitch resolution — rather
//   than the same handful of bars stretched thin.
// - Each bar's slice of the spectrum is chosen on a log scale (equal
//   frequency *ratio* per bar, like an octave band), not a fixed power
//   law. Raw FFT bins are linear in Hz, so bass lives in only the first
//   handful of bins — a log mapping is what spreads bass/mid/treble out
//   into a evenly segmented read instead of bunching most of the visible
//   detail into the treble end.

import { cssSize } from './size.js';

const BAR_TARGET_WIDTH = 12; // px per bar, roughly — sets how many bars a given width gets
const MIN_BAR_COUNT = 32;
const MIN_BIN = 1; // skip bin 0 (DC) — a log scale needs a nonzero floor

export class EqualizerRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
  }

  render(ctx, bands, dt) {
    const { width, height } = cssSize(ctx);
    ctx.fillStyle = '#121111';
    ctx.fillRect(0, 0, width, height);
    const spectrum = bands.spectrum;
    if (!spectrum || spectrum.length < 2) return;

    const barCount = Math.max(MIN_BAR_COUNT, Math.round(width / BAR_TARGET_WIDTH));
    const barWidth = width / barCount;
    const maxBin = spectrum.length - 1;
    const logMin = Math.log(MIN_BIN);
    const logMax = Math.log(maxBin);

    for (let i = 0; i < barCount; i++) {
      // Log-scale mapping: bar i pulls from an equal-ratio (not equal-size)
      // slice of the spectrum, so low bars (bass) get their own fine bins
      // instead of being crushed into the first one or two, while treble
      // — which is naturally many bins wide in linear FFT space — still
      // reads as a smooth progression rather than one giant averaged blob.
      const t0 = i / barCount;
      const t1 = (i + 1) / barCount;
      const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * t0));
      const hi = Math.max(lo + 1, Math.floor(Math.exp(logMin + (logMax - logMin) * t1)));
      let sum = 0;
      let count = 0;
      for (let b = lo; b < hi && b <= maxBin; b++) { sum += spectrum[b]; count++; }
      const value = count > 0 ? sum / count / 255 : 0;

      const barHeight = value * height * 0.9;
      const x = i * barWidth;
      const y = height - barHeight;
      ctx.fillStyle = value > 0.75 ? this.accent : 'rgba(247,245,243,0.85)';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }
  }
}

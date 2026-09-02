# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-09-02

### Added

- `<av-visualizer>` custom element: a framework-agnostic, zero-dependency
  Web Component rendering 3 audio-reactive canvas visualizer styles
  (Equalizer, Nebula, Kaleidoscope) driven by real Web Audio API analysis
  of live playback.
- `src/audio-engine.js`: pure Hz→bin bucketing, band averaging, and
  attack/decay envelope-smoothing math, plus the `AudioEngine` class
  wrapping a Web Audio `AnalyserNode`.
- Three renderer classes in `src/visualizers/`, each implementing a
  shared `constructor({accent})` / `render(ctx, bands, dt)` contract, and
  a `size.js` helper (`cssSize`) ensuring all three read CSS-pixel
  dimensions so layout is correct on HiDPI displays.
- `demo/`: a full worked integration example — real `<audio>` playback,
  a SoundCloud-style icon action row, and an eye-icon visualizer toggle
  (the WAVEFORM/VISUALIZER-equivalent chrome, owned by the host page, not
  the component).
- `scripts/build.mjs`: esbuild packaging producing both an ESM bundle
  (`dist/av-visualizer.js`) and an IIFE bundle
  (`dist/av-visualizer.iife.js`, global `AvVisualizer`) for drop-in
  distribution without a build step on the consuming side.
- Unit test coverage (Node's built-in `node:test`) for the audio-engine's
  pure math and its off-browser degradation contract.
- Engineer-facing `README.md`, `CONTRIBUTING.md`, and this changelog.

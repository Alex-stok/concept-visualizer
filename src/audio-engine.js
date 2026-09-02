// src/audio-engine.js
//
// Real-time audio analysis: extracts bass/mid/treble energy (and the raw
// spectrum) from live playback via the Web Audio API. This file has two
// layers: pure functions (testable without a browser, below) and the
// AudioEngine class that wires them to a live AnalyserNode (Task 2).

/**
 * Frequency ranges (Hz) for each band. BAND_RANGES must have exactly 3 entries
 * in ascending frequency order; bucketBands assumes this structure.
 * Note: treble upper bound is nominal; bucketBands extends treble to the last FFT bin (Nyquist).
 */
export const BAND_RANGES = {
  bass: [20, 250],
  mid: [250, 4000],
  treble: [4000, 16000],
};

/**
 * Maps a frequency in Hz to the nearest FFT bin index for a given
 * sampleRate/fftSize, clamped to a valid index.
 */
export function hzToBinIndex(hz, sampleRate, fftSize) {
  const nyquist = sampleRate / 2;
  const binCount = fftSize / 2;
  const bin = Math.round((hz / nyquist) * binCount);
  return Math.max(0, Math.min(binCount - 1, bin));
}

/**
 * Averages the frequency-domain bytes (0-255, as returned by
 * AnalyserNode#getByteFrequencyData) that fall within each band's Hz
 * range, normalized to 0..1. Returns { bass, mid, treble }.
 *
 * Handles overlapping BAND_RANGES boundaries by tracking each band's end,
 * ensuring non-overlapping bin allocation (each bin counted exactly once).
 */
export function bucketBands(freqData, sampleRate, fftSize) {
  const result = {};
  const entries = Object.entries(BAND_RANGES);
  let prevHiBin = -1; // track where the previous band ended to avoid overlap
  for (let idx = 0; idx < entries.length; idx++) {
    const [name, [lo, hi]] = entries[idx];
    const hiBin = hzToBinIndex(hi, sampleRate, fftSize);
    let sum = 0;
    let count = 0;
    // Start from where previous band ended, or from the calculated lo bin if first band
    const loBin = idx === 0 ? hzToBinIndex(lo, sampleRate, fftSize) : prevHiBin + 1;
    // End at the calculated hi bin, or at the end of freqData for the last band (treble covers to Nyquist)
    const endBin = idx < entries.length - 1 ? hiBin : freqData.length - 1;
    for (let i = loBin; i <= endBin; i++) {
      sum += freqData[i];
      count++;
    }
    result[name] = count > 0 ? sum / count / 255 : 0;
    prevHiBin = endBin;
  }
  return result;
}

/**
 * One step of an attack/decay envelope follower: moves `previous` toward
 * `target`, using `attackTau` (seconds) when rising and `decayTau` when
 * falling. Smaller tau = faster response.
 */
export function applyEnvelope(previous, target, dt, attackTau, decayTau) {
  const tau = target > previous ? attackTau : decayTau;
  const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  return previous + (target - previous) * k;
}

/**
 * Returns the existing entry in `sourceMap` for `key`, or creates one via
 * `createSource()` and stores it. Guarantees `createSource` runs at most
 * once per key — this is what lets AudioEngine#connectMediaElement be
 * called repeatedly on the same <audio> element without throwing (the Web
 * Audio API throws if you call createMediaElementSource twice on the same
 * element).
 */
export function getOrCreateSource(sourceMap, key, createSource) {
  let source = sourceMap.get(key);
  if (!source) {
    source = createSource();
    sourceMap.set(key, source);
  }
  return source;
}

/**
 * Wraps a Web Audio AnalyserNode and exposes smoothed bass/mid/treble
 * energy plus the raw spectrum, once per animation frame via update(dt).
 * Browser-only (needs window.AudioContext) — check isSupported first.
 */
export class AudioEngine {
  constructor({ fftSize = 1024, attackTau = 0.03, decayTau = 0.25 } = {}) {
    this.fftSize = fftSize;
    this.attackTau = attackTau;
    this.decayTau = decayTau;
    this.ctx = null;
    this.analyser = null;
    this.freqData = null;
    this.sourceNodes = new WeakMap();
    this.bands = { bass: 0, mid: 0, treble: 0, spectrum: new Uint8Array(0) };
  }

  static get isSupported() {
    return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }

  _ensureContext() {
    if (this.ctx) return this.ctx;
    if (!AudioEngine.isSupported) return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctor();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    return this.ctx;
  }

  /** Connects a live <audio>/<video> element as the analysis source. */
  connectMediaElement(mediaElement) {
    const ctx = this._ensureContext();
    if (!ctx) return false;
    const source = getOrCreateSource(this.sourceNodes, mediaElement, () => {
      const s = ctx.createMediaElementSource(mediaElement);
      s.connect(ctx.destination);
      return s;
    });
    source.connect(this.analyser);
    return true;
  }

  /** Taps an existing AudioNode (a host's own Web Audio graph) as the source. */
  connectAudioNode(node) {
    const ctx = this._ensureContext();
    if (!ctx) return false;
    node.connect(this.analyser);
    return true;
  }

  /** Resumes a suspended AudioContext — call this from a user gesture (e.g. play). */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Reads the current frequency data and advances the smoothed bands. Call once per frame. */
  update(dt) {
    if (!this.analyser) return this.bands;
    this.analyser.getByteFrequencyData(this.freqData);
    const target = bucketBands(this.freqData, this.ctx.sampleRate, this.fftSize);
    this.bands = {
      bass: applyEnvelope(this.bands.bass, target.bass, dt, this.attackTau, this.decayTau),
      mid: applyEnvelope(this.bands.mid, target.mid, dt, this.attackTau, this.decayTau),
      treble: applyEnvelope(this.bands.treble, target.treble, dt, this.attackTau, this.decayTau),
      spectrum: this.freqData,
    };
    return this.bands;
  }
}

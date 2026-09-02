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

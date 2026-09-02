import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hzToBinIndex, bucketBands, applyEnvelope, getOrCreateSource, AudioEngine } from '../src/audio-engine.js';

test('hzToBinIndex maps 0Hz to bin 0', () => {
  assert.equal(hzToBinIndex(0, 44100, 1024), 0);
});

test('hzToBinIndex clamps above nyquist to the last bin', () => {
  // binCount = fftSize/2 = 512, last valid index = 511
  assert.equal(hzToBinIndex(22050, 44100, 1024), 511);
});

test('hzToBinIndex maps a mid-range frequency correctly', () => {
  // 250Hz at 44100/1024: nyquist=22050, binCount=512
  // bin = round(250/22050 * 512) = round(5.805) = 6
  assert.equal(hzToBinIndex(250, 44100, 1024), 6);
});

test('bucketBands averages only the bins within each band range', () => {
  const sampleRate = 44100;
  const fftSize = 1024;
  const freqData = new Uint8Array(fftSize / 2); // all zero
  const bassLo = hzToBinIndex(20, sampleRate, fftSize);
  const bassHi = hzToBinIndex(250, sampleRate, fftSize);
  for (let i = bassLo; i <= bassHi; i++) freqData[i] = 255;

  const bands = bucketBands(freqData, sampleRate, fftSize);
  assert.equal(bands.bass, 1);
  assert.equal(bands.mid, 0);
  assert.equal(bands.treble, 0);
});

test('applyEnvelope rises toward target using attackTau', () => {
  const result = applyEnvelope(0, 1, 1, 0.03, 0.25);
  assert.ok(result > 0.99, `expected fast attack to nearly reach target, got ${result}`);
});

test('applyEnvelope falls toward target using decayTau', () => {
  const result = applyEnvelope(1, 0, 1, 0.03, 0.25);
  assert.ok(result < 0.05, `expected decay over 1s (tau=0.25) to be near 0, got ${result}`);
});

test('applyEnvelope with dt=0 does not move', () => {
  assert.equal(applyEnvelope(0.5, 1, 0, 0.03, 0.25), 0.5);
});

test('getOrCreateSource only calls createSource once per key', () => {
  const map = new Map();
  const key = {};
  let calls = 0;
  const make = () => { calls += 1; return { id: calls }; };

  const first = getOrCreateSource(map, key, make);
  const second = getOrCreateSource(map, key, make);

  assert.equal(calls, 1);
  assert.strictEqual(first, second);
});

test('getOrCreateSource creates separate sources for different keys', () => {
  const map = new Map();
  let calls = 0;
  const make = () => { calls += 1; return { id: calls }; };

  getOrCreateSource(map, {}, make);
  getOrCreateSource(map, {}, make);

  assert.equal(calls, 2);
});

test('bucketBands: energy in mid range only produces mid=1, bass=0, treble=0', () => {
  const sampleRate = 44100;
  const fftSize = 1024;
  const freqData = new Uint8Array(fftSize / 2);
  // hzToBinIndex(250, ...) is bass's own (inclusive) last bin under
  // bucketBands' non-overlap rule, so mid's first exclusive bin is one past
  // it — start there, not at hzToBinIndex(250, ...) itself, or this energy
  // leaks into bass.
  const midLo = hzToBinIndex(250, sampleRate, fftSize) + 1;
  const midHi = hzToBinIndex(4000, sampleRate, fftSize);
  for (let i = midLo; i <= midHi; i++) freqData[i] = 255;
  const bands = bucketBands(freqData, sampleRate, fftSize);
  assert.equal(bands.bass, 0);
  assert.equal(bands.mid, 1);
  assert.equal(bands.treble, 0);
});

test('bucketBands: treble extends to the last FFT bin (Nyquist), not just 16kHz', () => {
  const sampleRate = 44100;
  const fftSize = 1024;
  const freqData = new Uint8Array(fftSize / 2);
  freqData[freqData.length - 1] = 255; // the very last bin, well above 16kHz
  const bands = bucketBands(freqData, sampleRate, fftSize);
  assert.ok(bands.treble > 0, `expected the last bin to count toward treble, got ${bands.treble}`);
});

test('bucketBands: full-spectrum energy covers every band exactly once (no gaps, no double-counting)', () => {
  const sampleRate = 44100;
  const fftSize = 1024;
  const freqData = new Uint8Array(fftSize / 2).fill(255);
  const bands = bucketBands(freqData, sampleRate, fftSize);
  assert.equal(bands.bass, 1);
  assert.equal(bands.mid, 1);
  assert.equal(bands.treble, 1);
});

test('AudioEngine: off-browser (no window.AudioContext) degrades gracefully, does not throw', () => {
  assert.equal(AudioEngine.isSupported, false);
  const engine = new AudioEngine();
  assert.doesNotThrow(() => engine.update(0.016));
  const bands = engine.update(0.016);
  assert.equal(bands.bass, 0);
  assert.equal(bands.mid, 0);
  assert.equal(bands.treble, 0);
  assert.equal(engine.connectMediaElement({}), false);
  assert.doesNotThrow(() => engine.resume());
});

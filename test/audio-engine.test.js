import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hzToBinIndex, bucketBands, applyEnvelope } from '../src/audio-engine.js';

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

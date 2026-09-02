# Audio-Reactive Visualizer Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `<av-visualizer>`, a framework-agnostic, zero-dependency custom element that analyzes real audio playback (bass/mid/treble via the Web Audio API) and renders one of 3 audio-reactive canvas styles (Equalizer, Nebula, Kaleidoscope), plus a playable demo proving it end to end.

**Architecture:** A pure-math audio-analysis layer (`src/audio-engine.js`) feeds three independent renderer classes (`src/visualizers/*.js`), all wrapped by a Shadow-DOM custom element (`src/av-visualizer.js`) that owns the canvas and style-switcher UI. A demo page (`demo/`) wires the real element to a real `<audio>` element and recreates the host-owned WAVEFORM/VISUALIZER toggle chrome. `esbuild` bundles `src/` into `dist/` for drop-in distribution.

**Tech Stack:** Plain ES modules (no TypeScript, no framework), Web Audio API, Canvas 2D, native Custom Elements + Shadow DOM, Node's built-in `node:test` runner, `esbuild` (dev-only) for bundling.

**Spec:** `docs/superpowers/specs/2026-09-02-audio-reactive-visualizer-component-design.md`

## Global Constraints

- Zero runtime dependencies in `src/` and the built `dist/` output — `esbuild` is a devDependency only, never shipped as a runtime import.
- Plain ES modules throughout; no TypeScript, no bundler required to *consume* the component.
- Test runner is Node's built-in `node:test` (`node --test`) — no test-framework dependency.
- Per spec: the 3 renderers are inherently visual and are **not** pixel-tested; verification is by eye on the demo page. Only the audio-engine's pure math gets automated tests.
- Shadow DOM is required on `<av-visualizer>` for style isolation from the host page.
- The custom element's style-selection attribute is named `style-name`, not `style` — `style` is a reserved built-in DOM property (inline CSS) on every `HTMLElement` and must not be shadowed. This is a deliberate correction to the spec's literal wording; the README documents it explicitly.
- The demo audio file is user-provided, expected at `demo/audio/track.mp3` (or update the `<audio src>` in `demo/index.html` to match a different filename/format) — not yet present as of this plan; Task 7 must degrade gracefully (a visible notice, not a broken page) when it's missing.

---

### Task 1: Project scaffolding + audio-engine pure math

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/audio-engine.js`
- Test: `test/audio-engine.test.js`

**Interfaces:**
- Produces: `BAND_RANGES` (object), `hzToBinIndex(hz, sampleRate, fftSize) -> number`, `bucketBands(freqData, sampleRate, fftSize) -> {bass, mid, treble}`, `applyEnvelope(previous, target, dt, attackTau, decayTau) -> number` — all exported from `src/audio-engine.js`, all pure functions (no Web Audio API calls).

- [ ] **Step 1: Create project scaffolding**

`package.json`:
```json
{
  "name": "av-visualizer",
  "version": "0.1.0",
  "description": "Audio-reactive visualizer component for track players — real Web Audio analysis driving 3 canvas-based visual styles.",
  "type": "module",
  "main": "dist/av-visualizer.js",
  "files": ["dist", "src"],
  "license": "UNLICENSED",
  "scripts": {
    "test": "node --test test/"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
*.log
```

- [ ] **Step 2: Write the failing tests**

`test/audio-engine.test.js`:
```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/audio-engine.js'` (file doesn't exist yet).

- [ ] **Step 4: Write the implementation**

`src/audio-engine.js`:
```js
// src/audio-engine.js
//
// Real-time audio analysis: extracts bass/mid/treble energy (and the raw
// spectrum) from live playback via the Web Audio API. This file has two
// layers: pure functions (testable without a browser, below) and the
// AudioEngine class that wires them to a live AnalyserNode (Task 2).

/** Frequency ranges (Hz) for each band. */
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
 */
export function bucketBands(freqData, sampleRate, fftSize) {
  const result = {};
  for (const [name, [lo, hi]] of Object.entries(BAND_RANGES)) {
    const loBin = hzToBinIndex(lo, sampleRate, fftSize);
    const hiBin = hzToBinIndex(hi, sampleRate, fftSize);
    let sum = 0;
    let count = 0;
    for (let i = loBin; i <= hiBin; i++) {
      sum += freqData[i];
      count++;
    }
    result[name] = count > 0 ? sum / count / 255 : 0;
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 7 tests passing.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/audio-engine.js test/audio-engine.test.js
git commit -m "feat: audio-engine pure math (Hz->bin bucketing, band averaging, envelope)"
```

---

### Task 2: AudioEngine class + source-node guard

**Files:**
- Modify: `src/audio-engine.js`
- Modify: `test/audio-engine.test.js`

**Interfaces:**
- Consumes: `bucketBands`, `applyEnvelope` (Task 1, same file).
- Produces: `getOrCreateSource(sourceMap, key, createSource) -> source` (pure, exported), `class AudioEngine` with `static isSupported`, `connectMediaElement(mediaElement) -> boolean`, `connectAudioNode(node) -> boolean`, `resume()`, `update(dt) -> {bass, mid, treble, spectrum}` — consumed by `src/av-visualizer.js` in Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `test/audio-engine.test.js` (new import + new tests, appended after the existing ones):
```js
import { getOrCreateSource } from '../src/audio-engine.js';

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
```
(Merge the new `import` into the existing import line at the top of the file rather than duplicating it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getOrCreateSource` is not exported yet.

- [ ] **Step 3: Write the implementation**

Append to `src/audio-engine.js`:
```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/audio-engine.js test/audio-engine.test.js
git commit -m "feat: AudioEngine class with source-node guard"
```

---

### Task 3: Renderer preview harness + Equalizer renderer

**Files:**
- Create: `demo/index.html` (dev-only harness — Task 7 replaces this with the real demo)
- Create: `demo/main.js` (dev-only harness driver)
- Create: `src/visualizers/equalizer.js`
- Test: manual visual verification (per spec, renderers are not automated-tested)

**Interfaces:**
- Produces: `class EqualizerRenderer` with `constructor({accent})` and `render(ctx, bands, dt)`, reading `bands.spectrum` (a `Uint8Array`) — same shape every renderer in this plan uses, consumed by `src/av-visualizer.js` in Task 6.

- [ ] **Step 1: Create the renderer preview harness**

`demo/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Visualizer renderer preview</title>
<style>
  body { margin: 0; background: #111112; color: #f2f0ee; font-family: system-ui, sans-serif; }
  #controls { display: flex; gap: 8px; padding: 12px; }
  button { background: #2a2a2b; color: #f2f0ee; border: 1px solid #3a3a3c; padding: 8px 14px; cursor: pointer; }
  button[aria-pressed="true"] { background: #f2f0ee; color: #111112; }
  canvas { display: block; width: 100%; height: 372px; background: #121111; }
</style>
</head>
<body>
  <div id="controls"></div>
  <canvas id="canvas"></canvas>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

`demo/main.js`:
```js
// demo/main.js
//
// DEV-ONLY renderer preview harness: drives each renderer with a synthetic
// (sine-wave) bass/mid/treble signal so renderers can be visually verified
// without a real audio file or the full <av-visualizer> element. Task 7
// ("Real demo integration") replaces this file's synthetic driver with the
// real AudioEngine wired to an actual <audio> element.
import { EqualizerRenderer } from '../src/visualizers/equalizer.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const controls = document.getElementById('controls');

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const renderers = {
  equalizer: new EqualizerRenderer({ accent: '#7fd8e0' }),
};

let current = 'equalizer';

function makeButton(name) {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.setAttribute('aria-pressed', String(name === current));
  btn.addEventListener('click', () => {
    current = name;
    for (const b of controls.children) b.setAttribute('aria-pressed', String(b === btn));
  });
  return btn;
}
for (const name of Object.keys(renderers)) controls.appendChild(makeButton(name));

// Synthetic band generator: smooth, plausible-looking sine-driven bass/mid/treble.
function syntheticBands(t) {
  return {
    bass: 0.5 + 0.5 * Math.sin(t * 2.1),
    mid: 0.5 + 0.5 * Math.sin(t * 3.7 + 1),
    treble: 0.5 + 0.5 * Math.sin(t * 5.3 + 2),
    spectrum: syntheticSpectrum(t),
  };
}

function syntheticSpectrum(t) {
  const bins = new Uint8Array(512);
  for (let i = 0; i < bins.length; i++) {
    const f = i / bins.length;
    const shelf = Math.pow(1 - f, 1.4); // more energy at low bins, like real music
    const wob = 0.5 + 0.5 * Math.sin(t * (1.5 + i * 0.05) + i);
    bins[i] = Math.max(0, Math.min(255, shelf * wob * 255));
  }
  return bins;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const bands = syntheticBands(now / 1000);
  renderers[current].render(ctx, bands, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

- [ ] **Step 2: Write the Equalizer renderer**

`src/visualizers/equalizer.js`:
```js
// src/visualizers/equalizer.js
//
// Vertical bar spectrum, log-scaled across the frequency range so bass
// isn't crushed into the first bar or two. Fed the full spectrum from
// AudioEngine#update() (bands.spectrum), not just bass/mid/treble.

const BAR_COUNT = 56;

export class EqualizerRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
  }

  render(ctx, bands, dt) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
    const spectrum = bands.spectrum;
    if (!spectrum || spectrum.length === 0) return;

    const barWidth = width / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      // Log-scaled mapping: bar i pulls from an exponentially increasing
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
```

- [ ] **Step 3: Manually verify**

Run: `npx serve .` (or any static file server) from the project root, open `http://localhost:<port>/demo/`.
Expected: a canvas with ~56 vertical bars animating to the synthetic signal — bass-heavy bars on the left rising and falling smoothly, accent-colored bars flashing on strong hits. No console errors.

- [ ] **Step 4: Commit**

```bash
git add demo/index.html demo/main.js src/visualizers/equalizer.js
git commit -m "feat: Equalizer renderer + dev preview harness"
```

---

### Task 4: Nebula renderer

**Files:**
- Create: `src/visualizers/nebula.js`
- Modify: `demo/main.js`

**Interfaces:**
- Consumes: same `render(ctx, bands, dt)` shape as Task 3.
- Produces: `class NebulaRenderer` with `constructor({accent})` and `render(ctx, bands, dt)`.

- [ ] **Step 1: Write the Nebula renderer**

`src/visualizers/nebula.js`:
```js
// src/visualizers/nebula.js
//
// A loose cloud of particles drifting like a galaxy. Bass fires a radial
// shockwave that scatters particles outward; mid drives ambient drift
// speed/turbulence; treble adds sparkle (per-particle flicker).

const PARTICLE_COUNT = 220;

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export class NebulaRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
    this.particles = null;
    this.t = 0;
  }

  _ensureParticles(width, height) {
    if (this.particles) return;
    const r = rand(1337);
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = r() * Math.PI * 2;
      const radius = r() * Math.min(width, height) * 0.4;
      this.particles.push({
        angle,
        baseRadius: radius,
        speed: 0.05 + r() * 0.15,
        size: 1 + r() * 2,
        phase: r() * Math.PI * 2,
      });
    }
  }

  render(ctx, bands, dt) {
    const { width, height } = ctx.canvas;
    this._ensureParticles(width, height);
    this.t += dt;

    ctx.fillStyle = 'rgba(17,17,18,0.35)';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const shock = bands.bass; // 0..1, pushes particles outward
    const drift = 0.3 + bands.mid * 1.5; // ambient rotation speed
    const sparkle = bands.treble;

    for (const p of this.particles) {
      p.angle += p.speed * drift * dt;
      const radius = p.baseRadius * (1 + shock * 0.6);
      const x = cx + Math.cos(p.angle) * radius;
      const y = cy + Math.sin(p.angle) * radius * 0.6; // slightly flattened, disc-like
      const flicker = 0.5 + 0.5 * Math.sin(this.t * 6 + p.phase) * sparkle;
      const size = p.size * (1 + flicker * 1.5);

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = flicker > 0.7 ? this.accent : 'rgba(247,245,243,0.7)';
      ctx.globalAlpha = 0.5 + flicker * 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
```

- [ ] **Step 2: Wire it into the preview harness**

In `demo/main.js`, add the import and registration:
```js
import { NebulaRenderer } from '../src/visualizers/nebula.js';
```
and add to the `renderers` object:
```js
const renderers = {
  equalizer: new EqualizerRenderer({ accent: '#7fd8e0' }),
  nebula: new NebulaRenderer({ accent: '#7fd8e0' }),
};
```

- [ ] **Step 3: Manually verify**

Reload the harness page, click the "nebula" button.
Expected: a drifting particle cloud; particles scatter outward on bass swells, ambient rotation speed shifts with mid, individual particles flicker/sparkle with treble. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/visualizers/nebula.js demo/main.js
git commit -m "feat: Nebula renderer"
```

---

### Task 5: Kaleidoscope renderer

**Files:**
- Create: `src/visualizers/kaleidoscope.js`
- Modify: `demo/main.js`

**Interfaces:**
- Consumes: same `render(ctx, bands, dt)` shape as Tasks 3-4.
- Produces: `class KaleidoscopeRenderer` with `constructor({accent})` and `render(ctx, bands, dt)`.

- [ ] **Step 1: Write the Kaleidoscope renderer**

`src/visualizers/kaleidoscope.js`:
```js
// src/visualizers/kaleidoscope.js
//
// A radially-mirrored geometric pattern. Bass drives overall pulse/scale,
// mid drives rotation speed, treble drives inner-layer detail/shimmer.

const SYMMETRY = 8; // fold count

export class KaleidoscopeRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
    this.rotation = 0;
  }

  render(ctx, bands, dt) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = '#121111';
    ctx.fillRect(0, 0, width, height);

    this.rotation += dt * (0.2 + bands.mid * 1.2);

    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.15;
    const pulse = baseRadius * (1 + bands.bass * 0.8);
    const detail = 3 + Math.floor(bands.treble * 6); // inner spokes per wedge

    ctx.save();
    ctx.translate(cx, cy);

    for (let s = 0; s < SYMMETRY; s++) {
      ctx.save();
      ctx.rotate(this.rotation + (s * Math.PI * 2) / SYMMETRY);

      for (let i = 0; i < detail; i++) {
        const f = i / detail;
        const r0 = pulse * 0.3;
        const r1 = pulse * (0.5 + f * 0.6);
        const angle = f * 0.6 - 0.3;

        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0);
        ctx.lineTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
        ctx.strokeStyle = i % 2 === 0 ? this.accent : 'rgba(247,245,243,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
```

- [ ] **Step 2: Wire it into the preview harness**

In `demo/main.js`, add the import and registration:
```js
import { KaleidoscopeRenderer } from '../src/visualizers/kaleidoscope.js';
```
and add to the `renderers` object:
```js
const renderers = {
  equalizer: new EqualizerRenderer({ accent: '#7fd8e0' }),
  nebula: new NebulaRenderer({ accent: '#7fd8e0' }),
  kaleidoscope: new KaleidoscopeRenderer({ accent: '#7fd8e0' }),
};
```

- [ ] **Step 3: Manually verify**

Reload the harness page, click the "kaleidoscope" button.
Expected: an 8-fold symmetric radial pattern; overall scale pulses with bass, rotation speed shifts with mid, inner-spoke detail/density shifts with treble. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/visualizers/kaleidoscope.js demo/main.js
git commit -m "feat: Kaleidoscope renderer"
```

---

### Task 6: `<av-visualizer>` custom element

**Files:**
- Create: `src/av-visualizer.js`

**Interfaces:**
- Consumes: `AudioEngine` (Task 2), `EqualizerRenderer`/`NebulaRenderer`/`KaleidoscopeRenderer` (Tasks 3-5), each with `render(ctx, bands, dt)` and a mutable `.accent` property.
- Produces: custom element `<av-visualizer>` registered globally, with:
  - attributes: `style-name` (`equalizer`|`nebula`|`kaleidoscope`), `active` (boolean presence attribute), `accent` (CSS color string)
  - properties: `.mediaElement = <HTMLMediaElement>` (setter), `.audioNode = <AudioNode>` (setter), `.accent` (getter)
  - methods: `.setStyle(name)`, `.activate()`, `.deactivate()`
  Consumed by `demo/main.js` in Task 7.

- [ ] **Step 1: Write the custom element**

`src/av-visualizer.js`:
```js
// src/av-visualizer.js
//
// <av-visualizer> — the drop-in custom element. Owns the canvas and the
// style-switcher chip UI; wraps AudioEngine and the 3 renderers. Does NOT
// own the outer WAVEFORM/VISUALIZER toggle — that's the host page's call
// (see demo/index.html for how a host wires that up).
//
// Note on `style-name`: the spec's original wording called this attribute
// `style`, but `style` is a reserved built-in property on every
// HTMLElement (the inline CSSStyleDeclaration) — shadowing it would break
// normal DOM usage like `el.style.display = ...`. `style-name` avoids the
// collision; see the README for the full rationale.

import { AudioEngine } from './audio-engine.js';
import { EqualizerRenderer } from './visualizers/equalizer.js';
import { NebulaRenderer } from './visualizers/nebula.js';
import { KaleidoscopeRenderer } from './visualizers/kaleidoscope.js';

const STYLE_NAMES = ['equalizer', 'nebula', 'kaleidoscope'];

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: block; position: relative; }
    canvas { display: block; width: 100%; height: 100%; }
    .switcher {
      position: absolute; right: 12px; bottom: 12px;
      display: flex; gap: 6px;
    }
    .switcher button {
      font: 500 11px system-ui, sans-serif; letter-spacing: 0.04em;
      padding: 6px 10px; cursor: pointer;
      color: rgba(247,245,243,0.75); background: rgba(20,20,20,0.4);
      border: 1px solid rgba(247,245,243,0.3);
    }
    .switcher button[aria-pressed="true"] {
      color: #111; background: #f7f5f3; border-color: #f7f5f3;
    }
  </style>
  <canvas></canvas>
  <div class="switcher" part="switcher"></div>
`;

export class AvVisualizer extends HTMLElement {
  static get observedAttributes() { return ['style-name', 'active', 'accent']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._canvas = this.shadowRoot.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._switcher = this.shadowRoot.querySelector('.switcher');

    this._engine = new AudioEngine();
    this._renderers = {
      equalizer: new EqualizerRenderer({ accent: this.accent }),
      nebula: new NebulaRenderer({ accent: this.accent }),
      kaleidoscope: new KaleidoscopeRenderer({ accent: this.accent }),
    };
    this._currentStyle = STYLE_NAMES.includes(this.getAttribute('style-name'))
      ? this.getAttribute('style-name')
      : 'equalizer';
    this._active = this.hasAttribute('active');
    this._mediaElement = null;
    this._raf = null;
    this._lastFrame = 0;

    this._buildSwitcher();
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
  }

  connectedCallback() {
    this._resizeObserver.observe(this);
    this._resizeCanvas();
    if (this._active) this._start();
  }

  disconnectedCallback() {
    this._resizeObserver.disconnect();
    this._stop();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'style-name') this.setStyle(newValue);
    if (name === 'active') (newValue === null ? this.deactivate() : this.activate());
    if (name === 'accent') this._setAccent(newValue);
  }

  get accent() { return this.getAttribute('accent') || '#7fd8e0'; }

  /** Assign the live <audio>/<video> element to analyze. */
  set mediaElement(el) {
    this._mediaElement = el;
    if (el && AudioEngine.isSupported) this._engine.connectMediaElement(el);
  }
  get mediaElement() { return this._mediaElement; }

  /** Assign an existing AudioNode to tap into instead of a media element. */
  set audioNode(node) {
    if (node && AudioEngine.isSupported) this._engine.connectAudioNode(node);
  }

  setStyle(name) {
    if (!STYLE_NAMES.includes(name)) return;
    this._currentStyle = name;
    for (const btn of this._switcher.children) {
      btn.setAttribute('aria-pressed', String(btn.dataset.style === name));
    }
  }

  activate() {
    this._active = true;
    this._engine.resume();
    this._start();
  }

  deactivate() {
    this._active = false;
    this._stop();
  }

  _buildSwitcher() {
    this._switcher.innerHTML = '';
    for (const name of STYLE_NAMES) {
      const btn = document.createElement('button');
      btn.textContent = name.toUpperCase();
      btn.dataset.style = name;
      btn.setAttribute('aria-pressed', String(name === this._currentStyle));
      btn.addEventListener('click', () => this.setStyle(name));
      this._switcher.appendChild(btn);
    }
  }

  _setAccent(color) {
    for (const r of Object.values(this._renderers)) r.accent = color;
  }

  _resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.clientWidth || 1;
    const height = this.clientHeight || 1;
    this._canvas.width = Math.round(width * dpr);
    this._canvas.height = Math.round(height * dpr);
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _start() {
    if (this._raf) return;
    this._lastFrame = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this._lastFrame) / 1000);
      this._lastFrame = now;
      const bands = this._engine.update(dt);
      this._renderers[this._currentStyle].render(this._ctx, bands, dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

customElements.define('av-visualizer', AvVisualizer);
```

- [ ] **Step 2: Commit**

No automated test for this file (per spec: custom-element/DOM wiring around already-tested/verified pieces; `node:test` has no `document`/`customElements`). It's verified visually once wired into the real demo in Task 7.

```bash
git add src/av-visualizer.js
git commit -m "feat: <av-visualizer> custom element (shadow DOM, style switcher, audio wiring)"
```

---

### Task 7: Real demo integration

**Files:**
- Create: `demo/audio/README.md`
- Modify: `demo/index.html` (full rewrite, replacing the Task 3 harness)
- Modify: `demo/main.js` (full rewrite, replacing the Task 3 harness driver)

**Interfaces:**
- Consumes: `<av-visualizer>` (Task 6) via `import '../src/av-visualizer.js'`, its `.mediaElement` setter, `.activate()` method, and `style` (native) property.

- [ ] **Step 1: Add the audio placeholder note**

`demo/audio/README.md`:
```markdown
Place your demo track here as `track.mp3` (or update the `src` on the
`<audio>` element in `demo/index.html` to match a different filename or
format — `.wav` and `.m4a` work too).
```

- [ ] **Step 2: Rewrite the demo page**

`demo/index.html` (replaces the Task 3 harness entirely):
```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>av-visualizer demo</title>
<style>
  body { margin: 0; background: #111112; color: #f2f0ee; font-family: system-ui, sans-serif; }
  .hero {
    position: relative; width: min(100%, 1000px); height: 372px; margin: 40px auto;
    background: #a3968f; overflow: hidden;
  }
  av-visualizer { position: absolute; inset: 0; }
  .controls {
    position: absolute; left: 24px; bottom: 20px; display: flex; align-items: center; gap: 14px;
  }
  .play {
    width: 56px; height: 56px; border-radius: 50%; background: #141414;
    display: flex; align-items: center; justify-content: center; cursor: pointer; border: none;
  }
  .play svg { fill: #fff; }
  .mode-toggle {
    position: absolute; right: 24px; bottom: 20px;
    display: flex; gap: 8px; background: rgba(20,20,20,0.55); padding: 5px;
  }
  .mode-toggle button {
    font: 500 12px system-ui, sans-serif; letter-spacing: 0.04em;
    padding: 6px 12px; cursor: pointer; color: #b6b0aa; background: transparent; border: none;
  }
  .mode-toggle button[aria-pressed="true"] { color: #f7f5f3; background: rgba(247,245,243,0.16); }
  .art-placeholder {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,0.5); font-size: 13px;
  }
  .notice {
    position: absolute; top: 16px; left: 24px; right: 24px; font-size: 12px;
    color: rgba(255,255,255,0.6);
  }
</style>
</head>
<body>
  <div class="hero" id="hero">
    <div class="art-placeholder" id="artPlaceholder">album art</div>
    <av-visualizer id="viz" style-name="equalizer" accent="#7fd8e0"></av-visualizer>
    <div class="notice" id="notice" hidden>Drop a track at demo/audio/track.mp3 to hear it react.</div>
    <div class="controls">
      <button class="play" id="playBtn" aria-label="Play">
        <svg id="playIcon" width="18" height="18" viewBox="0 0 18 18"><polygon points="3,1 16,9 3,17"/></svg>
        <svg id="pauseIcon" width="18" height="18" viewBox="0 0 18 18" hidden><rect x="3" y="1" width="4" height="16"/><rect x="11" y="1" width="4" height="16"/></svg>
      </button>
    </div>
    <div class="mode-toggle">
      <button id="waveBtn" aria-pressed="true">WAVEFORM</button>
      <button id="vizBtn" aria-pressed="false">VISUALIZER</button>
    </div>
  </div>
  <audio id="audio" src="./audio/track.mp3" preload="auto"></audio>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Rewrite the demo driver**

`demo/main.js` (replaces the Task 3 harness driver entirely):
```js
// demo/main.js
//
// Wires the real <av-visualizer> element to a real <audio> element and
// builds the outer WAVEFORM/VISUALIZER toggle chrome — the part a host
// page owns, not the component. This is the proof that the component
// works end to end against real playback.
import '../src/av-visualizer.js';

const audio = document.getElementById('audio');
const viz = document.getElementById('viz');
const artPlaceholder = document.getElementById('artPlaceholder');
const notice = document.getElementById('notice');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const waveBtn = document.getElementById('waveBtn');
const vizBtn = document.getElementById('vizBtn');

viz.mediaElement = audio;

audio.addEventListener('error', () => {
  notice.hidden = false;
});

playBtn.addEventListener('click', () => {
  if (audio.paused) {
    audio.play().catch(() => {}); // ignore: no file provided yet
    viz.activate();
  } else {
    audio.pause();
  }
});

audio.addEventListener('play', () => {
  playIcon.hidden = true;
  pauseIcon.hidden = false;
});
audio.addEventListener('pause', () => {
  playIcon.hidden = false;
  pauseIcon.hidden = true;
});

function showWaveform() {
  artPlaceholder.style.display = '';
  viz.style.display = 'none';
  waveBtn.setAttribute('aria-pressed', 'true');
  vizBtn.setAttribute('aria-pressed', 'false');
}
function showVisualizer() {
  artPlaceholder.style.display = 'none';
  viz.style.display = '';
  waveBtn.setAttribute('aria-pressed', 'false');
  vizBtn.setAttribute('aria-pressed', 'true');
}
waveBtn.addEventListener('click', showWaveform);
vizBtn.addEventListener('click', showVisualizer);
showWaveform();
```

- [ ] **Step 4: Manually verify**

Run: `npx serve .` (or any static file server) from the project root, open `http://localhost:<port>/demo/`.
Expected:
- If `demo/audio/track.mp3` is absent: the "drop a track" notice appears; the page doesn't error, play button still toggles play/pause icon state.
- If a track is present: clicking play starts real playback; clicking VISUALIZER swaps in the canvas; the style chips (rendered by the component itself) switch between Equalizer/Nebula/Kaleidoscope live; all three visibly react to the actual track's bass/mid/treble. Resizing the window keeps the canvas sharp (no blur/clipping).

- [ ] **Step 5: Commit**

```bash
git add demo/audio/README.md demo/index.html demo/main.js
git commit -m "feat: real demo integration (real audio, hero chrome, WAVEFORM/VISUALIZER toggle)"
```

---

### Task 8: Packaging (bundle for distribution)

**Files:**
- Create: `scripts/build.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/av-visualizer.js` (Task 6) as the sole entry point (it transitively imports everything else).
- Produces: `dist/av-visualizer.js` (ESM), `dist/av-visualizer.iife.js` (global `AvVisualizer`, plain `<script>` usage) — both gitignored build artifacts, regenerated by `npm run build`.

- [ ] **Step 1: Install esbuild as a dev dependency**

Run: `npm install --save-dev esbuild`
Expected: `esbuild` added under `devDependencies` in `package.json`, `node_modules/` populated (gitignored).

- [ ] **Step 2: Write the build script**

`scripts/build.mjs`:
```js
// scripts/build.mjs
//
// Bundles the component into dist/, both as an ESM module and a plain
// <script> IIFE, so integration is "add a script tag" or "import the
// module" — no build step required on the consuming side.
import { build } from 'esbuild';

const shared = {
  entryPoints: ['src/av-visualizer.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
};

await build({
  ...shared,
  format: 'esm',
  outfile: 'dist/av-visualizer.js',
});

await build({
  ...shared,
  format: 'iife',
  globalName: 'AvVisualizer',
  outfile: 'dist/av-visualizer.iife.js',
});

console.log('Built dist/av-visualizer.js and dist/av-visualizer.iife.js');
```

- [ ] **Step 3: Add the build script to package.json**

Add to `"scripts"` in `package.json`:
```json
"build": "node scripts/build.mjs"
```

- [ ] **Step 4: Run the build and verify output**

Run: `npm run build`
Expected: console prints `Built dist/av-visualizer.js and dist/av-visualizer.iife.js`; both files exist and are non-empty (`ls -la dist/` on macOS/Linux, `dir dist` on Windows).

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs package.json package-lock.json
git commit -m "feat: esbuild packaging (ESM + IIFE bundles)"
```

---

### Task 9: Engineer-facing README + final polish

**Files:**
- Create: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# av-visualizer

A framework-agnostic, zero-dependency Web Component that turns real audio
playback into a live, audio-reactive visualizer — three distinct styles,
each driven by genuine bass/mid/treble analysis of the signal via the Web
Audio API. Drop it into any player UI; it doesn't care what framework (or
none) renders the page around it.

## Quick start

```html
<script type="module" src="./dist/av-visualizer.js"></script>

<av-visualizer id="viz" style-name="equalizer" accent="#7fd8e0"></av-visualizer>
<audio id="track" src="song.mp3"></audio>

<script type="module">
  const viz = document.getElementById('viz');
  const audio = document.getElementById('track');
  viz.mediaElement = audio;

  document.getElementById('playButton').addEventListener('click', () => {
    audio.play();
    viz.activate(); // resumes the AudioContext (must follow a user gesture)
  });
</script>
```

Or as a plain script tag (no module system required):
```html
<script src="./dist/av-visualizer.iife.js"></script>
```

## Why this integrates cleanly regardless of the host's stack

The component's only real dependency is a standard Web Audio integration
seam, not anything about the host application's framework or internals.
It accepts either:

- **`viz.mediaElement = someAudioElement`** — the common case. The
  component creates its own `MediaElementSourceNode`, guarded so
  reassigning the same element never throws (the Web Audio API throws if
  you call `createMediaElementSource` twice on one element).
- **`viz.audioNode = someExistingAudioNode`** — for a host that already
  runs its own Web Audio graph (its own analyser, effects chain, etc.).
  The component taps on via `.connect()`, which fans out without
  disturbing any of the host's existing connections.

Both are browser standards, identical no matter what rendered the
surrounding page. There is nothing SoundCloud-specific (or
React-specific, or anything-specific) baked into the component — an
integrator hands it a reference to the audio that's actually playing, and
it works.

## API

### Attributes

| Attribute | Values | Description |
|---|---|---|
| `style-name` | `equalizer` \| `nebula` \| `kaleidoscope` | Active visual style. |
| `active` | boolean (presence) | Whether the render loop is running. |
| `accent` | CSS color | Accent color used by all three renderers. |

> **Why `style-name` and not `style`:** `style` is a reserved built-in
> property on every `HTMLElement` (the inline `CSSStyleDeclaration`).
> Naming the attribute `style` would shadow it and break normal DOM usage
> like `el.style.display = 'none'`. This is a deliberate deviation from
> earlier draft wording, not an oversight.

### Properties

- `.mediaElement = HTMLMediaElement` — assign the `<audio>`/`<video>`
  element to analyze (setter; creates and reuses one source node per
  element).
- `.audioNode = AudioNode` — assign an existing Web Audio node to tap
  into instead.
- `.accent` — read the current accent color.

### Methods

- `.setStyle(name)` — switch the active renderer (`'equalizer'` |
  `'nebula'` | `'kaleidoscope'`).
- `.activate()` — resumes the underlying `AudioContext` (call from a user
  gesture, per browser autoplay policy) and starts the render loop.
- `.deactivate()` — stops the render loop.

### Ownership boundary

The component owns the canvas and the 3-way style-switcher chip UI. It
does **not** own a WAVEFORM/VISUALIZER mode toggle — that chrome belongs
to the host page (see `demo/index.html` for a full worked example of a
host wiring that up around the component).

## The 3 visual styles

- **Equalizer** — a classic vertical bar spectrum (~56 bars), log-scaled
  across the frequency range so bass isn't crushed into the first couple
  of bars. Fast-attack/slow-decay per bar, accent-colored on strong hits.
- **Nebula** — a loose cloud of ~220 drifting particles. Bass fires a
  radial shockwave that scatters particles outward; mid drives ambient
  drift/turbulence; treble adds per-particle sparkle on transients.
- **Kaleidoscope** — an 8-fold radially-mirrored geometric pattern. Bass
  drives overall pulse/scale, mid drives rotation speed, treble drives
  inner-layer detail density.

## How the audio analysis works

One `AnalyserNode` per component instance (not three separate filter
chains — cheaper, and its FFT output already contains everything needed).
Its frequency-domain data is used two ways every frame:

- **Raw per-bin spectrum** → the Equalizer renderer's bars.
- **Bucketed into 3 Hz ranges** (bass 20-250Hz, mid 250-4000Hz, treble
  4000-16000Hz) → Nebula and Kaleidoscope's macro reactivity.

Each band is smoothed with a fast-attack/slow-decay envelope so the
visuals don't flicker frame to frame. See `src/audio-engine.js` for the
implementation and `test/audio-engine.test.js` for the coverage of this
math.

## Browser support

Requires the Web Audio API and Custom Elements (all evergreen browsers).
Check `AudioEngine.isSupported` (exported from `src/audio-engine.js`)
before relying on analysis — the component simply won't animate if it's
unavailable, it won't throw.

## Project structure

```
src/
  audio-engine.js         AudioContext/AnalyserNode wrapper + pure band math
  visualizers/
    equalizer.js           bar spectrum renderer
    nebula.js               particle swarm renderer
    kaleidoscope.js         radial geometric renderer
  av-visualizer.js         the custom element (shadow DOM)
demo/
  index.html               a full worked integration example
  main.js
scripts/
  build.mjs                esbuild bundling
test/
  audio-engine.test.js      unit tests for the pure math
```

## Development

```bash
npm install
npm test          # runs the audio-engine unit tests
npm run build     # bundles src/ into dist/
```

To run the demo: serve the project root with any static file server (for
example `npx serve .`) and open `demo/index.html` — drop an audio file at
`demo/audio/track.mp3` first (see `demo/audio/README.md`) to hear it
react to real playback.

## Testing scope

The audio-engine's pure math (Hz→bin bucketing, band averaging, envelope
smoothing, the source-node reuse guard) is unit tested — that's the part
that can silently be wrong. The three renderers are inherently visual and
are verified by eye on the demo page rather than pixel-tested.
```

- [ ] **Step 2: Final repo check**

Run: `git status --short`
Expected: clean (everything committed) except any gitignored paths (`node_modules/`, `dist/`).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: engineer-facing README"
```

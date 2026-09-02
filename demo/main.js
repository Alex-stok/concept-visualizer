// demo/main.js
//
// DEV-ONLY renderer preview harness: drives each renderer with a synthetic
// (sine-wave) bass/mid/treble signal so renderers can be visually verified
// without a real audio file or the full <av-visualizer> element. Task 7
// ("Real demo integration") replaces this file's synthetic driver with the
// real AudioEngine wired to an actual <audio> element.
import { EqualizerRenderer } from '../src/visualizers/equalizer.js';
import { NebulaRenderer } from '../src/visualizers/nebula.js';

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
  nebula: new NebulaRenderer({ accent: '#7fd8e0' }),
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

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

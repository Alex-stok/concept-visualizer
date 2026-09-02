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
<button id="playButton">Play</button>

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

- **Equalizer** — a classic vertical bar spectrum (~56 bars),
  frequency-weighted across the frequency range so bass isn't crushed into
  the first couple of bars. Bars reflect the raw per-bin spectrum directly
  each frame — accent-colored on strong hits — with no additional
  smoothing beyond whatever the browser's `AnalyserNode` default
  `smoothingTimeConstant` provides.
- **Nebula** — a loose cloud of ~220 drifting particles. Bass fires a
  radial shockwave that scatters particles outward; mid drives ambient
  drift/turbulence; treble adds per-particle sparkle on transients.
- **Kaleidoscope** — an 8-fold radially-symmetric geometric pattern. Bass
  drives overall pulse/scale, mid drives rotation speed, treble drives
  inner-layer detail density.

## How the audio analysis works

One `AnalyserNode` per component instance (not three separate filter
chains — cheaper, and its FFT output already contains everything needed).
Its frequency-domain data is used two ways every frame:

- **Raw per-bin spectrum** → the Equalizer renderer's bars.
- **Bucketed into 3 Hz ranges** (bass 20-250Hz, mid 250-4000Hz, treble
  4000Hz-Nyquist (~22kHz at the default 44.1kHz sample rate)) → Nebula and
  Kaleidoscope's macro reactivity.

Each band is smoothed with a fast-attack/slow-decay envelope so the
visuals don't flicker frame to frame. See `src/audio-engine.js` for the
implementation and `test/audio-engine.test.js` for the coverage of this
math.

## Browser support

Requires the Web Audio API and Custom Elements (all evergreen browsers).
Check `AvVisualizer.isSupported` before relying on analysis — the
component simply won't animate if it's unavailable, it won't throw. (This
is a static proxy for `AudioEngine.isSupported`; if you're importing from
`src/` directly rather than the bundle, `AudioEngine.isSupported` — from
`src/audio-engine.js` — works too.)

This module touches `document`/`customElements` at import time and is not
SSR-safe — import it only in client-side code (e.g. behind a dynamic
`import()` or a client-only entry point in frameworks that pre-render on
the server).

## Cross-origin audio

If the `<audio>`/`<video>` element's source is on a different origin than
the page, set `crossorigin="anonymous"` on the element and ensure the
server sends appropriate CORS headers (`Access-Control-Allow-Origin`).
Without this, the browser still plays the audio but `getByteFrequencyData`
returns all-zero data (and some browsers mute the routed output entirely)
— the visualizer will appear frozen/silent even though playback works.
This is a browser security restriction (the Web Audio API refuses to
expose cross-origin sample data without explicit CORS opt-in), not
anything this component can work around.

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing,
and build instructions.

## License

Proprietary — all rights reserved. See [LICENSE](./LICENSE).

# Audio-reactive visualizer component — design

**Date:** 2026-09-02
**Status:** approved, ready for implementation planning

## Goal

Build a real, sellable, framework-agnostic component that a site like
SoundCloud could drop into its existing, already-functioning track
player: the artwork/thumbnail area gains a toggle to a canvas-based
visualizer that reacts to the actual audio being played, with 3
distinct visual styles the listener can switch between live.

This follows a Claude Design mockup (`Visualizer Mockup.dc.html`,
published as an Artifact) that proved the interaction shape — a
WAVEFORM / VISUALIZER toggle over the hero art, three style chips —
using simulated (fake-beat) audio levels. This spec covers building
the real thing: genuine Web Audio analysis, three real renderers, and
a component boundary an integrator can actually use.

## Scope

**In scope:**
- An audio-engine module that extracts real bass/mid/treble energy
  (and a full spectrum) from live playback via the Web Audio API.
- Three independent, swappable canvas renderers: Equalizer, Nebula,
  Kaleidoscope (specced below).
- A framework-agnostic custom element (`<av-visualizer>`) that owns
  the canvas and the style-switcher UI, wired to the audio engine.
- A demo page that recreates the mockup's hero area (dark theme, play
  control, an outer WAVEFORM/VISUALIZER toggle built by the demo
  itself) and plays a real, user-provided audio file, so the whole
  thing is provably functional end to end.
- Unit tests for the audio-engine's pure math.

**Explicitly out of scope** (decided during brainstorming, not a
deferred phase — this project will not pursue it):
- Reverse-engineering soundcloud.com's live DOM, player internals, or
  CDN CORS policy.
- Any live overlay / userscript / extension that attaches to the real
  soundcloud.com site.

Rationale: the component's only real dependency is a standard Web
Audio integration seam (a media element or an audio node), which is
identical regardless of the host app's framework or internals. A
same-origin demo proves that seam works correctly with zero need to
touch SoundCloud's actual infrastructure — reverse-engineering their
live site would only prove a narrower, separate claim ("this exact
trick works against their CDN's CORS headers today"), which has no
bearing on whether the sellable component is correct.

## Architecture

Four modules, each with one job:

```
src/
  audio-engine.js         // AudioContext + AnalyserNode, band extraction
  visualizers/
    equalizer.js           // bar spectrum renderer
    nebula.js               // particle swarm renderer
    kaleidoscope.js         // geometric radial renderer
  av-visualizer.js         // the custom element (shadow DOM)
demo/
  index.html               // replica hero area, real <audio>, real playback
```

### Audio engine

One `AnalyserNode` (not three filter chains). Its frequency-domain
data is used two ways:
- **Raw per-bin spectrum** → drives the Equalizer renderer's bars
  directly (log-scaled bucketing across bars so bass isn't crushed
  into 1-2 bars at the low end).
- **Bucketed into 3 Hz ranges** (bass/mid/treble) → drives Nebula and
  Kaleidoscope's macro reactivity.

Each band is smoothed with a fast-attack/slow-decay envelope (matches
the mockup's existing envelope-follower approach) so visuals don't
flicker frame to frame.

**Integration contract** — the engine accepts either:
- an `HTMLMediaElement` (the common case: engine creates its own
  `MediaElementSourceNode`, guarded so a second `connect()` call on
  the same element reuses it rather than throwing), or
- a pre-existing `AudioNode` (for a host that already runs its own
  Web Audio graph — the engine just taps on via `.connect()`, which
  fans out without disturbing existing connections).

This is what makes "drop-in regardless of the host's internals" true:
both are standard Web Audio primitives, not something specific to any
one app's framework or backend.

Guardrails: resume a suspended `AudioContext` on the host's play
gesture (autoplay policy), feature-detect Web Audio and no-op the
component if unavailable, singleton-guard source-node creation per
element.

### The custom element

`<av-visualizer>`, Shadow DOM (style isolation from the host page —
no CSS collisions). Owns the canvas and the 3-way style-switcher chip
UI (novel chrome unique to this feature, so it ships self-contained).
Does **not** own the outer WAVEFORM/VISUALIZER toggle — that stays the
host's call, exactly like a real integration would work; the demo
page builds that part itself to prove the full interaction.

API:
- attributes: `style` (`equalizer` | `nebula` | `kaleidoscope`),
  `active` (boolean), `accent` (CSS color)
- properties: `.mediaElement =` / `.audioNode =` (integration point)
- methods: `.setStyle(name)`, `.activate()`, `.deactivate()`

### Renderers

Each renderer is a small class: `render(ctx, bands, dt)`, given the
current `{ bass, mid, treble, spectrum }` reading and delta time.
Independently tunable, no cross-talk, swappable at runtime.

- **Equalizer** — ~48-64 vertical bars, log-scaled across the
  spectrum, fast-attack/slow-decay per bar, accent color brightening
  on strong bass hits. The familiar, "safe" option.
- **Nebula** — ~150-300 drifting particles in a loose cloud. Bass
  fires a radial shockwave that scatters/pulses particles outward on
  hits; mid drives ambient drift/turbulence; treble adds sparkle
  (per-particle brightness/size flicker on transients). Atmospheric.
- **Kaleidoscope** — a radially-mirrored geometric pattern (6-12-fold
  symmetry). Bass drives overall pulse/scale, mid drives rotation
  speed, treble drives inner-layer detail/shimmer. Sharp, hypnotic.

All three render at correct device-pixel-ratio (as the mockup already
does), share one accent-color token, dark ground matching SoundCloud's
listening view.

## Packaging

Zero runtime dependencies, plain ES modules. An `esbuild` step
produces `dist/av-visualizer.js` — bundled/minified, shipped as both
an ESM module and a plain-`<script>` IIFE — so integration is a script
tag plus a couple of lines of JS (register the element, set
`.mediaElement`, done).

## Demo

`demo/index.html` recreates the mockup's hero area (dark theme, play
button, the outer toggle, style chips rendered by the component) and
plays a real audio file via a plain `<audio>` element — a fully
playable page, not a static approximation. **Open item:** the audio
file itself is pending — the user will drop one into the project;
demo wiring should not assume a specific filename until then.

## Documentation deliverable

A top-level `README.md`, written for an external engineer evaluating
or integrating the component (not an internal dev-notes file): what
it is, the architecture summary, the full `<av-visualizer>` API
(attributes/properties/methods), the integration contract (media
element vs. audio node, why each is safe regardless of the host's own
audio graph), the 3 visual styles, browser/Web Audio support notes,
and how to run the demo and tests. This is the artifact a SoundCloud
engineer would actually read to evaluate the component — it ships
alongside the code, not buried in `docs/superpowers/`.

## Testing

Unit tests (lightweight runner, e.g. `node:test` or `vitest`) for the
audio-engine's pure math — the part that can silently be wrong:
- Hz → bin-index bucketing across different `fftSize`/`sampleRate`
  combinations.
- Attack/decay envelope convergence over time steps.
- Single-source-node guard (connecting the same element twice does
  not throw).

The 3 renderers are inherently visual and are not pixel-tested;
verified by eye on the demo page, one full playback pass per style.

## Open items

- Audio file for the demo: to be provided by the user.

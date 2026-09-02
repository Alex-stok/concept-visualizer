# Contributing to av-visualizer

## Development setup

```bash
npm install
```

## Running tests

```bash
npm test
```

Runs the `node:test` suite covering `src/audio-engine.js`'s pure math and
its off-browser degradation contract. The 3 canvas renderers and the
custom element are deliberately **not** automated-tested — see "Testing
scope" in the README for why — verify those visually instead: serve the
project root with any static file server (`npx serve .`) and open
`demo/index.html`.

## Building

```bash
npm run build
```

Bundles `src/av-visualizer.js` (the sole entry point — it transitively
imports everything else in `src/`) into `dist/av-visualizer.js` (ESM) and
`dist/av-visualizer.iife.js` (a plain `<script>`-usable global,
`AvVisualizer`). `dist/` is gitignored — it's a build artifact, not
committed; `npm install` regenerates it via the `prepare` script.

## Code organization

- `src/audio-engine.js` — pure math + the Web Audio wrapper. Keep the
  pure functions pure (no Web Audio API calls) so they stay unit-testable
  without a browser.
- `src/visualizers/*.js` — one file per visual style, each exporting a
  class with `constructor({accent})` and `render(ctx, bands, dt)`. Canvas
  layout math must read CSS-pixel dimensions via `size.js`'s `cssSize(ctx)`
  helper, never `ctx.canvas.width`/`height` directly — the canvas backing
  store is scaled by `devicePixelRatio`, and reading it directly breaks
  every visual on HiDPI displays (this exact bug shipped once and was
  only caught by a live browser check with a non-default
  `devicePixelRatio`; headless test runners default to `1`, which hides
  it).
- `src/av-visualizer.js` — the custom element. Shadow DOM is required for
  style isolation from the host page. The style-selection attribute is
  named `style-name`, not `style` — `style` is a reserved built-in
  property on every `HTMLElement` (the inline `CSSStyleDeclaration`).
- `demo/` — the reference integration; the README points integrators at
  it as a full worked example, so keep it accurate when it changes.

## Before submitting a change

- `npm test` passes, output stays pristine (no stray warnings).
- `npm run build` succeeds.
- If you touch a renderer, `av-visualizer.js`, or the demo, verify
  visually in an actual browser — automated tests alone won't catch a
  canvas coordinate-space or lifecycle bug (see the `size.js` note
  above for a concrete example that shipped once this way).
- Zero runtime dependencies stay zero — `esbuild` is a devDependency
  only, never a runtime import anywhere in `src/`.

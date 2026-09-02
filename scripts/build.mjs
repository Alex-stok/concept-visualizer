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

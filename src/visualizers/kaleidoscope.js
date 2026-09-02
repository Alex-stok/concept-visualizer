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

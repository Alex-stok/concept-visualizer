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

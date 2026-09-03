// src/visualizers/nebula.js
//
// A spiral-armed particle field rendered with real depth: each particle
// has its own z, and the camera moves through that volume via perspective
// projection, producing genuine parallax rather than a flat pan/zoom. The
// field spins as one shape; the camera's lateral sweep and depth breathing
// run continuously. A bass hit triggers a brief depth "flyover" toward one
// particle, which balloons and rushes past as the camera closes in, then
// eases back out. Mid drives spin speed and hue-cycle speed; treble adds
// per-particle sparkle plus short-range constellation lines between
// particles that are close together on screen. Color cycles through the
// hue wheel, seeded from `accent`.

import { cssSize } from './size.js';
import { hueFromColor } from './color.js';

const PARTICLE_COUNT = 260;
const ARM_COUNT = 2;
const SPIRAL_TURNS = 1.6; // full turns each arm makes from center to edge

const PARTICLE_Z_MIN = 1.2; // depth range particles are scattered across
const PARTICLE_Z_MAX = 1.8;
const FOCAL_LENGTH = 1.2;
const MIN_REL_Z = 0.08; // clamps distance-from-camera so it never nears 0

const CAMERA_XY_TAU = 1.8;
const CAMERA_Z_TAU = 1.1;
const CAMERA_ROTATION_TAU = 3;
const AMBIENT_CAM_Z = 0.3; // baseline camera depth, in front of every particle

const FLYOVER_DURATION = 1.4;    // seconds the pull takes to rise and fall
const FLYOVER_Z_MARGIN = 0.12;   // how far past the particle's depth the camera flies at peak
const FLYOVER_XY_PULL = 0.35;    // lateral pull is modest — depth does the work
const FLYOVER_COOLDOWN = 1.6;    // minimum seconds between flyovers
const HIT_RISE_THRESHOLD = 0.16; // bass jump (vs last frame) that counts as a hit
const HIT_FLOOR = 0.3;           // bass must also be at least this loud
const SHOCKWAVE_LIFETIME = 1.1;  // seconds

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function easeTo(current, target, dt, tau) {
  const k = 1 - Math.exp(-dt / tau);
  return current + (target - current) * k;
}

export class NebulaRenderer {
  constructor({ accent = '#7fd8e0' } = {}) {
    this.accent = accent;
    this._hueSeed = null;
    this._lastAccent = null;

    this.particles = null;
    this.sceneRadius = 0;
    this.spin = 0;
    this.t = 0;
    this.prevBass = 0;

    this.camera = { x: 0, y: 0, z: AMBIENT_CAM_Z, rotation: 0 };
    this.flyover = null; // { particleIndex, elapsed } — null when inactive
    this.cooldown = 0;
    this.shockwaves = [];
  }

  _ensureField(width, height) {
    if (this.particles) return;
    const r = rand(1337);

    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const armIndex = i % ARM_COUNT;
      const tProgress = Math.pow(r(), 0.6); // slight bias toward center
      const armAngle = (armIndex / ARM_COUNT) * Math.PI * 2 + tProgress * SPIRAL_TURNS * Math.PI * 2;
      const jitterAngle = (r() - 0.5) * 0.5;
      const jitterFrac = (r() - 0.5) * 0.08;
      this.particles.push({
        baseAngle: armAngle + jitterAngle,
        // Fraction of sceneRadius (recomputed each frame in render()), not
        // an absolute pixel value — keeps the field's scale tied to the
        // canvas's current size rather than whatever size it was first
        // generated at.
        radiusFrac: Math.max(0.01, tProgress + jitterFrac),
        z: PARTICLE_Z_MIN + r() * (PARTICLE_Z_MAX - PARTICLE_Z_MIN),
        driftSpeed: 0.05 + r() * 0.15,
        size: 1 + r() * 2.4,
        phase: r() * Math.PI * 2,
        hueOffset: r() * 60 - 30,
      });
    }
  }

  /** Resolves `accent` to a hue once, and again whenever it changes. */
  _resolveHue() {
    if (this.accent !== this._lastAccent) {
      this._lastAccent = this.accent;
      this._hueSeed = hueFromColor(this.accent);
    }
    return this._hueSeed;
  }

  render(ctx, bands, dt) {
    const { width, height } = cssSize(ctx);
    this._ensureField(width, height);
    this.sceneRadius = Math.min(width, height) * 0.6;
    this.t += dt;

    const bass = bands.bass;
    const mid = bands.mid;
    const treble = bands.treble;

    // Trailing fade — screen-space, drawn before projection so it always
    // covers the full canvas regardless of camera state.
    ctx.fillStyle = 'rgba(18,17,17,0.22)';
    ctx.fillRect(0, 0, width, height);

    this.spin += dt * (0.06 + mid * 0.25);

    // Bass hit: start a depth-flyover toward one particle.
    this.cooldown = Math.max(0, this.cooldown - dt);
    const rising = bass - this.prevBass;
    if (this.cooldown <= 0 && rising > HIT_RISE_THRESHOLD && bass > HIT_FLOOR) {
      this.cooldown = FLYOVER_COOLDOWN;
      const idx = Math.floor(Math.random() * this.particles.length);
      this.flyover = { particleIndex: idx, elapsed: 0 };
      const p = this.particles[idx];
      const angle = p.baseAngle + this.spin;
      const pRadius = p.radiusFrac * this.sceneRadius;
      this.shockwaves.push({
        x: Math.cos(angle) * pRadius,
        y: Math.sin(angle) * pRadius * 0.62,
        z: p.z,
        age: 0,
      });
      if (this.shockwaves.length > 6) this.shockwaves.shift();
    }
    this.prevBass = bass;

    // Camera: lateral sweep + depth breathing run continuously. A flyover
    // blends the camera's depth toward and past the triggering particle
    // over a bell-curve envelope.
    const sweepX = Math.sin(this.t * 0.09) * this.sceneRadius * 0.5;
    const sweepY = Math.cos(this.t * 0.065) * this.sceneRadius * 0.4;
    const sweepZ = AMBIENT_CAM_Z + Math.sin(this.t * 0.18) * 0.1;

    let targetX = sweepX;
    let targetY = sweepY;
    let targetZ = sweepZ;

    if (this.flyover) {
      this.flyover.elapsed += dt;
      if (this.flyover.elapsed >= FLYOVER_DURATION) {
        this.flyover = null;
      } else {
        const e = this.flyover.elapsed / FLYOVER_DURATION;
        const pull = Math.sin(Math.PI * e); // 0 -> peak -> 0
        const p = this.particles[this.flyover.particleIndex];
        const angle = p.baseAngle + this.spin;
        const pRadius = p.radiusFrac * this.sceneRadius;
        const px = Math.cos(angle) * pRadius;
        const py = Math.sin(angle) * pRadius * 0.62;
        targetX = sweepX + (px - sweepX) * pull * FLYOVER_XY_PULL;
        targetY = sweepY + (py - sweepY) * pull * FLYOVER_XY_PULL;
        targetZ = sweepZ + (p.z - FLYOVER_Z_MARGIN - sweepZ) * pull;
      }
    }
    const targetRotation = this.t * 0.015;

    this.camera.x = easeTo(this.camera.x, targetX, dt, CAMERA_XY_TAU);
    this.camera.y = easeTo(this.camera.y, targetY, dt, CAMERA_XY_TAU);
    this.camera.z = easeTo(this.camera.z, targetZ, dt, CAMERA_Z_TAU);
    this.camera.rotation = easeTo(this.camera.rotation, targetRotation, dt, CAMERA_ROTATION_TAU);

    const baseHue = (this._resolveHue() + this.t * (8 + mid * 30)) % 360;

    const cx = width / 2;
    const cy = height / 2;
    const cosR = Math.cos(this.camera.rotation);
    const sinR = Math.sin(this.camera.rotation);

    // Perspective projection: dividing by distance-from-camera makes
    // nearer points move more per unit of camera motion than farther
    // ones — that difference is the parallax.
    const project = (wx, wy, wz) => {
      const rx = wx * cosR - wy * sinR;
      const ry = wx * sinR + wy * cosR;
      const relZ = Math.max(MIN_REL_Z, wz - this.camera.z);
      const scale = FOCAL_LENGTH / relZ;
      return { x: cx + (rx - this.camera.x) * scale, y: cy + (ry - this.camera.y) * scale, scale };
    };

    ctx.globalCompositeOperation = 'lighter';

    // Ambient core glow, at mid-depth so it scales with the rest of the field.
    const coreProj = project(0, 0, (PARTICLE_Z_MIN + PARTICLE_Z_MAX) / 2);
    const coreGlowRadius = this.sceneRadius * 0.9 * coreProj.scale * (1 + bass * 0.2);
    const grad = ctx.createRadialGradient(coreProj.x, coreProj.y, 0, coreProj.x, coreProj.y, coreGlowRadius);
    grad.addColorStop(0, `hsla(${baseHue}, 75%, 50%, 0.1)`);
    grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(coreProj.x, coreProj.y, coreGlowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Shockwave rings, anchored at the flyover particle's world position.
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      if (sw.age > SHOCKWAVE_LIFETIME) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const p = sw.age / SHOCKWAVE_LIFETIME;
      const proj = project(sw.x, sw.y, sw.z);
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, (this.sceneRadius * 0.06 + p * this.sceneRadius * 0.5) * proj.scale, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${baseHue}, 90%, 65%, ${(1 - p) * 0.5})`;
      ctx.lineWidth = Math.max(0.5, 2 * proj.scale);
      ctx.stroke();
    }

    // Particles — projected individually so depth produces real per-particle
    // size/position variance rather than a uniform scale.
    const visible = [];
    for (const p of this.particles) {
      const angle = p.baseAngle + this.spin + Math.sin(this.t * p.driftSpeed + p.phase) * 0.03;
      const rWorld = p.radiusFrac * this.sceneRadius * (1 + bass * 0.15);
      const wx = Math.cos(angle) * rWorld;
      const wy = Math.sin(angle) * rWorld * 0.62; // flattened, disc-like silhouette
      const proj = project(wx, wy, p.z);
      const flicker = 0.5 + 0.5 * Math.sin(this.t * 6 + p.phase) * (0.3 + treble);
      const size = Math.max(0.3, p.size * (1 + flicker * 1.1) * proj.scale);
      const hue = (baseHue + p.hueOffset + 360) % 360;
      visible.push({ x: proj.x, y: proj.y, size, hue, flicker });
    }

    // Treble-driven constellation lines between particles close on screen.
    if (treble > 0.15) {
      const maxDist = Math.min(width, height) * 0.09 * (0.6 + treble);
      ctx.lineWidth = 1;
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const dx = visible[i].x - visible[j].x;
          const dy = visible[i].y - visible[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            const d = Math.sqrt(d2) / maxDist;
            ctx.strokeStyle = `hsla(${baseHue}, 80%, 75%, ${(1 - d) * treble * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(visible[i].x, visible[i].y);
            ctx.lineTo(visible[j].x, visible[j].y);
            ctx.stroke();
          }
        }
      }
    }

    for (const v of visible) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${v.hue}, 85%, ${55 + v.flicker * 20}%, ${0.55 + v.flicker * 0.35})`;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}

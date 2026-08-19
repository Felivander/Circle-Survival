/**
 * CIRCLE SURVIVAL - 1-BIT MONOCHROME PIXEL ART PARTICLE & DIFFUSION ENGINE
 * Features:
 * - High-Density Particle Simulation (1,600+ Concurrent Particles)
 * - Stochastic Brownian Diffusion & Expanding Vapor Clouds
 * - 1-Bit Pixel Debris Shards, Stepped Electric Lightning Arcs & Dashed Rings
 */

/**
 * The world stays 1-bit black & white. Colour is reserved for two things only,
 * so it always means something: fire (explosions) and lightning (the dash).
 */
// Ramps are ordered hot -> cold and indexed by how much life a particle has
// spent, so every spark cools as it dies. That temperature falloff is what
// makes a burst read as fire instead of as coloured confetti.
// No pure white at the hot end: white is not a saturated colour, and starting
// there washed every effect out to grey. Additive blending pushes overlapping
// sparks toward white on its own, so the ramps stay fully saturated throughout.
const FIRE_PALETTE = ['#fff64a', '#ffd400', '#ff9500', '#ff5000', '#ff1200', '#d0001e', '#5c0012'];
const BOLT_PALETTE = ['#a8feff', '#4df4ff', '#00e0ff', '#009cff', '#0058ff', '#2a18e8', '#0d0060'];
// Powerup tricolour. Kept fully saturated - these are the loudest thing on
// screen on purpose, because a powerup should be impossible to miss.
const TRI_PALETTE = ['#ff0044', '#00ff66', '#00aaff'];

// Everything that is NOT a player power burns out in greyscale. Colour is
// reserved for powers alone, so seeing colour always means "this is yours".
const MONO_PALETTE = ['#ffffff', '#dcdcdc', '#b4b4b4', '#8c8c8c', '#646464', '#3c3c3c', '#1e1e1e'];

// Lightning has exactly one look: cyan body, white-hot core. Every arc uses
// it regardless of what spawned it, so electricity always reads as electricity.
const ARC_COLOR = '#00e0ff';
const ARC_CORE = '#ffffff';

/** Ramps are arrays; a plain string is used as-is. */
function pickColor(c) {
  if (Array.isArray(c)) return c[(Math.random() * c.length) | 0];
  return c || '#ffffff';
}

/** Colour for a particle at `life` (1 = just born, 0 = gone). */
function rampColor(ramp, life, offset) {
  if (!ramp) return '#ffffff';
  const t = (1 - life) + (offset || 0);
  let i = (t * ramp.length) | 0;
  if (i < 0) i = 0;
  else if (i >= ramp.length) i = ramp.length - 1;
  return ramp[i];
}

class SurvivalEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.shards = [];
    this.shockwaves = [];
    this.electricArcs = [];
    this.streaks = [];
    this.popups = [];
    this.trauma = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.maxParticles = 1600; // two draw passes each, so keep the count sane

    // Soft round glow sprites, one per colour, built once and reused.
    // The world is drawn as hard pixels; energy is drawn with these, so powers
    // read as a different material rather than as more of the same pixels.
    this.glowCache = new Map();
  }

  getGlow(color) {
    let g = this.glowCache.get(color);
    if (g) return g;

    const S = 64;
    g = document.createElement('canvas');
    g.width = S;
    g.height = S;
    const c = g.getContext('2d');
    const grad = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    // Pure saturated colour all the way to the centre. A white core here was
    // what put a white dot in the middle of every single effect and asset.
    grad.addColorStop(0.00, color);
    grad.addColorStop(0.28, color + '99');
    grad.addColorStop(0.65, color + '33');
    grad.addColorStop(1.00, color + '00');
    c.fillStyle = grad;
    c.fillRect(0, 0, S, S);

    this.glowCache.set(color, g);
    return g;
  }

  addTrauma(amount) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  update(dt = 1) {
    // Pixelated Screen Shake
    if (this.trauma > 0) {
      const shakePower = Math.floor(this.trauma * this.trauma * 14);
      this.shakeOffsetX = Math.floor((Math.random() * 2 - 1) * shakePower);
      this.shakeOffsetY = Math.floor((Math.random() * 2 - 1) * shakePower);
      this.trauma = Math.max(0, this.trauma - 0.05 * dt);
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    // 1. Update 1-Bit Pixel Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed * dt;
      sw.life -= sw.decay * dt;
      if (sw.life <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 2. Update 1-Bit Square Pixel Sparks with Brownian Diffusion
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Stochastic Brownian Diffusion Drift
      if (p.diffusion > 0) {
        p.vx += (Math.random() - 0.5) * p.diffusion * dt;
        p.vy += (Math.random() - 0.5) * p.diffusion * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.friction, dt);
      p.vy *= Math.pow(p.friction, dt);
      p.life -= p.decay * dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 3. Update 1-Bit Pixel Rock Shards
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.rotSpeed * dt;
      s.vx *= Math.pow(0.96, dt);
      s.vy *= Math.pow(0.96, dt);
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        this.shards.splice(i, 1);
      }
    }

    // 3b. Update radial speed streaks
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const st = this.streaks[i];
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      st.vx *= Math.pow(0.90, dt);
      st.vy *= Math.pow(0.90, dt);
      st.life -= st.decay * dt;
      if (st.life <= 0) {
        this.streaks.splice(i, 1);
      }
    }

    // 4. Update 1-Bit Stepped Pixel Electric Arcs
    for (let i = this.electricArcs.length - 1; i >= 0; i--) {
      const arc = this.electricArcs[i];
      arc.life -= arc.decay * dt;
      if (arc.life <= 0) {
        this.electricArcs.splice(i, 1);
      }
    }

    // 5. Update Popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y -= pop.vy * dt;
      pop.life -= pop.decay * dt;
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
      }
    }
  }

  /* ---------------- HIGH-DENSITY PARTICLE SPAWNERS ---------------- */

  spawnExplosion(x, y, ramp = MONO_PALETTE, count = 48) {
    this.addTrauma(0.5);
    const particleCount = Math.min(count * 2, 150);

    for (let i = 0; i < particleCount; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      // Squared roll biases most sparks slow with a few fast fliers, which
      // reads as a blast front instead of an even ring.
      const roll = Math.random();
      const speed = 1.2 + roll * roll * 11.0;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.6 ? 1 : (Math.random() < 0.7 ? 2 : 3),
        ramp: ramp,
        // Fast sparks start hotter and cool later.
        heat: -roll * 0.25,
        life: 1.0,
        decay: 0.018 + Math.random() * 0.030,
        friction: 0.93,
        diffusion: 0.25 + Math.random() * 0.35 // Brownian diffusion rate
      });
    }

    this.spawnStreaks(x, y, 10, ramp, 4.0);

    // Debris stays white: it's rock, not fire.
    this.spawnRockShards(x, y, '#ffffff', Math.min(14, Math.floor(particleCount / 6)), 4.5);
  }

  /**
   * Radial speed lines. Sells an impulse far better than dots alone, because
   * the eye reads the streak direction instantly at high speed.
   */
  spawnStreaks(x, y, count, ramp, speedMult = 1.0) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (6 + Math.random() * 10) * speedMult * 0.5;
      this.streaks.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 14 + Math.random() * 26,
        width: 0.75 + Math.random() * 1.0,
        ramp: ramp,
        life: 1.0,
        decay: 0.055 + Math.random() * 0.04
      });
    }
  }

  spawnRockShards(x, y, color = '#ffffff', count = 10, speedMult = 4.0) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 4.0) * speedMult * 0.25;
      this.shards.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.floor(2 + Math.random() * 3), // 2-4px block
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02
      });
    }
  }

  spawnTrail(x, y, color = '#ffffff', size = 2) {
    // Spawn 2-3 diffusing micro particles per step
    for (let i = 0; i < 2; i++) {
      if (this.particles.length >= this.maxParticles) return;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        size: Math.random() < 0.6 ? 1 : 2,
        color: pickColor(color),
        life: 1.0,
        decay: 0.06 + Math.random() * 0.04,
        friction: 0.92,
        diffusion: 0.2
      });
    }
  }

  spawnDashBurst(x, y, vx, vy) {
    this.addTrauma(0.7);
    const back = Math.atan2(vy, vx) + Math.PI;

    for (let i = 0; i < 110; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = back + (Math.random() - 0.5) * 1.6;
      const roll = Math.random();
      const speed = 2.5 + roll * roll * 14.0;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.55 ? 1 : 2,
        ramp: BOLT_PALETTE,
        heat: -roll * 0.3,
        life: 1.0,
        decay: 0.028 + Math.random() * 0.03,
        friction: 0.94,
        diffusion: 0.35
      });
    }

    // Cone of speed lines pointing back along the dash.
    for (let i = 0; i < 14; i++) {
      const angle = back + (Math.random() - 0.5) * 1.1;
      const speed = 7 + Math.random() * 11;
      this.streaks.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 26 + Math.random() * 40,
        width: 0.75 + Math.random() * 1.25,
        ramp: BOLT_PALETTE,
        life: 1.0,
        decay: 0.05 + Math.random() * 0.035
      });
    }
  }

  spawnFireBurst(x, y, count = 90) {
    this.addTrauma(1.0);
    const total = Math.min(count * 2, 320);
    for (let i = 0; i < total; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      const roll = Math.random();
      const speed = 1.5 + roll * roll * 15.0;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() < 0.5 ? 1 : (Math.random() < 0.8 ? 2 : 3),
        ramp: FIRE_PALETTE,
        heat: -roll * 0.3,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.022,
        friction: 0.95,
        diffusion: 0.4
      });
    }
    this.spawnStreaks(x, y, 22, FIRE_PALETTE, 5.0);
  }

  spawnShockwave(x, y, maxRadius = 90, color = '#ffffff', thickness = 2) {
    this.shockwaves.push({
      x: x,
      y: y,
      radius: 4,
      maxRadius: maxRadius,
      ramp: Array.isArray(color) ? color : null,
      color: Array.isArray(color) ? color[0] : color,
      thickness: thickness,
      speed: 9.0,
      life: 1.0,
      decay: 0.028
    });
  }

  /**
   * A jagged bolt from A to B, with forks branching off it. The forks are what
   * make it read as lightning rather than as a zigzag line - real bolts split.
   */
  spawnElectricArc(x1, y1, x2, y2, color = '#ffffff', opts) {
    const o = opts || {};
    const jitter = o.jitter || 16;
    const forks = o.forks === undefined ? 2 : o.forks;
    const branches = [];

    const bolt = (ax, ay, bx, by, jit) => {
      const pts = [{ x: ax, y: ay }];
      const dist = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(3, Math.floor(dist / 11));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        // Displacement peaks mid-span and pins to zero at both ends, so the
        // bolt actually connects instead of fraying at the tips.
        const taper = Math.sin(t * Math.PI);
        pts.push({
          x: ax + (bx - ax) * t + (Math.random() - 0.5) * jit * taper * 2,
          y: ay + (by - ay) * t + (Math.random() - 0.5) * jit * taper * 2
        });
      }
      pts.push({ x: bx, y: by });
      return pts;
    };

    const main = bolt(x1, y1, x2, y2, jitter);
    branches.push(main);

    for (let f = 0; f < forks; f++) {
      const from = main[1 + ((Math.random() * (main.length - 2)) | 0)];
      if (!from) continue;
      const angle = Math.random() * Math.PI * 2;
      const len = 18 + Math.random() * 46;
      branches.push(bolt(
        from.x, from.y,
        from.x + Math.cos(angle) * len,
        from.y + Math.sin(angle) * len,
        jitter * 0.6
      ));
    }

    this.electricArcs.push({
      branches: branches,
      color: pickColor(color),
      width: o.width || 1,
      life: 1.0,
      decay: o.decay || 0.14
    });
  }

  /** Bolts lashing outward from a point. The signature move for "charged". */
  spawnLightningBurst(x, y, count, radius, color, opts) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const len = radius * (0.55 + Math.random() * 0.65);
      this.spawnElectricArc(
        x, y,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len,
        color,
        opts
      );
    }
  }

  spawnPopup(x, y, text, color = '#ffffff', fontSize = 14) {
    this.popups.push({
      x: Math.floor(x),
      y: Math.floor(y),
      text: text,
      fontSize: fontSize,
      vy: 1.2,
      life: 1.0,
      decay: 0.025
    });
  }

  /* ---------------- RENDERING ---------------- */

  /**
   * Pixel rings: a soft glow arc underneath, then the ring itself stamped as
   * chunky squares around the circumference. A smooth stroked circle looked
   * out of place next to the pixel-art world.
   */
  renderShockwaves(ctx) {
    ctx.save();
    // Additive so overlapping rings build into a hot core instead of muddying.
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      const c = sw.ramp ? rampColor(sw.ramp, sw.life, 0) : sw.color;

      // Soft wide halo under the ring.
      ctx.globalAlpha = sw.life * 0.10;
      ctx.strokeStyle = c;
      ctx.lineWidth = sw.thickness * 1.3;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Chunky pixel ring. Step count scales with circumference so the blocks
      // stay a consistent size instead of spreading out as the ring grows.
      ctx.globalAlpha = sw.life;
      ctx.fillStyle = c;
      const block = Math.max(1, Math.round(sw.thickness * 0.9));
      const steps = Math.max(12, Math.floor((Math.PI * 2 * sw.radius) / block));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        ctx.fillRect(
          Math.floor(sw.x + Math.cos(a) * sw.radius),
          Math.floor(sw.y + Math.sin(a) * sw.radius),
          block, block
        );
      }
    }
    ctx.restore();
  }

  renderStreaks(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < this.streaks.length; i++) {
      const st = this.streaks[i];
      const speed = Math.hypot(st.vx, st.vy) || 1;
      const tailX = st.x - (st.vx / speed) * st.len * st.life;
      const tailY = st.y - (st.vy / speed) * st.len * st.life;

      ctx.globalAlpha = st.life;
      ctx.strokeStyle = rampColor(st.ramp, st.life, 0);
      ctx.lineWidth = st.width;
      ctx.beginPath();
      ctx.moveTo(st.x, st.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderElectricArcs(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this.electricArcs.length; i++) {
      const arc = this.electricArcs[i];

      // Electricity is ALWAYS cyan with a white core, whatever spawned it.
      // A bolt tinted to match its source stopped reading as electricity.
      ctx.strokeStyle = ARC_COLOR;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = pass === 0 ? arc.life * 0.10 : arc.life * 0.38;
        ctx.lineWidth = pass === 0 ? arc.width * 2.2 : arc.width * 1.2;
        for (let b = 0; b < arc.branches.length; b++) {
          const pts = arc.branches[b];
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p].x, pts[p].y);
          ctx.stroke();
        }
      }

      // White-hot pixel core: march each segment and stamp blocks.
      ctx.globalAlpha = arc.life;
      ctx.fillStyle = ARC_CORE;
      const bs = Math.max(1, Math.round(arc.width * 0.55));
      for (let b = 0; b < arc.branches.length; b++) {
        const pts = arc.branches[b];
        for (let p = 1; p < pts.length; p++) {
          const x0 = pts[p - 1].x, y0 = pts[p - 1].y;
          const dx = pts[p].x - x0, dy = pts[p].y - y0;
          const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / bs));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            ctx.fillRect(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t), bs, bs);
          }
        }
      }
    }
    ctx.restore();
  }

  renderShards(ctx) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    }
  }

  /**
   * Hard pixels only. No glow sprite underneath - the soft halo read as blur
   * and muddied every explosion. Sparks are crisp squares on the pixel grid,
   * exactly like the rest of the world.
   */
  renderParticles(ctx) {
    ctx.save();
    // Additive: overlapping sparks build a hot core, which is what sells a
    // dense burst. Without it a cluster just reads as a flat blob.
    ctx.globalCompositeOperation = 'lighter';

    let last = null;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const c = p.ramp ? rampColor(p.ramp, p.life, p.heat) : (p.color || '#ffffff');
      if (c !== last) { ctx.fillStyle = c; last = c; }
      // Shrink as it cools: a spark that holds full size until it vanishes
      // reads as a dot switching off, not as something burning out.
      let s = Math.round(p.size * (0.5 + p.life * 0.6));
      if (s < 1) s = 1;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), s, s);
    }
    ctx.restore();
  }

  renderPopups(ctx) {
    for (let i = 0; i < this.popups.length; i++) {
      const pop = this.popups[i];
      ctx.save();
      ctx.font = `bold ${pop.fontSize}px 'Courier New', Courier, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1-Bit Black Stroke Background
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(pop.text, pop.x, pop.y);

      // Pure White Text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pop.text, pop.x, pop.y);

      ctx.restore();
    }
  }
}

window.SurvivalEngine = SurvivalEngine;
window.FIRE_PALETTE = FIRE_PALETTE;
window.BOLT_PALETTE = BOLT_PALETTE;
window.TRI_PALETTE = TRI_PALETTE;
window.MONO_PALETTE = MONO_PALETTE;

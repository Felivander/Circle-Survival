/**
 * CIRCLE SURVIVAL - 1-BIT MONOCHROME PIXEL SPACE BACKGROUND
 * Pure Black & White Pixel Grid Stars & Dither Grid
 */

class SpaceBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this.shootingStars = [];
    this.time = 0;

    this.init();
  }

  init() {
    const w = this.canvas.width || window.innerWidth;
    const h = this.canvas.height || window.innerHeight;

    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.floor(Math.random() * w),
        y: Math.floor(Math.random() * h),
        size: Math.random() < 0.82 ? 1 : 2, // 1px or 2px square pixel
        twinkleSpeed: 0.03 + Math.random() * 0.05,
        twinklePhase: Math.random() * Math.PI * 2,
        layer: Math.random() < 0.7 ? 1 : 2
      });
    }
  }

  resize(w, h) {
    this.init();
  }

  update(dt = 1, playerVx = 0, playerVy = 0) {
    this.time += 0.02 * dt;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Parallax star drift on pixel grid
    const driftX = playerVx * 0.1;
    const driftY = playerVy * 0.1;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const speed = s.layer * 0.15;
      s.x -= driftX * speed;
      s.y -= driftY * speed;

      if (s.x < 0) s.x += w;
      else if (s.x > w) s.x -= w;
      if (s.y < 0) s.y += h;
      else if (s.y > h) s.y -= h;
    }

    // 1-Bit Pixel Shooting Stars
    if (Math.random() < 0.006 * dt) {
      const angle = Math.PI * 0.75 + (Math.random() - 0.5) * 0.2;
      const speed = 14 + Math.random() * 8;
      this.shootingStars.push({
        x: Math.random() * w * 0.8,
        y: -10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: 24 + Math.random() * 30,
        life: 1.0,
        decay: 0.04
      });
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const ss = this.shootingStars[i];
      ss.x += ss.vx * dt;
      ss.y += ss.vy * dt;
      ss.life -= ss.decay * dt;
      if (ss.life <= 0 || ss.x > w + 50 || ss.y > h + 50) {
        this.shootingStars.splice(i, 1);
      }
    }
  }

  render(ctx) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Hard clear. This used to be a 0.24 alpha fade for phosphor trails, but
    // smearing EVERY object every frame made the whole game feel laggy and
    // muddy. Trails now come only from things that should have them (particles
    // fade on their own life, the dash spawns its own), so motion stays crisp.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Render 1-Bit Square Pixel Stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const twinkle = Math.sin(this.time * s.twinkleSpeed * 10 + s.twinklePhase);
      if (twinkle > -0.4) {
        const px = Math.floor(s.x);
        const py = Math.floor(s.y);
        ctx.fillRect(px, py, s.size, s.size);
      }
    }

    // Render Pixel Shooting Stars
    for (let i = 0; i < this.shootingStars.length; i++) {
      const ss = this.shootingStars[i];
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(ss.x), Math.floor(ss.y));
      ctx.lineTo(Math.floor(ss.x - ss.vx * 1.5), Math.floor(ss.y - ss.vy * 1.5));
      ctx.stroke();
    }
  }
}

window.SpaceBackground = SpaceBackground;

/**
 * CIRCLE SURVIVAL - GLOW / BLOOM POST-PROCESS
 *
 * Not a CRT filter. The scanlines, vignette and interlace roll are gone; what
 * remains is the bloom that makes energy read as light, plus a chromatic
 * split on heavy impacts.
 *
 * Draws onto its OWN overlay canvas stacked above the game canvas, never back
 * into the game canvas itself - a bloom composited into the source it samples
 * feeds back on itself and blows out to white.
 */

class GlowPost {
  constructor(gameCanvas) {
    this.src = gameCanvas;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'glowOverlay';
    this.ctx = this.canvas.getContext('2d');
    gameCanvas.parentNode.insertBefore(this.canvas, gameCanvas.nextSibling);

    // Bloom runs at quarter resolution; the upscale does the spreading.
    this.bloom = document.createElement('canvas');
    this.bloomCtx = this.bloom.getContext('2d');
    this.bloomScale = 0.25;

    // Scratch buffer for the chromatic-split channel tints.
    this.ca = document.createElement('canvas');
    this.caCtx = this.ca.getContext('2d');

    this.width = 0;
    this.height = 0;

    this.enabled = true;
    this.bloomStrength = 0.30;

    // Pumped by big hits; drives the chromatic split and extra bloom.
    this.intensity = 0;
  }

  /** Called on impacts. The image briefly loses convergence. */
  kick(amount) {
    this.intensity = Math.min(1.6, this.intensity + amount);
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.bloom.width = Math.max(1, Math.floor(w * this.bloomScale));
    this.bloom.height = Math.max(1, Math.floor(h * this.bloomScale));
    this.ca.width = this.bloom.width;
    this.ca.height = this.bloom.height;
  }

  update(dt) {
    if (this.intensity > 0) {
      this.intensity = Math.max(0, this.intensity - 0.055 * dt);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.ctx.clearRect(0, 0, this.width, this.height);
    return this.enabled;
  }

  /** Tint the bloom buffer to one channel and add it back at an offset. */
  _channel(ctx, tint, dx, alpha) {
    const c = this.caCtx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.ca.width, this.ca.height);
    c.drawImage(this.bloom, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = tint;
    c.fillRect(0, 0, this.ca.width, this.ca.height);
    c.globalCompositeOperation = 'source-over';

    ctx.globalAlpha = alpha;
    ctx.drawImage(this.ca, dx, 0, this.width, this.height);
  }

  /** Call last, once the game canvas holds the finished frame. */
  apply() {
    if (!this.width) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);
    if (!this.enabled) return;

    // Shrink the frame, blur it, add it back as light.
    this.bloomCtx.clearRect(0, 0, this.bloom.width, this.bloom.height);
    this.bloomCtx.filter = 'blur(1px)';
    this.bloomCtx.drawImage(this.src, 0, 0, this.bloom.width, this.bloom.height);
    this.bloomCtx.filter = 'none';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = this.bloomStrength + this.intensity * 0.12;
    ctx.drawImage(this.bloom, 0, 0, w, h);

    // Chromatic split on impact: the red and cyan channels pull apart.
    if (this.intensity > 0.02) {
      const off = this.intensity * 4;
      const a = Math.min(0.28, this.intensity * 0.22);
      this._channel(ctx, '#ff0000', -off, a);
      this._channel(ctx, '#00ffff', off, a);
    }
    ctx.restore();
  }
}

window.GlowPost = GlowPost;

/**
 * CIRCLE SURVIVAL: 1-BIT PIXEL ART BLACK & WHITE RETRO ARCADE ENGINE
 * Features:
 * - Pure Monochrome 1-Bit Visuals (Pure #000000 Black & #ffffff White)
 * - Pixel Art Procedural Multi-Faceted Asteroids with Dither Patterns
 * - 1-Bit Geometric Pixel Vessel with Concentric Charge Rings
 * - Colossal 1-Bit Titan Ring Boss with Segmented Pixel Plates
 * - 1-Bit Supernova Nuke Screen-Clearing Powerups & Energy Diamonds
 * - Hit-Stop Freeze Frame & Inverted Monochrome Screen Flash
 */

class CircleSurvivalGame {
  constructor() {
    this.canvas = document.getElementById('survivalCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.audio = window.survivalAudio;
    this.engine = new SurvivalEngine(this.canvas);
    this.spaceBg = new SpaceBackground(this.canvas);
    this.glow = new GlowPost(this.canvas);
    this.leaderboard = window.survivalLeaderboard;

    this.state = 'MENU'; // 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
    this.score = 0;
    this.scoreAcc = 0; // fractional passive score, framerate-independent
    this.highScore = this.leaderboard.stats.highScore || 0;
    this.survivalTime = 0;
    this.difficultyTimer = 0;

    // Combo: every graze / pickup / kill bumps it. Idle lets it drop.
    this.combo = 1;
    this.comboTimer = 0;
    this.comboWindow = 200; // ~3.3s of frames to keep the chain alive
    this.maxCombo = 12;
    this.runBestCombo = 1;

    // Shield: absorbs one hit, refunded every 5 orbs. Early runs forgive mistakes.
    this.shield = 1;
    this.orbsCollected = 0;
    this.orbsPerShield = 5;

    // First-run tutorial beats (time in seconds -> line)
    this.hintIdx = 0;
    this.hints = [
      { t: 0.6, text: 'WASD / ARROWS TO MOVE' },
      { t: 4.0, text: 'GRAB DIAMONDS FOR POINTS + SHIELD' },
      { t: 9.0, text: 'FLY CLOSE TO ROCKS -> GRAZE -> COMBO UP' },
      { t: 15.0, text: '[SPACE] DASH SMASHES ROCKS' },
      { t: 24.0, text: '[SHIFT] BLAST CLEARS THE SCREEN' }
    ];
    this.showHints = (this.leaderboard.stats.totalRuns || 0) < 3;

    // Game Feel: Hit Stop & Screen Invert Flash
    this.hitStop = 0;
    this.screenFlash = 0;
    this.screenFlashColor = '#ffffff';

    // Zoom punch: the view snaps in on impact and eases back. Cheap, and it
    // does more for "that felt powerful" than any amount of extra particles.
    this.zoom = 1;
    this.zoomPunch = 0;
    this.crackleTimer = 0;

    // Tri-colour powerups: one drops every 1000 points earned.
    this.powerups = [];
    this.nextPowerupScore = 1000;
    this.powerupStep = 1000;
    this.overdrive = 0;        // frames of overdrive remaining
    this.overdriveMax = 420;   // ~7s
    this.runOverdrives = 0;

    // Hull tint. Each orb floods the shell with colour that then bleeds back
    // to white, so how lit-up you are IS the charge meter - the HUD pips are
    // just a readout of something you can already feel.
    this.tint = 0;          // 0..1 intensity
    this.tintHold = 0;      // frames to hold at full before decaying
    this.tintColor = '#ffffff';
    this.tintDecay = 0.009; // ~1.9s from full to nothing
    // Ten steps, cool to hot, so the shell visibly heats up as the storm nears.
    this.chargeRamp = [
      '#00e0ff', '#00f2c8', '#00ff88', '#7bff33', '#d4ff00',
      '#ffe000', '#ffab00', '#ff6a00', '#ff2600', '#ffffff'
    ];

    // Chain Lightning Storm: charges on orbs, fires on every 10th.
    this.orbCharge = 0;
    this.orbsPerStorm = 10;
    this.storm = null;
    this.runStorms = 0;

    // Global slow-motion multiplier applied to gameplay (not to the bloom pass).
    this.timeScale = 1;
    this.timeScaleTarget = 1;

    // Per-Run Stats
    this.runGrazes = 0;
    this.runBlasts = 0;
    this.runDashes = 0;
    this.runVaporized = 0;

    // Screen Dimensions
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // 1-Bit Pixel Vessel State
    this.player = {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      radius: 14,
      speed: 5.6,
      accel: 0.72,
      friction: 0.88,
      counterBrakeForce: 1.9,
      facingAngle: 0,
      rotAngle: 0,
      invuln: 0,

      // Dash (SPACE)
      dashCooldown: 0,
      dashMaxCooldown: 90,
      isDashing: false,
      dashDuration: 0,

      // Fire Blast (SHIFT)
      blastCooldown: 0,
      blastMaxCooldown: 180,
      blastRadius: 160
    };

    // Entities
    this.hazards = [];
    this.energyOrbs = [];
    this.nukePowerups = [];
    this.nukeSpawnTimer = 0;

    // Bosses (gated on survival time, not score). Cycled in order, so a long
    // run always sees a different fight rather than the same ring three times.
    this.boss = null;
    this.nextBossTime = 75;
    this.bossWarningTimer = 0;
    this.bossOrder = ['ring', 'pulsar', 'matrix'];
    this.bossIndex = 0;

    // Keyboard Inputs
    this.keys = {};

    this.initCanvasResize();
    this.initInputs();
    this.initDOMButtons();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initCanvasResize() {
    const resize = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;

      if (this.spaceBg) this.spaceBg.resize(this.width, this.height);
      if (this.glow) this.glow.resize(this.width, this.height);

      if (this.state === 'MENU') {
        this.player.x = this.width / 2;
        this.player.y = this.height / 2;
      }
    };
    window.addEventListener('resize', resize);
    resize();
  }

  initInputs() {
    // WebAudio needs a user gesture before it will make a sound.
    const wakeAudio = () => { if (this.audio) this.audio.resume(); };
    window.addEventListener('keydown', wakeAudio, { once: true });
    window.addEventListener('pointerdown', wakeAudio, { once: true });

    // Tab-switching mid-run used to be a free death.
    window.addEventListener('blur', () => {
      if (this.state === 'PLAYING') this.togglePause();
    });

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        e.preventDefault();
      }

      this.keys[e.code] = true;

      if (e.code === 'Space') {
        if (this.state === 'MENU' || this.state === 'GAMEOVER') {
          this.startNewGame();
        } else if (this.state === 'PLAYING') {
          this.triggerDash();
        }
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (this.state === 'PLAYING') {
          this.triggerFireBlast();
        }
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'PLAYING' || this.state === 'PAUSED') {
          this.togglePause();
        }
      }

      if (e.code === 'KeyR' && (this.state === 'GAMEOVER' || this.state === 'PAUSED')) {
        this.startNewGame();
      }

      if (e.code === 'KeyF') {
        const on = this.glow.toggle();
        this.engine.spawnPopup(this.width / 2, this.height * 0.5, `GLOW ${on ? 'ON' : 'OFF'}`, '#ffffff', 18);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  initDOMButtons() {
    const btnPause = document.getElementById('btnPauseHUD');
    if (btnPause) btnPause.addEventListener('click', () => this.togglePause());

    const btnLB = document.getElementById('btnOpenLeaderboard');
    if (btnLB) btnLB.addEventListener('click', () => this.openLeaderboard());

    const btnStats = document.getElementById('btnOpenStats');
    if (btnStats) btnStats.addEventListener('click', () => this.openStats());

    const btnCloseLB = document.getElementById('btnCloseLeaderboard');
    if (btnCloseLB) btnCloseLB.addEventListener('click', () => this.closeModals());

    const btnCloseStats = document.getElementById('btnCloseStats');
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => this.closeModals());

    const btnResume = document.getElementById('btnResumeGame');
    if (btnResume) btnResume.addEventListener('click', () => this.resumeGame());

    const btnRestartPause = document.getElementById('btnRestartPause');
    if (btnRestartPause) btnRestartPause.addEventListener('click', () => this.startNewGame());

    const btnQuitPause = document.getElementById('btnQuitPause');
    if (btnQuitPause) btnQuitPause.addEventListener('click', () => this.returnToMenu());

    const nameInput = document.getElementById('playerNameInput');
    if (nameInput) {
      nameInput.value = this.leaderboard.playerName;
      nameInput.addEventListener('input', (e) => {
        this.leaderboard.setPlayerName(e.target.value);
      });
    }
  }

  closeModals() {
    ['pauseModal', 'leaderboardModal', 'statsModal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  startNewGame() {
    this.closeModals();
    this.state = 'PLAYING';
    this.score = 0;
    this.scoreAcc = 0;
    this.survivalTime = 0;
    this.difficultyTimer = 0;
    this.hitStop = 0;
    this.screenFlash = 0;

    this.combo = 1;
    this.comboTimer = 0;
    this.runBestCombo = 1;
    this.shield = 1;
    this.orbsCollected = 0;
    this.hintIdx = 0;
    this.showHints = (this.leaderboard.stats.totalRuns || 0) < 3;

    this.runGrazes = 0;
    this.runBlasts = 0;
    this.runDashes = 0;
    this.runVaporized = 0;

    this.player.x = this.width / 2;
    this.player.y = this.height / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facingAngle = 0;
    this.player.dashCooldown = 0;
    this.player.isDashing = false;
    this.player.blastCooldown = 0;
    this.player.invuln = 0;

    this.hazards = [];
    this.energyOrbs = [];
    this.nukePowerups = [];
    this.nukeSpawnTimer = 0;
    this.powerups = [];
    this.nextPowerupScore = this.powerupStep;
    this.overdrive = 0;
    this.runOverdrives = 0;
    this.orbCharge = 0;
    this.tint = 0;
    this.tintHold = 0;
    this.tintColor = '#ffffff';
    this.storm = null;
    this.runStorms = 0;
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.boss = null;
    this.nextBossTime = 75;
    this.bossWarningTimer = 0;
    this.bossIndex = 0;

    for (let i = 0; i < 4; i++) {
      this.spawnEnergyOrb();
    }

    const overlay = document.getElementById('survivalOverlay');
    if (overlay) overlay.classList.add('hidden');

    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) pauseModal.classList.add('hidden');
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      const pauseModal = document.getElementById('pauseModal');
      if (pauseModal) pauseModal.classList.remove('hidden');
    } else if (this.state === 'PAUSED') {
      this.resumeGame();
    }
  }

  resumeGame() {
    this.state = 'PLAYING';
    this.closeModals();
  }

  returnToMenu() {
    this.state = 'MENU';
    this.closeModals();
    const overlay = document.getElementById('survivalOverlay');
    if (overlay) overlay.classList.remove('hidden');
    document.getElementById('overlayTitle').textContent = 'CIRCLE SURVIVAL';
    document.getElementById('btnStartAction').textContent = 'START MISSION (SPACE)';
  }

  openLeaderboard() {
    const lbModal = document.getElementById('leaderboardModal');
    const lbContainer = document.getElementById('leaderboardRowsContainer');
    if (lbModal && lbContainer) {
      lbContainer.innerHTML = this.leaderboard.renderBoardHTML();
      lbModal.classList.remove('hidden');
    }
  }

  openStats() {
    const statsModal = document.getElementById('statsModal');
    if (statsModal) {
      const s = this.leaderboard.stats;
      document.getElementById('stTotalRuns').textContent = s.totalRuns.toLocaleString();
      document.getElementById('stHighScore').textContent = s.highScore.toLocaleString();
      document.getElementById('stBestTime').textContent = `${s.bestTime.toFixed(1)}s`;
      document.getElementById('stTotalGrazes').textContent = s.totalGrazes.toLocaleString();
      document.getElementById('stTotalVaporized').textContent = s.totalVaporized.toLocaleString();
      document.getElementById('stTotalDashes').textContent = s.totalDashes.toLocaleString();
      document.getElementById('stTotalBlasts').textContent = s.totalBlasts.toLocaleString();
      statsModal.classList.remove('hidden');
    }
  }

  /* ---------------- GAME FEEL ---------------- */

  /**
   * One call for "make this hit land": freeze, shake, zoom, tint.
   * Keeping them together stops the four from drifting out of sync.
   */
  punch({ stop = 0, trauma = 0, zoom = 0, flash = 0, color = '#ffffff' } = {}) {
    if (stop > this.hitStop) this.hitStop = stop;
    if (trauma) this.engine.addTrauma(trauma);
    if (zoom > this.zoomPunch) this.zoomPunch = zoom;
    if (flash > this.screenFlash) {
      this.screenFlash = flash;
      this.screenFlashColor = color;
    }
    if (this.glow) this.glow.kick(Math.max(trauma, zoom * 8));
  }

  /* ---------------- COMBO / SCORE / DAMAGE ---------------- */

  bumpCombo() {
    this.comboTimer = this.comboWindow;
    if (this.combo < this.maxCombo) this.combo++;
    if (this.combo > this.runBestCombo) this.runBestCombo = this.combo;
  }

  // Every point in the game routes through here so the multiplier can't be forgotten.
  awardScore(base, x, y, label, fontSize = 13) {
    const pts = Math.round(base * this.combo);
    this.score += pts;
    if (label) {
      const suffix = this.combo > 1 ? ` x${this.combo}` : '';
      this.engine.spawnPopup(x, y, `${label} +${pts}${suffix}`, '#ffffff', fontSize);
    }
    return pts;
  }

  // Single entry point for "player got touched". Shield eats the first one.
  hitPlayer() {
    if (this.player.invuln > 0 || this.player.isDashing) return;

    if (this.shield > 0) {
      this.shield--;
      this.player.invuln = 100;
      this.combo = 1;
      this.comboTimer = 0;
      this.hitStop = 5;
      this.screenFlash = 0.7;
      this.screenFlashColor = '#ffffff';
      this.engine.addTrauma(0.85);
      if (this.audio) this.audio.playExplosion(false);
      this.engine.spawnShockwave(this.player.x, this.player.y, 120, MONO_PALETTE);
      this.engine.spawnExplosion(this.player.x, this.player.y, MONO_PALETTE, 30);
      this.engine.spawnPopup(this.player.x, this.player.y - 34, 'SHIELD DOWN!', '#ffffff', 17);

      // Clear the immediate area so you don't die again inside the same frame cluster.
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        if (Math.hypot(h.x - this.player.x, h.y - this.player.y) < 150) {
          this.hazards.splice(i, 1);
          this.engine.spawnExplosion(h.x, h.y, MONO_PALETTE, 18);
        }
      }
      return;
    }

    this.triggerGameOver();
  }

  triggerDash() {
    if (this.state !== 'PLAYING') return;
    if (this.player.dashCooldown <= 0) {
      this.player.isDashing = true;
      this.player.dashDuration = 14;
      this.player.dashCooldown = this.player.dashMaxCooldown;
      this.runDashes++;

      let moveAngle = this.player.facingAngle;
      const speed = Math.hypot(this.player.vx, this.player.vy);
      if (speed > 0.4) {
        moveAngle = Math.atan2(this.player.vy, this.player.vx);
      }

      const dashSpeed = 15.0;
      this.player.vx = Math.cos(moveAngle) * dashSpeed;
      this.player.vy = Math.sin(moveAngle) * dashSpeed;

      if (this.audio) this.audio.playDash();
      this.engine.spawnDashBurst(this.player.x, this.player.y, this.player.vx, this.player.vy);

      // Two rings at different speeds so the bolt reads as a snap, not a bubble.
      this.engine.spawnShockwave(this.player.x, this.player.y, 80, BOLT_PALETTE, 2);
      this.engine.spawnShockwave(this.player.x, this.player.y, 150, BOLT_PALETTE, 1);

      // Bolts lashing out to whatever is nearby.
      for (let i = this.hazards.length - 1; i >= 0 && i > this.hazards.length - 12; i--) {
        const h = this.hazards[i];
        if (Math.hypot(h.x - this.player.x, h.y - this.player.y) < 240) {
          this.engine.spawnElectricArc(this.player.x, this.player.y, h.x, h.y, BOLT_PALETTE[2]);
        }
      }

      this.punch({ stop: 2, trauma: 0.7, zoom: 0.05, flash: 0.35, color: '#00ffff' });
    }
  }

  triggerFireBlast() {
    if (this.state !== 'PLAYING') return;
    if (this.player.blastCooldown <= 0) {
      this.player.blastCooldown = this.player.blastMaxCooldown;
      this.runBlasts++;

      if (this.audio) this.audio.playFireBlast();

      // Three rings, widening and thinning, so the blast front has depth.
      this.engine.spawnShockwave(this.player.x, this.player.y, this.player.blastRadius, FIRE_PALETTE, 3);
      this.engine.spawnShockwave(this.player.x, this.player.y, this.player.blastRadius * 1.7, FIRE_PALETTE, 2);
      this.engine.spawnShockwave(this.player.x, this.player.y, this.player.blastRadius * 2.4, FIRE_PALETTE, 1);
      this.engine.spawnFireBurst(this.player.x, this.player.y, 160);
      this.engine.spawnPopup(this.player.x, this.player.y - 30, '>> FIRE BLAST <<', '#ffffff', 18);

      this.punch({ stop: 7, trauma: 1.0, zoom: 0.11, flash: 0.75, color: '#ff6600' });
      this.engine.spawnLightningBurst(
        this.player.x, this.player.y, 14, this.player.blastRadius * 1.5,
        FIRE_PALETTE[2], { forks: 3, jitter: 26, width: 1.5, decay: 0.10 }
      );

      const blastRadiusSq = this.player.blastRadius * this.player.blastRadius;
      const shockRange = this.player.blastRadius * 1.4;

      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        const dx = h.x - this.player.x;
        const dy = h.y - this.player.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= blastRadiusSq) {
          this.hazards.splice(i, 1);
          this.runVaporized++;
          this.bumpCombo();
          this.awardScore(200, h.x, h.y, 'VAPORIZED!');
          this.engine.spawnExplosion(h.x, h.y, FIRE_PALETTE, 50);
        } else if (distSq < shockRange * shockRange) {
          const dist = Math.sqrt(distSq) || 1;
          const force = ((shockRange - dist) / shockRange) * 10.0;
          h.vx += (dx / dist) * force;
          h.vy += (dy / dist) * force;
          this.engine.spawnElectricArc(this.player.x, this.player.y, h.x, h.y, FIRE_PALETTE);
        }
      }

      // Blast damage works on whichever boss is out.
      this.damageBoss(this.player.x, this.player.y, this.player.blastRadius, 120);
    }
  }

  spawnEnergyOrb() {
    const margin = 70;
    this.energyOrbs.push({
      x: margin + Math.random() * (this.width - margin * 2),
      y: margin + Math.random() * (this.height - margin * 2),
      radius: 8.0,
      rot: Math.random() * Math.PI * 2,
      pulse: 0
    });
  }

  /* ---------------- CHAIN LIGHTNING STORM ---------------- */

  /**
   * Fired by the 10th orb. Time drops to a crawl and a single bolt walks from
   * target to target, one hop at a time, so you actually get to watch it work.
   * Hops are driven by UNSCALED frames: the world slows down, the storm does
   * not, which is what makes it feel like the storm is outside normal time.
   */
  triggerChainStorm() {
    const MAX_TARGETS = 20;

    // Nearest-first so the chain starts local and spirals outward.
    const targets = this.hazards
      .map((h) => ({ h, d: Math.hypot(h.x - this.player.x, h.y - this.player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_TARGETS)
      .map((t) => t.h);

    this.storm = {
      targets: targets,
      idx: 0,
      hopTimer: 0,
      hopInterval: 3.2,      // real frames between hops
      fromX: this.player.x,
      fromY: this.player.y,
      totalHops: targets.length,
      tail: 18               // frames to hold after the last hop
    };

    this.runStorms++;
    this.timeScaleTarget = 0.30;

    // Tenth orb: full white-hot shell, held well past a normal pickup.
    this.tint = 1;
    this.tintHold = 300;
    this.tintColor = '#ffffff';

    if (this.audio) this.audio.playStormRelease();
    this.punch({ trauma: 0.9, zoom: 0.13, flash: 0.9, color: '#ffffff' });

    this.engine.spawnPopup(this.width / 2, this.height * 0.24, 'CHAIN LIGHTNING', '#ffffff', 26);
    for (let i = 0; i < TRI_PALETTE.length; i++) {
      this.engine.spawnShockwave(this.player.x, this.player.y, 260 + i * 150, [TRI_PALETTE[i], '#ffffff'], 2.5 - i * 0.5);
    }
  }

  /** Advances the storm on real frames, independent of the slow-mo. */
  updateStorm(rawDt) {
    const s = this.storm;
    s.hopTimer -= rawDt;
    if (s.hopTimer > 0) return;
    s.hopTimer = s.hopInterval;

    if (s.idx >= s.targets.length) {
      s.tail -= s.hopInterval;
      if (s.tail <= 0) {
        this.storm = null;
        this.timeScaleTarget = 1;
      }
      return;
    }

    const h = s.targets[s.idx];
    const i = this.hazards.indexOf(h);
    // Target may have been destroyed between hops; skip it, don't stall.
    if (i === -1) { s.idx++; return; }

    const colour = TRI_PALETTE[s.idx % TRI_PALETTE.length];

    // The bolt itself. Long decay so the whole chain stays on screen and you
    // can read the path it took.
    this.engine.spawnElectricArc(s.fromX, s.fromY, h.x, h.y, colour, {
      forks: 4, jitter: 30, width: 2, decay: 0.020
    });
    this.engine.spawnLightningBurst(h.x, h.y, 5, 70, colour, {
      forks: 2, jitter: 12, width: 1, decay: 0.05
    });

    this.hazards.splice(i, 1);
    this.runVaporized++;
    this.bumpCombo();
    this.awardScore(300, h.x, h.y, 'CHAIN', 15);

    this.engine.spawnExplosion(h.x, h.y, [colour, '#ffffff'], 26);
    this.engine.spawnShockwave(h.x, h.y, 110, [colour, '#ffffff'], 1.5);
    this.engine.addTrauma(0.30);
    if (this.glow) this.glow.kick(0.5);
    if (this.audio) this.audio.playChainHop(s.idx, Math.max(1, s.totalHops));

    s.fromX = h.x;
    s.fromY = h.y;
    s.idx++;
  }

  /* ---------------- TRI-COLOUR POWERUP ---------------- */

  spawnPowerup() {
    const margin = 90;
    this.powerups.push({
      x: margin + Math.random() * (this.width - margin * 2),
      y: margin + Math.random() * (this.height - margin * 2),
      radius: 15,
      hitR: 17, // pickup radius stays generous even though it draws small
      rot: 0,
      pulse: 0,
      bob: Math.random() * Math.PI * 2,
      lifetime: 1000
    });
    this.engine.spawnPopup(this.width / 2, this.height * 0.30, 'POWERUP DROPPED', '#ffffff', 17);
  }

  collectPowerup(p) {
    this.overdrive = this.overdriveMax;
    this.runOverdrives++;
    this.player.dashCooldown = 0;
    this.player.blastCooldown = 0;
    this.bumpCombo();
    this.awardScore(500, p.x, p.y, 'OVERDRIVE', 20);

    if (this.audio) this.audio.playCollect();
    this.punch({ stop: 8, trauma: 1.0, zoom: 0.16, flash: 0.85, color: '#ffffff' });

    // Tri-colour detonation: one ring, one burst and one bolt fan per channel.
    for (let i = 0; i < TRI_PALETTE.length; i++) {
      const c = TRI_PALETTE[i];
      this.engine.spawnShockwave(p.x, p.y, 200 + i * 130, [c, c, '#ffffff'], 3 - i * 0.5);
      this.engine.spawnStreaks(p.x, p.y, 16, [c, '#ffffff'], 6.0);
      this.engine.spawnLightningBurst(p.x, p.y, 8, 260, c, { forks: 3, jitter: 26, width: 1.5, decay: 0.07 });
    }
  }

  spawnNukePowerup() {
    const margin = 80;
    this.nukePowerups.push({
      x: margin + Math.random() * (this.width - margin * 2),
      y: margin + Math.random() * (this.height - margin * 2),
      radius: 12.0,
      rot: Math.random() * Math.PI * 2,
      pulse: 0,
      lifetime: 900
    });
    this.engine.spawnPopup(this.width / 2, this.height * 0.28, '** SUPERNOVA NUKE SPAWNED **', '#ffffff', 16);
  }

  triggerSupernovaNuke(x, y) {
    if (this.audio) this.audio.playExplosion(true);
    this.punch({ stop: 12, trauma: 1.0, zoom: 0.20, flash: 1.0, color: '#ff8800' });

    for (let s = 0; s < 5; s++) {
      this.engine.spawnShockwave(x, y, 200 + s * 220, FIRE_PALETTE, 4 - s * 0.5);
    }
    this.engine.spawnFireBurst(x, y, 260);
    this.engine.spawnStreaks(x, y, 40, FIRE_PALETTE, 7.0);
    this.engine.spawnLightningBurst(x, y, 26, Math.max(this.width, this.height) * 0.6,
      FIRE_PALETTE[2], { forks: 4, jitter: 44, width: 2, decay: 0.055 });
    this.engine.spawnPopup(this.width / 2, this.height * 0.35, 'SUPERNOVA NUKE // ALL ENEMIES VAPORIZED', '#ffffff', 22);

    let totalScore = 0;
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      this.engine.spawnExplosion(h.x, h.y, FIRE_PALETTE, 40);
      this.engine.spawnRockShards(h.x, h.y, '#ffffff', 12, 5);
      totalScore += 150;
      this.runVaporized++;
      this.bumpCombo();
    }
    this.hazards = [];
    this.awardScore(Math.max(500, totalScore), this.width / 2, this.height * 0.42, 'NUKE', 18);

    // The nuke reaches the whole arena, so its radius covers any boss layout.
    this.damageBoss(this.width / 2, this.height / 2, Math.max(this.width, this.height), 160);
  }

  spawnEdgeHazard() {
    const edge = Math.floor(Math.random() * 4);
    let startX = 0, startY = 0;
    const margin = 50;

    if (edge === 0) { startX = Math.random() * this.width; startY = -margin; }
    else if (edge === 1) { startX = this.width + margin; startY = Math.random() * this.height; }
    else if (edge === 2) { startX = Math.random() * this.width; startY = this.height + margin; }
    else { startX = -margin; startY = Math.random() * this.height; }

    // Early rocks are sloppy aimers; later ones lead you properly.
    const aimSlop = Math.max(20, 160 - this.survivalTime * 2.2);
    const targetX = this.player.x + (Math.random() - 0.5) * aimSlop;
    const targetY = this.player.y + (Math.random() - 0.5) * aimSlop;
    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = 2.4 + Math.min(4.6, this.survivalTime * 0.055);

    const typeRoll = Math.random();
    let type = 'meteor';
    let radius = 13;
    let rot = Math.random() * Math.PI * 2;
    let rotSpeed = (Math.random() - 0.5) * 0.06;

    if (typeRoll < 0.28 && this.survivalTime > 18) {
      type = 'seeker';
      radius = 11;
    } else if (typeRoll < 0.50 && this.survivalTime > 32) {
      type = 'heavy';
      radius = 22;
    }

    // More vertices = a rougher, less "geometric" silhouette.
    const numVerts = type === 'heavy' ? 8 : 9;
    const vertices = [];
    for (let v = 0; v < numVerts; v++) {
      const vAngle = (v * Math.PI * 2) / numVerts;
      const noise = 0.70 + Math.random() * 0.52;
      vertices.push({
        x: Math.cos(vAngle) * radius * noise,
        y: Math.sin(vAngle) * radius * noise
      });
    }

    this.hazards.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: radius,
      type: type,
      rot: rot,
      rotSpeed: rotSpeed,
      vertices: vertices,
      texture: this.makeRockTexture(radius),
      grazed: false
    });
  }

  /**
   * Per-rock surface detail, generated once at spawn. Regenerating this each
   * frame would make the texture crawl and boil instead of rotating with the
   * rock, which is what kills the illusion of solidity.
   */
  makeRockTexture(radius) {
    const craters = [];
    const craterCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < craterCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.55;
      craters.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: radius * (0.12 + Math.random() * 0.20)
      });
    }

    // Stipple dots give the surface grain between the craters.
    const stipple = [];
    const dotCount = 8 + Math.floor(radius * 0.7);
    for (let i = 0; i < dotCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * 0.78;
      stipple.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        s: Math.random() < 0.75 ? 1 : 2
      });
    }

    return { craters, stipple, seed: Math.random() };
  }

  /* ---------------- 1-BIT TITAN RING BOSS ---------------- */

  /** Picks the next boss in the cycle and announces it. */
  spawnBoss() {
    const kind = this.bossOrder[this.bossIndex % this.bossOrder.length];
    this.bossIndex++;

    if (kind === 'pulsar') this.spawnBossPulsar();
    else if (kind === 'matrix') this.spawnBossMatrix();
    else this.spawnBossRing();

    this.bossWarningTimer = 160;
    if (this.audio) this.audio.playExplosion(true);
    this.punch({ trauma: 0.9, zoom: 0.10, flash: 0.7, color: '#ffffff' });
    this.engine.spawnShockwave(this.boss.x, this.boss.y, this.boss.radius * 1.3, '#ffffff', 2);
    this.engine.spawnPopup(this.width / 2, this.height * 0.22, `!! ${this.boss.title} !!`, '#ffffff', 20);
  }

  /**
   * BOSS 2 - PULSAR. A core ringed by sweeping beam arms. The arms kill on
   * contact, so the fight is about timing gaps rather than breaking plates.
   */
  spawnBossPulsar() {
    const minDim = Math.min(this.width, this.height);
    const reach = Math.max(200, minDim * 0.42);
    const arms = [];
    const armCount = 5;

    for (let i = 0; i < armCount; i++) {
      arms.push({
        angle: (i * Math.PI * 2) / armCount,
        length: reach,
        width: 13,
        charge: 0
      });
    }

    this.boss = {
      kind: 'pulsar',
      x: this.width / 2,
      y: this.height / 2,
      radius: reach,
      coreR: 46,
      arms: arms,
      health: 900,
      maxHealth: 900,
      gyroAngle: 0,
      rotSpeed: 0.011,
      hitShake: 0,
      attackTimer: 0,
      attackInterval: 200,
      arming: 130,
      title: 'PULSAR HELIX'
    };
  }

  /**
   * BOSS 3 - SWARM MATRIX. Orbiting nodes joined by live lightning links.
   * Both the nodes and the links between surviving nodes are lethal, so the
   * arena keeps re-shaping as you destroy them.
   */
  spawnBossMatrix() {
    const minDim = Math.min(this.width, this.height);
    const orbit = Math.max(150, minDim * 0.30);
    const nodes = [];
    const nodeCount = 7;

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        angle: (i * Math.PI * 2) / nodeCount,
        dist: orbit * (i % 2 === 0 ? 1 : 0.62),
        r: 22,
        health: 130,
        maxHealth: 130,
        destroyed: false,
        hitShake: 0
      });
    }

    this.boss = {
      kind: 'matrix',
      x: this.width / 2,
      y: this.height / 2,
      radius: orbit,
      nodes: nodes,
      health: nodeCount * 130,
      maxHealth: nodeCount * 130,
      gyroAngle: 0,
      rotSpeed: 0.007,
      linkTimer: 0,
      attackTimer: 0,
      attackInterval: 260,
      arming: 130,
      title: 'SWARM MATRIX'
    };
  }

  /** World position of a matrix node. */
  matrixNodePos(b, n) {
    const a = n.angle + b.gyroAngle;
    return { x: b.x + Math.cos(a) * n.dist, y: b.y + Math.sin(a) * n.dist };
  }

  /** World position of a ring segment. */
  ringSegPos(b, seg) {
    const a = seg.midAngle + b.gyroAngle;
    return { x: b.x + Math.cos(a) * b.radius, y: b.y + Math.sin(a) * b.radius };
  }

  /**
   * Single damage entry point for every boss kind. Blast, nuke and dash all
   * route through here, so adding a boss never means hunting down three
   * separate places that poke at `.segments` directly.
   */
  damageBoss(x, y, radius, amount) {
    const b = this.boss;
    if (!b || b.arming > 0) return false;
    let hit = false;

    if (b.kind === 'pulsar') {
      if (Math.hypot(x - b.x, y - b.y) <= radius + b.coreR) {
        b.health -= amount;
        b.hitShake = 16;
        hit = true;
        this.engine.spawnExplosion(b.x, b.y, MONO_PALETTE, 30);
        if (b.health <= 0) this.triggerBossDefeat();
      }
      return hit;
    }

    if (b.kind === 'matrix') {
      for (let i = 0; i < b.nodes.length; i++) {
        const n = b.nodes[i];
        if (n.destroyed) continue;
        const p = this.matrixNodePos(b, n);
        if (Math.hypot(x - p.x, y - p.y) <= radius + n.r) {
          n.health -= amount;
          n.hitShake = 14;
          hit = true;
          this.engine.spawnExplosion(p.x, p.y, MONO_PALETTE, 26);
          if (n.health <= 0) {
            n.destroyed = true;
            this.bumpCombo();
            this.awardScore(400, p.x, p.y, 'NODE DOWN!', 15);
            this.engine.spawnLightningBurst(p.x, p.y, 6, 120, '#ffffff', { forks: 2, width: 1.5 });
          }
        }
      }
      if (hit && b.nodes.every((n) => n.destroyed)) this.triggerBossDefeat();
      return hit;
    }

    // ring
    for (let i = 0; i < b.segments.length; i++) {
      const seg = b.segments[i];
      if (seg.destroyed) continue;
      const p = this.ringSegPos(b, seg);
      if (Math.hypot(x - p.x, y - p.y) <= radius + 30) {
        seg.health -= amount;
        seg.hitShake = 14;
        hit = true;
        this.engine.spawnExplosion(p.x, p.y, MONO_PALETTE, 30);
        if (seg.health <= 0) {
          seg.destroyed = true;
          this.bumpCombo();
          this.awardScore(400, p.x, p.y, 'PLATE CRUSHED!', 15);
        }
      }
    }
    if (hit && b.segments.every((s) => s.destroyed)) this.triggerBossDefeat();
    return hit;
  }

  spawnBossRing() {
    const minDim = Math.min(this.width, this.height);
    const ringRadius = Math.max(190, minDim * 0.36);
    const ringThickness = 30;
    const numSegments = 16;
    const segments = [];

    for (let i = 0; i < numSegments; i++) {
      const angle = (i * Math.PI * 2) / numSegments;
      const nextAngle = ((i + 1) * Math.PI * 2) / numSegments;
      const midAngle = (angle + nextAngle) / 2;
      const span = ((Math.PI * 2) / numSegments) * 0.90;

      segments.push({
        id: i,
        midAngle: midAngle,
        innerR: ringRadius - ringThickness / 2,
        outerR: ringRadius + ringThickness / 2,
        span: span,
        health: 80,
        maxHealth: 80,
        destroyed: false,
        hitShake: 0
      });
    }

    this.boss = {
      kind: 'ring',
      x: this.width / 2,
      y: this.height / 2,
      radius: ringRadius,
      thickness: ringThickness,
      segments: segments,
      health: numSegments * 80,
      maxHealth: numSegments * 80,
      gyroAngle: 0,
      rotSpeed: 0.003,
      attackTimer: 0,
      attackInterval: 240,
      arming: 110, // harmless while materializing, so it can't spawn on top of you
      title: 'TITANUS VORONOI'
    };
  }

  updateBoss(dt) {
    if (!this.boss) return;
    const b = this.boss;

    b.gyroAngle += b.rotSpeed * dt;

    if (b.arming > 0) {
      b.arming -= dt;
      return; // no attacks, no collisions, until it fully materializes
    }

    if (b.kind === 'pulsar') return this.updateBossPulsar(dt);
    if (b.kind === 'matrix') return this.updateBossMatrix(dt);
    return this.updateBossRing(dt);
  }

  updateBossPulsar(dt) {
    const b = this.boss;
    b.attackTimer += dt;
    if (b.hitShake > 0) b.hitShake = Math.max(0, b.hitShake - 0.8 * dt);

    // Speeds up as it takes damage: the fight tightens as you win it.
    const hurt = 1 - b.health / b.maxHealth;
    b.rotSpeed = 0.011 + hurt * 0.014;

    if (b.attackTimer >= b.attackInterval) {
      b.attackTimer = 0;
      this.engine.spawnShockwave(b.x, b.y, b.radius * 0.9, MONO_PALETTE, 2);
      if (this.audio) this.audio.playFireBlast();
      for (let i = 0; i < b.arms.length; i++) {
        const a = b.arms[i].angle + b.gyroAngle;
        this.engine.spawnElectricArc(
          b.x, b.y,
          b.x + Math.cos(a) * b.arms[i].length,
          b.y + Math.sin(a) * b.arms[i].length,
          '#ffffff', { forks: 2, jitter: 14, width: 1.5, decay: 0.08 }
        );
      }
    }

    // Collisions: the beams, then the core.
    const dx = this.player.x - b.x;
    const dy = this.player.y - b.y;
    const dist = Math.hypot(dx, dy);
    const pAngle = Math.atan2(dy, dx);

    if (dist <= b.coreR + this.player.radius) {
      if (this.player.isDashing) {
        this.damageBoss(this.player.x, this.player.y, this.player.radius + 6, 70);
        // Bounce out so a dash cannot park inside the core.
        this.player.vx = Math.cos(pAngle) * 12;
        this.player.vy = Math.sin(pAngle) * 12;
      } else {
        this.hitPlayer();
      }
      return;
    }

    if (dist <= b.radius) {
      for (let i = 0; i < b.arms.length; i++) {
        const arm = b.arms[i];
        if (dist > arm.length) continue;
        const aDiff = Math.abs(Math.atan2(
          Math.sin(pAngle - (arm.angle + b.gyroAngle)),
          Math.cos(pAngle - (arm.angle + b.gyroAngle))
        ));
        // Angular half-width shrinks with distance so the beam is a constant
        // thickness in pixels rather than a widening wedge.
        const halfSpan = Math.atan2(arm.width / 2 + this.player.radius, Math.max(1, dist));
        if (aDiff <= halfSpan && !this.player.isDashing) {
          this.hitPlayer();
          return;
        }
      }
    }
  }

  updateBossMatrix(dt) {
    const b = this.boss;
    b.attackTimer += dt;
    b.linkTimer += dt;

    let total = 0;
    const alive = [];
    for (let i = 0; i < b.nodes.length; i++) {
      const n = b.nodes[i];
      if (n.hitShake > 0) n.hitShake = Math.max(0, n.hitShake - 0.8 * dt);
      // Nodes counter-drift so the web keeps changing shape.
      n.angle += (i % 2 === 0 ? 0.0016 : -0.0026) * dt;
      if (!n.destroyed) { total += n.health; alive.push(n); }
    }
    b.health = total;

    // Live links crackle between surviving neighbours.
    if (b.linkTimer >= 14) {
      b.linkTimer = 0;
      for (let i = 0; i < alive.length; i++) {
        const p1 = this.matrixNodePos(b, alive[i]);
        const p2 = this.matrixNodePos(b, alive[(i + 1) % alive.length]);
        if (alive.length < 2) break;
        this.engine.spawnElectricArc(p1.x, p1.y, p2.x, p2.y, '#c8c8c8',
          { forks: 1, jitter: 12, width: 1, decay: 0.06 });
      }
    }

    if (b.attackTimer >= b.attackInterval) {
      b.attackTimer = 0;
      if (this.audio) this.audio.playFireBlast();
      for (let i = 0; i < alive.length; i += 2) {
        const p = this.matrixNodePos(b, alive[i]);
        const a = Math.atan2(this.player.y - p.y, this.player.x - p.x);
        this.hazards.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * 4.0, vy: Math.sin(a) * 4.0,
          radius: 11, type: 'meteor',
          rot: Math.random() * Math.PI * 2, rotSpeed: 0.05,
          vertices: [{ x: 9, y: 0 }, { x: 0, y: 9 }, { x: -9, y: 0 }, { x: 0, y: -9 }],
          texture: this.makeRockTexture(11),
          grazed: false
        });
      }
    }

    // Node contact.
    for (let i = 0; i < alive.length; i++) {
      const p = this.matrixNodePos(b, alive[i]);
      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) <= alive[i].r + this.player.radius) {
        if (this.player.isDashing) {
          this.damageBoss(p.x, p.y, this.player.radius + 6, 80);
        } else {
          this.hitPlayer();
        }
        return;
      }
    }

    // Link contact: shortest distance from the player to each live segment.
    if (!this.player.isDashing && alive.length >= 2) {
      for (let i = 0; i < alive.length; i++) {
        const p1 = this.matrixNodePos(b, alive[i]);
        const p2 = this.matrixNodePos(b, alive[(i + 1) % alive.length]);
        if (this.pointSegmentDist(this.player.x, this.player.y, p1, p2) <= this.player.radius + 4) {
          this.hitPlayer();
          return;
        }
      }
    }
  }

  /** Shortest distance from a point to the segment p1-p2. */
  pointSegmentDist(px, py, p1, p2) {
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return Math.hypot(px - p1.x, py - p1.y);
    let t = ((px - p1.x) * vx + (py - p1.y) * vy) / lenSq;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return Math.hypot(px - (p1.x + vx * t), py - (p1.y + vy * t));
  }

  updateBossRing(dt) {
    const b = this.boss;
    b.attackTimer += dt;

    let totalH = 0;
    for (let i = 0; i < b.segments.length; i++) {
      const seg = b.segments[i];
      if (seg.hitShake > 0) seg.hitShake = Math.max(0, seg.hitShake - 0.8 * dt);
      if (!seg.destroyed) totalH += seg.health;
    }
    b.health = totalH;

    // Periodic 1-Bit Solar Shockwave Attack
    if (b.attackTimer >= b.attackInterval) {
      b.attackTimer = 0;
      this.engine.spawnShockwave(b.x, b.y, b.radius * 1.4, '#ffffff');
      if (this.audio) this.audio.playFireBlast();

      for (let m = 0; m < 2; m++) {
        const mAngle = Math.random() * Math.PI * 2;
        this.hazards.push({
          x: b.x + Math.cos(mAngle) * (b.radius * 0.8),
          y: b.y + Math.sin(mAngle) * (b.radius * 0.8),
          vx: Math.cos(mAngle) * 4.2,
          vy: Math.sin(mAngle) * 4.2,
          radius: 12,
          type: 'meteor',
          rot: Math.random() * Math.PI * 2,
          rotSpeed: 0.05,
          vertices: [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }],
          grazed: false
        });
      }
    }

    // Player vs Boss Segments Collisions
    const pDistFromCenter = Math.hypot(this.player.x - b.x, this.player.y - b.y);
    const pAngleFromCenter = Math.atan2(this.player.y - b.y, this.player.x - b.x);

    for (let i = 0; i < b.segments.length; i++) {
      const seg = b.segments[i];
      if (seg.destroyed) continue;

      const segAngle = (seg.midAngle + b.gyroAngle) % (Math.PI * 2);
      const halfSpan = seg.span / 2;
      const angleDiff = Math.abs(Math.atan2(Math.sin(pAngleFromCenter - segAngle), Math.cos(pAngleFromCenter - segAngle)));

      if (angleDiff <= halfSpan + 0.1) {
        if (pDistFromCenter >= seg.innerR - this.player.radius && pDistFromCenter <= seg.outerR + this.player.radius) {
          if (this.player.isDashing) {
            seg.health -= 90;
            seg.hitShake = 16;
            this.hitStop = 4;
            this.engine.spawnExplosion(this.player.x, this.player.y, BOLT_PALETTE, 20);
            if (this.audio) this.audio.playExplosion(false);

            if (seg.health <= 0) {
              seg.destroyed = true;
              this.bumpCombo();
              this.awardScore(400, this.player.x, this.player.y - 24, 'PLATE CRUSHED!', 14);
              this.engine.spawnExplosion(this.player.x, this.player.y, MONO_PALETTE, 32);
            }

            if (b.segments.every((s) => s.destroyed)) {
              this.triggerBossDefeat();
              return;
            }
          } else {
            this.hitPlayer();
            return;
          }
        }
      }
    }
  }

  triggerBossDefeat() {
    if (!this.boss) return;
    const bx = this.boss.x;
    const by = this.boss.y;
    const br = this.boss.radius;
    const title = this.boss.title;

    this.boss = null;
    this.score += 5000;
    this.nextBossTime = this.survivalTime + 70;
    this.shield = Math.min(2, this.shield + 1); // breather reward
    this.hitStop = 8;
    this.screenFlash = 0.9;
    this.screenFlashColor = '#ffffff';
    if (this.audio) this.audio.playExplosion(true);
    this.engine.addTrauma(1.0);

    for (let s = 0; s < 4; s++) {
      this.engine.spawnShockwave(bx, by, br * (1.2 + s * 0.3), MONO_PALETTE);
    }
    this.engine.spawnRockShards(bx, by, '#ffffff', 30, 7);
    this.engine.spawnLightningBurst(bx, by, 18, br * 1.3, '#ffffff',
      { forks: 3, jitter: 30, width: 2, decay: 0.05 });
    this.engine.spawnPopup(bx, by - 50, `${title} DESTROYED  +5,000`, '#ffffff', 22);

    for (let r = 0; r < 6; r++) {
      this.spawnEnergyOrb();
    }
  }

  /* ---------------- MASTER GAME LOOP ---------------- */

  loop(currentTime) {
    const delta = Math.min(50, currentTime - this.lastTime);
    this.lastTime = currentTime;
    const rawDt = delta / 16.666;

    // Ease toward the target so slow-mo ramps in and out instead of snapping.
    // Dropping in is fast (you want the hit to register); coming back is slow.
    const rate = this.timeScaleTarget < this.timeScale ? 0.30 : 0.045;
    this.timeScale += (this.timeScaleTarget - this.timeScale) * rate * rawDt;

    // The storm runs on real frames while the world around it crawls.
    if (this.storm && this.state === 'PLAYING') this.updateStorm(rawDt);

    this.glow.update(rawDt);
    this.update(rawDt * this.timeScale);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.engine.update(dt);

    if (this.screenFlash > 0) {
      this.screenFlash = Math.max(0, this.screenFlash - 0.06 * dt);
    }

    // Zoom snaps in immediately then eases out. Runs outside the hit-stop
    // return below so the punch still reads while the game is frozen.
    this.zoomPunch = Math.max(0, this.zoomPunch - this.zoomPunch * 0.14 * dt - 0.0015 * dt);
    this.zoom = 1 + this.zoomPunch;

    if (this.state === 'PAUSED') return;

    this.spaceBg.update(dt, this.player.vx, this.player.vy);
    this.player.rotAngle += 0.04 * dt;

    if (this.state !== 'PLAYING') return;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    this.survivalTime += (dt * 16.666) / 1000;
    this.difficultyTimer += dt;

    // Passive drip, accumulated as a float so 144Hz doesn't score double 60Hz.
    this.scoreAcc += dt;
    const passive = Math.floor(this.scoreAcc);
    if (passive > 0) {
      this.score += passive;
      this.scoreAcc -= passive;
    }

    // Combo decay: stop taking risks and the multiplier bleeds back to x1.
    if (this.combo > 1) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo--;
        this.comboTimer = this.comboWindow * 0.6;
      }
    }

    if (this.player.invuln > 0) this.player.invuln -= dt;

    // Hull tint bleeds back to white unless it is being held.
    if (this.tintHold > 0) this.tintHold -= dt;
    else if (this.tint > 0) this.tint = Math.max(0, this.tint - this.tintDecay * dt);

    // First-run tutorial beats
    if (this.showHints && this.hintIdx < this.hints.length &&
        this.survivalTime >= this.hints[this.hintIdx].t) {
      this.engine.spawnPopup(this.width / 2, this.height * 0.16, this.hints[this.hintIdx].text, '#ffffff', 15);
      this.hintIdx++;
    }

    // Boss Spawner (time-gated: score inflates, clock doesn't)
    if (this.survivalTime >= this.nextBossTime && !this.boss) {
      this.spawnBoss();
    }

    if (this.boss) {
      this.updateBoss(dt);
    }

    // Hazard Spawner: 1.7s gaps at the start, decaying to ~0.25s past 90s.
    const spawnInterval = Math.max(15, 100 * Math.pow(0.978, this.survivalTime));
    if (this.difficultyTimer >= spawnInterval) {
      this.difficultyTimer = 0;
      this.spawnEdgeHazard();
      // Doubles only once you've had time to learn the single-rock rhythm.
      const doubleChance = Math.min(0.5, (this.survivalTime - 35) * 0.012);
      if (doubleChance > 0 && Math.random() < doubleChance) {
        this.spawnEdgeHazard();
      }
    }

    // Movement & Counter-Strafing
    let ax = 0, ay = 0;
    const keyLeft = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const keyRight = this.keys['KeyD'] || this.keys['ArrowRight'];
    const keyUp = this.keys['KeyW'] || this.keys['ArrowUp'];
    const keyDown = this.keys['KeyS'] || this.keys['ArrowDown'];

    if (keyUp) ay -= 1;
    if (keyDown) ay += 1;
    if (keyLeft) ax -= 1;
    if (keyRight) ax += 1;

    if (this.player.vx > 0.4 && keyLeft) this.player.vx -= this.player.counterBrakeForce * dt;
    else if (this.player.vx < -0.4 && keyRight) this.player.vx += this.player.counterBrakeForce * dt;
    else if (ax !== 0) this.player.vx += ax * this.player.accel * dt;

    if (this.player.vy > 0.4 && keyUp) this.player.vy -= this.player.counterBrakeForce * dt;
    else if (this.player.vy < -0.4 && keyDown) this.player.vy += this.player.counterBrakeForce * dt;
    else if (ay !== 0) this.player.vy += ay * this.player.accel * dt;

    if (ax !== 0 || ay !== 0) this.player.facingAngle = Math.atan2(ay, ax);

    this.player.vx *= Math.pow(this.player.friction, dt);
    this.player.vy *= Math.pow(this.player.friction, dt);

    if (this.player.isDashing) {
      this.player.dashDuration -= dt;
      this.engine.spawnTrail(this.player.x, this.player.y, BOLT_PALETTE, 3);
      if (this.player.dashDuration <= 0) this.player.isDashing = false;
    }

    // Overdrive melts cooldowns: dash is free, blast recharges 5x.
    const cdRate = this.overdrive > 0 ? 5 : 1;
    if (this.overdrive > 0) this.player.dashCooldown = 0;

    if (this.player.dashCooldown > 0) {
      this.player.dashCooldown -= dt * cdRate;
      if (this.player.dashCooldown <= 0) {
        this.player.dashCooldown = 0;
        if (this.audio) this.audio.playDashReady();
        // Recharge = the vessel visibly takes the charge.
        this.engine.spawnLightningBurst(this.player.x, this.player.y, 9, 78, BOLT_PALETTE[3], { forks: 2, width: 1 });
        this.engine.spawnShockwave(this.player.x, this.player.y, 70, BOLT_PALETTE, 1.5);
        this.engine.spawnPopup(this.player.x, this.player.y - 30, 'DASH READY', '#ffffff', 13);
        this.punch({ trauma: 0.25, zoom: 0.025, flash: 0.22, color: '#00ffff' });
      }
    }

    if (this.player.blastCooldown > 0) {
      this.player.blastCooldown -= dt * cdRate;
      if (this.player.blastCooldown <= 0) {
        this.player.blastCooldown = 0;
        if (this.audio) this.audio.playBlastReady();
        this.engine.spawnLightningBurst(this.player.x, this.player.y, 9, 86, FIRE_PALETTE[2], { forks: 2, width: 1 });
        this.engine.spawnShockwave(this.player.x, this.player.y, 80, FIRE_PALETTE, 1.5);
        this.engine.spawnPopup(this.player.x, this.player.y - 30, 'BLAST READY', '#ffffff', 13);
        this.punch({ trauma: 0.25, zoom: 0.025, flash: 0.22, color: '#ff6600' });
      }
    }

    // Charged idle crackle: while a power is up, arcs lick around the hull so
    // you can feel it's available without reading the gauge.
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 7 + Math.random() * 9;
      const dashUp = this.player.dashCooldown <= 0;
      const blastUp = this.player.blastCooldown <= 0;
      if (dashUp || blastUp) {
        const useBolt = dashUp && (!blastUp || Math.random() < 0.5);
        const a = Math.random() * Math.PI * 2;
        const r0 = this.player.radius + 2;
        const r1 = this.player.radius + 12 + Math.random() * 12;
        this.engine.spawnElectricArc(
          this.player.x + Math.cos(a) * r0, this.player.y + Math.sin(a) * r0,
          this.player.x + Math.cos(a + 1.4) * r1, this.player.y + Math.sin(a + 1.4) * r1,
          useBolt ? BOLT_PALETTE[3] : FIRE_PALETTE[2],
          { forks: 1, jitter: 7, width: 0.8, decay: 0.22 }
        );
      }
    }

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    const r = this.player.radius;
    if (this.player.x < r) { this.player.x = r; this.player.vx = 0; }
    else if (this.player.x > this.width - r) { this.player.x = this.width - r; this.player.vx = 0; }
    if (this.player.y < r) { this.player.y = r; this.player.vy = 0; }
    else if (this.player.y > this.height - r) { this.player.y = this.height - r; this.player.vy = 0; }

    const speedSq = this.player.vx * this.player.vx + this.player.vy * this.player.vy;
    if (speedSq > 1.4) {
      this.engine.spawnTrail(this.player.x, this.player.y, '#ffffff', 2);
    }

    // Update Energy Orbs
    for (let i = this.energyOrbs.length - 1; i >= 0; i--) {
      const orb = this.energyOrbs[i];
      orb.pulse += 0.08 * dt;
      orb.rot += 0.04 * dt;

      const odx = this.player.x - orb.x;
      const ody = this.player.y - orb.y;
      const orbDistSq = odx * odx + ody * ody;
      const touchRadiusSq = (this.player.radius + orb.radius) * (this.player.radius + orb.radius);

      if (orbDistSq < touchRadiusSq) {
        this.energyOrbs.splice(i, 1);
        this.orbsCollected++;
        this.orbCharge++;
        this.bumpCombo();
        this.awardScore(250, orb.x, orb.y, 'ORB', 14);
        this.player.dashCooldown = Math.max(0, this.player.dashCooldown - 35);
        this.player.blastCooldown = Math.max(0, this.player.blastCooldown - 45);

        // Flood the shell with this step's colour.
        this.tint = 1;
        this.tintHold = 0;
        this.tintColor = this.chargeRamp[Math.min(this.chargeRamp.length - 1, this.orbCharge - 1)];

        // Pitch climbs with the charge; the 10th resolves and fires the storm.
        if (this.orbCharge >= this.orbsPerStorm) {
          this.orbCharge = 0;
          this.triggerChainStorm();
        } else {
          if (this.audio) this.audio.playOrbPitch(this.orbCharge, this.orbsPerStorm);
          // Ring pulse gets tighter and brighter as the charge fills.
          const pct = this.orbCharge / this.orbsPerStorm;
          this.engine.spawnShockwave(this.player.x, this.player.y, 50 + pct * 90, MONO_PALETTE, 1 + pct * 1.2);
          this.punch({ trauma: 0.1 + pct * 0.25, zoom: 0.012 + pct * 0.04 });
        }

        this.engine.spawnExplosion(orb.x, orb.y, MONO_PALETTE, 14);

        if (this.orbsCollected % this.orbsPerShield === 0 && this.shield < 2) {
          this.shield++;
          this.engine.spawnShockwave(this.player.x, this.player.y, 90, BOLT_PALETTE);
          this.engine.spawnPopup(this.player.x, this.player.y - 34, 'SHIELD RESTORED', '#ffffff', 16);
          if (this.audio) this.audio.playBlastReady();
        }
        this.spawnEnergyOrb();
      }
    }

    // Tri-colour powerup: one per 1000 points earned.
    if (this.score >= this.nextPowerupScore) {
      this.nextPowerupScore += this.powerupStep;
      if (this.powerups.length < 2) this.spawnPowerup();
    }

    if (this.overdrive > 0) {
      this.overdrive -= dt;
      if (this.overdrive <= 0) {
        this.overdrive = 0;
        this.engine.spawnPopup(this.player.x, this.player.y - 40, 'OVERDRIVE OVER', '#ffffff', 14);
      } else if (Math.random() < 0.5 * dt) {
        // Constant tri-colour crackle while it's live.
        const a = Math.random() * Math.PI * 2;
        const c = TRI_PALETTE[(Math.random() * TRI_PALETTE.length) | 0];
        this.engine.spawnElectricArc(
          this.player.x, this.player.y,
          this.player.x + Math.cos(a) * 46, this.player.y + Math.sin(a) * 46,
          c, { forks: 1, jitter: 10, width: 1, decay: 0.2 }
        );
      }
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.rot += 0.05 * dt;
      p.pulse += 0.10 * dt;
      p.bob += 0.06 * dt;
      p.lifetime -= dt;

      if (p.lifetime <= 0) { this.powerups.splice(i, 1); continue; }

      const pdx = this.player.x - p.x;
      const pdy = this.player.y - p.y;
      const touch = this.player.radius + (p.hitR || p.radius);
      if (pdx * pdx + pdy * pdy < touch * touch) {
        this.collectPowerup(p);
        this.powerups.splice(i, 1);
      }
    }

    // Supernova Nuke Spawner & Update
    this.nukeSpawnTimer += dt;
    if (this.nukeSpawnTimer >= 1500 && this.survivalTime > 30) {
      this.nukeSpawnTimer = 0;
      if (this.nukePowerups.length < 1) {
        this.spawnNukePowerup();
      }
    }

    for (let i = this.nukePowerups.length - 1; i >= 0; i--) {
      const nuke = this.nukePowerups[i];
      nuke.pulse += 0.09 * dt;
      nuke.rot += 0.05 * dt;
      nuke.lifetime -= dt;

      if (nuke.lifetime <= 0) {
        this.nukePowerups.splice(i, 1);
        continue;
      }

      const ndx = this.player.x - nuke.x;
      const ndy = this.player.y - nuke.y;
      const nukeDistSq = ndx * ndx + ndy * ndy;
      const touchRadiusSq = (this.player.radius + nuke.radius) * (this.player.radius + nuke.radius);

      if (nukeDistSq < touchRadiusSq) {
        this.triggerSupernovaNuke(nuke.x, nuke.y);
        this.nukePowerups.splice(i, 1);
      }
    }

    // Update Hazards & Collisions
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.rot += h.rotSpeed * dt;

      if (h.type === 'seeker') {
        const targetAngle = Math.atan2(this.player.y - h.y, this.player.x - h.x);
        h.vx += Math.cos(targetAngle) * 0.12 * dt;
        h.vy += Math.sin(targetAngle) * 0.12 * dt;
        const curSSq = h.vx * h.vx + h.vy * h.vy;
        const maxS = 4.0;
        if (curSSq > maxS * maxS) {
          const curS = Math.sqrt(curSSq);
          h.vx = (h.vx / curS) * maxS;
          h.vy = (h.vy / curS) * maxS;
        }
      }

      h.x += h.vx * dt;
      h.y += h.vy * dt;

      const dx = this.player.x - h.x;
      const dy = this.player.y - h.y;
      const distSq = dx * dx + dy * dy;

      const colDist = this.player.radius + h.radius;
      const colDistSq = colDist * colDist;
      const grazeDist = colDist + 22;
      const grazeDistSq = grazeDist * grazeDist;

      if (!h.grazed && distSq < grazeDistSq && distSq > colDistSq) {
        h.grazed = true;
        this.runGrazes++;
        this.bumpCombo();
        this.awardScore(100, this.player.x, this.player.y, 'GRAZE', 12);
        if (this.audio) this.audio.playGraze();
        // Cap arcs so a dense wave doesn't white out a 1-bit screen.
        if (this.engine.electricArcs.length < 5) {
          this.engine.spawnElectricArc(this.player.x, this.player.y, h.x, h.y, '#ffffff');
        }
      }

      if (distSq <= colDistSq) {
        if (this.player.isDashing) {
          this.hazards.splice(i, 1);
          this.runVaporized++;
          this.bumpCombo();
          this.awardScore(150, h.x, h.y, 'DASH SMASH!', 14);
          this.hitStop = 3;
          this.engine.spawnExplosion(h.x, h.y, BOLT_PALETTE, 20);
          if (this.audio) this.audio.playExplosion(false);
          continue;
        } else if (this.player.invuln <= 0) {
          this.hitPlayer();
          break;
        }
      }

      if (h.x < -80 || h.x > this.width + 80 || h.y < -80 || h.y > this.height + 80) {
        this.hazards.splice(i, 1);
      }
    }
  }

  triggerGameOver() {
    this.state = 'GAMEOVER';
    if (this.audio) this.audio.playExplosion(true);
    this.engine.addTrauma(0.95);
    this.screenFlash = 0.8;
    this.screenFlashColor = '#ffffff';
    this.hitStop = 6;
    this.engine.spawnExplosion(this.player.x, this.player.y, MONO_PALETTE, 40);

    const recordResult = this.leaderboard.recordRun(
      this.score,
      this.survivalTime,
      this.runGrazes,
      this.runBlasts,
      this.runDashes,
      this.runVaporized
    );

    this.highScore = this.leaderboard.stats.highScore;

    const overlay = document.getElementById('survivalOverlay');
    if (overlay) {
      document.getElementById('overlayTitle').textContent = 'ANOMALY TERMINATED';
      document.getElementById('overlayScore').textContent = this.score.toLocaleString();
      document.getElementById('overlayTime').textContent = `${this.survivalTime.toFixed(2)}s`;
      document.getElementById('overlayPB').textContent = this.highScore.toLocaleString();
      document.getElementById('overlayCombo').textContent = `x${this.runBestCombo}`;
      document.getElementById('overlayRank').textContent = `#${recordResult.rank} (${recordResult.tier.toUpperCase()})`;
      document.getElementById('btnStartAction').textContent = 'RETRY RUN (SPACE / R)';
      overlay.classList.remove('hidden');
    }
  }

  /* ---------------- 1-BIT RENDERING ---------------- */

  render() {
    const ctx = this.ctx;

    // 1. Starfield. Drawn at identity BEFORE shake/zoom: a transformed
    // full-screen clear no longer covers the edges, which would leave
    // uncleared strips smearing at the borders.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.spaceBg.render(ctx);

    ctx.save();
    ctx.translate(this.engine.shakeOffsetX, this.engine.shakeOffsetY);

    // Zoom punch, anchored on the player so the snap is centred on the action.
    if (this.zoom !== 1) {
      const ax = this.player.x;
      const ay = this.player.y;
      ctx.translate(ax, ay);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-ax, -ay);
    }

    // 2. Shockwaves. Arcs are drawn later, on top of the world.
    this.engine.renderShockwaves(ctx);

    // 3. 1-Bit Colossal Titan Ring Boss
    this.renderBoss(ctx);

    // 4. Shards & Debris
    this.engine.renderShards(ctx);

    // 5. 1-Bit Energy Orbs (Pulsing Pixel Diamonds)
    for (let i = 0; i < this.energyOrbs.length; i++) {
      const orb = this.energyOrbs[i];
      const px = Math.floor(orb.x);
      const py = Math.floor(orb.y);
      const r = Math.floor(orb.radius * (1 + Math.sin(orb.pulse) * 0.15));

      ctx.save();
      ctx.translate(px, py);

      // Plain white circle. No halo, no centre pip - it is a collectible,
      // not a power, so it carries no colour.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 6. 1-Bit Supernova Nuke Powerups
    for (let i = 0; i < this.nukePowerups.length; i++) {
      const nuke = this.nukePowerups[i];
      const px = Math.floor(nuke.x);
      const py = Math.floor(nuke.y);
      const r = Math.floor(nuke.radius * (1 + Math.sin(nuke.pulse) * 0.18));

      ctx.save();
      ctx.translate(px, py);

      // Radiation trefoil: three fat fire-coloured blades around a hollow hub,
      // spinning, with a warning ring of ticks. Reads as "nuke" instantly.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + Math.sin(nuke.pulse) * 0.2;
      ctx.drawImage(this.engine.getGlow('#ff5000'), -r * 3, -r * 3, r * 6, r * 6);
      ctx.restore();

      ctx.save();
      ctx.rotate(nuke.rot);

      for (let b = 0; b < 3; b++) {
        ctx.save();
        ctx.rotate((b * Math.PI * 2) / 3);
        ctx.fillStyle = b === 0 ? '#ffd400' : (b === 1 ? '#ff9500' : '#ff3000');
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.34);
        ctx.arc(0, 0, r, -Math.PI / 2 - 0.52, -Math.PI / 2 + 0.52);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Hollow hub: ring, not a filled dot.
      ctx.strokeStyle = '#ffd400';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Counter-rotating warning ticks.
      ctx.save();
      ctx.rotate(-nuke.rot * 0.7);
      ctx.fillStyle = '#ffffff';
      for (let t = 0; t < 12; t++) {
        const a = (t * Math.PI * 2) / 12;
        ctx.fillRect(Math.floor(Math.cos(a) * (r + 7)), Math.floor(Math.sin(a) * (r + 7)), 2, 2);
      }
      ctx.restore();

      ctx.restore();
    }

    // 6b. TRI-COLOUR POWERUP.
    // Drawn smooth and glowing on purpose - it is the single loudest object on
    // screen, and it obeys none of the pixel rules the world does.
    for (let i = 0; i < this.powerups.length; i++) {
      const p = this.powerups[i];
      const bobY = Math.sin(p.bob) * 3;
      const scale = 1 + Math.sin(p.pulse) * 0.10;
      // Deliberately tiny: three small pixels orbiting a point, not a big wheel.
      const R = p.radius * scale * 0.42;
      // Blink out when it's about to expire.
      const dying = p.lifetime < 180 && Math.floor(p.lifetime / 6) % 2 === 0;

      ctx.save();
      ctx.translate(p.x, p.y + bobY);
      if (dying) ctx.globalAlpha = 0.3;
      ctx.globalCompositeOperation = 'lighter';

      // Three chunky pixels on the corners of a triangle, spinning as a unit.
      // Nothing in the middle - the centre stays empty on purpose.
      const px3 = Math.max(2, Math.floor(R * 0.55));
      for (let c = 0; c < 3; c++) {
        const a = p.rot + (c * Math.PI * 2) / 3;
        const cx = Math.cos(a) * R;
        const cy = Math.sin(a) * R;
        const col = TRI_PALETTE[c];

        // Glow under each pixel.
        ctx.globalAlpha = (dying ? 0.3 : 1) * 0.65;
        ctx.drawImage(this.engine.getGlow(col), cx - px3 * 1.6, cy - px3 * 1.6, px3 * 3.2, px3 * 3.2);

        // Hard pixel on top.
        ctx.globalAlpha = dying ? 0.3 : 1;
        ctx.fillStyle = col;
        ctx.fillRect(Math.floor(cx - px3 / 2), Math.floor(cy - px3 / 2), px3, px3);
      }

      // Faint triangle joining them, so the three read as one object.
      ctx.globalAlpha = (dying ? 0.3 : 1) * 0.5;
      ctx.strokeStyle = TRI_PALETTE[Math.floor(p.pulse) % 3];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < 3; c++) {
        const a = p.rot + (c * Math.PI * 2) / 3;
        const cx = Math.cos(a) * R;
        const cy = Math.sin(a) * R;
        if (c === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 7. Hazards.
    //
    // In 1-bit, VALUE is the threat hierarchy - there is no colour to spend, so
    // how much white a thing occupies is how dangerous it reads. Silhouettes
    // are kept distinct so type is legible from shape alone at speed:
    //   METEOR - hollow, faceted, irregular   (dumb, drifts)
    //   HEAVY  - hollow, armoured, geometric  (slow, big, obvious)
    //   SEEKER - SOLID WHITE dart + reticle   (hunts you: highest contrast)
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      const px = Math.floor(h.x);
      const py = Math.floor(h.y);

      ctx.save();
      ctx.translate(px, py);

      if (h.type === 'seeker') {
        // A dark manta, not an arrow. Pitch black body, and the only white is
        // a rim on the leading edge plus a faint halo behind it - without that
        // hint it would be invisible against black space.
        ctx.rotate(Math.atan2(h.vy, h.vx));
        const R = h.radius;

        // Hint of a white shadow bleeding out from under the hull.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.30;
        ctx.drawImage(this.engine.getGlow('#ffffff'), -R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
        ctx.restore();

        // Swept crescent body.
        const body = () => {
          ctx.beginPath();
          ctx.moveTo(R * 1.35, 0);
          ctx.quadraticCurveTo(R * 0.2, -R * 0.5, -R * 1.15, -R * 1.0);
          ctx.quadraticCurveTo(-R * 0.35, 0, -R * 1.15, R * 1.0);
          ctx.quadraticCurveTo(R * 0.2, R * 0.5, R * 1.35, 0);
          ctx.closePath();
        };

        ctx.fillStyle = '#000000';
        body();
        ctx.fill();

        // Rim light on the leading edge only.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(R * 1.35, 0);
        ctx.quadraticCurveTo(R * 0.2, -R * 0.5, -R * 1.15, -R * 1.0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(R * 1.35, 0);
        ctx.quadraticCurveTo(R * 0.2, R * 0.5, -R * 1.15, R * 1.0);
        ctx.stroke();

        // Two dim eyes. Not centred, so there is no dot in the middle.
        ctx.fillStyle = '#9a9a9a';
        ctx.fillRect(Math.floor(R * 0.45), -Math.floor(R * 0.30) - 1, 2, 2);
        ctx.fillRect(Math.floor(R * 0.45), Math.floor(R * 0.30) - 1, 2, 2);

      } else if (h.type === 'heavy') {
        ctx.rotate(h.rot);
        const R = h.radius;
        const tex = h.texture;

        // Outer armour belt: thick plates with gaps.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        for (let s = 0; s < 6; s++) {
          const a0 = (s * Math.PI * 2) / 6 + 0.14;
          const a1 = ((s + 1) * Math.PI * 2) / 6 - 0.14;
          ctx.beginPath();
          ctx.arc(0, 0, R * 0.92, a0, a1);
          ctx.stroke();
        }

        // Radial struts tying the belt to the core.
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (s * Math.PI * 2) / 6;
          ctx.moveTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55);
          ctx.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
        }
        ctx.stroke();

        // Core hull.
        ctx.fillStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const a = (v * Math.PI * 2) / 6 + Math.PI / 6;
          const rr = R * 0.58;
          if (v === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Hatch grille across the core - offset so nothing sits dead centre.
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let l = -1; l <= 1; l++) {
          const yy = l * R * 0.22 + R * 0.11;
          ctx.moveTo(-R * 0.34, yy);
          ctx.lineTo(R * 0.34, yy);
        }
        ctx.stroke();

        // Rivets on the belt.
        ctx.fillStyle = '#ffffff';
        for (let s = 0; s < 6; s++) {
          const a = (s * Math.PI * 2) / 6 + Math.PI / 6;
          ctx.fillRect(Math.floor(Math.cos(a) * R * 0.92) - 1, Math.floor(Math.sin(a) * R * 0.92) - 1, 3, 3);
        }

        // Surface grain.
        if (tex) {
          ctx.fillStyle = '#8a8a8a';
          for (let i = 0; i < tex.stipple.length; i += 2) {
            const d = tex.stipple[i];
            ctx.fillRect(Math.floor(d.x * 0.5), Math.floor(d.y * 0.5), d.s, d.s);
          }
        }

      } else {
        ctx.rotate(h.rot);
        const tex = h.texture;

        // Rough rock: black fill, white outline.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(h.vertices[0].x, h.vertices[0].y);
        for (let v = 1; v < h.vertices.length; v++) {
          ctx.lineTo(h.vertices[v].x, h.vertices[v].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Clip the detail to the rock so texture never spills past the edge.
        ctx.save();
        ctx.clip();

        // Terminator line: one shaded flank, giving the rock a light direction.
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(-h.radius * 1.5, -h.radius * 1.5);
        ctx.lineTo(h.radius * 1.5, -h.radius * 1.5);
        ctx.lineTo(-h.radius * 1.5, h.radius * 1.5);
        ctx.closePath();
        ctx.fill();

        if (tex) {
          // Craters: a bright rim arc and a dark floor, so they read as dents.
          for (let i = 0; i < tex.craters.length; i++) {
            const cr = tex.craters[i];
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cr.x, cr.y, cr.r, Math.PI * 0.75, Math.PI * 1.9);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.beginPath();
            ctx.arc(cr.x, cr.y, cr.r * 0.72, Math.PI * 1.9, Math.PI * 0.75);
            ctx.stroke();
          }

          // Grain.
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          for (let i = 0; i < tex.stipple.length; i++) {
            const d = tex.stipple[i];
            ctx.fillRect(Math.floor(d.x), Math.floor(d.y), d.s, d.s);
          }
        }

        // Fracture lines from the rim inward, stopping short of the middle.
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let v = 0; v < h.vertices.length; v += 3) {
          ctx.moveTo(h.vertices[v].x * 0.95, h.vertices[v].y * 0.95);
          ctx.lineTo(h.vertices[v].x * 0.30, h.vertices[v].y * 0.30);
        }
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    }

    // 8. Energy layer, on top of the world so bolts never hide behind a rock.
    // During a storm the world is dimmed first, so the chain is the only thing
    // the eye can land on.
    if (this.storm) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-this.width, -this.height, this.width * 3, this.height * 3);
      ctx.restore();
    }

    this.engine.renderParticles(ctx);
    this.engine.renderStreaks(ctx);
    this.engine.renderElectricArcs(ctx);

    // 9. 1-BIT PLAYER CRAFT (Geometric Pixel Orb with Crosshair & Charge Brackets)
    if (this.state === 'PLAYING' || this.state === 'MENU' || this.state === 'PAUSED') {
      const px = Math.floor(this.player.x);
      const py = Math.floor(this.player.y);
      const r = this.player.radius;

      // Blink out on alternating frames while invulnerable.
      const blinking = this.player.invuln > 0 && Math.floor(this.player.invuln / 4) % 2 === 0;

      ctx.save();
      ctx.translate(px, py);
      if (blinking) ctx.globalAlpha = 0.25;

      // Shield: solid pixel ring around the hull.
      for (let s = 0; s < this.shield; s++) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 9 + s * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // A. Outer Concentric Charge Brackets
      const blastPct = Math.max(0, 1 - (this.player.blastCooldown / this.player.blastMaxCooldown));
      const dashPct = Math.max(0, 1 - (this.player.dashCooldown / this.player.dashMaxCooldown));

      // Blast Ring: white while charging, fire-orange the moment it's usable.
      if (blastPct > 0) {
        ctx.strokeStyle = blastPct >= 1 ? '#ff6600' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + blastPct * Math.PI * 2);
        ctx.stroke();
      }

      // Dash Bracket: cyan corner pixels mean the bolt is charged.
      if (dashPct >= 1) {
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(-r - 6, -r - 6, 3, 3);
        ctx.fillRect(r + 4, -r - 6, 3, 3);
        ctx.fillRect(-r - 6, r + 4, 3, 3);
        ctx.fillRect(r + 4, r + 4, 3, 3);
      }

      // B. HULL - an orb whose shell carries the charge colour.
      // Every orb eaten floods the shell; it bleeds back to white on its own,
      // so how lit up you are is a live readout of the storm charge.
      const moving = Math.hypot(this.player.vx, this.player.vy) > 0.5;
      const heading = moving
        ? Math.atan2(this.player.vy, this.player.vx)
        : this.player.facingAngle;

      const tinted = this.tint > 0.01;
      const edge = this.player.isDashing ? '#00ffff' : '#ffffff';

      // Charge aura, strongest right after a pickup.
      if (tinted) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.tint * 0.55;
        const aw = r * (3.0 + this.tint * 1.2);
        ctx.drawImage(this.engine.getGlow(this.tintColor), -aw / 2, -aw / 2, aw, aw);
        ctx.restore();
      }

      // Thruster plume opposite the heading.
      if (moving) {
        const thrust = Math.min(1, Math.hypot(this.player.vx, this.player.vy) / 6);
        ctx.save();
        ctx.rotate(heading);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 + thrust * 0.45;
        const fw = r * (1.0 + thrust * 1.3);
        ctx.drawImage(
          this.engine.getGlow(this.player.isDashing ? '#00e0ff' : '#ffffff'),
          -r * 1.3 - fw / 2, -fw / 2, fw, fw
        );
        ctx.restore();
      }

      // Shell.
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Charge overlay on the shell itself.
      if (tinted) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.tint;
        ctx.strokeStyle = this.tintColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner band fills as the charge nears full.
        ctx.globalAlpha = this.tint * 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Counter-rotating shell plates - keeps the orb from reading as a
      // featureless ball, with nothing at the centre.
      ctx.save();
      ctx.rotate(this.player.rotAngle);
      ctx.strokeStyle = tinted ? this.tintColor : edge;
      ctx.lineWidth = 2;
      for (let q = 0; q < 3; q++) {
        const a0 = (q * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, a0, a0 + 0.9);
        ctx.stroke();
      }
      ctx.restore();

      // Heading pip on the rim, so travel direction is still readable.
      ctx.save();
      ctx.rotate(heading);
      ctx.fillStyle = edge;
      ctx.fillRect(Math.floor(r - 3), -2, 5, 4);
      ctx.restore();

      ctx.restore();
    }

    this.engine.renderPopups(ctx);
    ctx.restore();

    // 10. Screen Invert Flash on Detonation
    if (this.screenFlash > 0) {
      ctx.save();
      // 'lighter' adds light rather than painting over, so the black stays
      // black and only the lit parts bloom. Painting washed the whole frame.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.screenFlashColor;
      ctx.globalAlpha = this.screenFlash * 0.22;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // 11. HUD
    if (this.state === 'PLAYING' || this.state === 'PAUSED') {
      this.renderHUD(ctx);
    }

    // 12. Bloom pass (draws to its own overlay canvas)
    this.glow.apply();
  }

  renderBoss(ctx) {
    if (!this.boss) return;
    if (this.boss.kind === 'pulsar') return this.renderBossPulsar(ctx);
    if (this.boss.kind === 'matrix') return this.renderBossMatrix(ctx);
    return this.renderBossRing(ctx);
  }

  renderBossPulsar(ctx) {
    const b = this.boss;
    const arming = b.arming > 0;
    const blink = arming && Math.floor(b.arming / 6) % 2 === 0;

    ctx.save();
    ctx.translate(b.x, b.y);
    if (arming) ctx.globalAlpha = blink ? 0.85 : 0.3;

    // Beam arms.
    for (let i = 0; i < b.arms.length; i++) {
      const arm = b.arms[i];
      const a = arm.angle + b.gyroAngle;

      ctx.save();
      ctx.rotate(a);

      // Glow underlay.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.coreR, -arm.width, arm.length - b.coreR, arm.width * 2);
      ctx.restore();

      // Chunky pixel beam: blocks marching outward, hotter near the core.
      const step = 10;
      for (let d = b.coreR; d < arm.length; d += step) {
        const t = (d - b.coreR) / (arm.length - b.coreR);
        ctx.fillStyle = MONO_PALETTE[Math.min(MONO_PALETTE.length - 1, 1 + Math.floor(t * 4))];
        const hw = arm.width * (1 - t * 0.35);
        ctx.fillRect(Math.floor(d), Math.floor(-hw / 2), step - 2, Math.floor(hw));
      }
      ctx.restore();
    }

    // Core: hollow rings, no centre dot.
    const shake = b.hitShake > 0 ? (Math.random() - 0.5) * 5 : 0;
    ctx.translate(shake, shake);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.6;
    ctx.drawImage(this.engine.getGlow('#ffffff'), -b.coreR * 2, -b.coreR * 2, b.coreR * 4, b.coreR * 4);
    ctx.restore();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, b.coreR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, b.coreR * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating shutter blades on the core.
    ctx.save();
    ctx.rotate(-b.gyroAngle * 2.4);
    ctx.fillStyle = '#ffffff';
    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI * 2) / 6;
      ctx.fillRect(
        Math.floor(Math.cos(a) * b.coreR * 0.80) - 2,
        Math.floor(Math.sin(a) * b.coreR * 0.80) - 2, 5, 5
      );
    }
    ctx.restore();
    ctx.restore();
  }

  renderBossMatrix(ctx) {
    const b = this.boss;
    const arming = b.arming > 0;
    const blink = arming && Math.floor(b.arming / 6) % 2 === 0;

    ctx.save();
    if (arming) ctx.globalAlpha = blink ? 0.85 : 0.3;

    const alive = b.nodes.filter((n) => !n.destroyed);

    // Link lines between live neighbours. The crackling bolts are spawned in
    // update; this is the steady rail underneath them.
    if (alive.length >= 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < alive.length; i++) {
        const p1 = this.matrixNodePos(b, alive[i]);
        const p2 = this.matrixNodePos(b, alive[(i + 1) % alive.length]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    }

    for (let i = 0; i < b.nodes.length; i++) {
      const n = b.nodes[i];
      const p = this.matrixNodePos(b, n);

      ctx.save();
      ctx.translate(p.x, p.y);

      if (n.destroyed) {
        // Burnt-out husk.
        ctx.strokeStyle = '#4a4a4a';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, n.r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        continue;
      }

      if (n.hitShake > 0) ctx.translate((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.5;
      ctx.drawImage(this.engine.getGlow('#ffffff'), -n.r * 2, -n.r * 2, n.r * 4, n.r * 4);
      ctx.restore();

      // Hexagonal cell, hollow, with a health arc around it.
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let v = 0; v < 6; v++) {
        const a = (v * Math.PI * 2) / 6 + b.gyroAngle * 2;
        if (v === 0) ctx.moveTo(Math.cos(a) * n.r, Math.sin(a) * n.r);
        else ctx.lineTo(Math.cos(a) * n.r, Math.sin(a) * n.r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, n.r + 5, -Math.PI / 2, -Math.PI / 2 + (n.health / n.maxHealth) * Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }

  renderBossRing(ctx) {
    const b = this.boss;
    const bx = Math.floor(b.x);
    const by = Math.floor(b.y);

    ctx.save();
    ctx.translate(bx, by);

    // 1. Central 1-Bit Wireframe Star Core
    ctx.save();
    ctx.rotate(b.gyroAngle * 0.5);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);

    const numSpokes = 8;
    ctx.beginPath();
    for (let s = 0; s < numSpokes; s++) {
      const a = (s * Math.PI * 2) / numSpokes;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * (b.radius * 0.7), Math.sin(a) * (b.radius * 0.7));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 2. 16 Segmented 1-Bit Tectonic Plates
    ctx.save();
    ctx.rotate(b.gyroAngle);

    // Arming telegraph: dashed and blinking, harmless. Get out of the ring.
    if (b.arming > 0) {
      ctx.globalAlpha = Math.floor(b.arming / 6) % 2 === 0 ? 1 : 0.35;
      ctx.setLineDash([5, 5]);
    }

    for (let i = 0; i < b.segments.length; i++) {
      const seg = b.segments[i];
      const halfSpan = seg.span / 2;
      const startA = seg.midAngle - halfSpan;
      const endA = seg.midAngle + halfSpan;

      if (seg.destroyed) {
        // Broken dashed bracket
        ctx.strokeStyle = '#555555';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, seg.innerR, startA, endA);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      ctx.save();
      if (seg.hitShake > 0) {
        ctx.rotate((Math.random() - 0.5) * 0.05);
      }

      // Plate Outline Box
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#000000';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(0, 0, seg.outerR, startA, endA);
      ctx.lineTo(Math.cos(endA) * seg.innerR, Math.sin(endA) * seg.innerR);
      ctx.arc(0, 0, seg.innerR, endA, startA, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner Checkerboard Hatch
      const midA = seg.midAngle;
      const midR = (seg.innerR + seg.outerR) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.cos(midA) * midR - 1, Math.sin(midA) * midR - 1, 2, 2);

      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  renderHUD(ctx) {
    ctx.save();
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.fillStyle = '#ffffff';

    // Top-Left Stats
    ctx.fillText(`SCORE: ${this.score.toString().padStart(6, '0')}`, 20, 32);
    ctx.fillText(`TIME : ${this.survivalTime.toFixed(1)}S`, 20, 52);
    ctx.fillText(`GRAZE: ${this.runGrazes}`, 20, 72);
    ctx.fillText(`SHIELD: ${'[#]'.repeat(this.shield) || '---'}`, 20, 92);

    // Storm charge: ten pips, filling toward the chain lightning.
    ctx.fillText('STORM :', 20, 112);
    for (let i = 0; i < this.orbsPerStorm; i++) {
      const bx = 106 + i * 11;
      if (i < this.orbCharge) {
        ctx.fillStyle = TRI_PALETTE[i % TRI_PALETTE.length];
        ctx.fillRect(bx, 104, 8, 8);
      } else {
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, 104.5, 7, 7);
      }
    }
    ctx.fillStyle = '#ffffff';

    if (this.overdrive > 0) {
      const pct = this.overdrive / this.overdriveMax;
      ctx.fillStyle = TRI_PALETTE[Math.floor(this.overdrive / 5) % 3];
      ctx.fillText(`OVERDRIVE ${(this.overdrive / 60).toFixed(1)}S`, 20, 132);
      ctx.fillRect(20, 138, Math.floor(180 * pct), 4);
      ctx.fillStyle = '#ffffff';
    }

    // Combo Multiplier + draining timer bar
    if (this.combo > 1) {
      const size = 20 + this.combo * 2;
      ctx.font = `bold ${size}px 'Courier New', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`x${this.combo}`, 20, 178);

      const barW = 90;
      const pct = Math.max(0, Math.min(1, this.comboTimer / this.comboWindow));
      ctx.lineWidth = 1;
      ctx.strokeRect(20, 188, barW, 5);
      ctx.fillRect(21, 189, Math.floor((barW - 2) * pct), 3);
      ctx.font = "bold 14px 'Courier New', monospace";
    }
    ctx.textAlign = 'left';

    // Boss Health Bar
    if (this.boss) {
      const b = this.boss;
      const barW = Math.min(360, this.width * 0.6);
      const barH = 8;
      const startX = (this.width - barW) / 2;
      const startY = 36;
      const hpPct = Math.max(0, b.health / b.maxHealth);

      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(b.title, this.width / 2, startY - 8);

      // Track
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, startY, barW, barH);

      // Fill Blocks
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(startX + 2, startY + 2, Math.floor((barW - 4) * hpPct), barH - 4);
    }

    // Ability Status (Bottom Center)
    const gaugeW = 120;
    const gaugeH = 6;
    const gap = 24;
    const totalW = gaugeW * 2 + gap;
    const startX = (this.width - totalW) / 2;
    const bottomY = this.height - 28;

    // 1. DASH GAUGE [SPACE]
    const dashPct = Math.max(0, 1 - (this.player.dashCooldown / this.player.dashMaxCooldown));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, bottomY, gaugeW, gaugeH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX + 1, bottomY + 1, Math.floor((gaugeW - 2) * dashPct), gaugeH - 2);

    ctx.font = "bold 9px 'Courier New', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(dashPct >= 1 ? '[SPACE] DASH READY' : 'DASH CHARGING...', startX + gaugeW / 2, bottomY - 6);

    // 2. BLAST GAUGE [SHIFT]
    const blastX = startX + gaugeW + gap;
    const blastPct = Math.max(0, 1 - (this.player.blastCooldown / this.player.blastMaxCooldown));
    ctx.strokeRect(blastX, bottomY, gaugeW, gaugeH);
    ctx.fillRect(blastX + 1, bottomY + 1, Math.floor((gaugeW - 2) * blastPct), gaugeH - 2);

    ctx.fillText(blastPct >= 1 ? '[SHIFT] BLAST READY' : 'BLAST CHARGING...', blastX + gaugeW / 2, bottomY - 6);

    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.circleGame = new CircleSurvivalGame();
});

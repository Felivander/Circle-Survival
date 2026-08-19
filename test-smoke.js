/**
 * Headless smoke test: stubs canvas + DOM, runs the real game loop at a fixed
 * 60Hz for 150 simulated seconds. Fails loudly if the pacing invariants break.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, 'js');

const noop = () => {};
const gradientStub = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => gradientStub;
    if (k === 'createPattern') return () => ({});
    return noop;
  },
  set() { return true; }
});

const els = {};
function el(id) {
  if (!els[id]) {
    els[id] = {
      id, value: '', textContent: '', innerHTML: '',
      classList: { add: noop, remove: noop, contains: () => false },
      addEventListener: noop,
      getContext: () => ctxStub,
      width: 1280, height: 720,
      parentNode: { insertBefore: noop },
      nextSibling: null
    };
  }
  return els[id];
}

const listeners = {};
const sandbox = {
  console,
  Math, Date, JSON,
  performance: { now: () => Date.now() },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = String(v); }
  },
  requestAnimationFrame: noop, // we drive update() manually
  document: {
    getElementById: el,
    createElement: () => ({
      getContext: () => ctxStub,
      width: 1280, height: 720, style: {}
    }),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); }
  }
};
sandbox.window = sandbox;
sandbox.window.innerWidth = 1280;
sandbox.window.innerHeight = 720;
sandbox.window.addEventListener = (t, fn) => { (listeners[t] ||= []).push(fn); };
sandbox.AudioContext = null;
vm.createContext(sandbox);

for (const f of ['audio.js', 'space-bg.js', 'engine.js', 'glow.js', 'leaderboard.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
(listeners['DOMContentLoaded'] || []).forEach(fn => fn());

const g = sandbox.window.circleGame;
assert.ok(g, 'game did not construct');

// ---- run 150 simulated seconds at a fixed 60Hz, player pinned invulnerable
// so pacing runs the full window instead of ending on an idle death ----
g.startNewGame();
let lastScore = 0;
let hazardsAt10s = 0;
let hazardsAt120s = 0;
let bossFirstSeenAt = null;
let maxCombo = 1;

for (let frame = 0; frame < 60 * 150; frame++) {
  g.player.invuln = 999;
  g.update(1);
  g.render();
  assert.strictEqual(g.state, 'PLAYING', `run ended unexpectedly at frame ${frame}`);
  assert.ok(g.score >= lastScore, `score went backwards at frame ${frame}`);
  lastScore = g.score;
  maxCombo = Math.max(maxCombo, g.combo);
  if (Math.abs(g.survivalTime - 10) < 0.01) hazardsAt10s = g.hazards.length;
  if (Math.abs(g.survivalTime - 120) < 0.01) hazardsAt120s = g.hazards.length;
  if (g.boss && bossFirstSeenAt === null) bossFirstSeenAt = g.survivalTime;
}
assert.ok(hazardsAt120s > hazardsAt10s, 'late game is not denser than early game');

assert.ok(hazardsAt10s <= 8, `too crowded at 10s: ${hazardsAt10s} hazards on screen`);
assert.ok(bossFirstSeenAt === null || bossFirstSeenAt >= 74,
  `boss spawned at ${bossFirstSeenAt}s, must be >= 75s`);
assert.ok(maxCombo <= g.maxCombo, `combo blew past cap: ${maxCombo}`);

// ---- shield eats exactly one hit, then it's game over ----
g.startNewGame();
assert.strictEqual(g.shield, 1);
g.player.invuln = 0;
g.hitPlayer();
assert.strictEqual(g.shield, 0, 'shield did not absorb the hit');
assert.strictEqual(g.state, 'PLAYING', 'shielded hit should not end the run');
g.player.invuln = 0;
g.hitPlayer();
assert.strictEqual(g.state, 'DYING', 'second hit should start the death cam');

// ---- death cam plays, then hands over to the score screen ----
assert.ok(g.timeScaleTarget < 0.5, 'death cam did not engage slow motion');
let deathGuard = 0;
while (g.state === 'DYING' && deathGuard++ < 2000) g.updateDeath(1);
assert.ok(deathGuard < 2000, 'death cam never finished');
assert.strictEqual(g.state, 'GAMEOVER', 'death cam did not reach the score screen');
assert.strictEqual(g.timeScaleTarget, 1, 'death cam left the game in slow motion');
assert.ok(deathGuard > 60, `death cam too short to read: ${deathGuard} frames`);

// Skipping early is allowed, but only after the sequence has played a beat.
g.startNewGame();
g.shield = 0;
g.player.invuln = 0;
g.hitPlayer();
assert.strictEqual(g.state, 'DYING');
g.finalizeGameOver();
assert.strictEqual(g.state, 'GAMEOVER', 'could not skip the death cam');

// A storm in flight must not outlive the player, or its dim overlay sticks.
g.startNewGame();
g.player.invuln = 0;
g.shield = 0;
for (let i = 0; i < 8; i++) g.spawnEdgeHazard();
g.triggerChainStorm();
assert.ok(g.storm, 'storm did not start');
g.hitPlayer();
assert.strictEqual(g.storm, null, 'storm survived the player death');

// ---- chain lightning storm ----
g.startNewGame();
g.player.invuln = 999999;
for (let i = 0; i < 25; i++) g.spawnEdgeHazard();
const hazardsBefore = g.hazards.length;

// Walk the orb charge up to the trigger.
for (let i = 0; i < g.orbsPerStorm - 1; i++) {
  g.orbCharge++;
}
assert.strictEqual(g.storm, null, 'storm fired before the 10th orb');
g.orbCharge++;
g.triggerChainStorm();
assert.ok(g.storm, 'storm did not start on the 10th orb');
assert.ok(g.storm.targets.length <= 20, `storm chained ${g.storm.targets.length} targets, cap is 20`);
assert.ok(g.timeScaleTarget < 0.5, 'storm did not engage slow motion');

// Drive it on raw frames the way loop() does, until it finishes.
let guard = 0;
while (g.storm && guard++ < 4000) {
  g.updateStorm(1);
}
assert.ok(guard < 4000, 'storm never terminated');
assert.strictEqual(g.timeScaleTarget, 1, 'slow motion never released');
assert.ok(g.hazards.length < hazardsBefore, 'storm destroyed nothing');

// A storm whose targets all vanish mid-chain must still end, not stall.
g.startNewGame();
for (let i = 0; i < 12; i++) g.spawnEdgeHazard();
g.triggerChainStorm();
g.hazards = [];
guard = 0;
while (g.storm && guard++ < 4000) g.updateStorm(1);
assert.ok(guard < 4000, 'storm stalled when its targets were removed');

// ---- hull tint: floods on pickup, fades, and the 10th holds far longer ----
g.startNewGame();
g.player.invuln = 999999;
assert.strictEqual(g.tint, 0, 'hull starts tinted');

// Eat one orb by walking the player onto it.
g.energyOrbs = [];
g.spawnEnergyOrb();
g.energyOrbs[0].x = g.player.x;
g.energyOrbs[0].y = g.player.y;
g.hazards = [];
g.update(1);
assert.strictEqual(g.tint, 1, 'pickup did not flood the hull');
assert.strictEqual(g.tintHold, 0, 'a normal pickup should not hold');
const tintAfterOne = g.tintColor;

// It must actually bleed away on its own.
for (let i = 0; i < 400; i++) { g.hazards = []; g.update(1); }
assert.strictEqual(g.tint, 0, 'hull tint never faded back to white');

// The tenth orb holds, and holds longer than a normal pickup lasts.
g.startNewGame();
g.player.invuln = 999999;
g.orbCharge = 9;
g.hazards = [];
g.energyOrbs = [];
g.spawnEnergyOrb();
g.energyOrbs[0].x = g.player.x;
g.energyOrbs[0].y = g.player.y;
g.update(1);
assert.ok(g.storm, 'tenth orb did not fire the storm');
assert.strictEqual(g.tint, 1, 'tenth orb did not flood the hull');
assert.ok(g.tintHold > 100, `tenth orb hold too short: ${g.tintHold}`);
assert.notStrictEqual(tintAfterOne, undefined);

// While held, the tint must not decay at all.
const heldBefore = g.tint;
for (let i = 0; i < 60; i++) { g.hazards = []; g.update(1); }
assert.strictEqual(g.tint, heldBefore, 'tint decayed while it was supposed to hold');

// ---- every boss kind spawns, takes damage from the shared path, and dies ----
for (const kind of ['ring', 'pulsar', 'matrix']) {
  g.startNewGame();
  g.player.invuln = 999999;
  g.bossIndex = g.bossOrder.indexOf(kind);
  g.spawnBoss();

  assert.ok(g.boss, `${kind}: did not spawn`);
  assert.strictEqual(g.boss.kind, kind, `${kind}: spawned ${g.boss.kind} instead`);
  assert.ok(g.boss.maxHealth > 0, `${kind}: no health`);
  assert.ok(g.boss.arming > 0, `${kind}: spawned already lethal, no telegraph`);

  // Arming must actually expire, and must block damage while it runs.
  assert.strictEqual(g.damageBoss(g.boss.x, g.boss.y, 9999, 10), false,
    `${kind}: took damage while still arming`);
  let armGuard = 0;
  while (g.boss && g.boss.arming > 0 && armGuard++ < 1000) g.updateBoss(1);
  assert.ok(armGuard < 1000, `${kind}: never finished arming`);

  // Nuke-sized hit repeated until dead; must terminate and clear the boss.
  let killGuard = 0;
  while (g.boss && killGuard++ < 500) {
    g.damageBoss(g.boss.x, g.boss.y, 99999, 200);
  }
  assert.ok(killGuard < 500, `${kind}: could not be killed via damageBoss`);
  assert.strictEqual(g.boss, null, `${kind}: still present after defeat`);
}

// Bosses cycle rather than repeating the same fight.
g.startNewGame();
const seen = [];
for (let i = 0; i < 3; i++) {
  g.spawnBoss();
  seen.push(g.boss.kind);
  g.boss = null;
}
assert.strictEqual(new Set(seen).size, 3, `bosses did not cycle: ${seen.join(',')}`);

// ---- framerate independence: 60Hz and 144Hz must score the same per second ----
function passiveOver(seconds, hz) {
  g.startNewGame();
  g.hazards = []; g.energyOrbs = []; g.nukePowerups = [];
  const step = 60 / hz;
  const before = g.score;
  for (let i = 0; i < seconds * hz; i++) { g.update(step); g.hazards = []; }
  return g.score - before;
}
const s60 = passiveOver(10, 60);
const s144 = passiveOver(10, 144);
assert.ok(Math.abs(s60 - s144) <= 3, `framerate-dependent scoring: 60Hz=${s60} 144Hz=${s144}`);

console.log('PASS');
console.log(`  hazards on screen at 10s : ${hazardsAt10s}`);
console.log(`  hazards on screen at 120s: ${hazardsAt120s}`);
console.log(`  first boss at            : ${bossFirstSeenAt === null ? 'never (<150s window)' : bossFirstSeenAt.toFixed(1) + 's'}`);
console.log(`  max combo reached        : ${maxCombo}`);
console.log(`  passive score / 10s      : 60Hz=${s60} 144Hz=${s144}`);

# Circle Survival

A fast-paced arcade survival game. Pixel-art world in pure black and white,
where colour is reserved for the things that can hurt or help you.

No build step, no dependencies. Open `index.html` in a browser, or serve the
folder:

```bash
npx http-server . -p 8231 -c-1
```

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Move. Tap the opposite direction to brake hard (counter-strafe) |
| `Space` | Dash — invulnerable, smashes rocks |
| `Shift` | Fire Blast — clears the area around you |
| `Esc` / `P` | Pause |
| `R` | Restart |
| `F` | Toggle glow |

## How it plays

**Graze.** Skimming past a rock scores and raises your combo. Everything scores
× combo, and the multiplier bleeds away if you stop taking risks. Playing safe
is the low-scoring strategy.

**Shield.** Absorbs one hit and refills every 5 orbs, so early mistakes are
survivable without making the late game safe.

**Chain Lightning.** Every 10th orb triggers a storm: time drops to a crawl and
a bolt walks from enemy to enemy, up to 20 of them. The orb pickup pitch climbs
a scale as the charge fills, resolving into a chord when it fires.

**Overdrive.** A tri-colour powerup drops every 1000 points. Free dashes and 5×
blast recharge for seven seconds.

## Enemies

In 1-bit, value *is* the threat hierarchy — how much white a thing occupies is
how dangerous it reads.

- **Meteor** — hollow, cratered, irregular. Drifts at you.
- **Heavy** — armoured belt and rivets. Slow, big, hard to miss.
- **Seeker** — pitch black with only a rim light and a faint halo. It hunts you.

## Bosses

Three fights, cycled, first at 75 seconds and every 70 seconds after.

- **Titanus Voronoi** — a segmented ring. Dash through the plates to break them.
- **Pulsar Helix** — a core with sweeping beam arms. Time the gaps, hit the core.
- **Swarm Matrix** — orbiting nodes joined by live lightning. Both the nodes and
  the links between them are lethal, and the web reshapes as nodes go down.

## Difficulty

Starts slow on purpose. A rock every ~1.7s at the start, tightening to ~0.25s
past 90 seconds. Seekers unlock at 18s, heavies at 32s.

## Tests

```bash
node test-smoke.js
```

Runs the real game loop headless for 150 simulated seconds against a stubbed
canvas, and asserts the things that are easy to break silently: the difficulty
ramp, boss gating, shield behaviour, chain-storm termination, every boss kind
spawning and dying, and framerate-independent scoring.

## Layout

| File | Owns |
| --- | --- |
| `js/game.js` | Rules, entities, world rendering |
| `js/engine.js` | Particles, lightning, shockwaves, colour ramps |
| `js/glow.js` | Bloom and impact chromatic split |
| `js/space-bg.js` | Starfield |
| `js/audio.js` | Procedural Web Audio synthesis |
| `js/leaderboard.js` | Local scores and lifetime stats |

// The staged scenes behind ?shot=start|play|nova|end&seed=N. Each scene runs
// the real simulation forward from a fresh world, steered by a scripted pilot,
// so every screenshot is a genuine frame of the game being played — the same
// seed always stages the same scene. The pilot for `play` flies well (matches
// phases, spends its Nova); the pilot for `end` flies badly (never shifts
// phase, drifts into the shards) and is overwhelmed, as a hurried player is.

import { FIELD, STEP } from './config.js';

function baseInput(player) {
  return {
    mx: 0,
    my: 0,
    aimX: player.x,
    aimY: player.y - 120,
    fire: false,
    phaseDelta: 0,
    phaseSet: -1,
    nova: false,
    start: false,
    pause: false,
  };
}

function nearestEnemy(state) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

/** One step of the good pilot: keep a fighting distance, aim with a little
 *  lead, match the target's phase, and spend a full Nova on a crowd. */
function goodPilot(world) {
  const state = world.state;
  const p = state.player;
  const input = baseInput(p);
  const near = nearestEnemy(state);
  // Orbit the courtyard heart, leaning away from whatever is closest.
  let tx = FIELD.width / 2 + Math.sin(state.time * 0.35) * 190;
  let ty = FIELD.height / 2 + 90 + Math.cos(state.time * 0.27) * 90;
  if (near) {
    const { enemy, dist } = near;
    const away = Math.max(0, (190 - dist) / 190);
    tx += ((p.x - enemy.x) / Math.max(1, dist)) * away * 260;
    ty += ((p.y - enemy.y) / Math.max(1, dist)) * away * 260;
    const lead = dist / 590;
    input.aimX = enemy.x + enemy.vx * lead;
    input.aimY = enemy.y + enemy.vy * lead;
    input.fire = true;
    input.phaseSet = enemy.phase;
    let crowd = 0;
    for (const e of state.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < 210) crowd += 1;
    }
    if (state.nova >= 100 && crowd >= 3) input.nova = true;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  if (len > 12) {
    input.mx = dx / len;
    input.my = dy / len;
  }
  return input;
}

/** One step of the cautious pilot: the good pilot's footwork with its trigger
 *  finger off — used to let a crowd gather for a staged frame. */
function cautiousPilot(world) {
  const input = goodPilot(world);
  input.fire = false;
  input.nova = false;
  input.phaseSet = -1;
  return input;
}

/** One step of the doomed pilot: never shifts phase, aims wide of its target
 *  (so most bolts whistle past and nothing is knocked back), and walks
 *  straight at the nearest shard. The end comes quickly. */
function poorPilot(world) {
  const state = world.state;
  const p = state.player;
  const input = baseInput(p);
  const near = nearestEnemy(state);
  if (near) {
    const off = 0.22;
    const dx = near.enemy.x - p.x;
    const dy = near.enemy.y - p.y;
    input.aimX = p.x + dx * Math.cos(off) - dy * Math.sin(off);
    input.aimY = p.y + dx * Math.sin(off) + dy * Math.cos(off);
    input.fire = true;
    if (near.dist > 4) {
      input.mx = (dx / near.dist) * 0.85;
      input.my = (dy / near.dist) * 0.85;
    }
  }
  return input;
}

function run(world, seconds, pilot) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, pilot(world));
}

/**
 * Stage the named scene in `world` and return the screen it lands on
 * ('title' | 'play' | 'over').
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    world.startGame();
    // Play one step at a time and take the first frame that is unmistakably
    // mid-fight. Best of all is the wave-five surge, when shards pour in
    // faster than even a good pilot can burn them down and the courtyard
    // fills; a close-quarters brawl (shards pressing in, bolts up, something
    // breaking) also qualifies, and any busy frame beats running long.
    let guard = 0;
    const limit = 110 / STEP;
    while (guard < limit && state.screen === 'play') {
      world.step(STEP, goodPilot(world));
      guard += 1;
      if (guard < 12 / STEP) continue;
      const t = guard * STEP;
      const dists = state.enemies
        .map((e) => Math.hypot(e.x - state.player.x, e.y - state.player.y))
        .sort((a, b) => a - b);
      const surge = state.wave >= 5 && state.enemies.length >= 6
        && state.bolts.length >= 2 && state.particles.length >= 15;
      const closeFight = dists.length >= 4 && dists[1] < 330
        && state.bolts.length >= 2 && state.particles.length >= 15
        && state.player.x > 170 && state.player.x < 1110
        && state.player.y > 130 && state.player.y < 710;
      const busy = state.enemies.length >= 4 && state.bolts.length >= 2
        && state.particles.length >= 15;
      if (surge || closeFight || (t > 75 && busy)) break;
    }
    return state.screen;
  }
  if (name === 'nova') {
    world.startGame();
    run(world, 16, goodPilot);
    // Scene dressing: the meter is topped up so the burst can be staged on
    // cue; the Nova itself is fired through the real input path and resolved
    // by the real rules.
    if (state.nova < 100) state.nova = 100;
    // Orbit the courtyard heart with the trigger held off (the cautious
    // pilot) while the shards gather in — the flame stays central, so the
    // burst opens in the middle of the frame.
    const crowded = () => {
      let n = 0;
      for (const e of state.enemies) {
        if (Math.hypot(e.x - state.player.x, e.y - state.player.y) < 235) n += 1;
      }
      return n;
    };
    let guard = 0;
    while ((crowded() < 4 || Math.hypot(state.player.x - FIELD.width / 2, state.player.y - 490) > 170)
      && guard < 16 / STEP && state.screen === 'play') {
      world.step(STEP, cautiousPilot(world));
      guard += 1;
    }
    const fire = baseInput(state.player);
    fire.nova = true;
    world.step(STEP, fire);
    // Freeze a breath into the burst, ring open and shards breaking.
    run(world, 0.17, cautiousPilot);
    return state.screen;
  }
  if (name === 'end') {
    world.startGame();
    let guard = 0;
    while (state.screen === 'play' && guard < 600 / STEP) {
      world.step(STEP, poorPilot(world));
      guard += 1;
    }
    // Let the last explosion settle into the game-over frame.
    run(world, 0.35, (w) => baseInput(w.state.player));
    return state.screen;
  }
  // 'start' (and anything else): the title, after a few seconds of ambience.
  run(world, 4.5, (w) => baseInput(w.state.player));
  return state.screen;
}

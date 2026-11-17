// TAMAYURA's simulation. Pure state and rules — no DOM, no audio, no drawing —
// advanced in fixed steps by whoever drives it: the real game loop with live
// input, or the screenshot staging with a scripted pilot. Step returns a
// bitmask of EV_* events so the driver can play sounds for what happened.

import {
  BOLT, COMBO, EMBER_DROP_CHANCE, ENEMIES, FIELD, NOVA, PHASES, PLAYER, wavePlan,
} from './config.js';

export const EV = {
  SHOOT: 1, KILL: 2, WRONG: 4, HURT: 8, NOVA: 16, PICKUP: 32,
  WAVE: 64, OVER: 128, SWITCH: 256, START: 512,
};

const TAU = Math.PI * 2;

export function makeWorld(rng) {
  const state = {
    screen: 'title', // 'title' | 'play' | 'over'
    paused: false,
    time: 0,
    score: 0,
    best: 0,
    lives: PLAYER.lives,
    wave: 0,
    combo: 0,
    comboTimer: 0,
    mult: 1,
    nova: 0,
    player: null,
    bolts: [],
    enemies: [],
    embers: [],
    particles: [],
    rings: [],
    texts: [],
    fireflies: [],
    drifters: [],
    novaRing: null,
    spawnBudget: 0,
    spawnTimer: 0,
    spawnInterval: 1,
    plan: null,
    between: false,
    betweenTimer: 0,
    banner: null,
    trauma: 0,
    hurtFlash: 0,
    aimX: FIELD.width / 2,
    aimY: FIELD.height / 2 - 120,
    stats: { kills: 0, wrongHits: 0, novas: 0, wavesCleared: 0 },
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2 + 130,
      vx: 0,
      vy: 0,
      face: -Math.PI / 2,
      fireCd: 0,
      switchCd: 0,
      invuln: 0,
      phase: 0,
      dead: false,
    };
  }

  function initAmbient() {
    state.fireflies = [];
    for (let i = 0; i < 24; i += 1) {
      state.fireflies.push({
        x: rng.range(30, FIELD.width - 30),
        y: rng.range(FIELD.height * 0.3, FIELD.height - 40),
        s: rng.range(0.6, 1.5),
        p: rng.range(0, TAU),
      });
    }
    state.drifters = [];
    for (let i = 0; i < 7; i += 1) {
      state.drifters.push({
        x: rng.range(0, FIELD.width),
        y: rng.range(60, FIELD.height - 160),
        vx: rng.range(9, 22) * (rng.chance(0.5) ? 1 : -1),
        rot: rng.range(0, TAU),
        rotV: rng.range(-0.4, 0.4),
        phase: rng.int(0, 2),
        kind: rng.chance(0.6) ? 'shard' : 'weaver',
        scale: rng.range(0.8, 1.5),
      });
    }
  }

  function reset() {
    state.screen = 'title';
    state.paused = false;
    state.score = 0;
    state.lives = PLAYER.lives;
    state.wave = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.mult = 1;
    state.nova = 0;
    state.player = freshPlayer();
    state.bolts = [];
    state.enemies = [];
    state.embers = [];
    state.particles = [];
    state.rings = [];
    state.texts = [];
    state.novaRing = null;
    state.banner = null;
    state.between = false;
    state.trauma = 0;
    state.hurtFlash = 0;
    state.stats = { kills: 0, wrongHits: 0, novas: 0, wavesCleared: 0 };
    initAmbient();
  }

  function startWave(n) {
    state.wave = n;
    state.plan = wavePlan(n);
    state.spawnBudget = state.plan.budget;
    state.spawnInterval = state.plan.interval;
    state.spawnTimer = 0.9;
    state.between = false;
    state.banner = {
      title: `WAVE ${n}`,
      sub: state.plan.surge ? 'THE SHARDS SURGE' : 'they come for the fire',
      t: 0,
      dur: 1.9,
    };
  }

  function startGame() {
    const best = state.best;
    reset();
    state.best = best;
    state.screen = 'play';
    startWave(1);
  }

  // ---------- effects ----------

  function burst(x, y, color, count, speed, size = 3) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 520) return;
      const a = rng.range(0, TAU);
      const v = rng.range(speed * 0.25, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(0.3, 0.75),
        maxLife: 0.75,
        size: rng.range(size * 0.5, size * 1.4),
        color,
        drag: 2.6,
        grav: 46,
      });
    }
  }

  function ring(x, y, r1, dur, color, width = 3) {
    state.rings.push({ x, y, r0: 6, r1, t: 0, dur, color, width });
  }

  function floatText(x, y, text, color, size = 17) {
    state.texts.push({ x, y, text, color, size, life: 0.95, maxLife: 0.95 });
  }

  // ---------- enemies ----------

  function spawnEnemy(kindOverride, xOverride, yOverride, phaseOverride) {
    const plan = state.plan ?? wavePlan(state.wave || 1);
    let kind = kindOverride;
    if (!kind) {
      const roll = rng.next();
      if (roll < plan.hulkChance) kind = 'hulk';
      else if (roll < plan.hulkChance + plan.weaverChance) kind = 'weaver';
      else kind = 'shard';
    }
    const def = ENEMIES[kind];
    let x = xOverride;
    let y = yOverride;
    if (x === undefined) {
      for (let tries = 0; tries < 8; tries += 1) {
        const edge = rng.int(0, 3);
        if (edge === 0) { x = rng.range(46, FIELD.width - 46); y = 44; }
        else if (edge === 1) { x = rng.range(46, FIELD.width - 46); y = FIELD.height - 44; }
        else if (edge === 2) { x = 44; y = rng.range(46, FIELD.height - 46); }
        else { x = FIELD.width - 44; y = rng.range(46, FIELD.height - 46); }
        const d = Math.hypot(x - state.player.x, y - state.player.y);
        if (d > 170) break;
      }
    }
    state.enemies.push({
      kind,
      x, y,
      vx: 0, vy: 0,
      r: def.radius,
      hp: def.hp,
      maxHp: def.hp,
      speed: rng.range(def.speedMin, def.speedMax),
      phase: phaseOverride ?? rng.int(0, PHASES.length - 1),
      rot: rng.range(0, TAU),
      rotV: rng.range(-1.1, 1.1),
      age: 0,
      spawnT: 0,
      wob: rng.range(0, TAU),
      flash: 0,
    });
  }

  function killEnemy(enemy, award) {
    const def = ENEMIES[enemy.kind];
    burst(enemy.x, enemy.y, PHASES[enemy.phase].color, enemy.kind === 'hulk' ? 30 : 16, 240, 3.4);
    burst(enemy.x, enemy.y, '#FFFFFF', 5, 150, 2.2);
    ring(enemy.x, enemy.y, enemy.r + 26, 0.3, PHASES[enemy.phase].color, 2.5);
    if (award) {
      state.combo += 1;
      state.comboTimer = COMBO.windowSeconds;
      state.mult = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.killsPerStep));
      const gained = def.score * state.mult;
      state.score += gained;
      state.nova = Math.min(NOVA.max, state.nova + NOVA.chargePerKill);
      floatText(enemy.x, enemy.y - enemy.r - 6, `+${gained}`, PHASES[enemy.phase].soft, enemy.kind === 'hulk' ? 21 : 16);
      state.stats.kills += 1;
      if (rng.chance(EMBER_DROP_CHANCE)) {
        state.embers.push({
          x: enemy.x, y: enemy.y,
          vx: rng.range(-26, 26), vy: rng.range(-26, 26),
          t: 0, life: 6,
        });
      }
    }
    if (enemy.kind === 'hulk') {
      for (let i = 0; i < 2; i += 1) {
        spawnEnemy('shard', enemy.x + rng.range(-16, 16), enemy.y + rng.range(-16, 16));
        const child = state.enemies[state.enemies.length - 1];
        child.spawnT = 0.22;
      }
    }
  }

  // ---------- per-step updates ----------

  function updateAmbient(dt) {
    for (const f of state.fireflies) {
      f.x += Math.sin(state.time * 0.24 + f.p) * 11 * dt;
      f.y += Math.cos(state.time * 0.31 + f.p * 1.7) * 8 * dt;
      if (f.x < 16) f.x = 16;
      if (f.x > FIELD.width - 16) f.x = FIELD.width - 16;
      if (f.y < 40) f.y = 40;
      if (f.y > FIELD.height - 24) f.y = FIELD.height - 24;
    }
    for (const d of state.drifters) {
      d.x += d.vx * dt;
      d.rot += d.rotV * dt;
      if (d.x < -40) d.x = FIELD.width + 40;
      if (d.x > FIELD.width + 40) d.x = -40;
    }
  }

  function updateFx(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.grav * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const r of state.rings) r.t += dt;
    state.rings = state.rings.filter((r) => r.t < r.dur);
    for (const t of state.texts) {
      t.life -= dt;
      t.y -= 36 * dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t >= state.banner.dur) state.banner = null;
    }
    state.trauma = Math.max(0, state.trauma - dt * 1.7);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 2.4);
  }

  function stepPlay(dt, input) {
    let events = 0;
    const player = state.player;
    state.aimX = input.aimX;
    state.aimY = input.aimY;

    // Phase switching.
    player.switchCd -= dt;
    let target = player.phase;
    if (input.phaseSet >= 0) target = input.phaseSet;
    else if (input.phaseDelta !== 0) target = ((player.phase + input.phaseDelta) % 3 + 3) % 3;
    if (target !== player.phase && player.switchCd <= 0) {
      player.phase = target;
      player.switchCd = PLAYER.switchCooldown;
      ring(player.x, player.y, 30, 0.28, PHASES[target].color, 2.5);
      events |= EV.SWITCH;
    }

    // Movement: direct, snappy velocity, clamped to the courtyard.
    player.vx = input.mx * PLAYER.speed;
    player.vy = input.my * PLAYER.speed;
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    player.face = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    player.invuln = Math.max(0, player.invuln - dt);

    // Flame trail while moving.
    if ((input.mx !== 0 || input.my !== 0) && state.particles.length < 480) {
      state.particles.push({
        x: player.x - player.vx * 0.03 + rng.range(-3, 3),
        y: player.y - player.vy * 0.03 + rng.range(-3, 3),
        vx: rng.range(-12, 12), vy: rng.range(-12, 12),
        life: rng.range(0.22, 0.4), maxLife: 0.4,
        size: rng.range(2, 4.4), color: PHASES[player.phase].color, drag: 2, grav: -24,
      });
    }

    // Firing.
    player.fireCd -= dt;
    if (input.fire && player.fireCd <= 0) {
      player.fireCd = PLAYER.fireInterval;
      const a = player.face;
      state.bolts.push({
        x: player.x + Math.cos(a) * (PLAYER.radius + 7),
        y: player.y + Math.sin(a) * (PLAYER.radius + 7),
        vx: Math.cos(a) * BOLT.speed,
        vy: Math.sin(a) * BOLT.speed,
        phase: player.phase,
        life: BOLT.lifeSeconds,
      });
      events |= EV.SHOOT;
    }

    // Nova.
    if (input.nova && state.nova >= NOVA.max && !state.novaRing) {
      state.nova = 0;
      state.novaRing = { x: player.x, y: player.y, t: 0 };
      state.trauma = Math.min(1, state.trauma + 0.5);
      state.stats.novas += 1;
      events |= EV.NOVA;
    }
    if (state.novaRing) {
      const ringState = state.novaRing;
      ringState.t += dt;
      const radius = NOVA.radius * (1 - Math.pow(1 - Math.min(1, ringState.t / NOVA.seconds), 3));
      const survivors = [];
      for (const e of state.enemies) {
        if (Math.hypot(e.x - ringState.x, e.y - ringState.y) <= radius + e.r) {
          killEnemy(e, true);
          events |= EV.KILL;
        } else survivors.push(e);
      }
      state.enemies = survivors;
      if (ringState.t >= NOVA.seconds) {
        ring(ringState.x, ringState.y, NOVA.radius + 14, 0.4, '#FFE9B0', 3);
        state.novaRing = null;
      }
    }

    // Spawning and wave flow.
    if (state.between) {
      state.betweenTimer -= dt;
      if (state.betweenTimer <= 0) {
        startWave(state.wave + 1);
        events |= EV.WAVE;
      }
    } else if (state.spawnBudget > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        state.spawnBudget -= 1;
        state.spawnTimer = state.spawnInterval * rng.range(0.72, 1.28);
      }
    } else if (state.enemies.length === 0 && !state.novaRing) {
      const bonus = 100 * state.wave;
      state.score += bonus;
      state.stats.wavesCleared += 1;
      state.banner = { title: `WAVE ${state.wave} CLEAR`, sub: `bonus +${bonus}`, t: 0, dur: 1.5 };
      state.between = true;
      state.betweenTimer = 1.6;
    }

    // Bolts.
    for (const b of state.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (state.particles.length < 500 && rng.chance(0.5)) {
        state.particles.push({
          x: b.x, y: b.y, vx: rng.range(-8, 8), vy: rng.range(-8, 8),
          life: 0.18, maxLife: 0.18, size: 1.8, color: PHASES[b.phase].color, drag: 1, grav: 0,
        });
      }
    }
    state.bolts = state.bolts.filter(
      (b) => b.life > 0 && b.x > -30 && b.x < FIELD.width + 30 && b.y > -30 && b.y < FIELD.height + 30,
    );

    // Enemies.
    for (const e of state.enemies) {
      e.age += dt;
      e.spawnT = Math.min(1, e.spawnT + dt / 0.35);
      e.flash = Math.max(0, e.flash - dt * 9);
      e.rot += e.rotV * dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      let px = 0;
      let py = 0;
      if (e.kind === 'shard') {
        const w = Math.sin(e.age * 2.4 + e.wob) * 20;
        px = -uy * w;
        py = ux * w;
      } else if (e.kind === 'weaver') {
        const w = Math.sin(e.age * 3.4 + e.wob) * 95;
        px = -uy * w;
        py = ux * w;
      }
      e.vx = ux * e.speed + px;
      e.vy = uy * e.speed + py;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }

    // Bolt vs enemy.
    if (state.bolts.length && state.enemies.length) {
      const deadBolts = new Set();
      const deadEnemies = new Set();
      for (let bi = 0; bi < state.bolts.length; bi += 1) {
        const b = state.bolts[bi];
        for (let ei = 0; ei < state.enemies.length; ei += 1) {
          if (deadEnemies.has(ei)) continue;
          const e = state.enemies[ei];
          if (Math.hypot(b.x - e.x, b.y - e.y) > BOLT.radius + e.r) continue;
          deadBolts.add(bi);
          if (b.phase === e.phase) {
            e.hp -= 1;
            e.flash = 1;
            if (e.hp <= 0) {
              deadEnemies.add(ei);
              killEnemy(e, true);
              events |= EV.KILL;
            } else {
              burst(e.x, e.y, PHASES[e.phase].color, 6, 150, 2.4);
              events |= EV.KILL;
            }
          } else {
            const kb = e.kind === 'hulk' ? 34 : 132;
            const bl = Math.max(1, Math.hypot(b.vx, b.vy));
            e.x += (b.vx / bl) * kb * 0.14;
            e.y += (b.vy / bl) * kb * 0.14;
            e.flash = 0.7;
            state.nova = Math.min(NOVA.max, state.nova + NOVA.chargePerWrongHit);
            state.stats.wrongHits += 1;
            burst(e.x, e.y, '#C9D4FF', 4, 110, 2);
            floatText(e.x, e.y - e.r - 4, 'RESIST', '#9AA5D8', 11);
            events |= EV.WRONG;
          }
          break;
        }
      }
      if (deadBolts.size) state.bolts = state.bolts.filter((_, i) => !deadBolts.has(i));
      if (deadEnemies.size) state.enemies = state.enemies.filter((_, i) => !deadEnemies.has(i));
    }

    // Enemy vs player.
    if (player.invuln <= 0) {
      for (let ei = 0; ei < state.enemies.length; ei += 1) {
        const e = state.enemies[ei];
        if (e.spawnT < 0.5) continue;
        if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + PLAYER.radius - 2) {
          killEnemy(e, false);
          state.enemies.splice(ei, 1);
          state.lives -= 1;
          state.combo = 0;
          state.mult = 1;
          state.comboTimer = 0;
          state.trauma = 1;
          state.hurtFlash = 0.5;
          player.invuln = PLAYER.invulnerableSeconds;
          events |= EV.HURT;
          if (state.lives <= 0) {
            player.dead = true;
            burst(player.x, player.y, PHASES[player.phase].color, 46, 320, 4);
            burst(player.x, player.y, '#FFFFFF', 16, 200, 3);
            ring(player.x, player.y, 120, 0.6, PHASES[player.phase].color, 4);
            state.screen = 'over';
            state.best = Math.max(state.best, state.score);
            events |= EV.OVER;
          }
          break;
        }
      }
    }

    // Embers (pickups): drift, gentle magnet, collect.
    for (const m of state.embers) {
      m.t += dt;
      m.life -= dt;
      const dx = player.x - m.x;
      const dy = player.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 96 && dist > 1) {
        m.vx += (dx / dist) * 340 * dt;
        m.vy += (dy / dist) * 340 * dt;
      }
      m.vx *= Math.exp(-2.4 * dt);
      m.vy *= Math.exp(-2.4 * dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (dist < PLAYER.radius + 11 && !player.dead) {
        m.life = 0;
        state.score += 25;
        state.nova = Math.min(NOVA.max, state.nova + NOVA.chargePerEmber);
        floatText(player.x, player.y - 24, '+25', '#FFC95E', 13);
        burst(player.x, player.y, '#FFC95E', 5, 90, 2);
        events |= EV.PICKUP;
      }
    }
    state.embers = state.embers.filter((m) => m.life > 0);

    // Combo decay.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.combo = 0;
        state.mult = 1;
      }
    }

    return events;
  }

  /** Advance one fixed step. `input` is the record from input.js / a pilot. */
  function step(dt, input) {
    state.time += dt;
    updateAmbient(dt);
    updateFx(dt);
    if (state.screen === 'title' || state.screen === 'over') {
      if (input.start) {
        startGame();
        return EV.START;
      }
      return 0;
    }
    if (state.screen === 'play') return stepPlay(dt, input);
    return 0;
  }

  reset();
  return { state, reset, startGame, step };
}

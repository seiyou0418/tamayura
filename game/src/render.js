// TAMAYURA's renderer. Draws the whole scene in logical field coordinates
// (1280x800); main.js scales that to the window. All glow is pre-rendered to
// small offscreen sprites once, so a frame is mostly drawImage and paths —
// no shadowBlur in the hot loop.

import { BOLT, COLORS, COMBO, FIELD, NOVA, PHASES, PLAYER } from './config.js';
import { makeRng } from './random.js';

const TAU = Math.PI * 2;
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function glowSprite(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, rgba(color, 0.85));
  grad.addColorStop(0.25, rgba(color, 0.38));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export function makeAssets() {
  const rng = makeRng(7);
  const stars = [];
  for (let i = 0; i < 130; i += 1) {
    stars.push({
      x: rng.range(0, FIELD.width),
      y: rng.range(0, FIELD.height * 0.62),
      r: rng.range(0.6, 1.9),
      tw: rng.range(0, TAU),
      layer: rng.chance(0.5) ? 0 : 1,
    });
  }
  const vignette = document.createElement('canvas');
  vignette.width = FIELD.width;
  vignette.height = FIELD.height;
  const vg = vignette.getContext('2d');
  const grad = vg.createRadialGradient(640, 400, 340, 640, 400, 860);
  grad.addColorStop(0, 'rgba(2,4,12,0)');
  grad.addColorStop(1, 'rgba(2,4,12,0.52)');
  vg.fillStyle = grad;
  vg.fillRect(0, 0, FIELD.width, FIELD.height);
  return {
    stars,
    vignette,
    glows: PHASES.map((p) => glowSprite(p.color)),
    goldGlow: glowSprite(COLORS.gold),
    whiteGlow: glowSprite('#FFFFFF'),
  };
}

function drawGlow(ctx, assets, sprite, x, y, size, alpha) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

// ---------- background ----------

function drawBackground(ctx, state, assets) {
  const grad = ctx.createLinearGradient(0, -60, 0, FIELD.height + 60);
  grad.addColorStop(0, COLORS.inkTop);
  grad.addColorStop(0.55, '#0E1533');
  grad.addColorStop(1, COLORS.ink);
  ctx.fillStyle = grad;
  ctx.fillRect(-70, -70, FIELD.width + 140, FIELD.height + 140);

  // Stars, two parallax layers creeping downward at different rates.
  for (const s of assets.stars) {
    const drift = state.time * (s.layer === 0 ? 2.2 : 4.5);
    const y = (s.y + drift) % (FIELD.height * 0.66);
    const a = 0.35 + 0.3 * Math.sin(state.time * 0.9 + s.tw);
    ctx.globalAlpha = Math.max(0.08, a) * (s.layer === 0 ? 0.7 : 1);
    ctx.fillStyle = '#DCE6FF';
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The moon and its halo, upper right of the torii.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, assets, assets.goldGlow, 884, 208, 380, 0.5);
  ctx.restore();
  ctx.fillStyle = COLORS.moon;
  ctx.beginPath();
  ctx.arc(884, 208, 84, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(214,178,106,0.20)';
  for (const [cx, cy, cr] of [[852, 178, 15], [910, 238, 11], [872, 252, 7], [922, 182, 8]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, TAU);
    ctx.fill();
  }

  drawTorii(ctx);

  // Mountain ridge along the bottom.
  ctx.fillStyle = COLORS.ridge;
  ctx.beginPath();
  ctx.moveTo(-70, 706);
  ctx.lineTo(150, 652);
  ctx.lineTo(330, 694);
  ctx.lineTo(545, 640);
  ctx.lineTo(760, 690);
  ctx.lineTo(990, 648);
  ctx.lineTo(1350, 700);
  ctx.lineTo(1350, 870);
  ctx.lineTo(-70, 870);
  ctx.closePath();
  ctx.fill();

  // The sacred fire's glow breathing at the courtyard's heart.
  const pulse = 0.75 + 0.25 * Math.sin(state.time * 1.7);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, assets, assets.goldGlow, 640, 742, 560 * pulse, 0.16);
  ctx.restore();

  // Fireflies from the world state.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of state.fireflies) {
    const a = 0.35 + 0.3 * Math.sin(state.time * 1.6 + f.p * 3);
    drawGlow(ctx, assets, assets.goldGlow, f.x, f.y, 17 * f.s, Math.max(0.08, a));
  }
  ctx.restore();
}

function drawTorii(ctx) {
  const cx = 640;
  ctx.fillStyle = COLORS.torii;
  ctx.strokeStyle = COLORS.toriiRim;
  ctx.lineWidth = 2;
  // Kasagi (top lintel), gently bowed.
  ctx.beginPath();
  ctx.moveTo(cx - 252, 330);
  ctx.quadraticCurveTo(cx, 302, cx + 252, 330);
  ctx.lineTo(cx + 252, 352);
  ctx.quadraticCurveTo(cx, 326, cx - 252, 352);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Shimaki block under the centre of the kasagi.
  ctx.fillRect(cx - 34, 348, 68, 20);
  // Nuki (lower lintel).
  ctx.fillRect(cx - 208, 402, 416, 17);
  ctx.strokeRect(cx - 208, 402, 416, 17);
  // Pillars, leaning a breath inward.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 168 - 13, 356);
    ctx.lineTo(cx + s * 168 + 13, 356);
    ctx.lineTo(cx + s * 178 + 15, 668);
    ctx.lineTo(cx + s * 178 - 15, 668);
    ctx.closePath();
    ctx.fill();
  }
  // Centre strut.
  ctx.fillRect(cx - 8, 368, 16, 300);
}

// ---------- entities ----------

function shardPath(ctx, kind, r) {
  ctx.beginPath();
  if (kind === 'shard') {
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (kind === 'weaver') {
    ctx.moveTo(0, -r * 1.25);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r * 1.25);
    ctx.lineTo(-r * 0.78, 0);
  } else {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function drawEnemy(ctx, state, assets, e, dim) {
  const phase = PHASES[e.phase];
  const scale = (0.35 + 0.65 * e.spawnT) * (dim ? 1 : 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.rot);
  ctx.scale(scale, scale);
  ctx.globalAlpha = dim ? 0.4 : Math.min(1, e.spawnT + 0.25);
  shardPath(ctx, e.kind, e.r);
  ctx.fillStyle = COLORS.shardBody;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = phase.color;
  ctx.stroke();
  if (e.flash > 0) {
    ctx.globalAlpha = (dim ? 0.4 : 1) * e.flash * 0.85;
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.globalAlpha = dim ? 0.4 : 1;
  }
  ctx.restore();
  // The burning core.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.8 + 0.2 * Math.sin(state.time * 5 + e.wob);
  drawGlow(ctx, assets, assets.glows[e.phase], e.x, e.y, e.r * 2.1 * pulse, dim ? 0.25 : 0.75);
  ctx.restore();
  ctx.fillStyle = phase.soft;
  ctx.beginPath();
  ctx.arc(e.x, e.y, Math.max(2.4, e.r * 0.2), 0, TAU);
  ctx.fill();
  // Hulk toughness: pips on a small arc overhead.
  if (e.kind === 'hulk' && !dim) {
    for (let i = 0; i < e.maxHp; i += 1) {
      ctx.fillStyle = i < e.hp ? phase.color : 'rgba(154,165,216,0.3)';
      ctx.beginPath();
      ctx.arc(e.x + (i - (e.maxHp - 1) / 2) * 11, e.y - e.r - 10, 3, 0, TAU);
      ctx.fill();
    }
  }
}

function drawPlayer(ctx, state, assets) {
  const p = state.player;
  if (!p || p.dead) return;
  const phase = PHASES[p.phase];
  let alpha = 1;
  if (p.invuln > 0) alpha = Math.sin(state.time * 30) > 0 ? 1 : 0.3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, assets, assets.glows[p.phase], p.x, p.y, 104, 0.95);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  // Orbiting phase ticks: the three colours circle the flame; the lit one is now.
  for (let i = 0; i < 3; i += 1) {
    const a = state.time * 1.5 + (i * TAU) / 3;
    const x = p.x + Math.cos(a) * (PLAYER.radius + 10);
    const y = p.y + Math.sin(a) * (PLAYER.radius + 10);
    ctx.fillStyle = PHASES[i].color;
    ctx.beginPath();
    ctx.arc(x, y, i === p.phase ? 4.4 : 2.6, 0, TAU);
    ctx.fill();
    if (i === p.phase) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  // The flame body: phase shell, white-hot heart, aim nub.
  ctx.fillStyle = phase.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER.radius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER.radius * 0.52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = phase.deep;
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.face) * 5, p.y + Math.sin(p.face) * 5, 2.6, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Aim reticle.
  ctx.save();
  ctx.strokeStyle = rgba(phase.color, 0.75);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, 9, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = rgba(phase.color, 0.9);
  ctx.beginPath();
  ctx.arc(state.aimX, state.aimY, 1.8, 0, TAU);
  ctx.fill();
  ctx.setLineDash([2, 7]);
  ctx.strokeStyle = rgba(phase.color, 0.16);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(state.aimX, state.aimY);
  ctx.stroke();
  ctx.restore();
}

function drawFx(ctx, state, assets) {
  // Embers waiting to be gathered.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of state.embers) {
    const blink = m.life < 1.5 ? (Math.sin(state.time * 18) > 0 ? 1 : 0.25) : 1;
    const pulse = 0.85 + 0.15 * Math.sin(state.time * 6 + m.t * 4);
    drawGlow(ctx, assets, assets.goldGlow, m.x, m.y, 26 * pulse, 0.9 * blink);
  }
  ctx.restore();
  for (const m of state.embers) {
    ctx.fillStyle = '#FFE9B0';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3, 0, TAU);
    ctx.fill();
  }

  // Bolts.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of state.bolts) {
    drawGlow(ctx, assets, assets.glows[b.phase], b.x, b.y, 34, 0.9);
  }
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  for (const b of state.bolts) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BOLT.radius * 0.55, 0, TAU);
    ctx.fill();
  }

  // Particles.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // Expanding rings (Nova afterglow, kills, phase shifts).
  for (const r of state.rings) {
    const k = r.t / r.dur;
    const ease = 1 - Math.pow(1 - k, 3);
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = Math.max(0.6, r.width * (1 - k));
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * ease, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // The Nova itself, mid-burst.
  if (state.novaRing) {
    const nr = state.novaRing;
    const k = Math.min(1, nr.t / NOVA.seconds);
    const radius = NOVA.radius * (1 - Math.pow(1 - k, 3));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,233,176,0.10)';
    ctx.beginPath();
    ctx.arc(nr.x, nr.y, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,233,176,0.95)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(nr.x, nr.y, radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(PHASES[state.player.phase].color, 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(nr.x, nr.y, radius + 8, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // Floating score text.
  ctx.save();
  ctx.textAlign = 'center';
  for (const t of state.texts) {
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    ctx.font = `700 ${t.size}px ${FONT}`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------- HUD and screens ----------

function drawHud(ctx, state, assets) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.dim;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('S C O R E', 26, 34);
  ctx.fillStyle = COLORS.paper;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(String(state.score), 26, 66);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(`BEST ${Math.max(state.best, state.score)}`, 26, 86);

  if (state.combo > 1) {
    const y = 116;
    ctx.fillStyle = COLORS.gold;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillText(state.mult > 1 ? `COMBO x${state.mult}` : `COMBO ${state.combo}`, 26, y);
    ctx.fillStyle = 'rgba(154,165,216,0.35)';
    ctx.fillRect(26, y + 7, 96, 4);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(26, y + 7, 96 * Math.max(0, state.comboTimer / COMBO.windowSeconds), 4);
  }

  // Wave and lives, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.dim;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText(`W A V E  ${state.wave}`, FIELD.width - 26, 34);
  for (let i = 0; i < PLAYER.lives; i += 1) {
    const x = FIELD.width - 40 - i * 30;
    const alive = i < state.lives;
    if (alive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, assets, assets.goldGlow, x, 58, 34, 0.8);
      ctx.restore();
      ctx.fillStyle = COLORS.gold;
    } else {
      ctx.fillStyle = 'rgba(154,165,216,0.25)';
    }
    ctx.beginPath();
    ctx.arc(x, 58, 7, 0, TAU);
    ctx.fill();
  }

  // Phase selector, bottom left.
  const py = FIELD.height - 32;
  for (let i = 0; i < 3; i += 1) {
    const x = 40 + i * 36;
    const current = i === state.player.phase;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, assets, assets.glows[i], x, py, current ? 52 : 34, current ? 0.95 : 0.4);
    ctx.restore();
    ctx.fillStyle = PHASES[i].color;
    ctx.beginPath();
    ctx.arc(x, py, current ? 10 : 7, 0, TAU);
    ctx.fill();
    if (current) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
  ctx.fillStyle = PHASES[state.player.phase].color;
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(PHASES[state.player.phase].name, 128, py + 5);

  // Nova meter, bottom right.
  const bw = 196;
  const bx = FIELD.width - 26 - bw;
  const by = FIELD.height - 38;
  const full = state.nova >= NOVA.max;
  ctx.textAlign = 'right';
  ctx.fillStyle = full ? COLORS.gold : COLORS.dim;
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText(full ? 'SPACE — NOVA READY' : 'N O V A', FIELD.width - 26, by - 8);
  ctx.strokeStyle = 'rgba(154,165,216,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, 11);
  const fillGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  fillGrad.addColorStop(0, '#B97F26');
  fillGrad.addColorStop(1, COLORS.gold);
  ctx.fillStyle = fillGrad;
  ctx.fillRect(bx + 1.5, by + 1.5, (bw - 3) * (state.nova / NOVA.max), 8);
  if (full) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, assets, assets.goldGlow, bx + bw / 2, by + 5, 150 + 30 * Math.sin(state.time * 6), 0.5);
    ctx.restore();
  }

  // First-wave hint.
  if (state.wave === 1 && state.stats.kills === 0 && state.screen === 'play') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,230,255,0.55)';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('WASD move · mouse aim · hold click to fire · match your flame’s colour to theirs · Q / E shifts phase', FIELD.width / 2, FIELD.height - 16);
  }
  ctx.restore();
}

function spacedText(ctx, text, cx, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

function drawBanner(ctx, state) {
  const b = state.banner;
  if (!b) return;
  const inK = Math.min(1, b.t / 0.16);
  const outK = Math.min(1, (b.dur - b.t) / 0.4);
  const alpha = Math.max(0, Math.min(inK, outK));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.paper;
  ctx.font = `700 44px ${FONT_DISPLAY}`;
  spacedText(ctx, b.title, FIELD.width / 2, 190, 10);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(b.sub, FIELD.width / 2, 222);
  ctx.restore();
}

function drawTitle(ctx, state, assets) {
  ctx.save();
  ctx.textAlign = 'center';
  // Three phase orbs orbiting above the title.
  for (let i = 0; i < 3; i += 1) {
    const a = state.time * 0.7 + (i * TAU) / 3;
    const x = FIELD.width / 2 + Math.cos(a) * 128;
    const y = 148 + Math.sin(a) * 17;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, assets, assets.glows[i], x, y, 64, 0.9);
    ctx.restore();
    ctx.fillStyle = PHASES[i].color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fill();
  }
  const titleGrad = ctx.createLinearGradient(0, 210, 0, 300);
  titleGrad.addColorStop(0, '#FFE9B0');
  titleGrad.addColorStop(0.55, COLORS.gold);
  titleGrad.addColorStop(1, '#FF6A4D');
  ctx.fillStyle = titleGrad;
  ctx.font = `700 96px ${FONT_DISPLAY}`;
  spacedText(ctx, 'TAMAYURA', FIELD.width / 2, 292, 16);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `700 16px ${FONT}`;
  spacedText(ctx, 'SPIRIT FLAME ARENA', FIELD.width / 2, 330, 6);
  ctx.fillStyle = 'rgba(242,239,230,0.85)';
  ctx.font = `400 17px ${FONT}`;
  ctx.fillText('Match your flame to the Hollow Shards. Shatter them. Feed the Nova.', FIELD.width / 2, 386);

  // The phase legend, drawn with real enemy shapes.
  const legend = [
    { phase: 0, label: 'EMBER' },
    { phase: 1, label: 'TIDE' },
    { phase: 2, label: 'BLOOM' },
  ];
  legend.forEach((item, i) => {
    const x = FIELD.width / 2 + (i - 1) * 168;
    const y = 448;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.time * 0.8 + i);
    shardPath(ctx, 'shard', 15);
    ctx.fillStyle = COLORS.shardBody;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = PHASES[item.phase].color;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, assets, assets.glows[item.phase], x, y, 44, 0.7);
    ctx.restore();
    ctx.fillStyle = PHASES[item.phase].color;
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(item.label, x, y + 38);
  });

  ctx.fillStyle = 'rgba(220,230,255,0.66)';
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText('WASD / arrows — move      mouse — aim      hold click — fire', FIELD.width / 2, 548);
  ctx.fillText('Q / E / wheel / right-click — shift phase      SPACE — Nova, when the meter is gold', FIELD.width / 2, 576);
  ctx.fillText('Wrong colours only knock a shard back — and charge your Nova.   P — pause · M — sound', FIELD.width / 2, 604);

  const pulse = 0.55 + 0.45 * Math.sin(state.time * 3.2);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = COLORS.paper;
  ctx.font = `700 19px ${FONT}`;
  spacedText(ctx, 'CLICK OR PRESS ENTER', FIELD.width / 2, 668, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(154,165,216,0.6)';
  ctx.font = `400 12px ${FONT}`;
  ctx.fillText('an original tiny arena game · plays offline in your browser', FIELD.width / 2, FIELD.height - 18);
  ctx.restore();
}

function drawOver(ctx, state) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,18,0.58)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FF8A94';
  ctx.font = `700 56px ${FONT_DISPLAY}`;
  spacedText(ctx, 'THE FIRE FADES', FIELD.width / 2, 268, 8);
  ctx.fillStyle = COLORS.paper;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(String(state.score), FIELD.width / 2, 348);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `700 12px ${FONT}`;
  spacedText(ctx, 'FINAL SCORE', FIELD.width / 2, 318, 3);
  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = 'rgba(242,239,230,0.85)';
  ctx.fillText(
    `best ${Math.max(state.best, state.score)}    ·    wave ${state.wave}    ·    shards shattered ${state.stats.kills}    ·    novas ${state.stats.novas}`,
    FIELD.width / 2,
    392,
  );
  const pulse = 0.55 + 0.45 * Math.sin(state.time * 3.2);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = COLORS.paper;
  ctx.font = `700 18px ${FONT}`;
  spacedText(ctx, 'ENTER OR CLICK TO BURN AGAIN', FIELD.width / 2, 470, 3);
  ctx.restore();
}

export function drawScene(ctx, state, assets) {
  // Trauma shake, deterministic in state.time so staged frames are stable.
  const shake = state.trauma * state.trauma * 11;
  const sx = shake * Math.sin(state.time * 127.1);
  const sy = shake * Math.cos(state.time * 149.7);
  ctx.save();
  ctx.translate(sx, sy);

  drawBackground(ctx, state, assets);
  if (state.screen === 'title') {
    for (const d of state.drifters) {
      drawEnemy(ctx, state, assets, { ...d, r: 13 * d.scale, spawnT: 1, flash: 0, wob: d.phase }, true);
    }
  }
  for (const e of state.enemies) drawEnemy(ctx, state, assets, e, false);
  drawFx(ctx, state, assets);
  if (state.screen !== 'title') drawPlayer(ctx, state, assets);

  ctx.drawImage(assets.vignette, 0, 0);
  if (state.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255,45,70,${(state.hurtFlash * 0.28).toFixed(3)})`;
    ctx.fillRect(-70, -70, FIELD.width + 140, FIELD.height + 140);
  }
  ctx.restore();

  if (state.screen === 'play') {
    drawHud(ctx, state, assets);
    drawBanner(ctx, state);
  } else if (state.screen === 'title') {
    drawTitle(ctx, state, assets);
  } else if (state.screen === 'over') {
    drawOver(ctx, state);
  }
  if (state.paused && state.screen === 'play') {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,18,0.5)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.paper;
    ctx.font = `700 34px ${FONT_DISPLAY}`;
    spacedText(ctx, 'PAUSED', FIELD.width / 2, FIELD.height / 2, 10);
    ctx.restore();
  }
}

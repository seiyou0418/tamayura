// TAMAYURA — entry point. Wires the canvas, input, audio and the fixed-step
// loop together, and handles the two ways the page is opened:
//   · plain: a live game, seeded from the clock.
//   · ?shot=start|play|nova|end&seed=N: one staged, deterministic frame of the
//     real simulation, for screenshots (window.__tamayura.ready flags it).

import { FIELD, STEP } from './config.js';
import { makeRng } from './random.js';
import { EV, makeWorld } from './world.js';
import { drawScene, makeAssets } from './render.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const view = { dpr: 1, scale: 1, ox: 0, oy: 0 };
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(window.innerWidth * view.dpr);
  canvas.height = Math.round(window.innerHeight * view.dpr);
  view.scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  view.ox = (window.innerWidth - FIELD.width * view.scale) / 2;
  view.oy = (window.innerHeight - FIELD.height * view.scale) / 2;
}
window.addEventListener('resize', resize);
resize();

function toLogical(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.ox) / view.scale,
    y: (clientY - rect.top - view.oy) / view.scale,
  };
}

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const rng = makeRng(shotName ? seedParam * 7919 + 13 : (Date.now() % 2147483646) + 1);
const world = makeWorld(rng);
const assets = makeAssets();
const audio = makeAudio();
const input = makeInput(canvas, toLogical);

// The best score survives between visits where storage is allowed.
try {
  const saved = Number.parseInt(window.localStorage.getItem('tamayura-best') ?? '0', 10);
  if (Number.isFinite(saved) && saved > 0) world.state.best = saved;
} catch { /* storage is a nicety, never a requirement */ }
function persistBest() {
  try {
    window.localStorage.setItem('tamayura-best', String(world.state.best));
  } catch { /* ignore */ }
}

function playEvents(events) {
  const state = world.state;
  if (events & EV.SHOOT) audio.shoot(state.player.phase);
  if (events & EV.SWITCH) audio.switchPhase();
  if (events & EV.WRONG) audio.wrongHit();
  if (events & EV.KILL) audio.kill();
  if (events & EV.PICKUP) audio.pickup();
  if (events & EV.NOVA) audio.nova();
  if (events & EV.HURT) audio.hurt();
  if (events & EV.WAVE) audio.wave();
  if (events & EV.START) audio.start();
  if (events & EV.OVER) {
    audio.over();
    persistBest();
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070F';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
  drawScene(ctx, world.state, assets);
}

let lastStatus = '';
function updateStatus() {
  const s = world.state;
  const text = s.screen === 'play'
    ? `Playing. Score ${s.score}. Lives ${s.lives}. Wave ${s.wave}.`
    : s.screen === 'over'
      ? `Game over. Final score ${s.score}. Press Enter to play again.`
      : 'Tamayura. Press Enter or click to start.';
  if (text !== lastStatus) {
    lastStatus = text;
    statusEl.textContent = text;
  }
}

window.__tamayura = { world, state: world.state, stageShot, ready: false };

if (shotName) {
  // Staged screenshot: run the scene, draw the single frame it lands on.
  const screen = stageShot(shotName, world);
  draw();
  window.__tamayura.ready = true;
  window.__tamayura.shot = shotName;
  window.__tamayura.screen = screen;
  updateStatus();
} else {
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', (event) => {
    unlock();
    if (event.code === 'KeyM') {
      const muted = audio.toggleMute();
      statusEl.textContent = muted ? 'Sound off.' : 'Sound on.';
    }
  });
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    const record = input.poll(world.state.player);
    if (record.pause && world.state.screen === 'play') {
      world.state.paused = !world.state.paused;
    }
    if (!world.state.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 12) {
        playEvents(world.step(STEP, record));
        acc -= STEP;
        steps += 1;
      }
      if (steps === 12) acc = 0;
    }
    draw();
    updateStatus();
  };
  requestAnimationFrame(frame);
  window.__tamayura.ready = true;
}

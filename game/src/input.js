// Keyboard and mouse, translated each frame into the plain input record the
// world consumes: { mx, my, aimX, aimY, fire, phaseDelta, phaseSet, nova,
// start, pause }. The world never touches the DOM, which is what lets the
// screenshot staging drive it with a scripted pilot instead.

export function makeInput(canvas, toLogical) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, seen: false };
  let phaseDelta = 0;
  let phaseSet = -1;
  let novaQueued = false;
  let startQueued = false;
  let pauseQueued = false;

  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
    'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight',
  ]);

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyQ') phaseDelta -= 1;
    if (event.code === 'KeyE' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') phaseDelta += 1;
    if (event.code === 'Digit1') phaseSet = 0;
    if (event.code === 'Digit2') phaseSet = 1;
    if (event.code === 'Digit3') phaseSet = 2;
    if (event.code === 'Space') novaQueued = true;
    if (event.code === 'Enter' || event.code === 'KeyR') startQueued = true;
    if (event.code === 'KeyP' || event.code === 'Escape') pauseQueued = true;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.seen = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.seen = true;
    if (event.button === 0) {
      mouse.down = true;
      startQueued = true;
    }
    if (event.button === 2) phaseDelta += 1;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    phaseDelta += event.deltaY > 0 ? 1 : -1;
  }, { passive: false });

  /** The input record for one simulation step; one-shot queues are consumed. */
  function poll(player) {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    // With no mouse yet, aim where the player last faced (movement direction).
    const aimX = mouse.seen ? mouse.x : player.x + Math.cos(player.face) * 120;
    const aimY = mouse.seen ? mouse.y : player.y + Math.sin(player.face) * 120;
    const record = {
      mx,
      my,
      aimX,
      aimY,
      fire: mouse.down,
      phaseDelta,
      phaseSet,
      nova: novaQueued,
      start: startQueued,
      pause: pauseQueued,
    };
    phaseDelta = 0;
    phaseSet = -1;
    novaQueued = false;
    startQueued = false;
    pauseQueued = false;
    return record;
  }

  return { poll, mouse };
}

/** A silent input record (title screens, staged scenes before the pilot acts). */
export function idleInput(player) {
  return {
    mx: 0,
    my: 0,
    aimX: player.x + Math.cos(player.face) * 120,
    aimY: player.y + Math.sin(player.face) * 120,
    fire: false,
    phaseDelta: 0,
    phaseSet: -1,
    nova: false,
    start: false,
    pause: false,
  };
}

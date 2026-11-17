// TAMAYURA — tuning constants. Everything the game balances on lives here so the
// world, the renderer and the screenshot staging all agree on the same numbers.

/** Logical field size. The renderer scales this to fit any window, so a run and
 *  a screenshot always compose the same picture. */
export const FIELD = { width: 1280, height: 800 };

/** Fixed simulation step (seconds). The world never advances by a raw frame dt. */
export const STEP = 1 / 120;

export const PLAYER = {
  radius: 13,
  speed: 272,
  lives: 3,
  fireInterval: 0.115,
  invulnerableSeconds: 1.6,
  switchCooldown: 0.14,
};

export const BOLT = { speed: 590, radius: 4, lifeSeconds: 1.15 };

/** The three flame phases. A bolt only shatters a shard of its own phase; any
 *  other colour just knocks the shard back and feeds the Nova meter. */
export const PHASES = [
  { name: 'EMBER', color: '#FF6A4D', soft: '#FFB59D', deep: '#8F2D1B' },
  { name: 'TIDE', color: '#41C7FF', soft: '#A8E6FF', deep: '#155E7A' },
  { name: 'BLOOM', color: '#51F2A0', soft: '#B2FFD9', deep: '#14714A' },
];

export const NOVA = {
  max: 100,
  radius: 252,
  seconds: 0.45,
  chargePerWrongHit: 12,
  chargePerKill: 4,
  chargePerEmber: 6,
};

export const COMBO = { windowSeconds: 3, killsPerStep: 6, maxMultiplier: 8 };

export const EMBER_DROP_CHANCE = 0.35;

/** Enemy kinds: shape, pace, toughness and worth. `hp` counts matching hits. */
export const ENEMIES = {
  shard: { radius: 13, speedMin: 56, speedMax: 86, hp: 1, score: 50 },
  weaver: { radius: 12, speedMin: 98, speedMax: 128, hp: 1, score: 80 },
  hulk: { radius: 26, speedMin: 32, speedMax: 40, hp: 3, score: 200 },
};

/** Wave shape: how many shards pour in, how fast, and what joins them. */
export function wavePlan(wave) {
  const surge = wave % 5 === 0;
  let budget = 6 + 4 * (wave - 1);
  if (surge) budget = Math.round(budget * 1.4);
  let interval = Math.max(0.42, 1.05 - 0.06 * (wave - 1));
  if (surge) interval *= 0.62;
  return {
    budget,
    interval,
    weaverChance: wave < 2 ? 0 : Math.min(0.45, 0.14 + 0.05 * (wave - 2)),
    hulkChance: wave < 3 ? 0 : Math.min(0.2, 0.06 + 0.03 * (wave - 3)),
    surge,
  };
}

export const COLORS = {
  ink: '#0A0E24',
  inkTop: '#131A3E',
  ridge: '#0D1330',
  torii: '#171F45',
  toriiRim: '#2C3A75',
  moon: '#F7DC9A',
  gold: '#FFC95E',
  paper: '#F2EFE6',
  dim: '#9AA5D8',
  danger: '#FF4D5E',
  shardBody: '#151B36',
};

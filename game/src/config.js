// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.
// Gobble Run: a turkey sprints across the farm toward the forest while the farmer chases it.

export const FIELD = { width: 1280, height: 720, groundY: 618 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How many world pixels make one metre of the escape. */
export const PX_PER_M = 24;

/** Distance to the forest, in metres: reaching it means the turkey escaped. */
export const GOAL_M = 1500;

export const PLAYER = {
  x: 220,
  width: 64,
  height: 58,
  slideHeight: 30,
  /** Jump speed: with GRAVITY this clears about 185 px, enough for the oven. */
  jumpSpeed: 1020,
  /** Extra lift while the jump key is held, for a floatier feel. */
  holdLift: 420,
  /** Grace after leaving the ground, and jump presses remembered, in seconds. */
  coyote: 0.09,
  buffer: 0.12,
  invulnerable: 1.6,
};

export const GRAVITY = 3000;

export const RUN = {
  startSpeed: 380,
  maxSpeed: 660,
  /** Speed gained per metre of the escape. */
  accelPerM: 0.16,
};

export const HEARTS = 3;

/** The farmer starts this many pixels behind the turkey; a hit pulls him closer. */
export const FARMER = {
  startGap: 250,
  hitPull: 95,
  /** Pixels the gap recovers per second while the turkey runs clean. */
  recover: 9,
  /** Below this gap the farmer is close enough to grab: caught. */
  grabGap: 26,
};

export const OBSTACLE = {
  /** Seconds between spawns at the start, shrinking as the run goes on. */
  intervalStart: 1.35,
  intervalEnd: 0.85,
  intervalJitter: 0.45,
};

/**
 * The ground obstacles, in KIND_* order (hay, fence, pumpkin, oven): size and spawn
 * weight. The oven's weight grows with the run: its effective weight is
 * weight * (lateMin + (1 - lateMin) * progress), so it is rare early and common late;
 * any roll past the total weight falls back to hay, as before.
 */
export const OBSTACLE_KINDS = [
  { key: 'hay', width: 74, height: 48, weight: 0.3 },
  { key: 'fence', width: 30, height: 66, weight: 0.22 },
  { key: 'pumpkin', width: 46, height: 38, weight: 0.22 },
  { key: 'oven', width: 116, height: 100, weight: 0.26, lateMin: 0.3 },
];

/** Milestone distances (metres) that flash a banner, and how long it stays up. */
export const MILESTONES = [500, 1000];
export const MILESTONE_DURATION = 2.5;

export const KNIFE = {
  width: 66,
  height: 34,
  /** Extra speed over the run speed, so knives overtake the turkey. */
  extraSpeed: 300,
  intervalStart: 3.0,
  intervalEnd: 1.9,
  intervalJitter: 0.9,
  /** Height of the blade's centre above the ground: it clears a sliding turkey's back
    but catches a standing one at the neck, so sliding (or an early jump) dodges it. */
  flyHeight: 45,
};

export const CORN = {
  size: 22,
  points: 10,
  goldenPoints: 25,
  /** Seconds between corn arcs. */
  interval: 1.9,
  intervalJitter: 0.9,
  /** Chance an arc is golden corn instead of plain kernels. */
  goldenChance: 0.22,
};

export const SCORE = {
  perMetre: 1,
  dodgePoints: 5,
};

/** Seconds of play per level: speeds and spawn rates stop growing at the last level. */
export const LEVEL = { seconds: 15, max: 10 };

/** How many obstacles, knives and corn kernels can exist at once; pools are allocated once. */
export const POOL_SIZE = 72;

/** The sky's three times of day, crossed as the turkey nears the forest. */
export const SKY = [
  { top: '#ffb347', mid: '#ff7e3d', low: '#e85d3d', sun: '#fff3b0', sunY: 120 },
  { top: '#ff8a4c', mid: '#e8546b', low: '#8e3b6e', sun: '#ffd166', sunY: 190 },
  { top: '#5b3a75', mid: '#3d2b5c', low: '#241a38', sun: '#f4ead5', sunY: 260 },
];

export const PALETTE = {
  backdrop: '#2b1a2e',
  ground: '#7a4a22',
  groundTop: '#9c6a35',
  grass: '#7fae4c',
  grassDry: '#d9a441',
  barn: '#a63a2e',
  barnRoof: '#6e2a22',
  fenceWood: '#8a5a2e',
  fenceDark: '#6b4423',
  hay: '#e8b64c',
  hayBand: '#b98a2e',
  pumpkin: '#e8722a',
  pumpkinDark: '#c85a1a',
  ovenBrick: '#9e4a3a',
  ovenDark: '#7c362b',
  fire: '#ffb347',
  fireCore: '#ffe08a',
  knife: '#dfe6ee',
  knifeEdge: '#f7fafc',
  knifeHandle: '#5a3a22',
  corn: '#f6c945',
  cornHusk: '#5e9e3f',
  golden: '#ffd94d',
  turkeyBody: '#8a5230',
  turkeyDark: '#6e3f22',
  tail: ['#a0522d', '#d2691e', '#e8a33c', '#c96a2e', '#f0b45a'],
  head: '#f2e6d0',
  beak: '#e8a33c',
  wattle: '#e5534b',
  farmerShirt: '#c94f42',
  farmerOveralls: '#3f6fb5',
  farmerSkin: '#e8b88a',
  farmerHat: '#e8c96a',
  panel: 'rgba(24, 14, 26, 0.88)',
  panelEdge: '#e8a33c',
  text: '#fff6e8',
  muted: '#e8cfa8',
  danger: '#ff5a4e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'gobble-run.best';

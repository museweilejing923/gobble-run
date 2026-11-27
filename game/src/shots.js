// The screenshot scenes behind ?shot=start|play|chase|end|win. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (jump the ground obstacles in time, slide under the knives, hop for the corn arcs), so the
// frame is what a short game really looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, KIND_FENCE, KIND_KNIFE, KIND_OVEN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 18;
const END_LIMIT_SECONDS = 600;
const WIN_LIMIT_SECONDS = 120;

/** How early, in seconds before the turkey reaches it, the pilot jumps an obstacle. */
const JUMP_LEAD = 0.32;
/** How early the pilot ducks under a knife, and how long it stays down. */
const SLIDE_LEAD = 0.42;
/** The end scene's pilot reacts too late, as a hurried player does. */
const LATE_LEAD = 0.1;

/** The hitbox front edge, in pixels from the player's x: 16 inset + 44 hitbox. */
const HITBOX_FRONT = 60;

/** Seconds until the turkey's front reaches `x`, at the world's current speed. */
function timeToReach(state, x) {
  return Math.max(0, (x - (state.player.x + HITBOX_FRONT)) / state.speed);
}

/**
 * One autopilot decision for this step: jump, slide, or run on. The pilot jumps the nearest
 * ground obstacle, slides under an incoming knife, and hops for a corn arc when the way is
 * clear. `lead` is how early it jumps: a short lead is a late, human reaction. A `clumsy`
 * pilot never slides and never jumps a fence or the oven, so it is caught in the end.
 * Priority: an obstacle in the jump window is jumped first — a well-timed jump clears a
 * knife arriving with it, since the turkey is high by then. While waiting for the jump
 * moment it still slides for a knife that arrives first. It only dives for a knife when
 * the landing is clear, and only hops for corn when the next obstacle is far away.
 */
function autopilot(state, lead, clumsy) {
  const player = state.player;
  // The nearest ground obstacle and the nearest knife still ahead, with times to impact.
  let nearest = null;
  for (let i = 0; i < state.obstacles.length; i += 1) {
    const item = state.obstacles[i];
    if (!item.active) continue;
    if (item.x + item.width < player.x) continue;
    if (nearest === null || item.x < nearest.x) nearest = item;
  }
  let knifeTime = Infinity;
  for (let i = 0; i < state.knives.length; i += 1) {
    const knife = state.knives[i];
    if (!knife.active) continue;
    if (knife.x + knife.width < player.x) continue;
    const time = Math.max(0, (knife.x - (player.x + HITBOX_FRONT)) / (state.speed + 300));
    if (time < knifeTime) knifeTime = time;
  }
  const obstacleTime = nearest === null ? Infinity : timeToReach(state, nearest.x);
  // The nearest ground obstacle: jump it in time, but not so early the turkey lands on it.
  if (nearest !== null) {
    // A wide obstacle (the oven) is jumped later, so the turkey is still high over its far edge.
    const wide = nearest.width > 90 ? -0.13 : 0;
    const jumpAt = lead + wide;
    if (obstacleTime < jumpAt) {
      if (clumsy && (nearest.kind === KIND_FENCE || nearest.kind === KIND_OVEN)) return { jump: false, slide: false };
      return { jump: true, slide: false };
    }
    // Waiting for the jump moment: still slide for a knife that arrives first.
    if (obstacleTime < jumpAt + 0.3) {
      if (!clumsy && knifeTime < obstacleTime - jumpAt) return { jump: false, slide: true };
      return { jump: false, slide: false };
    }
  }
  // A knife at head height, closing fast: get low (or dive, if airborne and the landing is clear).
  if (!clumsy && knifeTime < SLIDE_LEAD) return { jump: false, slide: true };
  if (!player.onGround) return { jump: false, slide: knifeTime < 0.3 && obstacleTime > 0.4 };
  // A corn arc ahead and nothing to jump over or duck under: hop for it.
  if (!clumsy && knifeTime > 0.7 && obstacleTime > 1.0) {
    for (let i = 0; i < state.corns.length; i += 1) {
      const corn = state.corns[i];
      if (!corn.active) continue;
      const time = timeToReach(state, corn.x);
      if (time > 0.05 && time < lead) return { jump: true, slide: false };
    }
  }
  return { jump: false, slide: false };
}

/** A frame worth judging: an oven on screen, a knife closing in, and corn to eat.
  The old fixed-time frames were often empty (no oven, no knife, the farmer off
  screen), because the spawns are random: now staging waits for a dense frame. */
function frameIsDense(state) {
  let oven = false;
  let obstacle = false;
  let knife = false;
  let corn = false;
  for (let i = 0; i < state.obstacles.length; i += 1) {
    const item = state.obstacles[i];
    if (!item.active) continue;
    if (item.x > 280 && item.x < 1050) obstacle = true;
    if (item.kind === KIND_OVEN && item.x > 280 && item.x < 1050) oven = true;
  }
  for (let i = 0; i < state.knives.length; i += 1) {
    const item = state.knives[i];
    if (item.active && item.x > 350 && item.x < 1150) knife = true;
  }
  for (let i = 0; i < state.corns.length; i += 1) {
    if (state.corns[i].active) corn = true;
  }
  return oven && obstacle && knife && corn;
}

/**
 * Set `world` to the named scene (start, play, chase, end or win; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'chase' && name !== 'end' && name !== 'win') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, false, false, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'win') {
    // Start almost at the forest, then run the last stretch out.
    world.state.distance = 1420;
    world.state.scrollX = 1420 * 24;
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : name === 'win' ? WIN_LIMIT_SECONDS : name === 'chase' ? CHASE_SECONDS : PLAY_SECONDS;
  const lead = name === 'end' ? LATE_LEAD : JUMP_LEAD;
  const clumsy = name === 'end';
  let lastJump = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    const decision = autopilot(world.state, lead, clumsy);
    const jumpPressed = decision.jump && !lastJump;
    lastJump = decision.jump;
    const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
    if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
    if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
  }
  if (name === 'play') {
    // The fixed 24s frame was often empty, so keep running (at most 40s more)
    // until an oven, a knife and corn are all on screen at once.
    for (let i = 0; i < 40 / STEP && !frameIsDense(world.state); i += 1) {
      const decision = autopilot(world.state, lead, false);
      const jumpPressed = decision.jump && !lastJump;
      lastJump = decision.jump;
      const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    }
    // Bring the farmer into the frame: at the natural gap he has drifted off the
    // left edge, so the play shot never showed the chase at all.
    world.state.farmerGap = 140;
  }
  if (name === 'chase') {
    // Wait first (at most 12s) for a dense frame, while the farmer is still at
    // his natural gap: pulling him in first would make any hit an instant grab
    // (gap 82 minus a 95 hit pull), and the extra waiting would kill the run.
    for (let i = 0; i < 12 / STEP && !frameIsDense(world.state); i += 1) {
      const decision = autopilot(world.state, lead, false);
      const jumpPressed = decision.jump && !lastJump;
      lastJump = decision.jump;
      const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    }
    // Pull the farmer right up behind the turkey for the close-call frame.
    world.state.farmerGap = 82;
    for (let i = 0; i < 2 / STEP; i += 1) {
      const decision = autopilot(world.state, lead, false);
      const jumpPressed = decision.jump && !lastJump;
      lastJump = decision.jump;
      const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    }
  }
  const over = world.state.hearts === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}

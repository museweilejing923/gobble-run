// The screenshot scenes behind ?shot=start|play|chase|end|win. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (jump the ground obstacles in time, slide under the knives, hop for the corn arcs), so the
// frame is what a short game really looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, KIND_FENCE, KIND_KNIFE, KIND_OVEN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
/** The fixed run before the play shot starts looking for a dense frame: 10s,
  not 24s. The first dense frame is usually found soon after (seed 7: 12.7s),
  while the turkey still has all three hearts; hearts never come back, so a
  frame found after a hit can only show fewer of them. */
const PLAY_SECONDS = 10;
/** Same for the chase shot: the wait for a dense frame starts at 10s, so its
  first dense frame is usually a full-heart one too. */
const CHASE_SECONDS = 10;
/** How long the chase waits for a fully dense frame (oven + knife + corn)
  before falling back to a looser one. */
const CHASE_DENSE_WAIT_SECONDS = 30;
/** How long it then waits for the looser frame (an oven or a knife, plus corn). */
const CHASE_LOOSE_WAIT_SECONDS = 6;
/** How long the chase waits for its second dense frame, and how much further
  along that frame must be than the first: the play shot stops at the first
  dense frame, so the chase needs a later one or the two shots are the same
  frame with the farmer nudged (seed 7: both were score 494, 209m, identical
  layout). 100m is about 5 seconds of running — score, distance and the whole
  obstacle layout have all changed by then — and a shorter gain keeps the
  second frame findable before the autopilot's luck runs out (seed 6's second
  dense frame is only 115m past its first; at 150m the chase died first). */
const CHASE_SECOND_WAIT_SECONDS = 30;
const CHASE_SECOND_MIN_GAIN_M = 100;
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
  screen), because the spawns are random: now staging waits for a dense frame.
  Everything counted must be fully inside the frame, not clipped at an edge:
  the play shot once caught a corn arc and the farmer's pitchfork half off
  screen, because a single kernel at x 5 counted as "corn on screen". */
function frameIsDense(state) {
  let oven = false;
  let obstacle = false;
  let knife = false;
  let corn = false;
  for (let i = 0; i < state.obstacles.length; i += 1) {
    const item = state.obstacles[i];
    if (!item.active) continue;
    if (item.x > 40 && item.x + item.width < 1240) obstacle = true;
    if (item.kind === KIND_OVEN && item.x > 40 && item.x + item.width < 1240) oven = true;
  }
  for (let i = 0; i < state.knives.length; i += 1) {
    const item = state.knives[i];
    if (item.active && item.x > 40 && item.x + item.width < 1240) knife = true;
  }
  for (let i = 0; i < state.corns.length; i += 1) {
    const item = state.corns[i];
    if (!item.active) continue;
    // At least one kernel fully in frame and well clear of the edges.
    if (item.x > 100 && item.x + item.size < 1180) corn = true;
  }
  return oven && obstacle && knife && corn;
}

/** The fallback frame: an oven or a knife, plus corn, all fully in frame.
  Used only when no fully dense frame turns up in the chase wait. */
function frameIsLoose(state) {
  let hot = false;
  let corn = false;
  for (let i = 0; i < state.obstacles.length; i += 1) {
    const item = state.obstacles[i];
    if (!item.active) continue;
    if (item.kind === KIND_OVEN && item.x > 40 && item.x + item.width < 1240) hot = true;
  }
  for (let i = 0; i < state.knives.length; i += 1) {
    const item = state.knives[i];
    if (item.active && item.x > 40 && item.x + item.width < 1240) hot = true;
  }
  for (let i = 0; i < state.corns.length; i += 1) {
    const item = state.corns[i];
    if (!item.active) continue;
    // At least one kernel fully in frame and well clear of the edges.
    if (item.x > 100 && item.x + item.size < 1180) corn = true;
  }
  return hot && corn;
}

/** Shift the scenery (scrollX only) until the barn sits just right of the
  centred over panel, which spans 260..1020: the barn's x is
  1020 - ((scrollX * 0.3 + 490) % 1600), so a barn at 955..975 needs that
  modulo at 45..65. Stepping scrollX by 10 moves the modulo by 3, so the
  window is reached within a few steps; the cap is one full cycle, far more
  than needed. scrollX is a render-only input (the world writes it but never
  reads it), so moving it changes nothing about the run that just ended —
  only where the scenery sits in the frozen frame. */
function nudgeBarnRightOfPanel(state) {
  for (let i = 0; i < 600; i += 1) {
    const mod = ((state.scrollX * 0.3 + 490) % 1600 + 1600) % 1600;
    if (mod >= 45 && mod <= 65) return;
    state.scrollX += 10;
  }
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
  /**
   * The frozen frame for a caught run: the turkey is drawn, not blinked away.
   * A hit sets invulnerable for 1.6s and the renderer hides the turkey one
   * frame in four while it lasts, so the staged end frame caught the turkey
   * mid-blink (invisible) on every seed. Clearing it here is staging-only:
   * the real game's blink is untouched, and the frame is drawn after staging.
   */
  function overResult() {
    world.state.player.invulnerable = 0;
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  for (let i = 0; i < limit / STEP; i += 1) {
    const decision = autopilot(world.state, lead, clumsy);
    const jumpPressed = decision.jump && !lastJump;
    lastJump = decision.jump;
    const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
    if (events & EVENT_OVER) {
      // The end scene's barn is shifted right of the panel before the frame
      // is drawn (see nudgeBarnRightOfPanel); other scenes keep what they have.
      if (name === 'end') nudgeBarnRightOfPanel(world.state);
      return overResult();
    }
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
      if (events & EVENT_OVER) return overResult();
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    }
    // Bring the farmer into the frame: at the natural gap he has drifted off the
    // left edge, so the play shot never showed the chase at all. Gap 120 puts
    // him at x 38, his pitchfork (a few pixels left of him) still in frame —
    // and exactly at the red edge pulse's threshold, so the pulse (which fires
    // under gap 120) stays off: in a still frame the pulse reads as a red
    // smear down the left edge, not as a warning. The warning pill and the
    // "!" both fire under 130, so the frame still reads as a close call.
    world.state.farmerGap = 120;
  }
  if (name === 'chase') {
    // Wait (at most 30s) for a dense frame: an oven, a knife and corn all
    // fully in frame. The wait starts at 10s, so the first dense frame is
    // usually caught while the turkey still has all three hearts (seed 7:
    // 12.7s, 3 hearts); hearts never come back, so a frame found after a hit
    // can only show fewer, and waiting longer after a hit cannot recover a
    // full-heart frame — the early start is the whole preference.
    for (let i = 0; i < CHASE_DENSE_WAIT_SECONDS / STEP && !frameIsDense(world.state); i += 1) {
      const decision = autopilot(world.state, lead, false);
      const jumpPressed = decision.jump && !lastJump;
      lastJump = decision.jump;
      const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
      if (events & EVENT_OVER) return overResult();
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
    }
    // The play shot stops at the first dense frame, so the chase must move on:
    // wait for a second dense frame at least CHASE_SECOND_MIN_GAIN_M further
    // along, or the two shots are the same frame with the farmer nudged.
    // If no second dense frame turns up in the wait, the loose fallback below
    // still takes whatever the run has reached — a later frame than the play
    // shot's, just not a dense one.
    if (frameIsDense(world.state)) {
      const firstDenseDist = world.state.distance;
      for (let i = 0; i < CHASE_SECOND_WAIT_SECONDS / STEP && !(frameIsDense(world.state) && world.state.distance >= firstDenseDist + CHASE_SECOND_MIN_GAIN_M); i += 1) {
        const decision = autopilot(world.state, lead, false);
        const jumpPressed = decision.jump && !lastJump;
        lastJump = decision.jump;
        const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
        if (events & EVENT_OVER) return overResult();
        if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
      }
    }
    // If no dense frame turned up, take a looser one (an oven or a knife,
    // plus corn) rather than an empty frame; if that never comes either,
    // take what is there.
    if (!frameIsDense(world.state)) {
      for (let i = 0; i < CHASE_LOOSE_WAIT_SECONDS / STEP && !frameIsLoose(world.state); i += 1) {
        const decision = autopilot(world.state, lead, false);
        const jumpPressed = decision.jump && !lastJump;
        lastJump = decision.jump;
        const events = world.step(STEP, jumpPressed, decision.jump, decision.slide, false);
        if (events & EVENT_OVER) return overResult();
        if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
      }
    }
    // Pull the farmer right up behind the turkey for the close-call frame and
    // stop here: running on after the pull is what used to lose the oven or
    // the knife (the world moves a screen width in two seconds), so a frame
    // that was dense when found came back empty. Gap 125 puts him at x 33,
    // closer than the play shot's 120, with the warning and the "!" both
    // firing under 130 — and exactly clear of the red edge pulse (which
    // fires under gap 120), so no red smear down the left edge. No steps
    // run after the pull, so no hit can turn it into a grab.
    world.state.farmerGap = 125;
  }
  // Hearts at zero means the run ended without the event firing on the last
  // step; the frozen frame still shows the turkey (see overResult).
  if (world.state.hearts === 0) return overResult();
  return { screen: SCREEN_PLAY, best: world.state.score };
}

// The game's rules and state, with no drawing and no browser in it: the running turkey, the
// farmer chasing it, the hay bales, fences, pumpkins and oven to jump, the carving knives to
// slide under, the corn to eat, the distance to the forest, score and hearts. step() advances
// one fixed step and returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound. Nothing here allocates after createWorld returns.
import {
  CORN, FARMER, FIELD, GOAL_M, GRAVITY, HEARTS, KNIFE, LEVEL, MILESTONES, OBSTACLE,
  OBSTACLE_KINDS, PLAYER, POOL_SIZE, PX_PER_M, RUN, SCORE,
} from './config.js';

export const KIND_HAY = 0;
export const KIND_FENCE = 1;
export const KIND_PUMPKIN = 2;
export const KIND_OVEN = 3;
export const KIND_KNIFE = 4;
export const KIND_CORN = 5;

export const EVENT_HIT = 1;
export const EVENT_CORN = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_JUMP = 16;
export const EVENT_LAND = 32;

/** A forgiving hitbox: the drawn turkey is fluffier than the box that can be hit.
  The turkey is drawn wider now (76), so the box is inset further sideways,
  keeping the hitbox the same size as before the visual enlargement (44 wide,
  50 tall standing). A dive counts as a slide for the hitbox: holding down in
  the air tucks the turkey, so a knife that used to clip its feet while diving
  now passes over it. */
function hitbox(player) {
  const height = (player.sliding || player.diving) ? PLAYER.slideHeight : PLAYER.height;
  return {
    x: player.x + 16,
    y: player.y + (PLAYER.height - height) + 6,
    width: PLAYER.width - 32,
    height: height - 8,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function createWorld(random) {
  const player = {
    x: PLAYER.x, y: FIELD.groundY - PLAYER.height, vy: 0,
    onGround: true, sliding: false, diving: false, invulnerable: 0, coyote: 0, buffer: 0, fallStart: 0,
  };
  const obstacles = [];
  const knives = [];
  const corns = [];
  const particles = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    obstacles.push({ active: false, kind: KIND_HAY, x: 0, y: 0, width: 0, height: 0, passed: false });
    knives.push({ active: false, x: 0, y: 0, width: 0, height: 0, spin: 0, passed: false });
    corns.push({ active: false, golden: false, x: 0, y: 0, size: 0 });
    particles.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
  }
  const state = {
    player, obstacles, knives, corns, particles,
    score: 0, hearts: HEARTS, level: 1, elapsed: 0,
    distance: 0, speed: RUN.startSpeed, farmerGap: FARMER.startGap,
    obstacleTimer: 1, knifeTimer: 2.2, cornTimer: 1.2, scrollX: 0,
    runTime: 0, milestone: 0, milestoneAt: -999,
    // Combo streak: consecutive corn and dodges without a hit. Toast: one short
    // line the renderer shows for 2 seconds (combo milestones, near-miss, level-up).
    combo: 0, comboTimer: 0, toast: '', toastAt: -999,
  };

  /** Show a short toast line. Callers only call this in real play, never on
    the title screen's harmless run. */
  function setToast(message) {
    state.toast = message;
    state.toastAt = state.elapsed;
  }

  /** One more clean scoring action: the streak grows and its timer refreshes,
    capped so the score cannot run away on a long clean run. */
  function buildCombo() {
    state.combo = Math.min(SCORE.comboMax, state.combo + 1);
    state.comboTimer = SCORE.comboWindow;
  }

  function reset() {
    player.x = PLAYER.x;
    player.y = FIELD.groundY - PLAYER.height;
    player.vy = 0;
    player.onGround = true;
    player.sliding = false;
    player.diving = false;
    player.invulnerable = 0;
    player.coyote = 0;
    player.buffer = 0;
    for (const item of obstacles) item.active = false;
    for (const item of knives) item.active = false;
    for (const item of corns) item.active = false;
    for (const item of particles) item.active = false;
    state.score = 0;
    state.hearts = HEARTS;
    state.level = 1;
    state.elapsed = 0;
    state.distance = 0;
    state.speed = RUN.startSpeed;
    state.farmerGap = FARMER.startGap;
    state.obstacleTimer = 1;
    state.knifeTimer = 2.2;
    state.cornTimer = 1.2;
    state.scrollX = 0;
    state.runTime = 0;
    state.milestone = 0;
    state.milestoneAt = -999;
    state.combo = 0;
    state.comboTimer = 0;
    state.toast = '';
    state.toastAt = -999;
  }

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, kind, count, spread) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (p === null) return;
      p.active = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = (random() - 0.5) * spread;
      p.vy = -random() * spread * 0.7;
      p.life = 0.5 + random() * 0.4;
      p.max = p.life;
    }
  }

  /** How far through the escape the turkey is, 0 at the farmhouse, 1 at the forest. */
  function progress() {
    return Math.min(1, state.distance / GOAL_M);
  }

  function spawnObstacle() {
    const item = free(obstacles);
    if (item === null) return;
    const roll = random();
    const late = progress();
    // Walk the kinds table in config: each kind takes its weight's slice of the roll.
    // A roll past the total weight falls back to hay, as before.
    let kind = KIND_HAY;
    let acc = 0;
    for (let i = 0; i < OBSTACLE_KINDS.length; i += 1) {
      const entry = OBSTACLE_KINDS[i];
      const weight = entry.lateMin === undefined
        ? entry.weight
        : entry.weight * (entry.lateMin + (1 - entry.lateMin) * late);
      acc += weight;
      if (roll < acc) { kind = i; break; }
    }
    const dims = OBSTACLE_KINDS[kind];
    item.active = true;
    item.kind = kind;
    item.width = dims.width;
    item.height = dims.height;
    item.x = FIELD.width + 90;
    item.y = FIELD.groundY - dims.height;
    item.passed = false;
  }

  function spawnKnife() {
    const item = free(knives);
    if (item === null) return;
    item.active = true;
    item.width = KNIFE.width;
    item.height = KNIFE.height;
    item.x = FIELD.width + 60;
    item.y = FIELD.groundY - KNIFE.flyHeight - KNIFE.height / 2;
    item.spin = random() * Math.PI * 2;
    item.passed = false;
  }

  function spawnCornArc() {
    const golden = random() < CORN.goldenChance;
    const baseX = FIELD.width + 90;
    const count = golden ? 3 : 5;
    for (let i = 0; i < count; i += 1) {
      const item = free(corns);
      if (item === null) return;
      item.active = true;
      item.golden = golden;
      item.size = CORN.size;
      // An arc the turkey jumps through: low at the ends, high in the middle.
      const t = count === 1 ? 0.5 : i / (count - 1);
      item.x = baseX + i * 46;
      item.y = FIELD.groundY - 52 - Math.sin(t * Math.PI) * 118;
    }
  }

  function hurt() {
    state.hearts -= 1;
    state.farmerGap = Math.max(0, state.farmerGap - FARMER.hitPull);
    player.invulnerable = PLAYER.invulnerable;
    // A hit breaks the streak: the combo and its toast go with it.
    state.combo = 0;
    state.comboTimer = 0;
    burst(player.x + PLAYER.width / 2, player.y + 20, 1, 10, 260);
  }

  /**
   * One fixed step. jumpPressed is a fresh jump press this step, jumpHeld while the key is
   * held, slideHeld while a slide key is down. With `harmless` set (the title screen's
   * backdrop) the turkey runs through a quiet farm: nothing hits it and nothing scores.
   */
  function step(dt, jumpPressed, jumpHeld, slideHeld, harmless) {
    let events = 0;
    state.elapsed += dt;
    const beforeLevel = state.level;
    state.level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    if (!harmless && state.level > beforeLevel) {
      setToast(`Level ${state.level} — faster!`);
    }
    // The combo fades if nothing is eaten or dodged for a while.
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    state.speed = harmless
      ? 300
      : Math.min(RUN.maxSpeed, RUN.startSpeed + state.distance * RUN.accelPerM);
    state.distance += (state.speed * dt) / PX_PER_M;
    state.scrollX += state.speed * dt;
    if (!harmless) state.score += (state.speed * dt) / PX_PER_M * SCORE.perMetre;
    if (!harmless) state.runTime += dt;
    // Milestones: crossing 500m / 1000m records the banner to flash (see render.js).
    if (!harmless) {
      for (let i = 0; i < MILESTONES.length; i += 1) {
        if (state.distance >= MILESTONES[i] && state.milestone < MILESTONES[i]) {
          state.milestone = MILESTONES[i];
          state.milestoneAt = state.elapsed;
        }
      }
    }

    // --- the turkey's jump and slide ---
    if (jumpPressed) player.buffer = PLAYER.buffer;
    else player.buffer = Math.max(0, player.buffer - dt);
    if (player.onGround) player.coyote = PLAYER.coyote;
    else player.coyote = Math.max(0, player.coyote - dt);
    if (player.buffer > 0 && (player.onGround || player.coyote > 0)) {
      player.vy = -PLAYER.jumpSpeed;
      player.onGround = false;
      player.coyote = 0;
      player.buffer = 0;
      player.fallStart = player.y;
      events |= EVENT_JUMP;
    }
    if (!player.onGround && jumpHeld && player.vy < 0) player.vy -= PLAYER.holdLift * dt;
    // Slamming down while sliding in the air: a dive that lands the turkey in a slide,
    // the way out when a knife comes while it is airborne.
    if (!player.onGround && slideHeld && player.vy < 1500) player.vy = 1500;
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= FIELD.groundY - PLAYER.height) {
      if (!player.onGround && player.fallStart < player.y - 60) {
        burst(player.x + PLAYER.width / 2, FIELD.groundY, 0, 6, 120);
        events |= EVENT_LAND;
      }
      player.y = FIELD.groundY - PLAYER.height;
      player.vy = 0;
      player.onGround = true;
    }
    player.sliding = slideHeld && player.onGround;
    // Diving: holding down in the air slams the turkey down in a tuck, and the
    // tuck counts for the hitbox, so a dive is a real way out of a knife.
    player.diving = slideHeld && !player.onGround;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // --- the farmer keeps coming unless the turkey runs clean ---
    if (!harmless) {
      state.farmerGap = Math.min(FARMER.startGap, state.farmerGap + FARMER.recover * dt);
    }

    // --- spawning ---
    state.obstacleTimer -= dt;
    if (state.obstacleTimer <= 0) {
      spawnObstacle();
      const span = OBSTACLE.intervalStart + (OBSTACLE.intervalEnd - OBSTACLE.intervalStart) * progress();
      state.obstacleTimer = span + random() * OBSTACLE.intervalJitter;
    }
    if (!harmless) {
      state.knifeTimer -= dt;
      if (state.knifeTimer <= 0) {
        spawnKnife();
        const span = KNIFE.intervalStart + (KNIFE.intervalEnd - KNIFE.intervalStart) * progress();
        state.knifeTimer = span + random() * KNIFE.intervalJitter;
      }
      state.cornTimer -= dt;
      if (state.cornTimer <= 0) {
        spawnCornArc();
        state.cornTimer = CORN.interval + random() * CORN.intervalJitter;
      }
    }

    // --- movement and collisions ---
    const box = hitbox(player);
    for (let i = 0; i < obstacles.length; i += 1) {
      const item = obstacles[i];
      if (!item.active) continue;
      item.x -= state.speed * dt;
      if (item.x + item.width < -80) { item.active = false; continue; }
      if (!item.passed && item.x + item.width < player.x) {
        item.passed = true;
        if (!harmless) {
          // A clean dodge builds the combo; a streak of 5 pays the near-miss
          // bonus instead of the plain dodge points, and says so on screen.
          buildCombo();
          const streak = state.combo >= 5;
          state.score += streak ? SCORE.nearMissPoints : SCORE.dodgePoints;
          if (state.combo === 5) setToast('Near-miss streak! +15');
          else if (state.combo === 8) setToast('Combo x8 — unstoppable!');
        }
      }
      if (harmless || player.invulnerable > 0) continue;
      if (overlaps(box, item)) {
        item.active = false;
        hurt();
        events |= EVENT_HIT;
        if (state.hearts <= 0 || state.farmerGap <= FARMER.grabGap) {
          events |= EVENT_OVER;
          return events;
        }
      }
    }
    for (let i = 0; i < knives.length; i += 1) {
      const item = knives[i];
      if (!item.active) continue;
      item.x -= (state.speed + KNIFE.extraSpeed) * dt;
      item.spin += dt * 11;
      if (item.x + item.width < -80) { item.active = false; continue; }
      if (!item.passed && item.x + item.width < player.x) {
        item.passed = true;
        if (!harmless && player.invulnerable === 0) {
          buildCombo();
          state.score += state.combo >= 5 ? SCORE.nearMissPoints : SCORE.dodgePoints;
          if (state.combo === 5) setToast('Near-miss streak! +15');
        }
      }
      if (harmless || player.invulnerable > 0) continue;
      if (overlaps(box, item)) {
        item.active = false;
        hurt();
        events |= EVENT_HIT;
        if (state.hearts <= 0 || state.farmerGap <= FARMER.grabGap) {
          events |= EVENT_OVER;
          return events;
        }
      }
    }
    for (let i = 0; i < corns.length; i += 1) {
      const item = corns[i];
      if (!item.active) continue;
      item.x -= state.speed * dt;
      if (item.x + item.size < -40) { item.active = false; continue; }
      if (harmless) continue;
      const cob = { x: item.x, y: item.y, width: item.size, height: item.size };
      if (overlaps(box, cob)) {
        item.active = false;
        buildCombo();
        const base = item.golden ? CORN.goldenPoints : CORN.points;
        state.score += base + (state.combo - 1) * SCORE.comboPerStep;
        if (item.golden) {
          // Golden corn pushes the farmer back a little: a burst of energy.
          state.farmerGap = Math.min(FARMER.startGap, state.farmerGap + SCORE.goldenPushBack);
          if (state.combo >= 5) setToast(`Golden corn! Combo x${state.combo}`);
        } else if (state.combo === 5) {
          setToast('Combo x5!');
        } else if (state.combo === 8) {
          setToast('Combo x8 — unstoppable!');
        }
        burst(item.x + item.size / 2, item.y + item.size / 2, 2, 6, 140);
        events |= EVENT_CORN;
      }
    }
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
    }

    if (!harmless && state.distance >= GOAL_M) events |= EVENT_WIN;
    return events;
  }

  reset();
  return { state, reset, step, progress };
}

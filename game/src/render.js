// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Everything is flat canvas vector art in a warm Thanksgiving palette: a sunset sky
// that deepens to dusk as the turkey nears the forest, a barn and windmill on the horizon,
// fences and pumpkins scrolling by, and the turkey itself, legs pumping, tail fanned.
import {
  FIELD, FONT, GOAL_M, HEARTS, KNIFE, MILESTONE_DURATION, PALETTE, PLAYER, SKY,
} from './config.js';
import { KIND_CORN, KIND_FENCE, KIND_HAY, KIND_OVEN, KIND_PUMPKIN } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 760, top: 150, line: 36, bottom: 76 };
const HEART = 22;

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

/** A deterministic pseudo-random from an integer, for scenery that never changes. */
function hash(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline || 'alphabetic';
    // A soft shadow keeps the HUD and panel text readable over the bright sky.
    context.shadowColor = 'rgba(20, 10, 0, 0.45)';
    context.shadowBlur = 5;
    context.shadowOffsetY = 2;
    context.fillText(value, x, y);
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

  function plain(value, x, y, size, color, align, baseline) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Which of the three skies, and how far into the next one, from the escape's progress. */
  function skyBlend(progress) {
    if (progress < 0.45) return { a: SKY[0], b: SKY[1], t: progress / 0.45 };
    if (progress < 0.8) return { a: SKY[1], b: SKY[2], t: (progress - 0.45) / 0.35 };
    return { a: SKY[2], b: SKY[2], t: 0 };
  }

  function drawSky(state, progress) {
    const sky = skyBlend(progress);
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.groundY);
    gradient.addColorStop(0, mix(sky.a.top, sky.b.top, sky.t));
    gradient.addColorStop(0.55, mix(sky.a.mid, sky.b.mid, sky.t));
    gradient.addColorStop(1, mix(sky.a.low, sky.b.low, sky.t));
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.groundY + 2);
    // The low sun, sliding down as the day ends.
    const sunY = sky.a.sunY + (sky.b.sunY - sky.a.sunY) * sky.t;
    const glow = context.createRadialGradient(FIELD.width - 240, sunY, 10, FIELD.width - 240, sunY, 190);
    glow.addColorStop(0, 'rgba(255, 240, 170, 0.9)');
    glow.addColorStop(0.35, 'rgba(255, 200, 110, 0.45)');
    glow.addColorStop(1, 'rgba(255, 200, 110, 0)');
    context.fillStyle = glow;
    context.fillRect(FIELD.width - 440, sunY - 200, 400, 400);
    context.fillStyle = mix(sky.a.sun, sky.b.sun, sky.t);
    context.beginPath();
    context.arc(FIELD.width - 240, sunY, 46, 0, Math.PI * 2);
    context.fill();
    // Drifting clouds, three parallax layers: the top two are the wide sunset
    // clouds, the third is a lower mid-sky layer, now denser and wider (eight
    // clouds instead of six) so the middle of the sky is not one flat band
    // of orange between the high clouds and the birds.
    for (let layer = 0; layer < 3; layer += 1) {
      const speed = layer === 0 ? 0.12 : layer === 1 ? 0.25 : 0.4;
      const baseY = layer === 2 ? 300 : 70 + layer * 70;
      const alpha = layer === 2 ? 0.38 : 0.5;
      context.fillStyle = `rgba(255, 244, 224, ${alpha})`;
      const count = layer === 2 ? 8 : 5;
      for (let i = 0; i < count; i += 1) {
        const span = layer === 2 ? 260 : 420;
        const x = (((i * span + 140 * layer - state.scrollX * speed) % (FIELD.width + 320)) + FIELD.width + 320) % (FIELD.width + 320) - 160;
        const y = baseY + hash(i * 7 + layer * 13) * (layer === 2 ? 60 : 46);
        const w = layer === 2 ? 56 + hash(i + layer) * 34 : 66 + hash(i) * 30;
        const h = layer === 2 ? 10 + hash(i + 3) * 6 : 16 + hash(i + 3) * 8;
        context.beginPath();
        context.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
        context.ellipse(x + w * 0.6, y + 6, w * 0.65, h * 0.75, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // First stars as dusk falls.
    if (progress > 0.62) {
      context.fillStyle = `rgba(255, 255, 255, ${(progress - 0.62) * 1.8})`;
      for (let i = 0; i < 26; i += 1) {
        context.fillRect(hash(i * 3) * FIELD.width, hash(i * 5 + 1) * 240, 2.4, 2.4);
      }
    }
    // Birds crossing the sky, so the top half is never just empty orange:
    // sixteen birds drifting slower than the ground, at different heights from
    // near the sun down to the mid-sky, packed tighter so the 200..400 band
    // has birds in it instead of a bare gap between the clouds.
    context.strokeStyle = 'rgba(60, 30, 20, 0.55)';
    context.lineWidth = 3;
    context.lineCap = 'round';
    for (let i = 0; i < 16; i += 1) {
      const span = 520;
      const x = (((i * 173 + 90 - state.scrollX * 0.06) % (FIELD.width + 200)) + FIELD.width + 200) % (FIELD.width + 200) - 100;
      const y = 80 + hash(i * 17) * 300 + Math.sin(state.elapsed * 1.4 + i * 2.1) * 6;
      const flap = Math.sin(state.elapsed * 5 + i * 1.7) * 4;
      const size = 9 + hash(i * 29) * 6;
      context.beginPath();
      context.moveTo(x - size, y - flap);
      context.quadraticCurveTo(x - size / 2, y + 3, x, y);
      context.quadraticCurveTo(x + size / 2, y + 3, x + size, y - flap);
      context.stroke();
    }
  }

  function drawDistant(state) {
    // Rolling hills.
    context.fillStyle = '#8a5a34';
    context.beginPath();
    context.moveTo(0, FIELD.groundY);
    for (let x = 0; x <= FIELD.width; x += 40) {
      context.lineTo(x, FIELD.groundY - 66 - Math.sin((x + state.scrollX * 0.25) * 0.004) * 26);
    }
    context.lineTo(FIELD.width, FIELD.groundY);
    context.closePath();
    context.fill();
    // A distant pine treeline on the hill crest, so the horizon is not a bare
    // brown ridge: dark silhouettes at their own slow parallax, rooted on the
    // same hill line the hills use.
    context.fillStyle = '#4a3550';
    for (let i = 0; i < 14; i += 1) {
      const span = 130;
      const x = (((i * span + 60 - state.scrollX * 0.2) % (FIELD.width + 260)) + FIELD.width + 260) % (FIELD.width + 260) - 130;
      const crest = FIELD.groundY - 66 - Math.sin((x + state.scrollX * 0.25) * 0.004) * 26;
      const h = 34 + hash(i * 19) * 26;
      const w = 26 + hash(i * 31) * 14;
      context.beginPath();
      context.moveTo(x - w / 2, crest + 2);
      context.lineTo(x, crest - h);
      context.lineTo(x + w / 2, crest + 2);
      context.closePath();
      context.fill();
    }
    // The farmhouse barn, far off, and the windmill turning slowly. The barn's
    // phase is shifted 490 so that on the title screen (5 harmless seconds at
    // speed 300, scrollX 1500) it lands near x 80, left of the title panel,
    // instead of hiding behind it.
    const barnX = FIELD.width - 260 - ((state.scrollX * 0.3 + 490) % 1600);
    context.fillStyle = PALETTE.barn;
    context.fillRect(barnX, FIELD.groundY - 128, 150, 92);
    context.fillStyle = PALETTE.barnRoof;
    context.beginPath();
    context.moveTo(barnX - 12, FIELD.groundY - 128);
    context.lineTo(barnX + 75, FIELD.groundY - 172);
    context.lineTo(barnX + 162, FIELD.groundY - 128);
    context.closePath();
    context.fill();
    context.fillStyle = '#f2e6d0';
    context.fillRect(barnX + 58, FIELD.groundY - 84, 34, 48);
    const millX = 180 - (state.scrollX * 0.3) % 1600;
    context.fillStyle = '#7a5a44';
    context.beginPath();
    context.moveTo(millX - 22, FIELD.groundY - 40);
    context.lineTo(millX - 12, FIELD.groundY - 170);
    context.lineTo(millX + 12, FIELD.groundY - 170);
    context.lineTo(millX + 22, FIELD.groundY - 40);
    context.closePath();
    context.fill();
    const angle = state.elapsed * 0.7;
    context.strokeStyle = '#e8dcc8';
    context.lineWidth = 7;
    for (let i = 0; i < 4; i += 1) {
      const a = angle + (i * Math.PI) / 2;
      context.beginPath();
      context.moveTo(millX, FIELD.groundY - 170);
      context.lineTo(millX + Math.cos(a) * 52, FIELD.groundY - 170 + Math.sin(a) * 52);
      context.stroke();
    }
  }

  function drawGround(state) {
    context.fillStyle = PALETTE.ground;
    context.fillRect(0, FIELD.groundY, FIELD.width, FIELD.height - FIELD.groundY);
    context.fillStyle = PALETTE.groundTop;
    context.fillRect(0, FIELD.groundY, FIELD.width, 10);
    // Grass tufts and pebbles scrolling with the world.
    for (let i = 0; i < 26; i += 1) {
      const span = 96;
      const x = (((i * span - state.scrollX) % (FIELD.width + 120)) + FIELD.width + 120) % (FIELD.width + 120) - 60;
      const tuft = hash(i * 11);
      context.strokeStyle = tuft > 0.5 ? PALETTE.grass : PALETTE.grassDry;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(x, FIELD.groundY + 14 + tuft * 34);
      context.lineTo(x - 5, FIELD.groundY + 4 + tuft * 34);
      context.moveTo(x + 4, FIELD.groundY + 14 + tuft * 34);
      context.lineTo(x + 4, FIELD.groundY + 2 + tuft * 34);
      context.moveTo(x + 9, FIELD.groundY + 14 + tuft * 34);
      context.lineTo(x + 14, FIELD.groundY + 5 + tuft * 34);
      context.stroke();
    }
    // Fence posts whipping past at the back of the field.
    context.fillStyle = PALETTE.fenceWood;
    for (let i = 0; i < 9; i += 1) {
      const span = 180;
      const x = (((i * span - state.scrollX * 0.85) % (FIELD.width + 220)) + FIELD.width + 220) % (FIELD.width + 220) - 110;
      context.fillRect(x, FIELD.groundY - 58, 10, 58);
    }
    context.fillStyle = PALETTE.fenceDark;
    context.fillRect(0, FIELD.groundY - 52, FIELD.width, 6);
    context.fillRect(0, FIELD.groundY - 30, FIELD.width, 6);
    // Pumpkins resting by the fence.
    for (let i = 0; i < 6; i += 1) {
      const span = 340;
      const x = (((i * span + 120 - state.scrollX * 0.9) % (FIELD.width + 420)) + FIELD.width + 420) % (FIELD.width + 420) - 210;
      context.fillStyle = PALETTE.pumpkin;
      context.beginPath();
      context.ellipse(x, FIELD.groundY - 12, 20, 14, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.pumpkinDark;
      context.fillRect(x - 2, FIELD.groundY - 30, 5, 8);
    }
    // Foreground grass at the very bottom, scrolling faster than the ground: a
    // near layer that makes the run feel fast and the field less flat.
    context.strokeStyle = 'rgba(40, 70, 20, 0.9)';
    context.lineWidth = 3;
    for (let i = 0; i < 30; i += 1) {
      const span = 80;
      const x = (((i * span + 40 - state.scrollX * 1.15) % (FIELD.width + 160)) + FIELD.width + 160) % (FIELD.width + 160) - 80;
      const h = 12 + hash(i * 23) * 14;
      context.beginPath();
      context.moveTo(x, FIELD.height);
      context.lineTo(x - 4, FIELD.height - h);
      context.moveTo(x + 5, FIELD.height);
      context.lineTo(x + 8, FIELD.height - h * 0.8);
      context.stroke();
    }
  }

  function drawHay(item) {
    context.fillStyle = PALETTE.hay;
    roundRect(context, item.x, item.y, item.width, item.height, 12);
    context.fill();
    context.strokeStyle = PALETTE.hayBand;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(item.x + 8, item.y + 14);
    context.lineTo(item.x + item.width - 8, item.y + 14);
    context.moveTo(item.x + 8, item.y + item.height - 14);
    context.lineTo(item.x + item.width - 8, item.y + item.height - 14);
    context.stroke();
    context.fillStyle = 'rgba(255, 240, 180, 0.5)';
    context.fillRect(item.x + 6, item.y + 5, item.width - 12, 5);
  }

  function drawFence(item) {
    context.fillStyle = PALETTE.fenceWood;
    context.fillRect(item.x, item.y, 10, item.height);
    context.fillRect(item.x + item.width - 10, item.y, 10, item.height);
    context.fillRect(item.x, item.y + 10, item.width, 9);
    context.fillRect(item.x, item.y + item.height / 2, item.width, 9);
    context.fillStyle = PALETTE.fenceDark;
    context.fillRect(item.x, item.y, 10, 5);
    context.fillRect(item.x + item.width - 10, item.y, 10, 5);
  }

  function drawPumpkin(item) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    context.fillStyle = PALETTE.pumpkin;
    context.beginPath();
    context.ellipse(cx, cy, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.pumpkinDark;
    context.lineWidth = 3;
    for (let i = -1; i <= 1; i += 1) {
      context.beginPath();
      context.ellipse(cx + i * 9, cy, item.width / 5, item.height / 2, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = '#5e9e3f';
    context.fillRect(cx - 3, item.y - 8, 6, 10);
  }

  function drawOven(item, elapsed) {
    const cx = item.x + item.width / 2;
    // Brick dome.
    context.fillStyle = PALETTE.ovenBrick;
    context.beginPath();
    context.moveTo(item.x, item.y + item.height);
    context.lineTo(item.x, item.y + 46);
    context.quadraticCurveTo(cx, item.y - 22, item.x + item.width, item.y + 46);
    context.lineTo(item.x + item.width, item.y + item.height);
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.ovenDark;
    context.lineWidth = 3;
    for (let row = 0; row < 3; row += 1) {
      context.beginPath();
      context.moveTo(item.x + 6, item.y + 34 + row * 26);
      context.lineTo(item.x + item.width - 6, item.y + 34 + row * 26);
      context.stroke();
    }
    // Chimney with drifting smoke.
    context.fillStyle = PALETTE.ovenDark;
    context.fillRect(cx + 26, item.y - 34, 20, 40);
    context.fillStyle = 'rgba(230, 225, 215, 0.55)';
    for (let i = 0; i < 3; i += 1) {
      const t = ((elapsed * 0.5 + i / 3) % 1);
      context.beginPath();
      context.arc(cx + 36 + Math.sin(t * 9) * 8, item.y - 40 - t * 52, 7 + t * 10, 0, Math.PI * 2);
      context.fill();
    }
    // The fire mouth: a glowing arch with a flickering flame.
    const flicker = 0.75 + Math.sin(elapsed * 11) * 0.25;
    const fire = context.createRadialGradient(cx, item.y + item.height - 26, 4, cx, item.y + item.height - 26, 44);
    fire.addColorStop(0, PALETTE.fireCore);
    fire.addColorStop(0.6, PALETTE.fire);
    fire.addColorStop(1, 'rgba(255, 120, 40, 0)');
    context.fillStyle = fire;
    context.beginPath();
    context.arc(cx, item.y + item.height - 24, 42 * flicker + 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b1a12';
    context.beginPath();
    context.arc(cx, item.y + item.height - 12, 26, Math.PI, 0);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.fire;
    context.beginPath();
    context.moveTo(cx - 12, item.y + item.height - 12);
    context.quadraticCurveTo(cx - 6, item.y + item.height - 34 - flicker * 12, cx, item.y + item.height - 40 - flicker * 10);
    context.quadraticCurveTo(cx + 6, item.y + item.height - 34 - flicker * 12, cx + 12, item.y + item.height - 12);
    context.closePath();
    context.fill();
    // Embers rising off the fire mouth, winking as they climb: positions from
    // the clock alone, so they cost no state.
    for (let i = 0; i < 4; i += 1) {
      const t = (elapsed * 0.4 + i / 4) % 1;
      const ex = cx - 14 + hash(i * 7) * 28 + Math.sin(t * 6 + i) * 4;
      const ey = item.y + item.height - 30 - t * 70;
      context.fillStyle = `rgba(255, ${140 + Math.floor(60 * (1 - t))}, 40, ${(1 - t) * 0.9})`;
      context.beginPath();
      context.arc(ex, ey, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawKnife(item) {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    context.save();
    context.translate(cx, cy);
    context.rotate(item.spin);
    context.fillStyle = PALETTE.knifeHandle;
    roundRect(context, -item.width / 2, -5, 20, 10, 4);
    context.fill();
    context.fillStyle = PALETTE.knife;
    context.beginPath();
    context.moveTo(-item.width / 2 + 18, -9);
    context.lineTo(item.width / 2 - 8, -9);
    context.lineTo(item.width / 2, 0);
    context.lineTo(item.width / 2 - 8, 9);
    context.lineTo(-item.width / 2 + 18, 9);
    context.closePath();
    context.fill();
    context.strokeStyle = PALETTE.knifeEdge;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-item.width / 2 + 18, 9);
    context.lineTo(item.width / 2 - 8, 9);
    context.stroke();
    context.restore();
    // A glint trail behind the spinning blade.
    context.fillStyle = 'rgba(255, 255, 255, 0.35)';
    context.fillRect(item.x + item.width, cy - 1.5, 34, 3);
    // A bright glint that sweeps round with the blade: a small star at the tip
    // that flares as the blade turns toward the light.
    const glint = (Math.sin(item.spin * 2) + 1) / 2;
    if (glint > 0.55) {
      const tx = cx + Math.cos(item.spin) * item.width * 0.48;
      const ty = cy + Math.sin(item.spin) * item.width * 0.48;
      const g = (glint - 0.55) / 0.45;
      context.strokeStyle = `rgba(255, 255, 255, ${0.85 * g})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(tx - 8, ty);
      context.lineTo(tx + 8, ty);
      context.moveTo(tx, ty - 8);
      context.lineTo(tx, ty + 8);
      context.stroke();
    }
  }

  function drawCorn(item, elapsed) {
    const cx = item.x + item.size / 2;
    const cy = item.y + item.size / 2;
    const bob = Math.sin(elapsed * 3 + item.x * 0.05) * 2;
    if (item.golden) {
      const glow = context.createRadialGradient(cx, cy + bob, 2, cx, cy + bob, 30);
      glow.addColorStop(0, 'rgba(255, 217, 77, 0.75)');
      glow.addColorStop(1, 'rgba(255, 217, 77, 0)');
      context.fillStyle = glow;
      context.fillRect(cx - 30, cy + bob - 30, 60, 60);
    }
    context.fillStyle = item.golden ? PALETTE.golden : PALETTE.corn;
    context.beginPath();
    context.ellipse(cx, cy + bob, item.size / 2, item.size / 2 + 2, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.cornHusk;
    context.beginPath();
    context.moveTo(cx - 8, cy + bob + 6);
    context.lineTo(cx - 12, cy + bob + 14);
    context.lineTo(cx - 2, cy + bob + 10);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(cx + 8, cy + bob + 6);
    context.lineTo(cx + 12, cy + bob + 14);
    context.lineTo(cx + 2, cy + bob + 10);
    context.closePath();
    context.fill();
  }

  function drawTurkey(player, elapsed, running) {
    const cx = player.x + PLAYER.width / 2;
    const ground = FIELD.groundY;
    // A dive tucks the turkey like a slide, matching the hitbox in world.js.
    const height = (player.sliding || player.diving) ? PLAYER.slideHeight : PLAYER.height;
    const base = player.y + PLAYER.height;
    const stepPhase = running ? elapsed * 14 : 0;
    const legSwing = player.onGround && running ? Math.sin(stepPhase) * 10 : 0;
    const bob = player.onGround && running ? Math.abs(Math.sin(stepPhase)) * -3 : 0;
    const top = base - height + bob;
    // Tail fan: five feathers swaying with the run.
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i - 2) * 0.42 + Math.sin(elapsed * 6 + i) * 0.04;
      const length = 46 - Math.abs(i - 2) * 5;
      context.strokeStyle = PALETTE.tail[i];
      context.lineWidth = 13;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(cx - 14, base - 16 + bob);
      context.lineTo(cx - 14 + Math.cos(angle) * length, base - 16 + bob + Math.sin(angle) * length);
      context.stroke();
    }
    // Body.
    context.fillStyle = PALETTE.turkeyBody;
    context.beginPath();
    context.ellipse(cx + 2, top + height * 0.55, PLAYER.width * 0.34, height * 0.52, player.sliding ? 0.35 : 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.turkeyDark;
    context.beginPath();
    context.ellipse(cx - 6, top + height * 0.72, PLAYER.width * 0.2, height * 0.28, 0, 0, Math.PI * 2);
    context.fill();
    // Wing, flapping while airborne.
    const flap = player.onGround ? Math.sin(stepPhase) * 4 : -12;
    context.fillStyle = PALETTE.turkeyDark;
    context.beginPath();
    context.ellipse(cx - 2, top + height * 0.5 + flap, 18, 10, -0.4, 0, Math.PI * 2);
    context.fill();
    // Head, beak and wattle at the front.
    const headX = cx + 20;
    const headY = top + (player.sliding ? 14 : 2);
    context.fillStyle = PALETTE.head;
    context.beginPath();
    context.arc(headX, headY, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.beak;
    context.beginPath();
    context.moveTo(headX + 8, headY - 2);
    context.lineTo(headX + 20, headY + 2);
    context.lineTo(headX + 8, headY + 5);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.wattle;
    context.beginPath();
    context.ellipse(headX + 6, headY + 10, 4, 7, 0.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1d1a16';
    context.beginPath();
    context.arc(headX + 3, headY - 3, 2, 0, Math.PI * 2);
    context.fill();
    // Legs: two thin legs pumping, tucked while jumping, stretched while sliding.
    context.strokeStyle = '#e8a33c';
    context.lineWidth = 4;
    context.lineCap = 'round';
    if (player.sliding) {
      context.beginPath();
      context.moveTo(cx - 6, base - 4);
      context.lineTo(cx + 16, base);
      context.moveTo(cx + 4, base - 4);
      context.lineTo(cx + 24, base);
      context.stroke();
    } else if (!player.onGround) {
      context.beginPath();
      context.moveTo(cx - 8, base - 8);
      context.lineTo(cx - 14, base + 2);
      context.moveTo(cx + 2, base - 8);
      context.lineTo(cx + 8, base + 2);
      context.stroke();
    } else {
      context.beginPath();
      context.moveTo(cx - 8, base - 8);
      context.lineTo(cx - 8 + legSwing, ground);
      context.moveTo(cx + 4, base - 8);
      context.lineTo(cx + 4 - legSwing, ground);
      context.stroke();
    }
    void ground;
  }

  function drawFarmer(state, elapsed) {
    const gap = state.farmerGap;
    const width = 62;
    const x = state.player.x - gap - width;
    if (x + width < -10) return;
    const base = FIELD.groundY;
    const phase = elapsed * 13;
    const legSwing = Math.sin(phase) * 11;
    // Legs in blue overalls, pumping.
    context.strokeStyle = PALETTE.farmerOveralls;
    context.lineWidth = 9;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(x + 26, base - 52);
    context.lineTo(x + 26 + legSwing, base);
    context.moveTo(x + 40, base - 52);
    context.lineTo(x + 40 - legSwing, base);
    context.stroke();
    // Overalls body and red shirt.
    context.fillStyle = PALETTE.farmerShirt;
    context.fillRect(x + 14, base - 104, 38, 54);
    context.fillStyle = PALETTE.farmerOveralls;
    context.fillRect(x + 18, base - 78, 30, 28);
    context.fillRect(x + 18, base - 104, 8, 26);
    context.fillRect(x + 40, base - 104, 8, 26);
    // Head with a straw hat, and an arm reaching for the turkey.
    context.fillStyle = PALETTE.farmerSkin;
    context.beginPath();
    context.arc(x + 33, base - 116, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.farmerHat;
    context.beginPath();
    context.ellipse(x + 33, base - 124, 22, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(x + 24, base - 136, 18, 12);
    context.strokeStyle = PALETTE.farmerSkin;
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(x + 48, base - 96);
    context.lineTo(x + 62, base - 108 + Math.sin(phase) * 4);
    context.stroke();
    // The pitchfork in his other hand.
    context.strokeStyle = '#8a6a42';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + 8, base - 60);
    context.lineTo(x + 2, base - 128);
    context.stroke();
    context.strokeStyle = '#c9ced6';
    context.lineWidth = 3;
    for (let i = -1; i <= 1; i += 1) {
      context.beginPath();
      context.moveTo(x + 2 + i * 5, base - 128);
      context.lineTo(x + 2 + i * 5, base - 142);
      context.stroke();
    }
    // A shout mark when he is right behind the turkey.
    if (gap < 130) {
      text('!', x + width / 2, base - 158, 34, PALETTE.danger, 'center', 'alphabetic');
    }
  }

  function drawParticles(state) {
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      if (!p.active) continue;
      const alpha = Math.max(0, p.life / p.max);
      if (p.kind === 0) {
        context.fillStyle = `rgba(214, 178, 120, ${alpha * 0.8})`;
        context.beginPath();
        context.arc(p.x, p.y, 5, 0, Math.PI * 2);
        context.fill();
      } else if (p.kind === 1) {
        // A hit scatters brown feathers, one of them pale so the burst reads.
        context.fillStyle = `rgba(138, 82, 48, ${alpha})`;
        context.beginPath();
        context.ellipse(p.x, p.y, 6, 3, p.vx * 0.01, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(242, 230, 208, ${alpha * 0.9})`;
        context.beginPath();
        context.ellipse(p.x + 4, p.y - 4, 4, 2, p.vx * 0.02, 0, Math.PI * 2);
        context.fill();
      } else {
        // Corn sparkles: a gold dot plus a four-point star flash.
        context.fillStyle = `rgba(246, 201, 69, ${alpha})`;
        context.beginPath();
        context.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `rgba(255, 240, 170, ${alpha})`;
        context.lineWidth = 1.5;
        const s = 3 + 5 * alpha;
        context.beginPath();
        context.moveTo(p.x - s, p.y);
        context.lineTo(p.x + s, p.y);
        context.moveTo(p.x, p.y - s);
        context.lineTo(p.x, p.y + s);
        context.stroke();
      }
    }
  }

  function drawField(state, progress) {
    drawSky(state, progress);
    drawDistant(state);
    drawGround(state);
    for (let i = 0; i < state.obstacles.length; i += 1) {
      const item = state.obstacles[i];
      if (!item.active) continue;
      if (item.kind === KIND_HAY) drawHay(item);
      else if (item.kind === KIND_FENCE) drawFence(item);
      else if (item.kind === KIND_PUMPKIN) drawPumpkin(item);
      else drawOven(item, state.elapsed);
    }
    for (let i = 0; i < state.corns.length; i += 1) {
      const item = state.corns[i];
      if (!item.active) continue;
      drawCorn(item, state.elapsed);
    }
    for (let i = 0; i < state.knives.length; i += 1) {
      const item = state.knives[i];
      if (!item.active) continue;
      drawKnife(item);
    }
    drawFarmer(state, state.elapsed);
    const player = state.player;
    // Blink while invulnerable after a hit: hidden one frame in four, so the turkey
    // stays visible enough to read even right after a hit.
    if (player.invulnerable === 0 || Math.floor(player.invulnerable * 10) % 4 !== 0) drawTurkey(player, state.elapsed, true);
    drawParticles(state);
    // Running dust: small puffs kicked up behind the turkey's feet while it
    // runs on the ground, placed from the clock alone so it costs no state.
    if (player.onGround) {
      for (let i = 0; i < 3; i += 1) {
        const phase = (state.elapsed * 1.6 + i / 3) % 1;
        const dx = 8 + phase * 46;
        const dy = 4 + phase * 10;
        context.fillStyle = `rgba(214, 178, 120, ${0.35 * (1 - phase)})`;
        context.beginPath();
        context.arc(player.x + PLAYER.width * 0.15 - dx, FIELD.groundY - dy, 3 + phase * 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    // A red pulse at the left edge when the farmer is about to grab the turkey.
    // Not once the run is over: hearts at zero means the farmer already has
    // him, so the warning is meaningless — and in the staged end frame the
    // gap sits near zero, so the pulse always fired and read in a still
    // frame as a red smear down the left edge, not as a warning. The staged
    // play and chase frames keep their gaps at 120 and 125, clear of the
    // pulse, so the warning pill and the "!" still carry the close call.
    if (state.farmerGap < 120 && state.farmerGap > 0 && state.hearts > 0) {
      const pulse = 0.25 + Math.sin(state.elapsed * 8) * 0.12;
      context.fillStyle = `rgba(255, 60, 40, ${pulse})`;
      context.fillRect(0, 0, 26, FIELD.height);
    }
  }

  function drawHeart(x, y, size, filled) {
    // A dark outline keeps a heart readable over the bright sky, and a lost heart
    // stays visible as a dark outline instead of fading to a pale ghost.
    context.beginPath();
    context.moveTo(x, y + size * 0.32);
    context.bezierCurveTo(x - size * 0.55, y - size * 0.28, x - size * 0.1, y - size * 0.62, x, y - size * 0.18);
    context.bezierCurveTo(x + size * 0.1, y - size * 0.62, x + size * 0.55, y - size * 0.28, x, y + size * 0.32);
    context.closePath();
    context.fillStyle = filled ? '#ff4d64' : 'rgba(20, 12, 22, 0.45)';
    context.fill();
    context.strokeStyle = filled ? 'rgba(40, 8, 12, 0.8)' : 'rgba(255, 246, 232, 0.85)';
    context.lineWidth = 2;
    context.stroke();
  }

  function drawHud(state, progress) {
    context.textBaseline = 'top';
    // A dark pill behind the score block and one behind lives: the HUD used to sit
    // straight on the sunset sky, and the pale Level line vanished under the clouds.
    context.fillStyle = 'rgba(20, 12, 22, 0.55)';
    roundRect(context, 12, 10, 196, 72, 14);
    context.fill();
    context.fillStyle = 'rgba(20, 12, 22, 0.55)';
    roundRect(context, FIELD.width - 268, 10, 256, 72, 14);
    context.fill();
    text(`Score ${Math.floor(state.score)}`, 24, 18, 30, PALETTE.text, 'left', 'top');
    // text() (not plain()) so the shadow keeps Level readable over a cloud.
    text(`Level ${state.level}`, 24, 54, 20, PALETTE.muted, 'left', 'top');
    // The escape bar: the turkey's mark travels toward the forest.
    const barX = FIELD.width / 2 - 210;
    const barW = 420;
    const barY = 26;
    context.fillStyle = 'rgba(20, 12, 22, 0.55)';
    roundRect(context, barX - 8, barY - 8, barW + 16, 34, 16);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.25)';
    roundRect(context, barX, barY, barW, 18, 9);
    context.fill();
    context.fillStyle = PALETTE.grass;
    roundRect(context, barX, barY, Math.max(8, barW * progress), 18, 9);
    context.fill();
    // A little pine tree marks the forest at the end of the bar.
    const treeX = barX + barW + 22;
    context.fillStyle = '#5e9e3f';
    context.beginPath();
    context.moveTo(treeX, barY - 4);
    context.lineTo(treeX - 11, barY + 14);
    context.lineTo(treeX + 11, barY + 14);
    context.closePath();
    context.fill();
    context.fillStyle = '#6b4423';
    context.fillRect(treeX - 2, barY + 14, 4, 6);
    const left = Math.max(0, Math.ceil(GOAL_M - state.distance));
    // A small dark pill of its own, in the same style as the score and lives
    // pills: the bare line sat straight on the sky and drifted over the clouds.
    const distLabel = `${left}m to the forest`;
    context.font = `bold 18px ${FONT}`;
    const distW = Math.ceil(context.measureText(distLabel).width) + 28;
    context.fillStyle = 'rgba(20, 12, 22, 0.55)';
    roundRect(context, barX + barW / 2 - distW / 2, barY + 28, distW, 26, 13);
    context.fill();
    text(distLabel, barX + barW / 2, barY + 32, 18, PALETTE.text, 'center', 'top');
    // The farmer's pressure is drawn as a pill in the play screen (see draw):
    // bare red text on the sunset sky was unreadable, so it no longer lives here.
    for (let i = 0; i < HEARTS; i += 1) {
      drawHeart(FIELD.width - 40 - i * (HEART + 12), 40, HEART, i < state.hearts);
    }
    plain('Lives', FIELD.width - 40 - HEARTS * (HEART + 12) - 8, 40, 20, PALETTE.text, 'right', 'middle');
  }

  function drawMilestoneBanner(state) {
    if (state.milestone <= 0) return;
    const age = state.elapsed - state.milestoneAt;
    if (age < 0 || age >= MILESTONE_DURATION) return;
    const fade = age > MILESTONE_DURATION - 0.5 ? (MILESTONE_DURATION - age) / 0.5 : 1;
    const label = state.milestone === 500
      ? '500m — halfway to the forest!'
      : `${state.milestone}m — almost there, ${GOAL_M - state.milestone}m to go!`;
    const width = 560;
    const x = (FIELD.width - width) / 2;
    const y = 96;
    context.save();
    context.globalAlpha = fade;
    context.fillStyle = PALETTE.panel;
    roundRect(context, x, y, width, 52, 26);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, x, y, width, 52, 26);
    context.stroke();
    text(label, FIELD.width / 2, y + 35, 26, PALETTE.corn, 'center');
    context.restore();
  }

  /** A short toast under the milestone banner: combo, near-miss and level-up news. */
  function drawToast(state) {
    // The farmer warning takes this same slot (y 156) while it is showing,
    // so the two pills never stack on each other.
    if (state.farmerGap < 185) return;
    if (!state.toast) return;
    const age = state.elapsed - state.toastAt;
    if (age < 0 || age >= 2) return;
    const fade = age > 1.5 ? (2 - age) / 0.5 : 1;
    const width = 460;
    const x = (FIELD.width - width) / 2;
    const y = 156;
    context.save();
    context.globalAlpha = fade;
    context.fillStyle = 'rgba(24, 14, 26, 0.82)';
    roundRect(context, x, y, width, 40, 20);
    context.fill();
    context.strokeStyle = PALETTE.corn;
    context.lineWidth = 2;
    roundRect(context, x, y, width, 40, 20);
    context.stroke();
    text(state.toast, FIELD.width / 2, y + 27, 21, PALETTE.corn, 'center');
    context.restore();
  }

  /** A short warning in the same dark pill as the toast, sized to its text:
    the old bare red line on the sunset sky was unreadable over the clouds. */
  function pillText(value, y, size, color, edge) {
    context.font = `bold ${size}px ${FONT}`;
    const width = Math.ceil(context.measureText(value).width) + 40;
    const x = (FIELD.width - width) / 2;
    context.fillStyle = 'rgba(24, 14, 26, 0.82)';
    roundRect(context, x, y, width, 40, 20);
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 2;
    roundRect(context, x, y, width, 40, 20);
    context.stroke();
    text(value, FIELD.width / 2, y + 27, size, color, 'center');
  }

  function drawPanel(title, lines, prompt, accent, panelX) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = panelX === undefined ? (FIELD.width - PANEL.width) / 2 : panelX;
    const y = (FIELD.height - height) / 2;
    // Centre the text on the panel itself, not on the field: the title panel sits
    // right of centre so the turkey shows on the left, and centring on the field
    // pushed every line's first letters outside the panel, onto the bright sky.
    const cx = x + PANEL.width / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(context, x, y, PANEL.width, height, 18);
    context.fill();
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 3;
    roundRect(context, x, y, PANEL.width, height, 18);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, cx, y + 82, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      plain(lines[i], cx, y + PANEL.top + i * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, cx, y + height - 38, 23, PALETTE.corn, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, progress) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state, progress);
    if (screen === SCREEN_TITLE) {
      // The panel sits right of centre so the turkey running in the field shows on the left.
      drawPanel(
        'GOBBLE RUN',
        ['Thanksgiving eve, and the farmer is coming.', 'Jump the hay, the fences and the oven.', 'Slide under the knives — hold ↓ in the air to dive.', 'Eat the corn. Reach the forest, 1500m away.', `Best score: ${Math.floor(best)}`],
        'Press Space or click to run',
        undefined,
        FIELD.width - PANEL.width - 70,
      );
      return;
    }
    drawHud(state, progress);
    if (screen === SCREEN_PLAY) {
      drawMilestoneBanner(state);
      drawToast(state);
      // The farmer's pressure, as a pill in the toast slot: under 130px he is
      // close enough to grab, under 185px he is gaining.
      if (state.farmerGap < 130) {
        pillText('Farmer right behind you!', 156, 20, PALETTE.danger, PALETTE.danger);
      } else if (state.farmerGap < 185) {
        pillText('The farmer is gaining…', 156, 18, PALETTE.corn, PALETTE.corn);
      }
      // The live combo, under the score pill: it only shows once a streak starts.
      if (state.combo >= 3) {
        text(`Combo x${state.combo}`, 24, 92, 22, PALETTE.golden, 'left', 'top');
      }
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The farmer will wait. The oven will not cool down.', 'Space to jump · ↓ to slide · P to pause · M to mute'], 'Press P or click to keep running');
    } else if (screen === SCREEN_OVER) {
      drawPanel(
        'Caught for Dinner!',
        [`The farmer got you after ${Math.floor(state.distance)}m.`, `Score ${Math.floor(state.score)}  ·  Best ${Math.floor(best)}`],
        'Press Space or click to run again',
        PALETTE.danger,
      );
    } else if (screen === SCREEN_WIN) {
      drawPanel(
        'Escaped to the Forest!',
        ['You outran the farmer, the oven and every knife.', `Score ${Math.floor(state.score)}  ·  Best ${Math.floor(best)}`],
        'Press Space or click to run again',
        PALETTE.grass,
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

// Keyboard and pointer input for a runner. Jump and slide are the moves; confirm starts or
// restarts, pause freezes the run, M mutes. One-shot presses are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never counted twice.
// Held keys give the slide state; a click or tap jumps while playing and confirms on panels.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_JUMP = 4;
export const ACTION_MUTE = 8;

const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
const SLIDE = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let slide = false;
  let jumpHeld = false;
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (JUMP.has(event.code)) {
      jumpHeld = true;
      if (!event.repeat) actions |= ACTION_JUMP | ACTION_CONFIRM;
    } else if (SLIDE.has(event.code)) {
      slide = true;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (JUMP.has(event.code)) jumpHeld = false;
    else if (SLIDE.has(event.code)) slide = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    slide = false;
    jumpHeld = false;
  });
  // A click jumps while playing (and confirms on a panel); the loop decides which it is.
  target.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    jumpHeld = true;
    actions |= ACTION_JUMP | ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    jumpHeld = false;
  });

  return {
    /** True while a slide key is held down. */
    sliding() {
      return slide;
    },
    /** True while a jump key or the pointer is held down (for the jump's extra lift). */
    jumping() {
      return jumpHeld;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

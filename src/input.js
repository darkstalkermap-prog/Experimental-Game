// Keyboard / mouse state with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed since last frame
    this.up = new Set();        // keys let go since last frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, middle: false, leftPressed: false, leftReleased: false, rightPressed: false, middlePressed: false, middleReleased: false, wheel: 0 };
    this.locked = false;
    this.grab = null;   // { x, y }: while set, mouse movement is collected here instead of turning the view (the marker wheel)
    this.enabled = true;
    this.onLockChange = null;
    // stand-in used while a menu is open in an online game (the world keeps running)
    this.idle = {
      mouse: { dx: 0, dy: 0, left: false, right: false, middle: false, leftPressed: false, leftReleased: false, rightPressed: false, middlePressed: false, middleReleased: false, wheel: 0 },
      down: () => false,
      hit: () => false,
      release: () => false,
    };

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'F1', 'F2', 'F3', 'F4', 'Space'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { if (this.keys.delete(e.code)) this.up.add(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = this.mouse.middle = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore the occasional huge jump some browsers report on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      if (this.grab) { this.grab.x += e.movementX; this.grab.y += e.movementY; return; }
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (e.button === 1) { e.preventDefault(); this.mouse.middle = true; this.mouse.middlePressed = true; }   // (no browser auto-scroll)
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { if (this.mouse.left) this.mouse.leftReleased = true; this.mouse.left = false; }
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 1) { if (this.mouse.middle) this.mouse.middleReleased = true; this.mouse.middle = false; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = this.mouse.middle = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  // Capture the mouse. Asks for raw (unaccelerated) movement where supported for 1:1 aiming.
  // Browsers sometimes refuse (e.g. right after Esc); onLockFail lets the game ask for another click.
  lock() {
    if (this.locked) return;
    const attempt = (opts) => {
      try {
        const r = opts ? this.canvas.requestPointerLock(opts) : this.canvas.requestPointerLock();
        return r && r.then ? r : Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    };
    attempt({ unadjustedMovement: true })
      .catch((e) => (e && e.name === 'NotSupportedError' ? attempt() : Promise.reject(e)))
      .catch(() => { if (!this.locked && this.onLockFail) this.onLockFail(); });
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  release(code) { return this.up.has(code); }

  endFrame() {
    this.pressed.clear();
    this.up.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = this.mouse.leftReleased = this.mouse.rightPressed = false;
    this.mouse.middlePressed = this.mouse.middleReleased = false;
    this.mouse.wheel = 0;
  }
}

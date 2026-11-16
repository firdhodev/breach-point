export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.onLockChange = null;

    this.move = { forward: false, back: false, left: false, right: false, jump: false, crouch: false, walk: false };
    this.use = false;
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.mouseDown = false;
    this.mouseJustPressed = false;

    this._keys = new Set();

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this._keys.add(e.code);
      this.pressed.add(e.code);
      this._syncMove();
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this._keys.delete(e.code);
      this._syncMove();
    };
    this._onMouseDown = (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseJustPressed = true; }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onMouseMove = (e) => {
      if (!this.isLocked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onContext = (e) => e.preventDefault();
    this._onBlur = () => this._clearAll();
    this._onLockChange = () => {
      if (!this.isLocked) { this._clearAll(); this.mouseDown = false; }
      if (this.onLockChange) this.onLockChange(this.isLocked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  get isLocked() { return document.pointerLockElement === this.canvas; }

  _syncMove() {
    const k = this._keys;
    this.move.forward = k.has('KeyW') || k.has('ArrowUp');
    this.move.back = k.has('KeyS') || k.has('ArrowDown');
    this.move.left = k.has('KeyA') || k.has('ArrowLeft');
    this.move.right = k.has('KeyD') || k.has('ArrowRight');
    this.move.jump = k.has('Space');
    this.move.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    this.move.walk = k.has('ShiftLeft') || k.has('ShiftRight');
    this.use = k.has('KeyE');
  }

  _clearAll() {
    this._keys.clear();
    this.use = false;
    this.mouseDown = false;
    for (const key in this.move) this.move[key] = false;
  }

  consumeLook() {
    const r = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0; this.mouse.dy = 0;
    return r;
  }

  consumePressed() {
    const s = this.pressed;
    this.pressed = new Set();
    return s;
  }

  endFrame() { this.mouseJustPressed = false; }

  requestLock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }
}

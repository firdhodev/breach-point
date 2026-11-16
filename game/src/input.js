const DEFAULT_LOCK_ELEMENT = () => document.body;

/** Tracks browser input and exposes one consumable snapshot per simulation frame. */
export class InputController {
  constructor(element = DEFAULT_LOCK_ELEMENT(), onScroll = () => {}) {
    this.element = element;
    this.onScroll = onScroll;
    this.keys = new Set();
    this.buttons = new Set();
    this.pressedKeys = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.pointerLocked = false;

    this.handleKeyDown = (event) => {
      if (!event.repeat) this.pressedKeys.add(event.code);
      this.keys.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    };
    this.handleKeyUp = (event) => this.keys.delete(event.code);
    this.handleMouseMove = (event) => {
      if (!this.pointerLocked) return;
      this.mouseDelta.x += event.movementX || 0;
      this.mouseDelta.y += event.movementY || 0;
    };
    this.handleMouseDown = (event) => this.buttons.add(event.button);
    this.handleMouseUp = (event) => this.buttons.delete(event.button);
    this.handleWheel = (event) => {
      event.preventDefault();
      if (event.deltaY !== 0) this.onScroll(Math.sign(event.deltaY), event);
    };
    this.handleLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      if (!this.pointerLocked) this.buttons.clear();
    };
    this.handleContextMenu = (event) => event.preventDefault();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.element.addEventListener('mousedown', this.handleMouseDown);
    this.element.addEventListener('wheel', this.handleWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handleLockChange);
  }

  requestPointerLock() {
    if (this.element.requestPointerLock) return this.element.requestPointerLock();
    return undefined;
  }

  exitPointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  /** Returns held state plus one-shot key and mouse deltas, then clears the latter. */
  consumeFrame() {
    const frame = {
      keys: new Set(this.keys),
      pressedKeys: new Set(this.pressedKeys),
      buttons: new Set(this.buttons),
      mouseDelta: { ...this.mouseDelta },
      pointerLocked: this.pointerLocked,
      move: {
        forward: this.keys.has('KeyW'),
        back: this.keys.has('KeyS'),
        left: this.keys.has('KeyA'),
        right: this.keys.has('KeyD'),
        sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        crouch: this.keys.has('ControlLeft') || this.keys.has('KeyC'),
        jump: this.keys.has('Space'),
      },
      firing: this.buttons.has(0),
      reloadPressed: this.pressedKeys.has('KeyR'),
    };
    this.pressedKeys.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return frame;
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.element.removeEventListener('mousedown', this.handleMouseDown);
    this.element.removeEventListener('wheel', this.handleWheel);
    this.element.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
  }
}

export function createInput(element, onScroll) {
  return new InputController(element, onScroll);
}

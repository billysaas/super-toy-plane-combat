import { clamp, DEFAULT_SETTINGS, type Settings } from "../../shared/config";
import type { Controls } from "../../shared/types";

type Action = "camera" | "pause" | "chat" | "mute" | "scoreboard" | "resume";

export class InputManager {
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private mouseDX = 0;
  private mouseDY = 0;
  private mouseSteerX = 0;
  private mouseSteerY = 0;
  private pointerLocked = false;
  private enabled = false;
  private fireMouse = false;
  private rocketMouse = false;
  private wheelDelta = 0;
  private throttle = 0.7;
  private actions: Action[] = [];
  private touch = {
    active: false,
    pitch: 0,
    roll: 0,
    fire: false,
    rocket: false,
    boost: false,
    throttle: 70,
  };
  private stickPointer: number | null = null;
  private stickBase?: HTMLElement;
  private stickKnob?: HTMLElement;
  private isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  private scoreboardHeld = false;
  private listeners: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindDesktop();
    this.bindTouch();
  }

  destroy(): void {
    for (const remove of this.listeners) remove();
    this.listeners.length = 0;
  }

  private on(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  private bindDesktop(): void {
    this.on(window, "keydown", (event) => {
      const e = event as KeyboardEvent;
      if (["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyV") this.actions.push("camera");
      if (e.code === "Escape") this.actions.push("pause");
      if (e.code === "KeyM") this.actions.push("mute");
      if (e.code === "KeyT" && this.enabled) this.actions.push("chat");
      if (e.code === "Tab") {
        this.scoreboardHeld = true;
        this.actions.push("scoreboard");
      }
    });
    this.on(window, "keyup", (event) => {
      const e = event as KeyboardEvent;
      this.keys.delete(e.code);
      if (e.code === "Tab") this.scoreboardHeld = false;
    });
    this.on(window, "blur", () => {
      this.keys.clear();
      this.fireMouse = false;
      this.rocketMouse = false;
      this.scoreboardHeld = false;
    });
    this.on(document, "pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) {
        this.mouseSteerX = 0;
        this.mouseSteerY = 0;
      }
    });
    this.on(document, "mousemove", (event) => {
      if (!this.pointerLocked || !this.enabled) return;
      const e = event as MouseEvent;
      const sens = this.settings.sensitivity * 0.0018;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      this.mouseSteerX = clamp(this.mouseSteerX + e.movementX * sens, -1, 1);
      const ySign = this.settings.invertY ? 1 : -1;
      this.mouseSteerY = clamp(this.mouseSteerY + e.movementY * sens * ySign, -1, 1);
    });
    this.on(this.canvas, "mousedown", (event) => {
      if (!this.enabled) return;
      const e = event as MouseEvent;
      if (!this.pointerLocked && !this.isTouchDevice) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) this.fireMouse = true;
      if (e.button === 2) this.rocketMouse = true;
    });
    this.on(window, "mouseup", (event) => {
      const e = event as MouseEvent;
      if (e.button === 0) this.fireMouse = false;
      if (e.button === 2) this.rocketMouse = false;
    });
    this.on(this.canvas, "contextmenu", (event) => event.preventDefault());
    this.on(this.canvas, "wheel", (event) => {
      if (!this.enabled) return;
      const e = event as WheelEvent;
      e.preventDefault();
      this.wheelDelta += e.deltaY > 0 ? -0.08 : 0.08;
    }, { passive: false } as AddEventListenerOptions);
    this.on(this.canvas, "click", () => {
      if (this.enabled && !this.pointerLocked && !this.isTouchDevice) this.requestPointerLock();
    });
  }

  private bindTouch(): void {
    this.stickBase = document.getElementById("touch-stick-base") ?? undefined;
    this.stickKnob = document.getElementById("touch-stick-knob") ?? undefined;
    if (!this.stickBase || !this.stickKnob) return;
    const base = this.stickBase;
    const knob = this.stickKnob;
    const updateStick = (event: PointerEvent) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.34;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.roll = clamp(dx / max, -1, 1);
      this.touch.pitch = clamp(-dy / max, -1, 1);
    };
    base.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.stickPointer = event.pointerId;
      base.setPointerCapture(event.pointerId);
      base.classList.add("active");
      updateStick(event);
    });
    base.addEventListener("pointermove", (event) => {
      if (this.stickPointer !== event.pointerId) return;
      event.preventDefault();
      updateStick(event);
    });
    const release = (event: PointerEvent) => {
      if (this.stickPointer !== event.pointerId) return;
      this.stickPointer = null;
      this.touch.pitch = 0;
      this.touch.roll = 0;
      knob.style.transform = "translate(0px, 0px)";
      base.classList.remove("active");
    };
    base.addEventListener("pointerup", release);
    base.addEventListener("pointercancel", release);

    const hold = (id: string, setter: (down: boolean) => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        el.classList.add("active");
        el.setPointerCapture((event as PointerEvent).pointerId);
        setter(true);
      });
      const release = (event: Event) => {
        event.preventDefault();
        el.classList.remove("active");
        setter(false);
      };
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", (event) => {
        if ((event as PointerEvent).buttons === 0) return;
        el.classList.remove("active");
        setter(false);
      });
    };
    hold("touch-fire", (d) => { this.touch.fire = d; });
    hold("touch-rocket", (d) => { this.touch.rocket = d; });
    hold("touch-boost", (d) => { this.touch.boost = d; });
    const camera = document.getElementById("touch-camera");
    camera?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.actions.push("camera");
    });
    const slider = document.getElementById("touch-throttle") as HTMLInputElement | null;
    if (slider) {
      slider.value = `${this.touch.throttle}`;
      slider.addEventListener("input", () => {
        this.touch.throttle = Number(slider.value);
        this.throttle = this.touch.throttle / 100;
      });
    }
  }

  setSettings(settings: Settings): void {
    this.settings = { ...settings };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.fireMouse = false;
      this.rocketMouse = false;
      this.mouseSteerX = 0;
      this.mouseSteerY = 0;
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  setTouchVisible(visible: boolean): void {
    this.touch.active = visible;
    document.body.classList.toggle("touch-playing", visible);
  }

  get usesTouch(): boolean {
    return this.isTouchDevice;
  }

  get isLocked(): boolean {
    return this.pointerLocked;
  }

  requestPointerLock(): void {
    if (this.isTouchDevice) return;
    const promise = this.canvas.requestPointerLock();
    if (promise && typeof promise.catch === "function") promise.catch(() => undefined);
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  consumeActions(): Action[] {
    const out = this.actions;
    this.actions = [];
    return out;
  }

  isScoreboardHeld(): boolean {
    return this.scoreboardHeld;
  }

  clear(): void {
    this.keys.clear();
    this.fireMouse = false;
    this.rocketMouse = false;
    this.touch.fire = false;
    this.touch.rocket = false;
    this.touch.boost = false;
    this.touch.pitch = 0;
    this.touch.roll = 0;
    this.mouseSteerX = 0;
    this.mouseSteerY = 0;
    this.actions = [];
  }

  getControls(dt: number): Controls {
    const k = this.keys;
    if (!this.enabled) return { pitch: 0, roll: 0, yaw: 0, throttle: this.throttle, boost: false, fire: false, rocket: false };
    const mouseDecay = Math.exp(-dt * 3.4);
    this.mouseSteerX *= mouseDecay;
    this.mouseSteerY *= mouseDecay;
    let keyboardPitch = 0;
    let keyboardRoll = 0;
    let keyboardYaw = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) keyboardPitch += 0.9;
    if (k.has("KeyS") || k.has("ArrowDown")) keyboardPitch -= 0.9;
    if (k.has("KeyA") || k.has("ArrowLeft")) keyboardRoll -= 0.9;
    if (k.has("KeyD") || k.has("ArrowRight")) keyboardRoll += 0.9;
    if (k.has("KeyQ")) keyboardYaw -= 0.8;
    if (k.has("KeyE")) keyboardYaw += 0.8;
    keyboardPitch += this.touch.active ? this.touch.pitch : 0;
    keyboardRoll += this.touch.active ? this.touch.roll : 0;
    let throttle = this.throttle;
    if (k.has("KeyX")) throttle += 0.55 * dt;
    if (k.has("KeyZ")) throttle -= 0.55 * dt;
    throttle += this.wheelDelta;
    this.wheelDelta = 0;
    this.throttle = clamp(throttle, 0.15, 1);
    const mouseX = this.pointerLocked ? this.mouseSteerX : 0;
    const mouseY = this.pointerLocked ? this.mouseSteerY : 0;
    const pitch = clamp(keyboardPitch + mouseY * 1.1, -1, 1);
    const roll = clamp(keyboardRoll + mouseX * 1.1, -1, 1);
    return {
      pitch,
      roll,
      yaw: keyboardYaw,
      throttle: this.throttle,
      boost: k.has("ShiftLeft") || k.has("ShiftRight") || (this.touch.active && this.touch.boost),
      fire: k.has("Space") || this.fireMouse || (this.touch.active && this.touch.fire),
      rocket: k.has("KeyR") || this.rocketMouse || (this.touch.active && this.touch.rocket),
    };
  }

  setTouchEnabled(enabled: boolean): void {
    this.isTouchDevice = enabled;
  }
}

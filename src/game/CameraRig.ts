import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { CameraMode } from "../../shared/config";
import type { PlaneRuntime } from "../../shared/types";
import type { PhysicsWorld } from "./PhysicsWorld";

const forward = new Vector3();
const up = new Vector3();
const right = new Vector3();
const desired = new Vector3();
const lookAt = new Vector3();
const tempQ = new Quaternion();
const tempV = new Vector3();

export class CameraRig {
  camera: PerspectiveCamera;
  mode: CameraMode = "chase";
  private shake = 0;
  private shakeTime = 0;
  private currentPos = new Vector3(-30, 12, 28);
  private currentQuat = new Quaternion();
  private physics: PhysicsWorld;
  private fov = 72;
  private buffet = 0;

  constructor(aspect: number, physics: PhysicsWorld) {
    this.camera = new PerspectiveCamera(72, aspect, 0.08, 520);
    this.camera.position.copy(this.currentPos);
    this.physics = physics;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  toggle(): CameraMode {
    this.mode = this.mode === "chase" ? "cockpit" : "chase";
    return this.mode;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.8, this.shake + amount);
  }

  setBuffet(level: number): void {
    this.buffet = Math.max(0, Math.min(1, level));
  }

  snapTo(plane: PlaneRuntime): void {
    const f = plane.flight;
    const q = new Quaternion(f.qx, f.qy, f.qz, f.qw);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);
    this.currentPos.set(f.x, f.y, f.z).addScaledVector(fwd, -4.8).addScaledVector(up, 1.35);
    this.camera.position.copy(this.currentPos);
    this.currentQuat.copy(q);
    this.camera.quaternion.copy(this.currentQuat);
  }

  resetMenus(): void {
    this.mode = "chase";
    this.camera.fov = 65;
    this.buffet = 0;
    this.camera.updateProjectionMatrix();
  }

  updateMenu(elapsed: number, aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = 58;
    const angle = elapsed * 0.035 + 2.4;
    const targetPos = new Vector3(-24 + Math.sin(angle) * 12, 8.4 + Math.sin(elapsed * 0.13) * 0.6, 5 + Math.cos(angle) * 14);
    if (this.currentPos.lengthSq() < 1) this.currentPos.copy(targetPos);
    this.currentPos.lerp(targetPos, 0.035);
    this.camera.position.copy(this.currentPos);
    lookAt.set(-25, 5.6, 4.5);
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
  }

  setHangarView(elapsed: number, aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = 52;
    const angle = elapsed * 0.28;
    this.camera.position.set(Math.cos(angle) * 11 - 2, 4.4, Math.sin(angle) * 11 + 7);
    this.camera.lookAt(-2, 2.2, 7);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, plane: PlaneRuntime, speedRatio: number, boosting: boolean, aspect: number, firing = false): void {
    this.camera.aspect = aspect;
    const f = plane.flight;
    const q = tempQ.set(f.qx, f.qy, f.qz, f.qw);
    forward.set(0, 0, -1).applyQuaternion(q);
    right.set(1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
    const portraitBoost = aspect < 0.8 ? 8 : 0;
    const baseFov = (boosting ? 84 : this.mode === "cockpit" ? 76 : 72) + portraitBoost;
    const targetFov = baseFov - (firing ? 6 : 0);
    this.fov = MathUtils.damp(this.fov, targetFov, firing ? 7 : 3.6, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    if (this.mode === "cockpit") {
      desired.set(0, 0.32, 0.22).applyQuaternion(q).add(new Vector3(f.x, f.y, f.z));
      this.camera.position.copy(desired);
      this.currentQuat.slerp(q, Math.min(1, dt * 25));
      this.camera.quaternion.copy(this.currentQuat);
    } else {
      const chaseDistance = 4.45 + speedRatio * 1.15 + (aspect < 0.8 ? 1.1 : 0);
      const chaseHeight = 1.22 + speedRatio * 0.16 + (aspect < 0.8 ? 0.25 : 0);
      desired.set(0, chaseHeight, chaseDistance).applyQuaternion(q).add(new Vector3(f.x, f.y, f.z));
      const from = new Vector3(f.x, f.y, f.z);
      const dir = desired.clone().sub(from);
      const dist = dir.length();
      dir.normalize();
      const hit = this.physics.raycast(from, dir, dist + 0.4);
      if (hit && hit.distance < dist) {
        desired.copy(from).addScaledVector(dir, Math.max(0.9, hit.distance - 0.25));
      }
      this.currentPos.lerp(desired, 1 - Math.exp(-dt * 26));
      this.camera.position.copy(this.currentPos);
      lookAt.set(f.x, f.y, f.z).addScaledVector(forward, 13).addScaledVector(new Vector3(0, 1, 0), 0.8);
      const eye = this.currentPos;
      const m = this.camera.matrix.lookAt(eye, lookAt, tempV.copy(up).multiplyScalar(0.35).add(new Vector3(0, 1, 0)).normalize());
      const lookQ = new Quaternion().setFromRotationMatrix(m);
      this.currentQuat.slerp(lookQ, 1 - Math.exp(-dt * 12));
      this.camera.quaternion.copy(this.currentQuat);
    }

    this.shakeTime += dt;
    if (this.shake > 0.001) {
      const amp = this.shake * 0.085;
      this.camera.position.x += Math.sin(this.shakeTime * 76) * amp;
      this.camera.position.y += Math.sin(this.shakeTime * 93 + 1.2) * amp;
      this.camera.rotateZ(Math.sin(this.shakeTime * 65) * amp * 0.32);
      this.shake *= Math.exp(-dt * 4.6);
    }
    if (this.buffet > 0.001) {
      const amp = this.buffet * 0.016;
      this.camera.position.x += Math.sin(this.shakeTime * 41.7) * amp;
      this.camera.position.y += Math.sin(this.shakeTime * 57.3 + 0.7) * amp * 0.7;
      this.camera.rotateZ(Math.sin(this.shakeTime * 33.1) * amp * 0.3);
    }
  }

  updateDeath(dt: number, plane: PlaneRuntime, aspect: number): void {
    this.camera.aspect = aspect;
    const f = plane.flight;
    const q = new Quaternion(f.qx, f.qy, f.qz, f.qw);
    forward.set(0, 0, -1).applyQuaternion(q);
    desired.set(Math.sin(performance.now() * 0.00025) * 8, 5.5, Math.cos(performance.now() * 0.00025) * 8).add(new Vector3(f.x, f.y, f.z));
    this.currentPos.lerp(desired, 1 - Math.exp(-dt * 2.2));
    this.camera.position.copy(this.currentPos);
    lookAt.set(f.x, f.y, f.z);
    this.camera.lookAt(lookAt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}

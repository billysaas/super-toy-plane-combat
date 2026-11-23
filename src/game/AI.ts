import { Quaternion, Vector3 } from "three";
import { clamp, DIFFICULTY_INFO, type Difficulty, type GameMode } from "../../shared/config";
import { raycastWorld } from "../../shared/collision";
import { STATIC_BOXES } from "../../shared/worldLayout";
import type { Controls, FlightState, PlaneRuntime } from "../../shared/types";

export interface AIWorldPlane {
  id: string;
  team: string;
  alive: boolean;
  flight: FlightState;
  runtime: PlaneRuntime;
}

const PATROL_POINTS = [
  new Vector3(-25, 8, 4), new Vector3(-35, 6, -24), new Vector3(18, 6, -24),
  new Vector3(34, 7, -4), new Vector3(36, 7, 26), new Vector3(4, 16, 4),
  new Vector3(34, 16, -27), new Vector3(34, 16, 26), new Vector3(0, 28, 50),
  new Vector3(-72, 20, 38), new Vector3(60, 24, -30), new Vector3(0, 26, -68),
  new Vector3(77, 18, 44), new Vector3(-35, 8, 22), new Vector3(22, 8, 24),
];

const toTarget = new Vector3();
const targetPoint = new Vector3();
const desired = new Vector3();
const forward = new Vector3();
const localDir = new Vector3();
const position = new Vector3();
const q = new Quaternion();
const right = new Vector3();
const up = new Vector3();
const temp = new Vector3();
const bestDir = new Vector3();
const startDir = new Vector3();

function rotateToward(base: Vector3, axis: Vector3, angle: number): Vector3 {
  return temp.copy(base).applyAxisAngle(axis, angle);
}

export class BotPilot {
  private targetId: string | null = null;
  private reactionTimer = 0;
  private rocketTimer = 0;
  private patrolIndex = Math.floor(Math.random() * PATROL_POINTS.length);
  private difficulty: Difficulty;
  private mode: GameMode;
  private seed: number;
  private steerDir = new Vector3(0, 0, -1);
  private jinkTimer = 0;
  private jinkDir = 1;
  private fireBurst = 0;
  private burstRest = 0;

  constructor(difficulty: Difficulty, mode: GameMode, seed = Math.random() * 10000) {
    this.difficulty = difficulty;
    this.mode = mode;
    this.seed = seed;
  }

  reset(): void {
    this.targetId = null;
    this.reactionTimer = 0;
    this.rocketTimer = 0;
    this.steerDir.set(0, 0, -1);
    this.patrolIndex = Math.floor(Math.random() * PATROL_POINTS.length);
    this.jinkTimer = 0;
    this.burstRest = 0;
    this.fireBurst = 0;
  }

  get accuracy(): number {
    return DIFFICULTY_INFO[this.difficulty].accuracy;
  }

  update(dt: number, self: PlaneRuntime, planes: AIWorldPlane[], fireCooldown: number): Controls {
    this.seed = (this.seed + dt * 97.13) % 1000;
    const skill = DIFFICULTY_INFO[this.difficulty];
    this.reactionTimer -= dt;
    this.rocketTimer -= dt;
    this.jinkTimer -= dt;
    this.burstRest -= dt;
    this.fireBurst -= dt;
    const f = self.flight;
    position.set(f.x, f.y, f.z);
    q.set(f.qx, f.qy, f.qz, f.qw);
    forward.set(0, 0, -1).applyQuaternion(q);
    right.set(1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);

    const enemies = planes.filter((p) => p.alive && p.id !== self.id && (this.mode === "ffa" || p.team !== self.team));
    if (this.reactionTimer <= 0) {
      this.reactionTimer = Math.max(0.18, skill.reaction * (0.8 + Math.random() * 0.5));
      let best: AIWorldPlane | null = null;
      let bestScore = Infinity;
      for (const enemy of enemies) {
        temp.set(enemy.flight.x, enemy.flight.y, enemy.flight.z);
        const d = position.distanceToSquared(temp);
        let score = d * (0.85 + Math.random() * 0.3);
        if (enemy.runtime.lastHitBy === self.id) score *= 0.55;
        if (enemy.runtime.health / enemy.runtime.maxHealth < 0.4) score *= 0.72;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      this.targetId = best?.id ?? null;
    }
    const target = enemies.find((p) => p.id === this.targetId) ?? null;

    if (target) {
      targetPoint.set(target.flight.x, target.flight.y, target.flight.z);
      toTarget.copy(targetPoint).sub(position);
    } else {
      targetPoint.copy(PATROL_POINTS[this.patrolIndex]);
      if (position.distanceToSquared(targetPoint) < 120) {
        this.patrolIndex = (this.patrolIndex + 1 + Math.floor(Math.random() * 4)) % PATROL_POINTS.length;
        targetPoint.copy(PATROL_POINTS[this.patrolIndex]);
      }
      toTarget.copy(targetPoint).sub(position);
    }
    const targetDist = toTarget.length();
    if (targetDist > 0.001) toTarget.divideScalar(targetDist);

    let targetVisible = false;
    if (target) {
      const hit = raycastWorld(position, toTarget, targetDist - 0.8, STATIC_BOXES);
      targetVisible = !hit;
    }

    const dangerForward = raycastWorld(position, forward, 42, STATIC_BOXES);
    const forwardClear = dangerForward?.distance ?? 46;

    const candidates: Vector3[] = [];
    candidates.push(targetVisible ? toTarget : forward);
    candidates.push(forward);
    candidates.push(rotateToward(forward, up, 0.55).clone());
    candidates.push(rotateToward(forward, up, -0.55).clone());
    candidates.push(rotateToward(forward, up, 1.15).clone());
    candidates.push(rotateToward(forward, up, -1.15).clone());
    candidates.push(rotateToward(forward, right, 0.42).clone());
    candidates.push(rotateToward(forward, right, -0.42).clone());
    if (f.y < 8) candidates.push(new Vector3(0, 0.82, -0.4).applyQuaternion(q));
    if (f.y > 16) candidates.push(new Vector3(0, -0.75, -0.4).applyQuaternion(q));

    let bestScore = -Infinity;
    bestDir.copy(forward);
    for (const cand of candidates) {
      if (cand.lengthSq() < 0.0001) continue;
      const dir = cand.clone().normalize();
      const hit = raycastWorld(position, dir, 44, STATIC_BOXES);
      const clearance = hit?.distance ?? 46;
      const alignTarget = dir.dot(toTarget);
      const alignForward = dir.dot(forward);
      let score = Math.min(34, clearance) + alignForward * 2.5;
      score += alignTarget * (targetVisible ? 24 : 8);
      if (hit && hit.distance < 8) score -= 90;
      else if (hit && hit.distance < 16) score -= 24;
      if (dir.y < -0.1 && f.y < 6) score -= 22;
      if (dir.y > 0.15 && f.y > 18.5 && f.y < 21) score -= 18;
      if (self.health / self.maxHealth < 0.45 && Math.abs(cand.y) > 0.2) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestDir.copy(dir);
      }
    }

    if (forwardClear < 15) {
      const escape = new Vector3();
      const leftHit = raycastWorld(position, rotateToward(forward, up, 1.3), 30, STATIC_BOXES);
      const rightHit = raycastWorld(position, rotateToward(forward, up, -1.3), 30, STATIC_BOXES);
      const leftClear = leftHit?.distance ?? 31;
      const rightClear = rightHit?.distance ?? 31;
      const upHit = raycastWorld(position, up, 16, STATIC_BOXES);
      const upClear = upHit?.distance ?? 17;
      if (upClear > 5 && f.y < 9) escape.set(0, 0.8, -0.3).applyQuaternion(q);
      else if (leftClear > rightClear) escape.copy(rotateToward(forward, up, 1.25));
      else escape.copy(rotateToward(forward, up, -1.25));
      bestDir.lerp(escape.normalize(), 0.8).normalize();
    }

    if (this.jinkTimer <= 0 && self.health / self.maxHealth < 0.35 && Math.random() < 0.02) {
      this.jinkTimer = 0.6 + Math.random() * 0.5;
      this.jinkDir = Math.random() > 0.5 ? 1 : -1;
    }
    const steerSpeed = forwardClear < 15 ? 12 : 4.5;
    startDir.copy(this.steerDir);
    this.steerDir.lerp(bestDir, 1 - Math.exp(-dt * steerSpeed)).normalize();
    if (this.steerDir.lengthSq() < 0.01) this.steerDir.copy(bestDir);
    desired.copy(this.steerDir);
    if (this.jinkTimer > 0) {
      desired.applyAxisAngle(up, this.jinkDir * 0.25);
      desired.normalize();
    }
    if (targetVisible && forwardClear > 20 && targetDist > 4) {
      desired.lerp(toTarget, 0.72).normalize();
    }

    const inverse = q.clone().invert();
    localDir.copy(desired).applyQuaternion(inverse).normalize();
    const level = clamp(right.y * 4.2, -1, 1);
    let roll = clamp(localDir.x * 1.5 + level, -1, 1);
    let yaw = clamp(localDir.x * 3.1, -1, 1);
    let pitch = clamp(localDir.y * 2.9, -0.8, 0.82);
    if (localDir.z > 0.55 && Math.abs(localDir.x) < 0.2) {
      yaw = Math.sin(this.seed * 0.37) > 0 ? 0.9 : -0.9;
      roll = yaw > 0 ? 0.9 : -0.9;
      pitch = 0.22;
    }
    if (f.y < 4.2) {
      pitch = Math.max(pitch, 0.55);
      roll = clamp(roll, -0.6, 0.6);
    }
    if (f.y > 20.8 && forwardClear < 30) pitch = Math.min(pitch, -0.15);
    if (this.healthRatio(self) < 0.25) {
      pitch = clamp(pitch + Math.sin(this.seed * 0.7) * 0.25, -0.8, 0.82);
    }

    let throttle = 0.66;
    if (targetDist > 75 && forwardClear > 28) throttle = 0.9;
    if (targetDist < 16) throttle = 0.5;
    if (forwardClear < 24) throttle = 0.38;
    if (forwardClear < 12) throttle = 0.28;
    if (f.speed < 5.7) throttle = 1;
    const boosting = targetDist > 100 && forwardClear > 36 && this.jinkTimer <= 0 && f.boost > 25;

    const aim = target ? forward.dot(toTarget) : 0;
    let fire = false;
    let rocket = false;
    if (target && targetVisible && forwardClear > 8 && targetDist < 110) {
      const aimWindow = 0.984 - (1 - skill.accuracy) * 0.045;
      if (aim > aimWindow) {
        if (this.burstRest <= 0 && this.fireBurst <= 0) {
          this.fireBurst = 0.7 + Math.random() * 0.8;
          this.burstRest = this.fireBurst + 0.35 + Math.random() * 0.55;
        }
        fire = this.fireBurst > 0;
      }
      if (targetDist > 24 && targetDist < 85 && aim > 0.993 && this.rocketTimer <= 0 && Math.random() < skill.aggression * 0.025) {
        rocket = true;
        this.rocketTimer = 4 + Math.random() * 5;
      }
    }
    const jitter = (1 - skill.accuracy) * 0.04;
    pitch = clamp(pitch + (Math.random() - 0.5) * jitter, -1, 1);
    yaw = clamp(yaw + (Math.random() - 0.5) * jitter, -1, 1);
    roll = clamp(roll + (Math.random() - 0.5) * jitter * 0.45, -1, 1);
    void startDir;
    void fireCooldown;

    return {
      pitch,
      roll,
      yaw,
      throttle,
      boost: boosting,
      fire,
      rocket,
    };
  }

  private healthRatio(self: PlaneRuntime): number {
    return self.health / self.maxHealth;
  }
}

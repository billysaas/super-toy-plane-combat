import { CylinderGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene, Vector3 } from "three";
import {
  AIRCRAFT,
  BOT_NAMES_AXIS,
  BOT_NAMES_RAF,
  DEFAULT_SOLO,
  DEFAULT_THROTTLE,
  DIFFICULTY_INFO,
  TEAM_INFO,
  WORLD,
  clamp,
  getAircraft,
  type AircraftDef,
  type CameraMode,
  type GameMode,
  type Settings,
  type SoloConfig,
  type Team,
} from "../../shared/config";
import { createFlightState, integrateFlight, respawnFlight, reverseFlightDirection } from "../../shared/flight";
import { distancePointSegmentSq, raySphere } from "../../shared/collision";
import { getSpawnForTeam } from "../../shared/worldLayout";
import { BALLOON, BALLOON_SPAWNS, PICKUP_INFO, pickupForBalloon, type PickupKind } from "../../shared/powerups";
import type { Controls, KillEvent, PlaneRuntime } from "../../shared/types";
import type { AssetStore } from "./AssetStore";
import type { AudioManager } from "./Audio";
import { AircraftView } from "./AircraftView";
import { BalloonField } from "./BalloonField";
import type { CameraRig } from "./CameraRig";
import type { Effects } from "./Effects";
import type { InputManager } from "./Input";
import type { PhysicsWorld } from "./PhysicsWorld";
import { BotPilot, type AIWorldPlane } from "./AI";

export interface HudTarget {
  x: number;
  y: number;
  distance: number;
  health: number;
  team: Team;
  onScreen: boolean;
}

export interface RadarBlip {
  x: number;
  y: number;
  altitude: number;
  team: Team;
  isTarget: boolean;
}

export interface HudData {
  mode: GameMode;
  timeLeft: number;
  scoreRAF: number;
  scoreAXIS: number;
  health: number;
  maxHealth: number;
  armor: number;
  armorMax: number;
  cadence: number;
  speed: number;
  altitude: number;
  boost: number;
  throttle: number;
  ammo: number;
  rockets: number;
  cameraMode: CameraMode;
  alive: boolean;
  respawnIn: number;
  team: Team;
  playerName: string;
  aircraftName: string;
  kills: number;
  deaths: number;
  boosting: boolean;
  invulnerable: boolean;
  target: HudTarget | null;
  radar: RadarBlip[];
  playerHeading: number;
  hitFlash: number;
  damageFlash: number;
}

export interface ScoreRow {
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  score: number;
  isBot: boolean;
  isPlayer: boolean;
}

export interface MatchResult {
  win: boolean;
  draw: boolean;
  mode: GameMode;
  scoreRAF: number;
  scoreAXIS: number;
  rows: ScoreRow[];
  playerKills: number;
  playerDeaths: number;
}

export interface LocalMatchCallbacks {
  onKill: (event: KillEvent) => void;
  onChat: (name: string, text: string, team: Team | "SYSTEM") => void;
  onMatchEnd: (result: MatchResult) => void;
  onHit: () => void;
  onKilled: () => void;
  onSpawn: () => void;
  onPickup: (kind: PickupKind) => void;
}

export interface LocalMatchDeps {
  scene: Scene;
  assets: AssetStore;
  physics: PhysicsWorld;
  effects: Effects;
  audio: AudioManager;
  input: InputManager;
  camera: CameraRig;
  settings: Settings;
  callbacks: LocalMatchCallbacks;
  playerName: string;
}

interface LocalPlane {
  runtime: PlaneRuntime;
  def: AircraftDef;
  view: AircraftView;
  bot?: BotPilot;
  controls: Controls;
  smokeTimer: number;
  trailTimer: number;
  collisionCooldown: number;
  fireSide: number;
  previousRocket: boolean;
  aiSpread: number;
  cadenceUntil: number;
}

interface LocalBalloon {
  index: number;
  health: number;
  alive: boolean;
  pickup: PickupKind | null;
  pickupExpiresAt: number;
  respawnAt: number;
}

interface RocketProjectile {
  ownerId: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  targetId: string | null;
  mesh: Group;
}

const fwd = new Vector3();
const muzzle = new Vector3();
const tmp = new Vector3();
const tmp2 = new Vector3();
const q = new Quaternion();
const rocketGeo = new CylinderGeometry(0.07, 0.1, 0.7, 6);
const rocketNoseGeo = new ConeGeometry(0.13, 0.3, 6);
const rocketBodyMat = new MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.6 });
const rocketGlowMat = new MeshBasicMaterial({ color: 0xffb74d });

export class LocalMatch {
  private deps: LocalMatchDeps;
  config: SoloConfig;
  private planes: LocalPlane[] = [];
  private player!: LocalPlane;
  private rockets: RocketProjectile[] = [];
  private balloonField: BalloonField;
  private balloons: LocalBalloon[] = [];
  private elapsed = 0;
  private simTime = 0;
  private timeLeft: number = WORLD.matchSeconds;
  private scoreRAF = 0;
  private scoreAXIS = 0;
  private phase: "playing" | "ended" = "playing";
  private accumulator = 0;
  private cameraMode: CameraMode;
  private hitFlash = 0;
  private damageFlash = 0;
  private killFeed: KillEvent[] = [];
  private lastChat = 8;
  private lastHudTarget: HudTarget | null = null;
  private lastTargetId: string | null = null;
  private disabled = false;
  private cleanup: () => void;
  private lastControls: Controls;
  private killMarkers = 0;
  private result: MatchResult | null = null;

  constructor(deps: LocalMatchDeps, config: SoloConfig = DEFAULT_SOLO) {
    this.deps = deps;
    this.config = { ...config };
    this.cameraMode = deps.settings.camera;
    this.deps.camera.setMode(this.cameraMode);
    this.lastControls = { pitch: 0, roll: 0, yaw: 0, throttle: DEFAULT_THROTTLE, boost: false, fire: false, rocket: false, autoLevelRoll: false, autoLevelPitch: false };
    this.balloonField = new BalloonField(this.deps.scene, this.deps.settings.quality);
    this.balloons = BALLOON_SPAWNS.map((_, index) => ({
      index,
      health: BALLOON.maxHealth,
      alive: true,
      pickup: null,
      pickupExpiresAt: 0,
      respawnAt: 0,
    }));
    this.spawnPlanes();
    this.deps.audio.startEngine();
    this.deps.camera.snapTo(this.player.runtime);
    this.cleanup = () => undefined;
    this.deps.effects.setQuality(deps.settings.quality);
  }

  private spawnPlanes(): void {
    const def = getAircraft(this.config.aircraftId);
    this.player = this.createPlane("player", this.deps.playerName, "RAF", def, false, -31, 8.5, 27, 0.06);
    this.planes.push(this.player);
    const axisNames = [...BOT_NAMES_AXIS].sort(() => Math.random() - 0.5);
    const rafNames = [...BOT_NAMES_RAF].sort(() => Math.random() - 0.5);
    const enemyCount = clamp(this.config.enemies, 1, 11);
    for (let i = 0; i < enemyCount; i++) {
      const team: Team = "AXIS";
      const name = team === "AXIS" ? axisNames[i % axisNames.length] : rafNames[i % rafNames.length];
      const botDef = AIRCRAFT[(i + 1 + Math.floor(Math.random() * 3)) % AIRCRAFT.length];
      const spawnPoint = i === 0 ? { x: -22, y: 9, z: -5, yaw: Math.PI } : getSpawnForTeam(team);
      const bot = this.createPlane(`bot-${i}`, name, team, botDef, true, spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.yaw);
      bot.bot = new BotPilot(this.config.difficulty, this.config.mode, 13 + i * 7);
      bot.aiSpread = DIFFICULTY_INFO[this.config.difficulty].accuracy;
      this.planes.push(bot);
    }
  }

  private createPlane(
    id: string,
    name: string,
    team: Team,
    def: AircraftDef,
    isBot: boolean,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ): LocalPlane {
    const flight = createFlightState(x, y, z, yaw, def);
    const runtime: PlaneRuntime = {
      id,
      name,
      team,
      aircraftId: def.id,
      flight,
      health: def.maxHealth,
      maxHealth: def.maxHealth,
      armor: 0,
      ammo: def.gunAmmo,
      rockets: def.rocketAmmo,
      alive: true,
      respawnAt: 0,
      invulnerableUntil: 0,
      fireCooldown: 0,
      rocketCooldown: 0,
      kills: 0,
      deaths: 0,
      score: 0,
      lastHitAt: 0,
      isBot,
    };
    const view = new AircraftView(this.deps.assets, def, team, this.deps.settings.quality !== "low");
    view.group.position.set(x, y, z);
    view.group.quaternion.set(flight.qx, flight.qy, flight.qz, flight.qw);
    this.deps.scene.add(view.group);
    view.sync(runtime, 0, false);
    const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: DEFAULT_THROTTLE, boost: false, fire: false, rocket: false, autoLevelRoll: false, autoLevelPitch: false };
    return {
      runtime,
      def,
      view,
      controls,
      smokeTimer: 0,
      trailTimer: 0,
      collisionCooldown: 0,
      fireSide: 0,
      previousRocket: false,
      aiSpread: isBot ? 0.7 : 1,
      cadenceUntil: 0,
    };
  }

  update(frameDt: number): void {
    if (this.disabled || this.phase !== "playing") {
      this.updatePresentation(frameDt);
      return;
    }
    const raw = this.deps.input.getControls(frameDt);
    const smooth = Math.min(1, frameDt * 15);
    this.lastControls.pitch += (raw.pitch - this.lastControls.pitch) * smooth;
    this.lastControls.roll += (raw.roll - this.lastControls.roll) * smooth;
    this.lastControls.yaw += (raw.yaw - this.lastControls.yaw) * smooth;
    this.lastControls.throttle = raw.throttle;
    this.lastControls.boost = raw.boost;
    this.lastControls.fire = raw.fire;
    this.lastControls.rocket = raw.rocket;
    this.lastControls.autoLevelRoll = raw.autoLevelRoll;
    this.lastControls.autoLevelPitch = raw.autoLevelPitch;
    this.player.controls = this.lastControls;

    const fixed = 1 / 60;
    this.accumulator = Math.min(this.accumulator + frameDt, fixed * 5);
    while (this.accumulator >= fixed) {
      this.simulate(fixed);
      this.accumulator -= fixed;
    }
    this.elapsed += frameDt;
    this.updatePresentation(frameDt);
    this.deps.physics.step(frameDt);
    this.deps.effects.update(frameDt, this.deps.physics);
    this.deps.audio.setEngine(this.player.runtime.flight.speed, this.player.controls.boost, this.player.runtime.alive);
    this.updateCamera(frameDt);
    this.updateHudTarget();
    this.hitFlash = Math.max(0, this.hitFlash - frameDt * 4.2);
    this.damageFlash = Math.max(0, this.damageFlash - frameDt * 2.2);
    this.lastChat -= frameDt;
    if (this.lastChat <= 0) {
      this.lastChat = 14 + Math.random() * 18;
      const lines = [
        "Bandits low over the dining table.",
        "Hostile crossing the garden hedge.",
        "Watch the chandelier, pilot.",
        "Enemy spotted near the staircase.",
        "Skylight is clear. Use it.",
        "Keep it under the ceiling beams.",
      ];
      this.deps.callbacks.onChat("CONTROL", lines[Math.floor(Math.random() * lines.length)], "SYSTEM");
    }
    if (this.timeLeft <= 0) this.endMatch();
  }

  private simulate(dt: number): void {
    this.simTime += dt;
    this.timeLeft -= dt;
    for (const p of this.planes) {
      if (!p.runtime.alive) {
        if (this.simTime >= p.runtime.respawnAt) this.respawn(p);
        continue;
      }
      p.runtime.fireCooldown = Math.max(0, p.runtime.fireCooldown - dt);
      p.runtime.rocketCooldown = Math.max(0, p.runtime.rocketCooldown - dt);
      p.collisionCooldown = Math.max(0, p.collisionCooldown - dt);
      if (p.bot) {
        const aiPlanes = this.planes.map<AIWorldPlane>((other) => ({
          id: other.runtime.id,
          team: other.runtime.team,
          alive: other.runtime.alive,
          flight: other.runtime.flight,
          runtime: other.runtime,
        }));
        p.controls = p.bot.update(dt, p.runtime, aiPlanes, p.runtime.fireCooldown);
      }
      const speedBefore = p.runtime.flight.speed;
      const from = tmp.set(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z).clone();
      integrateFlight(p.runtime.flight, p.def, p.controls, dt);
      const to = new Vector3(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z);
      const sweep = this.deps.physics.planeSweep(from, to, WORLD.planeRadius);
      if (sweep.hit) {
        p.runtime.flight.x = sweep.position.x;
        p.runtime.flight.y = sweep.position.y;
        p.runtime.flight.z = sweep.position.z;
        if (sweep.normal.lengthSq() > 0.01) {
          p.runtime.flight.x += sweep.normal.x * 0.05;
          p.runtime.flight.y += sweep.normal.y * 0.05;
          p.runtime.flight.z += sweep.normal.z * 0.05;
        }
        reverseFlightDirection(p.runtime.flight);
        if (p.collisionCooldown <= 0 && speedBefore > 2.4) {
          p.collisionCooldown = 0.4;
          this.deps.effects.impact(sweep.position, sweep.normal);
          if (p === this.player) {
            this.deps.audio.collision();
            this.deps.camera.addShake(0.45);
          }
        }
      }
      if (p.runtime.alive) this.handleWeapons(p);
    }
    this.updateRockets(dt);
    this.updateBalloons();
    for (const p of this.planes) {
      if (!p.runtime.alive) continue;
      p.smokeTimer -= dt;
      p.trailTimer -= dt;
      if (p.controls.boost && p.trailTimer <= 0) {
        p.trailTimer = 0.025;
        fwd.set(0, 0, -1).applyQuaternion(q.set(p.runtime.flight.qx, p.runtime.flight.qy, p.runtime.flight.qz, p.runtime.flight.qw));
        const exhaust = new Vector3().copy(p.view.exhaustLocal).applyQuaternion(q).add(new Vector3(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z));
        this.deps.effects.boostTrail(exhaust, fwd, p.def.trailColor);
      }
      if (p.runtime.health / p.runtime.maxHealth < 0.38 && p.smokeTimer <= 0) {
        p.smokeTimer = 0.09;
        fwd.set(0, 0, -1).applyQuaternion(q.set(p.runtime.flight.qx, p.runtime.flight.qy, p.runtime.flight.qz, p.runtime.flight.qw));
        const exhaust = new Vector3().copy(p.view.exhaustLocal).applyQuaternion(q).add(new Vector3(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z));
        this.deps.effects.smokeTrail(exhaust, fwd, p.runtime.health / p.runtime.maxHealth < 0.2, 0.9);
      }
    }
    if (this.timeLeft <= 0) this.endMatch();
  }

  private handleWeapons(p: LocalPlane): void {
    const fire = p.controls.fire;
    if (fire && p.runtime.fireCooldown <= 0 && p.runtime.ammo > 0 && p.runtime.alive) {
      p.runtime.ammo--;
      p.runtime.fireCooldown = p.cadenceUntil > this.simTime ? p.def.fireInterval * BALLOON.cadenceMultiplier : p.def.fireInterval;
      const f = p.runtime.flight;
      q.set(f.qx, f.qy, f.qz, f.qw);
      fwd.set(0, 0, -1).applyQuaternion(q);
      const spreadScale = p.bot ? (1 - p.aiSpread) * 0.045 : 0.004;
      const spread = new Vector3(
        (Math.random() - 0.5) * spreadScale,
        (Math.random() - 0.5) * spreadScale,
        (Math.random() - 0.5) * spreadScale,
      );
      const dir = fwd.clone().add(spread).normalize();
      const side = p.fireSide++ % 2;
      muzzle.set(side === 0 ? -0.54 : 0.54, 0.06, -0.35).applyQuaternion(q).add(new Vector3(f.x, f.y, f.z));
      const maxRange = 230;
      let hitDist = maxRange;
      let hitPlane: LocalPlane | null = null;
      const worldHit = this.deps.physics.raycast(muzzle, dir, maxRange);
      if (worldHit) hitDist = worldHit.distance;
      for (const other of this.planes) {
        if (other === p || !other.runtime.alive) continue;
        if (this.config.mode === "tdm" && other.runtime.team === p.runtime.team) continue;
        tmp2.set(other.runtime.flight.x, other.runtime.flight.y, other.runtime.flight.z);
        const t = raySphere(muzzle, dir, hitDist, tmp2, WORLD.planeRadius + 0.15);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitPlane = other;
        }
      }
      let hitBalloon: LocalBalloon | null = null;
      for (const balloon of this.balloons) {
        if (!balloon.alive) continue;
        const spawn = BALLOON_SPAWNS[balloon.index];
        tmp2.set(spawn.x, spawn.y, spawn.z);
        const t = raySphere(muzzle, dir, hitDist, tmp2, BALLOON.hitRadius);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitPlane = null;
          hitBalloon = balloon;
        }
      }
      const end = muzzle.clone().addScaledVector(dir, hitDist);
      const teamColor = p.runtime.team === "RAF" ? 0x7cc4ff : 0xff7a5d;
      this.deps.effects.muzzle(muzzle, dir, 0xffd780);
      this.deps.effects.spawnTracer(muzzle, end, teamColor);
      const otherMuzzle = new Vector3(side === 0 ? 0.54 : -0.54, 0.06, -0.35).applyQuaternion(q).add(new Vector3(f.x, f.y, f.z));
      this.deps.effects.muzzle(otherMuzzle, dir);
      if (hitPlane) {
        this.deps.effects.spawnTracer(otherMuzzle, end, teamColor);
        this.deps.effects.hitSpark(end, TEAM_INFO[hitPlane.runtime.team].color);
        this.damage(hitPlane, p.def.gunDamage, p.runtime.id, "machine guns");
        if (p === this.player) {
          this.hitFlash = 1;
          this.deps.audio.hit();
          this.deps.callbacks.onHit();
        }
      } else if (hitBalloon) {
        this.deps.effects.spawnTracer(otherMuzzle, end, teamColor);
        this.deps.effects.hitSpark(end, 0xffcf8a);
        this.damageBalloon(hitBalloon, p.def.gunDamage, p);
        if (p === this.player) {
          this.hitFlash = 1;
          this.deps.audio.hit();
          this.deps.callbacks.onHit();
        }
      } else if (worldHit) {
        this.deps.effects.impact(end, worldHit.normal);
      } else {
        this.deps.effects.spawnTracer(otherMuzzle, end, teamColor);
      }
      if (p === this.player) this.deps.audio.gun();
      if (p.runtime.ammo === 0) {
        p.controls.fire = false;
      }
    }
    const rocketPressed = p.controls.rocket && !p.previousRocket;
    p.previousRocket = p.controls.rocket;
    if (rocketPressed && p.runtime.rocketCooldown <= 0 && p.runtime.rockets > 0 && p.runtime.alive) {
      p.runtime.rockets--;
      p.runtime.rocketCooldown = 1.15;
      this.launchRocket(p);
      if (p === this.player) this.deps.audio.rocket();
    }
  }

  private launchRocket(p: LocalPlane): void {
    const f = p.runtime.flight;
    q.set(f.qx, f.qy, f.qz, f.qw);
    fwd.set(0, 0, -1).applyQuaternion(q);
    const body = new Mesh(rocketGeo, rocketBodyMat);
    body.rotation.x = Math.PI / 2;
    const nose = new Mesh(rocketNoseGeo, rocketGlowMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.48;
    const group = new Group();
    group.add(body, nose);
    this.deps.scene.add(group);
    const target = this.findRocketLock(p);
    const rocket: RocketProjectile = {
      ownerId: p.runtime.id,
      team: p.runtime.team,
      x: f.x + fwd.x * 1.2,
      y: f.y + fwd.y * 1.2,
      z: f.z + fwd.z * 1.2,
      vx: fwd.x * WORLD.rocketSpeed,
      vy: fwd.y * WORLD.rocketSpeed,
      vz: fwd.z * WORLD.rocketSpeed,
      life: 5,
      targetId: target?.runtime.id ?? null,
      mesh: group,
    };
    group.position.set(rocket.x, rocket.y, rocket.z);
    group.quaternion.copy(q);
    this.rockets.push(rocket);
  }

  private findRocketLock(p: LocalPlane): LocalPlane | null {
    q.set(p.runtime.flight.qx, p.runtime.flight.qy, p.runtime.flight.qz, p.runtime.flight.qw);
    fwd.set(0, 0, -1).applyQuaternion(q);
    let best: LocalPlane | null = null;
    let bestDist = 140;
    for (const other of this.planes) {
      if (other === p || !other.runtime.alive) continue;
      if (this.config.mode === "tdm" && other.runtime.team === p.runtime.team) continue;
      tmp.set(other.runtime.flight.x - p.runtime.flight.x, other.runtime.flight.y - p.runtime.flight.y, other.runtime.flight.z - p.runtime.flight.z);
      const d = tmp.length();
      if (d > bestDist) continue;
      tmp.normalize();
      if (tmp.dot(fwd) > 0.95) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  private updateRockets(dt: number): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      if (r.targetId) {
        const target = this.planes.find((p) => p.runtime.id === r.targetId && p.runtime.alive);
        if (target) {
          tmp.set(target.runtime.flight.x - r.x, target.runtime.flight.y - r.y, target.runtime.flight.z - r.z).normalize();
          const speed = Math.hypot(r.vx, r.vy, r.vz);
          const v = new Vector3(r.vx / speed, r.vy / speed, r.vz / speed);
          const turn = Math.min(1, dt * 1.8);
          v.lerp(tmp, turn).normalize();
          r.vx = v.x * speed;
          r.vy = v.y * speed;
          r.vz = v.z * speed;
        }
      }
      const oldPos = new Vector3(r.x, r.y, r.z);
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      const newPos = new Vector3(r.x, r.y, r.z);
      const sweep = this.deps.physics.planeSweep(oldPos, newPos, 0.25);
      let explodeAt: Vector3 | null = null;
      if (sweep.hit) explodeAt = sweep.position.clone();
      if (!explodeAt) {
        for (const balloon of this.balloons) {
          if (!balloon.alive) continue;
          const spawn = BALLOON_SPAWNS[balloon.index];
          tmp.set(spawn.x, spawn.y, spawn.z);
          if (distancePointSegmentSq(tmp, oldPos, newPos) < BALLOON.hitRadius * BALLOON.hitRadius) {
            explodeAt = newPos.clone();
            break;
          }
        }
      }
      if (!explodeAt) {
        for (const p of this.planes) {
          if (!p.runtime.alive || p.runtime.id === r.ownerId) continue;
          if (this.config.mode === "tdm" && p.runtime.team === r.team) continue;
          tmp.set(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z);
          const distSq = distancePointSegmentSq(tmp, oldPos, newPos);
          if (distSq < 1.45 * 1.45) {
            explodeAt = newPos.clone();
            break;
          }
        }
      }
      if (explodeAt || r.life <= 0) {
        const at = explodeAt ?? newPos;
        this.explodeRocket(r, at);
        this.deps.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.mesh.position.copy(newPos);
      const dir = new Vector3(r.vx, r.vy, r.vz).normalize();
      r.mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir);
      if (Math.random() < 0.8) this.deps.effects.smokeTrail(newPos, dir, false, 0.6);
    }
  }

  private explodeRocket(r: RocketProjectile, at: Vector3): void {
    this.deps.effects.explosion(at, 1.5);
    this.deps.effects.spawnDebris(at, this.deps.physics, 0.6, 0x443b2f);
    const dist = this.player.runtime.alive ? at.distanceTo(new Vector3(this.player.runtime.flight.x, this.player.runtime.flight.y, this.player.runtime.flight.z)) : 999;
    this.deps.audio.explosion(dist, true);
    if (dist < 60) this.deps.camera.addShake(clamp(1 - dist / 60, 0.2, 1));
    for (const p of this.planes) {
      if (!p.runtime.alive) continue;
      if (this.config.mode === "tdm" && p.runtime.team === r.team) continue;
      if (p.runtime.id === r.ownerId) continue;
      tmp.set(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z);
      const d = tmp.distanceTo(at);
      if (d < WORLD.rocketRadius) {
        const amount = WORLD.rocketDamage * clamp(1 - d / WORLD.rocketRadius, 0.18, 1);
        this.damage(p, amount, r.ownerId, "rockets");
        this.deps.effects.hitSpark(tmp, TEAM_INFO[p.runtime.team].color);
        if (p === this.player) {
          this.damageFlash = 1;
          this.deps.camera.addShake(0.9);
        }
      }
    }
    const blastRadius = WORLD.rocketRadius + BALLOON.hitRadius;
    const owner = this.planes.find((p) => p.runtime.id === r.ownerId);
    for (const balloon of this.balloons) {
      if (!balloon.alive) continue;
      const spawn = BALLOON_SPAWNS[balloon.index];
      tmp.set(spawn.x, spawn.y, spawn.z);
      const d = tmp.distanceTo(at);
      if (d < blastRadius) {
        const amount = WORLD.rocketDamage * clamp(1 - d / blastRadius, 0.2, 1);
        this.damageBalloon(balloon, amount, owner);
      }
    }
  }

  private damageBalloon(balloon: LocalBalloon, amount: number, attacker: LocalPlane | undefined): void {
    if (!balloon.alive) return;
    balloon.health -= amount;
    if (balloon.health > 0) return;
    balloon.health = 0;
    this.destroyBalloon(balloon, attacker);
  }

  private destroyBalloon(balloon: LocalBalloon, attacker: LocalPlane | undefined): void {
    balloon.alive = false;
    balloon.pickup = pickupForBalloon(balloon.index);
    balloon.respawnAt = this.simTime + BALLOON.respawnSeconds;
    balloon.pickupExpiresAt = this.simTime + BALLOON.pickupLifetime;
    this.balloonField.setState(balloon.index, false, true);
    const spawn = BALLOON_SPAWNS[balloon.index];
    const pos = new Vector3(spawn.x, spawn.y, spawn.z);
    this.deps.effects.explosion(pos, 0.9, 0xffc77a);
    this.deps.effects.spawnDebris(pos, this.deps.physics, 0.55, 0xd95b4a);
    const dist = this.player.runtime.alive ? pos.distanceTo(this.getPlayerPosition()) : 999;
    this.deps.audio.explosion(dist, false);
    if (dist < 60) this.deps.camera.addShake(clamp(1 - dist / 60, 0.15, 0.8));
    if (attacker) attacker.runtime.score += BALLOON.scoreBonus;
  }

  private updateBalloons(): void {
    for (const balloon of this.balloons) {
      if (!balloon.alive) {
        if (balloon.pickup && this.simTime >= balloon.pickupExpiresAt) {
          balloon.pickup = null;
          this.balloonField.setState(balloon.index, false, false);
        }
        if (this.simTime >= balloon.respawnAt) {
          balloon.alive = true;
          balloon.health = BALLOON.maxHealth;
          balloon.pickup = null;
          this.balloonField.setState(balloon.index, true, false);
        }
        continue;
      }
    }
    for (const p of this.planes) {
      if (!p.runtime.alive) continue;
      const f = p.runtime.flight;
      for (const balloon of this.balloons) {
        if (balloon.alive || !balloon.pickup) continue;
        const spawn = BALLOON_SPAWNS[balloon.index];
        const dx = f.x - spawn.x;
        const dy = f.y - spawn.y;
        const dz = f.z - spawn.z;
        if (dx * dx + dy * dy + dz * dz > BALLOON.pickupRadius * BALLOON.pickupRadius) continue;
        const kind = balloon.pickup;
        balloon.pickup = null;
        this.balloonField.setState(balloon.index, false, false);
        this.applyPickup(p, kind, new Vector3(spawn.x, spawn.y, spawn.z));
      }
    }
  }

  private applyPickup(p: LocalPlane, kind: PickupKind, at: Vector3): void {
    if (kind === "armor") p.runtime.armor = Math.min(BALLOON.armorMax, p.runtime.armor + BALLOON.armorAmount);
    else if (kind === "health") p.runtime.health = Math.min(p.runtime.maxHealth, p.runtime.health + BALLOON.healthAmount);
    else p.cadenceUntil = this.simTime + BALLOON.cadenceSeconds;
    this.deps.effects.hitSpark(at, PICKUP_INFO[kind].color);
    if (p !== this.player) return;
    this.hitFlash = 1;
    this.deps.audio.pickup();
    this.deps.callbacks.onPickup(kind);
  }

  private damage(target: LocalPlane, amount: number, attackerId: string | null, weapon: string): void {
    if (!target.runtime.alive) return;
    if (this.simTime < target.runtime.invulnerableUntil) return;
    let remaining = amount;
    if (target.runtime.armor > 0) {
      const absorbed = Math.min(target.runtime.armor, remaining);
      target.runtime.armor -= absorbed;
      remaining -= absorbed;
    }
    target.runtime.health -= remaining;
    target.runtime.lastHitAt = this.simTime;
    if (attackerId) target.runtime.lastHitBy = attackerId;
    if (target === this.player) this.damageFlash = Math.min(1, this.damageFlash + amount / 80);
    if (target.runtime.health <= 0) {
      target.runtime.health = 0;
      const attacker = attackerId ? this.planes.find((p) => p.runtime.id === attackerId) : undefined;
      this.killPlane(target, attacker, weapon);
    }
  }

  private killPlane(victim: LocalPlane, killer: LocalPlane | undefined, weapon: string): void {
    victim.runtime.alive = false;
    victim.runtime.deaths++;
    victim.runtime.respawnAt = this.simTime + WORLD.respawnSeconds;
    victim.view.group.visible = false;
    const pos = new Vector3(victim.runtime.flight.x, victim.runtime.flight.y, victim.runtime.flight.z);
    this.deps.effects.explosion(pos, 1.8, TEAM_INFO[victim.runtime.team].color);
    this.deps.effects.spawnDebris(pos, this.deps.physics, 0.8, victim.def.bodyColor);
    const dist = this.player.runtime.alive ? pos.distanceTo(new Vector3(this.player.runtime.flight.x, this.player.runtime.flight.y, this.player.runtime.flight.z)) : 999;
    this.deps.audio.explosion(dist, true);
    if (dist < 80) this.deps.camera.addShake(clamp(1 - dist / 80, 0.15, 1.3));
    if (killer) {
      killer.runtime.kills++;
      killer.runtime.score += 100;
      if (killer.runtime.team === "RAF") this.scoreRAF++;
      else this.scoreAXIS++;
      if (killer === this.player) {
        this.killMarkers++;
        this.hitFlash = 1;
      }
    }
    const event: KillEvent = {
      killer: killer?.runtime.name ?? "FURNITURE",
      victim: victim.runtime.name,
      killerTeam: killer?.runtime.team ?? victim.runtime.team,
      victimTeam: victim.runtime.team,
      weapon: killer ? weapon : "a furniture strike",
    };
    this.killFeed.push(event);
    if (this.killFeed.length > 5) this.killFeed.shift();
    this.deps.callbacks.onKill(event);
    if (victim === this.player) {
      this.deps.callbacks.onKilled();
      this.deps.audio.stopEngine();
    }
    if (killer === this.player) this.deps.audio.hit();
    if (this.planes.every((p) => !p.runtime.alive) || this.timeLeft <= 0) this.endMatch();
  }

  private respawn(p: LocalPlane): void {
    const spawn = getSpawnForTeam(p.runtime.team === "RAF" ? "RAF" : "AXIS");
    respawnFlight(p.runtime.flight, spawn.x, spawn.y, spawn.z, spawn.yaw, p.def);
    p.runtime.health = p.runtime.maxHealth;
    p.runtime.armor = 0;
    p.runtime.ammo = p.def.gunAmmo;
    p.runtime.rockets = p.def.rocketAmmo;
    p.cadenceUntil = 0;
    p.runtime.alive = true;
    p.runtime.invulnerableUntil = this.simTime + 2.2;
    p.collisionCooldown = 0;
    p.bot?.reset();
    p.view.group.visible = true;
    p.view.sync(p.runtime, 0, false);
    if (p === this.player) {
      this.deps.camera.snapTo(p.runtime);
      this.deps.audio.startEngine();
      this.deps.callbacks.onSpawn();
      this.damageFlash = 0;
    }
  }

  private updatePresentation(dt: number): void {
    this.balloonField.update(dt);
    for (const p of this.planes) {
      p.view.sync(p.runtime, dt, p.controls.boost && p.runtime.alive);
    }
    const cockpit = this.cameraMode === "cockpit" && this.player.runtime.alive;
    this.player.view.setCockpitHidden(cockpit);
  }

  private updateCamera(dt: number): void {
    if (!this.player.runtime.alive) {
      this.deps.camera.updateDeath(dt, this.player.runtime, this.deps.camera.camera.aspect);
      return;
    }
    const speedRatio = this.player.runtime.flight.speed / this.player.def.boostSpeed;
    const firing = this.player.controls.fire || this.player.controls.rocket;
    this.deps.camera.update(dt, this.player.runtime, speedRatio, this.player.controls.boost, this.deps.camera.camera.aspect, firing);
    this.player.view.setCockpitHidden(this.cameraMode === "cockpit");
  }

  private updateHudTarget(): void {
    const camera = this.deps.camera.camera;
    if (!this.player.runtime.alive) {
      this.lastHudTarget = null;
      return;
    }
    const f = this.player.runtime.flight;
    const playerPos = new Vector3(f.x, f.y, f.z);
    q.set(f.qx, f.qy, f.qz, f.qw);
    fwd.set(0, 0, -1).applyQuaternion(q);
    let best: LocalPlane | null = null;
    let bestScore = Infinity;
    for (const p of this.planes) {
      if (!p.runtime.alive || p === this.player) continue;
      if (this.config.mode === "tdm" && p.runtime.team === this.player.runtime.team) continue;
      tmp.set(p.runtime.flight.x, p.runtime.flight.y, p.runtime.flight.z);
      const to = tmp.clone().sub(playerPos);
      const dist = to.length();
      if (dist > 180) continue;
      to.normalize();
      if (to.dot(fwd) < 0.55) continue;
      const blocked = this.deps.physics.raycast(playerPos, to, Math.max(0.5, dist - 1.2));
      if (blocked) continue;
      const score = dist - to.dot(fwd) * 45;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) {
      this.lastHudTarget = null;
      this.lastTargetId = null;
      return;
    }
    this.lastTargetId = best.runtime.id;
    tmp.set(best.runtime.flight.x, best.runtime.flight.y, best.runtime.flight.z);
    tmp2.copy(tmp).project(camera);
    const onScreen = tmp2.z < 1 && tmp2.z > -1 && Math.abs(tmp2.x) < 1.15 && Math.abs(tmp2.y) < 1.15;
    const target: HudTarget = {
      x: (tmp2.x * 0.5 + 0.5) * 100,
      y: (-tmp2.y * 0.5 + 0.5) * 100,
      distance: new Vector3(best.runtime.flight.x, best.runtime.flight.y, best.runtime.flight.z).distanceTo(playerPos),
      health: best.runtime.health / best.runtime.maxHealth,
      team: best.runtime.team,
      onScreen,
    };
    this.lastHudTarget = target;
  }

  toggleCamera(): CameraMode {
    this.cameraMode = this.cameraMode === "chase" ? "cockpit" : "chase";
    this.deps.camera.setMode(this.cameraMode);
    return this.cameraMode;
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  getCamera(): PerspectiveCamera {
    return this.deps.camera.camera;
  }

  getMode(): GameMode {
    return this.config.mode;
  }

  getPlayerPosition(): Vector3 {
    return new Vector3(this.player.runtime.flight.x, this.player.runtime.flight.y, this.player.runtime.flight.z);
  }

  getHud(): HudData {
    const p = this.player.runtime;
    const radar: RadarBlip[] = [];
    const f = p.flight;
    const yaw = Math.atan2(2 * (f.qw * f.qy + f.qx * f.qz), 1 - 2 * (f.qy * f.qy + f.qz * f.qz));
    for (const other of this.planes) {
      if (other === this.player) continue;
      if (!other.runtime.alive) continue;
      if (this.config.mode === "tdm" && other.runtime.team === p.team) continue;
      radar.push({
        x: other.runtime.flight.x - f.x,
        y: other.runtime.flight.z - f.z,
        altitude: other.runtime.flight.y,
        team: other.runtime.team,
        isTarget: other.runtime.id === this.lastTargetId,
      });
    }
    const hudTarget = this.lastHudTarget;
    return {
      mode: this.config.mode,
      timeLeft: this.timeLeft,
      scoreRAF: this.scoreRAF,
      scoreAXIS: this.scoreAXIS,
      health: p.health,
      maxHealth: p.maxHealth,
      armor: p.armor,
      armorMax: BALLOON.armorMax,
      cadence: Math.max(0, this.player.cadenceUntil - this.simTime),
      speed: p.flight.speed * 4.6,
      altitude: p.flight.y * 3.2,
      boost: p.flight.boost,
      throttle: p.flight.throttle,
      ammo: p.ammo,
      rockets: p.rockets,
      cameraMode: this.cameraMode,
      alive: p.alive,
      respawnIn: Math.max(0, p.respawnAt - this.simTime),
      team: p.team,
      playerName: p.name,
      aircraftName: this.player.def.name,
      kills: p.kills,
      deaths: p.deaths,
      boosting: this.player.controls.boost && p.alive,
      invulnerable: this.simTime < p.invulnerableUntil,
      target: hudTarget,
      radar,
      playerHeading: yaw * 180 / Math.PI,
      hitFlash: this.hitFlash,
      damageFlash: Math.min(1, this.damageFlash + (p.alive ? 0 : 0.18)),
    };
  }

  getScoreboard(): ScoreRow[] {
    return this.planes
      .map((p) => ({
        id: p.runtime.id,
        name: p.runtime.name,
        team: p.runtime.team,
        kills: p.runtime.kills,
        deaths: p.runtime.deaths,
        score: p.runtime.score,
        isBot: p.runtime.isBot,
        isPlayer: p === this.player,
      }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  private endMatch(): void {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.timeLeft = Math.max(0, this.timeLeft);
    this.deps.audio.stopEngine();
    this.deps.input.releasePointerLock();
    const rows = this.getScoreboard();
    let win = false;
    let draw = false;
    if (this.config.mode === "tdm") {
      win = this.scoreRAF > this.scoreAXIS;
      draw = this.scoreRAF === this.scoreAXIS;
    } else {
      win = rows[0]?.isPlayer ?? false;
      draw = false;
    }
    this.deps.audio.fanfare(win);
    this.disabled = true;
    this.result = {
      win,
      draw,
      mode: this.config.mode,
      scoreRAF: this.scoreRAF,
      scoreAXIS: this.scoreAXIS,
      rows,
      playerKills: this.player.runtime.kills,
      playerDeaths: this.player.runtime.deaths,
    };
    this.deps.callbacks.onMatchEnd(this.result);
  }

  addChat(name: string, text: string): void {
    this.deps.callbacks.onChat(name, text, this.player.runtime.team);
  }

  sendChat(text: string): void {
    this.deps.callbacks.onChat(this.player.runtime.name, text, this.player.runtime.team);
  }

  getResult(): MatchResult | null {
    return this.result;
  }

  getKillFeed(): KillEvent[] {
    return this.killFeed;
  }

  getSettings(): Settings {
    return this.deps.settings;
  }

  setPaused(paused: boolean): void {
    this.disabled = paused;
    if (paused) this.deps.audio.stopEngine();
    else if (this.phase === "playing") this.deps.audio.startEngine();
  }

  dispose(): void {
    this.cleanup();
    this.deps.audio.stopEngine();
    for (const p of this.planes) {
      this.deps.scene.remove(p.view.group);
    }
    for (const r of this.rockets) this.deps.scene.remove(r.mesh);
    this.rockets = [];
    this.balloonField.dispose();
    this.deps.effects.reset(this.deps.physics);
    this.planes = [];
  }
}

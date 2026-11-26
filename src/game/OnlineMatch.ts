import type { Room } from "colyseus.js";
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import {
  AIRCRAFT,
  DEFAULT_THROTTLE,
  TEAM_INFO,
  WORLD,
  clamp,
  getAircraft,
  type AircraftDef,
  type CameraMode,
  type GameMode,
  type Settings,
  type Team,
} from "../../shared/config";
import { integrateFlight, reverseFlightDirection } from "../../shared/flight";
import { BALLOON, PICKUP_INFO, type PickupKind } from "../../shared/powerups";
import type { Controls, FlightState, InputPacket, PlaneRuntime } from "../../shared/types";
import type { ActiveMatch } from "./ActiveMatch";
import type { AssetStore } from "./AssetStore";
import type { AudioManager } from "./Audio";
import { AircraftView } from "./AircraftView";
import { BalloonField } from "./BalloonField";
import type { CameraRig } from "./CameraRig";
import type { Effects } from "./Effects";
import type { InputManager } from "./Input";
import type { PhysicsWorld } from "./PhysicsWorld";
import type { HudData, HudTarget, MatchResult, RadarBlip, ScoreRow } from "./LocalMatch";

interface NetPlayerState {
  name: string;
  team: Team;
  aircraft: string;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  speed: number;
  boost: number;
  throttle: number;
  health: number;
  maxHealth: number;
  armor: number;
  cadenceSeconds: number;
  ammo: number;
  rockets: number;
  kills: number;
  deaths: number;
  score: number;
  boosting: boolean;
  respawnIn: number;
}

interface NetBalloonState {
  alive: boolean;
  pickup: boolean;
  kind: PickupKind;
}

interface BalloonMap {
  forEach: (cb: (balloon: NetBalloonState, key: string) => void) => void;
}

interface PlayerMap {
  forEach: (cb: (player: NetPlayerState, key: string) => void) => void;
  get: (key: string) => NetPlayerState | undefined;
  size: number;
}

interface NetState {
  phase: "lobby" | "playing" | "ended";
  mode: GameMode;
  hostId: string;
  roomCode: string;
  maxPlayers: number;
  isPrivate: boolean;
  timeLeft: number;
  scoreRAF: number;
  scoreAXIS: number;
  players: PlayerMap;
  balloons: BalloonMap;
}

interface Snapshot {
  id: string;
  name: string;
  team: Team;
  aircraft: string;
  alive: boolean;
  flight: FlightState;
  health: number;
  maxHealth: number;
  armor: number;
  cadenceSeconds: number;
  ammo: number;
  rockets: number;
  kills: number;
  deaths: number;
  score: number;
  boosting: boolean;
  respawnIn: number;
}

interface OnlinePlane {
  id: string;
  name: string;
  team: Team;
  def: AircraftDef;
  view: AircraftView;
  runtime: PlaneRuntime;
  isLocal: boolean;
  target: Vector3;
  targetQ: Quaternion;
  spawnGrace: number;
  smokeTimer: number;
  flameTimer: number;
}

interface VisualRocket {
  id: number;
  team: Team;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetId: string | null;
  life: number;
  mesh: Group;
}

export interface OnlineMatchDeps {
  scene: Scene;
  assets: AssetStore;
  physics: PhysicsWorld;
  effects: Effects;
  audio: AudioManager;
  input: InputManager;
  camera: CameraRig;
  settings: Settings;
  room: Room;
  callbacks: OnlineCallbacks;
}

export interface OnlineCallbacks {
  onKilled: () => void;
  onSpawn: () => void;
  onKillFeed: (event: any) => void;
  onPickup: (kind: PickupKind) => void;
}

const tmp = new Vector3();
const tmp2 = new Vector3();
const fwd = new Vector3();
const q = new Quaternion();
const rocketGeo = new CylinderGeometry(0.07, 0.1, 0.7, 6);
const rocketNoseGeo = new ConeGeometry(0.13, 0.3, 6);
const rocketBodyMat = new MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.6 });
const rocketGlowMat = new MeshBasicMaterial({ color: 0xffb74d });

function getState(room: Room): NetState {
  return room.state as unknown as NetState;
}

function toFlight(p: NetPlayerState): FlightState {
  return {
    x: p.x, y: p.y, z: p.z,
    qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
    speed: p.speed, boost: p.boost, throttle: p.throttle,
  };
}

export class OnlineMatch implements ActiveMatch {
  private deps: OnlineMatchDeps;
  private room: Room;
  private state: NetState;
  private sessionId: string;
  private planes = new Map<string, OnlinePlane>();
  private local!: OnlinePlane;
  private localSnapshot?: Snapshot;
  private localControls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: DEFAULT_THROTTLE, boost: false, fire: false, rocket: false, autoLevelRoll: false, autoLevelPitch: false };
  private lastControls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: DEFAULT_THROTTLE, boost: false, fire: false, rocket: false, autoLevelRoll: false, autoLevelPitch: false };
  private seq = 0;
  private sendAccumulator = 0;
  private cameraMode: CameraMode;
  private lastAlive = true;
  private lastHealth = 100;
  private hitFlash = 0;
  private damageFlash = 0;
  private targetId: string | null = null;
  private lastHudTarget: HudTarget | null = null;
  private rockets: VisualRocket[] = [];
  private balloonField: BalloonField;
  private result: MatchResult | null = null;
  private ended = false;
  private collisionCooldown = 0;
  private engineRunning = false;

  constructor(deps: OnlineMatchDeps) {
    this.deps = deps;
    this.room = deps.room;
    this.state = getState(this.room);
    this.sessionId = this.room.sessionId;
    this.cameraMode = deps.settings.camera;
    this.deps.camera.setMode(this.cameraMode);
    this.deps.effects.setQuality(deps.settings.quality);
    this.balloonField = new BalloonField(this.deps.scene, deps.settings.quality);
    this.syncBalloons();
    this.rebuildFromState();
    if (this.local) {
      this.deps.camera.snapTo(this.local.runtime);
      this.lastHealth = this.local.runtime.health;
      this.localSnapshot = this.snapshotOf(this.local.id);
    }
    this.deps.audio.startEngine();
    this.engineRunning = true;
  }

  private playerSnapshots(): Snapshot[] {
    const out: Snapshot[] = [];
    this.state.players.forEach((p, id) => {
      out.push({
        id,
        name: p.name,
        team: p.team,
        aircraft: p.aircraft,
        alive: p.alive,
        flight: toFlight(p),
        health: p.health,
        maxHealth: p.maxHealth,
        armor: p.armor,
        cadenceSeconds: p.cadenceSeconds,
        ammo: p.ammo,
        rockets: p.rockets,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        boosting: p.boosting,
        respawnIn: p.respawnIn,
      });
    });
    return out;
  }

  private snapshotOf(id: string): Snapshot | undefined {
    return this.playerSnapshots().find((s) => s.id === id);
  }

  private rebuildFromState(): void {
    const snapshots = this.playerSnapshots();
    const seen = new Set<string>();
    for (const snap of snapshots) {
      seen.add(snap.id);
      let actor = this.planes.get(snap.id);
      if (!actor) actor = this.createActor(snap);
      actor.name = snap.name;
      actor.team = snap.team;
      if (actor.def.id !== snap.aircraft && snap.aircraft) {
        actor.def = getAircraft(snap.aircraft);
      }
      actor.runtime.team = snap.team;
      actor.runtime.id = snap.id;
      actor.runtime.name = snap.name;
      actor.runtime.health = snap.health;
      actor.runtime.maxHealth = snap.maxHealth;
      actor.runtime.armor = snap.armor;
      actor.runtime.ammo = snap.ammo;
      actor.runtime.rockets = snap.rockets;
      actor.runtime.kills = snap.kills;
      actor.runtime.deaths = snap.deaths;
      actor.runtime.score = snap.score;
      actor.runtime.alive = snap.alive;
      actor.target.set(snap.flight.x, snap.flight.y, snap.flight.z);
      actor.targetQ.set(snap.flight.qx, snap.flight.qy, snap.flight.qz, snap.flight.qw);
      if (actor.isLocal) {
        actor.runtime.flight = { ...snap.flight };
        actor.runtime.alive = snap.alive;
      } else {
        actor.runtime.flight = { ...snap.flight };
      }
      actor.view.sync(actor.runtime, 0, snap.boosting);
    }
    for (const [id, actor] of this.planes) {
      if (!seen.has(id)) {
        this.deps.scene.remove(actor.view.group);
        this.planes.delete(id);
      }
    }
    this.local = this.planes.get(this.sessionId)!;
  }

  private createActor(snap: Snapshot): OnlinePlane {
    const def = AIRCRAFT.find((a) => a.id === snap.aircraft) ?? AIRCRAFT[0];
    const view = new AircraftView(this.deps.assets, def, snap.team, this.deps.settings.quality !== "low");
    const runtime: PlaneRuntime = {
      id: snap.id,
      name: snap.name,
      team: snap.team,
      aircraftId: def.id,
      flight: { ...snap.flight },
      health: snap.health,
      maxHealth: snap.maxHealth,
      armor: snap.armor,
      ammo: snap.ammo,
      rockets: snap.rockets,
      alive: snap.alive,
      respawnAt: 0,
      invulnerableUntil: 0,
      fireCooldown: 0,
      rocketCooldown: 0,
      kills: snap.kills,
      deaths: snap.deaths,
      score: snap.score,
      lastHitAt: 0,
      isBot: false,
    };
    view.sync(runtime, 0, false);
    this.deps.scene.add(view.group);
    const actor: OnlinePlane = {
      id: snap.id,
      name: snap.name,
      team: snap.team,
      def,
      view,
      runtime,
      isLocal: snap.id === this.sessionId,
      target: new Vector3(snap.flight.x, snap.flight.y, snap.flight.z),
      targetQ: new Quaternion(snap.flight.qx, snap.flight.qy, snap.flight.qz, snap.flight.qw),
      spawnGrace: 0,
      smokeTimer: Math.random() * 0.1,
      flameTimer: Math.random() * 0.08,
    };
    this.planes.set(snap.id, actor);
    return actor;
  }

  update(dt: number): void {
    this.state = getState(this.room);
    this.syncBalloons();
    this.balloonField.update(dt);
    if (this.ended) {
      this.updateVisuals(dt);
      this.deps.effects.update(dt, this.deps.physics);
      this.deps.physics.step(dt);
      return;
    }
    const snapshots = this.playerSnapshots();
    let localSnap = snapshots.find((s) => s.id === this.sessionId);
    if (!localSnap) {
      this.updateVisuals(dt);
      return;
    }
    this.localSnapshot = localSnap;
    this.syncActors(snapshots, dt);

    if (localSnap.alive && !this.ended) {
      if (!this.lastAlive) {
        this.lastAlive = true;
        this.local.runtime.flight = { ...localSnap.flight };
        this.local.view.group.visible = true;
        this.deps.camera.snapTo(this.local.runtime);
        if (!this.engineRunning) {
          this.deps.audio.startEngine();
          this.engineRunning = true;
        }
        this.deps.callbacks.onSpawn();
      }
      this.stepLocal(dt, localSnap);
      const firing = this.localControls.fire || this.localControls.rocket;
      const healthRatio = localSnap.maxHealth > 0 ? localSnap.health / localSnap.maxHealth : 0;
      const stalled = localSnap.flight.speed < this.local.def.minSpeed * 0.82;
      this.deps.camera.setBuffet(Math.max(0, 0.5 - healthRatio) * 1.4 + (stalled ? 0.55 : 0));
      this.deps.camera.update(dt, this.local.runtime, this.local.runtime.flight.speed / this.local.def.boostSpeed, this.localControls.boost, this.deps.camera.camera.aspect, firing);
    } else {
      this.deps.camera.setBuffet(0);
      if (this.lastAlive) {
        this.lastAlive = false;
        this.local.view.group.visible = false;
        this.deps.audio.stopEngine();
        this.engineRunning = false;
        this.deps.callbacks.onKilled();
        this.deps.camera.snapTo(this.local.runtime);
      }
      this.local.runtime.alive = false;
      this.local.view.group.visible = false;
      this.deps.camera.updateDeath(dt, this.local.runtime, this.deps.camera.camera.aspect);
    }

    this.local.runtime.health = localSnap.health;
    this.local.runtime.maxHealth = localSnap.maxHealth;
    this.local.runtime.armor = localSnap.armor;
    this.local.runtime.ammo = localSnap.ammo;
    this.local.runtime.rockets = localSnap.rockets;
    this.local.runtime.kills = localSnap.kills;
    this.local.runtime.deaths = localSnap.deaths;
    this.local.runtime.score = localSnap.score;
    this.local.runtime.alive = localSnap.alive;
    if (localSnap.health < this.lastHealth) {
      this.damageFlash = Math.min(1, this.damageFlash + (this.lastHealth - localSnap.health) / 55);
      this.deps.camera.addShake(Math.min(0.8, (this.lastHealth - localSnap.health) / 40));
    }
    this.lastHealth = localSnap.health;

    this.updateRocketVisuals(dt);
    this.deps.physics.step(dt);
    this.deps.effects.update(dt, this.deps.physics);
    this.deps.audio.setEngine(this.local.runtime.flight.speed, this.localControls.boost, this.local.runtime.alive, this.localSnapshot ? this.localSnapshot.health / this.localSnapshot.maxHealth : 1);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4.4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    this.updateHudTarget();
    this.updateVisuals(dt);
    if (this.state.phase === "ended" && !this.result) {
      this.ended = true;
      this.result = this.buildResult();
      this.deps.audio.stopEngine();
    }
  }

  private stepLocal(dt: number, serverSnap: Snapshot): void {
    const raw = this.deps.input.getControls(dt);
    const blend = Math.min(1, dt * 15);
    this.lastControls.pitch += (raw.pitch - this.lastControls.pitch) * blend;
    this.lastControls.roll += (raw.roll - this.lastControls.roll) * blend;
    this.lastControls.yaw += (raw.yaw - this.lastControls.yaw) * blend;
    this.lastControls.throttle = raw.throttle;
    this.lastControls.boost = raw.boost;
    this.lastControls.fire = raw.fire;
    this.lastControls.rocket = raw.rocket;
    this.lastControls.autoLevelRoll = raw.autoLevelRoll;
    this.lastControls.autoLevelPitch = raw.autoLevelPitch;
    this.localControls = { ...this.lastControls };
    const f = this.local.runtime.flight;
    const old = new Vector3(f.x, f.y, f.z);
    integrateFlight(f, this.local.def, this.localControls, dt, this.local.runtime.health / this.local.runtime.maxHealth);
    const next = new Vector3(f.x, f.y, f.z);
    const sweep = this.deps.physics.planeSweep(old, next, WORLD.planeRadius);
    if (sweep.hit) {
      f.x = sweep.position.x;
      f.y = sweep.position.y;
      f.z = sweep.position.z;
      if (sweep.normal.lengthSq() > 0.01) {
        f.x += sweep.normal.x * 0.05;
        f.y += sweep.normal.y * 0.05;
        f.z += sweep.normal.z * 0.05;
      }
      reverseFlightDirection(f);
      if (this.collisionCooldown <= 0) {
        this.collisionCooldown = 0.25;
        this.deps.effects.impact(sweep.position, sweep.normal);
        this.deps.camera.addShake(0.28);
        this.deps.audio.collision();
      }
    }

    const serverPos = tmp.set(serverSnap.flight.x, serverSnap.flight.y, serverSnap.flight.z);
    const err = f.x !== undefined ? Math.hypot(f.x - serverPos.x, f.y - serverPos.y, f.z - serverPos.z) : 0;
    if (err > 6.5) {
      f.x = serverPos.x;
      f.y = serverPos.y;
      f.z = serverPos.z;
      f.qx = serverSnap.flight.qx;
      f.qy = serverSnap.flight.qy;
      f.qz = serverSnap.flight.qz;
      f.qw = serverSnap.flight.qw;
      f.speed = serverSnap.flight.speed;
      this.deps.camera.snapTo(this.local.runtime);
    } else {
      const correction = 1 - Math.exp(-dt * (err > 2 ? 7.5 : 1.8));
      f.x += (serverPos.x - f.x) * correction;
      f.y += (serverPos.y - f.y) * correction;
      f.z += (serverPos.z - f.z) * correction;
    }
    const dot = Math.abs(f.qx * serverSnap.flight.qx + f.qy * serverSnap.flight.qy + f.qz * serverSnap.flight.qz + f.qw * serverSnap.flight.qw);
    if (dot < 0.94) {
      const tq = new Quaternion(serverSnap.flight.qx, serverSnap.flight.qy, serverSnap.flight.qz, serverSnap.flight.qw);
      q.set(f.qx, f.qy, f.qz, f.qw).slerp(tq, Math.min(1, dt * 6));
      f.qx = q.x;
      f.qy = q.y;
      f.qz = q.z;
      f.qw = q.w;
    }
    f.speed += (serverSnap.flight.speed - f.speed) * Math.min(0.25, dt * 2.2);
    f.boost = serverSnap.flight.boost;
    this.sendAccumulator += dt;
    if (this.sendAccumulator >= 0.05) {
      this.sendAccumulator = 0;
      this.seq++;
      const packet: InputPacket = {
        seq: this.seq,
        pitch: this.localControls.pitch,
        roll: this.localControls.roll,
        yaw: this.localControls.yaw,
        throttle: this.localControls.throttle,
        boost: this.localControls.boost,
        fire: this.localControls.fire,
        rocket: this.localControls.rocket,
        autoLevelRoll: this.localControls.autoLevelRoll,
        autoLevelPitch: this.localControls.autoLevelPitch,
      };
      this.deps.room.send("input", packet);
    }
    this.local.view.sync(this.local.runtime, dt, this.localControls.boost);
    this.local.view.setCockpitHidden(this.cameraMode === "cockpit");
  }

  private syncActors(snapshots: Snapshot[], dt: number): void {
    const existing = new Set<string>();
    for (const snap of snapshots) {
      existing.add(snap.id);
      let actor = this.planes.get(snap.id);
      if (!actor) actor = this.createActor(snap);
      actor.name = snap.name;
      actor.team = snap.team;
      actor.runtime.name = snap.name;
      actor.runtime.team = snap.team;
      actor.runtime.health = snap.health;
      actor.runtime.maxHealth = snap.maxHealth;
      actor.runtime.armor = snap.armor;
      actor.runtime.ammo = snap.ammo;
      actor.runtime.rockets = snap.rockets;
      actor.runtime.kills = snap.kills;
      actor.runtime.deaths = snap.deaths;
      actor.runtime.score = snap.score;
      actor.runtime.alive = snap.alive;
      actor.target.set(snap.flight.x, snap.flight.y, snap.flight.z);
      actor.targetQ.set(snap.flight.qx, snap.flight.qy, snap.flight.qz, snap.flight.qw);
      if (actor.isLocal) continue;
      const jump = actor.runtime.flight.x !== 0 || actor.runtime.flight.y !== 0 || actor.runtime.flight.z !== 0
        ? Math.hypot(actor.runtime.flight.x - snap.flight.x, actor.runtime.flight.y - snap.flight.y, actor.runtime.flight.z - snap.flight.z)
        : 999;
      if (jump > 25) {
        actor.runtime.flight = { ...snap.flight };
        actor.view.sync(actor.runtime, 0, snap.boosting);
      } else {
        const f = actor.runtime.flight;
        const k = 1 - Math.exp(-dt * 11);
        f.x += (snap.flight.x - f.x) * k;
        f.y += (snap.flight.y - f.y) * k;
        f.z += (snap.flight.z - f.z) * k;
        f.speed += (snap.flight.speed - f.speed) * k;
        f.throttle += (snap.flight.throttle - f.throttle) * k;
        f.boost = snap.flight.boost;
        q.set(f.qx, f.qy, f.qz, f.qw).slerp(actor.targetQ, Math.min(1, dt * 12));
        f.qx = q.x;
        f.qy = q.y;
        f.qz = q.z;
        f.qw = q.w;
        actor.view.sync(actor.runtime, dt, snap.boosting);
      }
    }
    for (const [id, actor] of this.planes) {
      if (!existing.has(id)) {
        this.deps.scene.remove(actor.view.group);
        this.planes.delete(id);
      }
    }
  }

  private updateVisuals(dt: number): void {
    for (const actor of this.planes.values()) {
      actor.smokeTimer -= dt;
      actor.flameTimer -= dt;
      if (actor.isLocal) {
        actor.view.group.visible = this.localSnapshot?.alive ?? false;
        actor.view.setCockpitHidden(this.cameraMode === "cockpit" && actor.runtime.alive);
      } else {
        actor.view.group.visible = actor.runtime.alive;
        actor.view.sync(actor.runtime, dt, actor.runtime.alive && (this.state.players.get(actor.id)?.boosting ?? false));
      }
      if (!actor.runtime.alive) continue;
      const ratio = actor.runtime.maxHealth > 0 ? actor.runtime.health / actor.runtime.maxHealth : 1;
      if (ratio < 0.38 && actor.smokeTimer <= 0) {
        actor.smokeTimer = 0.11;
        const exhaust = actor.view.worldExhaust(new Vector3());
        const dir = actor.view.worldDirection(new Vector3());
        this.deps.effects.smokeTrail(exhaust, dir, ratio < 0.2, 0.9);
      }
      if (ratio < 0.22 && actor.flameTimer <= 0) {
        actor.flameTimer = 0.08;
        const exhaust = actor.view.worldExhaust(new Vector3());
        const dir = actor.view.worldDirection(new Vector3());
        this.deps.effects.damageFlame(exhaust, dir);
      }
    }
  }

  private updateRocketVisuals(dt: number): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.deps.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      if (r.targetId) {
        const targetState = this.state.players.get(r.targetId);
        if (targetState?.alive) {
          tmp.set(targetState.x - r.x, targetState.y - r.y, targetState.z - r.z).normalize();
          const speed = Math.hypot(r.vx, r.vy, r.vz);
          const v = new Vector3(r.vx / speed, r.vy / speed, r.vz / speed);
          v.lerp(tmp, Math.min(1, dt * 1.8)).normalize();
          r.vx = v.x * speed;
          r.vy = v.y * speed;
          r.vz = v.z * speed;
        }
      }
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.mesh.position.set(r.x, r.y, r.z);
      tmp2.set(r.vx, r.vy, r.vz).normalize();
      r.mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), tmp2);
      this.deps.effects.smokeTrail(r.mesh.position, tmp2, false, 0.55);
    }
  }

  private updateHudTarget(): void {
    const camera = this.deps.camera.camera;
    if (!this.localSnapshot?.alive) {
      this.lastHudTarget = null;
      this.targetId = null;
      return;
    }
    const f = this.local.runtime.flight;
    const playerPos = new Vector3(f.x, f.y, f.z);
    q.set(f.qx, f.qy, f.qz, f.qw);
    fwd.set(0, 0, -1).applyQuaternion(q);
    let best: Snapshot | null = null;
    let bestScore = Infinity;
    this.state.players.forEach((p, id) => {
      if (id === this.sessionId || !p.alive) return;
      if (this.state.mode === "tdm" && p.team === this.localSnapshot?.team) return;
      tmp.set(p.x, p.y, p.z);
      const to = tmp.clone().sub(playerPos);
      const dist = to.length();
      if (dist > 180) return;
      to.normalize();
      if (to.dot(fwd) < 0.52) return;
      const blocked = this.deps.physics.raycast(playerPos, to, Math.max(0.5, dist - 1.2));
      if (blocked) return;
      const score = dist - to.dot(fwd) * 45;
      if (score < bestScore) {
        bestScore = score;
        best = {
          id, name: p.name, team: p.team, aircraft: p.aircraft, alive: p.alive,
          flight: toFlight(p), health: p.health, maxHealth: p.maxHealth, ammo: p.ammo,
          rockets: p.rockets, kills: p.kills, deaths: p.deaths, score: p.score, boosting: p.boosting, respawnIn: p.respawnIn,
          armor: p.armor, cadenceSeconds: p.cadenceSeconds,
        };
      }
    });
    if (!best) {
      this.targetId = null;
      this.lastHudTarget = null;
      return;
    }
    const chosen = best as Snapshot;
    this.targetId = chosen.id;
    const targetPos = new Vector3(chosen.flight.x, chosen.flight.y, chosen.flight.z);
    tmp2.copy(targetPos).project(camera);
    const onScreen = tmp2.z < 1 && tmp2.z > -1 && Math.abs(tmp2.x) < 1.15 && Math.abs(tmp2.y) < 1.15;
    this.lastHudTarget = {
      x: (tmp2.x * 0.5 + 0.5) * 100,
      y: (-tmp2.y * 0.5 + 0.5) * 100,
      distance: targetPos.distanceTo(playerPos),
      health: chosen.health / chosen.maxHealth,
      team: chosen.team,
      onScreen,
    };
  }

  getHud(): HudData {
    const snap = this.localSnapshot;
    const f = this.local.runtime.flight;
    const yaw = Math.atan2(2 * (f.qw * f.qy + f.qx * f.qz), 1 - 2 * (f.qy * f.qy + f.qz * f.qz));
    const radar: RadarBlip[] = [];
    this.state.players.forEach((p, id) => {
      if (id === this.sessionId || !p.alive) return;
      radar.push({
        x: p.x - f.x,
        y: p.z - f.z,
        altitude: p.y,
        team: p.team,
        isTarget: id === this.targetId,
      });
    });
    return {
      mode: this.state.mode,
      timeLeft: this.state.timeLeft,
      scoreRAF: this.state.scoreRAF,
      scoreAXIS: this.state.scoreAXIS,
      health: snap?.health ?? 0,
      maxHealth: snap?.maxHealth ?? 100,
      armor: snap?.armor ?? 0,
      armorMax: BALLOON.armorMax,
      cadence: snap?.cadenceSeconds ?? 0,
      speed: f.speed * 4.6,
      altitude: f.y * 3.2,
      boost: f.boost,
      throttle: f.throttle,
      ammo: snap?.ammo ?? 0,
      rockets: snap?.rockets ?? 0,
      cameraMode: this.cameraMode,
      alive: snap?.alive ?? false,
      respawnIn: snap?.respawnIn ?? 0,
      team: this.local.team,
      playerName: this.local.name,
      aircraftName: this.local.def.name,
      kills: snap?.kills ?? 0,
      deaths: snap?.deaths ?? 0,
      boosting: this.localControls.boost && (snap?.alive ?? false),
      invulnerable: false,
      stalled: (snap?.alive ?? false) && f.speed < this.local.def.minSpeed * 0.82,
      target: this.lastHudTarget,
      radar,
      playerHeading: yaw * 180 / Math.PI,
      hitFlash: this.hitFlash,
      damageFlash: this.damageFlash,
    };
  }

  getScoreboard(): ScoreRow[] {
    const rows: ScoreRow[] = [];
    this.state.players.forEach((p, id) => {
      rows.push({
        id,
        name: p.name,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        isBot: false,
        isPlayer: id === this.sessionId,
      });
    });
    return rows.sort((a, b) => b.score - a.score || b.kills - a.kills);
  }

  getMode(): GameMode {
    return this.state.mode;
  }

  toggleCamera(): CameraMode {
    this.cameraMode = this.cameraMode === "chase" ? "cockpit" : "chase";
    this.deps.camera.setMode(this.cameraMode);
    return this.cameraMode;
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  setPaused(paused: boolean): void {
    if (paused) {
      this.deps.audio.stopEngine();
      this.engineRunning = false;
    } else if (this.lastAlive) {
      this.deps.audio.startEngine();
      this.engineRunning = true;
    }
  }

  sendChat(text: string): void {
    this.deps.room.send("chat", text);
  }

  getResult(): MatchResult | null {
    if (!this.result && this.state.phase === "ended") {
      this.ended = true;
      this.result = this.buildResult();
    }
    return this.result;
  }

  private buildResult(): MatchResult {
    const rows = this.getScoreboard();
    const me = rows.find((r) => r.isPlayer);
    let win = false;
    let draw = false;
    if (this.state.mode === "tdm") {
      const myTeam = me?.team ?? this.local.team;
      const mine = myTeam === "RAF" ? this.state.scoreRAF : this.state.scoreAXIS;
      const theirs = myTeam === "RAF" ? this.state.scoreAXIS : this.state.scoreRAF;
      win = mine > theirs;
      draw = mine === theirs;
    } else {
      win = rows[0]?.isPlayer ?? false;
    }
    this.ended = true;
    return {
      win,
      draw,
      mode: this.state.mode,
      scoreRAF: this.state.scoreRAF,
      scoreAXIS: this.state.scoreAXIS,
      rows,
      playerKills: me?.kills ?? 0,
      playerDeaths: me?.deaths ?? 0,
    };
  }

  handleNetEvent(event: string, payload: any): void {
    if (!payload) return;
    if (event === "shot") {
      const from = new Vector3(payload.x, payload.y, payload.z);
      const to = new Vector3(payload.ex, payload.ey, payload.ez);
      const color = payload.team === "RAF" ? 0x7cc4ff : 0xff7a5d;
      this.deps.effects.spawnTracer(from, to, color);
      this.deps.effects.muzzle(from, to.clone().sub(from).normalize());
      if (payload.ownerId === this.sessionId) this.deps.audio.gun();
    } else if (event === "hit") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      const target = this.state.players.get(payload.targetId);
      this.deps.effects.hitSpark(pos, target ? TEAM_INFO[target.team].color : 0xffffff);
      if (payload.attackerId === this.sessionId) {
        this.hitFlash = 1;
        this.deps.audio.hit();
      }
      if (payload.targetId === this.sessionId) this.deps.camera.addShake(0.25);
    } else if (event === "explosion") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      this.deps.effects.explosion(pos, payload.scale ?? 1);
      const dist = this.local ? pos.distanceTo(new Vector3(this.local.runtime.flight.x, this.local.runtime.flight.y, this.local.runtime.flight.z)) : 999;
      this.deps.audio.explosion(dist, true);
      if (dist < 70) this.deps.camera.addShake(clamp(1 - dist / 70, 0.15, 1.2));
      if (payload.id) this.removeRocketVisual(payload.id);
    } else if (event === "rocketSpawn") {
      this.spawnRocketVisual(payload);
      if (payload.ownerId === this.sessionId) this.deps.audio.rocket();
    } else if (event === "impact") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      this.deps.effects.impact(pos, new Vector3(0, 1, 0));
      if (payload.ownerId === this.sessionId) {
        this.deps.audio.collision();
        this.deps.camera.addShake(0.35);
      }
    } else if (event === "kill") {
      this.deps.callbacks.onKillFeed(payload);
    } else if (event === "balloonHit") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      this.deps.effects.hitSpark(pos, 0xffcf8a);
    } else if (event === "balloonDown") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      this.deps.effects.explosion(pos, 0.9, 0xffc77a);
      this.deps.effects.spawnDebris(pos, this.deps.physics, 0.55, 0xd95b4a);
      const dist = this.local ? pos.distanceTo(new Vector3(this.local.runtime.flight.x, this.local.runtime.flight.y, this.local.runtime.flight.z)) : 999;
      this.deps.audio.explosion(dist, false);
      if (dist < 60) this.deps.camera.addShake(clamp(1 - dist / 60, 0.15, 0.8));
    } else if (event === "pickup") {
      const pos = new Vector3(payload.x, payload.y, payload.z);
      const kind = payload.kind as PickupKind;
      const info = PICKUP_INFO[kind];
      if (info) this.deps.effects.hitSpark(pos, info.color);
      if (payload.playerId === this.sessionId) {
        this.hitFlash = 1;
        this.deps.audio.pickup();
        this.deps.callbacks.onPickup(kind);
      }
    }
  }

  private syncBalloons(): void {
    this.state.balloons?.forEach((balloon, key) => {
      this.balloonField.setState(Number(key), balloon.alive, balloon.pickup);
    });
  }

  private spawnRocketVisual(payload: { id: number; ownerId: string; team: Team; x: number; y: number; z: number; vx: number; vy: number; vz: number; targetId: string | null }): void {
    if (!payload || this.rockets.some((r) => r.id === payload.id)) return;
    const body = new Mesh(rocketGeo, rocketBodyMat);
    body.rotation.x = Math.PI / 2;
    const nose = new Mesh(rocketNoseGeo, rocketGlowMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.48;
    const mesh = new Group();
    mesh.add(body, nose);
    mesh.position.set(payload.x, payload.y, payload.z);
    this.deps.scene.add(mesh);
    this.rockets.push({
      id: payload.id,
      ownerId: payload.ownerId,
      team: payload.team,
      x: payload.x,
      y: payload.y,
      z: payload.z,
      vx: payload.vx,
      vy: payload.vy,
      vz: payload.vz,
      targetId: payload.targetId,
      life: 5.5,
      mesh,
    });
  }

  private removeRocketVisual(id: number): void {
    const index = this.rockets.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.deps.scene.remove(this.rockets[index].mesh);
      this.rockets.splice(index, 1);
    }
  }

  dispose(): void {
    this.deps.audio.stopEngine();
    for (const actor of this.planes.values()) {
      this.deps.scene.remove(actor.view.group);
    }
    for (const rocket of this.rockets) this.deps.scene.remove(rocket.mesh);
    this.rockets = [];
    this.planes.clear();
    this.balloonField.dispose();
    this.deps.effects.reset(this.deps.physics);
  }
}

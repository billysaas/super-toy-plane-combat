import { Client, Room, ServerError } from "@colyseus/core";
import { Quaternion, Vector3 } from "three";
import { BalloonState, DogfightState, PlayerState } from "./schema";
import { AIRCRAFT, DEFAULT_AIRCRAFT, DEFAULT_THROTTLE, WORLD, clamp, getAircraft, type AircraftDef } from "../shared/config";
import { BALLOON, BALLOON_SPAWNS, pickupForBalloon, type PickupKind } from "../shared/powerups";
import { createFlightState, integrateFlight, respawnFlight, reverseFlightDirection } from "../shared/flight";
import { distancePointSegmentSq, pointInsideAnyBox, raycastWorld, raySphere, sphereSweepWorld } from "../shared/collision";
import { STATIC_BOXES, getSpawnForTeam } from "../shared/worldLayout";
import type { Controls, FlightState, KillEvent } from "../shared/types";
import { upsertRoom, removeRoom, codeExists } from "./RoomRegistry";

interface PlayerSim {
  id: string;
  state: PlayerState;
  def: AircraftDef;
  flight: FlightState;
  controls: Controls;
  prevRocket: boolean;
  fireCooldown: number;
  rocketCooldown: number;
  nextCollisionAt: number;
  lastInputAt: number;
  lastHitBy: string | null;
  lastHitAt: number;
  respawnAt: number;
  invulnerableUntil: number;
  lastChatAt: number;
  inputSeq: number;
  armor: number;
  cadenceUntil: number;
}

interface SimBalloon {
  index: number;
  state: BalloonState;
  respawnAt: number;
  pickupExpiresAt: number;
}

interface SimRocket {
  id: number;
  ownerId: string;
  team: "RAF" | "AXIS";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetId: string | null;
  life: number;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const tmp = new Vector3();
const tmp2 = new Vector3();
const start = new Vector3();
const dir = new Vector3();
const q = new Quaternion();
const fwd = new Vector3();
const muzzle = new Vector3();
const spawnVec = new Vector3();

function sanitizeName(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const clean = text.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16);
  return clean || `Pilot${Math.floor(Math.random() * 900 + 100)}`;
}

function sanitizeText(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return text.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120);
}

function validAircraft(value: unknown): string {
  return typeof value === "string" && AIRCRAFT.some((a) => a.id === value) ? value : DEFAULT_AIRCRAFT;
}

export class DogfightRoom extends Room<DogfightState> {
  private sims = new Map<string, PlayerSim>();
  private balloons: SimBalloon[] = [];
  private rockets: SimRocket[] = [];
  private simTime = 0;
  private nextRocketId = 1;
  private mode: "tdm" | "ffa" = "tdm";
  private matchLength = WORLD.matchSeconds;
  private maxPlayers = 12;
  private isPrivate = false;
  private roomCode = "";
  private createdAt = Date.now();

  onCreate(options: { mode?: "tdm" | "ffa"; maxPlayers?: number; isPrivate?: boolean }): void {
    this.setState(new DogfightState());
    this.patchRate = 50;
    this.mode = options?.mode === "ffa" ? "ffa" : "tdm";
    this.maxPlayers = clamp(Math.floor(options?.maxPlayers ?? 12), 1, WORLD.maxPlayers);
    this.maxClients = this.maxPlayers;
    this.isPrivate = Boolean(options?.isPrivate);
    this.roomCode = this.generateCode();
    this.maxClients = this.maxPlayers;
    this.state.mode = this.mode;
    this.state.maxPlayers = this.maxPlayers;
    this.state.roomCode = this.roomCode;
    this.state.isPrivate = this.isPrivate;
    this.state.phase = "lobby";
    this.resetBalloons();
    const envLength = Number(process.env.MATCH_SECONDS);
    this.matchLength = Number.isFinite(envLength) && envLength > 0 ? clamp(envLength, 5, 1800) : WORLD.matchSeconds;
    this.setMetadata({ code: this.roomCode, mode: this.mode, maxPlayers: this.maxPlayers, isPrivate: this.isPrivate, phase: "lobby" });
    this.registerSelf();

    this.onMessage("input", (client, message: unknown) => this.handleInput(client, message));
    this.onMessage("ready", (client, message: unknown) => {
      if (this.state.phase !== "lobby") return;
      const sim = this.sims.get(client.sessionId);
      if (!sim) return;
      const next = Boolean(message);
      if (sim.state.ready === next) return;
      sim.state.ready = next;
      this.broadcast("system", { text: `${sim.state.name} is ${next ? "ready" : "not ready"}.` });
      this.registerSelf();
    });
    this.onMessage("aircraft", (client, message: unknown) => {
      if (this.state.phase !== "lobby") return;
      const sim = this.sims.get(client.sessionId);
      if (!sim) return;
      sim.state.aircraft = validAircraft(message);
      sim.def = getAircraft(sim.state.aircraft);
    });
    this.onMessage("team", (client, message: unknown) => {
      if (this.state.phase !== "lobby") return;
      const sim = this.sims.get(client.sessionId);
      if (!sim) return;
      const team = message === "AXIS" ? "AXIS" : message === "RAF" ? "RAF" : null;
      if (!team) return;
      const raf = this.countTeam("RAF");
      const axis = this.countTeam("AXIS");
      if (team === "RAF" && raf > axis + 1) {
        client.send("roomError", { message: "RAF IS FULL." });
        return;
      }
      if (team === "AXIS" && axis > raf + 1) {
        client.send("roomError", { message: "AXIS IS FULL." });
        return;
      }
      sim.state.team = team;
    });
    this.onMessage("start", (client) => this.startMatch(client));
    this.onMessage("chat", (client, message: unknown) => this.handleChat(client, message));
    this.onMessage("leaveMatch", (client) => client.leave());
    this.setSimulationInterval((deltaMs) => this.simulate(Math.min(0.1, deltaMs / 1000)), 1000 / 30);
  }

  async onJoin(client: Client, options: { name?: string; aircraft?: string; team?: "RAF" | "AXIS" }): Promise<void> {
    if (this.state.phase !== "lobby") throw new ServerError(409, "MATCH IN PROGRESS. TRY A DIFFERENT ROOM.");
    if (this.state.players.size >= this.maxPlayers) throw new ServerError(409, "ROOM FULL.");
    const name = sanitizeName(options?.name);
    if ([...this.state.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new ServerError(409, "CALLSIGN ALREADY IN USE. PICK ANOTHER.");
    }
    const requested = options?.team === "AXIS" ? "AXIS" : options?.team === "RAF" ? "RAF" : null;
    const raf = this.countTeam("RAF");
    const axis = this.countTeam("AXIS");
    const team = requested ?? (raf <= axis ? "RAF" : "AXIS");
    const aircraftId = validAircraft(options?.aircraft);
    const def = getAircraft(aircraftId);
    const spawn = getSpawnForTeam(team);
    const flight = createFlightState(spawn.x, spawn.y, spawn.z, spawn.yaw, def);
    const state = new PlayerState();
    state.name = name;
    state.team = team;
    state.aircraft = aircraftId;
    state.health = def.maxHealth;
    state.maxHealth = def.maxHealth;
    state.ammo = def.gunAmmo;
    state.rockets = def.rocketAmmo;
    state.x = spawn.x;
    state.y = spawn.y;
    state.z = spawn.z;
    state.qw = 1;
    state.ready = false;
    this.state.players.set(client.sessionId, state);
    this.sims.set(client.sessionId, {
      id: client.sessionId,
      state,
      def,
      flight,
      controls: { pitch: 0, roll: 0, yaw: 0, throttle: DEFAULT_THROTTLE, boost: false, fire: false, rocket: false, autoLevelRoll: true, autoLevelPitch: true },
      prevRocket: false,
      fireCooldown: 0,
      rocketCooldown: 0,
      nextCollisionAt: 0,
      lastInputAt: 0,
      lastHitBy: null,
      lastHitAt: -100,
      respawnAt: 0,
      invulnerableUntil: 0,
      lastChatAt: 0,
      inputSeq: 0,
      armor: 0,
      cadenceUntil: 0,
    });
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.refreshHosts();
    this.broadcast("system", { text: `${name} joined the ${team} squadron.` });
    this.registerSelf();
  }

  onLeave(client: Client): void {
    const sim = this.sims.get(client.sessionId);
    if (sim) {
      this.broadcast("system", { text: `${sim.state.name} left the sortie.` });
    }
    this.sims.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.keys().next();
      this.state.hostId = next.done ? "" : next.value;
    }
    this.refreshHosts();
    if (this.state.phase === "playing" && this.state.players.size === 0) {
      this.state.phase = "ended";
      this.state.timeLeft = 0;
    }
    this.registerSelf();
  }

  onDispose(): void {
    removeRoom(this.roomId);
  }

  private refreshHosts(): void {
    this.state.players.forEach((player, id) => {
      player.isHost = id === this.state.hostId;
    });
  }

  private handleInput(client: Client, message: unknown): void {
    if (this.state.phase !== "playing") return;
    const sim = this.sims.get(client.sessionId);
    if (!sim || !message || typeof message !== "object") return;
    const raw = message as Record<string, unknown>;
    const now = Date.now();
    if (now - sim.lastInputAt < 12) return;
    const seq = Number(raw.seq);
    if (!Number.isFinite(seq) || seq <= sim.inputSeq) return;
    sim.inputSeq = seq;
    sim.lastInputAt = now;
    sim.controls = {
      pitch: clamp(Number(raw.pitch) || 0, -1, 1),
      roll: clamp(Number(raw.roll) || 0, -1, 1),
      yaw: clamp(Number(raw.yaw) || 0, -1, 1),
      throttle: clamp(Number(raw.throttle) || DEFAULT_THROTTLE, 0.15, 1),
      boost: Boolean(raw.boost),
      fire: Boolean(raw.fire),
      rocket: Boolean(raw.rocket),
      autoLevelRoll: Boolean(raw.autoLevelRoll),
      autoLevelPitch: Boolean(raw.autoLevelPitch),
    };
  }

  private handleChat(client: Client, message: unknown): void {
    const sim = this.sims.get(client.sessionId);
    if (!sim) return;
    const now = Date.now();
    if (now - sim.lastChatAt < 900) return;
    sim.lastChatAt = now;
    const text = sanitizeText(message);
    if (!text) return;
    this.broadcast("chat", { name: sim.state.name, team: sim.state.team, text, time: now });
  }

  private startMatch(client?: Client): void {
    if (client && client.sessionId !== this.state.hostId) {
      client.send("roomError", { message: "ONLY THE HOST CAN START THE MATCH." });
      return;
    }
    if (this.state.players.size === 0) return;
    if (this.state.phase === "playing") return;
    if (this.state.phase === "lobby" && this.state.players.size > 1) {
      const notReady = [...this.state.players.values()].filter((p) => !p.isHost && !p.ready);
      if (notReady.length > 0) {
        client?.send("roomError", { message: `${notReady.map((p) => p.name).join(", ")} NOT READY.` });
        return;
      }
    }
    this.state.phase = "playing";
    this.state.timeLeft = this.matchLength;
    this.state.scoreRAF = 0;
    this.state.scoreAXIS = 0;
    this.rockets = [];
    this.simTime = 0;
    this.resetBalloons();
    for (const sim of this.sims.values()) {
      sim.state.kills = 0;
      sim.state.deaths = 0;
      sim.state.score = 0;
      this.respawnSim(sim, true);
    }
    this.broadcast("matchStart", { mode: this.mode, timeLeft: this.matchLength });
    this.registerSelf();
  }

  private respawnSim(sim: PlayerSim, initial = false): void {
    const spawn = this.findSpawn(sim.state.team);
    respawnFlight(sim.flight, spawn.x, spawn.y, spawn.z, spawn.yaw, sim.def);
    sim.state.alive = true;
    sim.state.health = sim.def.maxHealth;
    sim.state.ammo = sim.def.gunAmmo;
    sim.state.rockets = sim.def.rocketAmmo;
    sim.state.maxHealth = sim.def.maxHealth;
    sim.state.armor = 0;
    sim.state.cadenceSeconds = 0;
    sim.state.respawnIn = 0;
    sim.state.boosting = false;
    sim.armor = 0;
    sim.cadenceUntil = 0;
    sim.invulnerableUntil = this.simTime + (initial ? 1.2 : 2.4);
    sim.lastHitBy = null;
    sim.lastHitAt = -100;
    sim.controls.fire = false;
    sim.controls.rocket = false;
    sim.controls.autoLevelRoll = true;
    sim.controls.autoLevelPitch = true;
    sim.prevRocket = true;
    this.syncState(sim);
    if (!initial) this.broadcast("respawn", { id: sim.id });
  }

  private findSpawn(team: "RAF" | "AXIS"): { x: number; y: number; z: number; yaw: number } {
    let fallback = getSpawnForTeam(team);
    for (let i = 0; i < 8; i++) {
      const p = getSpawnForTeam(team);
      spawnVec.set(p.x, p.y, p.z);
      if (!pointInsideAnyBox(spawnVec, 2.2, STATIC_BOXES)) return p;
      fallback = p;
    }
    return fallback;
  }

  private simulate(dt: number): void {
    if (this.state.phase !== "playing") return;
    this.simTime += dt;
    this.state.timeLeft = Math.max(0, this.state.timeLeft - dt);
    for (const sim of this.sims.values()) {
      sim.state.respawnIn = sim.state.alive ? 0 : Math.max(0, sim.respawnAt - this.simTime);
      if (!sim.state.alive) {
        if (sim.state.respawnIn <= 0) this.respawnSim(sim);
        continue;
      }
      if (Date.now() - sim.lastInputAt > 700) {
        sim.controls.pitch = 0;
        sim.controls.roll = 0;
        sim.controls.yaw = 0;
        sim.controls.fire = false;
        sim.controls.rocket = false;
        sim.controls.throttle = 0.55;
        sim.controls.autoLevelRoll = true;
        sim.controls.autoLevelPitch = true;
      }
      sim.fireCooldown = Math.max(0, sim.fireCooldown - dt);
      sim.rocketCooldown = Math.max(0, sim.rocketCooldown - dt);
      const speedBefore = sim.flight.speed;
      start.set(sim.flight.x, sim.flight.y, sim.flight.z);
      integrateFlight(sim.flight, sim.def, sim.controls, dt);
      tmp.set(sim.flight.x, sim.flight.y, sim.flight.z);
      const sweep = sphereSweepWorld(start, tmp.clone().sub(start), WORLD.planeRadius, STATIC_BOXES);
      if (sweep.hit) {
        sim.flight.x = sweep.position.x;
        sim.flight.y = sweep.position.y;
        sim.flight.z = sweep.position.z;
        if (sweep.normal.lengthSq() > 0.01) {
          sim.flight.x += sweep.normal.x * 0.05;
          sim.flight.y += sweep.normal.y * 0.05;
          sim.flight.z += sweep.normal.z * 0.05;
        }
        reverseFlightDirection(sim.flight);
        if (this.simTime >= sim.nextCollisionAt && speedBefore > 2.4) {
          sim.nextCollisionAt = this.simTime + 0.4;
          this.broadcast("impact", { x: sweep.position.x, y: sweep.position.y, z: sweep.position.z, ownerId: sim.id });
        }
      }
      if (sim.state.alive) this.handleWeapons(sim);
      this.syncState(sim);
    }
    this.updateRockets(dt);
    this.updateBalloons();
    if (this.state.timeLeft <= 0) this.endMatch();
  }

  private syncState(sim: PlayerSim): void {
    const f = sim.flight;
    sim.state.x = f.x;
    sim.state.y = f.y;
    sim.state.z = f.z;
    sim.state.qx = f.qx;
    sim.state.qy = f.qy;
    sim.state.qz = f.qz;
    sim.state.qw = f.qw;
    sim.state.speed = f.speed;
    sim.state.boost = f.boost;
    sim.state.throttle = f.throttle;
    sim.state.boosting = sim.controls.boost;
    sim.state.armor = sim.armor;
    sim.state.cadenceSeconds = Math.max(0, sim.cadenceUntil - this.simTime);
    sim.state.lastProcessedInput = sim.inputSeq;
  }

  private handleWeapons(sim: PlayerSim): void {
    if (sim.controls.fire && sim.fireCooldown <= 0 && sim.state.ammo > 0) {
      sim.fireCooldown = this.simTime < sim.cadenceUntil ? sim.def.fireInterval * BALLOON.cadenceMultiplier : sim.def.fireInterval;
      sim.state.ammo--;
      q.set(sim.flight.qx, sim.flight.qy, sim.flight.qz, sim.flight.qw);
      fwd.set(0, 0, -1).applyQuaternion(q);
      const spread = 0.005;
      dir.copy(fwd).add(new Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
      const side = sim.inputSeq % 2 === 0 ? -0.54 : 0.54;
      muzzle.set(side, 0.06, -0.35).applyQuaternion(q).add(new Vector3(sim.flight.x, sim.flight.y, sim.flight.z));
      let hitDist = 230;
      let hitSim: PlayerSim | null = null;
      const worldHit = raycastWorld(muzzle, dir, hitDist, STATIC_BOXES);
      if (worldHit) hitDist = worldHit.distance;
      for (const other of this.sims.values()) {
        if (other === sim || !other.state.alive) continue;
        if (this.mode === "tdm" && other.state.team === sim.state.team) continue;
        tmp2.set(other.flight.x, other.flight.y, other.flight.z);
        const t = raySphere(muzzle, dir, hitDist, tmp2, WORLD.planeRadius + 0.15);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitSim = other;
        }
      }
      let hitBalloon: SimBalloon | null = null;
      for (const balloon of this.balloons) {
        if (!balloon.state.alive) continue;
        const spawn = BALLOON_SPAWNS[balloon.index];
        tmp2.set(spawn.x, spawn.y, spawn.z);
        const t = raySphere(muzzle, dir, hitDist, tmp2, BALLOON.hitRadius);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitSim = null;
          hitBalloon = balloon;
        }
      }
      const end = muzzle.clone().addScaledVector(dir, hitDist);
      this.broadcast("shot", { ownerId: sim.id, x: muzzle.x, y: muzzle.y, z: muzzle.z, ex: end.x, ey: end.y, ez: end.z, team: sim.state.team });
      if (hitSim) {
        this.applyDamage(hitSim, sim.def.gunDamage, sim, "machine guns");
        this.broadcast("hit", { attackerId: sim.id, targetId: hitSim.id, x: end.x, y: end.y, z: end.z, damage: sim.def.gunDamage });
      } else if (hitBalloon) {
        this.damageBalloon(hitBalloon, sim.def.gunDamage, sim, end);
      }
    }
    const rocketPressed = sim.controls.rocket && !sim.prevRocket;
    sim.prevRocket = sim.controls.rocket;
    if (rocketPressed && sim.rocketCooldown <= 0 && sim.state.rockets > 0) {
      sim.state.rockets--;
      sim.rocketCooldown = 1.15;
      q.set(sim.flight.qx, sim.flight.qy, sim.flight.qz, sim.flight.qw);
      fwd.set(0, 0, -1).applyQuaternion(q);
      const target = this.findRocketTarget(sim, fwd);
      const rocket: SimRocket = {
        id: this.nextRocketId++,
        ownerId: sim.id,
        team: sim.state.team,
        x: sim.flight.x + fwd.x * 1.2,
        y: sim.flight.y + fwd.y * 1.2,
        z: sim.flight.z + fwd.z * 1.2,
        vx: fwd.x * WORLD.rocketSpeed,
        vy: fwd.y * WORLD.rocketSpeed,
        vz: fwd.z * WORLD.rocketSpeed,
        targetId: target?.id ?? null,
        life: 5,
      };
      this.rockets.push(rocket);
      this.broadcast("rocketSpawn", { id: rocket.id, ownerId: rocket.ownerId, team: rocket.team, x: rocket.x, y: rocket.y, z: rocket.z, vx: rocket.vx, vy: rocket.vy, vz: rocket.vz, targetId: rocket.targetId });
    }
  }

  private findRocketTarget(sim: PlayerSim, forward: Vector3): PlayerSim | null {
    let best: PlayerSim | null = null;
    let bestDist = 140;
    for (const other of this.sims.values()) {
      if (other === sim || !other.state.alive) continue;
      if (this.mode === "tdm" && other.state.team === sim.state.team) continue;
      tmp.set(other.flight.x - sim.flight.x, other.flight.y - sim.flight.y, other.flight.z - sim.flight.z);
      const d = tmp.length();
      if (d > bestDist) continue;
      tmp.normalize();
      if (tmp.dot(forward) > 0.95) {
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
        const target = this.sims.get(r.targetId);
        if (target?.state.alive) {
          tmp.set(target.flight.x - r.x, target.flight.y - r.y, target.flight.z - r.z).normalize();
          const speed = Math.hypot(r.vx, r.vy, r.vz);
          const v = new Vector3(r.vx / speed, r.vy / speed, r.vz / speed);
          v.lerp(tmp, Math.min(1, dt * 1.8)).normalize();
          r.vx = v.x * speed;
          r.vy = v.y * speed;
          r.vz = v.z * speed;
        }
      }
      const old = new Vector3(r.x, r.y, r.z);
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      const next = new Vector3(r.x, r.y, r.z);
      const sweep = sphereSweepWorld(old, next.clone().sub(old), 0.25, STATIC_BOXES);
      let detonate = false;
      let at = next;
      if (sweep.hit) {
        detonate = true;
        at = sweep.position;
      } else {
        for (const other of this.sims.values()) {
          if (!other.state.alive || other.id === r.ownerId) continue;
          if (this.mode === "tdm" && other.state.team === r.team) continue;
          tmp.set(other.flight.x, other.flight.y, other.flight.z);
          if (distancePointSegmentSq(tmp, old, next) < 1.45 * 1.45) {
            detonate = true;
            break;
          }
        }
        if (!detonate) {
          for (const balloon of this.balloons) {
            if (!balloon.state.alive) continue;
            const spawn = BALLOON_SPAWNS[balloon.index];
            tmp.set(spawn.x, spawn.y, spawn.z);
            if (distancePointSegmentSq(tmp, old, next) < BALLOON.hitRadius * BALLOON.hitRadius) {
              detonate = true;
              break;
            }
          }
        }
      }
      if (detonate || r.life <= 0) {
        this.broadcast("explosion", { id: r.id, x: at.x, y: at.y, z: at.z, scale: 1.5 });
        const owner = this.sims.get(r.ownerId) ?? null;
        for (const other of this.sims.values()) {
          if (!other.state.alive) continue;
          if (this.mode === "tdm" && other.state.team === r.team) continue;
          if (other.id === r.ownerId) continue;
          tmp.set(other.flight.x, other.flight.y, other.flight.z);
          const dist = tmp.distanceTo(at);
          if (dist < WORLD.rocketRadius) {
            const amount = WORLD.rocketDamage * clamp(1 - dist / WORLD.rocketRadius, 0.18, 1);
            this.applyDamage(other, amount, owner, "rockets");
          }
        }
        const blastRadius = WORLD.rocketRadius + BALLOON.hitRadius;
        for (const balloon of this.balloons) {
          if (!balloon.state.alive) continue;
          const spawn = BALLOON_SPAWNS[balloon.index];
          tmp.set(spawn.x, spawn.y, spawn.z);
          const dist = tmp.distanceTo(at);
          if (dist < blastRadius) {
            const amount = WORLD.rocketDamage * clamp(1 - dist / blastRadius, 0.2, 1);
            this.damageBalloon(balloon, amount, owner, at);
          }
        }
        this.rockets.splice(i, 1);
      }
    }
  }

  private applyDamage(target: PlayerSim, amount: number, attacker: PlayerSim | null, weapon: string): void {
    if (!target.state.alive) return;
    if (this.simTime < target.invulnerableUntil) return;
    let remaining = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, remaining);
      target.armor -= absorbed;
      target.state.armor = target.armor;
      remaining -= absorbed;
    }
    target.state.health = Math.max(0, target.state.health - remaining);
    target.lastHitBy = attacker?.id ?? null;
    target.lastHitAt = this.simTime;
    if (target.state.health > 0) return;
    target.state.alive = false;
    target.state.deaths++;
    target.respawnAt = this.simTime + WORLD.respawnSeconds;
    target.state.respawnIn = WORLD.respawnSeconds;
    if (attacker) {
      attacker.state.kills++;
      attacker.state.score += 100;
      if (attacker.state.team === "RAF") this.state.scoreRAF++;
      else this.state.scoreAXIS++;
    }
    const event: KillEvent = {
      killer: attacker?.state.name ?? "FURNITURE",
      victim: target.state.name,
      killerTeam: attacker?.state.team ?? target.state.team,
      victimTeam: target.state.team,
      weapon: attacker ? weapon : "a furniture strike",
    };
    this.broadcast("kill", event);
    this.broadcast("explosion", { id: 0, x: target.flight.x, y: target.flight.y, z: target.flight.z, scale: 1.8 });
    this.syncState(target);
  }

  private resetBalloons(): void {
    this.state.balloons.clear();
    this.balloons = [];
    BALLOON_SPAWNS.forEach((_, index) => {
      const state = new BalloonState();
      state.kind = pickupForBalloon(index);
      state.alive = true;
      state.pickup = false;
      state.health = BALLOON.maxHealth;
      this.state.balloons.set(String(index), state);
      this.balloons.push({ index, state, respawnAt: 0, pickupExpiresAt: 0 });
    });
  }

  private updateBalloons(): void {
    for (const balloon of this.balloons) {
      if (balloon.state.alive) continue;
      if (balloon.state.pickup && this.simTime >= balloon.pickupExpiresAt) {
        balloon.state.pickup = false;
      }
      if (this.simTime >= balloon.respawnAt) {
        balloon.state.alive = true;
        balloon.state.health = BALLOON.maxHealth;
        balloon.state.pickup = false;
      }
    }
    for (const sim of this.sims.values()) {
      if (!sim.state.alive) continue;
      for (const balloon of this.balloons) {
        if (balloon.state.alive || !balloon.state.pickup) continue;
        const spawn = BALLOON_SPAWNS[balloon.index];
        const dx = sim.flight.x - spawn.x;
        const dy = sim.flight.y - spawn.y;
        const dz = sim.flight.z - spawn.z;
        if (dx * dx + dy * dy + dz * dz > BALLOON.pickupRadius * BALLOON.pickupRadius) continue;
        this.collectPickup(sim, balloon);
      }
    }
  }

  private collectPickup(sim: PlayerSim, balloon: SimBalloon): void {
    const spawn = BALLOON_SPAWNS[balloon.index];
    const kind = balloon.state.kind as PickupKind;
    balloon.state.pickup = false;
    if (kind === "armor") {
      sim.armor = Math.min(BALLOON.armorMax, sim.armor + BALLOON.armorAmount);
      sim.state.armor = sim.armor;
    } else if (kind === "health") {
      sim.state.health = Math.min(sim.def.maxHealth, sim.state.health + BALLOON.healthAmount);
    } else {
      sim.cadenceUntil = this.simTime + BALLOON.cadenceSeconds;
      sim.state.cadenceSeconds = BALLOON.cadenceSeconds;
    }
    this.broadcast("pickup", {
      index: balloon.index,
      playerId: sim.id,
      kind,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
    });
  }

  private damageBalloon(balloon: SimBalloon, amount: number, attacker: PlayerSim | null, at: Vector3): void {
    if (!balloon.state.alive) return;
    balloon.state.health = Math.max(0, balloon.state.health - amount);
    this.broadcast("balloonHit", {
      index: balloon.index,
      x: at.x,
      y: at.y,
      z: at.z,
      byId: attacker?.id ?? null,
      damage: amount,
    });
    if (balloon.state.health > 0) return;
    this.destroyBalloon(balloon, attacker);
  }

  private destroyBalloon(balloon: SimBalloon, attacker: PlayerSim | null): void {
    balloon.state.alive = false;
    balloon.state.pickup = true;
    balloon.state.health = 0;
    balloon.respawnAt = this.simTime + BALLOON.respawnSeconds;
    balloon.pickupExpiresAt = this.simTime + BALLOON.pickupLifetime;
    if (attacker) attacker.state.score += BALLOON.scoreBonus;
    const spawn = BALLOON_SPAWNS[balloon.index];
    this.broadcast("balloonDown", {
      index: balloon.index,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      kind: balloon.state.kind,
      byId: attacker?.id ?? null,
    });
  }

  private endMatch(): void {
    if (this.state.phase === "ended") return;
    this.state.phase = "ended";
    this.state.timeLeft = 0;
    for (const sim of this.sims.values()) {
      sim.state.alive = false;
      sim.state.respawnIn = 0;
    }
    this.rockets = [];
    this.broadcast("matchEnd", { scoreRAF: this.state.scoreRAF, scoreAXIS: this.state.scoreAXIS, mode: this.mode });
    this.registerSelf();
  }

  private countTeam(team: "RAF" | "AXIS"): number {
    let count = 0;
    this.state.players.forEach((player) => {
      if (player.team === team) count++;
    });
    return count;
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!codeExists(code)) return code;
    }
    return `R${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  private registerSelf(): void {
    upsertRoom({
      roomId: this.roomId,
      code: this.state.roomCode,
      mode: this.mode,
      maxPlayers: this.state.maxPlayers,
      clients: this.state.players.size,
      isPrivate: this.isPrivate,
      phase: this.state.phase as "lobby" | "playing" | "ended",
      createdAt: this.createdAt,
    });
    this.setMetadata({
      code: this.state.roomCode,
      mode: this.mode,
      maxPlayers: this.state.maxPlayers,
      isPrivate: this.isPrivate,
      phase: this.state.phase,
      clients: this.state.players.size,
    });
  }
}

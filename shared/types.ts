import { DEFAULT_THROTTLE, type Team } from "./config";

export interface Controls {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
  rocket: boolean;
  autoLevelRoll: boolean;
  autoLevelPitch: boolean;
}

export const NEUTRAL_CONTROLS: Controls = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttle: DEFAULT_THROTTLE,
  boost: false,
  fire: false,
  rocket: false,
  autoLevelRoll: true,
  autoLevelPitch: true,
};

export interface FlightState {
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
}

export interface PlaneRuntime {
  id: string;
  name: string;
  team: Team;
  aircraftId: string;
  flight: FlightState;
  health: number;
  maxHealth: number;
  ammo: number;
  rockets: number;
  alive: boolean;
  respawnAt: number;
  invulnerableUntil: number;
  fireCooldown: number;
  rocketCooldown: number;
  kills: number;
  deaths: number;
  score: number;
  lastHitBy?: string;
  lastHitAt: number;
  isBot: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: Team | "ANY";
}

export interface Projectile {
  id: number;
  ownerId: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  kind: "rocket";
}

export interface KillEvent {
  killer: string;
  victim: string;
  killerTeam: Team;
  victimTeam: Team;
  weapon: string;
}

export interface HitEvent {
  targetId: string;
  damage: number;
  x: number;
  y: number;
  z: number;
  critical?: boolean;
}

export interface ChatMessage {
  name: string;
  team: Team | "SYSTEM";
  text: string;
  time: number;
}

export interface PlayerScore {
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  score: number;
  isBot: boolean;
}

export interface InputPacket {
  seq: number;
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  boost: boolean;
  fire: boolean;
  rocket: boolean;
  autoLevelRoll: boolean;
  autoLevelPitch: boolean;
}

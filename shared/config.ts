export type Team = "RAF" | "AXIS";
export type GameMode = "tdm" | "ffa";
export type Difficulty = "rookie" | "pilot" | "ace";
export type CameraMode = "chase" | "cockpit";
export type Quality = "low" | "medium" | "high";

export interface AircraftDef {
  id: string;
  name: string;
  callsign: string;
  blurb: string;
  bodyColor: number;
  accentColor: number;
  trailColor: number;
  maxHealth: number;
  minSpeed: number;
  maxSpeed: number;
  boostSpeed: number;
  acceleration: number;
  pitchRate: number;
  rollRate: number;
  yawRate: number;
  fireInterval: number;
  gunDamage: number;
  gunAmmo: number;
  rocketAmmo: number;
  stats: { speed: number; agility: number; armor: number };
}

export const AIRCRAFT: AircraftDef[] = [
  {
    id: "meadowhawk",
    name: "Meadowhawk",
    callsign: "M-HWK",
    blurb: "The dependable green fighter. Balanced guns, armour and turn rate.",
    bodyColor: 0x5e6b48,
    accentColor: 0xc4b68c,
    trailColor: 0xd8f0d0,
    maxHealth: 110,
    minSpeed: 15,
    maxSpeed: 47,
    boostSpeed: 68,
    acceleration: 24,
    pitchRate: 1.65,
    rollRate: 3.15,
    yawRate: 0.92,
    fireInterval: 0.09,
    gunDamage: 5.4,
    gunAmmo: 320,
    rocketAmmo: 4,
    stats: { speed: 3, agility: 3, armor: 4 },
  },
  {
    id: "bluejay",
    name: "Blue Jay",
    callsign: "B-JAY",
    blurb: "Feather-light and ferociously agile. Trades armour for turn speed.",
    bodyColor: 0x355e8c,
    accentColor: 0xa9d3f5,
    trailColor: 0xb7defa,
    maxHealth: 88,
    minSpeed: 16,
    maxSpeed: 51,
    boostSpeed: 76,
    acceleration: 29,
    pitchRate: 1.92,
    rollRate: 3.6,
    yawRate: 1.06,
    fireInterval: 0.08,
    gunDamage: 5,
    gunAmmo: 340,
    rocketAmmo: 4,
    stats: { speed: 5, agility: 5, armor: 2 },
  },
  {
    id: "crimsonfox",
    name: "Crimson Fox",
    callsign: "C-FOX",
    blurb: "A screaming red interceptor. Fastest in the toy box, light on armour.",
    bodyColor: 0x9d3d32,
    accentColor: 0xf1cf8b,
    trailColor: 0xffa898,
    maxHealth: 96,
    minSpeed: 17,
    maxSpeed: 56,
    boostSpeed: 84,
    acceleration: 30,
    pitchRate: 1.72,
    rollRate: 3.3,
    yawRate: 0.95,
    fireInterval: 0.085,
    gunDamage: 5.2,
    gunAmmo: 330,
    rocketAmmo: 4,
    stats: { speed: 5, agility: 4, armor: 3 },
  },
  {
    id: "goldenwasp",
    name: "Golden Wasp",
    callsign: "G-WSP",
    blurb: "Heavy escort with a deep magazine and a reinforced toy-pilot seat.",
    bodyColor: 0x9b782e,
    accentColor: 0x5e6b48,
    trailColor: 0xffe19b,
    maxHealth: 145,
    minSpeed: 13,
    maxSpeed: 43,
    boostSpeed: 61,
    acceleration: 20,
    pitchRate: 1.42,
    rollRate: 2.75,
    yawRate: 0.84,
    fireInterval: 0.075,
    gunDamage: 5.7,
    gunAmmo: 400,
    rocketAmmo: 6,
    stats: { speed: 2, agility: 2, armor: 5 },
  },
];

export const DEFAULT_AIRCRAFT = AIRCRAFT[0].id;

export function getAircraft(id: string | undefined): AircraftDef {
  return AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0];
}

export const TEAM_INFO: Record<Team, { name: string; fullName: string; color: number; css: string; home: "RAF" | "AXIS" }> = {
  RAF: { name: "RAF", fullName: "Royal Air Force", color: 0x3c88d8, css: "#3c88d8", home: "RAF" },
  AXIS: { name: "AXIS", fullName: "Axis Squadron", color: 0xd14935, css: "#d14935", home: "AXIS" },
};

export const BOT_NAMES_RAF = ["Skylark77", "Rivet_Joe", "CloudRunner", "MillieAce", "Tailspin", "Wingnut", "CopperKite", "DizzyDora"];
export const BOT_NAMES_AXIS = ["RedBaron82", "BlitzMann", "V2Pilot", "StukaSam", "IronOwl", "FokkerFred", "MadMetz", "BlackBaron"];

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; reaction: number; accuracy: number; aggression: number; speed: number }> = {
  rookie: { label: "ROOKIE", reaction: 1.8, accuracy: 0.45, aggression: 0.55, speed: 0.86 },
  pilot: { label: "PILOT", reaction: 0.85, accuracy: 0.72, aggression: 0.82, speed: 0.95 },
  ace: { label: "ACE", reaction: 0.35, accuracy: 0.92, aggression: 1.05, speed: 1.02 },
};

export const WORLD = {
  halfSize: 124,
  houseMinX: -48,
  houseMaxX: 48,
  houseMinZ: -36,
  houseMaxZ: 36,
  wallHeight: 22,
  floorLevel: 10.5,
  ground: 0.35,
  planeRadius: 1.05,
  planeScale: 0.26,
  maxAltitude: 70,
  bulletSpeed: 320,
  rocketSpeed: 88,
  rocketDamage: 62,
  rocketRadius: 8,
  respawnSeconds: 4,
  matchSeconds: 7 * 60 + 24,
  maxPlayers: 24,
  missileTrailColor: 0xffc36b,
};

export const LOADOUT = {
  gunAmmo: 320,
  rocketAmmo: 4,
};

export const MOUSE_SENSITIVITY_DEFAULT = 1;
export const RADAR_RANGE = 115;

export interface SoloConfig {
  mode: GameMode;
  enemies: number;
  difficulty: Difficulty;
  aircraftId: string;
}

export const DEFAULT_SOLO: SoloConfig = {
  mode: "tdm",
  enemies: 5,
  difficulty: "pilot",
  aircraftId: DEFAULT_AIRCRAFT,
};

export interface Settings {
  quality: Quality;
  masterVolume: number;
  sensitivity: number;
  invertY: boolean;
  camera: CameraMode;
  showTracers: boolean;
  playerName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: "high",
  masterVolume: 0.75,
  sensitivity: 1,
  invertY: true,
  camera: "chase",
  showTracers: true,
  playerName: "TopGun",
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

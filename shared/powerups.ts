export type PickupKind = "armor" | "health" | "cadence" | "shield";

export interface BalloonSpawn {
  x: number;
  y: number;
  z: number;
}

export const BALLOON_SPAWNS: BalloonSpawn[] = [
  { x: -39, y: 6.4, z: 12 },
  { x: 13, y: 6.4, z: -18 },
  { x: 24, y: 16.4, z: 12 },
  { x: -16, y: 16, z: 66 },
  { x: -74, y: 18, z: 26 },
  { x: 72, y: 20, z: 36 },
  { x: 36, y: 22, z: -58 },
  { x: 96, y: 26, z: -76 },
  { x: 70, y: 14, z: -42 },
  { x: 0, y: 20, z: 90 },
];

export const BALLOON = {
  hitRadius: 2.4,
  maxHealth: 42,
  respawnSeconds: 32,
  pickupRadius: 2.8,
  pickupLifetime: 32,
  armorAmount: 50,
  armorMax: 60,
  healthAmount: 45,
  cadenceSeconds: 12,
  cadenceMultiplier: 0.55,
  shieldAmount: 70,
  shieldMax: 70,
  shieldSeconds: 10,
  scoreBonus: 25,
};

export const PICKUP_INFO: Record<PickupKind, { label: string; toast: string; color: number }> = {
  armor: { label: "ARMOUR", toast: "ARMOUR +50", color: 0x64b5ff },
  health: { label: "HULL", toast: "HULL REPAIRED +45", color: 0x6be58a },
  cadence: { label: "RAPID FIRE", toast: "RAPID FIRE · 12S", color: 0xffd45c },
  shield: { label: "ENERGY SHIELD", toast: "ENERGY SHIELD · 10S", color: 0x86e5ff },
};

const PICKUP_CYCLE: PickupKind[] = ["armor", "health", "cadence", "shield"];

export function pickupForBalloon(index: number): PickupKind {
  return PICKUP_CYCLE[index % PICKUP_CYCLE.length];
}

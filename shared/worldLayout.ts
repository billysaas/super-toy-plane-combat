import type { SpawnPoint } from "./types";
import { WORLD } from "./config";

export type BoxKind = "wall" | "floor" | "roof" | "stairs" | "prop" | "furniture" | "tree" | "hedge" | "boundary" | "shed";
export type BoxMaterial = "exterior" | "interior" | "trim" | "floor" | "rug" | "roof" | "stone" | "wood" | "hedge" | "invisible";

export interface StaticBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  kind: BoxKind;
  material: BoxMaterial;
}

export interface Opening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  door?: boolean;
}

export interface WallSpec {
  axis: "x" | "z";
  at: number;
  from: number;
  to: number;
  y0: number;
  y1: number;
  thickness: number;
  material: BoxMaterial;
  openings: Opening[];
}

export interface FurniturePlacement {
  assetId: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  collider?: { hx: number; hy: number; hz: number; dx?: number; dy: number; dz?: number };
  colliderOnly?: boolean;
}

export interface TreePlacement {
  assetId: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface ToyBlock {
  x: number;
  z: number;
  size: number;
  baseY: number;
  color: number;
  label: string;
}

export const TOY_BLOCKS: ToyBlock[] = [
  { x: -41, z: 17.5, size: 1.5, baseY: 0.36, color: 0xd95b4a, label: "A" },
  { x: -38.4, z: 19.8, size: 1.05, baseY: 0.36, color: 0x3c88d8, label: "B" },
  { x: -40.4, z: 21.4, size: 0.8, baseY: 0.36, color: 0xf3c14a, label: "1" },
  { x: -12, z: -10, size: 1.35, baseY: 0.36, color: 0x5b8f55, label: "C" },
  { x: -9.3, z: -12.2, size: 0.95, baseY: 0.36, color: 0xe08a45, label: "2" },
  { x: 7, z: 45, size: 1.6, baseY: 0.04, color: 0xc77fb0, label: "D" },
  { x: 10, z: 47.2, size: 1.1, baseY: 0.04, color: 0x64b5ff, label: "3" },
];

export function makeBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, kind: BoxKind, material: BoxMaterial): StaticBox {
  return { cx, cy, cz, hx, hy, hz, kind, material };
}

export const WALL_SPECS: WallSpec[] = [
  {
    axis: "x", at: 36, from: -48, to: 48, y0: 0, y1: 22, thickness: 1.2, material: "exterior",
    openings: [
      { u0: -40, u1: -28, y0: 0, y1: 10, door: true },
      { u0: -22, u1: -10, y0: 5, y1: 14 },
      { u0: 14, u1: 22, y0: 0, y1: 9, door: true },
      { u0: 0, u1: 8, y0: 12, y1: 18 },
      { u0: 18, u1: 28, y0: 12, y1: 18 },
      { u0: 34, u1: 44, y0: 12, y1: 18 },
    ],
  },
  {
    axis: "x", at: -36, from: -48, to: 48, y0: 0, y1: 22, thickness: 1.2, material: "exterior",
    openings: [
      { u0: -40, u1: -28, y0: 5, y1: 13 },
      { u0: 0, u1: 12, y0: 4, y1: 10 },
      { u0: 16, u1: 26, y0: 12, y1: 18 },
      { u0: 32, u1: 42, y0: 12, y1: 18 },
    ],
  },
  {
    axis: "z", at: -48, from: -36, to: 36, y0: 0, y1: 22, thickness: 1.2, material: "exterior",
    openings: [
      { u0: -28, u1: -18, y0: 4, y1: 12 },
      { u0: -28, u1: -18, y0: 14, y1: 20 },
      { u0: 6, u1: 18, y0: 0, y1: 10, door: true },
      { u0: 0, u1: 10, y0: 14, y1: 20 },
    ],
  },
  {
    axis: "z", at: 48, from: -36, to: 36, y0: 0, y1: 22, thickness: 1.2, material: "exterior",
    openings: [
      { u0: -7, u1: 1, y0: 3, y1: 9 },
      { u0: 18, u1: 26, y0: 3, y1: 9 },
      { u0: -30, u1: -22, y0: 12, y1: 18 },
      { u0: -8, u1: 0, y0: 12, y1: 18 },
      { u0: 18, u1: 26, y0: 12, y1: 18 },
    ],
  },
  {
    axis: "z", at: -6, from: -36, to: 36, y0: 0, y1: 22, thickness: 0.9, material: "interior",
    openings: [
      { u0: -32, u1: -18, y0: 0, y1: 9, door: true },
      { u0: -4, u1: 8, y0: 0, y1: 9, door: true },
      { u0: -30, u1: -20, y0: 10.5, y1: 19, door: true },
      { u0: 14, u1: 24, y0: 10.5, y1: 19, door: true },
    ],
  },
  {
    axis: "x", at: -12, from: -6, to: 48, y0: 0, y1: 10.5, thickness: 0.8, material: "interior",
    openings: [
      { u0: 0, u1: 8, y0: 0, y1: 8, door: true },
      { u0: 31, u1: 38, y0: 0, y1: 8, door: true },
    ],
  },
  {
    axis: "z", at: 24, from: -12, to: 36, y0: 0, y1: 10.5, thickness: 0.8, material: "interior",
    openings: [
      { u0: -4, u1: 4, y0: 0, y1: 8, door: true },
      { u0: 20, u1: 28, y0: 0, y1: 8, door: true },
    ],
  },
  {
    axis: "x", at: 12, from: 24, to: 48, y0: 0, y1: 10.5, thickness: 0.8, material: "interior",
    openings: [
      { u0: 34, u1: 42, y0: 0, y1: 8, door: true },
    ],
  },
  {
    axis: "z", at: 12, from: -36, to: 36, y0: 10.5, y1: 22, thickness: 0.8, material: "interior",
    openings: [
      { u0: -28, u1: -20, y0: 10.5, y1: 18.5, door: true },
      { u0: -4, u1: 4, y0: 10.5, y1: 18.5, door: true },
      { u0: 22, u1: 30, y0: 10.5, y1: 18.5, door: true },
    ],
  },
  {
    axis: "x", at: -18, from: 12, to: 48, y0: 10.5, y1: 22, thickness: 0.8, material: "interior",
    openings: [
      { u0: 26, u1: 34, y0: 10.5, y1: 18.5, door: true },
    ],
  },
  {
    axis: "x", at: 0, from: 12, to: 48, y0: 10.5, y1: 22, thickness: 0.8, material: "interior",
    openings: [
      { u0: 20, u1: 28, y0: 10.5, y1: 18.5, door: true },
    ],
  },
];

export function wallBoxes(spec: WallSpec): StaticBox[] {
  const out: StaticBox[] = [];
  const holes = [...spec.openings].sort((a, b) => a.u0 - b.u0);
  const pushSpan = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
    const cu = (u0 + u1) / 2;
    const cy = (y0 + y1) / 2;
    if (spec.axis === "x") {
      out.push(makeBox(cu, cy, spec.at, (u1 - u0) / 2, (y1 - y0) / 2, spec.thickness / 2, "wall", spec.material));
    } else {
      out.push(makeBox(spec.at, cy, cu, spec.thickness / 2, (y1 - y0) / 2, (u1 - u0) / 2, "wall", spec.material));
    }
  };
  let cursor = spec.from;
  for (const hole of holes) {
    const h0 = Math.max(spec.from, hole.u0);
    const h1 = Math.min(spec.to, hole.u1);
    if (h0 > cursor) pushSpan(cursor, h0, spec.y0, spec.y1);
    const y0 = Math.max(spec.y0, hole.y0);
    const y1 = Math.min(spec.y1, hole.y1);
    if (y0 > spec.y0) pushSpan(h0, h1, spec.y0, y0);
    if (y1 < spec.y1) pushSpan(h0, h1, y1, spec.y1);
    cursor = Math.max(cursor, h1);
  }
  if (cursor < spec.to) pushSpan(cursor, spec.to, spec.y0, spec.y1);
  return out;
}

function slabWithHole(
  minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number,
  holeMinX: number, holeMaxX: number, holeMinZ: number, holeMaxZ: number,
  kind: BoxKind, material: BoxMaterial,
): StaticBox[] {
  const cy = (y0 + y1) / 2;
  const hy = (y1 - y0) / 2;
  return [
    makeBox((minX + holeMinX) / 2, cy, (minZ + maxZ) / 2, (holeMinX - minX) / 2, hy, (maxZ - minZ) / 2, kind, material),
    makeBox((holeMaxX + maxX) / 2, cy, (minZ + maxZ) / 2, (maxX - holeMaxX) / 2, hy, (maxZ - minZ) / 2, kind, material),
    makeBox((holeMinX + holeMaxX) / 2, cy, (minZ + holeMinZ) / 2, (holeMaxX - holeMinX) / 2, hy, (holeMinZ - minZ) / 2, kind, material),
    makeBox((holeMinX + holeMaxX) / 2, cy, (holeMaxZ + maxZ) / 2, (holeMaxX - holeMinX) / 2, hy, (maxZ - holeMaxZ) / 2, kind, material),
  ].filter((b) => b.hx > 0.01 && b.hz > 0.01);
}

export const FURNITURE: FurniturePlacement[] = [
  { assetId: "area-rug-5c56e2", x: -25, y: 0.37, z: 5, rot: 0, scale: 5 },
  { assetId: "sofa-9c0e7e", x: -31, y: 0.35, z: 3, rot: 0, scale: 3, collider: { hx: 3.5, hy: 1.5, hz: 1.8, dy: 1.5 } },
  { assetId: "sofa-9c0e7e", x: -30, y: 0.35, z: -24, rot: Math.PI, scale: 2.8, collider: { hx: 3.2, hy: 1.4, hz: 1.7, dy: 1.4 } },
  { assetId: "coffee-table-acc698", x: -23, y: 0.35, z: 8, rot: 0, scale: 3.4, collider: { hx: 2.1, hy: 0.7, hz: 1.1, dy: 0.7 } },
  { assetId: "lounge-armchair-5a72ca", x: -15, y: 0.35, z: 3, rot: Math.PI / 2, scale: 3, collider: { hx: 1.4, hy: 1.2, hz: 1.4, dy: 1.2 } },
  { assetId: "low-media-unit-645e61", x: -25, y: 0.35, z: -33.4, rot: 0, scale: 3, collider: { hx: 3, hy: 0.7, hz: 0.9, dy: 0.7 } },
  { assetId: "alcove-bookcase-83894d", x: -46, y: 0.35, z: -20, rot: Math.PI / 2, scale: 3, collider: { hx: 1.1, hy: 3.3, hz: 1.6, dy: 3.3 } },
  { assetId: "sideboard-dd343b", x: -7.2, y: 0.35, z: 28, rot: -Math.PI / 2, scale: 2.8, collider: { hx: 0.8, hy: 1.2, hz: 2.2, dy: 1.2 } },
  { assetId: "table-lamp-e25998", x: -7.2, y: 2.66, z: 27, rot: 0, scale: 3 },
  { assetId: "floor-houseplant-8fad17", x: -44, y: 0.35, z: 30, rot: 0, scale: 3.2, collider: { hx: 0.8, hy: 1.6, hz: 0.8, dy: 1.6 } },
  { assetId: "floor-houseplant-8fad17", x: -10.5, y: 0.35, z: -29, rot: 1.2, scale: 2.8, collider: { hx: 0.7, hy: 1.4, hz: 0.7, dy: 1.4 } },
  { assetId: "curtain-panel-ee2ed9", x: -42.2, y: 0.35, z: 36.9, rot: 0, scale: 3 },
  { assetId: "curtain-panel-ee2ed9", x: -25.8, y: 0.35, z: 36.9, rot: 0, scale: 3 },

  { assetId: "dining-table-7af83a", x: 20, y: 0.35, z: -24, rot: 0, scale: 4, collider: { hx: 3.6, hy: 0.22, hz: 1.8, dy: 2.85 } },
  { assetId: "dining-chair-530532", x: 14.8, y: 0.35, z: -24, rot: -Math.PI / 2, scale: 3, collider: { hx: 0.8, hy: 1.3, hz: 0.8, dy: 1.3 } },
  { assetId: "dining-chair-530532", x: 25.2, y: 0.35, z: -24, rot: Math.PI / 2, scale: 3, collider: { hx: 0.8, hy: 1.3, hz: 0.8, dy: 1.3 } },
  { assetId: "dining-chair-530532", x: 20, y: 0.35, z: -19, rot: 0, scale: 3, collider: { hx: 0.8, hy: 1.3, hz: 0.8, dy: 1.3 } },
  { assetId: "dining-chair-530532", x: 20, y: 0.35, z: -29, rot: Math.PI, scale: 3, collider: { hx: 0.8, hy: 1.3, hz: 0.8, dy: 1.3 } },
  { assetId: "kitchen-island-47f4c8", x: 35, y: 0.35, z: -24, rot: 0, scale: 3, collider: { hx: 3, hy: 1.35, hz: 1.5, dy: 1.35 } },
  { assetId: "fridge-freezer-fb9b5a", x: 44.2, y: 0.35, z: -33, rot: 0, scale: 3, collider: { hx: 0.9, hy: 2.85, hz: 0.98, dy: 2.85 } },
  { assetId: "sideboard-dd343b", x: 7, y: 0.35, z: -34.4, rot: 0, scale: 2.6, collider: { hx: 1.95, hy: 1.1, hz: 0.65, dy: 1.1 } },
  { assetId: "floor-houseplant-8fad17", x: 44.5, y: 0.35, z: -14, rot: 2.1, scale: 2.9, collider: { hx: 0.7, hy: 1.45, hz: 0.7, dy: 1.45 } },

  { assetId: "bed-6e10e8", x: 38, y: 0.35, z: 2, rot: 0, scale: 3, collider: { hx: 2.25, hy: 1.6, hz: 3.4, dy: 1.6 } },
  { assetId: "low-media-unit-645e61", x: 46.7, y: 0.35, z: -4, rot: -Math.PI / 2, scale: 2.6, collider: { hx: 0.8, hy: 0.6, hz: 2.6, dy: 0.6 } },
  { assetId: "area-rug-5c56e2", x: 32, y: 0.37, z: 5, rot: 0, scale: 4 },
  { assetId: "framed-wall-art-d2c8a2", x: 24.6, y: 2.6, z: -7, rot: -Math.PI / 2, scale: 3 },
  { assetId: "floor-houseplant-8fad17", x: 45, y: 0.35, z: 10, rot: 1.2, scale: 2.6, collider: { hx: 0.6, hy: 1.3, hz: 0.6, dy: 1.3 } },

  { assetId: "bed-6e10e8", x: 37, y: 0.35, z: 29, rot: Math.PI, scale: 3, collider: { hx: 2.25, hy: 1.6, hz: 3.4, dy: 1.6 } },
  { assetId: "lounge-armchair-5a72ca", x: 27, y: 0.35, z: 31, rot: 0.7, scale: 2.8, collider: { hx: 1.35, hy: 1.1, hz: 1.35, dy: 1.1 } },
  { assetId: "low-media-unit-645e61", x: 29, y: 0.35, z: 14.5, rot: 0, scale: 2.6, collider: { hx: 2.6, hy: 0.6, hz: 0.8, dy: 0.6 } },
  { assetId: "area-rug-5c56e2", x: 33, y: 0.37, z: 25, rot: 0, scale: 4 },

  { assetId: "bed-6e10e8", x: 38, y: 10.5, z: -25, rot: 0, scale: 3, collider: { hx: 2.25, hy: 1.6, hz: 3.4, dy: 1.6 } },
  { assetId: "alcove-bookcase-83894d", x: 16, y: 10.5, z: -34, rot: 0, scale: 2.8, collider: { hx: 1.5, hy: 3.1, hz: 1, dy: 3.1 } },
  { assetId: "low-media-unit-645e61", x: 45.5, y: 10.5, z: -50 + 33, rot: -Math.PI / 2, scale: 2.6, collider: { hx: 0.8, hy: 0.6, hz: 2.6, dy: 0.6 } },
  { assetId: "area-rug-5c56e2", x: 33, y: 10.52, z: -27, rot: 0, scale: 4 },
  { assetId: "framed-wall-art-d2c8a2", x: 12.7, y: 13, z: -23, rot: Math.PI / 2, scale: 3 },

  { assetId: "sofa-9c0e7e", x: 35, y: 10.5, z: -9, rot: Math.PI, scale: 2.7, collider: { hx: 3.1, hy: 1.35, hz: 1.6, dy: 1.35 } },
  { assetId: "coffee-table-acc698", x: 33, y: 10.5, z: -3, rot: 0, scale: 3, collider: { hx: 1.8, hy: 0.6, hz: 0.9, dy: 0.6 } },
  { assetId: "low-media-unit-645e61", x: 16, y: 10.5, z: -16.7, rot: Math.PI, scale: 2.6, collider: { hx: 2.6, hy: 0.6, hz: 0.8, dy: 0.6 } },
  { assetId: "area-rug-5c56e2", x: 35, y: 10.52, z: -4, rot: 0, scale: 4 },
  { assetId: "floor-houseplant-8fad17", x: 45, y: 10.5, z: -1, rot: 0.8, scale: 2.8, collider: { hx: 0.7, hy: 1.4, hz: 0.7, dy: 1.4 } },

  { assetId: "bed-6e10e8", x: 38, y: 10.5, z: 25, rot: Math.PI, scale: 3.2, collider: { hx: 2.4, hy: 1.7, hz: 3.6, dy: 1.7 } },
  { assetId: "sideboard-dd343b", x: 45.7, y: 10.5, z: 13, rot: -Math.PI / 2, scale: 2.8, collider: { hx: 0.8, hy: 1.2, hz: 2.2, dy: 1.2 } },
  { assetId: "lounge-armchair-5a72ca", x: 25, y: 10.5, z: 32, rot: 0.8, scale: 2.8, collider: { hx: 1.35, hy: 1.1, hz: 1.35, dy: 1.1 } },
  { assetId: "area-rug-5c56e2", x: 33, y: 10.52, z: 21, rot: 0, scale: 4.2 },
  { assetId: "table-lamp-e25998", x: 45.7, y: 12.9, z: 11, rot: 0, scale: 3 },
  { assetId: "framed-wall-art-d2c8a2", x: 12.7, y: 13.2, z: 16, rot: Math.PI / 2, scale: 3 },

  { assetId: "sideboard-dd343b", x: -4.7, y: 10.5, z: -34, rot: Math.PI / 2, scale: 2.6, collider: { hx: 0.8, hy: 1.1, hz: 2, dy: 1.1 } },
  { assetId: "table-lamp-e25998", x: -4.7, y: 12.7, z: -33, rot: 0, scale: 2.8 },
  { assetId: "floor-houseplant-8fad17", x: 10.5, y: 10.5, z: 33, rot: 1.9, scale: 2.8, collider: { hx: 0.7, hy: 1.4, hz: 0.7, dy: 1.4 } },

  { assetId: "dining-table-7af83a", x: 0, y: 0, z: 52, rot: 0, scale: 3.2, collider: { hx: 2.9, hy: 0.2, hz: 1.5, dy: 2.2 } },
  { assetId: "dining-chair-530532", x: -4, y: 0, z: 52, rot: -Math.PI / 2, scale: 2.8, collider: { hx: 0.7, hy: 1.2, hz: 0.7, dy: 1.2 } },
  { assetId: "dining-chair-530532", x: 4, y: 0, z: 52, rot: Math.PI / 2, scale: 2.8, collider: { hx: 0.7, hy: 1.2, hz: 0.7, dy: 1.2 } },
  { assetId: "dining-chair-530532", x: 0, y: 0, z: 55, rot: Math.PI, scale: 2.8, collider: { hx: 0.7, hy: 1.2, hz: 0.7, dy: 1.2 } },
  { assetId: "dining-chair-530532", x: 0, y: 0, z: 49, rot: 0, scale: 2.8, collider: { hx: 0.7, hy: 1.2, hz: 0.7, dy: 1.2 } },
];

export const TREES: TreePlacement[] = [
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: -76, z: 54, rot: 0.4, scale: 3.1 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: -88, z: -18, rot: 1.3, scale: 3.6 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: 66, z: 58, rot: 2.2, scale: 2.9 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: 82, z: 18, rot: 0.7, scale: 3.3 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: 62, z: -56, rot: 4.1, scale: 3.6 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: 26, z: 74, rot: 2.6, scale: 3.2 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: -32, z: -70, rot: 3.2, scale: 3.2 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: -108, z: 24, rot: 1.1, scale: 3.4 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: 98, z: -38, rot: 5.2, scale: 3.1 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: -18, z: 91, rot: 0.2, scale: 2.9 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: 18, z: -93, rot: 2.8, scale: 3.2 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: 104, z: 78, rot: 1.7, scale: 3.8 },
  { assetId: "broad-canopy-shade-tree-e7c4a2", x: -102, z: -76, rot: 4.5, scale: 3.4 },
  { assetId: "ornamental-front-yard-tree-c6781a", x: 96, z: -94, rot: 1.5, scale: 3.2 },
];

export const TREE_SOURCE = {
  "broad-canopy-shade-tree-e7c4a2": { width: 7.34, height: 8.54, depth: 6.63 },
  "ornamental-front-yard-tree-c6781a": { width: 3.12, height: 4.5, depth: 2.71 },
} as const;

export function buildWorldBoxes(): StaticBox[] {
  const boxes: StaticBox[] = [];
  for (const spec of WALL_SPECS) boxes.push(...wallBoxes(spec));

  boxes.push(makeBox(0, -1, 0, WORLD.halfSize, 1, WORLD.halfSize, "floor", "floor"));
  boxes.push(makeBox(0, 0.175, 0, 48, 0.175, 36, "floor", "wood"));
  boxes.push(...slabWithHole(-6, 48, -36, 36, 9.9, 10.5, -4, 10, 8, 24, "floor", "floor"));
  boxes.push(...slabWithHole(-48, 48, -36, 36, 22, 23.3, -32, -14, -8, 8, "roof", "roof"));

  const stepCount = 18;
  const stairWidth = 10;
  const stairStartZ = 24;
  const stairEndZ = 9;
  const stepDepth = (stairStartZ - stairEndZ) / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const top = 0.35 + ((i + 1) / stepCount) * 10.15;
    const z0 = stairStartZ - (i + 1) * stepDepth;
    const z1 = stairStartZ - i * stepDepth;
    boxes.push(makeBox(2, top / 2, (z0 + z1) / 2, stairWidth / 2, top / 2, stepDepth / 2, "stairs", "wood"));
  }

  boxes.push(makeBox(-46.6, 4.9, 0, 1.5, 4.9, 5.2, "prop", "stone"));
  boxes.push(makeBox(-46.6, 1.1, 0, 1.9, 0.75, 5.6, "prop", "stone"));
  boxes.push(makeBox(-46.6, 8.8, 0, 1.2, 1.4, 4.2, "prop", "stone"));
  boxes.push(makeBox(-44, 28, 0, 2.4, 4.5, 2.6, "prop", "stone"));
  boxes.push(makeBox(24, 26, -18, 2.8, 2.4, 2.8, "prop", "wood"));
  boxes.push(makeBox(32, 0.62, 46, 2.4, 0.62, 0.8, "prop", "wood"));
  boxes.push(makeBox(52, 0.85, 10, 1.3, 0.85, 1.3, "prop", "stone"));

  boxes.push(makeBox(-93, 1.2, 43, 8, 1.2, 4, "shed", "wood"));
  boxes.push(makeBox(-93, 2.4, 39, 8, 2.4, 0.4, "shed", "wood"));
  boxes.push(makeBox(-101, 2.4, 43, 0.4, 2.4, 4, "shed", "wood"));
  boxes.push(makeBox(-85, 2.4, 43, 0.4, 2.4, 4, "shed", "wood"));
  boxes.push(makeBox(-93, 4.6, 43, 8.4, 0.4, 4.4, "shed", "roof"));

  const hedgeDefs: Array<[number, number, number, number]> = [
    [-30, 63, 24, 1], [30, 63, 24, 1], [-52, 40, 1, 12], [52, 40, 1, 12],
    [-62, 30, 1, 16], [-62, -46, 1, 16], [62, 30, 1, 16], [62, -46, 1, 16],
    [-30, -54, 20, 1], [32, -54, 20, 1], [-22, 44, 1, 6], [22, 44, 1, 6],
  ];
  for (const [x, z, hx, hz] of hedgeDefs) {
    boxes.push(makeBox(x, 1.1, z, hx, 1.1, hz, "hedge", "hedge"));
  }

  for (const f of FURNITURE) {
    if (!f.collider) continue;
    const c = f.collider;
    boxes.push(makeBox(f.x + (c.dx ?? 0), f.y + c.dy, f.z + (c.dz ?? 0), c.hx, c.hy, c.hz, "furniture", "wood"));
  }

  for (const block of TOY_BLOCKS) {
    boxes.push(makeBox(block.x, block.baseY + block.size, block.z, block.size, block.size, block.size, "prop", "wood"));
  }

  for (const t of TREES) {
    const src = TREE_SOURCE[t.assetId as keyof typeof TREE_SOURCE];
    if (!src) continue;
    const h = src.height * t.scale;
    boxes.push(makeBox(t.x, h * 0.28, t.z, 0.75 * t.scale, h * 0.28, 0.75 * t.scale, "tree", "wood"));
    boxes.push(makeBox(t.x, h * 0.66, t.z, src.width * t.scale * 0.31, h * 0.3, src.depth * t.scale * 0.31, "tree", "hedge"));
  }

  boxes.push(makeBox(0, 45, -WORLD.halfSize, WORLD.halfSize, 45, 1, "boundary", "invisible"));
  boxes.push(makeBox(0, 45, WORLD.halfSize, WORLD.halfSize, 45, 1, "boundary", "invisible"));
  boxes.push(makeBox(-WORLD.halfSize, 45, 0, 1, 45, WORLD.halfSize, "boundary", "invisible"));
  boxes.push(makeBox(WORLD.halfSize, 45, 0, 1, 45, WORLD.halfSize, "boundary", "invisible"));

  return boxes;
}

export const STATIC_BOXES: StaticBox[] = buildWorldBoxes();

export const SPAWN_POINTS: SpawnPoint[] = [
  { x: -40, y: 20, z: 82, yaw: -0.35, team: "RAF" },
  { x: -66, y: 24, z: 66, yaw: -0.78, team: "RAF" },
  { x: -18, y: 18, z: 90, yaw: -0.15, team: "RAF" },
  { x: -70, y: 25, z: -45, yaw: -2.12, team: "RAF" },
  { x: 40, y: 20, z: -82, yaw: Math.PI, team: "AXIS" },
  { x: 70, y: 26, z: -30, yaw: 2.5, team: "AXIS" },
  { x: 0, y: 30, z: -85, yaw: Math.PI, team: "AXIS" },
  { x: 89, y: 27, z: 28, yaw: 1.22, team: "AXIS" },
  { x: 60, y: 30, z: -22, yaw: 2.3, team: "AXIS" },
  { x: 0, y: 42, z: 104, yaw: 0, team: "ANY" },
  { x: 0, y: 42, z: -104, yaw: Math.PI, team: "ANY" },
  { x: 105, y: 38, z: 0, yaw: Math.PI / 2, team: "ANY" },
  { x: -105, y: 38, z: 0, yaw: -Math.PI / 2, team: "ANY" },
];

export const PATIO = { minX: -18, maxX: 18, minZ: 39, maxZ: 60 };
export const FOUNTAIN = { x: 70, z: -42, radius: 12 };

export function getSpawnForTeam(team: "RAF" | "AXIS" | "ANY", random = Math.random): SpawnPoint {
  const exact = SPAWN_POINTS.filter((s) => s.team === team);
  const all = exact.length > 0 ? exact : SPAWN_POINTS.filter((s) => s.team === "ANY");
  return all[Math.floor(random() * all.length)] ?? SPAWN_POINTS[0];
}

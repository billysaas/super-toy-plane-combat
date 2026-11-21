import { Vector3 } from "three";
import type { StaticBox } from "./worldLayout";

export interface RayHit {
  distance: number;
  point: Vector3;
  normal: Vector3;
  box: StaticBox;
}

export interface SweepHit {
  hit: boolean;
  position: Vector3;
  normal: Vector3;
  box?: StaticBox;
}

const tmpMin = new Vector3();
const tmpMax = new Vector3();
const tmpClosest = new Vector3();
const tmpDelta = new Vector3();
const tmpPoint = new Vector3();

export function boxMin(box: StaticBox, out = tmpMin): Vector3 {
  return out.set(box.cx - box.hx, box.cy - box.hy, box.cz - box.hz);
}

export function boxMax(box: StaticBox, out = tmpMax): Vector3 {
  return out.set(box.cx + box.hx, box.cy + box.hy, box.cz + box.hz);
}

export function raycastWorld(origin: Vector3, dir: Vector3, maxDistance: number, boxes: StaticBox[]): RayHit | null {
  let best = maxDistance;
  let bestBox: StaticBox | null = null;
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = dir.x;
  const dy = dir.y;
  const dz = dir.z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    let tmin = 0;
    let tmax = best;
    let axis = -1;
    if (Math.abs(dx) < 1e-8) {
      if (ox < b.cx - b.hx || ox > b.cx + b.hx) continue;
    } else {
      const inv = 1 / dx;
      let t1 = (b.cx - b.hx - ox) * inv;
      let t2 = (b.cx + b.hx - ox) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 0; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dy) < 1e-8) {
      if (oy < b.cy - b.hy || oy > b.cy + b.hy) continue;
    } else {
      const inv = 1 / dy;
      let t1 = (b.cy - b.hy - oy) * inv;
      let t2 = (b.cy + b.hy - oy) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 1; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (Math.abs(dz) < 1e-8) {
      if (oz < b.cz - b.hz || oz > b.cz + b.hz) continue;
    } else {
      const inv = 1 / dz;
      let t1 = (b.cz - b.hz - oz) * inv;
      let t2 = (b.cz + b.hz - oz) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = 2; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }
    if (tmin >= 0 && tmin < best && axis >= 0) {
      best = tmin;
      bestBox = b;
    }
  }
  if (!bestBox) return null;
  const normal = new Vector3();
  if (bestBox) {
    const px = ox + dx * best;
    const py = oy + dy * best;
    const pz = oz + dz * best;
    const nx = Math.abs(px - (bestBox.cx - bestBox.hx));
    const px2 = Math.abs(px - (bestBox.cx + bestBox.hx));
    const ny = Math.abs(py - (bestBox.cy - bestBox.hy));
    const py2 = Math.abs(py - (bestBox.cy + bestBox.hy));
    const nz = Math.abs(pz - (bestBox.cz - bestBox.hz));
    const pz2 = Math.abs(pz - (bestBox.cz + bestBox.hz));
    const min = Math.min(nx, px2, ny, py2, nz, pz2);
    if (min === nx) normal.set(-1, 0, 0);
    else if (min === px2) normal.set(1, 0, 0);
    else if (min === ny) normal.set(0, -1, 0);
    else if (min === py2) normal.set(0, 1, 0);
    else if (min === nz) normal.set(0, 0, -1);
    else normal.set(0, 0, 1);
  }
  return {
    distance: best,
    point: origin.clone().addScaledVector(dir, best),
    normal,
    box: bestBox,
  };
}

export function sphereSweepWorld(from: Vector3, delta: Vector3, radius: number, boxes: StaticBox[]): SweepHit {
  const distance = delta.length();
  if (distance < 1e-6) return { hit: false, position: from.clone(), normal: new Vector3(), box: undefined };
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.28, radius * 0.55)));
  const step = tmpDelta.copy(delta).divideScalar(steps);
  const pos = from.clone();
  for (let s = 0; s < steps; s++) {
    pos.add(step);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const closestX = Math.max(b.cx - b.hx, Math.min(pos.x, b.cx + b.hx));
      const closestY = Math.max(b.cy - b.hy, Math.min(pos.y, b.cy + b.hy));
      const closestZ = Math.max(b.cz - b.hz, Math.min(pos.z, b.cz + b.hz));
      const ox = pos.x - closestX;
      const oy = pos.y - closestY;
      const oz = pos.z - closestZ;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 < radius * radius) {
        const normal = new Vector3();
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          normal.set(ox / d, oy / d, oz / d);
          pos.addScaledVector(normal, radius - d + 0.002);
        } else {
          const dx = b.hx - Math.abs(pos.x - b.cx);
          const dy = b.hy - Math.abs(pos.y - b.cy);
          const dz = b.hz - Math.abs(pos.z - b.cz);
          const min = Math.min(dx, dy, dz);
          if (min === dx) normal.set(Math.sign(pos.x - b.cx) || 1, 0, 0);
          else if (min === dy) normal.set(0, Math.sign(pos.y - b.cy) || 1, 0);
          else normal.set(0, 0, Math.sign(pos.z - b.cz) || 1);
          pos.addScaledVector(normal, min + radius + 0.002);
        }
        return { hit: true, position: pos, normal, box: b };
      }
    }
  }
  return { hit: false, position: pos, normal: new Vector3(), box: undefined };
}

export function raySphere(origin: Vector3, dir: Vector3, maxDistance: number, center: Vector3, radius: number): number | null {
  tmpDelta.copy(center).sub(origin);
  const tca = tmpDelta.dot(dir);
  if (tca < -radius || tca > maxDistance + radius) return null;
  const d2 = tmpDelta.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t0 >= 0 && t0 <= maxDistance) return t0;
  if (t1 >= 0 && t1 <= maxDistance) return t1;
  return null;
}

export function distancePointSegmentSq(point: Vector3, a: Vector3, b: Vector3): number {
  tmpDelta.copy(b).sub(a);
  const len2 = tmpDelta.lengthSq();
  if (len2 < 1e-8) return point.distanceToSquared(a);
  let t = tmpPoint.copy(point).sub(a).dot(tmpDelta) / len2;
  t = Math.max(0, Math.min(1, t));
  tmpClosest.copy(a).addScaledVector(tmpDelta, t);
  return point.distanceToSquared(tmpClosest);
}

export function pointInsideAnyBox(point: Vector3, margin: number, boxes: StaticBox[]): boolean {
  for (const b of boxes) {
    if (
      Math.abs(point.x - b.cx) < b.hx + margin &&
      Math.abs(point.y - b.cy) < b.hy + margin &&
      Math.abs(point.z - b.cz) < b.hz + margin
    ) return true;
  }
  return false;
}

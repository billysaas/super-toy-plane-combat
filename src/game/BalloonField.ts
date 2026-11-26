import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { Quality } from "../../shared/config";
import { BALLOON_SPAWNS, PICKUP_INFO, pickupForBalloon, type PickupKind } from "../../shared/powerups";

interface BalloonVisual {
  root: Group;
  balloon: Group;
  pickup: Group;
  core: Object3D;
  ring: Mesh;
  phase: number;
  alive: boolean;
  hasPickup: boolean;
}

const ENVELOPE_COLORS = [0xd95b4a, 0xe8c15a, 0x5d8fc7, 0x7fb069, 0xc77fb0, 0xe08a45];
const BASKET_COLOR = 0x7a5230;

function buildBalloon(index: number): Group {
  const group = new Group();
  const color = ENVELOPE_COLORS[index % ENVELOPE_COLORS.length];
  const fabric = new MeshStandardMaterial({ color, roughness: 0.86, flatShading: true });
  const accent = new MeshStandardMaterial({
    color: index % 2 === 0 ? 0xf4e6c8 : 0x3f5570,
    roughness: 0.9,
    flatShading: true,
  });
  const envelope = new Mesh(new SphereGeometry(1.55, 10, 8), fabric);
  envelope.scale.set(1, 1.32, 1);
  envelope.castShadow = true;
  group.add(envelope);

  const band = new Mesh(new TorusGeometry(1.48, 0.09, 4, 16), accent);
  band.rotation.x = Math.PI / 2;
  group.add(band);
  const bandLow = new Mesh(new TorusGeometry(1.12, 0.07, 4, 14), accent);
  bandLow.rotation.x = Math.PI / 2;
  bandLow.position.y = -0.92;
  group.add(bandLow);

  const skirt = new Mesh(new ConeGeometry(0.62, 0.9, 8), fabric);
  skirt.position.y = -1.72;
  skirt.rotation.x = Math.PI;
  group.add(skirt);

  const basketMat = new MeshStandardMaterial({ color: BASKET_COLOR, roughness: 0.92 });
  const basket = new Mesh(new BoxGeometry(0.68, 0.5, 0.68), basketMat);
  basket.position.y = -2.28;
  group.add(basket);
  const rimMat = new MeshStandardMaterial({ color: 0x4c301c, roughness: 0.9 });
  const rim = new Mesh(new BoxGeometry(0.78, 0.1, 0.78), rimMat);
  rim.position.y = -2.02;
  group.add(rim);

  const ropeMat = new MeshStandardMaterial({ color: 0xe7dcc4, roughness: 0.7 });
  const ropeGeo = new CylinderGeometry(0.025, 0.025, 0.95, 4);
  for (const [rx, rz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
    const rope = new Mesh(ropeGeo, ropeMat);
    rope.position.set(rx, -1.55, rz);
    group.add(rope);
  }

  const flag = new Mesh(new ConeGeometry(0.22, 0.5, 4), accent);
  flag.position.y = 2.2;
  group.add(flag);
  return group;
}

function buildPickup(kind: PickupKind): { group: Group; core: Object3D; ring: Mesh } {
  const group = new Group();
  const info = PICKUP_INFO[kind];
  const glow = new MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.92 });
  const ring = new Mesh(new TorusGeometry(1.12, 0.075, 5, 22), glow);
  ring.rotation.x = Math.PI / 2 - 0.28;
  group.add(ring);

  let core: Object3D;
  if (kind === "health") {
    const cross = new Group();
    const long = new Mesh(new BoxGeometry(0.24, 0.96, 0.24), glow);
    const short = new Mesh(new BoxGeometry(0.9, 0.24, 0.24), glow);
    cross.add(long, short);
    core = cross;
  } else if (kind === "armor") {
    const shield = new Mesh(new CylinderGeometry(0.56, 0.32, 0.22, 6), glow);
    shield.rotation.x = Math.PI / 2;
    const shieldCore = new Mesh(new BoxGeometry(0.18, 0.58, 0.32), glow);
    shieldCore.position.z = 0.08;
    const holder = new Group();
    holder.add(shield, shieldCore);
    core = holder;
  } else if (kind === "shield") {
    const bubble = new Mesh(new SphereGeometry(0.62, 10, 8), glow);
    bubble.scale.set(1, 1.08, 1);
    core = bubble;
  } else {
    const bolt = new Mesh(new OctahedronGeometry(0.58, 0), glow);
    bolt.scale.set(0.72, 1.35, 0.72);
    core = bolt;
  }
  group.add(core);
  return { group, core, ring };
}

export class BalloonField {
  private scene: Scene;
  private visuals: BalloonVisual[] = [];
  private time = 0;

  constructor(scene: Scene, quality: Quality) {
    this.scene = scene;
    BALLOON_SPAWNS.forEach((spawn, index) => {
      const root = new Group();
      root.position.set(spawn.x, spawn.y, spawn.z);
      const balloon = buildBalloon(index);
      const { group: pickup, core, ring } = buildPickup(pickupForBalloon(index));
      pickup.position.y = -1.15;
      pickup.visible = false;
      root.add(balloon, pickup);
      balloon.castShadow = quality !== "low";
      this.scene.add(root);
      this.visuals.push({
        root,
        balloon,
        pickup,
        core,
        ring,
        phase: index * 1.37,
        alive: true,
        hasPickup: false,
      });
    });
  }

  setState(index: number, alive: boolean, hasPickup: boolean): void {
    const visual = this.visuals[index];
    if (!visual) return;
    visual.alive = alive;
    visual.hasPickup = hasPickup && !alive;
    visual.balloon.visible = visual.alive;
    visual.pickup.visible = visual.hasPickup;
  }

  update(dt: number): void {
    this.time += dt;
    for (const visual of this.visuals) {
      if (visual.alive) {
        visual.balloon.position.y = Math.sin(this.time * 0.75 + visual.phase) * 0.34;
        visual.balloon.rotation.y += dt * 0.18;
        visual.balloon.rotation.z = Math.sin(this.time * 0.5 + visual.phase) * 0.045;
      }
      if (visual.hasPickup) {
        visual.pickup.position.y = -1.15 + Math.sin(this.time * 1.7 + visual.phase) * 0.24;
        visual.pickup.rotation.y += dt * 1.35;
        visual.ring.rotation.z += dt * 0.9;
        const pulse = 1 + Math.sin(this.time * 2.6 + visual.phase) * 0.08;
        visual.ring.scale.setScalar(pulse);
        visual.core.rotation.y += dt * 2.1;
      }
    }
  }

  private disposeObject(root: Object3D): void {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry as BufferGeometry | undefined;
      geometry?.dispose();
      const material = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }

  dispose(): void {
    this.visuals.forEach((visual) => {
      this.scene.remove(visual.root);
      this.disposeObject(visual.root);
    });
    this.visuals = [];
  }
}

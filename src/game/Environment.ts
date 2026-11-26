import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  Line,
  LineBasicMaterial,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AssetStore } from "./AssetStore";
import type { Quality } from "../../shared/config";
import { WORLD } from "../../shared/config";
import { FURNITURE, STATIC_BOXES, TOY_BLOCKS, TREES, WALL_SPECS, type BoxMaterial, type StaticBox } from "../../shared/worldLayout";

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeatX: number, repeatY: number, pixel = true): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = pixel ? NearestFilter : LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function grassTexture(): CanvasTexture {
  return makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#5f8a3f";
    ctx.fillRect(0, 0, size, size);
    const rng = seeded(41);
    for (let i = 0; i < 380; i++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      const colors = ["#557e37", "#6c9849", "#749f50", "#4f7531", "#84a75a"];
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      const w = rng() > 0.76 ? 3 : 1;
      ctx.fillRect(x, y, w, rng() > 0.65 ? 3 : 1);
    }
  }, 42, 42);
}

function woodTexture(): CanvasTexture {
  return makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#a8784d";
    ctx.fillRect(0, 0, size, size);
    const rng = seeded(11);
    const plankH = 16;
    for (let y = 0; y < size; y += plankH) {
      const base = 142 + Math.floor(rng() * 22);
      ctx.fillStyle = `rgb(${base + 24},${base - 10},${base - 44})`;
      ctx.fillRect(0, y + 1, size, plankH - 2);
      ctx.fillStyle = "rgba(65,36,20,.45)";
      ctx.fillRect(0, y, size, 1);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = `rgba(95,56,28,${0.14 + rng() * 0.12})`;
        ctx.fillRect(0, y + 3 + Math.floor(rng() * 11), size, 1);
      }
      const cut = Math.floor(rng() * size);
      ctx.fillStyle = "rgba(61,33,18,.5)";
      ctx.fillRect(cut, y, 1, plankH);
    }
  }, 32, 23);
}

function floorWoodTexture(): CanvasTexture {
  return makeCanvasTexture(256, (ctx, size) => {
    const rng = seeded(19);
    ctx.fillStyle = "#8d6038";
    ctx.fillRect(0, 0, size, size);
    const plankH = 28;
    for (let y = 0; y < size; y += plankH) {
      const base = 151 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${base + 20},${base - 14},${base - 52})`;
      ctx.fillRect(0, y + 1, size, plankH - 2);
      ctx.fillStyle = "rgba(56,30,15,.42)";
      ctx.fillRect(0, y, size, 2);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = `rgba(92,52,24,${0.08 + rng() * 0.12})`;
        const yy = y + 4 + Math.floor(rng() * (plankH - 8));
        ctx.fillRect(0, yy, size, 1);
      }
      if (rng() > 0.55) {
        const kx = Math.floor(rng() * size);
        const ky = y + plankH * 0.5;
        ctx.fillStyle = "rgba(62,33,16,.32)";
        ctx.beginPath();
        ctx.ellipse(kx, ky, 3 + rng() * 4, 1.5 + rng() * 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const seams = 2 + Math.floor(rng() * 2);
      for (let s = 0; s < seams; s++) {
        const x = Math.floor((s + rng() * 0.5) * (size / seams));
        ctx.fillStyle = "rgba(50,28,14,.36)";
        ctx.fillRect(x, y + 2, 2, plankH - 3);
      }
    }
  }, 18, 14);
}

function stoneTexture(): CanvasTexture {
  return makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#a7957f";
    ctx.fillRect(0, 0, size, size);
    const rng = seeded(77);
    const tile = 32;
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        const g = 142 + Math.floor(rng() * 28);
        ctx.fillStyle = `rgb(${g + 12},${g + 1},${g - 17})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        ctx.fillStyle = "rgba(238,226,204,.22)";
        ctx.fillRect(x + 2, y + 2, tile - 4, 2);
      }
    }
    ctx.strokeStyle = "rgba(78,64,49,.55)";
    ctx.lineWidth = 1;
    for (let p = 0; p <= size; p += tile) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  }, 12, 12);
}

function roofTexture(): CanvasTexture {
  return makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#a45336";
    ctx.fillRect(0, 0, size, size);
    const rng = seeded(31);
    for (let y = 0; y < size; y += 12) {
      for (let x = -6; x < size + 12; x += 16) {
        const off = Math.floor(y / 12) % 2 === 0 ? 0 : 8;
        ctx.fillStyle = `rgb(${159 + Math.floor(rng() * 24)},${82 + Math.floor(rng() * 16)},${53 + Math.floor(rng() * 12)})`;
        ctx.beginPath();
        ctx.roundRect(x + off, y, 15, 11, 3);
        ctx.fill();
      }
    }
  }, 12, 4);
}

function wallTexture(): CanvasTexture {
  return makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#e2c8a4";
    ctx.fillRect(0, 0, size, size);
    const rng = seeded(93);
    // Slim wallpaper stripes with a tiny repeating motif.
    for (let x = 0; x < size; x += 16) {
      ctx.fillStyle = "rgba(255,248,225,.09)";
      ctx.fillRect(x + 1, 0, 7, size);
      ctx.fillStyle = "rgba(113,80,48,.05)";
      ctx.fillRect(x + 9, 0, 1, size);
    }
    for (let y = 12; y < size; y += 32) {
      for (let x = 8; x < size; x += 32) {
        ctx.fillStyle = "rgba(120,83,45,.075)";
        ctx.beginPath();
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 6, y + 4);
        ctx.lineTo(x + 3, y + 8);
        ctx.lineTo(x, y + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (let i = 0; i < 300; i++) {
      const c = rng() > 0.5 ? "rgba(255,246,223,.16)" : "rgba(137,101,63,.07)";
      ctx.fillStyle = c;
      ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 2, 2);
    }
  }, 7, 4, false);
}

const materialsStore: {
  wall?: MeshStandardMaterial;
  exterior?: MeshStandardMaterial;
  trim?: MeshStandardMaterial;
  floor?: MeshStandardMaterial;
  roof?: MeshStandardMaterial;
  stone?: MeshStandardMaterial;
  wood?: MeshStandardMaterial;
  hedge?: MeshStandardMaterial;
  shed?: MeshStandardMaterial;
  railing?: MeshStandardMaterial;
  path?: MeshStandardMaterial;
} = {};

function buildMaterials(): void {
  const wallMap = wallTexture();
  const woodMap = woodTexture();
  const floorMap = floorWoodTexture();
  const stoneMap = stoneTexture();
  const roofMap = roofTexture();
  materialsStore.wall = new MeshStandardMaterial({ color: 0xf1e1c9, roughness: 0.94, map: wallMap });
  materialsStore.exterior = new MeshStandardMaterial({ color: 0xd7b58f, roughness: 0.96, map: wallMap });
  materialsStore.trim = new MeshStandardMaterial({ color: 0x6a472e, roughness: 0.8 });
  materialsStore.floor = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.04, map: floorMap });
  materialsStore.roof = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: roofMap });
  materialsStore.stone = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: stoneMap });
  materialsStore.wood = new MeshStandardMaterial({ color: 0x8f6542, roughness: 0.82, map: woodMap });
  materialsStore.hedge = new MeshStandardMaterial({ color: 0x3f6d36, roughness: 1, flatShading: true });
  materialsStore.shed = new MeshStandardMaterial({ color: 0x8c5b3a, roughness: 0.9 });
  materialsStore.railing = new MeshStandardMaterial({ color: 0x5a3a27, roughness: 0.82 });
  materialsStore.path = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, map: stoneMap });
}

function mergedBoxMesh(boxes: StaticBox[], material: Material): Mesh {
  const geos: BufferGeometry[] = [];
  for (const b of boxes) {
    const geo = new BoxGeometry(b.hx * 2, b.hy * 2, b.hz * 2);
    geo.translate(b.cx, b.cy, b.cz);
    geos.push(geo);
  }
  const merged = geos.length ? mergeGeometries(geos, false) : new BufferGeometry();
  geos.forEach((g) => g.dispose());
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cloneBetween(from: Vector3, to: Vector3, radius: number, material: Material): Mesh {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geo = new CylinderGeometry(radius, radius, len, 6);
  const mesh = new Mesh(geo, material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

export class Environment {
  scene: Scene;
  private assets: AssetStore;
  group = new Group();
  private decorations = new Group();
  private furnitureGroup = new Group();
  private flames: Array<{ mesh: Mesh; phase: number }> = [];
  private fireLight?: PointLight;
  private lampLights: PointLight[] = [];
  private cloudGroup = new Group();
  private quality: Quality;
  private waterMaterials: MeshStandardMaterial[] = [];
  private fountainJets: Mesh[] = [];
  private sun?: DirectionalLight;
  private shadowMeshes: Object3D[] = [];
  private dust?: Points;
  private dustUniforms?: { uTime: { value: number }; uPixelRatio: { value: number } };
  private lightShafts?: Group;
  private butterflies: Array<{ group: Group; left: Mesh; right: Mesh; base: Vector3; phase: number }> = [];
  private birdFlock?: Group;
  private birdWings: Mesh[] = [];
  private kite?: Group;
  private kiteString?: Line;
  private kiteAnchor = new Vector3(21, 0.4, 56);
  private chimneySmoke: Sprite[] = [];
  private contactShadowTexture?: CanvasTexture;
  private time = 0;

  constructor(scene: Scene, assets: AssetStore, quality: Quality) {
    this.scene = scene;
    this.assets = assets;
    this.quality = quality;
    buildMaterials();
  }

  build(): void {
    this.scene.fog = new FogExp2(0xbcd8ee, 0.0022);
    this.scene.add(this.skyDome());
    this.scene.add(this.group);
    this.scene.add(this.decorations);
    this.scene.add(this.furnitureGroup);
    this.scene.add(this.cloudGroup);
    this.group.add(this.buildGround());
    this.group.add(this.buildStructure());
    this.group.add(this.buildStairsRail());
    this.buildFireplace();
    this.buildLighting();
    this.buildFurniture();
    this.buildToyBlocks();
    this.buildGarden();
    this.buildClouds();
    this.buildDecor();
    this.buildAtmosphere();
    this.buildGardenLife();
    this.buildExteriorDetails();
    this.buildGardenFurniture();
    this.setQuality(this.quality);
  }

  private skyDome(): Mesh {
    const geo = new SphereGeometry(420, 24, 12);
    const mat = new ShaderMaterial({
      side: DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new Color(0x4a8fd0) },
        midColor: { value: new Color(0xa9d2ec) },
        horizonColor: { value: new Color(0xf7e4bd) },
        sunDir: { value: new Vector3(-0.45, 0.55, 0.38).normalize() },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        void main() {
          float h = clamp(vPos.y * 0.75 + 0.18, 0.0, 1.0);
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.42, h));
          col = mix(col, topColor, smoothstep(0.38, 1.0, h));
          float sun = pow(max(dot(vPos, sunDir), 0.0), 150.0);
          float halo = pow(max(dot(vPos, sunDir), 0.0), 14.0) * 0.32;
          col += vec3(1.0, 0.85, 0.55) * (sun * 1.8 + halo);
          float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
          gl_FragColor = vec4(col + dither, 1.0);
        }
      `,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.y = 20;
    mesh.renderOrder = -5;
    return mesh;
  }

  private buildGround(): Group {
    const groundMat = new MeshStandardMaterial({ color: 0xffffff, map: grassTexture(), roughness: 1 });
    const ground = new Mesh(new PlaneGeometry(WORLD.halfSize * 2 - 2, WORLD.halfSize * 2 - 2, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    const g = new Group();
    g.add(ground);

    const patio = new Mesh(new PlaneGeometry(36, 24), new MeshStandardMaterial({ color: 0xffffff, map: stoneTexture(), roughness: 0.95 }));
    patio.rotation.x = -Math.PI / 2;
    patio.position.set(0, 0.035, 48.5);
    patio.receiveShadow = true;
    g.add(patio);

    const pathMat = new MeshStandardMaterial({ color: 0xd7c7aa, roughness: 0.96 });
    const path1 = new Mesh(new PlaneGeometry(9, 56), pathMat);
    path1.rotation.x = -Math.PI / 2;
    path1.position.set(24, 0.03, 84);
    g.add(path1);
    const path2 = new Mesh(new PlaneGeometry(55, 8), pathMat);
    path2.rotation.x = -Math.PI / 2;
    path2.position.set(64, 0.03, 36);
    g.add(path2);

    const floorMap = materialsStore.floor?.map ?? woodTexture();
    const floorPlane = new Mesh(new PlaneGeometry(95, 71), new MeshStandardMaterial({ color: 0xffffff, map: floorMap, roughness: 0.78 }));
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(0, 0.36, 0);
    floorPlane.receiveShadow = true;
    g.add(floorPlane);

    const upperMat = new MeshStandardMaterial({ color: 0xffffff, map: floorMap, roughness: 0.8 });
    const upperSections: Array<[number, number, number, number]> = [
      [-6, -4, -36, 36], [10, 48, -36, 36], [-4, 10, -36, 8], [-4, 10, 24, 36],
    ];
    for (const [x0, x1, z0, z1] of upperSections) {
      const plane = new Mesh(new PlaneGeometry(x1 - x0, z1 - z0), upperMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((x0 + x1) / 2, 10.51, (z0 + z1) / 2);
      plane.receiveShadow = true;
      g.add(plane);
    }
    return g;
  }

  private buildStructure(): Group {
    const g = new Group();
    const byMaterial = new Map<BoxMaterial, StaticBox[]>();
    for (const b of STATIC_BOXES) {
      if (b.kind !== "wall" && b.kind !== "roof" && b.kind !== "stairs" && b.kind !== "shed" && b.kind !== "hedge" && b.kind !== "floor") continue;
      if (b.kind === "floor" && b.material === "floor") continue;
      const arr = byMaterial.get(b.material) ?? [];
      arr.push(b);
      byMaterial.set(b.material, arr);
    }
    for (const [matName, boxes] of byMaterial) {
      let mat: Material | undefined;
      if (matName === "exterior") mat = materialsStore.exterior;
      else if (matName === "interior") mat = materialsStore.wall;
      else if (matName === "floor") mat = materialsStore.floor;
      else if (matName === "roof") mat = materialsStore.roof;
      else if (matName === "hedge") mat = materialsStore.hedge;
      else if (matName === "wood") mat = materialsStore.wood;
      if (!mat) continue;
      const mesh = mergedBoxMesh(boxes, mat);
      this.shadowMeshes.push(mesh);
      g.add(mesh);
    }

    const beamMat = new MeshStandardMaterial({ color: 0x6e4a32, roughness: 0.86 });
    const beams = new Group();
    for (const z of [-27, -15, -3, 9, 21, 33]) {
      const beam = new Mesh(new BoxGeometry(42, 1.2, 1.1), beamMat);
      beam.position.set(-27, 20.7, z);
      beam.castShadow = true;
      beams.add(beam);
    }
    for (const x of [-57, -45, -33, -21, -9]) {
      const beam = new Mesh(new BoxGeometry(0.9, 1.1, 72), beamMat);
      beam.position.set(x, 21.1, 0);
      beam.castShadow = true;
      beams.add(beam);
    }
    g.add(beams);

    const baseTrimMat = new MeshStandardMaterial({ color: 0x815a3c, roughness: 0.8 });
    const trimBoxes: StaticBox[] = [];
    trimBoxes.push({ cx: -47.2, cy: 0.55, cz: 0, hx: 0.15, hy: 0.18, hz: 35.5, kind: "prop", material: "trim" });
    trimBoxes.push({ cx: 47.2, cy: 0.55, cz: 0, hx: 0.15, hy: 0.18, hz: 35.5, kind: "prop", material: "trim" });
    trimBoxes.push({ cx: 0, cy: 0.55, cz: 35.2, hx: 47, hy: 0.18, hz: 0.15, kind: "prop", material: "trim" });
    trimBoxes.push({ cx: 0, cy: 0.55, cz: -35.2, hx: 47, hy: 0.18, hz: 0.15, kind: "prop", material: "trim" });
    g.add(mergedBoxMesh(trimBoxes, baseTrimMat));
    g.add(this.doorFrames());
    g.add(this.buildWallTrim());
    return g;
  }

  private buildWallTrim(): Mesh {
    const boxes: StaticBox[] = [];
    const addSpan = (spec: (typeof WALL_SPECS)[number], u0: number, u1: number, cy: number, hy: number, bothSides: boolean) => {
      if (u1 - u0 < 0.12) return;
      const cu = (u0 + u1) / 2;
      const offsets = bothSides ? [-(spec.thickness / 2 + 0.08), spec.thickness / 2 + 0.08] : [spec.thickness / 2 + 0.08];
      for (const offset of offsets) {
        if (spec.axis === "x") {
          boxes.push({ cx: cu, cy, cz: spec.at + offset, hx: (u1 - u0) / 2, hy, hz: 0.07, kind: "prop", material: "trim" });
        } else {
          boxes.push({ cx: spec.at + offset, cy, cz: cu, hx: 0.07, hy, hz: (u1 - u0) / 2, kind: "prop", material: "trim" });
        }
      }
    };
    for (const spec of WALL_SPECS) {
      const gaps = spec.openings
        .filter((opening) => opening.y0 <= spec.y0 + 0.6)
        .map((opening) => [opening.u0, opening.u1] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      let cursor = spec.from;
      const spans: Array<[number, number]> = [];
      for (const [u0, u1] of gaps) {
        const start = Math.max(spec.from, u0);
        const end = Math.min(spec.to, u1);
        if (start > cursor) spans.push([cursor, start]);
        cursor = Math.max(cursor, end);
      }
      if (cursor < spec.to) spans.push([cursor, spec.to]);
      for (const [u0, u1] of spans) {
        addSpan(spec, u0, u1, spec.y0 + 0.35, 0.35, true);
        if (spec.material === "interior") {
          addSpan(spec, u0, u1, spec.y0 + 2.5, 0.11, true);
          if (spec.y1 - spec.y0 > 7) addSpan(spec, u0, u1, spec.y1 - 0.38, 0.16, true);
        }
      }
    }
    const trim = materialsStore.trim ?? new MeshStandardMaterial({ color: 0x6a472e });
    const mesh = mergedBoxMesh(boxes, trim);
    this.shadowMeshes.push(mesh);
    return mesh;
  }

  private doorFrames(): Group {
    const g = new Group();
    const trim = materialsStore.trim ?? new MeshStandardMaterial({ color: 0x5b3e28 });
    const boxes: StaticBox[] = [];
    const add = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
      boxes.push({ cx, cy, cz, hx, hy, hz, kind: "prop", material: "trim" });
    };
    for (const spec of WALL_SPECS) {
      const t = spec.thickness + 0.18;
      for (const op of spec.openings) {
        const mid = (op.u0 + op.u1) / 2;
        if (spec.axis === "x") {
          add(op.u0 + 0.15, (op.y0 + op.y1) / 2, spec.at, 0.18, (op.y1 - op.y0) / 2, t / 2);
          add(op.u1 - 0.15, (op.y0 + op.y1) / 2, spec.at, 0.18, (op.y1 - op.y0) / 2, t / 2);
          add(mid, op.y1 - 0.15, spec.at, (op.u1 - op.u0) / 2, 0.18, t / 2);
          if (!op.door) {
            add(mid, op.y0 + 0.15, spec.at, (op.u1 - op.u0) / 2, 0.18, t / 2);
            add(mid, (op.y0 + op.y1) / 2, spec.at, 0.1, (op.y1 - op.y0) / 2, t / 2);
          }
        } else {
          add(spec.at, (op.y0 + op.y1) / 2, op.u0 + 0.15, t / 2, (op.y1 - op.y0) / 2, 0.18);
          add(spec.at, (op.y0 + op.y1) / 2, op.u1 - 0.15, t / 2, (op.y1 - op.y0) / 2, 0.18);
          add(spec.at, op.y1 - 0.15, mid, t / 2, 0.18, (op.u1 - op.u0) / 2);
          if (!op.door) {
            add(spec.at, op.y0 + 0.15, mid, t / 2, 0.18, (op.u1 - op.u0) / 2);
            add(spec.at, (op.y0 + op.y1) / 2, mid, t / 2, (op.y1 - op.y0) / 2, 0.1);
          }
        }
      }
    }
    g.add(mergedBoxMesh(boxes, trim));
    return g;
  }

  private buildStairsRail(): Group {
    const g = new Group();
    const mat = materialsStore.railing ?? new MeshStandardMaterial({ color: 0x5a3a27 });
    const posts: StaticBox[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = 24 - t * 15;
      const y = 0.35 + t * 10.15;
      posts.push({ cx: 7.1, cy: y + 0.75, cz: z, hx: 0.12, hy: 0.75, hz: 0.12, kind: "prop", material: "trim" });
      posts.push({ cx: -3.1, cy: y + 0.75, cz: z, hx: 0.12, hy: 0.75, hz: 0.12, kind: "prop", material: "trim" });
    }
    g.add(mergedBoxMesh(posts, mat));
    const rail1 = cloneBetween(new Vector3(7.1, 1.8, 24), new Vector3(7.1, 11.5, 9), 0.12, mat);
    const rail2 = cloneBetween(new Vector3(-3.1, 1.8, 24), new Vector3(-3.1, 11.5, 9), 0.12, mat);
    rail1.castShadow = rail2.castShadow = true;
    g.add(rail1, rail2);
    const upperRail = new Mesh(new BoxGeometry(0.2, 1.5, 10), mat);
    upperRail.position.set(11.5, 11.3, 16);
    g.add(upperRail);
    return g;
  }

  private buildFireplace(): void {
    const stoneMat = new MeshStandardMaterial({ color: 0x8f7d69, roughness: 0.95, flatShading: true });
    const group = new Group();
    const surround = new Mesh(new BoxGeometry(0.5, 8.2, 9.2), stoneMat);
    surround.position.set(-45.06, 4.4, 0);
    surround.castShadow = true;
    surround.receiveShadow = true;
    group.add(surround);
    const opening = new Mesh(new BoxGeometry(0.08, 5.2, 6.4), new MeshBasicMaterial({ color: 0x170e08 }));
    opening.position.set(-44.78, 3.2, 0);
    group.add(opening);
    const mantel = new Mesh(new BoxGeometry(2.6, 0.7, 11), new MeshStandardMaterial({ color: 0x6e503a, roughness: 0.82 }));
    mantel.position.set(-45.3, 8.3, 0);
    mantel.castShadow = true;
    group.add(mantel);
    const hearth = new Mesh(new BoxGeometry(4, 0.6, 12), stoneMat);
    hearth.position.set(-44.8, 0.65, 0);
    group.add(hearth);
    for (let i = 0; i < 4; i++) {
      const log = new Mesh(new CylinderGeometry(0.22, 0.22, 3.2, 6), new MeshStandardMaterial({ color: 0x3b2416, roughness: 1 }));
      log.rotation.x = Math.PI / 2;
      log.rotation.z = (i - 1.5) * 0.22;
      log.position.set(-44.6, 0.95, (i - 1.5) * 0.55);
      group.add(log);
    }
    for (let i = 0; i < 5; i++) {
      const flame = new Mesh(new ConeGeometry(0.7 - i * 0.08, 2.2 + i * 0.35, 5), new MeshBasicMaterial({
        color: new Color(i < 2 ? 0xffd35a : 0xff6a24),
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
        depthWrite: false,
      }));
      flame.position.set(-44.45, 2 + i * 0.15, (i - 2) * 0.45);
      flame.rotation.z = -Math.PI / 2;
      this.flames.push({ mesh: flame, phase: i * 1.7 });
      group.add(flame);
    }
    this.fireLight = new PointLight(0xff8a3d, 460, 35, 1.65);
    this.fireLight.position.set(-43.2, 3.1, 0);
    group.add(this.fireLight);
    this.decorations.add(group);
  }

  private buildLighting(): void {
    const hemi = new HemisphereLight(0xd8ecff, 0x9f8459, 1.45);
    this.scene.add(hemi);
    const ambient = new AmbientLight(0xfff4e5, 0.6);
    this.scene.add(ambient);
    const sun = new DirectionalLight(0xfff2d2, 2.4);
    sun.position.set(-75, 95, 55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 240;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    sun.target.position.set(0, 0, 0);

    const chandelier = new Group();
    const metal = new MeshStandardMaterial({ color: 0x5c4631, roughness: 0.55, metalness: 0.35 });
    const ring = new Mesh(new RingGeometry(2.2, 3.1, 10), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.2;
    chandelier.add(ring);
    const chain = new Mesh(new CylinderGeometry(0.08, 0.08, 5, 5), metal);
    chain.position.y = 2.4;
    chandelier.add(chain);
    for (let i = 0; i < 8; i++) {
      const candle = new Mesh(new CylinderGeometry(0.18, 0.18, 1.1, 5), new MeshStandardMaterial({ color: 0xf0d8a7, emissive: 0xffc37a, emissiveIntensity: 0.35 }));
      const a = (i / 8) * Math.PI * 2;
      candle.position.set(Math.cos(a) * 2.65, 0.35, Math.sin(a) * 2.65);
      chandelier.add(candle);
    }
    chandelier.position.set(-25, 17.2, 4);
    this.decorations.add(chandelier);
    const warm = new PointLight(0xffcb8f, 720, 54, 1.65);
    warm.position.set(-25, 16.2, 4);
    this.lampLights.push(warm);
    this.scene.add(warm);

    const kitchenLight = new PointLight(0xffe3b2, 540, 40, 1.6);
    kitchenLight.position.set(18, 8, -24);
    this.lampLights.push(kitchenLight);
    this.scene.add(kitchenLight);

    const upperLight = new PointLight(0xffd9a0, 440, 42, 1.6);
    upperLight.position.set(3, 18, 12);
    this.lampLights.push(upperLight);
    this.scene.add(upperLight);

    const lampPositions: Array<[number, number, number]> = [
      [-7.2, 3.4, 27], [45.7, 13.8, 11], [-4.7, 13.6, -33], [20, 5, -24],
    ];
    for (const [x, y, z] of lampPositions) {
      const light = new PointLight(0xffd39c, 150, 24, 1.65);
      light.position.set(x, y, z);
      this.lampLights.push(light);
      this.scene.add(light);
    }
  }

  private buildFurniture(): void {
    const shadows = this.quality !== "low";
    for (const f of FURNITURE) {
      const obj = this.assets.createFurniture(f.assetId, shadows);
      if (!obj) continue;
      obj.position.set(f.x, f.y, f.z);
      obj.rotation.y = f.rot;
      obj.scale.setScalar(f.scale);
      obj.traverse((c) => {
        if (c instanceof Mesh) {
          c.castShadow = shadows;
          c.receiveShadow = shadows;
        }
      });
      this.furnitureGroup.add(obj);
      if (f.collider) {
        const floorY = f.y > 8 ? 10.525 : f.y > 0.05 ? 0.372 : 0.032;
        const radius = Math.max(f.collider.hx, f.collider.hz) * 2.55;
        this.addContactShadow(f.x, floorY, f.z, radius, 0.34);
      }
    }
    for (const t of TREES) {
      const obj = this.assets.createFurniture(t.assetId, shadows);
      if (!obj) continue;
      obj.position.set(t.x, 0, t.z);
      obj.rotation.y = t.rot;
      obj.scale.setScalar(t.scale);
      obj.traverse((c) => {
        if (c instanceof Mesh) {
          c.castShadow = shadows;
          c.receiveShadow = shadows;
        }
      });
      this.furnitureGroup.add(obj);
      this.addContactShadow(t.x, 0.028, t.z, 4.2 * t.scale, 0.3);
    }
  }

  private buildToyBlocks(): void {
    for (const block of TOY_BLOCKS) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const hex = `#${block.color.toString(16).padStart(6, "0")}`;
      if (ctx) {
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = "rgba(255,255,255,.25)";
        ctx.lineWidth = 7;
        ctx.strokeRect(7, 7, 114, 114);
        ctx.fillStyle = "rgba(0,0,0,.12)";
        ctx.fillRect(14, 14, 100, 100);
        ctx.fillStyle = "#fff8df";
        ctx.font = "bold 78px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,.38)";
        ctx.shadowOffsetY = 4;
        ctx.fillText(block.label, 64, 68);
      }
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.magFilter = NearestFilter;
      const mat = new MeshStandardMaterial({ map: tex, roughness: 0.74, metalness: 0.03 });
      const mesh = new Mesh(new BoxGeometry(block.size * 2, block.size * 2, block.size * 2), mat);
      mesh.position.set(block.x, block.baseY + block.size, block.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.furnitureGroup.add(mesh);
      this.addContactShadow(block.x, block.baseY + 0.006, block.z, block.size * 2.4, 0.32);
    }
  }

  private buildGarden(): void {    const stoneMat = materialsStore.stone ?? new MeshStandardMaterial({ color: 0xa8957f });
    const g = new Group();
    const fountain = new Group();
    const base = new Mesh(new CylinderGeometry(12, 12, 1.2, 20), stoneMat);
    base.position.y = 0.6;
    base.receiveShadow = true;
    fountain.add(base);
    const rim = new Mesh(new RingGeometry(10.6, 12, 20), stoneMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 1.22;
    fountain.add(rim);
    const waterMat = new MeshStandardMaterial({ color: 0x4aa4c5, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 });
    this.waterMaterials.push(waterMat);
    const water = new Mesh(new CircleGeometry(10.5, 20), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.16;
    fountain.add(water);
    const column = new Mesh(new CylinderGeometry(0.5, 1.1, 4.2, 8), stoneMat);
    column.position.y = 3.2;
    fountain.add(column);
    const bowl = new Mesh(new CylinderGeometry(2.2, 1.2, 0.5, 10), stoneMat);
    bowl.position.y = 5.2;
    fountain.add(bowl);
    const waterJetMat = new MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const jet = new Mesh(new CylinderGeometry(0.04, 0.14, 5, 5), waterJetMat);
      const a = (i / 6) * Math.PI * 2;
      jet.position.set(70 + Math.cos(a) * 2.2, 7.4, -42 + Math.sin(a) * 2.2);
      jet.rotation.z = Math.cos(a) * 0.25;
      jet.rotation.x = Math.sin(a) * 0.25;
      this.fountainJets.push(jet);
      g.add(jet);
    }
    fountain.position.set(70, 0, -42);
    g.add(fountain);

    const flowerColors = [0xf0b6c2, 0xf3db72, 0xf28a79, 0xe9e2ff, 0xffa64d];
    const flowerGeo = new IcosahedronGeometry(0.65, 0);
    const flowerMats = flowerColors.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const rng = seeded(52);
    for (let i = 0; i < 34; i++) {
      const side = i < 17 ? -1 : 1;
      const x = side * (50 + rng() * 5);
      const z = -20 + rng() * 70;
      const flowers = new Mesh(flowerGeo, flowerMats[i % flowerMats.length]);
      flowers.position.set(x + (rng() - 0.5) * 4, 0.7 + rng() * 0.6, z);
      flowers.scale.setScalar(0.6 + rng() * 0.8);
      flowers.castShadow = true;
      g.add(flowers);
      const stem = new Mesh(new CylinderGeometry(0.06, 0.08, 1.3, 4), new MeshStandardMaterial({ color: 0x4b702f }));
      stem.position.set(flowers.position.x, 0.65, flowers.position.z);
      g.add(stem);
    }

    const treeRng = seeded(128);
    const coneGeo = new ConeGeometry(3.1, 12, 7);
    const coniferMat = new MeshStandardMaterial({ color: 0x335c3c, roughness: 1, flatShading: true });
    const trunkGeo = new CylinderGeometry(0.5, 0.75, 8, 5);
    const trunkMat = new MeshStandardMaterial({ color: 0x5b3e28, roughness: 1 });
    const coneCount = 60;
    const foliage = new InstancedMesh(coneGeo, coniferMat, coneCount * 2);
    const trunks = new InstancedMesh(trunkGeo, trunkMat, coneCount);
    const m = new Matrix4();
    for (let i = 0; i < coneCount; i++) {
      const angle = (i / coneCount) * Math.PI * 2;
      const r = 113 + treeRng() * 6;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const s = 1.4 + treeRng() * 1.3;
      m.makeScale(s, s, s).setPosition(x, 8 * s, z);
      trunks.setMatrixAt(i, m);
      m.makeScale(s, s, s).setPosition(x, 12 * s, z);
      foliage.setMatrixAt(i * 2, m);
      m.makeScale(s * 0.82, s * 0.82, s * 0.82).setPosition(x, 18 * s, z);
      foliage.setMatrixAt(i * 2 + 1, m);
    }
    foliage.instanceMatrix.needsUpdate = true;
    trunks.instanceMatrix.needsUpdate = true;
    foliage.castShadow = true;
    g.add(foliage, trunks);

    const fenceMat = new MeshStandardMaterial({ color: 0xd9c7a7, roughness: 0.9 });
    const fenceGroup = new Group();
    for (let i = -6; i <= 6; i++) {
      const post = new Mesh(new BoxGeometry(1, 7, 1), fenceMat);
      post.position.set(i * 20, 3.5, 61.5);
      fenceGroup.add(post);
    }
    for (let i = -5; i <= 5; i++) {
      const post = new Mesh(new BoxGeometry(1, 7, 1), fenceMat);
      post.position.set(19, 3.5, 61.5 + i * 11);
      fenceGroup.add(post);
    }
    g.add(fenceGroup);
    this.decorations.add(g);
  }

  private buildDecor(): void {
    const artCanvases: HTMLCanvasElement[] = [];
    const makePoster = (title: string, subtitle: string, bg: string, accent: string): CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 128, 160);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(64, 70, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#17201a";
        ctx.beginPath();
        ctx.moveTo(64, 34);
        ctx.lineTo(78, 66);
        ctx.lineTo(112, 78);
        ctx.lineTo(78, 85);
        ctx.lineTo(70, 116);
        ctx.lineTo(58, 116);
        ctx.lineTo(50, 85);
        ctx.lineTo(16, 78);
        ctx.lineTo(50, 66);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f8e9c3";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(title, 64, 142);
        ctx.fillStyle = "#f8e9c3";
        ctx.globalAlpha = 0.72;
        ctx.font = "6px monospace";
        ctx.fillText(subtitle, 64, 152);
      }
      artCanvases.push(canvas);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.magFilter = NearestFilter;
      return tex;
    };
    const poster = (x: number, y: number, z: number, rotY: number, w: number, h: number, title: string, subtitle: string, bg: string, accent: string) => {
      const group = new Group();
      const frame = new Mesh(new BoxGeometry(w + 0.6, h + 0.6, 0.18), materialsStore.trim ?? new MeshStandardMaterial());
      frame.position.copy(new Vector3(x, y, z));
      frame.rotation.y = rotY;
      group.add(frame);
      const art = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: makePoster(title, subtitle, bg, accent), roughness: 0.9 }));
      art.position.copy(new Vector3(x, y, z)).add(new Vector3(Math.sin(rotY) * 0.11, 0, Math.cos(rotY) * 0.11));
      art.rotation.y = rotY;
      group.add(art);
      this.decorations.add(group);
    };
    poster(-33, 12.5, -35.32, 0, 5, 6.4, "FLY LOW", "OPERATION LIVING ROOM", "#22456b", "#f4c647");
    poster(-16, 12.5, -35.32, 0, 5, 6.4, "HIT HARD", "RAF TOY WING", "#792f28", "#f2d295");
    poster(-47.32, 12, 22, Math.PI / 2, 4.5, 5.7, "THE GARDEN", "LOOKS LIKE A GOOD DAY", "#55723e", "#f2d295");
    poster(-47.32, 12, -12, Math.PI / 2, 4.5, 5.7, "CHOCKS AWAY", "NO STANDS. NO LIMITS.", "#9c6639", "#e7be62");
    poster(-6.47, 6, 18, -Math.PI / 2, 3.4, 4.4, "WATCH THE RUG", "LOW CEILING CLUB", "#315d70", "#f3d07d");
    const waxMat = new MeshStandardMaterial({ color: 0x8e3d2e, roughness: 0.8 });
    const candleMat = new MeshStandardMaterial({ color: 0xf1d8a2, emissive: 0xffb85c, emissiveIntensity: 0.3 });
    const sconcePositions: Array<[number, number, number, number]> = [
      [-34, 8.5, -35.15, 0], [-18, 8.5, -35.15, 0], [-47.2, 8.5, 20, Math.PI / 2], [-47.2, 8.5, -8, Math.PI / 2],
    ];
    for (const [x, y, z, ry] of sconcePositions) {
      const g = new Group();
      const plate = new Mesh(new BoxGeometry(0.7, 1.1, 0.18), waxMat);
      plate.position.set(x, y, z);
      plate.rotation.y = ry;
      g.add(plate);
      const cup = new Mesh(new CylinderGeometry(0.32, 0.2, 0.6, 6), candleMat);
      cup.position.set(x + Math.sin(ry) * 0.2, y + 0.8, z + Math.cos(ry) * 0.2);
      g.add(cup);
      const glow = new PointLight(0xffc679, 80, 12, 1.7);
      glow.position.set(x + Math.sin(ry) * 0.4, y + 0.9, z + Math.cos(ry) * 0.4);
      this.lampLights.push(glow);
      g.add(glow);
      this.decorations.add(g);
    }
    void artCanvases;
  }

  private buildExteriorDetails(): void {
    const stone = materialsStore.stone ?? new MeshStandardMaterial({ color: 0xa8957f });

    const chimney = new Group();
    const stack = new Mesh(new BoxGeometry(4.2, 9, 4.8), stone);
    stack.position.set(-44, 27.8, 0);
    stack.castShadow = true;
    stack.receiveShadow = true;
    chimney.add(stack);
    const cap = new Mesh(new BoxGeometry(5.2, 0.9, 5.8), stone);
    cap.position.set(-44, 32.3, 0);
    cap.castShadow = true;
    chimney.add(cap);
    const flue = new Mesh(new BoxGeometry(2.4, 0.8, 2.8), new MeshBasicMaterial({ color: 0x24160f }));
    flue.position.set(-44, 32.65, 0);
    chimney.add(flue);
    this.decorations.add(chimney);

    const fasciaMat = new MeshStandardMaterial({ color: 0xd7c39d, roughness: 0.76 });
    const fascia = new Group();
    const southFascia = new Mesh(new BoxGeometry(97, 0.55, 0.42), fasciaMat);
    southFascia.position.set(0, 23.35, 36.4);
    const northFascia = new Mesh(new BoxGeometry(97, 0.55, 0.42), fasciaMat);
    northFascia.position.set(0, 23.35, -36.4);
    const eastFascia = new Mesh(new BoxGeometry(0.42, 0.55, 73), fasciaMat);
    eastFascia.position.set(48.4, 23.35, 0);
    const westFascia = new Mesh(new BoxGeometry(0.42, 0.55, 73), fasciaMat);
    westFascia.position.set(-48.4, 23.35, 0);
    fascia.add(southFascia, northFascia, eastFascia, westFascia);
    this.decorations.add(fascia);

    const spoutMat = new MeshStandardMaterial({ color: 0x56606a, roughness: 0.55, metalness: 0.28 });
    const spoutGeo = new CylinderGeometry(0.16, 0.16, 22.4, 6);
    for (const [x, z] of [[-47.2, 36.6], [47.2, 36.6], [-47.2, -36.6], [47.2, -36.6]]) {
      const spout = new Mesh(spoutGeo, spoutMat);
      spout.position.set(x, 11.2, z);
      spout.castShadow = true;
      this.decorations.add(spout);
    }

    const smokeCanvas = document.createElement("canvas");
    smokeCanvas.width = smokeCanvas.height = 128;
    const smokeCtx = smokeCanvas.getContext("2d");
    if (smokeCtx) {
      const grad = smokeCtx.createRadialGradient(64, 64, 3, 64, 64, 62);
      grad.addColorStop(0, "rgba(235,230,220,.9)");
      grad.addColorStop(0.45, "rgba(220,215,205,.5)");
      grad.addColorStop(1, "rgba(210,205,195,0)");
      smokeCtx.fillStyle = grad;
      smokeCtx.fillRect(0, 0, 128, 128);
    }
    const smokeTexture = new CanvasTexture(smokeCanvas);
    smokeTexture.colorSpace = SRGBColorSpace;
    for (let i = 0; i < 9; i++) {
      const sprite = new Sprite(new SpriteMaterial({
        map: smokeTexture,
        color: 0xd8d2c6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }));
      sprite.position.set(-44, 33, 0);
      this.chimneySmoke.push(sprite);
      this.scene.add(sprite);
    }

    const south = WALL_SPECS.find((spec) => spec.axis === "x" && spec.at === 36);
    if (!south) return;
    const shutterCanvas = document.createElement("canvas");
    shutterCanvas.width = 64;
    shutterCanvas.height = 128;
    const shutterCtx = shutterCanvas.getContext("2d");
    if (shutterCtx) {
      shutterCtx.fillStyle = "#4d6c8e";
      shutterCtx.fillRect(0, 0, 64, 128);
      shutterCtx.fillStyle = "#3b5370";
      for (let y = 8; y < 128; y += 12) shutterCtx.fillRect(4, y, 56, 5);
      shutterCtx.strokeStyle = "#2d4058";
      shutterCtx.lineWidth = 4;
      shutterCtx.strokeRect(2, 2, 60, 124);
    }
    const shutterTexture = new CanvasTexture(shutterCanvas);
    shutterTexture.colorSpace = SRGBColorSpace;
    const shutterMat = new MeshStandardMaterial({ map: shutterTexture, roughness: 0.9 });
    const boxMat = new MeshStandardMaterial({ color: 0xa85f3e, roughness: 0.92 });
    const soilMat = new MeshStandardMaterial({ color: 0x3e2a1b, roughness: 1 });
    const flowerGeo = new IcosahedronGeometry(0.26, 0);
    const flowerMats = [0xffd45c, 0xff917d, 0xf0b6c2, 0xe8b5ff].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
    for (const op of south.openings) {
      if (op.door) continue;
      const mid = (op.u0 + op.u1) / 2;
      const height = op.y1 - op.y0;
      for (const side of [-1, 1]) {
        const x = side < 0 ? op.u0 - 0.55 : op.u1 + 0.55;
        const shutter = new Mesh(new BoxGeometry(0.72, height * 0.95, 0.12), shutterMat);
        shutter.position.set(x, (op.y0 + op.y1) / 2, 36.72);
        shutter.castShadow = true;
        this.decorations.add(shutter);
      }
      if (op.y0 > 3) {
        const width = op.u1 - op.u0;
        const box = new Mesh(new BoxGeometry(width * 0.84, 0.48, 0.7), boxMat);
        box.position.set(mid, op.y0 - 0.32, 36.82);
        box.castShadow = true;
        this.decorations.add(box);
        const soil = new Mesh(new BoxGeometry(width * 0.76, 0.12, 0.56), soilMat);
        soil.position.set(mid, op.y0 - 0.08, 36.82);
        this.decorations.add(soil);
        for (let i = 0; i < 5; i++) {
          const x = mid + (i - 2) * width * 0.15;
          const stem = new Mesh(new CylinderGeometry(0.04, 0.05, 0.55, 4), new MeshStandardMaterial({ color: 0x4b702f }));
          stem.position.set(x, op.y0 + 0.16, 36.82);
          const bloom = new Mesh(flowerGeo, flowerMats[i % flowerMats.length]);
          bloom.position.set(x, op.y0 + 0.45, 36.82);
          bloom.scale.setScalar(0.8 + (i % 2) * 0.3);
          this.decorations.add(stem, bloom);
        }
      }
    }

    const lanternMat = new MeshStandardMaterial({ color: 0x3b3b36, roughness: 0.6, metalness: 0.35 });
    const glowMat = new MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb75c, emissiveIntensity: 1.2 });
    for (const op of south.openings) {
      if (!op.door) continue;
      for (const x of [op.u0 - 0.85, op.u1 + 0.85]) {
        const lantern = new Group();
        const cage = new Mesh(new BoxGeometry(0.48, 0.9, 0.48), lanternMat);
        const glow = new Mesh(new BoxGeometry(0.3, 0.46, 0.3), glowMat);
        lantern.add(cage, glow);
        lantern.position.set(x, 7.4, 36.72);
        this.decorations.add(lantern);
        const light = new PointLight(0xffc37a, 55, 16, 1.7);
        light.position.set(x, 7.4, 37.2);
        this.lampLights.push(light);
        this.scene.add(light);
      }
    }

    const cupola = new Group();
    const cupolaMat = new MeshStandardMaterial({ color: 0xd7c39d, roughness: 0.82 });
    const cupolaBase = new Mesh(new BoxGeometry(6, 1.2, 6), cupolaMat);
    cupolaBase.position.y = 24.1;
    cupola.add(cupolaBase);
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
      const post = new Mesh(new BoxGeometry(0.42, 2.2, 0.42), cupolaMat);
      post.position.set(x, 25.6, z);
      cupola.add(post);
    }
    const cupolaCap = new Mesh(new ConeGeometry(5.2, 3.2, 4), new MeshStandardMaterial({ color: 0x9d4436, roughness: 0.9, flatShading: true }));
    cupolaCap.position.y = 28.3;
    cupolaCap.rotation.y = Math.PI / 4;
    cupola.add(cupolaCap);
    const cupolaFinial = new Mesh(new CylinderGeometry(0.08, 0.08, 2.2, 5), new MeshStandardMaterial({ color: 0x3d3a30, roughness: 0.5, metalness: 0.4 }));
    cupolaFinial.position.y = 30.8;
    cupola.add(cupolaFinial);
    cupola.position.set(24, 0, -18);
    cupola.traverse((obj) => {
      if (obj instanceof Mesh) obj.castShadow = true;
    });
    this.decorations.add(cupola);

    const frameMat = new MeshStandardMaterial({ color: 0x6a472e, roughness: 0.82 });
    const skylight = new Group();
    const front = new Mesh(new BoxGeometry(19.5, 0.9, 0.9), frameMat);
    front.position.set(-23, 23.7, 8.4);
    const back = new Mesh(new BoxGeometry(19.5, 0.9, 0.9), frameMat);
    back.position.set(-23, 23.7, -8.4);
    const left = new Mesh(new BoxGeometry(0.9, 0.9, 17.7), frameMat);
    left.position.set(-32.4, 23.7, 0);
    const right = new Mesh(new BoxGeometry(0.9, 0.9, 17.7), frameMat);
    right.position.set(-13.6, 23.7, 0);
    skylight.add(front, back, left, right);
    for (const [x, z] of [[5, -24], [29, -19], [33, 22]]) {
      const vent = new Mesh(new BoxGeometry(1.5, 1.4, 1.5), new MeshStandardMaterial({ color: 0x9b968a, roughness: 0.8 }));
      vent.position.set(x, 23.9, z);
      vent.castShadow = true;
      const ventCap = new Mesh(new BoxGeometry(2.1, 0.35, 2.1), new MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.7 }));
      ventCap.position.set(x, 24.7, z);
      this.decorations.add(vent, ventCap);
    }
    this.decorations.add(skylight);
  }

  private buildGardenFurniture(): void {
    const wood = materialsStore.wood ?? new MeshStandardMaterial({ color: 0x8f6542 });
    const stone = materialsStore.stone ?? new MeshStandardMaterial({ color: 0xa8957f });
    const bench = new Group();
    for (let i = 0; i < 4; i++) {
      const slat = new Mesh(new BoxGeometry(4.6, 0.22, 0.52), wood);
      slat.position.set(0, 0.7, -0.7 + i * 0.48);
      slat.castShadow = true;
      bench.add(slat);
    }
    for (let i = 0; i < 3; i++) {
      const slat = new Mesh(new BoxGeometry(4.6, 0.22, 0.34), wood);
      slat.position.set(0, 1.38 + i * 0.45, 0.78);
      slat.castShadow = true;
      bench.add(slat);
    }
    for (const x of [-1.9, 1.9]) {
      const leg = new Mesh(new BoxGeometry(0.32, 1.55, 0.32), wood);
      leg.position.set(x, 0.38, 0.2);
      bench.add(leg);
      const back = new Mesh(new BoxGeometry(0.28, 2.2, 0.28), wood);
      back.position.set(x, 1.1, 0.78);
      back.rotation.x = -0.14;
      bench.add(back);
    }
    bench.position.set(32, 0.02, 46);
    bench.rotation.y = 0.15;
    this.decorations.add(bench);
    this.addContactShadow(32, 0.04, 46, 3.6, 0.3);

    const bath = new Group();
    const plinth = new Mesh(new CylinderGeometry(0.55, 0.82, 2.2, 8), stone);
    plinth.position.y = 1.1;
    const basin = new Mesh(new CylinderGeometry(1.6, 1.2, 0.42, 12), stone);
    basin.position.y = 2.35;
    const water = new Mesh(new CircleGeometry(1.35, 16), new MeshStandardMaterial({ color: 0x6cc9e8, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.78 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 2.58;
    bath.add(plinth, basin, water);
    bath.position.set(52, 0.02, 10);
    bath.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.decorations.add(bath);
    this.addContactShadow(52, 0.04, 10, 2.6, 0.3);

    const stoneGeo = new CylinderGeometry(1.15, 1.3, 0.12, 7);
    const slabMatrices: Matrix4[] = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = 12 + t * 56 + Math.sin(t * Math.PI) * 7;
      const z = 52 - t * 92;
      const m = new Matrix4();
      m.makeRotationY(t * 3.1);
      m.scale(new Vector3(1 + (i % 3) * 0.12, 1, 0.8 + (i % 2) * 0.15));
      m.setPosition(x, 0.07, z);
      slabMatrices.push(m);
    }
    const slabs = new InstancedMesh(stoneGeo, stone, slabMatrices.length);
    slabMatrices.forEach((m, i) => slabs.setMatrixAt(i, m));
    slabs.instanceMatrix.needsUpdate = true;
    slabs.receiveShadow = true;
    this.decorations.add(slabs);

    const potMat = new MeshStandardMaterial({ color: 0xb5653f, roughness: 0.92 });
    const bushMat = new MeshStandardMaterial({ color: 0x416a3e, roughness: 1, flatShading: true });
    const bushGeo = new IcosahedronGeometry(1.2, 0);
    const bloomGeo = new IcosahedronGeometry(0.32, 0);
    const bloomMats = [0xffd45c, 0xff917d, 0xf0b6c2].map((c) => new MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
    const planters: Array<[number, number]> = [[44, 38], [58, 32], [63, 47], [-14, 44], [-27, 51]];
    for (let p = 0; p < planters.length; p++) {
      const [x, z] = planters[p];
      const pot = new Mesh(new CylinderGeometry(0.9, 0.65, 1.2, 8), potMat);
      pot.position.set(x, 0.62, z);
      pot.castShadow = true;
      const shrub = new Mesh(bushGeo, bushMat);
      shrub.position.set(x, 1.7, z);
      shrub.scale.set(0.75, 0.72, 0.75);
      shrub.castShadow = true;
      this.decorations.add(pot, shrub);
      for (let i = 0; i < 3; i++) {
        const bloom = new Mesh(bloomGeo, bloomMats[(p + i) % bloomMats.length]);
        bloom.position.set(x + Math.cos(i * 2.1) * 0.7, 2.1 + (i % 2) * 0.2, z + Math.sin(i * 2.1) * 0.7);
        this.decorations.add(bloom);
      }
      this.addContactShadow(x, 0.04, z, 1.8, 0.28);
    }

    const bedSoil = new MeshStandardMaterial({ color: 0x4a3220, roughness: 1 });
    const stemGeo = new CylinderGeometry(0.045, 0.06, 1, 4);
    const bedBloomGeo = new IcosahedronGeometry(0.24, 0);
    const bedFlowerMats = [0xffd45c, 0xff917d, 0xf0b6c2, 0xe8b5ff, 0x86e5ff];
    const flowerRng = seeded(812);
    const beds: Array<[number, number]> = [[-24, 38.4], [0, 38.4], [24, 38.4], [47, 26], [42, -2]];
    const stemCount = beds.length * 11;
    const stems = new InstancedMesh(stemGeo, new MeshStandardMaterial({ color: 0x4b702f, roughness: 0.9 }), stemCount);
    const blooms = new InstancedMesh(bedBloomGeo, new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, flatShading: true }), stemCount);
    const stemMatrix = new Matrix4();
    const bloomMatrix = new Matrix4();
    const color = new Color();
    let flowerIndex = 0;
    for (let b = 0; b < beds.length; b++) {
      const [bx, bz] = beds[b];
      const soil = new Mesh(new BoxGeometry(7.4, 0.28, 1.4), bedSoil);
      soil.position.set(bx, 0.15, bz);
      soil.receiveShadow = true;
      this.decorations.add(soil);
      for (let i = 0; i < 11; i++) {
        const x = bx - 3.2 + (i / 10) * 6.4 + (flowerRng() - 0.5) * 0.35;
        const z = bz + (flowerRng() - 0.5) * 0.75;
        const h = 0.55 + flowerRng() * 0.65;
        stemMatrix.makeScale(1, h, 1).setPosition(x, 0.3 + h * 0.5, z);
        stems.setMatrixAt(flowerIndex, stemMatrix);
        const bloomScale = 0.75 + flowerRng() * 0.55;
        bloomMatrix.makeScale(bloomScale, bloomScale, bloomScale).setPosition(x, 0.34 + h, z);
        blooms.setMatrixAt(flowerIndex, bloomMatrix);
        blooms.setColorAt(flowerIndex, color.setHex(bedFlowerMats[(i + b) % bedFlowerMats.length]));
        flowerIndex++;
      }
    }
    stems.instanceMatrix.needsUpdate = true;
    blooms.instanceMatrix.needsUpdate = true;
    if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
    this.decorations.add(stems, blooms);
  }

  private buildGardenLife(): void {
    const rng = seeded(271);
    const colors = [0xffd45c, 0xff917d, 0x86e5ff, 0xf0b6c2, 0xa7e37a, 0xe8b5ff];
    const wingGeo = new BoxGeometry(0.56, 0.045, 0.34);
    const bodyGeo = new BoxGeometry(0.1, 0.07, 0.46);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const base = new Vector3(side * (49 + rng() * 5), 2.4 + rng() * 1.8, -20 + rng() * 70);
      const group = new Group();
      const mat = new MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8 });
      const left = new Mesh(wingGeo, mat);
      left.position.x = -0.28;
      const right = new Mesh(wingGeo, mat);
      right.position.x = 0.28;
      const body = new Mesh(bodyGeo, new MeshStandardMaterial({ color: 0x2f2a22, roughness: 0.9 }));
      group.add(left, right, body);
      group.position.copy(base);
      group.rotation.y = rng() * Math.PI * 2;
      group.scale.setScalar(0.7 + rng() * 0.35);
      this.decorations.add(group);
      this.butterflies.push({ group, left, right, base, phase: rng() * Math.PI * 2 });
    }

    const bird = new Group();
    const birdMat = new MeshStandardMaterial({ color: 0x33414f, roughness: 0.9, flatShading: true });
    const birdBody = new BoxGeometry(0.8, 0.12, 0.24);
    const birdWing = new BoxGeometry(1.05, 0.05, 0.3);
    for (let i = 0; i < 7; i++) {
      const b = new Group();
      const body = new Mesh(birdBody, birdMat);
      const left = new Mesh(birdWing, birdMat);
      left.position.x = -0.5;
      left.rotation.z = 0.28;
      const right = new Mesh(birdWing, birdMat);
      right.position.x = 0.5;
      right.rotation.z = -0.28;
      b.add(body, left, right);
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 === 0 ? 1 : -1;
      b.position.set(side * row * 2.3, (i === 0 ? 0 : -Math.abs(side) * row * 0.8), -row * 2.2);
      b.scale.setScalar(0.9);
      bird.add(b);
      this.birdWings.push(left, right);
    }
    bird.position.set(0, 56, 76);
    this.birdFlock = bird;
    this.decorations.add(bird);

    const kite = new Group();
    const kiteCloth = new MeshStandardMaterial({ color: 0xe25b4a, roughness: 0.9, side: DoubleSide });
    const kiteDiamond = new Mesh(new PlaneGeometry(2.6, 2.6), kiteCloth);
    kiteDiamond.rotation.z = Math.PI / 4;
    kite.add(kiteDiamond);
    const spineMat = new MeshStandardMaterial({ color: 0xf4e6c8, roughness: 0.8 });
    const spine = new Mesh(new BoxGeometry(0.08, 3.4, 0.08), spineMat);
    kite.add(spine);
    const spar = new Mesh(new BoxGeometry(3.3, 0.08, 0.08), spineMat);
    kite.add(spar);
    for (let i = 0; i < 4; i++) {
      const tail = new Mesh(new ConeGeometry(0.22 - i * 0.03, 0.5, 4), new MeshBasicMaterial({ color: i % 2 === 0 ? 0xffd45c : 0xff8a74 }));
      tail.position.set(Math.sin(i * 1.1) * 0.25, -2.2 - i * 0.5, 0);
      kite.add(tail);
    }
    kite.position.set(21, 27, 56);
    this.kite = kite;
    this.decorations.add(kite);
    const lineGeo = new BufferGeometry().setFromPoints([this.kiteAnchor, new Vector3(21, 27, 56)]);
    this.kiteString = new Line(lineGeo, new LineBasicMaterial({ color: 0xf1e2c4, transparent: true, opacity: 0.45 }));
    this.decorations.add(this.kiteString);

    const gnome = new Group();
    const gnomeBase = new Mesh(new CylinderGeometry(1.05, 1.25, 2.7, 7), new MeshStandardMaterial({ color: 0x4d6c8e, roughness: 0.9 }));
    gnomeBase.position.y = 1.35;
    const gnomeHead = new Mesh(new IcosahedronGeometry(0.72, 1), new MeshStandardMaterial({ color: 0xe6b08d, roughness: 0.9 }));
    gnomeHead.position.y = 3.1;
    const hat = new Mesh(new ConeGeometry(0.8, 1.8, 7), new MeshStandardMaterial({ color: 0xc94c3c, roughness: 0.85 }));
    hat.position.y = 4.25;
    const beard = new Mesh(new ConeGeometry(0.55, 1.05, 6), new MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.95 }));
    beard.rotation.x = Math.PI;
    beard.position.set(0, 2.62, 0.48);
    const boots = new Mesh(new BoxGeometry(1.25, 0.4, 1.7), new MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.95 }));
    boots.position.set(0, 0.24, 0.1);
    gnome.add(gnomeBase, gnomeHead, hat, beard, boots);
    gnome.position.set(57, 0.03, 18);
    gnome.rotation.y = -0.7;
    gnome.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.decorations.add(gnome);
    this.addContactShadow(57, 0.035, 18, 3.2, 0.34);
  }

  private buildClouds(): void {
    const cloudMat = new MeshStandardMaterial({ color: 0xf4f7fa, roughness: 1, flatShading: true });
    const geo = new IcosahedronGeometry(7, 1);
    const rng = seeded(7);
    for (let i = 0; i < 18; i++) {
      const cloud = new Group();
      const puffs = 4 + Math.floor(rng() * 6);
      for (let p = 0; p < puffs; p++) {
        const puff = new Mesh(geo, cloudMat);
        puff.position.set((rng() - 0.5) * 28, (rng() - 0.5) * 7, (rng() - 0.5) * 16);
        puff.scale.set(1.1 + rng() * 1.8, 0.55 + rng() * 0.65, 0.9 + rng() * 1.1);
        puff.rotation.set(rng() * 2, rng() * 2, rng() * 2);
        cloud.add(puff);
      }
      const a = rng() * Math.PI * 2;
      const r = 150 + rng() * 220;
      cloud.position.set(Math.cos(a) * r, 58 + rng() * 70, Math.sin(a) * r);
      cloud.rotation.y = rng() * Math.PI * 2;
      this.cloudGroup.add(cloud);
    }
  }

  private addContactShadow(x: number, y: number, z: number, radius: number, opacity: number): void {
    if (!this.contactShadowTexture) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
        grad.addColorStop(0, "rgba(30,20,12,.92)");
        grad.addColorStop(0.45, "rgba(30,20,12,.52)");
        grad.addColorStop(0.8, "rgba(30,20,12,.16)");
        grad.addColorStop(1, "rgba(30,20,12,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
      }
      this.contactShadowTexture = new CanvasTexture(canvas);
      this.contactShadowTexture.colorSpace = SRGBColorSpace;
    }
    const mat = new MeshBasicMaterial({
      map: this.contactShadowTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const shadow = new Mesh(new PlaneGeometry(radius * 2, radius * 2), mat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y, z);
    shadow.renderOrder = 1;
    this.decorations.add(shadow);
  }

  private buildAtmosphere(): void {
    this.buildLightShafts();
    this.buildSunPools();
    this.buildDust();
  }

  private buildLightShafts(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const v = ctx.createLinearGradient(0, 0, 0, 256);
      v.addColorStop(0, "rgba(255,244,214,.9)");
      v.addColorStop(0.55, "rgba(255,238,196,.38)");
      v.addColorStop(1, "rgba(255,232,180,0)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 128, 256);
      const h = ctx.createLinearGradient(0, 0, 128, 0);
      h.addColorStop(0, "rgba(0,0,0,0)");
      h.addColorStop(0.3, "rgba(255,255,255,1)");
      h.addColorStop(0.7, "rgba(255,255,255,1)");
      h.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = h;
      ctx.fillRect(0, 0, 128, 256);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
    });
    const group = new Group();
    const beams: Array<{ x: number; z: number; w: number; h: number; tilt: number }> = [
      { x: -27, z: -3, w: 15, h: 24, tilt: -0.16 },
      { x: -17, z: 3, w: 9, h: 22, tilt: 0.12 },
      { x: 31, z: 27, w: 8, h: 15, tilt: 0.2 },
    ];
    for (const beam of beams) {
      for (let i = 0; i < 3; i++) {
        const plane = new Mesh(new PlaneGeometry(beam.w, beam.h), mat);
        plane.position.set(beam.x, 10.4 + beam.h * 0.32, beam.z);
        plane.rotation.y = (i / 3) * Math.PI;
        plane.rotation.z = beam.tilt;
        plane.renderOrder = 2;
        group.add(plane);
      }
    }
    this.lightShafts = group;
    this.decorations.add(group);
  }

  private buildSunPools(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 64, 2, 128, 64, 120);
      grad.addColorStop(0, "rgba(255,241,205,.95)");
      grad.addColorStop(0.4, "rgba(255,235,190,.5)");
      grad.addColorStop(0.75, "rgba(255,226,170,.15)");
      grad.addColorStop(1, "rgba(255,226,170,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.075,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const pools: Array<{ x: number; y: number; z: number; w: number; h: number; rot: number }> = [
      { x: -23, y: 0.385, z: 1, w: 25, h: 13, rot: 0.3 },
      { x: -34, y: 0.385, z: 26, w: 12, h: 8, rot: -0.6 },
      { x: 22, y: 0.385, z: 31, w: 16, h: 9, rot: 0.9 },
      { x: 18, y: 0.045, z: 49, w: 22, h: 12, rot: -0.3 },
    ];
    for (const pool of pools) {
      const mesh = new Mesh(new PlaneGeometry(pool.w, pool.h), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = pool.rot;
      mesh.position.set(pool.x, pool.y, pool.z);
      mesh.renderOrder = 2;
      this.decorations.add(mesh);
    }
  }

  private buildDust(): void {    const count = 620;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const rng = seeded(404);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -45 + rng() * 90;
      positions[i * 3 + 1] = 1.2 + rng() * 19.5;
      positions[i * 3 + 2] = -34 + rng() * 68;
      sizes[i] = 0.1 + rng() * 0.3;
      phases[i] = rng() * Math.PI * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new BufferAttribute(phases, 1));
    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
    };
    const mat = new ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.11 + aPhase * 3.1) * 1.4;
          p.y += sin(uTime * 0.08 + aPhase * 5.7) * 0.8;
          p.z += cos(uTime * 0.09 + aPhase * 2.3) * 1.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(aSize * uPixelRatio * (360.0 / max(1.0, -mv.z)), 11.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
          vAlpha = 0.16 + 0.14 * sin(uTime * 1.4 + aPhase * 12.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float fade = smoothstep(0.5, 0.05, length(d));
          gl_FragColor = vec4(1.0, 0.94, 0.8, vAlpha * fade);
        }
      `,
    });
    const points = new Points(geo, mat);
    points.frustumCulled = false;
    this.dust = points;
    this.dustUniforms = uniforms;
    this.scene.add(points);
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    const shadows = quality !== "low";
    if (this.sun) {
      this.sun.castShadow = shadows;
      this.sun.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
    }
    for (const group of [this.group, this.decorations, this.furnitureGroup]) {
      group.traverse((obj) => {
        if (obj instanceof Mesh) {
          obj.castShadow = shadows;
          obj.receiveShadow = shadows;
        }
      });
    }
    for (let i = 0; i < this.lampLights.length; i++) {
      this.lampLights[i].visible = quality === "high" ? true : quality === "medium" ? i < 7 : i < 3;
    }
    this.cloudGroup.visible = quality !== "low";
    if (this.dust) this.dust.visible = quality !== "low";
    if (this.lightShafts) this.lightShafts.visible = quality !== "low";
    for (const butterfly of this.butterflies) butterfly.group.visible = quality !== "low";
    if (this.birdFlock) this.birdFlock.visible = quality !== "low";
  }

  update(dt: number, elapsed: number): void {
    this.time += dt;
    for (const f of this.flames) {
      const pulse = 0.72 + Math.sin(elapsed * 9 + f.phase) * 0.18 + Math.sin(elapsed * 22 + f.phase * 2) * 0.08;
      f.mesh.scale.set(0.8 + pulse * 0.28, pulse, 0.8 + pulse * 0.28);
    }
    if (this.fireLight) this.fireLight.intensity = 430 + Math.sin(elapsed * 11) * 75 + Math.sin(elapsed * 23) * 34;
    for (const mat of this.waterMaterials) mat.opacity = 0.68 + Math.sin(elapsed * 1.7) * 0.04;
    this.fountainJets.forEach((jet, i) => {
      jet.scale.y = 0.9 + Math.sin(elapsed * 2.2 + i) * 0.08;
      jet.rotation.y = elapsed * 0.2 + i;
    });
    this.cloudGroup.position.x = (elapsed * 0.7) % 40;
    if (this.dustUniforms) this.dustUniforms.uTime.value = elapsed;
    for (const butterfly of this.butterflies) {
      const t = elapsed + butterfly.phase;
      butterfly.group.position.set(
        butterfly.base.x + Math.sin(t * 0.9) * 1.8,
        butterfly.base.y + Math.sin(t * 1.7) * 0.35,
        butterfly.base.z + Math.cos(t * 0.7) * 1.5,
      );
      butterfly.group.rotation.y = t * 0.9;
      const flap = Math.sin(elapsed * 18 + butterfly.phase) * 0.9;
      butterfly.left.rotation.z = flap;
      butterfly.right.rotation.z = -flap;
    }
    if (this.birdFlock) {
      this.birdFlock.position.set(Math.sin(elapsed * 0.045) * 14, 52 + Math.sin(elapsed * 0.1) * 3, 68 + Math.cos(elapsed * 0.045) * 12);
      this.birdFlock.rotation.y = -elapsed * 0.045;
      for (let i = 0; i < this.birdWings.length; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        this.birdWings[i].rotation.z = side * (0.28 + Math.sin(elapsed * 5 + i * 0.6) * 0.32);
      }
    }
    if (this.kite) {
      const kx = 21 + Math.sin(elapsed * 0.3) * 2.2;
      const ky = 27 + Math.sin(elapsed * 0.72) * 1.4;
      const kz = 56 + Math.cos(elapsed * 0.24) * 1.5;
      this.kite.position.set(kx, ky, kz);
      this.kite.rotation.z = Math.sin(elapsed * 0.45) * 0.16;
      this.kite.rotation.y = elapsed * 0.11;
      if (this.kiteString) {
        const attr = this.kiteString.geometry.getAttribute("position") as BufferAttribute;
        attr.setXYZ(0, this.kiteAnchor.x, this.kiteAnchor.y, this.kiteAnchor.z);
        attr.setXYZ(1, kx, ky - 1.8, kz);
        attr.needsUpdate = true;
      }
    }
    for (let i = 0; i < this.chimneySmoke.length; i++) {
      const sprite = this.chimneySmoke[i];
      const t = (elapsed * 0.11 + i / this.chimneySmoke.length) % 1;
      const scale = 1.4 + t * 6;
      sprite.position.set(-44 + Math.sin(t * 5.2 + i) * 1.8 + t * 4, 33 + t * 12, Math.cos(t * 3.4 + i) * 1.6 + t * 3);
      sprite.scale.set(scale, scale, 1);
      const mat = sprite.material as SpriteMaterial;
      mat.opacity = (t < 0.12 ? t / 0.12 : 1) * (1 - t) * 0.32;
    }
  }

  setShadows(enabled: boolean): void {
    for (const mesh of this.shadowMeshes) mesh.castShadow = enabled;
  }
}

import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
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
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AssetStore } from "./AssetStore";
import type { Quality } from "../../shared/config";
import { WORLD } from "../../shared/config";
import { FURNITURE, STATIC_BOXES, TREES, WALL_SPECS, type BoxMaterial, type StaticBox } from "../../shared/worldLayout";

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
    for (let i = 0; i < 300; i++) {
      const c = rng() > 0.5 ? "rgba(255,246,223,.16)" : "rgba(137,101,63,.07)";
      ctx.fillStyle = c;
      ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 2, 2);
    }
  }, 5, 3, false);
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
  const stoneMap = stoneTexture();
  const roofMap = roofTexture();
  materialsStore.wall = new MeshStandardMaterial({ color: 0xf1e1c9, roughness: 0.94, map: wallMap });
  materialsStore.exterior = new MeshStandardMaterial({ color: 0xd7b58f, roughness: 0.96, map: wallMap });
  materialsStore.trim = new MeshStandardMaterial({ color: 0x6a472e, roughness: 0.8 });
  materialsStore.floor = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: woodMap });
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
  private sun?: DirectionalLight;
  private shadowMeshes: Object3D[] = [];
  private waterMaterials: MeshStandardMaterial[] = [];
  private fountainJets: Mesh[] = [];
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
    this.buildGarden();
    this.buildClouds();
    this.buildDecor();
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
          gl_FragColor = vec4(col, 1.0);
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

    const floorPlane = new Mesh(new PlaneGeometry(95, 71), new MeshStandardMaterial({ color: 0xffffff, map: woodTexture(), roughness: 0.84 }));
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(0, 0.36, 0);
    floorPlane.receiveShadow = true;
    g.add(floorPlane);

    const upperMat = new MeshStandardMaterial({ color: 0xffffff, map: woodTexture(), roughness: 0.84 });
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
    return g;
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
    this.fireLight = new PointLight(0xff8a3d, 600, 35, 1.65);
    this.fireLight.position.set(-43.2, 3.1, 0);
    group.add(this.fireLight);
    this.decorations.add(group);
  }

  private buildLighting(): void {
    const hemi = new HemisphereLight(0xd8ecff, 0x9f8459, 1.9);
    this.scene.add(hemi);
    const ambient = new AmbientLight(0xfff4e5, 0.92);
    this.scene.add(ambient);
    const sun = new DirectionalLight(0xfff2d2, 2.7);
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
      const candle = new Mesh(new CylinderGeometry(0.18, 0.18, 1.1, 5), new MeshStandardMaterial({ color: 0xf0d8a7, emissive: 0xffc37a, emissiveIntensity: 0.5 }));
      const a = (i / 8) * Math.PI * 2;
      candle.position.set(Math.cos(a) * 2.65, 0.35, Math.sin(a) * 2.65);
      chandelier.add(candle);
    }
    chandelier.position.set(-25, 17.2, 4);
    this.decorations.add(chandelier);
    const warm = new PointLight(0xffcb8f, 950, 54, 1.65);
    warm.position.set(-25, 16.2, 4);
    this.lampLights.push(warm);
    this.scene.add(warm);

    const kitchenLight = new PointLight(0xffe3b2, 680, 40, 1.6);
    kitchenLight.position.set(18, 8, -24);
    this.lampLights.push(kitchenLight);
    this.scene.add(kitchenLight);

    const upperLight = new PointLight(0xffd9a0, 560, 42, 1.6);
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
    }
  }

  private buildGarden(): void {
    const stoneMat = materialsStore.stone ?? new MeshStandardMaterial({ color: 0xa8957f });
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
    const candleMat = new MeshStandardMaterial({ color: 0xf1d8a2, emissive: 0xffb85c, emissiveIntensity: 0.4 });
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

  private buildClouds(): void {
    const cloudMat = new MeshStandardMaterial({ color: 0xf4f7fa, roughness: 1, flatShading: true });
    const geo = new IcosahedronGeometry(7, 1);
    const rng = seeded(7);
    for (let i = 0; i < 20; i++) {
      const cloud = new Group();
      const puffs = 3 + Math.floor(rng() * 4);
      for (let p = 0; p < puffs; p++) {
        const puff = new Mesh(geo, cloudMat);
        puff.position.set((rng() - 0.5) * 20, (rng() - 0.5) * 3, (rng() - 0.5) * 10);
        puff.scale.set(1.5 + rng() * 1.7, 0.5 + rng() * 0.4, 0.8 + rng() * 0.5);
        cloud.add(puff);
      }
      const a = rng() * Math.PI * 2;
      const r = 170 + rng() * 180;
      cloud.position.set(Math.cos(a) * r, 65 + rng() * 55, Math.sin(a) * r);
      this.cloudGroup.add(cloud);
    }
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
  }

  update(dt: number, elapsed: number): void {
    this.time += dt;
    for (const f of this.flames) {
      const pulse = 0.72 + Math.sin(elapsed * 9 + f.phase) * 0.18 + Math.sin(elapsed * 22 + f.phase * 2) * 0.08;
      f.mesh.scale.set(0.8 + pulse * 0.28, pulse, 0.8 + pulse * 0.28);
    }
    if (this.fireLight) this.fireLight.intensity = 560 + Math.sin(elapsed * 11) * 90 + Math.sin(elapsed * 23) * 40;
    for (const mat of this.waterMaterials) mat.opacity = 0.68 + Math.sin(elapsed * 1.7) * 0.04;
    this.fountainJets.forEach((jet, i) => {
      jet.scale.y = 0.9 + Math.sin(elapsed * 2.2 + i) * 0.08;
      jet.rotation.y = elapsed * 0.2 + i;
    });
    this.cloudGroup.position.x = (elapsed * 0.7) % 40;
  }

  setShadows(enabled: boolean): void {
    for (const mesh of this.shadowMeshes) mesh.castShadow = enabled;
  }
}

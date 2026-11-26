import type { Material } from "three";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Euler,
  PointLight,
  Points,
  Quaternion,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { Quality } from "../../shared/config";
import type { PhysicsWorld } from "./PhysicsWorld";
import { ExplosionDebris } from "./AircraftView";

function disposeMaterial(mat: Material | Material[]): void {
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
}

function dotTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,.92)");
    grad.addColorStop(0.75, "rgba(255,255,255,.3)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  return t;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  sizeGrow: number;
  drag: number;
  gravity: number;
  r: number;
  g: number;
  b: number;
  a: number;
  active: boolean;
}

class PointsPool {
  points: import("three").Points;
  private geo = new BufferGeometry();
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: Particle[];
  private max: number;
  private writeIndex = 0;

  constructor(scene: Scene, max: number, additive: boolean) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 4);
    this.sizes = new Float32Array(max);
    this.particles = Array.from({ length: max }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1,
      size: 1, sizeGrow: 0, drag: 1, gravity: 0, r: 1, g: 1, b: 1, a: 1, active: false,
    }));
    this.geo.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geo.setAttribute("aColor", new BufferAttribute(this.colors, 4));
    this.geo.setAttribute("aSize", new BufferAttribute(this.sizes, 1));
    this.geo.setDrawRange(0, 0);
    const mat = new ShaderMaterial({
      uniforms: { map: { value: dotTexture() } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      vertexShader: `
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec4 vColor;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a * tex.a);
          if (gl_FragColor.a < 0.01) discard;
        }
      `,
    });
    this.points = new Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p: Partial<Particle>): void {
    const particle = this.particles[this.writeIndex];
    this.writeIndex = (this.writeIndex + 1) % this.max;
    particle.x = p.x ?? 0;
    particle.y = p.y ?? 0;
    particle.z = p.z ?? 0;
    particle.vx = p.vx ?? 0;
    particle.vy = p.vy ?? 0;
    particle.vz = p.vz ?? 0;
    particle.life = p.life ?? 1;
    particle.maxLife = p.maxLife ?? particle.life;
    particle.size = p.size ?? 1;
    particle.sizeGrow = p.sizeGrow ?? 0;
    particle.drag = p.drag ?? 1;
    particle.gravity = p.gravity ?? 0;
    particle.r = p.r ?? 1;
    particle.g = p.g ?? 1;
    particle.b = p.b ?? 1;
    particle.a = p.a ?? 1;
    particle.active = true;
  }

  update(dt: number): void {
    let count = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.sizeGrow * dt;
      const t = p.life / p.maxLife;
      const alpha = p.a * Math.min(1, t * 2.2);
      this.positions[count * 3] = p.x;
      this.positions[count * 3 + 1] = p.y;
      this.positions[count * 3 + 2] = p.z;
      this.colors[count * 4] = p.r;
      this.colors[count * 4 + 1] = p.g;
      this.colors[count * 4 + 2] = p.b;
      this.colors[count * 4 + 3] = alpha;
      this.sizes[count] = p.size;
      count++;
    }
    (this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aColor") as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("aSize") as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }
}

interface Tracer {
  from: Vector3;
  to: Vector3;
  life: number;
  maxLife: number;
  color: Color;
}

interface Blast {
  fire: Mesh;
  ring: Mesh;
  life: number;
  maxLife: number;
  baseScale: number;
}

export class Effects {
  private scene: Scene;
  private fire: PointsPool;
  private smoke: PointsPool;
  private tracers: Tracer[] = [];
  private tracerGeo = new BufferGeometry();
  private tracerPositions: Float32Array;
  private tracerColors: Float32Array;
  private tracerMesh: LineSegments;
  private blasts: Blast[] = [];
  private blastGroup = new Group();
  private blastLight: PointLight;
  private debris: ExplosionDebris[] = [];
  private quality: Quality;
  private debrisGeo = new SphereGeometry(1, 4, 3);
  private explosionFireGeo = new SphereGeometry(1, 8, 6);
  private ringGeo = new RingGeometry(0.5, 1, 18);
  private maxDebris = 22;
  tracersEnabled = true;

  constructor(scene: Scene, quality: Quality) {
    this.scene = scene;
    this.quality = quality;
    const maxParticles = quality === "low" ? 140 : quality === "medium" ? 260 : 420;
    this.fire = new PointsPool(scene, maxParticles, true);
    this.smoke = new PointsPool(scene, Math.floor(maxParticles * 0.75), false);
    this.tracerPositions = new Float32Array(320 * 6);
    this.tracerColors = new Float32Array(320 * 6);
    this.tracerGeo.setAttribute("position", new BufferAttribute(this.tracerPositions, 3));
    this.tracerGeo.setAttribute("color", new BufferAttribute(this.tracerColors, 3));
    this.tracerGeo.setDrawRange(0, 0);
    this.tracerMesh = new LineSegments(this.tracerGeo, new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    this.tracerMesh.frustumCulled = false;
    scene.add(this.tracerMesh);
    scene.add(this.blastGroup);
    this.blastLight = new PointLight(0xff9c4d, 0, 55, 2);
    scene.add(this.blastLight);
    for (let i = 0; i < 14; i++) {
      const fire = new Mesh(this.explosionFireGeo, new MeshBasicMaterial({
        color: 0xffa33d,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }));
      const ring = new Mesh(this.ringGeo, new MeshBasicMaterial({
        color: new Color(0xffe6ad).multiplyScalar(2.2),
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      }));
      fire.visible = false;
      ring.visible = false;
      this.blastGroup.add(fire, ring);
      this.blasts.push({ fire, ring, life: 0, maxLife: 1, baseScale: 1 });
    }
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.maxDebris = quality === "low" ? 0 : quality === "medium" ? 12 : 22;
  }

  spawnTracer(from: Vector3, to: Vector3, color = 0xffdf8a, life = 0.075): void {
    if (!this.tracersEnabled) return;
    if (this.tracers.length > 318) this.tracers.shift();
    const bright = new Color(color).multiplyScalar(2.4);
    this.tracers.push({ from: from.clone(), to: to.clone(), life, maxLife: life, color: bright });
  }

  muzzle(position: Vector3, dir: Vector3, color = 0xffd980): void {
    for (let i = 0; i < (this.quality === "low" ? 2 : 4); i++) {
      this.fire.spawn({
        x: position.x, y: position.y, z: position.z,
        vx: dir.x * (14 + Math.random() * 10) + (Math.random() - 0.5) * 8,
        vy: dir.y * (14 + Math.random() * 10) + (Math.random() - 0.5) * 8,
        vz: dir.z * (14 + Math.random() * 10) + (Math.random() - 0.5) * 8,
        life: 0.07 + Math.random() * 0.07,
        size: 0.2 + Math.random() * 0.1,
        drag: 0.86,
        r: 2.6, g: 1.7, b: 0.55, a: 0.9,
      });
    }
    void color;
  }

  impact(position: Vector3, normal: Vector3, color = 0xffcf78): void {
    for (let i = 0; i < (this.quality === "low" ? 4 : 9); i++) {
      const dir = normal.clone().multiplyScalar(0.7).add(new Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(0.8)).normalize();
      this.fire.spawn({
        x: position.x, y: position.y, z: position.z,
        vx: dir.x * (5 + Math.random() * 14),
        vy: dir.y * (5 + Math.random() * 14),
        vz: dir.z * (5 + Math.random() * 14),
        life: 0.18 + Math.random() * 0.25,
        size: 0.22 + Math.random() * 0.25,
        gravity: -8,
        drag: 0.98,
        r: 1, g: 0.75, b: 0.33, a: 1,
      });
    }
    this.smoke.spawn({
      x: position.x, y: position.y, z: position.z,
      vx: normal.x * 0.8, vy: 0.6, vz: normal.z * 0.8,
      life: 0.5, size: 1.1, sizeGrow: 2.4, drag: 0.97,
      r: 0.7, g: 0.68, b: 0.6, a: 0.4,
    });
    void color;
  }

  hitSpark(position: Vector3, teamColor: number): void {
    const c = new Color(teamColor);
    for (let i = 0; i < 8; i++) {
      this.fire.spawn({
        x: position.x, y: position.y, z: position.z,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        vz: (Math.random() - 0.5) * 16,
        life: 0.16 + Math.random() * 0.2,
        size: 0.25,
        drag: 0.95,
        r: 3.2, g: 2.4, b: 1.2, a: 1,
      });
    }
    this.smoke.spawn({ x: position.x, y: position.y, z: position.z, life: 0.35, size: 0.8, sizeGrow: 1.5, r: c.r, g: c.g, b: c.b, a: 0.4 });
  }

  smokeTrail(position: Vector3, direction: Vector3, dark = false, scale = 1): void {
    if (this.quality === "low" && Math.random() > 0.45) return;
    const gray = dark ? 0.18 : 0.56;
    this.smoke.spawn({
      x: position.x + (Math.random() - 0.5) * 0.3,
      y: position.y + (Math.random() - 0.5) * 0.3,
      z: position.z + (Math.random() - 0.5) * 0.3,
      vx: -direction.x * 2 + (Math.random() - 0.5) * 1.2,
      vy: -direction.y * 2 + 0.8,
      vz: -direction.z * 2 + (Math.random() - 0.5) * 1.2,
      life: 0.7 + Math.random() * 0.5,
      size: (1.4 + Math.random() * 1.0) * scale,
      sizeGrow: 2.2,
      drag: 0.96,
      r: gray, g: gray, b: gray, a: dark ? 0.55 : 0.28,
    });
  }

  damageFlame(position: Vector3, direction: Vector3): void {
    this.fire.spawn({
      x: position.x + (Math.random() - 0.5) * 0.24,
      y: position.y + (Math.random() - 0.5) * 0.24,
      z: position.z + (Math.random() - 0.5) * 0.24,
      vx: -direction.x * 4 + (Math.random() - 0.5) * 1.4,
      vy: -direction.y * 4 + 0.6 + Math.random() * 1.2,
      vz: -direction.z * 4 + (Math.random() - 0.5) * 1.4,
      life: 0.18 + Math.random() * 0.16,
      size: 0.5 + Math.random() * 0.35,
      sizeGrow: 1.6,
      drag: 0.9,
      r: 2.8, g: 1.1, b: 0.16, a: 0.9,
    });
    this.smoke.spawn({
      x: position.x, y: position.y, z: position.z,
      vx: -direction.x * 1.8 + (Math.random() - 0.5) * 0.6,
      vy: 0.7 + Math.random() * 0.9,
      vz: -direction.z * 1.8 + (Math.random() - 0.5) * 0.6,
      life: 0.8 + Math.random() * 0.6,
      size: 1.2,
      sizeGrow: 2.6,
      drag: 0.95,
      r: 0.1, g: 0.09, b: 0.08, a: 0.55,
    });
  }

  boostTrail(position: Vector3, direction: Vector3, color: number): void {
    const c = new Color(color);
    this.fire.spawn({
      x: position.x, y: position.y, z: position.z,
      vx: -direction.x * 3 + (Math.random() - 0.5) * 0.6,
      vy: -direction.y * 3 + (Math.random() - 0.5) * 0.6,
      vz: -direction.z * 3 + (Math.random() - 0.5) * 0.6,
      life: 0.25,
      size: 0.5,
      sizeGrow: 1.2,
      drag: 0.95,
      r: Math.min(3, c.r * 2.4 + 0.6), g: Math.min(3, c.g * 2.2 + 0.45), b: Math.min(3, c.b * 2 + 0.4), a: 0.6,
    });
  }

  explosion(position: Vector3, scale = 1, teamColor = 0xffa53d): void {
    let blast = this.blasts.find((b) => b.life <= 0);
    if (!blast) blast = this.blasts.reduce((a, b) => (a.life < b.life ? a : b));
    blast.life = blast.maxLife = 1.15;
    blast.baseScale = 3 * scale;
    blast.fire.position.copy(position);
    blast.ring.position.copy(position);
    blast.fire.visible = true;
    blast.ring.visible = true;
    const previous = blast.fire.material;
    if (previous instanceof MeshBasicMaterial) previous.dispose();
    blast.fire.material = new MeshBasicMaterial({
      color: new Color(teamColor).multiplyScalar(2.4),
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    blast.ring.quaternion.copy(new Quaternion().setFromEuler(new Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)));
    this.blastLight.position.copy(position).add(new Vector3(0, 1, 0));
    this.blastLight.intensity = 1100 * scale;
    const fireCount = this.quality === "low" ? 12 : this.quality === "medium" ? 22 : 34;
    for (let i = 0; i < fireCount; i++) {
      const dir = new Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const speed = (8 + Math.random() * 20) * scale;
      this.fire.spawn({
        x: position.x, y: position.y, z: position.z,
        vx: dir.x * speed, vy: dir.y * speed + 4, vz: dir.z * speed,
        life: 0.35 + Math.random() * 0.55,
        size: (0.8 + Math.random() * 1.7) * scale,
        sizeGrow: 2.2 * scale,
        drag: 0.9,
        gravity: 2,
        r: 3.0, g: 1.5 + Math.random() * 1.1, b: 0.35, a: 1,
      });
    }
    const smokeCount = this.quality === "low" ? 8 : 18;
    for (let i = 0; i < smokeCount; i++) {
      this.smoke.spawn({
        x: position.x + (Math.random() - 0.5) * 3,
        y: position.y + (Math.random() - 0.5) * 3,
        z: position.z + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 5,
        vy: 1 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 5,
        life: 1.2 + Math.random() * 1.1,
        size: (2 + Math.random() * 3) * scale,
        sizeGrow: 3.2,
        drag: 0.93,
        r: 0.17, g: 0.16, b: 0.15, a: 0.55,
      });
    }
  }

  spawnDebris(position: Vector3, physics: PhysicsWorld, scale = 1, color = 0x5e6b48): void {
    if (this.maxDebris <= 0) return;
    const count = this.quality === "high" ? 7 : 4;
    for (let i = 0; i < count; i++) {
      if (this.debris.length >= this.maxDebris) {
        const old = this.debris.shift();
        if (old) {
          this.scene.remove(old.mesh);
          disposeMaterial(old.mesh.material);
          physics.removeDebris(old.body);
        }
      }
      const half = (0.15 + Math.random() * 0.3) * scale;
      const impulse = new Vector3((Math.random() - 0.5) * 24, 4 + Math.random() * 16, (Math.random() - 0.5) * 24);
      const angular = new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      const body = physics.spawnDebris(position.clone().add(new Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5)), impulse, half, angular);
      const mat = new MeshBasicMaterial({ color: Math.random() > 0.4 ? color : 0x23261e });
      const mesh = new Mesh(this.debrisGeo, mat);
      mesh.scale.setScalar(half);
      mesh.castShadow = this.quality === "high";
      this.scene.add(mesh);
      this.debris.push(new ExplosionDebris(body, mesh, half, 4 + Math.random() * 2));
    }
  }

  update(dt: number, physics?: PhysicsWorld): void {
    this.fire.update(dt);
    this.smoke.update(dt);
    let ti = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.tracers.splice(i, 1);
        continue;
      }
      const alpha = t.life / t.maxLife;
      if (ti < 318) {
        this.tracerPositions[ti * 6] = t.from.x;
        this.tracerPositions[ti * 6 + 1] = t.from.y;
        this.tracerPositions[ti * 6 + 2] = t.from.z;
        this.tracerPositions[ti * 6 + 3] = t.to.x;
        this.tracerPositions[ti * 6 + 4] = t.to.y;
        this.tracerPositions[ti * 6 + 5] = t.to.z;
        this.tracerColors[ti * 6] = t.color.r * alpha;
        this.tracerColors[ti * 6 + 1] = t.color.g * alpha;
        this.tracerColors[ti * 6 + 2] = t.color.b * alpha;
        this.tracerColors[ti * 6 + 3] = t.color.r * alpha;
        this.tracerColors[ti * 6 + 4] = t.color.g * alpha;
        this.tracerColors[ti * 6 + 5] = t.color.b * alpha;
        ti++;
      }
    }
    (this.tracerGeo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.tracerGeo.getAttribute("color") as BufferAttribute).needsUpdate = true;
    this.tracerGeo.setDrawRange(0, ti * 2);

    for (const blast of this.blasts) {
      if (blast.life <= 0) continue;
      blast.life -= dt;
      if (blast.life <= 0) {
        blast.fire.visible = false;
        blast.ring.visible = false;
        const fm = blast.fire.material;
        if (fm instanceof MeshBasicMaterial) fm.dispose();
        continue;
      }
      const t = 1 - blast.life / blast.maxLife;
      blast.fire.scale.setScalar(blast.baseScale * (0.35 + t * 1.3));
      const fm = blast.fire.material as MeshBasicMaterial;
      fm.opacity = (1 - t) * 0.9;
      const ringScale = blast.baseScale * (0.5 + t * 2.8);
      blast.ring.scale.setScalar(ringScale);
      const rm = blast.ring.material as MeshBasicMaterial;
      rm.opacity = (1 - t) * 0.8;
    }
    this.blastLight.intensity *= Math.pow(0.02, dt * 2);

    if (physics) {
      for (let i = this.debris.length - 1; i >= 0; i--) {
        const d = this.debris[i];
        d.life -= dt;
        if (d.life <= 0) {
          this.scene.remove(d.mesh);
          disposeMaterial(d.mesh.material);
          physics.removeDebris(d.body);
          this.debris.splice(i, 1);
          continue;
        }
        d.update();
        const mat = d.mesh.material as MeshBasicMaterial;
        if (d.life < 1.2) mat.opacity = d.life / 1.2;
      }
    }
  }

  reset(physics?: PhysicsWorld): void {
    this.tracers.length = 0;
    for (const blast of this.blasts) {
      blast.life = 0;
      blast.fire.visible = false;
      blast.ring.visible = false;
      const fm = blast.fire.material;
      if (fm instanceof MeshBasicMaterial) fm.dispose();
    }
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
      disposeMaterial(d.mesh.material);
      physics?.removeDebris(d.body);
    }
    this.debris.length = 0;
    this.blastLight.intensity = 0;
  }
}

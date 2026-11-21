import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import type { AssetStore } from "./AssetStore";
import type { AircraftDef, Team } from "../../shared/config";
import { TEAM_INFO } from "../../shared/config";
import type { PlaneRuntime } from "../../shared/types";
import type { DebrisBody } from "./PhysicsWorld";

export class AircraftView {
  group = new Group();
  private model: Object3D;
  private propeller: Object3D | null;
  private flames: Mesh[] = [];
  muzzleLocal: [Vector3, Vector3];
  exhaustLocal = new Vector3(0, 0.08, 0.9);
  visibleInCockpit = false;

  constructor(assets: AssetStore, def: AircraftDef, team: Team, shadows: boolean) {
    const model = assets.createAircraft(def.id, shadows);
    this.model = model ?? new Group();
    this.group.add(this.model);
    this.propeller = (this.model.userData.propeller as Object3D | undefined) ?? null;
    this.muzzleLocal = [new Vector3(-0.54, 0.06, -0.35), new Vector3(0.54, 0.06, -0.35)];

    const teamColor = TEAM_INFO[team].color;
    const accent = new MeshBasicMaterial({ color: teamColor });
    const stripe = new Mesh(new BoxGeometry(0.3, 0.06, 0.12), accent);
    stripe.position.set(0, 0.37, 0.92);
    this.group.add(stripe);
    const navRed = new Mesh(new BoxGeometry(0.08, 0.05, 0.08), new MeshBasicMaterial({ color: 0xff4838 }));
    navRed.position.set(-1.02, 0.02, 0.02);
    this.group.add(navRed);
    const navGreen = new Mesh(new BoxGeometry(0.08, 0.05, 0.08), new MeshBasicMaterial({ color: 0x49ff85 }));
    navGreen.position.set(1.02, 0.02, 0.02);
    this.group.add(navGreen);

    const flameMat = new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, blending: 2 });
    for (const x of [-0.28, 0.28]) {
      const flame = new Mesh(new ConeGeometry(0.11, 0.9, 5), flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(x, 0.02, 0.9);
      flame.visible = false;
      this.flames.push(flame);
      this.group.add(flame);
    }
  }

  sync(runtime: PlaneRuntime, dt: number, boost: boolean): void {
    const f = runtime.flight;
    this.group.position.set(f.x, f.y, f.z);
    this.group.quaternion.set(f.qx, f.qy, f.qz, f.qw);
    this.group.visible = runtime.alive;
    if (this.propeller) this.propeller.rotation.z += (8 + f.speed * 1.8) * dt;
    for (let i = 0; i < this.flames.length; i++) {
      const flame = this.flames[i];
      flame.visible = boost && runtime.alive;
      flame.scale.set(0.8 + Math.sin(performance.now() * 0.03 + i) * 0.15, 0.8 + Math.random() * 0.4, 0.8);
    }
  }

  worldMuzzle(index: number, out = new Vector3()): Vector3 {
    out.copy(this.muzzleLocal[index % 2]);
    this.group.localToWorld(out);
    return out;
  }

  worldPosition(out = new Vector3()): Vector3 {
    return out.setFromMatrixPosition(this.group.matrixWorld);
  }

  worldDirection(out = new Vector3()): Vector3 {
    out.set(0, 0, -1);
    return out.applyQuaternion(this.group.quaternion).normalize();
  }

  worldExhaust(out = new Vector3()): Vector3 {
    out.copy(this.exhaustLocal);
    this.group.localToWorld(out);
    return out;
  }

  setCockpitHidden(hidden: boolean): void {
    this.model.visible = !hidden;
  }
}

export class ExplosionDebris {
  body: DebrisBody;
  mesh: Mesh;
  life: number;
  half: number;
  constructor(body: DebrisBody, mesh: Mesh, half: number, life: number) {
    this.body = body;
    this.mesh = mesh;
    this.half = half;
    this.life = life;
  }

  update(): void {
    const t = this.body.body.translation();
    const r = this.body.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3 } from "three";
import { STATIC_BOXES, type StaticBox } from "../../shared/worldLayout";
import { sphereSweepWorld } from "../../shared/collision";

export interface PlaneSweepResult {
  hit: boolean;
  position: Vector3;
  normal: Vector3;
  box?: StaticBox;
}

export interface DebrisBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

let initialized = false;

export class PhysicsWorld {
  world: RAPIER.World;
  boxes: StaticBox[];
  private ball: RAPIER.Ball;
  private identity = { x: 0, y: 0, z: 0, w: 1 };
  private debris: DebrisBody[] = [];
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });

  private constructor(boxes: StaticBox[]) {
    this.boxes = boxes;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.ball = new RAPIER.Ball(1);
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const b of boxes) {
      const desc = RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz)
        .setTranslation(b.cx, b.cy, b.cz)
        .setFriction(0.7)
        .setRestitution(0.2);
      this.world.createCollider(desc, groundBody);
    }
  }

  static async create(boxes: StaticBox[]): Promise<PhysicsWorld> {
    if (!initialized) {
      await RAPIER.init();
      initialized = true;
    }
    return new PhysicsWorld(boxes);
  }

  static get auditBoxCount(): number {
    return STATIC_BOXES.length;
  }

  planeSweep(from: Vector3, to: Vector3, radius: number): PlaneSweepResult {
    const delta = to.clone().sub(from);
    this.ball.radius = radius;
    let cast: RAPIER.ColliderShapeCastHit | null = null;
    try {
      cast = this.world.castShape(from, this.identity, delta, this.ball, 0, 1, true);
    } catch {
      cast = null;
    }
    if (cast) {
      const normal = new Vector3(cast.normal1.x, cast.normal1.y, cast.normal1.z);
      if (normal.lengthSq() < 0.01) normal.copy(delta).multiplyScalar(-1).normalize();
      const position = from.clone().addScaledVector(delta, Math.max(0, cast.time_of_impact - 0.002));
      return { hit: true, position, normal };
    }
    const fallback = sphereSweepWorld(from, delta, radius, this.boxes);
    return { hit: fallback.hit, position: fallback.position, normal: fallback.normal, box: fallback.box };
  }

  raycast(origin: Vector3, dir: Vector3, maxDistance: number): { distance: number; normal: Vector3 } | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(this.ray, maxDistance, true);
    if (!hit) return null;
    return { distance: hit.timeOfImpact, normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z) };
  }

  spawnDebris(position: Vector3, impulse: Vector3, half: number, angular: Vector3): DebrisBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.25)
        .setAngularDamping(0.45)
        .setCcdEnabled(true),
    );
    body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    body.setAngvel({ x: angular.x, y: angular.y, z: angular.z }, true);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.7).setRestitution(0.32).setDensity(0.3),
      body,
    );
    const d = { body, collider };
    this.debris.push(d);
    return d;
  }

  removeDebris(d: DebrisBody): void {
    const idx = this.debris.indexOf(d);
    if (idx >= 0) this.debris.splice(idx, 1);
    this.world.removeRigidBody(d.body);
  }

  step(dt: number): void {
    this.world.timestep = Math.min(1 / 30, Math.max(1 / 120, dt));
    this.world.step();
  }

  quaternionOf(body: RAPIER.RigidBody, out = new Quaternion()): Quaternion {
    const r = body.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }

  dispose(): void {
    this.world.free();
  }
}

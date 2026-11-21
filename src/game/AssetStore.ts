import { Box3, BufferAttribute, Color, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WORLD, getAircraft } from "../../shared/config";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

const FURNITURE_TINTS: Record<string, number> = {
  "sofa-9c0e7e": 0xb8c9d9,
  "lounge-armchair-5a72ca": 0xb87d5e,
  "area-rug-5c56e2": 0x779b8d,
  "curtain-panel-ee2ed9": 0x8d3f38,
  "low-media-unit-645e61": 0x6c5038,
  "sideboard-dd343b": 0x876342,
  "fridge-freezer-fb9b5a": 0xc4d1d7,
};

export const MODEL_IDS = [
  "single-engine-fighter-a6addf",
  "sofa-9c0e7e",
  "dining-table-7af83a",
  "dining-chair-530532",
  "alcove-bookcase-83894d",
  "bed-6e10e8",
  "broad-canopy-shade-tree-e7c4a2",
  "ornamental-front-yard-tree-c6781a",
  "floor-houseplant-8fad17",
  "kitchen-island-47f4c8",
  "coffee-table-acc698",
  "area-rug-5c56e2",
  "table-lamp-e25998",
  "lounge-armchair-5a72ca",
  "low-media-unit-645e61",
  "sideboard-dd343b",
  "fridge-freezer-fb9b5a",
  "framed-wall-art-d2c8a2",
  "curtain-panel-ee2ed9",
] as const;

const SOURCE_COLORS = {
  body: new Color(29 / 255, 37 / 255, 17 / 255),
  shadow: new Color(13 / 255, 17 / 255, 8 / 255),
  gold: new Color(121 / 255, 59 / 255, 7 / 255),
  cream: new Color(141 / 255, 119 / 255, 67 / 255),
};

function colorDistance(a: Color, b: Color): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function toLinear(hex: number): Color {
  return new Color(hex).convertSRGBToLinear();
}

export interface LoadedModel {
  id: string;
  scene: Object3D;
  bounds: Box3;
}

export class AssetStore {
  private models = new Map<string, LoadedModel>();
  private gltfs = new Map<string, GLTF>();
  private planeMaterials = new Map<string, MeshStandardMaterial>();

  get loadedCount(): number {
    return this.models.size;
  }

  async loadAll(onProgress?: (loaded: number, total: number, label: string) => void): Promise<void> {
    const loader = new GLTFLoader();
    let complete = 0;
    await Promise.all(
      MODEL_IDS.map(async (id) => {
        try {
          const gltf = await loader.loadAsync(`models/${id}.glb`);
          gltf.scene.updateMatrixWorld(true);
          this.gltfs.set(id, gltf);
          const bounds = new Box3().setFromObject(gltf.scene);
          this.models.set(id, { id, scene: gltf.scene, bounds });
        } catch (err) {
          console.error(`Could not load model ${id}`, err);
        } finally {
          complete++;
          onProgress?.(complete, MODEL_IDS.length, id);
        }
      }),
    );
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  clone(id: string, shadows = true): Object3D | null {
    const model = this.models.get(id);
    if (!model) return null;
    const copy = model.scene.clone(true);
    copy.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = shadows;
        child.receiveShadow = shadows;
        if (child.material instanceof MeshStandardMaterial) {
          child.material = child.material.clone();
          child.material.flatShading = true;
        }
      }
    });
    return copy;
  }

  createFurniture(id: string, shadows = true): Object3D | null {
    const obj = this.clone(id, shadows);
    const tint = FURNITURE_TINTS[id];
    if (obj && tint !== undefined) {
      obj.traverse((child) => {
        if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
          child.material.color.setHex(tint);
        }
      });
    }
    return obj;
  }

  createAircraft(aircraftId: string, shadows = true): Object3D | null {
    const base = this.models.get("single-engine-fighter-a6addf");
    if (!base) return null;
    const def = getAircraft(aircraftId);
    const model = base.scene.clone(true);
    const body = toLinear(def.bodyColor);
    const accent = toLinear(def.accentColor);
    const material = this.planeMaterial(aircraftId);
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const geometry = child.geometry.clone();
      const attr = geometry.getAttribute("color") as BufferAttribute | undefined;
      if (attr) {
        const colors = attr.array as Float32Array;
        const c = new Color();
        for (let i = 0; i < colors.length; i += 3) {
          c.setRGB(colors[i], colors[i + 1], colors[i + 2]);
          const dBody = colorDistance(c, SOURCE_COLORS.body);
          const dShadow = colorDistance(c, SOURCE_COLORS.shadow);
          const dGold = colorDistance(c, SOURCE_COLORS.gold);
          const dCream = colorDistance(c, SOURCE_COLORS.cream);
          const best = Math.min(dBody, dShadow, dGold, dCream);
          if (best < 0.09) {
            let target = body;
            let shade = 1;
            if (best === dShadow) shade = 0.74;
            else if (best === dGold) { target = accent; shade = 1; }
            else if (best === dCream) { target = accent; shade = 1.14; }
            colors[i] = target.r * shade;
            colors[i + 1] = target.g * shade;
            colors[i + 2] = target.b * shade;
          }
        }
        attr.needsUpdate = true;
      }
      child.geometry = geometry;
      child.material = material;
      child.castShadow = shadows;
      child.receiveShadow = shadows;
    });
    const container = new Group();
    model.rotation.y = Math.PI;
    model.scale.setScalar(WORLD.planeScale);
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    model.position.set(-center.x, -center.y, -center.z);
    container.add(model);
    container.userData.propeller = model.getObjectByName("propeller") ?? null;
    container.userData.model = model;
    return container;
  }

  private planeMaterial(aircraftId: string): MeshStandardMaterial {
    const existing = this.planeMaterials.get(aircraftId);
    if (existing) return existing;
    const mat = new MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.08,
      roughness: 0.76,
      flatShading: true,
      color: 0xffffff,
    });
    this.planeMaterials.set(aircraftId, mat);
    return mat;
  }
}

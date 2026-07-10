import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const EMELY_BAKER_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-emely-baker-centre.glb";
export const EMELY_BAKER_ASSET_LENGTH = 29.048176235886487;
export const EMELY_BAKER_ASSET_DEPTH = 20.03833514626707;

let emelyBakerTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateEmelyBakerAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Emely Baker Centre asset";
  instance.userData.kind = "emely-baker-centre-blender-asset";
  instance.userData.assetPath = EMELY_BAKER_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!emelyBakerTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());
    emelyBakerTemplatePromise = loader.loadAsync(`${baseUrl}${EMELY_BAKER_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Emely Baker Centre template";
      const tunedMaterials = new Set<THREE.Material>();
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (tunedMaterials.has(material)) continue;
          tuneAnimeMaterial(material);
          tunedMaterials.add(material);
        }
      });
      return template;
    });
  }
  return emelyBakerTemplatePromise;
}

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const ENTRANCE_PAVILION_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-entrance-pavilion.glb";
export const ENTRANCE_PAVILION_ASSET_LENGTH = 23.22;
export const ENTRANCE_PAVILION_ASSET_DEPTH = 4.27;

let entrancePavilionTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateEntrancePavilionAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Edinburgh Gardens timber entrance pavilion asset";
  instance.userData.kind = "entrance-pavilion-blender-asset";
  instance.userData.assetPath = ENTRANCE_PAVILION_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!entrancePavilionTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    entrancePavilionTemplatePromise = new GLTFLoader().loadAsync(`${baseUrl}${ENTRANCE_PAVILION_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Edinburgh Gardens timber entrance pavilion template";
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
  return entrancePavilionTemplatePromise;
}

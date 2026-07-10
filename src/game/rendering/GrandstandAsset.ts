import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const GRANDSTAND_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-kevin-murray-stand.glb";
export const GRANDSTAND_ASSET_LENGTH = 47.80175537030087;
export const GRANDSTAND_ASSET_DEPTH = 13.008765243305158;

let grandstandTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateGrandstandAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Kevin Murray Stand asset";
  instance.userData.kind = "kevin-murray-stand-blender-asset";
  instance.userData.assetPath = GRANDSTAND_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!grandstandTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());
    grandstandTemplatePromise = loader.loadAsync(`${baseUrl}${GRANDSTAND_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Kevin Murray Stand template";
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
  return grandstandTemplatePromise;
}

import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const NORTH_TOILETS_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-north-toilets.glb";
export const NORTH_TOILETS_ASSET_LENGTH = 14.062516258664825;
export const NORTH_TOILETS_ASSET_DEPTH = 9.571372656045673;

let northToiletsTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateNorthToiletsAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Edinburgh Gardens north public toilets asset";
  instance.userData.kind = "north-toilets-blender-asset";
  instance.userData.assetPath = NORTH_TOILETS_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!northToiletsTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());
    northToiletsTemplatePromise = loader.loadAsync(`${baseUrl}${NORTH_TOILETS_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Edinburgh Gardens north public toilets template";
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
  return northToiletsTemplatePromise;
}

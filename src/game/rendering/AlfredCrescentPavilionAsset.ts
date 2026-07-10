import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const ALFRED_CRESCENT_PAVILION_ASSET_PATH =
  "models/edinburgh-gardens/edinburgh-gardens-alfred-crescent-pavilion.glb";
export const ALFRED_CRESCENT_PAVILION_ASSET_LENGTH = 45.05949968498282;
export const ALFRED_CRESCENT_PAVILION_ASSET_DEPTH = 21.230271351272727;

let alfredCrescentPavilionTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateAlfredCrescentPavilionAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Alfred Crescent Sports Pavilion asset";
  instance.userData.kind = "alfred-crescent-pavilion-blender-asset";
  instance.userData.assetPath = ALFRED_CRESCENT_PAVILION_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!alfredCrescentPavilionTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());
    alfredCrescentPavilionTemplatePromise = loader
      .loadAsync(`${baseUrl}${ALFRED_CRESCENT_PAVILION_ASSET_PATH}`)
      .then((gltf) => {
        const template = gltf.scene;
        template.name = "Alfred Crescent Sports Pavilion template";
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
  return alfredCrescentPavilionTemplatePromise;
}

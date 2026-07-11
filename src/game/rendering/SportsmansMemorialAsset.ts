import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const SPORTSMANS_MEMORIAL_ASSET_PATH =
  "models/edinburgh-gardens/edinburgh-gardens-sportsmans-war-memorial.glb";

let sportsmansMemorialTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateSportsmansMemorialAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Sportsman's War Memorial asset";
  instance.userData.kind = "sportsmans-war-memorial-blender-asset";
  instance.userData.assetPath = SPORTSMANS_MEMORIAL_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!sportsmansMemorialTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());
    sportsmansMemorialTemplatePromise = loader
      .loadAsync(`${baseUrl}${SPORTSMANS_MEMORIAL_ASSET_PATH}`)
      .then((gltf) => {
        const template = gltf.scene;
        template.name = "Sportsman's War Memorial template";
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
  return sportsmansMemorialTemplatePromise;
}

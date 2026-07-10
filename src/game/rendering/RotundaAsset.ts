import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const ROTUNDA_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-rotunda.glb";

let rotundaTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateRotundaAsset(): Promise<THREE.Group> {
  const template = await loadRotundaTemplate();
  const instance = template.clone(true);
  instance.name = "Edinburgh Gardens Memorial Rotunda asset";
  instance.userData.kind = "rotunda-blender-asset";
  instance.userData.assetPath = ROTUNDA_ASSET_PATH;
  return instance;
}

function loadRotundaTemplate(): Promise<THREE.Group> {
  if (!rotundaTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const loader = new GLTFLoader();
    rotundaTemplatePromise = loader.loadAsync(`${baseUrl}${ROTUNDA_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Edinburgh Gardens Memorial Rotunda template";
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
  return rotundaTemplatePromise;
}

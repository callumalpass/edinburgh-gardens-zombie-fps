import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { tuneAnimeMaterial } from "./animeStyle";

export const BOWLING_CLUB_ASSET_PATH = "models/edinburgh-gardens/edinburgh-gardens-bowling-club.glb";
export const BOWLING_CLUB_ASSET_LENGTH = 80.24;
export const BOWLING_CLUB_ASSET_DEPTH = 30.96;

let bowlingClubTemplatePromise: Promise<THREE.Group> | null = null;

export async function instantiateBowlingClubAsset(): Promise<THREE.Group> {
  const template = await loadTemplate();
  const instance = template.clone(true);
  instance.name = "Fitzroy Victoria Bowling & Sports Club asset";
  instance.userData.kind = "bowling-club-blender-asset";
  instance.userData.assetPath = BOWLING_CLUB_ASSET_PATH;
  return instance;
}

function loadTemplate(): Promise<THREE.Group> {
  if (!bowlingClubTemplatePromise) {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    bowlingClubTemplatePromise = new GLTFLoader().loadAsync(`${baseUrl}${BOWLING_CLUB_ASSET_PATH}`).then((gltf) => {
      const template = gltf.scene;
      template.name = "Fitzroy Victoria Bowling & Sports Club template";
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
  return bowlingClubTemplatePromise;
}

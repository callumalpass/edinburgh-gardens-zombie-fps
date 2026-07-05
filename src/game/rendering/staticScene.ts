import * as THREE from "three";

export interface StaticSceneStats {
  frozenObjects: number;
  frozenMeshes: number;
}

export function freezeStaticScene(root: THREE.Object3D, dynamicRoots: readonly THREE.Object3D[]): StaticSceneStats {
  const dynamicRootSet = new Set(dynamicRoots);
  const stats: StaticSceneStats = {
    frozenObjects: 0,
    frozenMeshes: 0
  };

  root.updateMatrixWorld(true);

  const visit = (object: THREE.Object3D): void => {
    if (dynamicRootSet.has(object) || object.userData.dynamic === true) {
      return;
    }

    if (object !== root) {
      object.updateMatrix();
      object.updateMatrixWorld(true);
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
      stats.frozenObjects += 1;
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
        stats.frozenMeshes += 1;
      }
    }

    for (const child of object.children) {
      visit(child);
    }
  };

  visit(root);
  return stats;
}

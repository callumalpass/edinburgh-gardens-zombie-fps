import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  VertexData,
  Vector3
} from "@babylonjs/core";
import earcut from "earcut";
import { distance, pointInPolygon, polygonArea } from "../../geo";
import type { Vec2 } from "../../types";

export const TERRAIN_SURFACE_Y = 0.04;
export const PATH_SURFACE_Y = 0.082;
export const DETAIL_SURFACE_Y = 0.118;

export function createTerrainPolygonMesh(
  name: string,
  scene: Scene,
  polygon: readonly Vec2[],
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = TERRAIN_SURFACE_Y,
  uvScale = 26
): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const flat: number[] = [];

  for (const point of polygon) {
    positions.push(point.x, groundYAt(point) + yOffset, point.z);
    uvs.push(point.x / uvScale, point.z / uvScale);
    flat.push(point.x, point.z);
  }

  let indices = earcut(flat);
  if (polygonArea(polygon) > 0) {
    indices = reverseTriangleWinding(indices);
  }

  return createMeshFromData(name, scene, positions, indices, uvs, material);
}

export function createTerrainGridMesh(
  name: string,
  scene: Scene,
  boundary: readonly Vec2[],
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = TERRAIN_SURFACE_Y,
  step = 6.5,
  uvScale = 34
): Mesh {
  const minX = Math.min(...boundary.map((point) => point.x));
  const maxX = Math.max(...boundary.map((point) => point.x));
  const minZ = Math.min(...boundary.map((point) => point.z));
  const maxZ = Math.max(...boundary.map((point) => point.z));
  const columns = Math.ceil((maxX - minX) / step);
  const rows = Math.ceil((maxZ - minZ) / step);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const z = row === rows ? maxZ : minZ + row * step;
    for (let column = 0; column <= columns; column += 1) {
      const x = column === columns ? maxX : minX + column * step;
      const point = { x, z };
      positions.push(x, groundYAt(point) + yOffset, z);
      uvs.push(x / uvScale, z / uvScale);
    }
  }

  const stride = columns + 1;
  const addTriangle = (a: number, b: number, c: number) => {
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cz = positions[c * 3 + 2];
    const centroid = { x: (ax + bx + cx) / 3, z: (az + bz + cz) / 3 };
    if (pointInPolygon(centroid, boundary)) {
      indices.push(a, c, b);
    }
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      addTriangle(topLeft, bottomLeft, topRight);
      addTriangle(topRight, bottomLeft, bottomRight);
    }
  }

  return createMeshFromData(name, scene, positions, indices, uvs, material);
}

export function createExtrudedPolygonMesh(
  name: string,
  scene: Scene,
  polygon: readonly Vec2[],
  height: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = 0.03
): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const flat: number[] = [];
  const topStart = 0;

  for (const point of polygon) {
    const y = groundYAt(point) + yOffset + height;
    positions.push(point.x, y, point.z);
    uvs.push(point.x / 12, point.z / 12);
    flat.push(point.x, point.z);
  }

  let topIndices = earcut(flat);
  if (polygonArea(polygon) > 0) {
    topIndices = reverseTriangleWinding(topIndices);
  }
  indices.push(...topIndices.map((index) => index + topStart));

  const sideStart = positions.length / 3;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const baseY = Math.min(groundYAt(a), groundYAt(b)) + yOffset;
    positions.push(a.x, baseY, a.z, b.x, baseY, b.z, b.x, baseY + height, b.z, a.x, baseY + height, a.z);
    const sideU = distance(a, b) / 6;
    uvs.push(0, 0, sideU, 0, sideU, height / 6, 0, height / 6);
    const offset = sideStart + index * 4;
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  }

  return createMeshFromData(name, scene, positions, indices, uvs, material);
}

export function createTerrainRibbonSegmentMesh(
  name: string,
  scene: Scene,
  a: Vec2,
  b: Vec2,
  width: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = PATH_SURFACE_Y
): Mesh {
  const segmentLength = distance(a, b);
  const lengthSegments = Math.max(1, Math.ceil(segmentLength / 5.5));
  const widthSegments = Math.max(1, Math.ceil(width / 1.15));
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const invLength = segmentLength > 0.001 ? 1 / segmentLength : 1;
  const tangent = { x: dx * invLength, z: dz * invLength };
  const normal = { x: -tangent.z, z: tangent.x };
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i += 1) {
    const t = i / lengthSegments;
    const center = {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t
    };
    for (let j = 0; j <= widthSegments; j += 1) {
      const side = (j / widthSegments - 0.5) * width;
      const point = {
        x: center.x + normal.x * side,
        z: center.z + normal.z * side
      };
      positions.push(point.x, groundYAt(point) + yOffset, point.z);
      uvs.push((t * segmentLength) / 8, j / widthSegments);
    }
  }

  const row = widthSegments + 1;
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < widthSegments; j += 1) {
      const v = i * row + j;
      indices.push(v, v + row + 1, v + row, v, v + 1, v + row + 1);
    }
  }

  return createMeshFromData(name, scene, positions, indices, uvs, material);
}

export function createTerrainDiscMesh(
  name: string,
  scene: Scene,
  center: Vec2,
  radius: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = DETAIL_SURFACE_Y,
  segments = 34
): Mesh {
  return createTerrainEllipseMesh(name, scene, center, radius * 2, radius * 2, 0, material, groundYAt, yOffset, segments);
}

export function createTerrainEllipseMesh(
  name: string,
  scene: Scene,
  center: Vec2,
  length: number,
  width: number,
  angle: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = DETAIL_SURFACE_Y,
  segments = 38
): Mesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  positions.push(center.x, groundYAt(center) + yOffset, center.z);
  uvs.push(0.5, 0.5);

  for (let index = 0; index < segments; index += 1) {
    const theta = (index / segments) * Math.PI * 2;
    const localX = Math.cos(theta) * length * 0.5;
    const localZ = Math.sin(theta) * width * 0.5;
    const point = {
      x: center.x + localX * cos - localZ * sin,
      z: center.z + localX * sin + localZ * cos
    };
    positions.push(point.x, groundYAt(point) + yOffset, point.z);
    uvs.push(0.5 + Math.cos(theta) * 0.5, 0.5 + Math.sin(theta) * 0.5);
  }

  for (let index = 0; index < segments; index += 1) {
    const current = index + 1;
    const next = ((index + 1) % segments) + 1;
    indices.push(0, next, current);
  }

  return createMeshFromData(name, scene, positions, indices, uvs, material);
}

export function createGroundedTube(
  name: string,
  scene: Scene,
  points: readonly Vec2[],
  radius: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = 0.16,
  tessellation = 8
): Mesh {
  const path = points.map((point) => new Vector3(point.x, groundYAt(point) + yOffset, point.z));
  const mesh = MeshBuilder.CreateTube(name, { path, radius, tessellation, updatable: false }, scene);
  mesh.material = material;
  return mesh;
}

export function createBoxBetween(
  name: string,
  scene: Scene,
  center: Vec2,
  length: number,
  height: number,
  depth: number,
  angle: number,
  material: StandardMaterial,
  groundYAt: (point: Vec2) => number,
  yOffset = 0
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: length, height, depth }, scene);
  mesh.position.set(center.x, groundYAt(center) + yOffset + height * 0.5, center.z);
  mesh.rotation.y = -angle;
  mesh.material = material;
  enablePaintedEdges(mesh);
  return mesh;
}

export function enablePaintedEdges(mesh: Mesh, color = new Color3(0.025, 0.04, 0.045), width = 0.54): void {
  mesh.enableEdgesRendering(0.32);
  mesh.edgesColor.set(color.r, color.g, color.b, 0.24);
  mesh.edgesWidth = width;
}

function createMeshFromData(
  name: string,
  scene: Scene,
  positions: number[],
  indices: number[],
  uvs: number[],
  material: StandardMaterial
): Mesh {
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = material;
  return mesh;
}

function reverseTriangleWinding(indices: number[]): number[] {
  const reversed = [...indices];
  for (let index = 0; index < reversed.length; index += 3) {
    const second = reversed[index + 1];
    reversed[index + 1] = reversed[index + 2];
    reversed[index + 2] = second;
  }
  return reversed;
}

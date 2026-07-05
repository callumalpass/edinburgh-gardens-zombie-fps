import * as THREE from "three";
import type { Vec2 } from "../types";

export const TERRAIN_OVERLAY_MAX_LENGTH_STEP = 1.8;
export const TERRAIN_OVERLAY_MAX_WIDTH_STEP = 0.9;
export const TERRAIN_OVERLAY_DISC_SEGMENTS = 28;

type GroundYProvider = (point: Vec2) => number;

export interface TerrainOverlayRectOptions {
  center: Vec2;
  angle: number;
  length: number;
  width: number;
  yOffset: number;
  groundYAt: GroundYProvider;
  maxLengthStep?: number;
  maxWidthStep?: number;
  uvScale?: number;
}

export interface TerrainOverlayEllipseOptions {
  center: Vec2;
  angle?: number;
  radiusX: number;
  radiusZ: number;
  yOffset: number;
  groundYAt: GroundYProvider;
  radialSegments?: number;
  maxRadiusStep?: number;
  uvScale?: number;
}

export function createTerrainOverlayRectGeometry({
  center,
  angle,
  length,
  width,
  yOffset,
  groundYAt,
  maxLengthStep = TERRAIN_OVERLAY_MAX_LENGTH_STEP,
  maxWidthStep = TERRAIN_OVERLAY_MAX_WIDTH_STEP,
  uvScale = 0.04
}: TerrainOverlayRectOptions): THREE.BufferGeometry {
  const lengthSegments = Math.max(1, Math.ceil(length / maxLengthStep));
  const widthSegments = Math.max(1, Math.ceil(width / maxWidthStep));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vertexCount = (lengthSegments + 1) * (widthSegments + 1);
  const vertices = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = createIndexArray(vertexCount, lengthSegments * widthSegments * 6);
  const point = { x: 0, z: 0 };
  let vertexOffset = 0;
  let uvOffset = 0;
  let indexOffset = 0;

  for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex += 1) {
    const localX = -length * 0.5 + (length * lengthIndex) / lengthSegments;
    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const localZ = -width * 0.5 + (width * widthIndex) / widthSegments;
      setLocalToWorld(point, center, cos, sin, localX, localZ);
      vertices[vertexOffset++] = point.x;
      vertices[vertexOffset++] = groundYAt(point) + yOffset;
      vertices[vertexOffset++] = point.z;
      uvs[uvOffset++] = point.x * uvScale;
      uvs[uvOffset++] = point.z * uvScale;
    }
  }

  const rowStride = widthSegments + 1;
  for (let lengthIndex = 0; lengthIndex < lengthSegments; lengthIndex += 1) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      const v00 = lengthIndex * rowStride + widthIndex;
      const v10 = (lengthIndex + 1) * rowStride + widthIndex;
      const v01 = v00 + 1;
      const v11 = v10 + 1;
      indices[indexOffset++] = v00;
      indices[indexOffset++] = v01;
      indices[indexOffset++] = v11;
      indices[indexOffset++] = v00;
      indices[indexOffset++] = v11;
      indices[indexOffset++] = v10;
    }
  }

  return buildOverlayGeometry(vertices, uvs, indices);
}

export function createTerrainOverlayDiscGeometry(
  center: Vec2,
  radius: number,
  yOffset: number,
  groundYAt: GroundYProvider
): THREE.BufferGeometry {
  return createTerrainOverlayEllipseGeometry({ center, radiusX: radius, radiusZ: radius, yOffset, groundYAt });
}

export function createTerrainOverlayEllipseGeometry({
  center,
  angle = 0,
  radiusX,
  radiusZ,
  yOffset,
  groundYAt,
  radialSegments = TERRAIN_OVERLAY_DISC_SEGMENTS,
  maxRadiusStep = TERRAIN_OVERLAY_MAX_WIDTH_STEP,
  uvScale = 0.04
}: TerrainOverlayEllipseOptions): THREE.BufferGeometry {
  const ringCount = Math.max(1, Math.ceil(Math.max(radiusX, radiusZ) / maxRadiusStep));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vertexCount = 1 + ringCount * radialSegments;
  const vertices = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = createIndexArray(vertexCount, radialSegments * 3 + Math.max(0, ringCount - 1) * radialSegments * 6);
  const point = { x: center.x, z: center.z };
  let vertexOffset = 0;
  let uvOffset = 0;
  let indexOffset = 0;

  vertices[vertexOffset++] = center.x;
  vertices[vertexOffset++] = groundYAt(center) + yOffset;
  vertices[vertexOffset++] = center.z;
  uvs[uvOffset++] = center.x * uvScale;
  uvs[uvOffset++] = center.z * uvScale;

  for (let ring = 1; ring <= ringCount; ring += 1) {
    const radiusT = ring / ringCount;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const localX = Math.cos(theta) * radiusX * radiusT;
      const localZ = Math.sin(theta) * radiusZ * radiusT;
      setLocalToWorld(point, center, cos, sin, localX, localZ);
      vertices[vertexOffset++] = point.x;
      vertices[vertexOffset++] = groundYAt(point) + yOffset;
      vertices[vertexOffset++] = point.z;
      uvs[uvOffset++] = point.x * uvScale;
      uvs[uvOffset++] = point.z * uvScale;
    }
  }

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices[indexOffset++] = 0;
    indices[indexOffset++] = 1 + next;
    indices[indexOffset++] = 1 + segment;
  }

  for (let ring = 1; ring < ringCount; ring += 1) {
    const innerStart = 1 + (ring - 1) * radialSegments;
    const outerStart = 1 + ring * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const innerCurrent = innerStart + segment;
      const innerNext = innerStart + next;
      const outerCurrent = outerStart + segment;
      const outerNext = outerStart + next;
      indices[indexOffset++] = innerCurrent;
      indices[indexOffset++] = outerNext;
      indices[indexOffset++] = outerCurrent;
      indices[indexOffset++] = innerCurrent;
      indices[indexOffset++] = innerNext;
      indices[indexOffset++] = outerNext;
    }
  }

  return buildOverlayGeometry(vertices, uvs, indices);
}

function setLocalToWorld(target: Vec2, center: Vec2, cos: number, sin: number, localX: number, localZ: number): void {
  target.x = center.x + localX * cos - localZ * sin;
  target.z = center.z + localX * sin + localZ * cos;
}

function createIndexArray(vertexCount: number, indexCount: number): Uint16Array | Uint32Array {
  return vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
}

function buildOverlayGeometry(vertices: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

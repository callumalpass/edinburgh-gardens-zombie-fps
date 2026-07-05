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
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let lengthIndex = 0; lengthIndex <= lengthSegments; lengthIndex += 1) {
    const localX = -length * 0.5 + (length * lengthIndex) / lengthSegments;
    for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
      const localZ = -width * 0.5 + (width * widthIndex) / widthSegments;
      const point = localToWorld(center, cos, sin, localX, localZ);
      vertices.push(point.x, groundYAt(point) + yOffset, point.z);
      uvs.push(point.x * uvScale, point.z * uvScale);
    }
  }

  const rowStride = widthSegments + 1;
  for (let lengthIndex = 0; lengthIndex < lengthSegments; lengthIndex += 1) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      const v00 = lengthIndex * rowStride + widthIndex;
      const v10 = (lengthIndex + 1) * rowStride + widthIndex;
      const v01 = v00 + 1;
      const v11 = v10 + 1;
      indices.push(v00, v01, v11, v00, v11, v10);
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
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  vertices.push(center.x, groundYAt(center) + yOffset, center.z);
  uvs.push(center.x * uvScale, center.z * uvScale);

  for (let ring = 1; ring <= ringCount; ring += 1) {
    const radiusT = ring / ringCount;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const theta = (segment / radialSegments) * Math.PI * 2;
      const localX = Math.cos(theta) * radiusX * radiusT;
      const localZ = Math.sin(theta) * radiusZ * radiusT;
      const point = localToWorld(center, cos, sin, localX, localZ);
      vertices.push(point.x, groundYAt(point) + yOffset, point.z);
      uvs.push(point.x * uvScale, point.z * uvScale);
    }
  }

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    indices.push(0, 1 + next, 1 + segment);
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
      indices.push(innerCurrent, outerNext, outerCurrent, innerCurrent, innerNext, outerNext);
    }
  }

  return buildOverlayGeometry(vertices, uvs, indices);
}

function localToWorld(center: Vec2, cos: number, sin: number, localX: number, localZ: number): Vec2 {
  return {
    x: center.x + localX * cos - localZ * sin,
    z: center.z + localX * sin + localZ * cos
  };
}

function buildOverlayGeometry(vertices: number[], uvs: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

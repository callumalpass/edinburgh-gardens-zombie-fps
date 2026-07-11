import type { Vec2 } from "./types";

export type ContextDetailTier = "near" | "mid" | "far";
export type ContextEvidenceTier = "feature-specific" | "footprint-address-aerial" | "footprint-aerial";
export type ContextRoofShape = "flat" | "gable" | "hipped" | "skillion";
export type ContextRoofTone = "silver" | "cream" | "terracotta" | "charcoal" | "weathered";
export type ContextFacadeTone = "brick" | "cream" | "weatherboard" | "ochre" | "charcoal";
export type ContextFacadeProfile =
  | "heritage-residential"
  | "terrace-shop"
  | "institutional"
  | "church"
  | "modern-civic"
  | "generic";

export interface ContextBuilding {
  id: string;
  osmWayId: string;
  label: string;
  address?: string;
  buildingType: string;
  polygon: Vec2[];
  center: Vec2;
  distanceToPark: number;
  height: number;
  heightBasis: string;
  roofShape: ContextRoofShape;
  roofTone: ContextRoofTone;
  facadeTone: ContextFacadeTone;
  facadeProfile: ContextFacadeProfile;
  storeys: number;
  detailTier: ContextDetailTier;
  evidenceTier: ContextEvidenceTier;
  source: string;
  featureSources?: string[];
  featureCues?: string[];
  uncertainty: string;
}

export interface ContextRoad {
  id: string;
  osmWayId: string;
  label: string;
  kind: "road" | "service" | "path" | "tram";
  points: Vec2[];
  width: number;
  source: string;
}

export interface ContextTree {
  id: string;
  position: Vec2;
  height: number;
  canopyRadius: number;
  dense: boolean;
  distanceToPark: number;
  source: string;
}

export interface ContextElevationSample {
  position: Vec2;
  altitude: number;
}

export interface ContextWorldData {
  beltDistanceMetres: number;
  buildings: ContextBuilding[];
  roads: ContextRoad[];
  trees: ContextTree[];
  elevationSamples: ContextElevationSample[];
}

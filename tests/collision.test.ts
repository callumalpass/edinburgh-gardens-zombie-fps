import { describe, expect, it } from "vitest";
import { resolveObstacle, shouldBypassObstacle } from "../src/game/collision";
import { PLAYER_RADIUS } from "../src/game/gameConfig";
import { distance, geoToWorld, pointInPolygon, polygonCentroid } from "../src/game/geo";
import { createLevelData } from "../src/game/levelData";
import type { BoxObstacle, PolygonObstacle } from "../src/game/types";

const level = createLevelData();

describe("collision system", () => {
  it("pushes points out of expanded box obstacles", () => {
    const obstacle: BoxObstacle = {
      id: "box",
      label: "Box",
      sourceObjectId: "box",
      sourceObjectKind: "landmark",
      shape: "box",
      center: { x: 0, z: 0 },
      halfX: 2,
      halfZ: 3,
      angle: 0
    };

    const resolved = resolveObstacle({ x: 0.5, z: 0.5 }, 1, obstacle);
    expect(Math.abs(resolved.x) === 3 || Math.abs(resolved.z) === 4).toBe(true);
  });

  it("shrinks doorway clearance by the player radius instead of widening it", () => {
    const obstacle: BoxObstacle = {
      id: "door-wall",
      label: "Door wall",
      sourceObjectId: "door-wall",
      sourceObjectKind: "landmark",
      shape: "box",
      center: { x: 0, z: 0 },
      halfX: 3,
      halfZ: 0.3,
      angle: 0,
      accessGaps: [{ id: "door", localCenterX: 0, localCenterZ: 0, halfX: 1, halfZ: 0.5 }]
    };

    expect(resolveObstacle({ x: 0.4, z: 0 }, PLAYER_RADIUS, obstacle)).toEqual({ x: 0.4, z: 0 });
    expect(distance(resolveObstacle({ x: 0.6, z: 0 }, PLAYER_RADIUS, obstacle), { x: 0.6, z: 0 })).toBeGreaterThan(0.1);
  });

  it("pushes out of concave building footprints through the nearest wall", () => {
    const obstacle: PolygonObstacle = {
      id: "concave-building",
      label: "Concave building",
      sourceObjectId: "concave-building",
      sourceObjectKind: "mapped-building",
      shape: "polygon",
      center: { x: 1.36, z: 1.36 },
      polygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 1 },
        { x: 1, z: 1 },
        { x: 1, z: 4 },
        { x: 0, z: 4 }
      ]
    };

    const resolved = resolveObstacle({ x: 0.9, z: 2 }, PLAYER_RADIUS, obstacle);
    expect(resolved.x).toBeCloseTo(1 + PLAYER_RADIUS, 5);
    expect(resolved.z).toBeCloseTo(2, 5);
  });

  it("uses fixture metadata to bypass active obstacles", () => {
    const fixture = level.interactables.find((candidate) => candidate.id === "rotunda-deck");
    expect(fixture?.bypassObstacleIds).toContain("osm-building-543505640");

    expect(
      shouldBypassObstacle("osm-building-543505640", fixture!.position, {
        activeFixtureId: fixture!.id,
        interactables: level.interactables
      })
    ).toBe(true);
    expect(
      shouldBypassObstacle("grandstand", fixture!.position, {
        activeFixtureId: fixture!.id,
        interactables: level.interactables
      })
    ).toBe(false);
  });

  it("keeps the Blender Rotunda columns tangible without obstructing its stair landing", () => {
    const fixture = level.interactables.find((candidate) => candidate.id === "rotunda-deck");
    const columns = level.obstacles.filter((obstacle) => obstacle.id.startsWith("rotunda-column-"));
    if (!fixture?.landingPosition) throw new Error("Missing Rotunda deck landing");

    expect(columns).toHaveLength(8);
    for (const column of columns) {
      expect(column.shape).toBeUndefined();
      expect(distance(column.center, fixture.position)).toBeCloseTo(4.03, 2);
      expect(distance(resolveObstacle(fixture.landingPosition, 0.34, column), fixture.landingPosition)).toBeLessThan(0.001);
      expect(
        shouldBypassObstacle(column.id, column.center, {
          activeFixtureId: fixture.id,
          interactables: level.interactables
        })
      ).toBe(false);
    }
  });

  it("opens only the two photographed entrance-pavilion passages", () => {
    const blocker = level.obstacles.find((obstacle) => obstacle.id === "osm-building-543505638");
    const access = level.amenities.find((amenity) => amenity.id === "timber-entrance-pavilion-passage");
    if (!blocker || blocker.shape !== "box" || !access) throw new Error("Missing entrance-pavilion navigation data");

    expect(blocker.accessGaps).toHaveLength(2);
    expect(distance(resolveObstacle(access.position, PLAYER_RADIUS, blocker), access.position)).toBeLessThan(0.001);
    const endBayLocalX = blocker.halfX * 0.82;
    const endBayPoint = {
      x: blocker.center.x + endBayLocalX * Math.cos(blocker.angle),
      z: blocker.center.z + endBayLocalX * Math.sin(blocker.angle)
    };
    expect(distance(resolveObstacle(endBayPoint, PLAYER_RADIUS, blocker), endBayPoint)).toBeGreaterThan(0.1);
  });

  it("keeps the full player-width route through the entrance pavilion clear", () => {
    const blocker = level.obstacles.find((obstacle) => obstacle.id === "osm-building-543505638");
    const access = level.amenities.find((amenity) => amenity.id === "timber-entrance-pavilion-passage");
    if (!blocker || blocker.shape !== "box" || !access) throw new Error("Missing entrance-pavilion navigation data");
    const gap = blocker.accessGaps?.[0];
    if (!gap) throw new Error("Missing pavilion passage gap");
    const samples = Array.from({ length: 9 }, (_, index) => {
      const localZ = blocker.halfZ + 1.15 - index * ((blocker.halfZ * 2 + 2.3) / 8);
      const point = {
        x: blocker.center.x + gap.localCenterX * Math.cos(blocker.angle) - localZ * Math.sin(blocker.angle),
        z: blocker.center.z + gap.localCenterX * Math.sin(blocker.angle) + localZ * Math.cos(blocker.angle)
      };
      return level.obstacles
        .map((obstacle) => ({ id: obstacle.id, displacement: distance(point, resolveObstacle(point, PLAYER_RADIUS, obstacle)) }))
        .filter((candidate) => candidate.displacement > 0.001);
    });
    expect(samples).toEqual(Array.from({ length: 9 }, () => []));
  });

  it("keeps fixture bypass ids tied to actual obstacles", () => {
    const obstacleIds = new Set(level.obstacles.map((obstacle) => obstacle.id));
    const missing = level.interactables.flatMap((fixture) =>
      (fixture.bypassObstacleIds ?? [])
        .filter((obstacleId) => !obstacleIds.has(obstacleId))
        .map((obstacleId) => `${fixture.id}:${obstacleId}`)
    );

    expect(missing).toEqual([]);
  });

  it("keeps collision obstacles tied to actual source objects", () => {
    const landmarks = new Set(level.landmarks.map((source) => source.id));
    const mappedBuildings = new Set(level.mappedBuildings.map((source) => source.id));
    const mappedFences = new Set(level.mappedFences.map((source) => source.id));
    const parkLifeDetails = new Set(level.parkLifeDetails.map((source) => source.id));
    const sportsFixtures = new Set(level.sportsFixtures.map((source) => source.id));
    const treeColliders = new Set(level.treeColliders.map((source) => source.id));
    const fixtureIds = new Set(level.interactables.map((fixture) => fixture.id));
    const missingSources = level.obstacles
      .filter((obstacle) => {
        if (obstacle.sourceObjectKind === "landmark") return !landmarks.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "mapped-building") return !mappedBuildings.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "mapped-fence") return !mappedFences.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "park-life-detail") return !parkLifeDetails.has(obstacle.sourceObjectId);
        if (obstacle.sourceObjectKind === "sports-fixture") return !sportsFixtures.has(obstacle.sourceObjectId);
        return !treeColliders.has(obstacle.sourceObjectId);
      })
      .map((obstacle) => `${obstacle.id}:${obstacle.sourceObjectKind}:${obstacle.sourceObjectId}`);
    const missingGapFixtures = level.obstacles
      .filter((obstacle) => obstacle.shape === "box")
      .flatMap((obstacle) =>
        (obstacle.accessGaps ?? [])
          .filter((gap) => gap.fixtureId && !fixtureIds.has(gap.fixtureId))
          .map((gap) => `${obstacle.id}:${gap.id}:${gap.fixtureId}`)
      );

    expect(missingSources).toEqual([]);
    expect(missingGapFixtures).toEqual([]);
  });

  it("keeps structure access interactions source-linked and inside the park", () => {
    const structureKinds = new Set([
      "clubroom",
      "changeroom",
      "umpire_room",
      "first_aid_room",
      "gatehouse",
      "maintenance_room",
      "community_room",
      "kitchenette",
      "kiosk_hatch",
      "utility_box",
      "memorial_plaque"
    ]);
    const expectedIds = [
      "grandstand-changeroom-access",
      "grandstand-umpire-room-access",
      "tennis-clubroom-access",
      "bowling-clubroom-access",
      "timber-entrance-pavilion-passage",
      "emely-baker-community-room",
      "emely-baker-kitchenette",
      "emely-baker-exterior-service-cabinet",
      "alfred-pavilion-main-entrance",
      "alfred-pavilion-kiosk",
      "rotunda-memorial-plaque",
      "sportsmans-memorial-east-inscription"
    ];
    const accessPoints = level.amenities.filter((amenity) => structureKinds.has(amenity.kind));
    const landmarks = new Set(level.landmarks.map((landmark) => landmark.id));
    const mappedBuildings = new Set(level.mappedBuildings.map((building) => building.id));

    expect(accessPoints.map((amenity) => amenity.id).sort()).toEqual([...expectedIds].sort());
    for (const amenity of accessPoints) {
      expect(pointInPolygon(amenity.position, level.boundary)).toBe(true);
      expect(amenity.source).toBeTruthy();
      expect(amenity.linkedStructureId && (landmarks.has(amenity.linkedStructureId) || mappedBuildings.has(amenity.linkedStructureId))).toBe(true);
    }
  });

  it("places grandstand stair access on the oval-facing side of the blocker", () => {
    const fixture = level.interactables.find((candidate) => candidate.id === "grandstand-seats");
    const blocker = level.obstacles.find((candidate) => candidate.id === "grandstand");
    const oval = level.landmarks.find((candidate) => candidate.id === "oval");
    if (!fixture?.accessPosition || !fixture.landingPosition || !blocker || blocker.shape !== "box" || !oval?.polygon) {
      throw new Error("Missing grandstand fixture, blocker, or oval geometry");
    }

    const ovalCenter = polygonCentroid(oval.polygon);
    expect(blocker.sourceObjectId).toBe("grandstand");
    expect(blocker.sourceObjectKind).toBe("landmark");
    expect(blocker.accessGaps?.some((gap) => gap.fixtureId === fixture.id)).toBe(true);
    expect(distance(fixture.accessPosition, ovalCenter)).toBeLessThan(distance(blocker.center, ovalCenter));
    expect(distance(resolveObstacle(fixture.accessPosition, 0.48, blocker), fixture.accessPosition)).toBeLessThan(0.001);
    expect(distance(resolveObstacle(fixture.landingPosition, 0.48, blocker), fixture.landingPosition)).toBeLessThan(0.001);
    const sideDoor = { x: blocker.center.x + Math.cos(blocker.angle) * (blocker.halfX * 0.82), z: blocker.center.z + Math.sin(blocker.angle) * (blocker.halfX * 0.82) };
    expect(distance(resolveObstacle(sideDoor, 0.48, blocker), sideDoor)).toBeGreaterThan(0.1);
    expect(
      shouldBypassObstacle("grandstand", fixture.landingPosition, {
        activeFixtureId: fixture.id,
        interactables: level.interactables
      })
    ).toBe(true);
  });

  it("keeps the documented tennis and bowling gates open to their clubroom interactions", () => {
    for (const [fenceId, accessId] of [
      ["tennis-precinct-perimeter-fence", "tennis-clubroom-access"],
      ["bowling-precinct-perimeter-fence", "bowling-clubroom-access"]
    ] as const) {
      const fence = level.mappedFences.find((candidate) => candidate.id === fenceId);
      const gate = fence?.gates?.[0];
      const access = level.amenities.find((candidate) => candidate.id === accessId);
      if (!fence || !gate || !access) throw new Error(`Missing navigation data for ${fenceId}`);

      const routeBlockers = level.obstacles.filter(
        (obstacle) => obstacle.sourceObjectKind === "mapped-fence" || obstacle.sourceObjectKind === "mapped-building"
      );
      const blockedSamples: string[] = [];
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        const point = {
          x: gate.position.x + (access.position.x - gate.position.x) * t,
          z: gate.position.z + (access.position.z - gate.position.z) * t
        };
        for (const obstacle of routeBlockers) {
          if (distance(resolveObstacle(point, 0.34, obstacle), point) > 0.01) {
            blockedSamples.push(`${step}:${obstacle.id}`);
          }
        }
      }
      expect(blockedSamples).toEqual([]);
    }
  });

  it("makes the Hannah memorial brick piers solid while keeping the entrance walkable", () => {
    const gate = level.mappedFences
      .find((fence) => fence.id === "bowling-precinct-perimeter-fence")
      ?.gates?.find((candidate) => candidate.id === "bowling-hannah-memorial-gate");
    if (!gate) throw new Error("Missing Hannah memorial gate");

    const piers = level.obstacles.filter((obstacle) => obstacle.id.startsWith("bowling-hannah-memorial-gate-pier-"));
    const passage = level.interactables.find((fixture) => fixture.id === "bowling-hannah-memorial-gate-passage");
    const access = level.amenities.find((amenity) => amenity.id === "bowling-clubroom-access");
    expect(piers).toHaveLength(2);
    expect(passage?.kind).toBe("gate");
    expect(passage?.mode).toBe("auto");
    expect(access).toBeTruthy();
    expect(piers.every((pier) => distance(resolveObstacle(pier.center, 0, pier), pier.center) > 0.1)).toBe(true);
    expect(piers.some((pier) => distance(resolveObstacle(gate.position, 0.58, pier), gate.position) > 0.01)).toBe(false);
    expect(
      piers.some((pier) =>
        shouldBypassObstacle(pier.id, gate.position, {
          activeFixtureId: null,
          interactables: level.interactables
        })
      )
    ).toBe(false);
    expect(
      piers.some((pier) =>
        shouldBypassObstacle(pier.id, pier.center, {
          activeFixtureId: null,
          interactables: level.interactables.filter((fixture) => fixture.id !== passage?.id)
        })
      )
    ).toBe(false);

    if (passage?.raisedFootprint?.shape !== "box") throw new Error("Missing Hannah gate corridor footprint");
    let inward = {
      x: -Math.sin(passage.raisedFootprint.angle),
      z: Math.cos(passage.raisedFootprint.angle)
    };
    const towardAccess = {
      x: access!.position.x - gate.position.x,
      z: access!.position.z - gate.position.z
    };
    if (inward.x * towardAccess.x + inward.z * towardAccess.z < 0) {
      inward = { x: -inward.x, z: -inward.z };
    }
    const blockedSamples = Array.from({ length: 23 }, (_, index) => {
      const progress = index * 0.5;
      const point = {
        x: gate.position.x + inward.x * (progress - 4),
        z: gate.position.z + inward.z * (progress - 4)
      };
      return level.obstacles
        .filter(
          (obstacle) =>
            !shouldBypassObstacle(obstacle.id, point, {
              activeFixtureId: null,
              interactables: level.interactables
            })
        )
        .map((obstacle) => ({ id: obstacle.id, displacement: distance(point, resolveObstacle(point, PLAYER_RADIUS, obstacle)) }))
        .filter((candidate) => candidate.displacement > 0.001);
    });
    expect(blockedSamples).toEqual(Array.from({ length: 23 }, () => []));
  });

  it("keeps the Emely Baker play-yard gate open to the community-room entrance", () => {
    const westRear = level.obstacles.find((candidate) => candidate.id === "emely-courtyard-side-wall-west-rear");
    const westFront = level.obstacles.find((candidate) => candidate.id === "emely-courtyard-side-wall-west-front");
    const access = level.amenities.find((candidate) => candidate.id === "emely-baker-community-room");
    if (!westRear || westRear.shape !== "polygon" || !westFront || westFront.shape !== "polygon" || !access) {
      throw new Error("Missing Emely Baker courtyard navigation geometry");
    }
    const nearestGateEdges = westRear.polygon.flatMap((rearPoint) =>
      westFront.polygon.map((frontPoint) => ({ rearPoint, frontPoint, gap: distance(rearPoint, frontPoint) }))
    ).sort((a, b) => a.gap - b.gap)[0];
    expect(nearestGateEdges.gap).toBeGreaterThan(1.55);
    const gateCenter = {
      x: (nearestGateEdges.rearPoint.x + nearestGateEdges.frontPoint.x) * 0.5,
      z: (nearestGateEdges.rearPoint.z + nearestGateEdges.frontPoint.z) * 0.5
    };
    const blockers = level.obstacles;
    const blockedSamples: string[] = [];
    for (let step = 0; step <= 20; step += 1) {
      const t = step / 20;
      const point = {
        x: gateCenter.x + (access.position.x - gateCenter.x) * t,
        z: gateCenter.z + (access.position.z - gateCenter.z) * t
      };
      for (const obstacle of blockers) {
        if (distance(resolveObstacle(point, 0.34, obstacle), point) > 0.01) blockedSamples.push(`${step}:${obstacle.id}`);
      }
    }
    expect(blockedSamples).toEqual([]);
  });

  it("uses the aerial-fitted Sportsman's Memorial site and keeps its south processional bay walkable", () => {
    const memorial = level.landmarks.find((candidate) => candidate.id === "sportsmans-war-memorial");
    const bowlingClub = level.mappedBuildings.find((candidate) => candidate.id === "osm-building-543505639");
    if (!memorial?.position || memorial.angle === undefined || !bowlingClub) {
      throw new Error("Missing Sportsman's Memorial or bowling-club geometry");
    }

    const placesOfPridePin = geoToWorld({ lat: -37.7880136, lon: 144.9805024 });
    expect(pointInPolygon(placesOfPridePin, bowlingClub.polygon)).toBe(true);
    expect(pointInPolygon(memorial.position, bowlingClub.polygon)).toBe(false);
    expect(memorial.source).toContain("pixel fit");
    expect(memorial.source).toContain("pin visibly falls on the club roof");

    const columns = level.obstacles.filter((obstacle) => obstacle.id.startsWith("sportsmans-memorial-column-"));
    expect(columns).toHaveLength(6);
    const passage = level.interactables.find((fixture) => fixture.id === "sportsmans-memorial-processional-bay");
    expect(passage?.mode).toBe("auto");
    expect(passage?.bypassObstacleIds).toEqual(["osm-building-543505639"]);
    expect(
      columns
        .filter((column) => column.shape === "box")
        .flatMap((column) => column.accessGaps ?? [])
        .filter((gap) => gap.fixtureId === passage?.id)
    ).toHaveLength(0);
    const localPoint = (localX: number, localZ: number) => ({
      x: memorial.position!.x + localX * Math.cos(memorial.angle!) - localZ * Math.sin(memorial.angle!),
      z: memorial.position!.z + localX * Math.sin(memorial.angle!) + localZ * Math.cos(memorial.angle!)
    });
    const blockedSamples: string[] = [];
    for (let step = 0; step <= 24; step += 1) {
      const point = localPoint(1.25, 6 - (step / 24) * 6);
      for (const obstacle of level.obstacles) {
        if (shouldBypassObstacle(obstacle.id, point, { activeFixtureId: null, interactables: level.interactables })) continue;
        if (distance(resolveObstacle(point, PLAYER_RADIUS, obstacle), point) > 0.01) {
          blockedSamples.push(`${step}:${obstacle.id}`);
        }
      }
    }
    expect(blockedSamples).toEqual([]);
    const inscription = level.amenities.find((amenity) => amenity.id === "sportsmans-memorial-east-inscription");
    expect(inscription).toBeTruthy();
    expect(level.obstacles.some((obstacle) => distance(resolveObstacle(inscription!.position, 0.05, obstacle), inscription!.position) > 0.01)).toBe(false);
  });

  it("pushes the player out of solid tree trunk obstacles", () => {
    const tree = level.treeColliders[0];
    const obstacle = level.obstacles.find((candidate) => candidate.id === tree.id);
    if (!obstacle || obstacle.shape === "box" || obstacle.shape === "polygon") {
      throw new Error("Expected a circular tree obstacle");
    }

    const playerRadius = 0.48;
    const resolved = resolveObstacle(tree.position, playerRadius, obstacle);
    expect(distance(resolved, tree.position)).toBeGreaterThanOrEqual(tree.radius + playerRadius - 0.001);
  });
});

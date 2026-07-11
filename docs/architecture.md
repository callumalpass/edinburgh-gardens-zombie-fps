# Architecture

This codebase is organized around a small app shell with gameplay, rendering, and data modules kept as separate as practical.

## Runtime Boundaries

- `src/game/GameApp.ts` owns browser integration, top-level system orchestration, HUD wiring, and the live Three.js scene.
- `src/game/gameConfig.ts` is the single source for cross-system tuning constants such as player movement, stamina costs, wave pacing, bike speeds, and network tick rates.
- `src/game/playerState.ts` creates and resets mutable local player state without duplicating starting values in the app shell.
- `src/game/characters.ts` is the canonical selectable-survivor registry and persistence boundary for stable avatar ids, player-facing metadata, asset paths, portraits, and first-person appearance colours.
- `src/game/runtimeTypes.ts` contains runtime entity contracts shared by orchestration code, networking, combat, and interaction handling.
- `src/game/runtime/FrameLoop.ts` owns requestAnimationFrame scheduling, frame delta clamping, and loop cancellation.
- `src/game/runtime/GameEntityStore.ts` owns transient scene-backed gameplay collections, monotonic entity ids, and shared cleanup for restarts and network-authoritative resyncs.
- `src/game/multiplayer/NetworkSession.ts` owns LAN transport lifecycle, host/client role checks, input/action sequencing, overshoot-preserving input/snapshot cadence, and replicated wave metadata. Player snapshots acknowledge the last host-processed input so owning clients can reconcile prediction without replacing local look rotation.
- `src/game/multiplayer/RemotePlayerRoster.ts` owns remote-player runtime state, deterministic co-op spawn offsets, snapshot interpolation for position/yaw/elevation, asynchronous Blender-avatar installation, animation selection, weapon sockets, reset behavior, and scene removal. Bike ownership and positional interactions remain host-authoritative and are replicated in game snapshots.
- `src/game/multiplayer/ClientPositionReconciler.ts` retains duration-bearing client input commands until the host acknowledges them. Clients rebuild predicted movement from the authoritative snapshot plus only the unacknowledged commands; an input sequence therefore identifies one discrete simulation step rather than a render-dependent sampled state.

## Co-op Replication Contracts

- The host owns every mutable shared entity. Full snapshots include zombies, pickups, weapon drops, portable world items, placed ladders, distractions, all rideable-bike state, and shared searched/repaired interaction ids.
- Clients keep their deterministic provisional world while connecting. They do not move until a snapshot containing their assigned player id arrives, and the first accepted snapshot atomically reconciles provisional entities with host state.
- Client movement messages carry a monotonic sequence and the exact simulated duration. The host queues each command, processes it once, and reports `lastProcessedInputSequence`; clients install that authoritative state and replay later commands in order.
- Client pickup, drop, ladder, distraction, skateboard, bike, amenity, weapon, and upgrade actions are requests. They mutate gameplay state only on the host and become visible to every peer through the next snapshot.
- `tests/multiplayerCoop.spec.ts` runs two lightweight browser game instances through the real WebSocket relay and checks shared-object visibility plus client/host movement convergence.

## Gameplay Modules

- `src/game/movement.ts` classifies movement surfaces from level path data and exposes player/bike speed curves.
- `src/game/weapons.ts`, `src/game/playerCondition.ts`, `src/game/noise.ts`, `src/game/visibility.ts`, `src/game/loot.ts`, and `src/game/waves.ts` are pure or mostly pure gameplay rules with direct unit coverage.
- `src/game/combat/` owns reusable combat rules that should stay independent of scene orchestration, including hit-zone targeting, melee arcs, ray tests, damage, stagger and zombie memory updates.
- `src/game/systems/PlayerLocomotion.ts` applies shared local/remote player movement, sprint gating, bike movement, jump settling, fixture elevation, obstacle bypasses, and skate-bowl exit collision.
- `src/game/systems/WaveDirector.ts` keeps wave pacing independent from the app shell and scene graph.
- `src/game/spatial/` owns reusable spatial acceleration and agent separation logic.

## Rendering Modules

- `src/game/rendering/WorldBuilder.ts` builds the static authored park scene from `LevelData`.
- `src/game/rendering/worldGeometry.ts` owns reusable placement math for polygon cleanup, local/world transforms, support-height sampling, rotated footprint checks, and deterministic detail noise.
- `src/game/rendering/weatherAnchors.ts` derives atmosphere sampling anchors from the level model.
- `src/game/rendering/disposeThreeResources.ts` centralizes disposal of geometries, materials, and textures.
- `src/game/rendering/CharacterAsset.ts` loads and skeleton-clones the Blender survivor GLBs while preserving independently disposable runtime resources.
- `src/game/rendering/ZombieAsset.ts` loads and skeleton-clones the five Blender zombie archetypes, maps AI state to shared animation names, and throttles distant mixers without changing gameplay collision or hit zones.
- `src/game/rendering/MeshFactory.ts`, `materials.ts`, `AtmosphereSystem.ts`, `PostProcessingPipeline.ts`, and related files own reusable Three.js presentation concerns.

## Data And Research

- `src/game/levelData.ts` is the source-backed Edinburgh Gardens level model.
- `docs/research/` stores source notes and manifests when implementation changes depend on external research.
- `npm run research:check` validates committed research notes and manifest references after research-backed data updates.

## Spatial Alignment Contracts

- `PLAYER_RADIUS` is the human-scale horizontal movement capsule. Do not enlarge it to compensate for narrow passages; collision openings must be represented by their visible geometry and tested with the capsule radius subtracted from each jamb.
- Source-backed Blender buildings and their collision blockers share the same mapped footprint. Avoid decorative blocker padding around exact GLB/OSM shells; model a separate blocker only when the asset contains a visibly separate post, wall, stair, or fence.
- `InteractableFixture.raisedFootprint` is the visible walkable deck or roof, not a broad interaction radius or an oriented bounding box around an irregular building. Toggle climbs keep the full player capsule inset on that footprint until the explicit exit interaction.
- Fixture `height` is measured from its support terrain to the rendered floor surface. Broad Blender assets provide `surfaceGroundPoints` from their mapped footprint; `PlayerLocomotion.fixtureElevationAt` averages those samples and cancels local terrain variation so a rigid deck remains flat while the player moves across it.
- Portable-ladder building roofs use `kind: "building"`, the exact collision-shell polygon, and the building obstacle id. Ladder placement is derived from the nearest polygon edge at runtime, allowing the same recoverable ladder to serve every ordinary building without duplicating fixed access points. Structures with authored stairs and non-buildings such as the storage tank remain explicit exclusions.
- Blender generators should tag important navigation meshes with stable `userData.kind` values. Geometry tests should compare those rendered bounds with the blocker, access point, landing, raised footprint, and floor height used by gameplay.

## Direction

Future feature work should keep growing the extracted modules instead of adding more responsibilities to `GameApp` or `WorldBuilder`. When a behavior can be described without DOM or Three.js scene ownership, prefer a focused module with unit tests and let `GameApp` orchestrate it.

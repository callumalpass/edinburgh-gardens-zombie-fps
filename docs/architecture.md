# Architecture

This codebase is organized around a small app shell with gameplay, rendering, and data modules kept as separate as practical.

## Runtime Boundaries

- `src/game/GameApp.ts` owns browser integration, top-level system orchestration, HUD wiring, and the live Three.js scene.
- `src/game/gameConfig.ts` is the single source for cross-system tuning constants such as player movement, stamina costs, wave pacing, bike speeds, and network tick rates.
- `src/game/playerState.ts` creates and resets mutable local player state without duplicating starting values in the app shell.
- `src/game/runtimeTypes.ts` contains runtime entity contracts shared by orchestration code, networking, combat, and interaction handling.
- `src/game/runtime/FrameLoop.ts` owns requestAnimationFrame scheduling, frame delta clamping, and loop cancellation.
- `src/game/runtime/GameEntityStore.ts` owns transient scene-backed gameplay collections, monotonic entity ids, and shared cleanup for restarts and network-authoritative resyncs.
- `src/game/multiplayer/NetworkSession.ts` owns LAN transport lifecycle, host/client role checks, input/action sequencing, snapshot tick cadence, and replicated wave metadata.
- `src/game/multiplayer/RemotePlayerRoster.ts` owns remote-player runtime state, deterministic co-op spawn offsets, remote survivor mesh rebuilds, reset behavior, and scene removal.

## Gameplay Modules

- `src/game/movement.ts` classifies movement surfaces from level path data and exposes player/bike speed curves.
- `src/game/weapons.ts`, `src/game/playerCondition.ts`, `src/game/noise.ts`, `src/game/visibility.ts`, `src/game/loot.ts`, and `src/game/waves.ts` are pure or mostly pure gameplay rules with direct unit coverage.
- `src/game/systems/PlayerLocomotion.ts` applies shared local/remote player movement, sprint gating, bike movement, jump settling, fixture elevation, obstacle bypasses, and skate-bowl exit collision.
- `src/game/systems/WaveDirector.ts` keeps wave pacing independent from the app shell and scene graph.
- `src/game/spatial/` owns reusable spatial acceleration and agent separation logic.

## Rendering Modules

- `src/game/rendering/WorldBuilder.ts` builds the static authored park scene from `LevelData`.
- `src/game/rendering/worldGeometry.ts` owns reusable placement math for polygon cleanup, local/world transforms, support-height sampling, rotated footprint checks, and deterministic detail noise.
- `src/game/rendering/weatherAnchors.ts` derives atmosphere sampling anchors from the level model.
- `src/game/rendering/disposeThreeResources.ts` centralizes disposal of geometries, materials, and textures.
- `src/game/rendering/MeshFactory.ts`, `materials.ts`, `AtmosphereSystem.ts`, `PostProcessingPipeline.ts`, and related files own reusable Three.js presentation concerns.

## Data And Research

- `src/game/levelData.ts` is the source-backed Edinburgh Gardens level model.
- `docs/research/` stores source notes and manifests when implementation changes depend on external research.
- `npm run research:check` validates committed research notes and manifest references after research-backed data updates.

## Direction

Future feature work should keep growing the extracted modules instead of adding more responsibilities to `GameApp` or `WorldBuilder`. When a behavior can be described without DOM or Three.js scene ownership, prefer a focused module with unit tests and let `GameApp` orchestrate it.

# Architecture

This codebase is organized around a small app shell with gameplay, rendering, and data modules kept as separate as practical.

## Runtime Boundaries

- `electron/update-controller.mjs` owns the packaged-desktop release state machine. Electron's main process is the only layer allowed to use `electron-updater`; a narrow preload API exposes read/check/download/install requests, validates their local renderer origin, and broadcasts inert state objects to the web UI. Development and browser builds remain updater-free.
- `src/game/GameApp.ts` owns browser integration, top-level system orchestration, HUD wiring, and the live Three.js scene.
- `src/game/gameConfig.ts` is the single source for cross-system tuning constants such as player movement, stamina costs, wave pacing, bike speeds, and network tick rates.
- `src/game/playerState.ts` creates the canonical `AuthoritativePlayerState` used by the in-process player. Network peers implement the same state contract, so loadout, condition, inventory, sprint, and weapon timing are not separate local-only concepts.
- `src/game/characters.ts` is the canonical selectable-survivor registry and persistence boundary for stable avatar ids, player-facing metadata, asset paths, portraits, and first-person appearance colours.
- `src/game/runtimeTypes.ts` contains runtime entity contracts shared by orchestration code, networking, combat, and interaction handling.
- `src/game/runtime/FrameLoop.ts` owns requestAnimationFrame scheduling, loop cancellation, and both raw and render-safe elapsed time. World/render systems receive a 100 ms cap; authoritative player motion and condition retain up to 250 ms and substep movement at 60 Hz so low render FPS does not slow players or create large collision steps.
- `src/game/runtime/GameEntityStore.ts` owns transient scene-backed gameplay collections, monotonic entity ids, and shared cleanup for restarts and network-authoritative resyncs.
- `src/game/multiplayer/NetworkSession.ts` owns LAN transport lifecycle, host/client role checks, input/action sequencing, overshoot-preserving input/snapshot cadence, and replicated wave metadata. Player snapshots acknowledge the last host-processed input so owning clients can reconcile prediction without replacing local look rotation.
- `src/game/multiplayer/RemotePlayerRoster.ts` owns remote-player runtime state, deterministic co-op spawn offsets, snapshot interpolation for position/yaw/elevation, asynchronous Blender-avatar installation, animation selection, weapon sockets, reset behavior, and scene removal. Bike ownership and positional interactions remain host-authoritative and are replicated in game snapshots.
- `src/game/multiplayer/ClientPositionReconciler.ts` retains duration-bearing client input samples until the host acknowledges them. Clients rebuild predicted movement from the authoritative snapshot plus only the unacknowledged samples while the host independently advances the newest received state on authoritative time.
- `src/game/multiplayer/ClientCameraSmoother.ts` preserves the camera anchor actually presented on screen across reconciliation. It carries the full prediction error forward and decays it on player-authoritative time, preventing snapshot cadence from restarting or clipping the smoothing curve after movement stops.
- `src/game/multiplayer/authoritativeInput.ts` treats movement packets as sampled input state. A delayed burst collapses to its newest command and is advanced once per host frame, preventing packet backlogs from fast-forwarding a player. Stale held inputs are neutralized after a short grace period.

## Co-op Replication Contracts

- The host owns every mutable shared entity. Full snapshots include zombies, pickups, weapon drops, portable world items, placed ladders, distractions, all rideable-bike state, and shared searched/repaired interaction ids.
- Replicated weapon drops own client-side dynamic meshes. Reconciliation rebuilds a mesh if an id changes weapon type, reasserts scene attachment and visibility, disables frustum culling for the small pickup art, and disposes replaced or removed meshes.
- Clients keep their deterministic provisional world while connecting. They do not move until a snapshot containing their assigned player id arrives, and the first accepted snapshot atomically reconciles provisional entities with host state.
- Client movement messages carry a monotonic sequence and prediction duration. The host consumes the newest available input state once per authoritative frame and reports `lastProcessedInputSequence`; clients install authoritative position, velocity, condition, and loadout state before replaying later commands in order.
- Lightweight movement commands run at 60 Hz while full world snapshots remain at 18 Hz. Owning-client camera correction replaces the previous correction instead of accumulating offsets across snapshots, keeping sustained movement responsive without increasing large snapshot traffic.
- Client pickup, drop, ladder, distraction, skateboard, bike, amenity, weapon, and upgrade actions are requests. They mutate gameplay state only on the host and become visible to every peer through the next snapshot.
- Weapon fire is presented immediately on the owning client, then confirmed by the host through ammo/loadout state and a replicated `shotSequence`. `PlayerWeaponSimulation` applies the same cooldown, mount, stamina, reload, and ammunition gate to local and remote players. Monotonic action acknowledgements reject duplicate or reordered requests.
- `tests/multiplayerCoop.spec.ts` runs two lightweight browser game instances through the real WebSocket relay and checks client weapon rendering/fire, action acknowledgement, sustained sprint smoothness, stamina recovery, and client/host convergence.

## Gameplay Modules

- `src/game/movement.ts` classifies movement surfaces from level path data and exposes player/bike speed curves.
- `src/game/weapons.ts`, `src/game/playerCondition.ts`, `src/game/noise.ts`, `src/game/visibility.ts`, `src/game/loot.ts`, and `src/game/waves.ts` are pure or mostly pure gameplay rules with direct unit coverage.
- `src/game/combat/` owns reusable combat rules that should stay independent of scene orchestration, including hit-zone targeting, melee arcs, ray tests, damage, stagger and zombie memory updates.
- `src/game/systems/PlayerLocomotion.ts` applies shared local/remote player movement, sprint gating, bike movement, jump settling, fixture elevation, obstacle bypasses, and skate-bowl exit collision.
- `src/game/systems/PlayerSimulation.ts` is the role-agnostic player motion boundary used by single-player authority, host simulation of peers, and client prediction/replay. `simulatePlayerCondition` provides the corresponding shared time-based condition step.
- `src/game/systems/PlayerWeaponSimulation.ts` owns authoritative weapon resource mutation and attack gating for every player role.
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

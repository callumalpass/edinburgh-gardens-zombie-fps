# Zombie Character System

## Roster and visual language

The five gameplay archetypes now use original low-poly Blender designs that preserve their existing behavior and hit-zone contracts:

- **Shambler:** uneven posture, matted hair, exposed ribs, a torn shirt tail, and one damaged shoulder.
- **Sprinter:** the narrowest biped silhouette, long limbs, a forward running pose, and faded track stripes.
- **Bloater:** an oversized swollen torso with high-contrast lesions and slower, heavier motion.
- **Crawler:** a separate horizontal eleven-bone rig with a raised pelvis, exposed spine, long front limbs, and ground-level claws.
- **Screamer:** a tall, narrow silhouette with an elongated head and jaw, inflamed throat, and stringy hair.

These are fictional designs built for this game. They do not use external likenesses, scans, purchased meshes, or source photography.

## Blender source and export

Run the generator with Blender 4.5 LTS or newer:

```bash
blender --background --python scripts/blender/build_zombie_characters.py -- \
  --blend-output assets/blender/zombies/edinburgh-gardens-zombies.blend \
  --glb-dir public/models/zombies \
  --manifest-output assets/blender/zombies/edinburgh-gardens-zombies.asset.json \
  --render-output tmp/blender-audit/zombies
```

The editable `.blend`, five runtime GLBs, and asset manifest are reproducibly generated. Each archetype exports as one multi-material skinned mesh and one armature. Bipeds use 18 bones and the in-place clips `Idle`, `Move`, `Chase`, `Attack`, `Stagger`, and `Scream`. The crawler uses its own 11-bone rig and the same contract except `Scream`, which its gameplay type does not request.

Each biped owns uniquely prefixed Blender actions. `ZombieAsset.ts` removes the prefix at load time so all types expose the same runtime clip names. This avoids Blender's action exporter dropping a currently active animation when several armatures share one action datablock.

## Design iterations

The generator renders front, three-quarter, side, and rear audit views before export. The accepted third pass is under the local ignored path `tmp/blender-audit/zombies-v3/`.

- V1 established the archetypes, but the crawler read as table-like and the three upright narrow types were too similar.
- V2 raised and articulated the crawler, strengthened shambler asymmetry, emphasized the sprinter's running line, and enlarged the bloater and screamer signature features. A live in-game lineup confirmed all five silhouettes at combat distance and under the game's painterly lighting.
- V3 retained the accepted shapes but gave every biped its own complete action set after GLB re-import exposed missing shared clips. All five exports were re-imported in Blender to verify one armature, one skinned mesh, the expected bone count, and every required action.

## Runtime

`ZombieAsset.ts` caches GLB templates, performs skeleton-safe cloning, clones disposable geometry and materials per instance, and reapplies the painterly material treatment. `GameApp` keeps the existing procedural zombie visible while an asset loads and as a failure fallback, then replaces only the visual children so entity identity, navigation, health, radius, hit zones, targeting, and network state remain authoritative.

Animation is selected from existing AI state. Wander, search, and investigate use `Move`; pursuit uses `Chase`; hits use `Stagger`; attacks and screamer calls trigger one-shot clips. Mixers update every frame nearby, at 15 Hz beyond 55 metres, and at 6 Hz beyond 100 metres. The existing instanced contact-shadow system remains separate from the character meshes.

## Validation

- `tests/zombieAssets.test.ts` validates roster completeness, mesh and triangle budgets, GLB sizes, runtime authority constraints, and animation transitions.
- `tests/zombieAvatarSystem.spec.ts` spawns all five types in a live game, waits for their GLBs, verifies active animation state, and captures a gameplay-distance roster image.
- Blender re-import verifies 18-bone biped rigs with all six clips and an 11-bone crawler with its five clips.
- The generated GLBs range from roughly 2,000 to 3,100 triangles each and remain below the 550 KB per-character test budget.

# Character System

## Survivor roster

`src/game/characters.ts` is the canonical registry for selectable survivors. It owns stable avatar ids, player-facing names and roles, GLB and portrait paths, first-person sleeve/skin colours, normalization, and local persistence under `egll.avatarId`.

The initial roster is:

- Milo Reed, a young trail scout with light-brown curls, an ochre neckerchief and a weathered Australian bush hat inspired by the broad curled-brim silhouette associated with Crocodile Dundee.
- Asha Bell, a community medic with a bluegum head wrap, rain shell, armband and field satchel.
- Jules Nguyen, a park keeper with a work jacket, utility belt and pouches.
- Maeve Costa, a bike courier with a helmet, windbreaker, bobbed hair and reflective ankle bands.

These are original fictional designs. They do not use external likenesses, scans, purchased character meshes, or source photography.

## Blender source and export

Run the generator with Blender 4.5 LTS or newer:

```bash
blender --background --python scripts/blender/build_player_characters.py -- \
  --blend-output assets/blender/characters/edinburgh-gardens-survivors.blend \
  --glb-dir public/models/characters \
  --manifest-output assets/blender/characters/edinburgh-gardens-survivors.asset.json \
  --render-output tmp/blender-audit/player-characters \
  --portrait-output public/images/avatars
```

The editable `.blend`, runtime GLBs, UI portraits, and asset manifest are reproducibly generated. Each character is a single multi-material skinned mesh with an 18-bone armature and a `WeaponSocket` parented to the right hand. The shared in-place clips are `Idle`, `Walk`, `Run`, `Crouch`, `CrouchWalk`, `Aim`, `Melee`, `Reload`, `Jump`, and `Downed`.

The generator renders front, three-quarter, side and rear audit views before export. The accepted fourth design pass is under the local ignored path `tmp/blender-audit/player-characters-v4/`. Earlier passes were retained locally for comparison:

- V1 established the four silhouettes but gave Milo an overly tall, costume-like hat and crowded his face with curls.
- V2 shortened and thickened the hat, reduced the brim spikes, moved curls toward the sides and rear, and corrected Asha's head wrap to bluegum.
- V3 removed raised crown details that read as horns and corrected the armature-parent hierarchy so GLB export no longer warned about the skinned mesh.
- V4 corrected portrait lighting after live launch-screen inspection showed that the transparent render pass had hidden its lights with the floor.

## Runtime

`CharacterAsset.ts` caches GLB templates, performs skeleton-safe cloning, gives each instance disposable geometry/materials, reapplies the painterly material treatment, and returns the named animation clips.

`RemotePlayerRoster.ts` keeps a lightweight placeholder only while an asset is loading or when loading fails. Loaded avatars cross-fade between network-driven locomotion states, use one-shot melee/reload/jump clips, retain a downed pose for revivable teammates, and attach the existing procedural weapons to `WeaponSocket`.

Avatar identity is included in:

- launch-menu persistence and URL parameters;
- Electron host launch URLs;
- the LAN `hello`/`peerJoined` handshake;
- authoritative player snapshots; and
- first-person sleeve, cuff, glove and skin colours.

Avatar art remains separate from player collision and combat geometry.

## Validation

- `tests/characters.test.ts` validates registry completeness, the required Milo features, normalization and persistence.
- `tests/remotePlayerRoster.test.ts` validates asynchronous asset installation, weapon sockets, animation transitions and avatar replacement.
- `tests/networkSession.test.ts` validates avatar identity propagation through host peer events.
- `tests/avatarSystem.spec.ts` validates desktop/mobile selection, keyboard navigation, persistence, portrait loading, runtime GLB loading, animation activation and socketed weapons.
- Re-importing `milo-reed.glb` in Blender verifies one armature, 18 bones, the skinned mesh, `WeaponSocket`, and all ten named actions.

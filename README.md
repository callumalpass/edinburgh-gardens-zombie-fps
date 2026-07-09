# Edinburgh Gardens 2030

A browser-based Three.js first-person zombie shooter set in an expanded playable version of Edinburgh Gardens, Fitzroy North.

## Run

```bash
npm install
npm run dev
```

See [docs/architecture.md](docs/architecture.md) for the current runtime, gameplay, rendering and data boundaries.

## Desktop LAN Co-op

The Electron app is the preferred LAN multiplayer path. It bundles the game, serves the web build over HTTP for browser clients, and can start the WebSocket relay on the host machine.

```bash
npm run electron
```

Choose **Host LAN** on the host machine. The app starts the relay, shows a short **Host IP** such as `192.168.1.42`, and shows a browser URL served from the host machine. Other Electron clients should choose **Join LAN** and pick the discovered host.

In the desktop app, clients normally do not need to type the long address. **Join LAN** scans the local network and lists available hosts. If discovery is blocked by the network or firewall, type the host machine's short **Host IP** shown on the host screen, for example `192.168.1.42`; the app fills in the WebSocket port automatically.

## Browser LAN Co-op

Run the browser dev server on the local network and start the WebSocket relay:

```bash
npm run dev:lan
npm run multiplayer
```

On the host browser, choose **Host LAN** from the launch menu or open:

```text
http://HOST_LAN_IP:5480/?lan=host&name=Host
```

Other players on the same network can choose **Join LAN** from the launch menu and enter the host IP, or open:

```text
http://HOST_LAN_IP:5480/?lan=join&server=ws://HOST_LAN_IP:5488&name=Player
```

The host browser is authoritative for zombies, waves, pickups, weapon drops, damage and loot. Joined browsers send movement/actions to the host and render host snapshots.

A public HTTPS web deployment is intended for single-player and demos. Browser LAN joining works best from the host machine's HTTP-served URL; public HTTPS pages cannot reliably connect to a plain `ws://` LAN relay.

## Release Packaging

```bash
npm run package
```

This runs one Vite build, stages the static web artifact in `release/web`, and packages the Electron desktop artifact under `release/desktop`.

## Controls

- `WASD`: move
- Mouse: look
- Click: fire
- `R`: reload
- `E`: interact, buy nearby upgrades, climb/drop from fixtures
- `Shift`: sprint
- `G`: throw a timed bottle bomb
- `I`: open/close inventory menu
- `V`: mount or step off a carried skateboard
- `X`: take loose weapons and world items, or remove placed ladders
- Number keys: switch discovered weapons
- `1-3` during intermission: choose one free field modification
- `Esc`: pause solo play or release local controls during a LAN session

The pause menu includes mouse sensitivity, field of view, volume and high-contrast HUD settings. In LAN play the world continues while an individual player has the menu open.

## CLI Game Automation

The game exposes a browser-side debug bridge at `window.__EGAME_TOOLS__` when the app is running. Use the Playwright-backed CLI to launch a controlled game session, inspect state, and run gameplay commands:

```bash
npm run game:cli -- snapshot
npm run game:cli -- spawn 5
npm run game:cli -- teleport x=0 z=0
npm run game:cli -- --headed repl
```

The CLI defaults to `http://127.0.0.1:5480/?smoke=1`, starts Vite automatically when needed, and cleans up the browser/server after one-shot commands. Run `npm run game:cli -- list` for the available command surface.

## Current Mechanics

- Larger playable scale using the full OSM park boundary at a 1.28x expanded map scale.
- Vicmap-derived elevation samples shape a terrain grid, so the lawns, paths and fixtures follow broad real-world rise/fall instead of a flat plane.
- Faster park traversal tuned for the larger playable gardens: brisk walk plus sprint without returning to the old arcade-scale speed.
- Denser OSM-derived internal path network, including the rail trail, oval loop, crescent paths, playground connectors, perimeter walks and smaller garden loops.
- OSM-mapped building footprints add the Emely Baker Centre, south amenities/service building, bowling club rooms, tennis club rooms, oval gatehouse, smaller sheds and a mapped fence segment.
- Exact mapped tree placement from 126 current OpenStreetMap `natural=tree` nodes inside Edinburgh Gardens, with no procedural filler trees or coordinate jitter.
- City of Yarra significant-tree records add exact-coordinate species/scale detail for notable Dutch elms, gums and oaks.
- More varied tree models with tapered trunks, branch cylinders, species-specific bark/leaf colour and overlapping broad canopies.
- Fitted collision for the Kevin Murray Stand, so the narrow stand blocks itself without sealing the open lawn behind it.
- Interactive fixtures: climb/drop from the rotunda, grandstand seating, playground towers, toilet block roofs and basketball hoop frame; skate ramps lift the player as traversable terrain.
- Mapped park amenities: benches, drinking fountains, bins, bike racks, BBQ points and toilets are visible in the world and usable for healing, scrap, ammo or shelter.
- Discoverable weapons: carbine, shotgun, SMG and rifle. Zombies can drop weapons after death.
- Throwable bottle bombs: scarce scavenged tools pulse to draw zombies, then burst for area damage, shove and stagger against clustered packs.

## Research Basis

The level layout is grounded in:

- Yarra City Council's Edinburgh Gardens page for size, access and facility list.
- OpenStreetMap way `13815924` for the park boundary and OSM feature geometry for W.T. Peterson Oval, Fitzroy Tennis Club, Fitzroy Victoria Bowling & Sports Club, the Inner Circle Rail Trail, internal paths, mapped amenities, basketball, skate area, playgrounds, toilets, Kevin Murray Stand and the current `natural=tree` nodes.
- City of Yarra significant trees dataset for species, height and diameter data on notable park trees.
- The 3068 Group's heritage review archive for elm avenues, nineteenth-century path structure, the former railway/shared path, W.T. Peterson Oval and rotunda significance.
- Melbourne Playgrounds for a facility cross-check, including rotunda, BBQs, courts, bowls, skate park, playgrounds, table tennis and sports fields.
- Vicmap Elevation metro 1-5 m contour and ground-surface point data for broad terrain height.

See [docs/edinburgh-gardens-research.md](docs/edinburgh-gardens-research.md) for source URLs, query notes, data licensing notes and implementation decisions.

The game is not a survey-grade model. It expands the gardens to a playable scale while preserving the recognizable crescent boundary, west-side oval and sporting cluster, former rail trail, north/south playgrounds, eastern open lawn, broad terrain profile and mature avenue structure.

# Edinburgh Gardens: Last Light

A browser-based Three.js first-person zombie shooter set in an expanded playable version of Edinburgh Gardens, Fitzroy North.

## Run

```bash
npm install
npm run dev
```

## Controls

- `WASD`: move
- Mouse: look
- Click: fire
- `R`: reload
- `E`: interact, buy nearby upgrades, pick up weapons, climb/drop from fixtures
- `Shift`: sprint
- `1-4`: switch discovered weapons

## Current Mechanics

- Larger playable scale using the full OSM park boundary at a less compressed world scale.
- Denser OSM-derived internal path network, including the rail trail, oval loop, crescent paths, playground connectors, perimeter walks and smaller garden loops.
- Exact mapped tree placement from 126 current OpenStreetMap `natural=tree` nodes inside Edinburgh Gardens, with no procedural filler trees or coordinate jitter.
- City of Yarra significant-tree records add exact-coordinate species/scale detail for notable Dutch elms, gums and oaks.
- More varied tree models with tapered trunks, branch cylinders, species-specific bark/leaf colour and overlapping broad canopies.
- Fitted collision for the Kevin Murray Stand, so the narrow stand blocks itself without sealing the open lawn behind it.
- Interactive fixtures: climb/drop from the rotunda, grandstand seating, playground towers, toilet block roofs and basketball hoop frame; skate ramps lift the player as traversable terrain.
- Mapped park amenities: benches, drinking fountains, bins, bike racks, BBQ points and toilets are visible in the world and usable for healing, scrap, ammo or shelter.
- Discoverable weapons: carbine, shotgun, SMG and rifle. Zombies can drop weapons after death.

## Research Basis

The level layout is grounded in:

- Yarra City Council's Edinburgh Gardens page for size, access and facility list.
- OpenStreetMap way `13815924` for the park boundary and OSM feature geometry for W.T. Peterson Oval, Fitzroy Tennis Club, Fitzroy Victoria Bowling & Sports Club, the Inner Circle Rail Trail, internal paths, mapped amenities, basketball, skate area, playgrounds, toilets, Kevin Murray Stand and the current `natural=tree` nodes.
- City of Yarra significant trees dataset for species, height and diameter data on notable park trees.
- The 3068 Group's heritage review archive for elm avenues, nineteenth-century path structure, the former railway/shared path, W.T. Peterson Oval and rotunda significance.
- Melbourne Playgrounds for a facility cross-check, including rotunda, BBQs, courts, bowls, skate park, playgrounds, table tennis and sports fields.

The game is not a survey-grade model. It compresses the gardens to a playable scale while preserving the recognizable crescent boundary, west-side oval and sporting cluster, former rail trail, north/south playgrounds, eastern open lawn and mature avenue structure.

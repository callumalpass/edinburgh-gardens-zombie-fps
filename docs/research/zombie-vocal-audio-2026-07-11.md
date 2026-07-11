# Zombie Vocal Audio Rework — 2026-07-11

## Sources

- OpenGameArt, “Zomby sfx pack” by saturn91: https://opengameart.org/content/zomby-sfx-pack
  - Six short microphone-recorded zombie calls.
  - The page marks the pack CC0, describes the recordings as the author's own voice and recommends randomized playback pitch.
- OpenGameArt, “Undead Moans” by AntumDeluge: https://opengameart.org/content/undead-moans
  - Four mono undead moans distributed as Ogg Vorbis in a ZIP archive.
  - The page and included license identify the recordings as CC0.
- Creative Commons, CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/

## Findings

- The existing zombie vocals were deterministic oscillator sweeps layered with filtered procedural noise. Zombie timing varied, but repeated cues retained the same pitch contour and electronic timbre.
- Short recorded performances provide irregular breath, throat and mouth detail that synthesis did not reproduce convincingly.
- Neither source pack labels clips by creature type or gameplay intent. They are therefore treated as a shared raw-performance pool rather than evidence for a particular zombie archetype.
- Dense hordes become less threatening when every agent vocalizes independently. A small global vocal budget and tighter budget for idle groans preserves directional threat cues and silence between calls.

## Implementation Translation

- The ten source performances were converted to mono 44.1 kHz Vorbis, normalized to -18 LUFS with a -2 dB true-peak ceiling, and committed under `public/audio/zombies/`.
- Runtime treatments provide the game-specific identities:
  - shambler: slowed, dark and lightly distorted;
  - sprinter: faster, brighter and breath-led;
  - bloater: substantially slowed, low-passed and reinforced below the voice;
  - crawler: narrowed, heavily distorted and accompanied by scraping/click detail;
  - screamer: raised, bright and layered with a high-frequency shriek component.
- Cue-specific pools distinguish groan, attack, pain, death and scream usage. Immediate repetition of the same clip for the same type/cue pair is prevented.
- Non-lethal firearm and melee hits now trigger pain vocals and delay the next ambient groan. Death remains a separate cue.
- Ordinary zombie vocals are capped at six overlaps and ambient groans at three. The screamer's reinforcement call bypasses that budget as a priority gameplay cue. Distant groans receive a longer inter-call gap than close groans.
- If fetch or decode fails, the original procedural vocal functions remain the fallback.

## Uncertainty

- Perceived horror is subjective and depends on speaker/headphone response. The treatments are intentionally conservative enough to keep speech-band directional information audible.
- The source packs contain a limited set of performers. Pitch, filtering and cue rotation increase variety but do not equal a dedicated multi-performer recording session.
- Source clip labels do not establish idle/attack/pain/death intent. The cue mapping is an implementation choice based on duration and delivery, not source metadata.

## Validation

- `ffprobe` confirmed ten readable mono Vorbis files between 1.07 and 2.28 seconds; their combined installed size is approximately 208 KiB.
- `npm run build` confirmed TypeScript compilation, Vite packaging and copying of all ten files into `dist/audio/zombies/`.
- `npm run test:run -- tests/audio.test.ts` validates type-treatment separation and pain/death cue ranges.
- `npm run research:check` validates this note, its sources and the registered optional raw downloads.

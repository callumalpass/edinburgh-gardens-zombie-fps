import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outDir = path.resolve(process.argv[2] ?? "docs/research/renders/object-previews/2026-07-06-realism-audit");

await mkdir(outDir, { recursive: true });

const sheets = [
  {
    name: "facade-placement-audit",
    svg: facadeSheet()
  },
  {
    name: "works-and-tree-audit",
    svg: worksSheet()
  },
  {
    name: "weapon-zombie-silhouette-audit",
    svg: silhouetteSheet()
  },
  {
    name: "weather-night-audit",
    svg: weatherSheet()
  },
  {
    name: "public-use-rule-sign-audit",
    svg: publicUseSheet()
  }
];

for (const sheet of sheets) {
  const svgPath = path.join(outDir, `${sheet.name}.svg`);
  const pngPath = path.join(outDir, `${sheet.name}.png`);
  await writeFile(svgPath, sheet.svg);
  await execFileAsync("magick", [svgPath, pngPath]);
  console.log(`Wrote ${path.relative(process.cwd(), pngPath)}`);
}

function svgShell(title, body, width = 1600, height = 1040) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#eeece3"/>
  <style>
    .title { font: 700 34px system-ui, sans-serif; fill: #17201a; }
    .label { font: 700 20px system-ui, sans-serif; fill: #17201a; }
    .small { font: 500 15px system-ui, sans-serif; fill: #384139; }
    .tiny { font: 500 12px system-ui, sans-serif; fill: #4c554c; }
    .panel { fill: #faf9f1; stroke: #c9c5b6; stroke-width: 2; }
    .note { fill: #f6f2df; stroke: #d5c488; stroke-width: 1.5; }
  </style>
  <text x="44" y="54" class="title">${escapeXml(title)}</text>
  ${body}
</svg>`;
}

function facadeSheet() {
  const content = `
  ${buildingPanel(54, 96, "Fitzroy Tennis Club", "#a8b0aa", "#6f7567", [
    rect(42, 96, 360, 116, "#8a938b"),
    rect(24, 64, 396, 32, "#a3aaa2"),
    rect(48, 130, 82, 58, "#071217"),
    rect(162, 130, 82, 58, "#071217"),
    rect(276, 130, 82, 58, "#071217"),
    textBox(246, 118, 120, 34, "TENNIS", "#2f735c"),
    textBox(318, 230, 82, 30, "WORKS", "#e36e2f", "#18110b"),
    rect(238, 216, 172, 74, "#e36e2f", 0.36),
    line(246, 216, 394, 290, "#4d5551", 4),
    line(394, 216, 246, 290, "#4d5551", 4)
  ], "Awning, rear windows, court lockers and orange 2026 works mesh sit on the long OSM footprint axis.")}

  ${buildingPanel(574, 96, "Fitzroy Victoria Bowling Club", "#a95846", "#6f7567", [
    rect(36, 88, 372, 136, "#a95846"),
    rect(40, 66, 364, 28, "#8c613d"),
    textBox(158, 112, 142, 34, "BOWLS", "#223f64", "#f3d47d"),
    rect(54, 136, 68, 48, "#071217"),
    rect(142, 136, 68, 48, "#071217"),
    rect(230, 136, 68, 48, "#071217"),
    rect(324, 126, 46, 108, "#234f88"),
    rect(368, 126, 36, 108, "#7b263b"),
    circle(346, 184, 18, "#d0a13a"),
    line(326, 148, 390, 202, "#4c8f55", 5),
    line(326, 202, 390, 150, "#4c8f55", 5)
  ], "Mural colors, flora strokes and the gold club/lion cue match the public-art source while staying minimal.")}

  ${buildingPanel(1094, 96, "Emely Baker Centre", "#a95846", "#6f7567", [
    rect(42, 86, 352, 138, "#a95846"),
    rect(72, 126, 58, 58, "#071217"),
    rect(156, 126, 58, 58, "#071217"),
    rect(240, 126, 58, 58, "#071217"),
    rect(324, 126, 44, 58, "#071217"),
    textBox(244, 92, 132, 34, "EMELY", "#315d67"),
    polygon("90,284 228,226 352,268 196,326", "#c8d3cf", 0.86),
    line(80, 296, 386, 296, "#4f5e56", 5),
    line(312, 252, 390, 252, "#4f5e56", 5),
    textBox(68, 246, 92, 24, "BOOKED", "#315d67")
  ], "Gated outdoor area and shade sail are placed behind the room footprint, consistent with the venue page.")}

  ${buildingPanel(314, 572, "South Amenities", "#9ca19a", "#6f7567", [
    rect(42, 86, 352, 132, "#9ca19a"),
    rect(74, 120, 66, 94, "#3f5556"),
    rect(174, 120, 66, 94, "#3f5556"),
    rect(274, 120, 66, 94, "#3f5556"),
    textBox(150, 72, 156, 38, "TOILETS", "#246ca8"),
    rect(58, 78, 54, 28, "#246ca8"),
    circle(362, 92, 10, "#f0b85d"),
    rect(308, 36, 46, 24, "#94a3a2"),
    rect(242, 32, 46, 24, "#94a3a2")
  ], "Door bank, accessible sign, wall light, gutters and roof vents remain aligned to the mapped amenities building.")}
`;
  return svgShell("Building Facade Placement Audit", content);
}

function worksSheet() {
  const content = `
  <g transform="translate(70 112)">
    <rect class="panel" x="0" y="0" width="460" height="360" rx="8"/>
    <text x="24" y="44" class="label">2026 Tennis Works Mesh</text>
    ${rect(42, 122, 360, 92, "#e36e2f", 0.34)}
    ${line(42, 122, 402, 214, "#4d5551", 7)}
    ${line(402, 122, 42, 214, "#4d5551", 7)}
    ${rect(42, 112, 360, 10, "#4d5551")}
    ${rect(42, 214, 360, 10, "#4d5551")}
    ${[42, 102, 162, 222, 282, 342, 402].map((x) => rect(x - 4, 98, 8, 146, "#4d5551")).join("")}
    ${textBox(224, 140, 108, 36, "WORKS", "#e36e2f", "#18110b")}
    ${noteText(24, 298, 398, "Temporary mesh and warning sign reflect the active 2026-2027 tennis precinct works.", "small", 18)}
  </g>

  <g transform="translate(570 112)">
    <rect class="panel" x="0" y="0" width="460" height="360" rx="8"/>
    <text x="24" y="44" class="label">Synthetic Court Rolls</text>
    ${rect(84, 242, 280, 24, "#8c613d")}
    ${[0, 1, 2].map((i) => roll(118, 126 + i * 44, 230, "#3f8068")).join("")}
    ${rect(146, 108, 12, 160, "#202b2d")}
    ${rect(292, 108, 12, 160, "#202b2d")}
    ${textBox(252, 52, 116, 32, "COURTS", "#223f64")}
    ${noteText(24, 298, 398, "Stacked surfacing rolls translate the documented synthetic-court construction without adding collision.", "small", 18)}
  </g>

  <g transform="translate(1070 112)">
    <rect class="panel" x="0" y="0" width="460" height="360" rx="8"/>
    <text x="24" y="44" class="label">Suppressed Tree Stumps</text>
    ${circle(230, 202, 92, "#b59a66", 0.58)}
    ${rect(202, 150, 56, 84, "#6f5137")}
    ${circle(230, 148, 36, "#b99564")}
    ${[0, 1, 2, 3].map((i) => line(230, 210, 230 + Math.cos(i * Math.PI / 2 + 0.3) * 92, 210 + Math.sin(i * Math.PI / 2 + 0.3) * 62, "#6f5137", 12)).join("")}
    ${noteText(24, 298, 398, "Seven OSM tree nodes removed by the redevelopment plan are shown as low stump cues.", "small", 18)}
  </g>

  <g transform="translate(70 548)">
    <rect class="panel" x="0" y="0" width="460" height="306" rx="8"/>
    <text x="24" y="44" class="label">Six Existing Courts Under Renovation</text>
    ${rect(64, 92, 330, 150, "#408a72")}
    ${rect(64, 92, 165, 150, "#2f715f", 0.34)}
    ${rect(229, 92, 165, 150, "#65a17e", 0.38)}
    ${line(229, 92, 229, 242, "#e8ddad", 5)}
    ${line(82, 112, 376, 112, "#e8ddad", 4)}
    ${line(82, 222, 376, 222, "#e8ddad", 4)}
    ${line(82, 92, 82, 242, "#e8ddad", 4)}
    ${line(376, 92, 376, 242, "#e8ddad", 4)}
    ${circle(350, 130, 12, "#d8783c")}
    ${rect(318, 214, 48, 16, "#d8783c")}
    ${noteText(24, 252, 398, "Every OSM tennis court keeps its real footprint and gets a cheap resurfacing state from the Yarra works source.", "small", 18)}
  </g>

  <g transform="translate(570 548)">
    <rect class="panel" x="0" y="0" width="460" height="306" rx="8"/>
    <text x="24" y="44" class="label">Grandstand Secure Gate Works</text>
    ${rect(80, 136, 300, 82, "#e36e2f", 0.28)}
    ${rect(80, 128, 300, 10, "#4d5551")}
    ${rect(80, 218, 300, 10, "#4d5551")}
    ${rect(218, 136, 24, 88, "#4d5551")}
    ${rect(248, 170, 34, 34, "#94a3a2")}
    ${textBox(172, 148, 116, 34, "WORKS", "#e36e2f", "#18110b")}
    ${noteText(24, 252, 398, "Secure gate cue follows the public grandstand upgrade scope.", "small", 18)}
  </g>

  <g transform="translate(1070 548)">
    <rect class="panel" x="0" y="0" width="460" height="306" rx="8"/>
    <text x="24" y="44" class="label">Broken and Rideable Bikes</text>
    ${bike(70, 100, "#244a42", "flat tyre")}
    ${bike(262, 100, "#244a42", "clean")}
    ${noteText(24, 252, 398, "Bike shape now has frame triangles, spokes, rack, chain, saddle and issue-specific damage.", "small", 18)}
  </g>`;
  return svgShell("Works, Tree and Item Shape Audit", content);
}

function silhouetteSheet() {
  const weapons = [
    ["Knife", 80, 190, 82],
    ["Machete", 312, 190, 142],
    ["Carbine", 580, 190, 150],
    ["Shotgun", 860, 190, 184],
    ["SMG", 1160, 190, 118],
    ["Rifle", 1370, 190, 216]
  ];
  const zombies = [
    ["Shambler", 110, 685, 1],
    ["Sprinter", 390, 685, 0.82],
    ["Bloater", 690, 685, 1.28],
    ["Crawler", 1000, 750, 0.62],
    ["Screamer", 1290, 685, 1.04]
  ];
  const content = `
  <text x="58" y="98" class="label">Weapon silhouettes used by MeshFactory</text>
  ${weapons.map(([name, x, y, length]) => weaponSilhouette(name, x, y, length)).join("")}
  <text x="58" y="428" class="label">Zombie role silhouettes used by MeshFactory</text>
  ${zombies.map(([name, x, y, scale]) => `${zombieSilhouette(name, x, y, scale)}<text x="${x - 56}" y="836" class="small">${escapeXml(name)}</text>`).join("")}
  <rect class="note" x="58" y="908" width="1484" height="62" rx="6"/>
  ${noteText(80, 930, 1420, "Static fallback sheet generated because browser WebGL capture is blocked in this sandbox. Proportions mirror the runtime role distinctions: bulk, posture, reach, optics, magazines and barrel length.", "small", 18)}`;
  return svgShell("Weapon and Zombie Silhouette Audit", content);
}

function weatherSheet() {
  const content = `
  <g transform="translate(76 124)">
    <rect class="panel" x="0" y="0" width="680" height="702" rx="8"/>
    <text x="28" y="48" class="label">Clear Day Material State</text>
    ${swatchRow(48, 110, "Grass", "#6f8f62")}
    ${swatchRow(48, 184, "Path", "#a48f68")}
    ${swatchRow(48, 258, "Asphalt", "#293c45")}
    ${swatchRow(48, 332, "Concrete", "#9ca19a")}
    ${swatchRow(48, 406, "Timber", "#8c613d")}
    ${swatchRow(48, 480, "Brick", "#a95846")}
    ${lampDiagram(424, 172, 0.18)}
    ${noteText(48, 618, 584, "Daylight keeps lamps nearly off and leaves shared toon materials at their base palette.", "small", 18)}
  </g>

  <g transform="translate(844 124)">
    <rect class="panel" x="0" y="0" width="680" height="702" rx="8"/>
    <text x="28" y="48" class="label">Rainy Night Material State</text>
    ${swatchRow(48, 110, "Grass", "#557554")}
    ${swatchRow(48, 184, "Path", "#71654f")}
    ${swatchRow(48, 258, "Asphalt", "#182d35")}
    ${swatchRow(48, 332, "Concrete", "#778485")}
    ${swatchRow(48, 406, "Timber", "#674b35")}
    ${swatchRow(48, 480, "Brick", "#7a3f38")}
    ${lampDiagram(424, 172, 1)}
    ${noteText(48, 618, 584, "Wetness darkens hard surfaces, brightens lamp spill and lifts facade light intensity.", "small", 18)}
  </g>`;
  return svgShell("Weather and Night Dynamics Audit", content);
}

function publicUseSheet() {
  const content = `
  <g transform="translate(70 118)">
    <rect class="panel" x="0" y="0" width="460" height="356" rx="8"/>
    <text x="24" y="44" class="label">Dog-Leash Edge Signs</text>
    ${ruleSign(76, 58, "LEASH", "#315c45", "#f4dfa6", "leash")}
    ${ruleSign(256, 58, "LEASH", "#315c45", "#f4dfa6", "leash")}
    ${noteText(24, 298, 398, "Placed at the north playground, south playground and W.T. Peterson Oval edges, translating Yarra dog conditions into visible park cues.", "small", 18)}
  </g>

  <g transform="translate(570 118)">
    <rect class="panel" x="0" y="0" width="460" height="356" rx="8"/>
    <text x="24" y="44" class="label">Picnic Alcohol Hours</text>
    ${ruleSign(164, 58, "9-9", "#5c4630", "#f4dfa6", "alcohol")}
    ${noteText(24, 298, 398, "South picnic lawn sign keeps the 9am to 9pm alcohol condition visible without blocking movement or adding UI text.", "small", 18)}
  </g>

  <g transform="translate(1070 118)">
    <rect class="panel" x="0" y="0" width="460" height="356" rx="8"/>
    <text x="24" y="44" class="label">Rotunda Stair and No-Power Cue</text>
    ${ruleSign(164, 58, "STAIRS", "#5a4630", "#f4dfa6", "rotunda")}
    ${noteText(24, 298, 398, "The sign sits on the stair side, reinforcing the rendered stair access and the Yarra venue page's no-power constraint.", "small", 18)}
  </g>

  <g transform="translate(320 548)">
    <rect class="panel" x="0" y="0" width="460" height="322" rx="8"/>
    <text x="24" y="44" class="label">Emely Baker Access-Friendly Cue</text>
    ${ruleSign(164, 48, "ACCESS", "#246ca8", "#f4dfa6", "access")}
    ${noteText(24, 264, 398, "The sign is placed near the community-room edge, matching the existing access ramp and gated outdoor-area details.", "small", 18)}
  </g>

  <g transform="translate(820 548)">
    <rect class="panel" x="0" y="0" width="460" height="322" rx="8"/>
    <text x="24" y="44" class="label">Weather Handling Check</text>
    ${rect(66, 142, 118, 20, "#a48f68")}
    ${line(78, 104, 170, 66, "#61a8d3", 6)}
    ${line(132, 104, 224, 66, "#61a8d3", 6)}
    ${line(186, 104, 278, 66, "#61a8d3", 6)}
    ${simpleRifle(200, 128)}
    ${noteText(24, 264, 398, "Rain, wind and wetness add a small firearm-spread penalty, while crouch and scoped aim remain the dominant stability controls.", "small", 18)}
  </g>`;
  return svgShell("Public-Use Rule Sign and Weather Handling Audit", content);
}

function buildingPanel(x, y, title, wall, roof, elements, note) {
  return `<g transform="translate(${x} ${y})">
    <rect class="panel" x="0" y="0" width="452" height="382" rx="8"/>
    <text x="24" y="42" class="label">${escapeXml(title)}</text>
    ${rect(42, 68, 360, 22, roof)}
    ${elements.join("")}
    ${noteText(24, 318, 404, note, "tiny", 15)}
  </g>`;
}

function weaponSilhouette(name, x, y, length) {
  const blade = name === "Knife" || name === "Machete";
  const displayLength = blade ? length * 0.8 : length * 0.58;
  const barrelLength = blade ? 0 : Math.max(22, displayLength * 0.2);
  return `<g transform="translate(${x} ${y})">
    <rect class="panel" x="-26" y="-54" width="210" height="220" rx="8"/>
    <text x="-6" y="136" class="small">${name}</text>
    ${
      blade
        ? `${rect(48, 18, displayLength, name === "Machete" ? 22 : 14, "#d0ccc0")}${rect(20, 14, 32, 32, "#30251d")}${rect(44, 8, 10, 42, "#221f1c")}`
        : `${rect(16, 8, displayLength, 24, "#363d3b")}${rect(16 + displayLength * 0.62, 36, 22, 58, "#202629")}${rect(16 + displayLength, 14, barrelLength, 10, "#202629")}${rect(36, -4, displayLength * 0.36, 12, "#b08a4a")}`
    }
  </g>`;
}

function ruleSign(x, y, label, background, foreground, mode) {
  const signWidth = label.length > 4 ? 132 : 112;
  const symbols =
    mode === "leash"
      ? `${line(68, 160, 116, 134, foreground, 5)}${circle(132, 130, 12, "none", 1, foreground, 5)}`
      : mode === "alcohol"
        ? `${rect(82, 122, 18, 44, foreground)}${rect(86, 108, 10, 18, foreground)}${line(132, 116, 192, 168, "#b84c3c", 7)}`
        : mode === "rotunda"
          ? `${[0, 1, 2].map((step) => rect(74 + step * 18, 166 - step * 15, 24 + step * 16, 7, foreground)).join("")}${rect(162, 126, 28, 22, "#1d2522")}${line(154, 116, 202, 158, "#b84c3c", 7)}`
          : `${circle(92, 126, 14, foreground)}${rect(92, 144, 48, 7, foreground)}${circle(162, 154, 18, "none", 1, foreground, 5)}`;

  return `<g transform="translate(${x} ${y})">
    ${circle(86, 198, 36, "#9ca19a", 0.42)}
    ${rect(80, 70, 12, 132, "#4d5954")}
    <g>
      ${rect(86 - signWidth / 2, 38, signWidth, 58, background)}
      <text x="86" y="77" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${label.length > 4 ? 22 : 28}" font-weight="800" fill="${foreground}">${escapeXml(label)}</text>
    </g>
    ${symbols}
  </g>`;
}

function simpleRifle(x, y) {
  return `<g transform="translate(${x} ${y})">
    ${rect(0, 0, 160, 24, "#363d3b")}
    ${rect(96, 28, 24, 58, "#202629")}
    ${rect(158, 9, 68, 9, "#202629")}
    ${rect(36, -12, 74, 12, "#b08a4a")}
    ${rect(64, -28, 54, 16, "#202629")}
    ${rect(212, 4, 22, 18, "#202629")}
    <text x="68" y="112" class="tiny">weather spread is small</text>
  </g>`;
}

function zombieSilhouette(name, x, y, scale) {
  const low = name === "Crawler";
  const bulk = name === "Bloater";
  const headY = low ? 20 : -120 * scale;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect class="panel" x="-82" y="-206" width="190" height="276" rx="8" transform="scale(${1 / scale}) translate(${82 - x * 0} ${206 - y * 0})" opacity="0"/>
    ${circle(0, headY, bulk ? 32 : 25, name === "Screamer" ? "#85795e" : "#6f7752")}
    ${rect(bulk ? -44 : -32, low ? -12 : -82, bulk ? 88 : 64, low ? 42 : 106, name === "Bloater" ? "#3f4b3b" : "#4d5548")}
    ${line(-44, low ? -2 : -70, -86, low ? 24 : -22, "#6f7752", 16)}
    ${line(44, low ? -2 : -70, 82, low ? 22 : -28, "#6f7752", 16)}
    ${line(-22, low ? 28 : 24, -42, 66, "#282d2b", 16)}
    ${line(22, low ? 28 : 24, 42, 66, "#282d2b", 16)}
    ${name === "Screamer" ? circle(-10, headY - 4, 6, "#ffe477") + circle(10, headY - 4, 6, "#ffe477") : ""}
  </g>`;
}

function bike(x, y, color, label) {
  return `<g transform="translate(${x} ${y})">
    ${circle(38, 72, 36, "none", 1, "#171c1b", 8)}
    ${circle(158, 72, 36, "none", 1, "#171c1b", 8)}
    ${line(38, 72, 86, 24, color, 7)}
    ${line(86, 24, 128, 72, color, 7)}
    ${line(38, 72, 128, 72, color, 7)}
    ${line(86, 24, 152, 28, color, 7)}
    ${line(152, 28, 158, 72, "#b7c1b8", 6)}
    ${rect(74, 12, 38, 10, "#2f211a")}
    ${line(152, 28, 184, 14, "#b7c1b8", 6)}
    <text x="28" y="136" class="tiny">${escapeXml(label)}</text>
  </g>`;
}

function lampDiagram(x, y, strength) {
  const opacity = 0.1 + strength * 0.38;
  return `<g transform="translate(${x} ${y})">
    ${circle(88, 214, 78, "#c49a55", opacity)}
    ${rect(82, 72, 12, 156, "#768a8d")}
    ${rect(90, 72, 78, 10, "#768a8d")}
    ${circle(168, 82, 18, "#f0d99b", 0.35 + strength * 0.5)}
  </g>`;
}

function swatchRow(x, y, label, color) {
  return `${rect(x, y, 120, 42, color)}<text x="${x + 142}" y="${y + 28}" class="small">${escapeXml(label)}</text>`;
}

function roll(x, y, width, color) {
  return `${rect(x, y, width, 34, color)}${circle(x, y + 17, 17, "#e7e1c4")}${circle(x + width, y + 17, 17, "#e7e1c4")}`;
}

function rect(x, y, width, height, fill, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" opacity="${opacity}"/>`;
}

function circle(x, y, radius, fill, opacity = 1, stroke = "none", strokeWidth = 0) {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function line(x1, y1, x2, y2, stroke, width) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function polygon(points, fill, opacity = 1) {
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`;
}

function textBox(x, y, width, height, label, fill, color = "#f2e6a8") {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/><text x="${x + width / 2}" y="${y + height * 0.68}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.min(18, width / 5)}" font-weight="800" fill="${color}">${escapeXml(label)}</text></g>`;
}

function noteText(x, y, width, text, className = "small", lineHeight = 18) {
  const maxChars = Math.max(18, Math.floor(width / (className === "tiny" ? 7.1 : 8.4)));
  const lines = wrapText(text, maxChars).slice(0, 3);
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" class="${className}">${tspans}</text>`;
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

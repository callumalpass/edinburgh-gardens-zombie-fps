"""Build the 10 July 2026 Alfred Crescent Sports Pavilion asset.

The current shell follows OpenStreetMap way 242003562. Lovell Chen's 2021
Edinburgh Gardens CMP section 3.10.3/Figure 145 and the architect's published
photographs control the 2010 pavilion: pale masonry, green panels, clerestory,
dark shutters, timber soffits and the black corrugated roof ribbon that curls
around the southern end. City of Yarra's public-toilet proposal and completion
report control the later north-west toilet extension, screened wash forecourt
and retained rainwater tank.

Blender -Y is the documented west/public elevation. glTF converts that
direction to Three.js +Z, matching the runtime frontage convention.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-alfred-crescent-pavilion"
ASSET_LENGTH = 45.05949968498282
ASSET_DEPTH = 21.230271351272727
EVIDENCE = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.3/Figure 145; City of Yarra toilet-upgrade plan; ClarkeHopkinsClarke project photographs"

# OSM way 242003562 transformed into the frontage-fitted local frame. World
# local +Z is Blender -Y, hence the negated second coordinate below. The
# asymmetric extents are retained: the asset origin is the polygon centroid,
# exactly as in the runtime fitter, rather than the bounding-box centre.
SHELL_POLYGON = [
    (15.4339, -8.4193),
    (-8.3889, -8.4193),
    (-8.3910, -10.6151),
    (-16.3664, -10.6087),
    (-16.3643, -3.5896),
    (-20.7683, -3.5948),
    (-20.7795, 7.9386),
    (2.3660, 7.9439),
    (2.3652, 8.8539),
    (11.8221, 8.8549),
    (11.8229, 7.9450),
    (18.1569, 7.9423),
    (18.1537, 5.5529),
    (22.5294, 5.5541),
    (22.5298, -3.5919),
    (15.4339, -3.5960),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-output", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def srgb(value: int) -> tuple[float, float, float, float]:
    return (((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1)


def reset() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def relink(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def material(name: str, value: int, roughness: float, metallic: float = 0.0) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = srgb(value)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = srgb(value)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
    return result


def finish(
    obj: bpy.types.Object,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    mat: bpy.types.Material | None,
    kind: str,
    *,
    bevel: float = 0.0,
) -> bpy.types.Object:
    relink(obj, target)
    obj.parent = root
    obj["eg_asset_id"] = ASSET_ID
    obj["eg_kind"] = kind
    obj["eg_evidence"] = EVIDENCE
    if mat is not None and hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    if bevel > 0 and obj.type == "MESH":
        modifier = obj.modifiers.new("Soft painterly edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, target, root, mat, kind, bevel=bevel)


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    vertices: int = 16,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, target, root, mat, kind)


def mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    return finish(obj, target, root, mat, kind)


def polygon_prism(
    name: str,
    polygon: list[tuple[float, float]],
    bottom: float,
    top: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    count = len(polygon)
    vertices = [(x, y, bottom) for x, y in polygon] + [(x, y, top) for x, y in polygon]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    return mesh_object(name, vertices, faces, mat, target, root, kind)


def ribbon_mesh(
    name: str,
    profile: list[tuple[float, float]],
    y_front: float,
    y_rear: float,
    thickness: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    """Extrude a thin x/z roof profile across the pavilion depth."""
    outer = profile
    inner = [(x - (0.16 if index >= len(profile) - 4 else 0), z - thickness) for index, (x, z) in enumerate(profile)]
    loop = outer + list(reversed(inner))
    count = len(loop)
    vertices = [(x, y_front, z) for x, z in loop] + [(x, y_rear, z) for x, z in loop]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return mesh_object(name, vertices, faces, mat, target, root, kind)


def profile_panel(
    name: str,
    profile: list[tuple[float, float]],
    y: float,
    thickness: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    """Make a thin vertical panel from an x/z elevation profile."""
    count = len(profile)
    vertices = [(x, y - thickness * 0.5, z) for x, z in profile] + [(x, y + thickness * 0.5, z) for x, z in profile]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return mesh_object(name, vertices, faces, mat, target, root, kind)


def masonry_joints(
    prefix: str,
    x_start: float,
    x_end: float,
    y: float,
    height: float,
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    width = x_end - x_start
    for row in range(7):
        z = 0.31 + row * 0.34
        box(f"{prefix} bed joint {row + 1}", (width, 0.022, 0.018), ((x_start + x_end) * 0.5, y, z), mats["mortar"], target, root, "masonry-bed-joint")
    for index, x in enumerate([x_start + width * fraction for fraction in (0.16, 0.32, 0.48, 0.64, 0.80)], 1):
        box(f"{prefix} vertical joint {index}", (0.018, 0.022, height), (x, y, height * 0.5 + 0.12), mats["mortar"], target, root, "masonry-perpend-joint")


def glazed_bay(
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    base: float,
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    door: bool = False,
) -> None:
    box(name, (width, 0.075, height), (x, y, base + height * 0.5), mats["glass_dark" if door else "glass"], target, root, "paired-glazed-entry" if door else "aluminium-window", bevel=0.018)
    for side in (-1, 1):
        box(f"{name} jamb {side:+d}", (0.055, 0.11, height + 0.06), (x + side * width * 0.5, y - 0.025, base + height * 0.5), mats["frame"], target, root, "aluminium-frame", bevel=0.009)
    box(f"{name} head", (width + 0.06, 0.11, 0.055), (x, y - 0.025, base + height), mats["frame"], target, root, "aluminium-frame")
    box(f"{name} sill", (width + 0.06, 0.11, 0.055), (x, y - 0.025, base), mats["frame"], target, root, "aluminium-frame")
    box(f"{name} centre mullion", (0.055, 0.11, height), (x, y - 0.03, base + height * 0.5), mats["frame"], target, root, "aluminium-frame")
    if door:
        for side in (-1, 1):
            box(f"{name} pull {side:+d}", (0.025, 0.045, 0.42), (x + side * width * 0.18, y - 0.09, base + height * 0.52), mats["metal"], target, root, "door-pull")


def shutter(
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    box(name, (width, 0.095, height), (x, y, height * 0.5 + 0.18), mats["shutter"], target, root, "roller-shutter", bevel=0.02)
    for index in range(9):
        z = 0.35 + index * (height - 0.28) / 8
        box(f"{name} slat {index + 1:02d}", (width - 0.08, 0.025, 0.026), (x, y - 0.06, z), mats["shutter_edge"], target, root, "roller-shutter-slat")
    for side in (-1, 1):
        box(f"{name} guide {side:+d}", (0.055, 0.14, height + 0.12), (x + side * width * 0.5, y, height * 0.5 + 0.18), mats["frame"], target, root, "shutter-guide")


def add_original_pavilion(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # Original 2010 L-plan: a long public wing and the broader north service
    # wing. The current exact OSM prism below remains the authoritative shell;
    # these masses provide the documented facade articulation within it.
    box("Long pavilion masonry wing", (26.45, 16.55, 3.12), (4.80, 0.10, 1.56), mats["masonry"], target, root, "original-pavilion-wing", bevel=0.055)
    # Stop at x=-16 so the retained rainwater tank remains an exterior object
    # in its documented screened yard rather than being swallowed by a broad
    # rectangular approximation of the OSM return.
    box("North changeroom and service wing", (18.15, 11.20, 2.82), (-6.925, 2.22, 1.41), mats["dark_block"], target, root, "north-service-wing", bevel=0.045)

    # West/public facade: deep timber-lined canopy, paired entrance and the
    # social-room glazing visible in the architect photographs.
    box("West public concrete apron", (28.4, 3.25, 0.08), (4.0, -9.84, 0.04), mats["concrete"], target, root, "accessible-public-apron")
    box("West canopy roof", (27.25, 2.55, 0.18), (4.65, -9.40, 3.02), mats["roof_edge"], target, root, "deep-public-canopy", bevel=0.035)
    box("West canopy timber soffit", (26.85, 2.36, 0.07), (4.65, -9.43, 2.89), mats["timber"], target, root, "timber-canopy-soffit")
    # Preserve a full-width sightline and capsule route to both paired-door
    # groups; the photographs show columns between bays, not centred on them.
    for index, x in enumerate([-6.7, -3.1, -0.3, 3.5, 8.1, 12.8, 16.4], 1):
        box(f"West canopy post {index}", (0.11, 0.11, 2.79), (x, -10.23, 1.40), mats["frame"], target, root, "canopy-post", bevel=0.015)

    glazed_bay("West main paired glass doors", 1.3, -8.55, 2.45, 2.20, 0.14, mats, target, root, door=True)
    glazed_bay("West social-room glass doors", 6.2, -8.55, 2.65, 2.20, 0.14, mats, target, root, door=True)
    glazed_bay("West clubroom window", 10.6, -8.55, 2.75, 1.52, 0.55, mats, target, root)
    box("West pale masonry panel", (3.4, 0.08, 2.52), (15.1, -8.56, 1.38), mats["masonry_pale"], target, root, "pale-masonry-panel", bevel=0.02)
    box("West green fascia band", (24.9, 0.10, 0.48), (4.1, -8.64, 2.57), mats["green"], target, root, "coloured-cladding-band", bevel=0.018)
    for x, width, color in [(-4.8, 3.2, "green_lime"), (0.0, 2.8, "green"), (4.2, 2.5, "green_lime"), (8.2, 2.6, "green"), (12.1, 2.5, "green_lime")]:
        box(f"West articulated green panel {x:+.1f}", (width, 0.025, 0.44), (x, -8.71, 2.57), mats[color], target, root, "coloured-cladding-panel")

    # The east/oval elevation carries the documented shutters and a similar
    # green fascia. It remains flush because the original photos show no
    # west-style deep public canopy here.
    east_face_y = 8.45
    box("East green fascia band", (25.2, 0.10, 0.50), (4.8, east_face_y, 2.54), mats["green"], target, root, "coloured-cladding-band")
    glazed_bay("East clubroom glazing", 12.4, east_face_y + 0.02, 3.2, 1.55, 0.48, mats, target, root)
    shutter("East kiosk roller shutter", 5.7, east_face_y + 0.04, 2.85, 1.72, mats, target, root)
    shutter("East equipment roller shutter", 0.7, east_face_y + 0.04, 2.55, 1.78, mats, target, root)
    for index, x in enumerate([-6.1, -3.0], 1):
        box(f"East timber-panel door {index}", (1.25, 0.09, 2.18), (x, east_face_y + 0.04, 1.23), mats["timber_dark"], target, root, "timber-panel-door", bevel=0.02)
        box(f"East timber-panel door handle {index}", (0.04, 0.06, 0.16), (x + 0.36, east_face_y + 0.10, 1.18), mats["metal"], target, root, "door-handle")

    # Long clerestories above both elevations: published photos prove their
    # rhythm but not construction drawings, so the mullion pitch is fitted.
    for side, y in [("West", -7.86), ("East", 7.86)]:
        box(f"{side} clerestory glass band", (31.5, 0.07, 1.02), (3.0, y, 3.63), mats["clerestory"], target, root, "continuous-clerestory", bevel=0.015)
        for index, x in enumerate([-12.0, -9.0, -6.0, -3.0, 0, 3.0, 6.0, 9.0, 12.0, 15.0, 18.0], 1):
            box(f"{side} clerestory mullion {index:02d}", (0.065, 0.11, 1.06), (x, y - (0.02 if side == "West" else -0.02), 3.63), mats["frame"], target, root, "clerestory-mullion")
        box(f"{side} clerestory head", (31.65, 0.11, 0.07), (3.0, y, 4.15), mats["frame"], target, root, "clerestory-frame")
        box(f"{side} clerestory sill", (31.65, 0.11, 0.07), (3.0, y, 3.11), mats["frame"], target, root, "clerestory-frame")

    # The dark sheet-metal ribbon is the pavilion's defining silhouette. Its
    # profile rises gently from north to south and curls down around the
    # exterior public-toilet end exactly as shown in both long elevations.
    profile = [
        (-16.2, 4.20), (-12.0, 4.32), (-6.0, 4.52), (0.0, 4.72),
        (6.0, 4.92), (12.0, 5.12), (17.4, 5.30), (19.2, 5.26),
        (20.5, 4.72), (21.5, 3.65), (22.2, 2.15), (22.42, 0.50),
    ]
    ribbon_mesh("Black corrugated wraparound roof", profile, -8.70, 8.72, 0.28, mats["roof"], target, root, "wraparound-corrugated-roof")
    # Raised edge ribs make the corrugated roof readable in the painterly
    # renderer without pretending to be a sheet-by-sheet survey.
    for index, y in enumerate([-8.60, -7.35, -6.10, -4.85, -3.60, -2.35, -1.10, 0.15, 1.40, 2.65, 3.90, 5.15, 6.40, 7.65, 8.60], 1):
        box(f"Roof corrugation rib {index:02d}", (33.0, 0.035, 0.035), (0.3, y, 4.73), mats["roof_edge"], target, root, "corrugated-roof-rib", rotation=(0, math.radians(-1.85), 0))

    # The large curved green field belongs to each long elevation beneath the
    # descending black ribbon; the first pass incorrectly put it on the narrow
    # south end plane. Insets prevent z-fighting with the roof edge.
    curved_green_profile = [(17.2, 0.38), (21.90, 0.38), (21.82, 2.18), (21.18, 3.62), (20.10, 4.45), (18.75, 4.82), (17.2, 4.86)]
    profile_panel("West curved-end green field", curved_green_profile, -8.62, 0.05, mats["green"], target, root, "curved-end-green-cladding")
    profile_panel("East curved-end green field", curved_green_profile, 8.64, 0.05, mats["green"], target, root, "curved-end-green-cladding")

    # Curved southern end, with the two existing DDA toilet doors explicitly
    # retained by the later council plan.
    box("South curved-end charcoal infill", (0.10, 9.0, 3.75), (22.18, 1.02, 2.18), mats["roof"], target, root, "curved-end-charcoal-infill", bevel=0.42)
    for index, y in enumerate([-1.05, 1.25], 1):
        box(f"South accessible toilet door {index}", (0.12, 1.45, 2.25), (22.25, y, 1.25), mats["green_lime"], target, root, "existing-accessible-toilet-door", bevel=0.055)
        box(f"South accessible toilet frame {index}", (0.16, 1.58, 0.09), (22.31, y, 2.40), mats["frame"], target, root, "accessible-toilet-frame")
        cylinder(f"South accessible toilet handle {index}", 0.035, 0.10, (22.34, y - 0.42, 1.18), mats["metal"], target, root, "accessible-door-handle", vertices=12, rotation=(0, math.pi / 2, 0))
    box("South timber public bench", (0.62, 4.25, 0.17), (22.68, -4.40, 0.58), mats["timber_dark"], target, root, "public-bench", bevel=0.035)
    for y in (-5.75, -3.05):
        box("South bench support", (0.42, 0.10, 0.48), (22.54, y, 0.32), mats["metal"], target, root, "bench-support")

    masonry_joints("West social wall", 13.4, 16.8, -8.615, 2.38, mats, target, root)


def add_toilet_extension(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # The council proposal plan and render document a 2021 expansion on the
    # north-west side. The live shell stays clipped to OSM's 2026 outline;
    # fine stall positions are plan-derived rather than claimed as as-built
    # millimetre measurements.
    box("2021 toilet extension enclosure", (7.72, 6.75, 2.72), (-12.40, -7.08, 1.36), mats["extension"], target, root, "completed-public-toilet-extension", bevel=0.04)
    box("Toilet extension dark service core", (3.35, 0.10, 2.24), (-10.2, -10.48, 1.30), mats["shutter"], target, root, "toilet-service-core", bevel=0.025)
    for index in range(7):
        x = -15.52 + index * 0.95
        box(f"Gender-neutral toilet door {index + 1}", (0.78, 0.10, 2.08), (x, -10.50, 1.18), mats["toilet_door"], target, root, "public-toilet-door", bevel=0.025)
        box(f"Toilet door top sign plate {index + 1}", (0.28, 0.035, 0.28), (x, -10.57, 1.76), mats["sign"], target, root, "toilet-door-sign", bevel=0.025)
        cylinder(f"Toilet door handle {index + 1}", 0.025, 0.08, (x + 0.25, -10.58, 1.13), mats["metal"], target, root, "toilet-door-handle", vertices=10, rotation=(math.pi / 2, 0, 0))

    # Open hand-basin forecourt and the proposal's vertical screen/pergola.
    box("Toilet forecourt paving", (12.2, 6.45, 0.075), (-14.25, -8.25, 0.04), mats["concrete"], target, root, "toilet-forecourt-paving")
    for index, x in enumerate([-19.8, -18.55, -17.3, -16.05, -14.8, -13.55, -12.3, -11.05, -9.8], 1):
        box(f"Toilet screen post {index:02d}", (0.11, 0.11, 2.72), (x, -11.05, 1.36), mats["frame"], target, root, "toilet-screen-post", bevel=0.012)
    for index, y in enumerate([-10.9, -9.55, -8.2, -6.85, -5.5], 1):
        box(f"Toilet pergola beam {index}", (11.65, 0.10, 0.12), (-14.3, y, 2.78), mats["frame"], target, root, "toilet-pergola-beam", bevel=0.012)
    for index, x in enumerate([-19.45, -17.15, -14.85, -12.55, -10.25], 1):
        box(f"Public hand basin {index}", (0.58, 0.42, 0.18), (x, -10.78, 0.82), mats["basin"], target, root, "public-hand-basin", bevel=0.11)
        cylinder(f"Public basin drain {index}", 0.035, 0.025, (x, -10.78, 0.93), mats["dark"], target, root, "basin-drain", vertices=10)
        box(f"Public basin tap {index}", (0.05, 0.12, 0.22), (x, -10.52, 1.03), mats["metal"], target, root, "basin-tap", bevel=0.018)

    # The plan explicitly says this tank remains. It is screened from the
    # public wash area by the curved north enclosure.
    cylinder("Retained rainwater tank", 2.15, 2.75, (-18.25, -0.30, 1.42), mats["tank"], target, root, "retained-rainwater-tank", vertices=28)
    cylinder("Rainwater tank lid", 2.05, 0.12, (-18.25, -0.30, 2.86), mats["metal"], target, root, "rainwater-tank-lid", vertices=28)
    for index in range(8):
        angle = index * math.pi / 4
        x = -18.25 + math.cos(angle) * 2.04
        y = -0.30 + math.sin(angle) * 2.04
        box(f"Rainwater tank rib {index + 1}", (0.04, 0.04, 2.62), (x, y, 1.43), mats["tank_edge"], target, root, "rainwater-tank-rib")
    box("Tank-area access door", (0.10, 1.36, 2.20), (-20.72, -2.15, 1.23), mats["shutter"], target, root, "tank-area-access-door", bevel=0.025)


def add_services_and_lights(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    for index, x in enumerate([-5.7, 4.1, 13.4], 1):
        cylinder(f"West round wall light {index}", 0.18, 0.08, (x, -8.73, 1.72), mats["light"], target, root, "round-wall-light", vertices=20, rotation=(math.pi / 2, 0, 0))
        cylinder(f"West wall light rim {index}", 0.23, 0.04, (x, -8.69, 1.72), mats["frame"], target, root, "wall-light-rim", vertices=20, rotation=(math.pi / 2, 0, 0))
    for index, x in enumerate([-6.2, 0.4, 7.0, 13.6], 1):
        cylinder(f"East round wall light {index}", 0.17, 0.08, (x, 8.12, 1.70), mats["light"], target, root, "round-wall-light", vertices=20, rotation=(math.pi / 2, 0, 0))
    for side, y in [("West", -8.80), ("East", 8.82)]:
        cylinder(f"{side} roof gutter", 0.10, 31.8, (1.7, y, 4.27), mats["metal"], target, root, "roof-gutter", vertices=12, rotation=(0, math.pi / 2, 0))
    for index, (x, y) in enumerate([(-16.8, -3.5), (17.8, -7.8), (-7.2, 7.9), (17.2, 7.9)], 1):
        cylinder(f"Rainwater downpipe {index}", 0.075, 3.72, (x, y, 1.88), mats["metal"], target, root, "rainwater-downpipe", vertices=12)
        box(f"Downpipe shoe {index}", (0.15, 0.32, 0.13), (x, y - 0.11, 0.12), mats["metal"], target, root, "rainwater-downpipe", rotation=(0.28, 0, 0))


def build(target: bpy.types.Collection) -> None:
    root = bpy.data.objects.new("Alfred Crescent Pavilion evidence root", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_condition_date"] = "2026-07-10"
    root["eg_source_way"] = "OpenStreetMap way 242003562 version 5, 2026-02-06"

    mats = {
        "masonry": material("Warm grey concrete masonry", 0xC4BEA8, 0.91),
        "masonry_pale": material("Pale south-end masonry", 0xE1DCC7, 0.89),
        "mortar": material("Recessed masonry joint", 0x8F8E85, 0.98),
        "dark_block": material("Charcoal service masonry", 0x747872, 0.94),
        "green": material("Pavilion emerald cladding", 0x178B43, 0.74),
        "green_lime": material("Pavilion lime accent", 0x89C94A, 0.72),
        "roof": material("Black corrugated wrap roof", 0x333D3F, 0.55, 0.34),
        "roof_edge": material("Roof edge and corrugation", 0x566160, 0.48, 0.40),
        "timber": material("Warm plywood canopy soffit", 0xC99757, 0.82),
        "timber_dark": material("External timber panels and bench", 0x715138, 0.83),
        "frame": material("Charcoal aluminium framing", 0x30393B, 0.49, 0.40),
        "glass": material("Tree-reflecting green glass", 0x568778, 0.30, 0.17),
        "glass_dark": material("Dark paired-door glass", 0x345C55, 0.28, 0.20),
        "clerestory": material("Green clerestory glazing", 0x638D7F, 0.32, 0.18),
        "shutter": material("Black roller shutters", 0x252B2D, 0.58, 0.30),
        "shutter_edge": material("Roller shutter slats", 0x4B5252, 0.50, 0.36),
        "extension": material("Toilet extension grey cladding", 0x9CA29C, 0.74, 0.15),
        "toilet_door": material("Gender-neutral toilet doors", 0x69716F, 0.68, 0.18),
        "concrete": material("Accessible concrete paving", 0xAAA99F, 0.96),
        "tank": material("Retained green-grey rainwater tank", 0x66766E, 0.67, 0.22),
        "tank_edge": material("Tank rib shadow", 0x3F4A46, 0.64, 0.26),
        "metal": material("Galvanized pavilion metal", 0x9BA4A1, 0.46, 0.44),
        "basin": material("Stainless public hand basin", 0xB4BBB7, 0.35, 0.60),
        "dark": material("Deep service shadow", 0x1E2525, 0.80),
        "sign": material("Toilet symbol plate", 0xE1E4DD, 0.78),
        "light": material("Frosted round wall light", 0xE5DFBF, 0.58),
    }

    polygon_prism("Exact 2026 OSM pavilion foundation", SHELL_POLYGON, -0.12, 0.17, mats["concrete"], target, root, "exact-osm-foundation")
    # A shallow exact shell guarantees the irregular current outline remains
    # visible at every return even where the articulated masses overlap it.
    polygon_prism("Exact 2026 OSM low wall shell", SHELL_POLYGON, 0.12, 0.42, mats["dark_block"], target, root, "exact-osm-shell")
    add_original_pavilion(mats, target, root)
    add_toilet_extension(mats, target, root)
    add_services_and_lights(mats, target, root)


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.045, 0.055, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.86

    ground_mat = material("Preview winter grass", 0x59684C, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=110, location=(0, 0, -0.13))
    ground = bpy.context.object
    ground.name = "Preview ground"
    ground.data.materials.append(ground_mat)
    relink(ground, target)

    sun_data = bpy.data.lights.new("Winter sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(19)
    sun = bpy.data.objects.new("Winter sun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(31), math.radians(-12), math.radians(-41))

    west_data = bpy.data.lights.new("West public facade fill", "AREA")
    west_data.energy = 1800
    west_data.shape = "RECTANGLE"
    west_data.size = 20
    west_data.size_y = 10
    west = bpy.data.objects.new("West public facade fill", west_data)
    target.objects.link(west)
    west.location = (-7, -29, 10)
    west.rotation_euler = (Vector((1, -5, 1.9)) - west.location).to_track_quat("-Z", "Y").to_euler()

    east_data = bpy.data.lights.new("East facade fill", "AREA")
    east_data.energy = 1080
    east_data.shape = "RECTANGLE"
    east_data.size = 18
    east_data.size_y = 9
    east = bpy.data.objects.new("East facade fill", east_data)
    target.objects.link(east)
    east.location = (16, 28, 14)
    east.rotation_euler = (Vector((2, 4, 1.9)) - east.location).to_track_quat("-Z", "Y").to_euler()

    south_data = bpy.data.lights.new("South curved-end fill", "AREA")
    south_data.energy = 1150
    south_data.shape = "DISK"
    south_data.size = 12
    south = bpy.data.objects.new("South curved-end fill", south_data)
    target.objects.link(south)
    south.location = (37, -5, 10)
    south.rotation_euler = (Vector((19.5, 0, 1.7)) - south.location).to_track_quat("-Z", "Y").to_euler()

    camera_data = bpy.data.cameras.new("Alfred Crescent Pavilion audit camera")
    camera = bpy.data.objects.new("Alfred Crescent Pavilion audit camera", camera_data)
    target.objects.link(camera)
    camera_data.lens = 54
    bpy.context.scene.camera = camera
    return camera


def aim(camera: bpy.types.Object, position: tuple[float, float, float], target: tuple[float, float, float]) -> None:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(camera: bpy.types.Object, output: Path) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 760
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    views = [
        ("01-west-public-facade", (32, -42, 12), (2, -6.0, 1.8)),
        ("02-west-north-toilet-extension", (-31, -37, 9), (-11, -6.6, 1.5)),
        ("03-east-oval-shutters", (31, 37, 10), (2.5, 5.2, 1.7)),
        ("04-south-west-curved-roof", (37, -27, 8), (18.4, -5.0, 1.8)),
        ("05-north-tank-and-services", (-36, 13, 8), (-13, 1.0, 1.5)),
        ("06-main-entry-close", (9, -24, 4.4), (3.2, -8.0, 1.35)),
        ("07-toilet-forecourt-close", (-18, -25, 4.2), (-14.1, -9.0, 1.25)),
        ("08-south-accessible-toilets", (39, -4, 6), (19.2, 0.1, 1.45)),
    ]
    for name, position, focus in views:
        aim(camera, position, focus)
        scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def export(target: bpy.types.Collection, filepath: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    source_meshes = [obj for obj in target.all_objects if obj.type == "MESH"]
    for obj in source_meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = source_meshes[0]
    bpy.ops.object.duplicate(linked=False)
    runtime_copies = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    bpy.context.view_layer.objects.active = runtime_copies[0]
    bpy.ops.object.join()
    runtime_mesh = bpy.context.object
    runtime_mesh.name = "Alfred Crescent Pavilion optimized runtime mesh"
    world_matrix = runtime_mesh.matrix_world.copy()
    runtime_mesh.parent = None
    runtime_mesh.matrix_world = world_matrix
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_selection=True,
        export_extras=True, export_cameras=False, export_lights=False, export_apply=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    bpy.ops.object.delete(use_global=False)


def triangles(target: bpy.types.Collection) -> int:
    total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in target.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def manifest(path: Path, target: bpy.types.Collection, blend: Path, glb: Path) -> None:
    data = {
        "assetId": ASSET_ID,
        "label": "Alfred Crescent Sports Pavilion",
        "conditionDate": "2026-07-10",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": str(blend.relative_to(Path.cwd())),
            "glb": str(glb.relative_to(Path.cwd())),
            "generator": "scripts/blender/build_alfred_crescent_pavilion.py",
        },
        "primaryEvidence": [
            "https://www.openstreetmap.org/way/242003562",
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.yarracity.vic.gov.au/sites/default/files/2024-06/buildings_asset_management_plan_revision_2017.pdf",
            "https://yoursayyarra.com.au/newtoilets",
            "https://www.yarracity.vic.gov.au/sites/default/files/2024-04/annual_report_2021_to_2022_accessible_version.pdf",
            "https://archipro.com.au/project/edinburgh-gardens-cricket-pavilion-clarkehopkinsclarke",
        ],
        "translatedCondition": "Current 2026 pavilion envelope with the completed 2021 public-toilet expansion, while retaining the original 2010 architectural language",
        "dimensionsGameUnits": {"mappedLength": ASSET_LENGTH, "mappedDepth": ASSET_DEPTH, "southRoofHeight": 5.30},
        "sourceFootprintMetres": {"mappedLength": ASSET_LENGTH / 1.28, "mappedDepth": ASSET_DEPTH / 1.28},
        "navigationContract": {
            "westPublicApproach": "continuous accessible concrete apron beneath the documented deep canopy",
            "mainEntrance": "paired glazed west doors remain visible and unobstructed at player height",
            "kiosk": "oval-facing roller shutter remains externally approachable as a gameplay search point",
            "toiletForecourt": "open screened hand-basin forecourt and seven plan-derived exterior stall doors remain legible",
            "southAccessibleToilets": "two existing south-end accessible doors from the council plan remain externally approachable",
        },
        "uncertainty": [
            "OSM version 5 fixes the current horizontal shell, but no public as-built elevation survey fixes every return or overall roof height.",
            "The architect photographs predate the public-toilet expansion; later council plan/render and 2026 OSM geometry supersede them at the north-west end.",
            "The council toilet image is a proposal render and the plan is schematic; the annual report proves completion but does not prove every proposed finish was installed unchanged.",
            "Clerestory mullion, corrugation, masonry-joint and canopy-post rhythms are proportional translations of photographs rather than measured construction drawings.",
            "No free-roam interior is authored because the photographs and schematic toilet plan are insufficient for a complete current interior survey.",
        ],
        "statistics": {
            "objectCount": len(target.all_objects),
            "meshObjectCount": sum(1 for obj in target.all_objects if obj.type == "MESH"),
            "materialCount": len({mat.name for obj in target.all_objects if hasattr(obj.data, "materials") for mat in obj.data.materials if mat}),
            "triangleCount": triangles(target),
        },
    }
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parsed = parse_args()
    cwd = Path.cwd()
    blend_path = (cwd / parsed.blend_output).resolve()
    glb_path = (cwd / parsed.glb_output).resolve()
    manifest_path = (cwd / parsed.manifest_output).resolve()
    render_path = (cwd / parsed.render_output).resolve()
    for folder in (blend_path.parent, glb_path.parent, manifest_path.parent, render_path):
        folder.mkdir(parents=True, exist_ok=True)

    reset()
    model = collection("EG_ALFRED_CRESCENT_PAVILION_MODEL")
    preview = collection("EG_ALFRED_CRESCENT_PAVILION_PREVIEW")
    build(model)
    camera = preview_scene(preview)
    render(camera, render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    export(model, glb_path)
    manifest(manifest_path, model, blend_path, glb_path)
    print(f"Built {ASSET_ID}")
    print(f"Blend: {blend_path}")
    print(f"GLB: {glb_path}")
    print(f"Renders: {render_path}")


if __name__ == "__main__":
    main()

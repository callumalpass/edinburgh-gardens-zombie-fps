"""Build the completed 2026 Edinburgh Gardens north public-toilet asset.

The horizontal envelope follows OpenStreetMap way 307404819. The City of
Yarra upgrade plan controls the two external stall banks, accessible ramp,
service access and exterior hand-basin arrangement. The council's as-built
context photograph controls the current charcoal corrugated finish, grey
doors, perforated upper screens, dark steel frame and alternating opaque /
translucent skillion sheets; it supersedes the red proposal render.

Blender +Y is the south-east public/basin elevation. glTF maps that direction
to Three.js -Z, matching the mapped path and completed addition side.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-north-toilets"
ASSET_LENGTH = 14.062516258664825
ASSET_DEPTH = 9.571372656045673
EVIDENCE = (
    "City of Yarra as-built Edinburgh Gardens toilet photograph and dimensioned "
    "upgrade plan; Lovell Chen CMP 2021 section 3.10.4/Figure 146; OSM way 307404819"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-output", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def srgb(value: int, alpha: float = 1.0) -> tuple[float, float, float, float]:
    return (((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha)


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


def material(
    name: str,
    value: int,
    roughness: float,
    metallic: float = 0.0,
    *,
    alpha: float = 1.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = srgb(value, alpha)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = srgb(value, alpha)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Alpha"].default_value = alpha
        shader.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1:
        result.surface_render_method = "DITHERED"
        result.use_transparency_overlap = False
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
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, target, root, mat, kind)


def sloped_panel(
    name: str,
    width: float,
    run: float,
    thickness: float,
    center_x: float,
    center_y: float,
    center_z: float,
    rise: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    angle = math.atan2(rise, run)
    return box(
        name,
        (width, math.hypot(run, rise), thickness),
        (center_x, center_y, center_z),
        mat,
        target,
        root,
        kind,
        rotation=(angle, 0, 0),
        bevel=0.012,
    )


def add_corrugation(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    mat: bpy.types.Material,
    half_x: float,
    half_y: float,
    wall_height: float,
) -> None:
    spacing = 0.22
    rib = 0.025
    count_x = int((half_x * 2) / spacing)
    for index in range(count_x + 1):
        x = -half_x + index * (half_x * 2 / count_x)
        for y, label in ((half_y + 0.046, "front"), (-half_y - 0.046, "rear")):
            box(
                f"{label.title()} corrugated rib {index + 1:02d}",
                (rib, 0.035, wall_height - 0.16),
                (x, y, wall_height * 0.5),
                mat,
                target,
                root,
                "corrugated-wall-rib",
            )
    count_y = int((half_y * 2) / spacing)
    for index in range(count_y + 1):
        y = -half_y + index * (half_y * 2 / count_y)
        for x, label in ((half_x + 0.046, "south-west"), (-half_x - 0.046, "north-east")):
            box(
                f"{label.title()} corrugated rib {index + 1:02d}",
                (0.035, rib, wall_height - 0.16),
                (x, y, wall_height * 0.5),
                mat,
                target,
                root,
                "corrugated-wall-rib",
            )


def add_screen_panel(
    prefix: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    plane: str,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    screen: bpy.types.Material,
    steel: bpy.types.Material,
) -> None:
    x, y, z = center
    if plane == "xy-front":
        box(f"{prefix} perforated infill", (width, 0.035, height), center, screen, target, root, "perforated-screen")
        for index in range(1, 6):
            line_z = z - height / 2 + index * height / 6
            box(f"{prefix} perforation row {index}", (width, 0.018, 0.016), (x, y + 0.021, line_z), steel, target, root, "screen-perforation-cue")
    else:
        box(f"{prefix} perforated infill", (0.035, width, height), center, screen, target, root, "perforated-screen")
        for index in range(1, 6):
            line_z = z - height / 2 + index * height / 6
            box(f"{prefix} perforation row {index}", (0.018, width, 0.016), (x + 0.021, y, line_z), steel, target, root, "screen-perforation-cue")


def add_toilet_sign(
    prefix: str,
    face: str,
    location: tuple[float, float, float],
    target: bpy.types.Collection,
    root: bpy.types.Object,
    blue: bpy.types.Material,
    white: bpy.types.Material,
    *,
    accessible: bool = False,
) -> None:
    x, y, z = location
    if face == "x":
        box(f"{prefix} blue toilet sign", (0.025, 0.30, 0.34), (x, y, z), blue, target, root, "toilet-door-sign", bevel=0.012)
        cylinder(f"{prefix} person head", 0.035, 0.028, (x + 0.018, y, z + 0.075), white, target, root, "toilet-sign-glyph", vertices=12, rotation=(0, math.pi / 2, 0))
        box(f"{prefix} person body", (0.03, 0.065, 0.13), (x + 0.018, y, z - 0.02), white, target, root, "toilet-sign-glyph")
        if accessible:
            cylinder(f"{prefix} accessibility wheel", 0.055, 0.028, (x + 0.019, y, z - 0.10), white, target, root, "accessible-sign-glyph", vertices=14, rotation=(0, math.pi / 2, 0))
    else:
        box(f"{prefix} blue toilet sign", (0.30, 0.025, 0.34), (x, y, z), blue, target, root, "toilet-door-sign", bevel=0.012)
        cylinder(f"{prefix} person head", 0.035, 0.028, (x, y + 0.018, z + 0.075), white, target, root, "toilet-sign-glyph", vertices=12, rotation=(math.pi / 2, 0, 0))
        box(f"{prefix} person body", (0.065, 0.03, 0.13), (x, y + 0.018, z - 0.02), white, target, root, "toilet-sign-glyph")
        if accessible:
            cylinder(f"{prefix} accessibility wheel", 0.055, 0.028, (x, y + 0.019, z - 0.10), white, target, root, "accessible-sign-glyph", vertices=14, rotation=(math.pi / 2, 0, 0))


def add_side_door(
    side: int,
    index: int,
    y: float,
    accessible: bool,
    half_x: float,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    door: bpy.types.Material,
    trim: bpy.types.Material,
    blue: bpy.types.Material,
    white: bpy.types.Material,
    steel: bpy.types.Material,
) -> None:
    x = side * (half_x + 0.068)
    prefix = f"{'South-west' if side > 0 else 'North-east'} stall {index:02d}"
    box(prefix + " grey door", (0.105, 1.02, 2.12), (x, y, 1.16), door, target, root, "external-toilet-door", bevel=0.025)
    for offset in (-0.55, 0.55):
        box(prefix + f" jamb {offset:+.2f}", (0.13, 0.055, 2.28), (x, y + offset, 1.18), trim, target, root, "toilet-door-frame")
    box(prefix + " head", (0.13, 1.15, 0.08), (x, y, 2.29), trim, target, root, "toilet-door-frame")
    handle_y = y - side * 0.32
    cylinder(prefix + " pull handle", 0.035, 0.13, (x + side * 0.075, handle_y, 1.04), steel, target, root, "door-hardware", vertices=12, rotation=(0, math.pi / 2, 0))
    add_toilet_sign(prefix, "x", (x + side * 0.075, y, 1.48), target, root, blue, white, accessible=accessible)


def add_basin(
    index: int,
    x: float,
    front_y: float,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    steel: bpy.types.Material,
    dark: bpy.types.Material,
) -> None:
    prefix = f"Exterior hand basin {index}"
    box(prefix + " tapered bowl", (0.88, 0.52, 0.46), (x, front_y + 0.29, 0.73), steel, target, root, "exterior-hand-basin", bevel=0.055)
    box(prefix + " back splash", (0.94, 0.09, 0.45), (x, front_y + 0.075, 1.00), steel, target, root, "basin-backsplash", bevel=0.025)
    cylinder(prefix + " tap stem", 0.035, 0.22, (x, front_y + 0.19, 1.12), steel, target, root, "basin-tap", vertices=12, rotation=(math.pi / 2, 0, 0))
    cylinder(prefix + " drain", 0.045, 0.018, (x, front_y + 0.565, 0.88), dark, target, root, "basin-drain", vertices=12, rotation=(math.pi / 2, 0, 0))
    box(prefix + " soap dispenser", (0.20, 0.11, 0.34), (x, front_y + 0.105, 1.47), dark, target, root, "soap-dispenser", bevel=0.025)


def add_ramp(
    half_x: float,
    front_y: float,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    concrete: bpy.types.Material,
    steel: bpy.types.Material,
) -> None:
    ramp_x = -half_x - 1.35
    ramp_y = front_y + 1.0
    run = 4.35
    rise = 0.30
    box(
        "Accessible concrete ramp",
        (1.55, run, 0.18),
        (ramp_x, ramp_y - 0.55, 0.13),
        concrete,
        target,
        root,
        "accessible-ramp",
        rotation=(-math.atan2(rise, run), 0, 0),
        bevel=0.035,
    )
    for side in (-0.70, 0.70):
        rail_x = ramp_x + side
        for y in (ramp_y - run / 2, ramp_y, ramp_y + run / 2):
            cylinder(f"Ramp rail post {side:+.2f} {y:+.2f}", 0.032, 0.90, (rail_x, y, 0.59), steel, target, root, "ramp-handrail-post", vertices=12)
        box(
            f"Ramp continuous handrail {side:+.2f}",
            (0.065, run + 0.25, 0.065),
            (rail_x, ramp_y, 0.98),
            steel,
            target,
            root,
            "ramp-handrail",
            rotation=(-math.atan2(rise, run), 0, 0),
            bevel=0.025,
        )


def build(target: bpy.types.Collection) -> None:
    root = bpy.data.objects.new("North toilets asset root", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_condition_date"] = "2026-07-10"
    root["eg_public_face"] = "Blender +Y / Three.js -Z south-east basin elevation"

    charcoal = material("North toilet as-built charcoal corrugated steel", 0x30383A, 0.72, 0.10)
    corrugated_highlight = material("North toilet corrugation edge", 0x465153, 0.66, 0.12)
    door = material("North toilet current grey doors", 0x596365, 0.60, 0.18)
    steel = material("North toilet dark structural steel", 0x2A3031, 0.48, 0.42)
    galvanised = material("North toilet galvanised trim", 0x899493, 0.40, 0.56)
    roof = material("north-toilet-sheet-metal-roof", 0xA8B1AE, 0.48, 0.34)
    clear_roof = material("north-toilet-clear-roof-sheet", 0xBCD8D3, 0.30, 0.04, alpha=0.46, transmission=0.18)
    screen = material("North toilet perforated upper screen", 0x697576, 0.64, 0.14, alpha=0.58)
    concrete = material("North toilet accessible concrete apron", 0xA9AAA4, 0.90)
    blue = material("North toilet blue wayfinding signs", 0x1454A4, 0.58)
    white = material("North toilet sign glyphs", 0xF0F2E9, 0.72)
    dark = material("North toilet opening and drain shadow", 0x111719, 0.84)
    bronze = material("North toilet service door warm insert", 0xA5905D, 0.64, 0.08)

    half_x = ASSET_LENGTH / 2
    half_y = ASSET_DEPTH / 2
    wall_height = 2.52
    front_y = half_y

    box("Mapped footprint slab", (ASSET_LENGTH + 0.26, ASSET_DEPTH + 0.22, 0.14), (0, 0, 0.02), concrete, target, root, "mapped-footprint-slab", bevel=0.04)
    box("South-east public apron", (ASSET_LENGTH + 3.5, 2.45, 0.10), (0, front_y + 0.98, -0.02), concrete, target, root, "public-concrete-apron", bevel=0.05)
    box("South-west stall apron", (1.85, ASSET_DEPTH + 1.7, 0.10), (half_x + 0.86, 0, -0.015), concrete, target, root, "stall-bank-apron", bevel=0.04)
    box("North-east stall apron", (1.85, ASSET_DEPTH + 1.7, 0.10), (-half_x - 0.86, 0, -0.015), concrete, target, root, "stall-bank-apron", bevel=0.04)

    box("Current corrugated toilet cell", (ASSET_LENGTH, ASSET_DEPTH, wall_height), (0, 0, wall_height / 2), charcoal, target, root, "toilet-cell", bevel=0.035)
    add_corrugation(target, root, corrugated_highlight, half_x, half_y, wall_height)

    # Two plan-derived external stall banks: seven western/female/DDA doors and
    # six eastern/gender-neutral/urinal doors. The current photograph controls
    # their grey finish and small blue signs.
    west_positions = [-3.82, -2.55, -1.28, 0.0, 1.28, 2.55, 3.82]
    east_positions = [-3.55, -2.13, -0.71, 0.71, 2.13, 3.55]
    for index, y in enumerate(west_positions, start=1):
        add_side_door(1, index, y, index == 4, half_x, target, root, door, galvanised, blue, white, steel)
    for index, y in enumerate(east_positions, start=1):
        add_side_door(-1, index, y, index == 1, half_x, target, root, door, galvanised, blue, white, steel)

    # Rear-central service access from the upgrade plan.
    box("Rear service door", (1.18, 0.11, 2.15), (0, -half_y - 0.065, 1.15), door, target, root, "service-access-door", bevel=0.025)
    for x in (-0.64, 0.64):
        box(f"Rear service door jamb {x:+.2f}", (0.09, 0.12, 2.29), (x, -half_y - 0.07, 1.17), galvanised, target, root, "service-door-frame")
    box("Rear service door head", (1.37, 0.12, 0.09), (0, -half_y - 0.07, 2.30), galvanised, target, root, "service-door-frame")

    # Current as-built photograph: a warm-toned access leaf on the public
    # return, paired stainless basins and dark wall-mounted dispensers.
    box("South-east accessible return door", (1.12, 0.10, 2.14), (-4.72, front_y + 0.065, 1.15), bronze, target, root, "accessible-return-door", bevel=0.025)
    for x in (-5.34, -4.10):
        box(f"Accessible return jamb {x:+.2f}", (0.09, 0.12, 2.29), (x, front_y + 0.07, 1.17), galvanised, target, root, "toilet-door-frame")
    add_toilet_sign("Accessible return", "y", (-4.72, front_y + 0.075, 1.48), target, root, blue, white, accessible=True)
    add_basin(1, -0.68, front_y, target, root, galvanised, dark)
    add_basin(2, 0.68, front_y, target, root, galvanised, dark)

    # Upper perforated security/ventilation screens documented by the as-built
    # image. The panels remain visibly open beneath the roof rather than being
    # mistaken for a second solid storey.
    screen_bottom = 2.58
    screen_height = 0.92
    for index, x in enumerate((-5.25, -2.62, 0.0, 2.62, 5.25), start=1):
        add_screen_panel(f"Front screen bay {index}", (x, front_y + 0.06, screen_bottom + screen_height / 2), 2.42, screen_height, "xy-front", target, root, screen, galvanised)
        add_screen_panel(f"Rear screen bay {index}", (x, -half_y - 0.06, screen_bottom + screen_height / 2), 2.42, screen_height, "xy-front", target, root, screen, galvanised)
    for side in (-1, 1):
        x = side * (half_x + 0.06)
        for index, y in enumerate((-3.55, -1.78, 0.0, 1.78, 3.55), start=1):
            add_screen_panel(f"{'South-west' if side > 0 else 'North-east'} upper screen {index}", (x, y, screen_bottom + screen_height / 2), 1.58, screen_height, "yz-side", target, root, screen, galvanised)

    # Steel posts and beams remain exposed, matching the official photograph.
    post_xs = [-half_x - 0.72, -half_x * 0.5, 0.0, half_x * 0.5, half_x + 0.72]
    for x in post_xs:
        for y in (-half_y - 0.72, 0.0, half_y + 0.72):
            box(f"Roof post {x:+.2f} {y:+.2f}", (0.16, 0.16, 3.72), (x, y, 1.86), steel, target, root, "exposed-roof-post", bevel=0.018)
    for x in post_xs:
        box(f"Main roof beam {x:+.2f}", (0.18, ASSET_DEPTH + 1.55, 0.25), (x, 0, 3.46), steel, target, root, "exposed-roof-beam", rotation=(math.radians(4.1), 0, 0), bevel=0.015)
    for y in (-half_y - 0.45, -2.25, 0.0, 2.25, half_y + 0.45):
        box(f"Roof cross beam {y:+.2f}", (ASSET_LENGTH + 1.55, 0.18, 0.22), (0, y, 3.49 + y * 0.071), steel, target, root, "exposed-roof-beam", bevel=0.015)

    # Alternating opaque and translucent strips are individually modelled so
    # they read from both aerial and player-height views. A shallow split at
    # the old/new junction preserves the two-stage roof visible in the photo.
    roof_width = ASSET_LENGTH + 1.55
    strip_count = 11
    strip_width = roof_width / strip_count
    for index in range(strip_count):
        x = -roof_width / 2 + strip_width * (index + 0.5)
        mat = clear_roof if index in {1, 4, 7, 9} else roof
        kind = "translucent-roof-strip" if mat == clear_roof else "opaque-roof-strip"
        sloped_panel(
            f"Existing rear roof strip {index + 1:02d}", strip_width - 0.035, half_y + 0.55, 0.075,
            x, -(half_y + 0.25) / 2, 3.37, 0.28, mat, target, root, kind
        )
        sloped_panel(
            f"Completed addition roof strip {index + 1:02d}", strip_width - 0.035, half_y + 0.95, 0.075,
            x, (half_y + 0.35) / 2, 3.68, 0.43, mat, target, root, kind
        )
    box("Front roof fascia", (roof_width + 0.06, 0.16, 0.22), (0, half_y + 0.72, 3.91), galvanised, target, root, "roof-fascia", bevel=0.02)
    box("Rear roof fascia", (roof_width + 0.06, 0.16, 0.22), (0, -half_y - 0.56, 3.19), galvanised, target, root, "roof-fascia", bevel=0.02)
    box("Front gutter", (roof_width + 0.16, 0.14, 0.14), (0, half_y + 0.79, 3.82), galvanised, target, root, "roof-gutter", bevel=0.035)
    for x in (-half_x - 0.50, half_x + 0.50):
        cylinder(f"Front downpipe {x:+.2f}", 0.055, 3.10, (x, half_y + 0.76, 1.57), galvanised, target, root, "roof-downpipe", vertices=14)

    add_ramp(half_x, front_y, target, root, concrete, galvanised)

    # Compact under-eave lighting and notice plates visible in the photograph.
    for x in (-4.75, 4.75):
        box(f"Public under-eave light {x:+.2f}", (0.78, 0.20, 0.16), (x, front_y + 0.34, 2.66), white, target, root, "under-eave-light", bevel=0.05)
    box("Council notice plate", (0.48, 0.035, 0.58), (2.05, front_y + 0.075, 1.43), white, target, root, "facility-notice-plate", bevel=0.02)


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world
    world.color = (0.025, 0.032, 0.040)
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.075, 0.095, 0.11, 1)
        background.inputs["Strength"].default_value = 0.34

    ground_mat = material("Preview winter grass", 0x59684C, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=70, location=(0, 0, -0.09))
    ground = bpy.context.object
    ground.name = "Preview ground"
    ground.data.materials.append(ground_mat)
    relink(ground, target)

    sun_data = bpy.data.lights.new("Winter sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(18)
    sun = bpy.data.objects.new("Winter sun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(31), math.radians(-15), math.radians(-41))

    front_data = bpy.data.lights.new("Public elevation fill", "AREA")
    front_data.energy = 980
    front_data.shape = "RECTANGLE"
    front_data.size = 13
    front_data.size_y = 8
    front = bpy.data.objects.new("Public elevation fill", front_data)
    target.objects.link(front)
    front.location = (-9, 18, 11)
    front.rotation_euler = (Vector((0, 2, 1.6)) - front.location).to_track_quat("-Z", "Y").to_euler()

    side_data = bpy.data.lights.new("Stall bank fill", "AREA")
    side_data.energy = 820
    side_data.shape = "RECTANGLE"
    side_data.size = 12
    side_data.size_y = 7
    side = bpy.data.objects.new("Stall bank fill", side_data)
    target.objects.link(side)
    side.location = (19, 2, 9)
    side.rotation_euler = (Vector((5, 0, 1.5)) - side.location).to_track_quat("-Z", "Y").to_euler()

    camera_data = bpy.data.cameras.new("North toilets audit camera")
    camera = bpy.data.objects.new("North toilets audit camera", camera_data)
    target.objects.link(camera)
    camera_data.lens = 52
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
        ("01-as-built-public-oblique", (17, 20, 8.2), (0.5, 1.2, 1.65)),
        ("02-south-west-door-bank", (22, 2, 6.4), (6.5, 0.1, 1.45)),
        ("03-north-east-door-bank", (-22, -1, 6.4), (-6.5, 0.0, 1.45)),
        ("04-rear-service-elevation", (-14, -19, 7.2), (0, -2.2, 1.55)),
        ("05-roof-and-screen-aerial", (15, 17, 20), (0, 0, 1.4)),
        ("06-basin-close", (4.8, 13.5, 3.8), (0.0, 4.8, 1.25)),
        ("07-accessible-ramp-close", (-15, 12, 4.3), (-8.1, 5.6, 0.85)),
        ("08-door-hardware-close", (12.5, 3.2, 3.6), (7.0, 1.7, 1.3)),
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
    runtime_mesh.name = "North toilets optimized runtime mesh"
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
        "label": "Edinburgh Gardens north public toilets",
        "conditionDate": "2026-07-10",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": str(blend.relative_to(Path.cwd())),
            "glb": str(glb.relative_to(Path.cwd())),
            "generator": "scripts/blender/build_north_toilets.py",
        },
        "primaryEvidence": [
            "https://www.openstreetmap.org/way/307404819",
            "https://yoursayyarra.com.au/newtoilets",
            "https://www.yarracity.vic.gov.au/sites/default/files/2024-04/annual_report_2021_to_2022_accessible_version.pdf",
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://base.maps.vic.gov.au/service",
        ],
        "translatedCondition": "Completed and open 2026 north toilet module in its photographed charcoal as-built finish, not the red proposal finish",
        "dimensionsGameUnits": {"mappedLength": ASSET_LENGTH, "mappedDepth": ASSET_DEPTH, "frontRoofHeight": 3.91},
        "sourceFootprintMetres": {"mappedLength": ASSET_LENGTH / 1.28, "mappedDepth": ASSET_DEPTH / 1.28},
        "navigationContract": {
            "southWestDoorBank": "seven plan-derived external stall/DDA doors remain visually distinct and approachable outside the solid OSM collision shell",
            "northEastDoorBank": "six plan-derived external stall/ambulant/urinal doors remain visually distinct and approachable",
            "accessibleRamp": "continuous 1.55-unit-wide concrete ramp and paired rails remain outside collision",
            "basinApron": "two photographed exterior stainless basins remain unobstructed on the south-east public apron",
        },
        "uncertainty": [
            "OSM fixes the current horizontal shell, but no public as-built elevation survey fixes every post, screen joint or roof height.",
            "The dimensioned council plan controls room/door count and functional arrangement; its red proposal render does not control current colour because the council as-built photograph shows charcoal cladding.",
            "The plan is translated proportionally into the slightly different current OSM roof/footprint proportions rather than presented as surveyed game geometry.",
            "Perforation pitch, corrugation pitch, door hardware and roof-strip rhythm are proportional readings of the as-built photograph.",
            "No free-roam interior is authored because the public plan and single as-built exterior photograph are insufficient for a complete current interior survey.",
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
    model = collection("EG_NORTH_TOILETS_MODEL")
    preview = collection("EG_NORTH_TOILETS_PREVIEW")
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

"""Build the restored 2026 Sportsman's War Memorial arbour.

The Australian War Memorial/Places of Pride point controls placement. Lovell
Chen CMP Figures 62 and 64-65 control the six Tuscan columns, pedestals,
perimeter beams, textured frieze, cornices, rafters, east IN MEMORIAM panel,
raised swag panel and restored urn finials. City of Yarra's current public-art
page controls the 2018 restoration additions: replica wreath/name panel and
large reproductive team photograph.

Blender +X is east; Blender -Y / glTF +Z is the current south footpath
approach. Runtime rotation retains the existing photo/aerial-fitted 0.18-radian
map axis while collision is limited to the six visible pedestals.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ASSET_ID = "edinburgh-gardens-sportsmans-war-memorial"
ASSET_LENGTH = 6.40
ASSET_DEPTH = 3.10
EVIDENCE = (
    "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.7/Figures 62, 64-65; "
    "City of Yarra Sportsman's Memorial restoration page; AWM Places of Pride"
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


def material(name: str, value: int, roughness: float, metallic: float = 0.0, *, alpha: float = 1.0) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = srgb(value, alpha)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = srgb(value, alpha)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Alpha"].default_value = alpha
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
    vertices: int = 20,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, target, root, mat, kind)


def sphere(
    name: str,
    radius: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    scale: tuple[float, float, float] = (1, 1, 1),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, target, root, mat, kind)


def cone(
    name: str,
    radius1: float,
    radius2: float,
    depth: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    vertices: int = 18,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, target, root, mat, kind)


def text_mesh(
    name: str,
    body: str,
    location: tuple[float, float, float],
    size: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    face: str,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name + " curve", "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.012
    curve.bevel_depth = 0.004
    curve.space_line = 0.9
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    if face == "south":
        obj.matrix_world = Matrix.Translation(Vector(location)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    elif face == "east":
        obj.matrix_world = (
            Matrix.Translation(Vector(location))
            @ Matrix.Rotation(math.pi / 2, 4, "Z")
            @ Matrix.Rotation(math.pi / 2, 4, "X")
        )
    else:
        raise ValueError(face)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    # Blender's default font tessellation is excessive for inscriptions that
    # occupy only a few screen pixels in the game. Preserve the silhouette
    # while keeping the joined GLB within the same budget as other artifacts.
    decimate = obj.modifiers.new("Runtime inscription decimation", "DECIMATE")
    decimate.ratio = 0.08 if face == "east" else 0.03
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    return finish(obj, target, root, mat, kind)


def add_tuscan_column(
    prefix: str,
    x: float,
    y: float,
    stone: bpy.types.Material,
    shadow: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    box(prefix + " bottom plinth", (0.82, 0.82, 0.13), (x, y, 0.065), stone, target, root, "memorial-column-pedestal", bevel=0.025)
    box(prefix + " lower step", (0.72, 0.72, 0.13), (x, y, 0.195), stone, target, root, "memorial-column-pedestal", bevel=0.022)
    box(prefix + " square pedestal", (0.60, 0.60, 0.47), (x, y, 0.49), stone, target, root, "memorial-column-pedestal", bevel=0.028)
    box(prefix + " pedestal shadow joint", (0.62, 0.62, 0.035), (x, y, 0.39), shadow, target, root, "memorial-moulding-shadow")
    box(prefix + " pedestal cap lower", (0.70, 0.70, 0.10), (x, y, 0.77), stone, target, root, "memorial-column-pedestal", bevel=0.02)
    box(prefix + " pedestal cap upper", (0.62, 0.62, 0.10), (x, y, 0.87), stone, target, root, "memorial-column-pedestal", bevel=0.018)
    cylinder(prefix + " shaft base torus", 0.31, 0.10, (x, y, 0.98), stone, target, root, "tuscan-column-base", vertices=24)
    cylinder(prefix + " shaft lower ring", 0.27, 0.09, (x, y, 1.07), stone, target, root, "tuscan-column-base", vertices=24)
    cone(prefix + " tapered Tuscan shaft", 0.235, 0.205, 1.83, (x, y, 2.03), stone, target, root, "tuscan-column-shaft", vertices=24)
    cylinder(prefix + " capital neck", 0.225, 0.10, (x, y, 3.00), stone, target, root, "tuscan-column-capital", vertices=24)
    cone(prefix + " capital echinus", 0.23, 0.33, 0.16, (x, y, 3.13), stone, target, root, "tuscan-column-capital", vertices=24)
    box(prefix + " capital abacus", (0.64, 0.64, 0.13), (x, y, 3.28), stone, target, root, "tuscan-column-capital", bevel=0.018)


def add_urn(
    prefix: str,
    x: float,
    y: float,
    stone: bpy.types.Material,
    shadow: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    box(prefix + " square base", (0.48, 0.48, 0.18), (x, y, 4.10), stone, target, root, "east-urn-finial", bevel=0.025)
    cylinder(prefix + " foot", 0.16, 0.12, (x, y, 4.25), stone, target, root, "east-urn-finial", vertices=20)
    sphere(prefix + " lower bowl", 0.24, (x, y, 4.42), stone, target, root, "east-urn-finial", scale=(0.88, 0.88, 1.15))
    cylinder(prefix + " dark neck line", 0.15, 0.035, (x, y, 4.57), shadow, target, root, "memorial-moulding-shadow", vertices=20)
    cone(prefix + " urn neck", 0.14, 0.09, 0.20, (x, y, 4.67), stone, target, root, "east-urn-finial", vertices=20)
    cone(prefix + " urn lid", 0.23, 0.06, 0.16, (x, y, 4.84), stone, target, root, "east-urn-finial", vertices=20)
    cone(prefix + " urn tip", 0.07, 0.0, 0.18, (x, y, 5.01), stone, target, root, "east-urn-finial", vertices=16)


def add_swag(
    prefix: str,
    x: float,
    center_y: float,
    center_z: float,
    width: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    segments = 13
    for index in range(segments):
        t = index / (segments - 1)
        y = center_y - width / 2 + width * t
        z = center_z - math.sin(math.pi * t) * 0.22
        sphere(f"{prefix} garland bead {index + 1:02d}", 0.055, (x, y, z), mat, target, root, "east-pressed-cement-swag", scale=(0.65, 1.0, 1.0))
    for y in (center_y - width / 2, center_y + width / 2):
        sphere(prefix + f" rosette {y:+.2f}", 0.10, (x, y, center_z + 0.01), mat, target, root, "east-pressed-cement-rosette", scale=(0.55, 1.0, 1.0))
        for drop in range(3):
            sphere(prefix + f" drop {y:+.2f} {drop}", 0.045, (x, y, center_z - 0.12 - drop * 0.10), mat, target, root, "east-pressed-cement-swag", scale=(0.60, 1.0, 1.1))


def add_team_photo_panel(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    frame: bpy.types.Material,
    photo: bpy.types.Material,
    dark: bpy.types.Material,
    light: bpy.types.Material,
) -> None:
    y = 1.61
    box("2018 reproductive team photograph backing", (4.28, 0.075, 2.32), (0.42, y, 1.72), frame, target, root, "restoration-team-photo-frame", bevel=0.035)
    box("2018 reproductive team photograph", (4.12, 0.035, 2.16), (0.42, y - 0.055, 1.72), photo, target, root, "restoration-team-photo")
    for index in range(1, 6):
        x = 0.42 - 2.06 + index * 4.12 / 6
        box(f"Team photo tile joint vertical {index}", (0.018, 0.018, 2.16), (x, y - 0.081, 1.72), frame, target, root, "photo-tile-joint")
    for index in range(1, 3):
        z = 1.72 - 1.08 + index * 2.16 / 3
        box(f"Team photo tile joint horizontal {index}", (4.12, 0.018, 0.018), (0.42, y - 0.081, z), frame, target, root, "photo-tile-joint")
    rows = [(-0.02, 2.38, 7), (0.42, 1.72, 6), (0.52, 1.04, 5)]
    for row, (offset, z, count) in enumerate(rows, start=1):
        span = 3.55
        for index in range(count):
            x = 0.42 + offset - span / 2 + (span / max(1, count - 1)) * index
            mat = light if (row == 3 and index in {2, 3}) else dark
            cylinder(
                f"Team portrait head {row}-{index + 1}", 0.105, 0.035,
                (x, y - 0.102, z + 0.16), mat, target, root, "photo-portrait-cue",
                vertices=14, rotation=(math.pi / 2, 0, 0)
            )
            box(
                f"Team portrait torso {row}-{index + 1}", (0.25, 0.035, 0.34),
                (x, y - 0.102, z - 0.07), mat, target, root, "photo-portrait-cue"
            )


def add_wreath_panel(
    target: bpy.types.Collection,
    root: bpy.types.Object,
    wall: bpy.types.Material,
    bronze: bpy.types.Material,
    ceramic: bpy.types.Material,
    green: bpy.types.Material,
) -> None:
    # The CMP photographs place the restored panel on the east face of the
    # adjacent substation wall, not on a memorial column. This short context
    # return prevents the panel from floating while avoiding an invented full
    # substation shell.
    box("Photographed substation wall return", (0.25, 2.55, 2.72), (-3.23, 0.26, 1.36), wall, target, root, "context-substation-wall-return", bevel=0.025)
    box("2018 bronze names panel", (0.09, 1.25, 0.94), (-3.085, -0.12, 1.53), bronze, target, root, "restoration-wreath-name-panel", bevel=0.055)
    # Ceramic replica wreath and the surrounding name-line cues.
    for index in range(20):
        angle = index / 20 * math.tau
        y = -0.12 + math.cos(angle) * 0.29
        z = 1.57 + math.sin(angle) * 0.29
        mat = ceramic if index % 4 == 0 else green
        sphere(f"Replica wreath leaf {index + 1:02d}", 0.055, (-3.028, y, z), mat, target, root, "restoration-replica-wreath", scale=(0.55, 1.0, 0.65))
    for index in range(5):
        z = 1.20 + index * 0.16
        box(f"Bronze fallen-name line {index + 1}", (0.018, 0.34, 0.018), (-3.025, 0.33, z), ceramic, target, root, "restoration-name-line")


def build(target: bpy.types.Collection) -> None:
    root = bpy.data.objects.new("Sportsman's War Memorial asset root", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_condition_date"] = "2026-07-11"
    root["eg_east_face"] = "Blender +X"
    root["eg_south_approach"] = "Blender -Y / Three.js +Z"

    stone = material("Sportsman's Memorial restored warm-grey concrete", 0xB9B3A3, 0.76)
    stone_light = material("Sportsman's Memorial cornice highlight", 0xD2CCBA, 0.70)
    shadow = material("Sportsman's Memorial moulding shadow", 0x756F64, 0.88)
    marble = material("Sportsman's Memorial south marble dedication", 0xDAD5C7, 0.62)
    inscription = material("Sportsman's Memorial incised inscription", 0x5A554E, 0.78)
    bronze = material("Sportsman's Memorial restored bronze panel", 0x755339, 0.42, 0.46)
    ceramic = material("Sportsman's Memorial replica wreath porcelain", 0xE2DED1, 0.54)
    wreath_green = material("Sportsman's Memorial replica wreath green", 0x31594A, 0.60)
    photo = material("Sportsman's Memorial reproductive photo sepia", 0x8A8273, 0.84)
    photo_dark = material("Sportsman's Memorial photo dark uniforms", 0x283330, 0.82)
    photo_light = material("Sportsman's Memorial photo light uniforms", 0xC7C0AE, 0.78)
    steel = material("Sportsman's Memorial discreet restoration steel", 0x3D4442, 0.46, 0.42)
    trellis = material("Sportsman's Memorial open trellis mesh", 0x5E6862, 0.58, 0.30, alpha=0.48)
    concrete = material("Sportsman's Memorial compacted path slab", 0x948F83, 0.94)

    box("Memorial arbour path threshold", (6.70, 3.34, 0.09), (0, 0, 0.0), concrete, target, root, "memorial-path-threshold", bevel=0.04)
    for x in (-2.50, 0.0, 2.50):
        for y in (-1.10, 1.10):
            add_tuscan_column(f"Column {x:+.2f} {y:+.2f}", x, y, stone, shadow, target, root)

    # Perimeter entablature: architrave, textured frieze, moulded cornice.
    for y, side in ((-1.10, "South"), (1.10, "North")):
        box(f"{side} architrave", (6.58, 0.44, 0.28), (0, y, 3.43), stone, target, root, "memorial-architrave", bevel=0.025)
        box(f"{side} textured frieze", (6.54, 0.40, 0.31), (0, y, 3.71), shadow, target, root, "memorial-textured-frieze", bevel=0.018)
        for index in range(18):
            x = -3.05 + index * 6.10 / 17
            box(f"{side} frieze texture {index + 1:02d}", (0.20, 0.018, 0.11), (x, y - (0.211 if y < 0 else -0.211), 3.71), stone, target, root, "memorial-frieze-relief", bevel=0.015)
        box(f"{side} lower cornice", (6.82, 0.58, 0.13), (0, y, 3.94), stone_light, target, root, "memorial-moulded-cornice", bevel=0.02)
        box(f"{side} upper cornice", (7.02, 0.66, 0.12), (0, y, 4.06), stone, target, root, "memorial-moulded-cornice", bevel=0.018)
    for x, side in ((-2.82, "West"), (2.82, "East")):
        box(f"{side} architrave", (0.44, 2.58, 0.28), (x, 0, 3.43), stone, target, root, "memorial-architrave", bevel=0.025)
        box(f"{side} textured frieze", (0.40, 2.54, 0.31), (x, 0, 3.71), shadow, target, root, "memorial-textured-frieze", bevel=0.018)
        box(f"{side} lower cornice", (0.58, 2.80, 0.13), (x, 0, 3.94), stone_light, target, root, "memorial-moulded-cornice", bevel=0.02)
        box(f"{side} upper cornice", (0.66, 2.98, 0.12), (x, 0, 4.06), stone, target, root, "memorial-moulded-cornice", bevel=0.018)

    # Nine north-south rafters and a light open support mesh; no current vine
    # mass is invented because the CMP restoration photographs show the frame.
    for index, x in enumerate([-2.70, -2.03, -1.35, -0.68, 0, 0.68, 1.35, 2.03, 2.70], start=1):
        box(f"Parallel arbour rafter {index:02d}", (0.18, 3.12, 0.21), (x, 0, 4.20), stone, target, root, "memorial-parallel-rafter", bevel=0.018)
    for index, y in enumerate((-0.76, -0.38, 0.0, 0.38, 0.76), start=1):
        box(f"Open trellis longitudinal {index}", (5.30, 0.035, 0.035), (0, y, 4.25), trellis, target, root, "memorial-open-trellis")

    # East restoration facade: recessed inscription, rectangular stepped
    # central panel, two pressed-cement swags and paired restored urns.
    box("East recessed IN MEMORIAM field", (0.20, 2.16, 0.46), (3.10, 0, 3.68), stone_light, target, root, "sportsmans-east-inscription-field", bevel=0.025)
    text_mesh("East incised IN MEMORIAM", "IN MEMORIAM", (3.215, 0, 3.66), 0.23, inscription, target, root, "sportsmans-east-inscription", "east")
    box("East raised swag panel", (0.30, 1.72, 0.74), (3.02, 0, 4.39), stone, target, root, "sportsmans-east-pediment", bevel=0.025)
    box("East raised panel lower moulding", (0.38, 1.90, 0.13), (3.02, 0, 4.08), stone_light, target, root, "east-pediment-moulding", bevel=0.018)
    box("East raised panel upper moulding", (0.38, 1.98, 0.14), (3.02, 0, 4.78), stone_light, target, root, "east-pediment-moulding", bevel=0.018)
    add_swag("East north swag", 3.19, -0.43, 4.55, 0.74, shadow, target, root)
    add_swag("East south swag", 3.19, 0.43, 4.55, 0.74, shadow, target, root)
    add_urn("East north urn", 2.82, 1.10, stone, shadow, target, root)
    add_urn("East south urn", 2.82, -1.10, stone, shadow, target, root)

    # The long south beam retains the dedication plaque documented in both
    # the historic and current views.
    box("South marble dedication plaque", (3.18, 0.055, 0.44), (0.15, -1.335, 3.68), marble, target, root, "south-dedication-plaque", bevel=0.025)
    text_mesh(
        "South dedication lettering",
        "FITZROY SPORTING CLUBS\nTHE FALLEN · GREAT WAR 1914–1919",
        (0.15, -1.373, 3.68),
        0.105,
        inscription,
        target,
        root,
        "south-dedication-lettering",
        "south",
    )

    # Two unobtrusive square luminaires are visible above the restored south
    # beam in Figure 64; they are attached, not freestanding park lamps.
    for x in (-2.18, 2.18):
        box(f"Restoration beam light housing {x:+.2f}", (0.28, 0.18, 0.25), (x, -1.22, 4.28), steel, target, root, "memorial-attached-light", rotation=(math.radians(-8), 0, 0), bevel=0.025)
        box(f"Restoration beam light lens {x:+.2f}", (0.22, 0.025, 0.16), (x, -1.325, 4.26), ceramic, target, root, "memorial-attached-light-lens", rotation=(math.radians(-8), 0, 0), bevel=0.02)

    add_team_photo_panel(target, root, stone, photo, photo_dark, photo_light)
    add_wreath_panel(target, root, stone, bronze, ceramic, wreath_green)

    # Small photographed cracking on the west beam is represented as surface
    # shadow lines only; it does not alter collision or structural silhouette.
    for index, (y, z, angle) in enumerate(((-0.58, 3.73, -0.35), (0.02, 3.66, 0.18), (0.62, 3.74, -0.22)), start=1):
        box(
            f"West beam crack cue {index}", (0.018, 0.42, 0.022), (-3.035, y, z), shadow,
            target, root, "west-beam-crack-cue", rotation=(angle, 0, 0), bevel=0.004
        )


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world
    world.color = (0.025, 0.032, 0.040)
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.075, 0.095, 0.11, 1)
        background.inputs["Strength"].default_value = 0.34
    ground_mat = material("Preview winter grass", 0x59684C, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=45, location=(0, 0, -0.08))
    ground = bpy.context.object
    ground.name = "Preview ground"
    ground.data.materials.append(ground_mat)
    relink(ground, target)

    sun_data = bpy.data.lights.new("Winter sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(20)
    sun = bpy.data.objects.new("Winter sun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(33), math.radians(-12), math.radians(-42))

    south_data = bpy.data.lights.new("South approach fill", "AREA")
    south_data.energy = 850
    south_data.shape = "RECTANGLE"
    south_data.size = 9
    south_data.size_y = 6
    south = bpy.data.objects.new("South approach fill", south_data)
    target.objects.link(south)
    south.location = (0, -12, 9)
    south.rotation_euler = (Vector((0, 0, 2.2)) - south.location).to_track_quat("-Z", "Y").to_euler()

    east_data = bpy.data.lights.new("East inscription fill", "AREA")
    east_data.energy = 720
    east_data.shape = "DISK"
    east_data.size = 7
    east = bpy.data.objects.new("East inscription fill", east_data)
    target.objects.link(east)
    east.location = (11, -1, 7)
    east.rotation_euler = (Vector((2.5, 0, 3.2)) - east.location).to_track_quat("-Z", "Y").to_euler()

    camera_data = bpy.data.cameras.new("Sportsman's Memorial audit camera")
    camera = bpy.data.objects.new("Sportsman's Memorial audit camera", camera_data)
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
        ("01-south-current-elevation", (8.5, -12.5, 7.0), (0, -0.2, 2.45)),
        ("02-east-in-memoriam", (12.0, -1.0, 6.6), (2.5, 0, 3.1)),
        ("03-restored-wreath-panel", (0.2, -2.7, 3.8), (-3.05, -0.05, 1.65)),
        ("04-restored-team-photo", (5.8, -8.0, 4.6), (0.4, 1.25, 1.8)),
        ("05-rafter-and-urn-aerial", (8.0, -8.5, 12.0), (0, 0, 2.5)),
        ("06-column-passage", (1.25, -7.0, 2.4), (1.25, 0.4, 1.7)),
        ("07-east-lettering-close", (7.6, -0.2, 4.2), (3.0, 0, 3.9)),
        ("08-restoration-panels-context", (-7.8, -6.0, 4.5), (-1.2, 0.8, 1.9)),
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
    runtime_mesh.name = "Sportsman's War Memorial optimized runtime mesh"
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
        "label": "Sportsman's War Memorial",
        "conditionDate": "2026-07-11",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": str(blend.relative_to(Path.cwd())),
            "glb": str(glb.relative_to(Path.cwd())),
            "generator": "scripts/blender/build_sportsmans_memorial.py",
        },
        "primaryEvidence": [
            "https://www.yarracity.vic.gov.au/things-to-do/arts/gallery/public-art/sportsmans-memorial",
            "https://placesofpride.awm.gov.au/memorials/241121",
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
        ],
        "translatedCondition": "Restored 2026 memorial arbour including the 2018 interpretation/photo and replica-wreath/name-panel works",
        "dimensionsGameUnits": {"arbourLength": ASSET_LENGTH, "arbourDepth": ASSET_DEPTH, "urnTipHeight": 5.10},
        "navigationContract": {
            "sixColumns": "only the photographed six pedestal footprints block the player; the arbour is not represented by a solid rectangle",
            "southApproach": "current perpendicular south footpath enters the clear bay between the centre and east column",
            "eastInscription": "IN MEMORIAM field remains externally readable and independently interactive",
            "restorationPanels": "team photograph and replica wreath/name panel remain visible on their photographed adjacent wall faces",
        },
        "uncertainty": [
            "The AWM/Yarra sources fix the point and current identity, but no public measured plan fixes overall dimensions or exact column centres.",
            "The 6.40 x 3.10 horizontal frame retains the existing photograph/aerial-fitted game dimensions and is not claimed as a survey.",
            "The short substation wall return is limited to the portion visible in CMP Figures 64-65; no unverified full substation shell is invented.",
            "The reproductive team photograph is a painterly geometric interpretation, not a copied raster image or portrait reconstruction.",
            "The surrounding rosemary hedge is omitted because its current geometry lacks a public survey and baking guessed hedge blocks would compromise navigation.",
            "Fine moulding, crack, light, trellis and plaque-letter spacing are proportional readings of photographs.",
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
    model = collection("EG_SPORTSMANS_MEMORIAL_MODEL")
    preview = collection("EG_SPORTSMANS_MEMORIAL_PREVIEW")
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

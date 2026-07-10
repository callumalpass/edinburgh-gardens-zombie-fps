"""Build the 2026 Fitzroy Victoria Bowling & Sports Club asset.

The asset uses the exact localised polygon derived from OSM way 543505639.
The CMP 2021 section 3.2.9 and Figures 70-73 control the visible building
fabric. City of Yarra's 2025 roof notice controls the retained appearance and
new zincalume roof/gutters. City of Yarra's public-art record establishes the
earlier 150-year mural context; geotagged photographs taken 28 May 2026 control
the current Melanie Caple east-wall composition.

Blender -Y is the green-facing elevation. glTF converts that to Three.js +Z.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-fitzroy-victoria-bowling-club"
ASSET_LENGTH = 80.24
ASSET_DEPTH = 30.96

# OSM way 543505639 transformed into the fitted building frame used by the
# runtime. Coordinates are (local X, local plan Z); positive plan Z faces the
# bowling greens and becomes Blender -Y.
LOCAL_POLYGON = [
    (-35.1526, -2.0816),
    (-35.4856, -0.6554),
    (-40.1155, -1.7358),
    (-39.0235, -6.4629),
    (-38.4385, -8.9799),
    (31.1611, -8.9799),
    (22.6354, 15.4757),
    (-14.8631, 6.7842),
    (-14.5661, 5.4832),
    (-31.1757, 1.6231),
    (-29.5437, -5.4109),
    (-30.5631, -5.8346),
    (-31.6259, -1.2763),
]

EVIDENCE = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.9 and Figures 70-73"


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
    rotation_z: float = 0.0,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation_z))
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
    rotation: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    vertices: int = 20,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, target, root, mat, kind)


def plan_to_blender(point: tuple[float, float]) -> Vector:
    return Vector((point[0], -point[1], 0))


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
    vertices = [(x, -plan_z, bottom) for x, plan_z in polygon] + [(x, -plan_z, top) for x, plan_z in polygon]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, next_index + count, index + count))
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    return finish(obj, target, root, mat, kind, bevel=0.035)


def segment_frame(
    start: tuple[float, float],
    end: tuple[float, float],
    outward_offset: float,
) -> tuple[Vector, Vector, Vector, float, float]:
    a = plan_to_blender(start)
    b = plan_to_blender(end)
    tangent = b - a
    length = tangent.length
    tangent.normalize()
    outward = Vector((tangent.y, -tangent.x, 0))
    centre = (a + b) * 0.5 + outward * outward_offset
    angle = math.atan2(tangent.y, tangent.x)
    return centre, tangent, outward, length, angle


def segment_box(
    name: str,
    start: tuple[float, float],
    end: tuple[float, float],
    outward_offset: float,
    depth: float,
    height: float,
    z: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    length_inset: float = 0.0,
    bevel: float = 0.0,
) -> bpy.types.Object:
    centre, _, _, length, angle = segment_frame(start, end, outward_offset)
    return box(name, (max(0.1, length - length_inset), depth, height), (centre.x, centre.y, z), mat, target, root, kind, rotation_z=angle, bevel=bevel)


def segment_point(start: tuple[float, float], end: tuple[float, float], t: float, outward_offset: float) -> Vector:
    centre, tangent, outward, length, _ = segment_frame(start, end, outward_offset)
    return centre + tangent * ((t - 0.5) * length)


def add_curtain_wall(
    label: str,
    start: tuple[float, float],
    end: tuple[float, float],
    bays: int,
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    door_bays: tuple[int, ...] = (),
) -> None:
    centre, tangent, outward, length, angle = segment_frame(start, end, 0.11)
    bay_width = length / bays
    for index in range(bays):
        point = centre + tangent * ((index + 0.5 - bays / 2) * bay_width)
        glass_mat = mats["door_glass"] if index in door_bays else mats["glass"]
        box(
            f"{label} {'door' if index in door_bays else 'window'} bay {index + 1:02d}",
            (bay_width - 0.16, 0.075, 1.78),
            (point.x, point.y, 1.52),
            glass_mat,
            target,
            root,
            "green-facing glazed door" if index in door_bays else "green-facing aluminium-framed window",
            rotation_z=angle,
            bevel=0.018,
        )
        if index in door_bays:
            handle_point = point + tangent * (bay_width * 0.22) + outward * 0.075
            cylinder(
                f"{label} door pull {index + 1:02d}",
                0.035,
                0.42,
                (handle_point.x, handle_point.y, 1.52),
                (math.pi / 2, 0, angle),
                mats["metal"],
                target,
                root,
                "glazed door pull",
                vertices=12,
            )
    for index in range(bays + 1):
        point = centre + tangent * ((index - bays / 2) * bay_width)
        box(
            f"{label} green mullion {index + 1:02d}",
            (0.085, 0.13, 2.22),
            (point.x, point.y, 1.45),
            mats["green_frame"],
            target,
            root,
            "green curtain-wall mullion",
            rotation_z=angle,
            bevel=0.01,
        )
    for row, z in enumerate((0.48, 1.14, 2.02, 2.54), start=1):
        segment_box(
            f"{label} green transom {row:02d}",
            start,
            end,
            0.14,
            0.13,
            0.085,
            z,
            mats["green_frame"],
            target,
            root,
            "green curtain-wall transom",
            length_inset=0.1,
        )

    # The shallow green-facing awning, its posts and fascia are distinct from
    # the exact building footprint and remain outside the solid collision.
    segment_box(f"{label} verandah canopy", start, end, 0.92, 1.65, 0.12, 2.83, mats["roof"], target, root, "zincalume green-facing verandah roof", length_inset=-0.5, bevel=0.025)
    segment_box(f"{label} blue fascia", start, end, 1.72, 0.13, 0.38, 2.64, mats["fascia"], target, root, "blue-and-gold club fascia", length_inset=-0.25, bevel=0.018)
    for index in range(bays + 1):
        point = centre + tangent * ((index - bays / 2) * bay_width) + outward * 1.42
        box(
            f"{label} verandah post {index + 1:02d}",
            (0.085, 0.085, 2.46),
            (point.x, point.y, 1.33),
            mats["green_frame"],
            target,
            root,
            "green steel verandah post",
            rotation_z=angle,
            bevel=0.01,
        )
    segment_box(f"{label} concrete apron", start, end, 1.2, 2.2, 0.1, 0.05, mats["concrete"], target, root, "green-facing concrete apron", length_inset=-0.35, bevel=0.025)


def add_block_text(
    name: str,
    text: str,
    start: tuple[float, float],
    end: tuple[float, float],
    t: float,
    outward_offset: float,
    z: float,
    size: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    point = segment_point(start, end, t, outward_offset)
    _, _, _, _, angle = segment_frame(start, end, outward_offset)
    glyphs = {
        "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
        "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
        "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
        "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
        "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01110"),
        "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
        "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
        "N": ("10001", "11001", "11001", "10101", "10011", "10011", "10001"),
        "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
        "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
        "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
        "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
        "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
        "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
        "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
        "W": ("10001", "10001", "10001", "10101", "10101", "10101", "01010"),
        "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
        "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
        "&": ("01100", "10010", "10100", "01000", "10101", "10010", "01101"),
        " ": ("000",) * 7,
    }
    cell = size / 7
    cell_width = cell * 0.88
    depth = 0.035
    spacing = cell * 0.72
    widths = [len(glyphs.get(character, glyphs[" "])[0]) * cell_width for character in text]
    total_width = sum(widths) + spacing * max(0, len(text) - 1)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    cursor = -total_width / 2

    for character, glyph, glyph_width in zip(text, (glyphs.get(character, glyphs[" "]) for character in text), widths):
        for row, pattern in enumerate(glyph):
            for column, filled in enumerate(pattern):
                if filled != "1":
                    continue
                x0 = cursor + column * cell_width
                x1 = x0 + cell_width * 0.82
                z1 = size / 2 - row * cell
                z0 = z1 - cell * 0.82
                base = len(vertices)
                vertices.extend(
                    [
                        (x0, -depth, z0),
                        (x1, -depth, z0),
                        (x1, -depth, z1),
                        (x0, -depth, z1),
                        (x0, 0, z0),
                        (x1, 0, z0),
                        (x1, 0, z1),
                        (x0, 0, z1),
                    ]
                )
                faces.extend(
                    [
                        (base, base + 1, base + 2, base + 3),
                        (base + 4, base + 7, base + 6, base + 5),
                        (base, base + 4, base + 5, base + 1),
                        (base + 1, base + 5, base + 6, base + 2),
                        (base + 2, base + 6, base + 7, base + 3),
                        (base + 3, base + 7, base + 4, base),
                    ]
                )
        cursor += glyph_width + spacing

    mesh = bpy.data.meshes.new(f"{name} block-letter mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (point.x, point.y, z)
    obj.rotation_euler.z = angle
    finish(obj, target, root, mat, "raised gold club fascia lettering")


def add_text(
    name: str,
    text: str,
    start: tuple[float, float],
    end: tuple[float, float],
    t: float,
    outward_offset: float,
    z: float,
    size: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    """Add low-depth raised fascia text without expensive curve bevels.

    Blender's default font matches the plain sans-serif fascia lettering more
    closely than a pixel alphabet. Keeping curve resolution at one and using
    extrusion without bevel preserves that silhouette at under 1,500 combined
    triangles instead of the first pass's 44,856.
    """
    point = segment_point(start, end, t, outward_offset)
    _, _, _, _, angle = segment_frame(start, end, outward_offset)
    curve = bpy.data.curves.new(f"{name} curve", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.resolution_u = 1
    curve.extrude = 0.008
    curve.bevel_depth = 0
    obj = bpy.data.objects.new(name, curve)
    obj.location = (point.x, point.y, z)
    obj.rotation_euler = (math.pi / 2, 0, angle)
    finish(obj, target, root, mat, "raised gold club fascia lettering")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)


def add_roof_ribs(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    sections = [
        ("west main", -13.5, 30.0, -10.5, 8.6, 28),
        ("east main", -30.5, -14.5, -4.8, 8.6, 12),
        ("east service", -38.2, -31.0, -0.5, 8.4, 7),
    ]
    for section, x_min, x_max, y_min, y_max, count in sections:
        for index in range(count):
            x = x_min + (index + 0.5) * (x_max - x_min) / count
            box(
                f"{section.title()} zincalume rib {index + 1:02d}",
                (0.045, y_max - y_min, 0.045),
                (x, (y_min + y_max) / 2, 3.22),
                mats["roof_rib"],
                target,
                root,
                "new zincalume roof standing seam",
            )


def add_solar_panels(
    start: tuple[float, float],
    end: tuple[float, float],
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    _, tangent, outward, length, angle = segment_frame(start, end, -1.35)
    for row in range(2):
        for index in range(7):
            t = 0.17 + index * 0.105
            point = segment_point(start, end, t, -1.25 - row * 1.28)
            panel = box(
                f"Green-front solar panel row {row + 1} panel {index + 1:02d}",
                (length * 0.087, 1.08, 0.07),
                (point.x, point.y, 3.35 + row * 0.03),
                mats["solar"],
                target,
                root,
                "green-front rooftop solar panel",
                rotation_z=angle,
                bevel=0.015,
            )
            panel["eg_evidence"] = "CMP 2021 Figure 71"
            # Thin pale dividers make the solar array legible in the painterly
            # material system without using a photoreal texture.
            for divider in (-0.27, 0, 0.27):
                centre = point + tangent * (divider * length * 0.087)
                box(
                    f"Solar panel {row + 1}-{index + 1:02d} divider {divider:+.2f}",
                    (0.018, 1.02, 0.025),
                    (centre.x, centre.y, 3.395 + row * 0.03),
                    mats["roof_rib"],
                    target,
                    root,
                    "solar panel divider",
                    rotation_z=angle,
                )


def add_upper_storey(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    centre_x = -21.7
    centre_y = 1.35
    width = 15.2
    depth = 8.4
    box("Cream upper-storey block", (width, depth, 1.65), (centre_x, centre_y, 3.88), mats["cream"], target, root, "cream double-storey club wing", bevel=0.055)
    box("Upper-storey zincalume roof", (width + 0.55, depth + 0.55, 0.16), (centre_x, centre_y, 4.79), mats["roof"], target, root, "upper-storey zincalume roof", bevel=0.03)
    # Green-facing upper windows on Blender -Y.
    front_y = centre_y - depth / 2 - 0.045
    for index, x in enumerate((-26.8, -23.4, -20.0, -16.6), start=1):
        box(f"Upper green-facing window {index:02d}", (2.45, 0.08, 0.82), (x, front_y, 3.92), mats["glass"], target, root, "upper-storey aluminium-framed window", bevel=0.025)
        for side in (-1, 1):
            box(f"Upper window {index:02d} jamb {'L' if side < 0 else 'R'}", (0.065, 0.11, 0.92), (x + side * 1.24, front_y - 0.02, 3.92), mats["green_frame"], target, root, "upper-storey green window frame")
        box(f"Upper window {index:02d} transom", (2.5, 0.11, 0.065), (x, front_y - 0.02, 3.92), mats["green_frame"], target, root, "upper-storey green window frame")
    # Rear windows from the 1975 street-side photograph.
    rear_y = centre_y + depth / 2 + 0.045
    for index, x in enumerate((-26.8, -23.4, -20.0, -16.6), start=1):
        box(f"Upper rear window {index:02d}", (2.45, 0.08, 0.78), (x, rear_y, 3.92), mats["glass"], target, root, "upper-storey rear aluminium window", bevel=0.025)
    for x in (centre_x - width / 2 + 0.34, centre_x + width / 2 - 0.34):
        box("Upper-storey downpipe", (0.11, 0.12, 4.55), (x, rear_y + 0.08, 2.3), mats["metal"], target, root, "upgraded roof downpipe", bevel=0.02)


def add_rear_service_elevation(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    rear_y = 9.04
    for index, x in enumerate((-27.0, -16.0, -5.0, 6.0, 17.0, 27.0), start=1):
        if index in (2, 5):
            box(f"Rear service door {index:02d}", (1.55, 0.09, 2.12), (x, rear_y, 1.12), mats["door"], target, root, "rear flush-panel service door", bevel=0.025)
            box(f"Rear service door handle {index:02d}", (0.08, 0.06, 0.16), (x + 0.52, rear_y + 0.07, 1.12), mats["metal"], target, root, "rear service door handle", bevel=0.01)
        else:
            box(f"Rear aluminium window {index:02d}", (3.0, 0.08, 0.9), (x, rear_y, 1.62), mats["glass"], target, root, "rear aluminium-framed window", bevel=0.025)
            box(f"Rear window sill {index:02d}", (3.12, 0.13, 0.08), (x, rear_y + 0.02, 1.13), mats["green_frame"], target, root, "rear aluminium window sill")
    box("Rear upgraded gutter", (68.6, 0.14, 0.14), (-3.7, rear_y + 0.03, 3.18), mats["metal"], target, root, "upgraded rear gutter", bevel=0.025)
    for index, x in enumerate((-37.3, -12.0, 12.0, 30.0), start=1):
        box(f"Rear upgraded downpipe {index:02d}", (0.11, 0.12, 2.9), (x, rear_y + 0.07, 1.48), mats["metal"], target, root, "upgraded rear downpipe", bevel=0.02)


def add_mural(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # The St Georges Road elevation is reached from the Hannah memorial gate.
    # Geotagged 28 May 2026 photographs show the current Melanie Caple wall:
    # deep maroon ground, two lions against amber discs, a central floral
    # still life, two green/blue budgies, foliage and gold rays. Low-relief
    # shapes preserve the game's painterly language rather than texture-copying
    # the source photograph or reproducing the mural brush-for-brush.
    wall_x = -40.18
    box("Current east mural maroon field", (0.09, 7.45, 2.60), (wall_x, 3.55, 1.42), mats["mural_maroon"], target, root, "current 2026 Melanie Caple mural field", bevel=0.02)
    box("Current east mural warm base", (0.055, 7.18, 0.16), (wall_x - 0.055, 3.55, 0.24), mats["mural_orange"], target, root, "current mural warm base line", bevel=0.018)

    # The east-wall audit camera views increasing Blender Y from right to left.
    # Mirror authored screen-space coordinates so the photographed standing
    # lion remains left and the reclining lion remains right from St Georges Rd.
    def screen_y(value: float) -> float:
        return 7.10 - value

    def ellipse(name: str, y: float, z: float, radius_y: float, radius_z: float, mat: bpy.types.Material, role: str, layer: float = 0.12, vertices: int = 18) -> bpy.types.Object:
        obj = cylinder(name, 1, 0.06, (wall_x - layer, screen_y(y), z), (0, math.pi / 2, 0), mat, target, root, role, vertices=vertices)
        obj.scale.y = radius_y
        obj.scale.x = radius_z
        return obj

    def mural_bar(name: str, y: float, z: float, length: float, thickness: float, angle: float, mat: bpy.types.Material, role: str, layer: float = 0.105) -> bpy.types.Object:
        obj = box(name, (0.055, length, thickness), (wall_x - layer, screen_y(y), z), mat, target, root, role, bevel=0.018)
        obj.rotation_euler.x = -angle
        return obj

    # Gold diagonal rays behind the subjects, matching the current wall's
    # repeated angular rhythm while remaining economical at runtime.
    for index, (y, z, length, angle) in enumerate(
        ((0.55, 2.05, 0.75, -0.72), (1.35, 0.52, 0.72, 0.62), (2.15, 2.18, 0.88, -0.62), (4.62, 2.18, 0.82, 0.68), (5.18, 0.48, 0.74, -0.58), (6.62, 1.95, 0.78, 0.72), (6.75, 0.62, 0.66, -0.70)),
        start=1,
    ):
        mural_bar(f"Current mural gold ray {index:02d}", y, z, length, 0.09, angle, mats["mural_gold"], "current mural gold diagonal ray")

    # Left standing lion: pale outline, warm body, maroon mane and face.
    ellipse("Current mural left lion amber disc", 0.78, 1.48, 0.82, 0.92, mats["mural_sun"], "left lion amber sun disc", 0.105, 24)
    ellipse("Current mural left lion body outline", 0.90, 1.02, 1.02, 0.38, mats["mural_cream"], "left standing lion white outline", 0.13, 20)
    ellipse("Current mural left lion body", 0.90, 1.03, 0.91, 0.30, mats["mural_lion"], "left standing lion warm body", 0.16, 20)
    for index, y in enumerate((0.45, 0.93, 1.42), start=1):
        box(f"Current mural left lion leg outline {index:02d}", (0.06, 0.19, 0.62), (wall_x - 0.13, screen_y(y), 0.64), mats["mural_cream"], target, root, "left standing lion leg outline", bevel=0.07)
        box(f"Current mural left lion leg {index:02d}", (0.065, 0.13, 0.53), (wall_x - 0.17, screen_y(y), 0.66), mats["mural_lion"], target, root, "left standing lion leg", bevel=0.055)
    left_face_y = 0.32
    left_face_z = 1.55
    for index in range(12):
        angle = index / 12 * math.tau
        ellipse(
            f"Current mural left lion mane outline petal {index + 1:02d}",
            left_face_y + math.cos(angle) * 0.36,
            left_face_z + math.sin(angle) * 0.43,
            0.19,
            0.24,
            mats["mural_cream"],
            "left lion mane white outline",
            0.14,
            12,
        )
        ellipse(
            f"Current mural left lion mane petal {index + 1:02d}",
            left_face_y + math.cos(angle) * 0.34,
            left_face_z + math.sin(angle) * 0.40,
            0.15,
            0.20,
            mats["mural_dark"],
            "left lion layered dark mane",
            0.18,
            12,
        )
    ellipse("Current mural left lion face", left_face_y, left_face_z, 0.27, 0.33, mats["mural_lion"], "left lion face", 0.21, 18)
    for side in (-1, 1):
        ellipse(f"Current mural left lion ear {'L' if side < 0 else 'R'}", left_face_y + side * 0.22, left_face_z + 0.30, 0.10, 0.12, mats["mural_lion"], "left lion ear", 0.22, 12)
        ellipse(f"Current mural left lion eye {'L' if side < 0 else 'R'}", left_face_y + side * 0.08, left_face_z + 0.07, 0.028, 0.033, mats["mural_dark"], "left lion eye", 0.25, 10)
    ellipse("Current mural left lion muzzle", left_face_y, left_face_z - 0.13, 0.15, 0.12, mats["mural_cream"], "left lion muzzle", 0.24, 14)
    ellipse("Current mural left lion nose", left_face_y, left_face_z - 0.08, 0.055, 0.045, mats["mural_dark"], "left lion nose", 0.27, 10)
    mural_bar("Current mural left lion tail", 1.76, 1.30, 0.72, 0.075, -0.50, mats["mural_cream"], "left lion tail outline", 0.14)
    mural_bar("Current mural left lion tail fill", 1.76, 1.30, 0.62, 0.04, -0.50, mats["mural_lion"], "left lion tail", 0.18)

    # Right reclining lion on the second amber disc.
    ellipse("Current mural right lion amber disc", 6.12, 1.43, 0.86, 0.92, mats["mural_sun"], "right lion amber sun disc", 0.105, 24)
    ellipse("Current mural right lion body outline", 6.12, 0.90, 1.02, 0.42, mats["mural_cream"], "right reclining lion white outline", 0.13, 20)
    ellipse("Current mural right lion body", 6.12, 0.91, 0.90, 0.34, mats["mural_lion"], "right reclining lion warm body", 0.16, 20)
    right_face_y = 5.52
    right_face_z = 1.25
    for index in range(12):
        angle = index / 12 * math.tau
        ellipse(
            f"Current mural right lion mane outline petal {index + 1:02d}",
            right_face_y + math.cos(angle) * 0.33,
            right_face_z + math.sin(angle) * 0.36,
            0.17,
            0.21,
            mats["mural_cream"],
            "right lion mane white outline",
            0.14,
            12,
        )
        ellipse(
            f"Current mural right lion mane petal {index + 1:02d}",
            right_face_y + math.cos(angle) * 0.31,
            right_face_z + math.sin(angle) * 0.34,
            0.14,
            0.18,
            mats["mural_dark"],
            "right lion layered dark mane",
            0.18,
            12,
        )
    ellipse("Current mural right lion face", right_face_y, right_face_z, 0.25, 0.29, mats["mural_lion"], "right lion face", 0.21, 18)
    for side in (-1, 1):
        ellipse(f"Current mural right lion ear {'L' if side < 0 else 'R'}", right_face_y + side * 0.20, right_face_z + 0.27, 0.09, 0.11, mats["mural_lion"], "right lion ear", 0.22, 12)
        ellipse(f"Current mural right lion eye {'L' if side < 0 else 'R'}", right_face_y + side * 0.075, right_face_z + 0.06, 0.027, 0.032, mats["mural_dark"], "right lion eye", 0.25, 10)
    ellipse("Current mural right lion muzzle", right_face_y, right_face_z - 0.12, 0.14, 0.105, mats["mural_cream"], "right lion muzzle", 0.24, 14)
    ellipse("Current mural right lion nose", right_face_y, right_face_z - 0.075, 0.05, 0.042, mats["mural_dark"], "right lion nose", 0.27, 10)
    for index, y in enumerate((5.73, 6.08), start=1):
        ellipse(f"Current mural right lion paw outline {index:02d}", y, 0.62, 0.30, 0.13, mats["mural_cream"], "right reclining lion paw outline", 0.18, 14)
        ellipse(f"Current mural right lion paw {index:02d}", y, 0.63, 0.24, 0.09, mats["mural_lion"], "right reclining lion paw", 0.21, 14)

    # Central bar-top still life: glassware, bottles and the large pink flower.
    mural_bar("Current mural still-life tabletop", 3.55, 0.56, 3.18, 0.16, 0.02, mats["mural_orange"], "central still-life table edge", 0.12)
    box("Current mural wine glass stem", (0.06, 0.055, 0.72), (wall_x - 0.14, screen_y(2.38), 1.15), mats["mural_cream"], target, root, "central wine-glass stem", bevel=0.015)
    ellipse("Current mural wine glass bowl", 2.38, 1.56, 0.22, 0.42, mats["mural_cream"], "central wine-glass bowl", 0.15, 16)
    for index, (y, z, width, height, mat) in enumerate(
        ((2.73, 1.05, 0.28, 0.62, mats["mural_gold"]), (3.31, 1.08, 0.34, 0.80, mats["mural_orange"]), (3.72, 1.20, 0.28, 0.96, mats["mural_red"])),
        start=1,
    ):
        ellipse(f"Current mural still-life bottle {index:02d} body", y, z, width, height * 0.48, mat, "central still-life bottle", 0.15, 16)
        box(f"Current mural still-life bottle {index:02d} neck", (0.06, width * 0.45, height * 0.45), (wall_x - 0.16, screen_y(y), z + height * 0.43), mat, target, root, "central still-life bottle neck", bevel=0.035)

    flower_y = 3.12
    flower_z = 1.77
    for index in range(14):
        angle = index / 14 * math.tau
        ellipse(
            f"Current mural dahlia petal {index + 1:02d}",
            flower_y + math.cos(angle) * 0.40,
            flower_z + math.sin(angle) * 0.35,
            0.21,
            0.23,
            mats["mural_pink" if index % 2 == 0 else "mural_cream"],
            "central pink dahlia petal",
            0.19,
            12,
        )
    for index in range(8):
        angle = index / 8 * math.tau + 0.2
        ellipse(
            f"Current mural dahlia inner petal {index + 1:02d}",
            flower_y + math.cos(angle) * 0.22,
            flower_z + math.sin(angle) * 0.19,
            0.16,
            0.18,
            mats["mural_pink"],
            "central pink dahlia inner petal",
            0.215,
            12,
        )
    ellipse("Current mural dahlia centre", flower_y, flower_z, 0.20, 0.20, mats["mural_red"], "central dahlia centre", 0.22, 16)

    # Two green-and-blue budgies overlap the still life in the current image.
    for index, (y, z, angle) in enumerate(((3.82, 1.03, -0.30), (4.28, 0.76, -0.48)), start=1):
        body = ellipse(f"Current mural budgie {index:02d} body", y, z, 0.38, 0.18, mats["mural_green"], "current mural green budgie body", 0.22, 16)
        body.rotation_euler.x = angle
        ellipse(f"Current mural budgie {index:02d} head", y - 0.24, z + 0.16, 0.15, 0.17, mats["mural_green"], "current mural budgie head", 0.23, 14)
        wing = ellipse(f"Current mural budgie {index:02d} blue wing", y + 0.04, z + 0.01, 0.24, 0.11, mats["mural_blue"], "current mural blue budgie wing", 0.25, 14)
        wing.rotation_euler.x = angle
        ellipse(f"Current mural budgie {index:02d} eye", y - 0.29, z + 0.20, 0.025, 0.025, mats["mural_dark"], "current mural budgie eye", 0.27, 8)
        mural_bar(f"Current mural budgie {index:02d} tail", y + 0.38, z - 0.13, 0.62, 0.055, angle - 0.18, mats["mural_blue"], "current mural budgie blue tail", 0.23)

    # Broad glossy leaves frame the current composition.
    for index, (y, z, ry, rz, angle) in enumerate(
        ((1.80, 0.72, 0.40, 0.18, -0.62), (2.05, 1.38, 0.42, 0.20, 0.45), (4.55, 1.54, 0.46, 0.20, -0.42), (4.82, 0.72, 0.42, 0.18, 0.58), (6.90, 1.18, 0.38, 0.17, -0.55)),
        start=1,
    ):
        leaf = ellipse(f"Current mural leaf {index:02d}", y, z, ry, rz, mats["mural_green"], "current mural glossy foliage", 0.18, 14)
        leaf.rotation_euler.x = angle

    # Simplified identity strip above the painting. The front fascia already
    # carries legible club naming, so this street-side strip retains only the
    # sourced blue crest block and gold information-line rhythm.
    box("Current mural club identity strip", (0.06, 3.25, 0.38), (wall_x - 0.13, screen_y(2.05), 2.52), mats["mural_maroon"], target, root, "current mural club identity strip", bevel=0.018)
    box("Current mural blue crest block", (0.065, 0.55, 0.38), (wall_x - 0.16, screen_y(0.47), 2.52), mats["mural_blue"], target, root, "current mural blue club crest block", bevel=0.018)
    for index, (y, length) in enumerate(((1.25, 0.92), (2.28, 0.82), (3.18, 0.70)), start=1):
        mural_bar(f"Current mural identity gold line {index:02d}", y, 2.52, length, 0.055, 0, mats["mural_gold"], "current mural gold identity line", 0.18)


def build(target: bpy.types.Collection) -> tuple[bpy.types.Object, dict[str, bpy.types.Material]]:
    mats = {
        "cream": material("Bowls club bagged-render cream", 0xC9C3A4, 0.9),
        "cream_light": material("Bowls club upper warm cream", 0xDDD5B6, 0.88),
        "glass": material("Bowls club blue-grey glazing", 0x28434A, 0.35, 0.12),
        "door_glass": material("Bowls club door glazing", 0x21393F, 0.3, 0.16),
        "green_frame": material("Bowls club green aluminium frames", 0x3E665B, 0.56, 0.25),
        "roof": material("Bowls club 2025 zincalume roof sheets", 0xBCC6C1, 0.5, 0.35),
        "roof_rib": material("Bowls club zincalume seam highlight", 0xD7DDD8, 0.44, 0.4),
        "metal": material("Bowls club gutters and downpipes", 0x7D8E8A, 0.5, 0.4),
        "fascia": material("Bowls club blue fascia", 0x203F68, 0.68, 0.04),
        "lettering": material("Bowls club gold fascia lettering", 0xE2B04D, 0.62, 0.08),
        "solar": material("Bowls club rooftop solar panels", 0x244C67, 0.3, 0.28),
        "concrete": material("Bowls club concrete apron", 0x929589, 0.94),
        "door": material("Bowls club rear service doors", 0x6F796F, 0.8, 0.08),
        "mural_blue": material("Current mural Fitzroy blue", 0x1D6691, 0.72),
        "mural_maroon": material("Current mural deep club maroon", 0x67242C, 0.72),
        "mural_gold": material("Current mural gold rays", 0xE6A343, 0.66),
        "mural_sun": material("Current mural amber lion discs", 0xF3B54A, 0.68),
        "mural_lion": material("Current mural warm lion coat", 0xB96D35, 0.7),
        "mural_green": material("Current mural glossy foliage and budgies", 0x4D914F, 0.78),
        "mural_red": material("Current mural bottle and flower red", 0xA6403C, 0.7),
        "mural_orange": material("Current mural warm orange", 0xC96D36, 0.7),
        "mural_pink": material("Current mural dahlia pink", 0xE492A2, 0.72),
        "mural_cream": material("Current mural white outline", 0xF4E4C7, 0.72),
        "mural_dark": material("Current mural dark linework", 0x302B2A, 0.76),
    }

    root = bpy.data.objects.new("EG Fitzroy Victoria Bowling Club", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_source_primary"] = EVIDENCE
    root["eg_source_geometry"] = "OpenStreetMap way 543505639; project WORLD_SCALE 1.28"
    root["eg_source_roof"] = "City of Yarra April-May 2025 roof replacement notice"
    root["eg_source_mural_context"] = "City of Yarra Fitzroy Bowls 150 Years Memorial Wall"
    root["eg_source_mural_current"] = "Colour Our City Flickr photos 55297636202, 55298958435 and 55298958440; all geotagged at the club and taken 28 May 2026"
    root["eg_front"] = "-Y in Blender; +Z after glTF export"
    root["eg_units"] = "game-world metres"

    polygon_prism("Exact OSM bagged-render clubhouse shell", LOCAL_POLYGON, -0.35, 3.06, mats["cream"], target, root, "exact OSM clubhouse shell")
    polygon_prism("Exact OSM zincalume roof envelope", LOCAL_POLYGON, 3.06, 3.19, mats["roof"], target, root, "2025 zincalume roof envelope")

    east_front = ((-31.1757, 1.6231), (-14.5661, 5.4832))
    main_front = ((-14.8631, 6.7842), (22.6354, 15.4757))
    add_curtain_wall("East green frontage", *east_front, 5, mats, target, root, door_bays=(3,))
    add_curtain_wall("Main green frontage", *main_front, 10, mats, target, root, door_bays=(2, 7, 8))
    add_text("Club fascia title west", "FITZROY VICTORIA", *main_front, 0.31, 1.80, 2.64, 0.66, mats["lettering"], target, root)
    add_text("Club fascia title east", "BOWLING & SPORTS CLUB", *main_front, 0.70, 1.80, 2.64, 0.62, mats["lettering"], target, root)

    add_roof_ribs(mats, target, root)
    add_solar_panels(*main_front, mats, target, root)
    add_upper_storey(mats, target, root)
    add_rear_service_elevation(mats, target, root)
    add_mural(mats, target, root)

    return root, mats


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    lawn = material("Preview bowling green", 0x69875F, 0.98)
    path = material("Preview green-side concrete", 0x8D9288, 0.96)
    winter = material("Preview winter lawn", 0x657455, 0.98)
    bpy.ops.mesh.primitive_plane_add(size=190, location=(0, 0, -0.02))
    ground = bpy.context.object
    ground.name = "Preview winter lawn (not exported)"
    relink(ground, target)
    ground.data.materials.append(winter)
    box("Preview synthetic bowling green", (82, 48, 0.035), (0, -44, 0.015), lawn, target, bpy.data.objects.new("Preview parent", None), "preview only")
    preview_parent = bpy.data.objects.get("Preview parent")
    if preview_parent and not preview_parent.users_collection:
        target.objects.link(preview_parent)
    box("Preview green-side path", (84, 3.8, 0.045), (0, -18, 0.025), path, target, preview_parent, "preview only")

    world = bpy.context.scene.world or bpy.data.worlds.new("Bowling club preview world")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = srgb(0xAEBFC5)
        background.inputs["Strength"].default_value = 0.58

    bpy.ops.object.light_add(type="SUN", location=(-28, -40, 36))
    sun = bpy.context.object
    relink(sun, target)
    sun.data.energy = 2.2
    sun.data.color = srgb(0xFFE1B6)[:3]
    sun.rotation_euler = (math.radians(26), math.radians(-20), math.radians(-30))

    bpy.ops.object.light_add(type="AREA", location=(28, -30, 20))
    fill = bpy.context.object
    relink(fill, target)
    fill.data.energy = 950
    fill.data.size = 20
    fill.data.color = srgb(0xC9DCE4)[:3]

    camera_data = bpy.data.cameras.new("Bowling club audit camera")
    camera = bpy.data.objects.new("Bowling club audit camera", camera_data)
    target.objects.link(camera)
    camera_data.lens = 58
    bpy.context.scene.camera = camera
    return camera


def aim(camera: bpy.types.Object, position: tuple[float, float, float], target: tuple[float, float, float]) -> None:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(camera: bpy.types.Object, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    views = {
        "01-green-frontage": ((2, -86, 12), (-4, -2, 2.0)),
        "02-front-east": ((-60, -54, 10), (-11, 0, 1.9)),
        "03-hannah-gate-mural-end": ((-68, -1, 5.0), (-39.5, 3.4, 1.5)),
        "04-st-georges-rear": ((-3, 72, 9), (-4, 5, 1.9)),
        "05-upper-storey-oblique": ((-45, -42, 13), (-20, 0, 3.1)),
        "06-player-green-approach": ((-10, -29, 1.72), (-7, -3, 1.55)),
    }
    for name, (position, target) in views.items():
        aim(camera, position, target)
        scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def triangles(target: bpy.types.Collection) -> int:
    graph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in target.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def export(target: bpy.types.Collection, filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in target.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next((obj for obj in target.all_objects if obj.type == "MESH"), None)
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format="GLB", use_selection=True, export_extras=True, export_cameras=False, export_lights=False, export_apply=True)


def manifest(path: Path, target: bpy.types.Collection, blend_path: Path, glb_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "label": "Fitzroy Victoria Bowling & Sports Club",
        "units": "game-world metres",
        "origin": "OSM way 543505639 fitted-footprint centroid at foundation level",
        "front": "-Y in Blender; +Z in Three.js after glTF conversion",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": os.path.relpath(blend_path, Path.cwd()),
            "glb": os.path.relpath(glb_path, Path.cwd()),
            "generator": "scripts/blender/build_bowling_club.py",
        },
        "primaryEvidence": [
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.openstreetmap.org/way/543505639",
            "https://www.yarracity.vic.gov.au/things-to-do/arts/gallery/public-art/fitzroy-bowls-150-years-memorial-wall",
            "https://www.yarracity.vic.gov.au/sites/default/files/2025-04/yarranews_aprmay25_fa_web_nicholls_ward.pdf",
            "https://www.flickr.com/photos/colourourcity/55297636202/",
            "https://www.flickr.com/photos/colourourcity/55298958435/",
            "https://www.flickr.com/photos/colourourcity/55298958440/",
        ],
        "translatedCondition": "2026 physical baseline after the appearance-retaining 2025 zincalume roof and gutter upgrade, including the Melanie Caple St Georges Road mural photographed on 28 May 2026",
        "dimensionsMetres": {"mappedLength": ASSET_LENGTH, "mappedDepth": ASSET_DEPTH, "lowerRoofHeight": 3.19, "upperRoofHeight": 4.87},
        "navigationContract": {
            "greenFacingInteraction": "bowling-clubroom-access remains outside the glazed frontage",
            "approach": "Hannah memorial gate remains the collision-tested public approach",
            "interior": "not represented; public sources do not establish a current surveyed interior plan",
        },
        "uncertainty": [
            "OSM controls the irregular horizontal shell; no public architectural survey fixes wall, window or upper-storey member dimensions.",
            "CMP Figures 70-73 and current aerial imagery control massing and visible elevations but do not resolve every rear service opening.",
            "Three geotagged 28 May 2026 photographs control the current mural's subject layout and palette; the low-relief mural is a painterly translation, not a texture copy or measured artwork survey.",
            "The 2025 council notice says roof work would not affect appearance; small roof plant and exact reinstated solar-panel offsets are not publicly surveyed.",
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
    model = collection("EG_BOWLING_CLUB_MODEL")
    preview = collection("EG_BOWLING_CLUB_PREVIEW")
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

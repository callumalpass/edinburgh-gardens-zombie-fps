"""Build the 10 July 2026 Kevin Murray Stand asset.

The exact horizontal shell is fitted to OSM way 403753786. Lovell Chen's 2021
Edinburgh Gardens CMP section 3.2.2 and Figures 35-39 control the retained
heritage fabric. City of Yarra project material is used only to distinguish
the active 2026-27 works programme from the stand's established appearance.

Blender -Y is the oval-facing elevation. glTF converts that to Three.js +Z.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-kevin-murray-stand"
ASSET_LENGTH = 47.80175537030087
ASSET_DEPTH = 13.008765243305158
EVIDENCE = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.2 and Figures 35-39"


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


def torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=12,
        minor_segments=5,
        location=location,
        rotation=rotation,
    )
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


def text_mesh(
    name: str,
    text: str,
    size: float,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
    *,
    align: str = "CENTER",
) -> bpy.types.Object:
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = align
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.012
    obj.data.bevel_depth = 0.004
    obj.data.bevel_resolution = 1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return finish(obj, target, root, mat, kind)


def roof_mesh(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    half_x = ASSET_LENGTH * 0.5 + 0.65
    half_y = ASSET_DEPTH * 0.5 + 0.72
    ridge_x = half_x - 3.2
    eave = 6.15
    ridge = 7.55
    verts = [
        (-half_x, -half_y, eave), (half_x, -half_y, eave),
        (-half_x, half_y, eave), (half_x, half_y, eave),
        (-ridge_x, 0, ridge), (ridge_x, 0, ridge),
    ]
    faces = [
        (0, 1, 5, 4),
        (2, 4, 5, 3),
        (0, 4, 2),
        (1, 3, 5),
    ]
    mesh_object("Jerkinhead corrugated roof", verts, faces, mats["roof"], target, root, "jerkinhead-roof")
    # Corrugation remains a material-scale painterly cue. Raised ribs became
    # disproportionately legible at the game's long preview distance and are
    # intentionally omitted; the exact jerkinhead form and metal-sheet colour
    # carry the source evidence without a false picket-like silhouette.
    # Existing solar panels are on the north/rear roof plane, not the oval elevation.
    rear_pitch = -math.atan2(ridge - eave, half_y)
    for row in range(2):
        for col in range(8):
            x = -7.7 + col * 2.2
            y = 2.0 + row * 1.75
            z = ridge - (ridge - eave) * (y / half_y) + 0.11
            box(
                f"Existing solar panel {row + 1}-{col + 1}",
                (2.0, 1.52, 0.075), (x, y, z), mats["solar"], target, root, "existing-solar-panel",
                rotation=(rear_pitch, 0, 0), bevel=0.025,
            )


def add_round_louver(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # The CMP explicitly records a round louvred timber vent replacing the former clock.
    cylinder(
        "Central round louver surround", 0.43, 0.08, (0, -7.30, 6.69), mats["cream"], target, root,
        "round-louver-surround", vertices=24, rotation=(math.pi / 2, 0, 0),
    )
    cylinder(
        "Central round louver dark recess", 0.34, 0.085, (0, -7.35, 6.69), mats["dark"], target, root,
        "round-louver-recess", vertices=24, rotation=(math.pi / 2, 0, 0),
    )
    for index, z in enumerate([6.48, 6.59, 6.70, 6.81, 6.92]):
        half = math.sqrt(max(0.0, 0.31**2 - (z - 6.70) ** 2))
        box(
            f"Round louver blade {index + 1}", (half * 2, 0.055, 0.035), (0, -7.405, z),
            mats["cream"], target, root, "round-louver-blade",
        )


def add_cast_column(index: int, x: float, mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    cylinder(f"Gallery cast-iron column {index:02d}", 0.105, 3.42, (x, -6.00, 4.28), mats["red"], target, root, "cast-iron-column", vertices=16)
    cylinder(f"Column {index:02d} lower collar", 0.155, 0.16, (x, -6.00, 2.67), mats["red"], target, root, "cast-column-collar", vertices=16)
    torus(f"Column {index:02d} capital torus", 0.16, 0.045, (x, -6.00, 5.84), mats["red"], target, root, "corinthian-capital")
    box(f"Column {index:02d} capital plate", (0.42, 0.42, 0.12), (x, -6.00, 5.93), mats["red"], target, root, "corinthian-capital", bevel=0.025)
    for side in (-1, 1):
        box(
            f"Column {index:02d} capital leaf {side:+d}", (0.14, 0.28, 0.27),
            (x + side * 0.13, -6.00, 5.76), mats["red"], target, root, "corinthian-capital",
            rotation=(0, side * 0.22, 0.22 * side), bevel=0.025,
        )


def add_balustrade_panel(index: int, x0: float, x1: float, mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    y = -6.18
    bottom = 2.72
    top = 3.50
    box(f"Balustrade panel {index:02d} top rail", (x1 - x0, 0.08, 0.09), ((x0 + x1) / 2, y, top), mats["cream"], target, root, "cast-lace-balustrade")
    box(f"Balustrade panel {index:02d} bottom rail", (x1 - x0, 0.08, 0.08), ((x0 + x1) / 2, y, bottom), mats["cream"], target, root, "cast-lace-balustrade")
    for bar in range(5):
        x = x0 + (bar + 0.5) * ((x1 - x0) / 5)
        box(f"Balustrade panel {index:02d} upright {bar + 1}", (0.035, 0.065, top - bottom), (x, y, (top + bottom) / 2), mats["cream"], target, root, "cast-lace-balustrade")
    # Alternating diagonals give the long photographed lacework its filigree rhythm.
    diagonal_length = math.hypot((x1 - x0) / 5, top - bottom)
    angle = math.atan2((x1 - x0) / 5, top - bottom)
    for bar in range(5):
        x = x0 + (bar + 0.5) * ((x1 - x0) / 5)
        box(
            f"Balustrade panel {index:02d} lace {bar + 1}", (0.026, 0.052, diagonal_length),
            (x, y - 0.015, (top + bottom) / 2), mats["cream"], target, root, "cast-lace-balustrade",
            rotation=(0, (angle if (bar + index) % 2 == 0 else -angle), 0),
        )


def add_stair_flight(label: str, x: float, mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    steps = 12
    for step in range(steps):
        progress = step / (steps - 1)
        y = -9.20 + progress * 3.35
        z = 0.13 + progress * 2.35
        box(
            f"{label} stair tread {step + 1:02d}", (2.25, 0.48, 0.24), (x, y, z),
            mats["red"], target, root, "grandstand-external-stair", bevel=0.025,
        )
    run = math.hypot(3.35, 2.35)
    rail_angle = -math.atan2(2.35, 3.35)
    for side in (-1, 1):
        rail_x = x + side * 1.14
        for post in range(6):
            progress = post / 5
            y = -9.20 + progress * 3.35
            z = 0.85 + progress * 2.35
            cylinder(f"{label} rail post {side:+d}-{post + 1}", 0.045, 0.82, (rail_x, y, z), mats["red"], target, root, "stair-handrail", vertices=10)
        cylinder(
            f"{label} sloping handrail {side:+d}", 0.055, run, (rail_x, -7.525, 2.48),
            mats["red"], target, root, "stair-handrail", vertices=10, rotation=(math.pi / 2 + rail_angle, 0, 0),
        )


def build(target: bpy.types.Collection) -> None:
    root = bpy.data.objects.new("EG Kevin Murray Stand", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_condition_date"] = "2026-07-10"
    root["eg_runtime_front"] = "Blender -Y / glTF +Z faces W.T. Peterson Oval"

    mats = {
        "red": material("grandstand heritage Deep Indian Red", 0x6F2928, 0.74),
        "red_dark": material("grandstand shaded red brick", 0x4B2021, 0.9),
        "cream": material("grandstand Cumberland Stone cream", 0xD9CC9E, 0.82),
        "light": material("grandstand Light Beige timber", 0xE5DDBB, 0.86),
        "seat": material("grandstand weathered cream bench", 0xD7D0B2, 0.88),
        "floor": material("grandstand weathered timber floor", 0x72503C, 0.9),
        "roof": material("grandstand corrugated galvanised roof", 0xAEB2AA, 0.57, 0.18),
        "roof_rib": material("grandstand roof corrugation highlight", 0xC9CBC0, 0.5, 0.22),
        "dark": material("grandstand dark service opening", 0x171A1A, 0.64),
        "glass": material("grandstand muted window glass", 0x213C3D, 0.34, 0.08),
        "solar": material("grandstand existing solar panels", 0x162A36, 0.28, 0.35),
        "sign": material("grandstand club sign lettering", 0x3F2825, 0.62),
        "concrete": material("grandstand threshold concrete", 0x837C6D, 0.94),
    }
    seat_shader = mats["seat"].node_tree.nodes.get("Principled BSDF")
    if seat_shader and "Emission Color" in seat_shader.inputs:
        seat_shader.inputs["Emission Color"].default_value = srgb(0xD7D0B2)
        seat_shader.inputs["Emission Strength"].default_value = 0.11

    hx = ASSET_LENGTH * 0.5
    hy = ASSET_DEPTH * 0.5
    # Ground storey: the photographed exterior is painted deep red, with cream
    # door/shutter panels. It is not exposed generic red brick on the oval side.
    box("Ground-storey painted brick shell", (ASSET_LENGTH, ASSET_DEPTH, 2.58), (0, 0, 1.29), mats["red"], target, root, "painted-brick-ground-storey", bevel=0.035)
    box("Oval facade threshold", (ASSET_LENGTH + 0.25, 0.72, 0.12), (0, -hy - 0.20, 0.06), mats["concrete"], target, root, "oval-threshold")

    # Oval-facing service/changeroom rhythm visible in CMP Figure 36.
    bay_centres = [-20.55, -15.8, -11.05, -6.30, -1.55, 3.20, 7.95, 12.70, 17.45, 21.25]
    opening_kinds = ["door", "shutter", "dark", "shutter", "doors", "dark", "shutter", "dark", "shutter", "door"]
    for index, (x, opening) in enumerate(zip(bay_centres, opening_kinds), 1):
        width = 3.45 if index not in (1, 10) else 2.35
        if opening == "dark":
            box(f"Oval bay {index:02d} dark opening", (width, 0.10, 1.62), (x, -hy - 0.075, 1.13), mats["dark"], target, root, "ground-service-opening")
        elif opening == "doors":
            for side in (-1, 1):
                box(f"Oval bay {index:02d} glazed door {side:+d}", (width * 0.46, 0.10, 1.94), (x + side * width * 0.245, -hy - 0.08, 1.17), mats["glass"], target, root, "ground-glazed-door", bevel=0.02)
                box(f"Oval bay {index:02d} door stile {side:+d}", (0.065, 0.13, 1.94), (x + side * width * 0.49, -hy - 0.13, 1.17), mats["cream"], target, root, "ground-door-frame")
        else:
            mat = mats["cream"] if opening == "shutter" else mats["red_dark"]
            box(f"Oval bay {index:02d} {opening}", (width, 0.11, 1.82), (x, -hy - 0.085, 1.11), mat, target, root, f"ground-{opening}", bevel=0.025)
            if opening == "shutter":
                for stripe in range(9):
                    box(f"Oval bay {index:02d} shutter rib {stripe + 1}", (width - 0.12, 0.025, 0.025), (x, -hy - 0.16, 0.38 + stripe * 0.18), mats["light"], target, root, "roller-shutter-rib")
    box("Oval facade cream impost band", (ASSET_LENGTH - 0.5, 0.15, 0.30), (0, -hy - 0.12, 2.48), mats["cream"], target, root, "facade-impost")

    # Rear wall: horizontal weatherboards and red uprights replace the former
    # boxy fallback. Sliding panels and small vents follow CMP Figure 38.
    box("Rear upper dark backing", (ASSET_LENGTH, 0.25, 3.20), (0, hy - 0.22, 4.18), mats["red_dark"], target, root, "rear-upper-backing")
    for row in range(15):
        box(f"Rear weatherboard {row + 1:02d}", (ASSET_LENGTH - 0.45, 0.14, 0.19), (0, hy + 0.015, 2.78 + row * 0.19), mats["cream"], target, root, "rear-horizontal-weatherboard")
    for index, x in enumerate([-23.2, -19.0, -14.8, -10.6, -6.4, -2.2, 2.0, 6.2, 10.4, 14.6, 18.8, 23.0], 1):
        box(f"Rear red stud {index:02d}", (0.14, 0.26, 3.38), (x, hy + 0.09, 4.19), mats["red"], target, root, "rear-timber-stud")
    for index, x in enumerate([-19.0, -11.0, -2.0, 7.0, 16.0], 1):
        box(f"Rear louvred vent {index}", (1.20, 0.12, 0.72), (x, hy + 0.17, 3.45), mats["light"], target, root, "rear-louvred-window", bevel=0.015)
        for blade in range(5):
            box(f"Rear vent {index} blade {blade + 1}", (1.05, 0.04, 0.035), (x, hy + 0.25, 3.20 + blade * 0.12), mats["red"], target, root, "rear-louvre-blade")
    for index, x in enumerate([-20.7, -13.8, -5.3, 3.6, 12.0, 20.1], 1):
        box(f"Rear ground door {index}", (1.35, 0.11, 2.02), (x, hy + 0.075, 1.12), mats["red_dark"], target, root, "rear-service-door", bevel=0.02)
        box(f"Rear door transom {index}", (1.12, 0.035, 0.33), (x, hy + 0.15, 2.02), mats["glass"], target, root, "rear-door-transom")

    # Upper gallery rear wall and sliding timber panels.
    box("Gallery rear cream wall", (ASSET_LENGTH - 1.2, 0.25, 3.18), (0, 4.72, 4.20), mats["light"], target, root, "gallery-rear-wall")
    for row in range(12):
        box(f"Gallery rear weatherboard {row + 1:02d}", (ASSET_LENGTH - 1.35, 0.10, 0.16), (0, 4.55, 2.78 + row * 0.25), mats["cream"], target, root, "gallery-weatherboard")
    for index, x in enumerate([-20.8, -16.6, -12.4, -8.2, -4.0, 0.2, 4.4, 8.6, 12.8, 17.0, 21.2], 1):
        box(f"Gallery sliding-panel stile {index:02d}", (0.12, 0.20, 3.10), (x, 4.43, 4.17), mats["red"], target, root, "sliding-panel-stile")

    # Terraced timber floor and eight simple bench rows with steel back supports.
    for row in range(8):
        y = -3.72 + row * 0.92
        level = 2.70 + row * 0.34
        box(f"Terrace tread {row + 1}", (43.5, 1.02, 0.18), (0, y, level - 0.09), mats["floor"], target, root, "terraced-timber-floor", bevel=0.018)
        box(f"Cream bench seat {row + 1}", (42.3, 0.34, 0.13), (0, y + 0.12, level + 0.46), mats["seat"], target, root, "grandstand-bench-seat", bevel=0.025)
        box(f"Cream bench back {row + 1}", (42.3, 0.13, 0.28), (0, y + 0.43, level + 0.82), mats["seat"], target, root, "grandstand-bench-back", bevel=0.022)
        for support in range(13):
            x = -20.0 + support * (40.0 / 12)
            box(f"Bench {row + 1} steel support {support + 1:02d}", (0.055, 0.055, 0.58), (x, y + 0.31, level + 0.57), mats["red"], target, root, "bench-steel-support", rotation=(0.32, 0, 0))

    # Front cast columns, ornate capitals and iron lace balustrade.
    column_xs = [-23.1, -18.48, -13.86, -9.24, -4.62, 0, 4.62, 9.24, 13.86, 18.48, 23.1]
    for index, x in enumerate(column_xs, 1):
        add_cast_column(index, x, mats, target, root)
    for index in range(len(column_xs) - 1):
        add_balustrade_panel(index + 1, column_xs[index] + 0.24, column_xs[index + 1] - 0.24, mats, target, root)

    # Front and side awnings, brackets and end boarding.
    box("Oval awning fascia", (ASSET_LENGTH + 0.8, 0.18, 0.28), (0, -7.17, 6.02), mats["red"], target, root, "front-awning-fascia", bevel=0.02)
    for index, x in enumerate(column_xs, 1):
        box(f"Oval awning bracket {index:02d}", (0.10, 1.20, 0.12), (x, -6.58, 5.55), mats["red"], target, root, "timber-awning-bracket", rotation=(0.62, 0, 0))
    for side, label in [(-1, "west"), (1, "east")]:
        x = side * (hx - 0.04)
        box(f"{label.title()} upper end boarding", (0.20, ASSET_DEPTH - 1.25, 2.72), (x, 0.18, 4.34), mats["light"], target, root, "upper-end-boarding")
        for stud in range(5):
            y = -4.6 + stud * 2.25
            box(f"{label.title()} end red stud {stud + 1}", (0.27, 0.13, 2.92), (x + side * 0.08, y, 4.30), mats["red"], target, root, "end-timber-stud")
        # V-jointed panel band below the cast lace side balustrade.
        box(f"{label.title()} gallery side panel", (0.22, 5.5, 0.82), (x + side * 0.10, -2.95, 3.04), mats["cream"], target, root, "v-jointed-side-panel")
        for panel in range(6):
            y = -5.2 + panel * 0.85
            box(f"{label.title()} side V joint {panel + 1}", (0.025, 0.045, 0.70), (x + side * 0.225, y, 3.04), mats["red"], target, root, "v-jointed-side-panel")

    # West skillion verandah recorded in CMP Figure 39.
    box("West skillion verandah roof", (3.1, 7.4, 0.18), (-hx - 1.45, 0.65, 3.18), mats["roof"], target, root, "west-skillion-verandah", rotation=(0, -0.05, 0.03))
    for index, y in enumerate([-2.5, 0.2, 2.9], 1):
        cylinder(f"West verandah post {index}", 0.075, 2.92, (-hx - 2.65, y, 1.46), mats["red"], target, root, "west-verandah-post", vertices=12)
    box("West verandah fascia", (0.16, 7.5, 0.24), (-hx - 2.82, 0.65, 3.05), mats["red"], target, root, "west-verandah-fascia")

    # Two photographed oval-facing stair flights remain the navigation contract.
    add_stair_flight("West oval", -hx * 0.38, mats, target, root)
    add_stair_flight("East oval", hx * 0.38, mats, target, root)

    # Central pediment, vent and flagpoles.
    pediment = [(-2.25, -7.31, 6.02), (2.25, -7.31, 6.02), (0, -7.31, 7.18)]
    mesh_object("Central oval pediment", pediment, [(0, 1, 2)], mats["cream"], target, root, "central-pediment")
    box("Central pediment red rake left", (2.64, 0.10, 0.10), (-1.12, -7.37, 6.60), mats["red"], target, root, "pediment-rake", rotation=(0, -0.45, 0))
    box("Central pediment red rake right", (2.64, 0.10, 0.10), (1.12, -7.37, 6.60), mats["red"], target, root, "pediment-rake", rotation=(0, 0.45, 0))
    add_round_louver(mats, target, root)
    for index, x in enumerate([-hx + 1.25, 0, hx - 1.25], 1):
        cylinder(f"Roof flagpole {index}", 0.035, 5.0 if x == 0 else 3.8, (x, 0, 8.85 if x == 0 else 8.0), mats["red"], target, root, "roof-flagpole", vertices=10)

    # Small fixed club plaques visible in the CMP view; the Kevin Murray game-
    # day sign is deliberately not baked into the ordinary-day baseline.
    for x, label in [(-15.5, "FITZROY FOOTBALL CLUB"), (15.5, "EDINBURGH CRICKET CLUB")]:
        box(f"{label.title()} plaque", (5.3, 0.10, 0.42), (x, -hy - 0.18, 2.42), mats["light"], target, root, "club-plaque", bevel=0.025)

    roof_mesh(mats, target, root)


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.035, 0.055, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.52

    ground_mat = material("Preview winter grass", 0x59684C, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=150, location=(0, 0, -0.06))
    ground = bpy.context.object
    ground.name = "Preview ground"
    ground.data.materials.append(ground_mat)
    relink(ground, target)

    sun_data = bpy.data.lights.new("Winter sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(18)
    sun = bpy.data.objects.new("Winter sun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-34))

    area_data = bpy.data.lights.new("Sky fill", "AREA")
    area_data.energy = 1050
    area_data.shape = "DISK"
    area_data.size = 18
    area = bpy.data.objects.new("Sky fill", area_data)
    target.objects.link(area)
    area.location = (-18, -22, 22)
    area.rotation_euler = (Vector((0, 0, 3.2)) - area.location).to_track_quat("-Z", "Y").to_euler()

    rear_data = bpy.data.lights.new("Rear elevation fill", "AREA")
    rear_data.energy = 850
    rear_data.shape = "RECTANGLE"
    rear_data.size = 20
    rear_data.size_y = 10
    rear = bpy.data.objects.new("Rear elevation fill", rear_data)
    target.objects.link(rear)
    rear.location = (18, 28, 16)
    rear.rotation_euler = (Vector((0, 2, 3.3)) - rear.location).to_track_quat("-Z", "Y").to_euler()

    camera_data = bpy.data.cameras.new("Kevin Murray Stand audit camera")
    camera = bpy.data.objects.new("Kevin Murray Stand audit camera", camera_data)
    target.objects.link(camera)
    camera_data.lens = 53
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
        ("01-oval-front", (38, -50, 18), (0, -1.8, 3.0)),
        ("02-oval-front-west", (-38, -48, 12), (-5, -1.8, 3.1)),
        ("03-rear-north-east", (39, 42, 15), (2, 1.5, 3.6)),
        ("04-west-verandah", (-43, 18, 10), (-13, 0, 3.0)),
        ("05-seating-gallery", (18, -10.5, 4.7), (2, 1.0, 4.0)),
        ("06-central-stair", (10.0, -20, 4.0), (9.08, -5.8, 2.7)),
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
    # Keep the editable source as hundreds of evidence-labelled parts, but
    # collapse their runtime copy into one multi-material mesh. This removes
    # repeated node/accessor overhead without changing the authored geometry.
    bpy.ops.object.duplicate(linked=False)
    runtime_copies = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    bpy.context.view_layer.objects.active = runtime_copies[0]
    bpy.ops.object.join()
    runtime_mesh = bpy.context.object
    runtime_mesh.name = "Kevin Murray Stand optimized runtime mesh"
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
        "label": "Kevin Murray Stand",
        "conditionDate": "2026-07-10",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": str(blend.relative_to(Path.cwd())),
            "glb": str(glb.relative_to(Path.cwd())),
            "generator": "scripts/blender/build_kevin_murray_stand.py",
        },
        "primaryEvidence": [
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.openstreetmap.org/way/403753786",
            "https://vhd-dr.heritage.vic.gov.au/places/447/download-report",
            "https://www.yarracity.vic.gov.au/planning-and-building/our-projects-and-initiatives/brunswick-street-oval",
            "https://yoursayyarra.com.au/brunswickstoval",
            "https://www.fitzroyfc.com.au/latest-news/kevin-s-come-home",
        ],
        "translatedCondition": "Retained 1888 exterior and established pre-works stair/gallery fabric at 10 July 2026; planned 2026-27 stair/gate replacements are not represented as completed",
        "dimensionsMetres": {"mappedLength": ASSET_LENGTH, "mappedDepth": ASSET_DEPTH, "ridgeHeight": 7.55},
        "navigationContract": {
            "ovalApproach": "east oval-facing stair aligns with grandstand-seats access and landing positions",
            "gallery": "open upper seating gallery remains visibly legible and traversable through the existing fixture toggle",
            "serviceFrontage": "ground-storey changeroom and umpire interactions remain outside the oval elevation",
            "interior": "no free-roam enclosed interior is represented because no current public measured plan establishes one",
        },
        "uncertainty": [
            "OSM fixes the horizontal footprint, but no public measured architectural survey fixes every bay, column or stair dimension.",
            "The CMP photographs control all four visible elevations and material hierarchy; obscured service-door and rear-panel offsets are proportional translations.",
            "Council dates grandstand works only to 2026-27, so replacement-stair and secure-gate completion cannot be assigned to 10 July 2026.",
            "The Community Hall is an adjoining separate volume and is not absorbed into this heritage-grandstand asset.",
            "The Kevin Murray sign is erected for Fitzroy home games, so it is not baked into the ordinary-day physical baseline.",
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
    model = collection("EG_KEVIN_MURRAY_STAND_MODEL")
    preview = collection("EG_KEVIN_MURRAY_STAND_PREVIEW")
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

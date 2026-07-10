"""Build the 10 July 2026 Emely Baker Centre asset.

The authored shell follows OSM way 543505702's T-shaped footprint. Lovell
Chen's 2021 Edinburgh Gardens CMP section 3.10.2 and Figure 144 control the
tan-brick, aluminium-window and tray-deck skillion form. City of Yarra's
current venue page and venue manual control the play-yard facade, access
doors, dark shade sail, gated outdoor area and exterior name sign.

Blender -Y is the documented play-yard/front elevation. glTF converts that
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


ASSET_ID = "edinburgh-gardens-emely-baker-centre"
ASSET_LENGTH = 29.048176235886487
ASSET_DEPTH = 20.03833514626707
EVIDENCE = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.2 and Figure 144; City of Yarra Emely Baker Centre venue manual"

# OSM way 543505702 transformed into the frontage-fitted local frame. World
# local +Z is Blender -Y, hence the negated second coordinate below.
SHELL_POLYGON = [
    (9.745227812010189, -1.21086445813083),
    (9.753274886681366, -10.009772510229695),
    (-9.984101673012184, -10.019167573133535),
    (-9.986106298911704, -1.2073551931300832),
    (-14.36740538305353, -1.2169279378412803),
    (-14.372849063549245, 8.304511415820707),
    (14.524088117943244, 8.304511415820702),
    (14.51933367553722, -1.212152670099366),
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
    vertices: int = 14,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
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
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    bpy.ops.object.text_add(location=location, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.012
    obj.data.bevel_depth = 0.004
    obj.data.bevel_resolution = 1
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return finish(obj, target, root, mat, kind)


def polygon_prism(
    name: str,
    polygon: list[tuple[float, float]],
    bottom: float,
    top,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    count = len(polygon)
    top_values = [top(x, y) if callable(top) else float(top) for x, y in polygon]
    vertices = [(x, y, bottom) for x, y in polygon] + [(x, y, top_values[index]) for index, (x, y) in enumerate(polygon)]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    return mesh_object(name, vertices, faces, mat, target, root, kind)


def skillion_roof(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    def lower_height(_x: float, y: float) -> float:
        # The documented shallow tray-deck skillion rises toward the rear.
        progress = (y + 10.02) / 18.33
        return 2.98 + progress * 0.48

    count = len(SHELL_POLYGON)
    lower = [lower_height(x, y) for x, y in SHELL_POLYGON]
    vertices = [(x, y, lower[index]) for index, (x, y) in enumerate(SHELL_POLYGON)]
    vertices += [(x, y, lower[index] + 0.14) for index, (x, y) in enumerate(SHELL_POLYGON)]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh_object("Exact T-plan tray-deck skillion roof", vertices, faces, mats["roof"], target, root, "metal-tray-deck-skillion")

    # Fine raised seams make the tray deck legible at close inspection without
    # altering the roof silhouette. Each seam follows the roof pitch.
    for index, x in enumerate([-13.5, -12.0, -10.5, -9.0, -7.5, -6.0, -4.5, -3.0, -1.5, 0, 1.5, 3.0, 4.5, 6.0, 7.5, 9.0, 10.5, 12.0, 13.5], 1):
        if abs(x) > 9.7:
            y_mid = 3.55
            depth = 9.2
        else:
            y_mid = -0.85
            depth = 17.7
        z_mid = lower_height(x, y_mid) + 0.16
        box(
            f"Tray-deck standing seam {index:02d}", (0.025, depth, 0.035), (x, y_mid, z_mid), mats["roof_seam"],
            target, root, "tray-deck-standing-seam", rotation=(math.atan2(0.48, 18.33), 0, 0),
        )


def add_brick_joint_lines(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # Figure 144 visibly resolves the long north-west brick wall and court
    # walls. The joints are painterly depth cues, not a measured brick survey.
    for row in range(8):
        z = 0.32 + row * 0.31
        box(f"Rear wall bed joint {row + 1}", (28.45, 0.025, 0.018), (0.07, 8.425, z), mats["mortar"], target, root, "brick-bed-joint")
    for index, x in enumerate([-12.3, -9.2, -6.1, -3.0, 0.1, 3.2, 6.3, 9.4, 12.5], 1):
        box(f"Rear wall vertical brick joint {index}", (0.018, 0.024, 2.35), (x, 8.438, 1.31), mats["mortar"], target, root, "brick-perpend-joint")
    for row in range(5):
        z = 0.31 + row * 0.31
        box(f"Court wall front bed joint {row + 1}", (24.8, 0.022, 0.018), (0.0, -15.55, z), mats["mortar"], target, root, "court-wall-brick-joint")
    for index, x in enumerate([-11.0, -8.8, -6.6, -4.4, -2.2, 0, 2.2, 4.4, 6.6, 8.8, 11.0], 1):
        height = 1.46 if index % 2 else 1.22
        box(f"Court wall front vertical joint {index:02d}", (0.018, 0.022, height), (x, -15.565, height * 0.5 + 0.12), mats["mortar"], target, root, "court-wall-brick-joint")


def add_front_glazing(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    facade_y = -10.085
    facade_center_x = -0.115
    facade_width = 19.30
    box("Play-yard facade dark recess", (facade_width, 0.12, 2.38), (facade_center_x, facade_y, 1.43), mats["recess"], target, root, "front-glazed-wall")
    box("Play-yard facade cream lower spandrel", (facade_width, 0.10, 0.38), (facade_center_x, facade_y - 0.07, 0.28), mats["cream"], target, root, "front-spandrel", bevel=0.018)

    bay_edges = [-9.63, -7.58, -5.53, -3.48, -1.43, 0.62, 2.67, 4.72, 6.77, 8.82, 9.53]
    for index in range(len(bay_edges) - 1):
        left = bay_edges[index]
        right = bay_edges[index + 1]
        width = right - left - 0.11
        x = (left + right) * 0.5
        box(f"Front aluminium bay {index + 1:02d}", (width, 0.055, 1.62), (x, facade_y - 0.105, 1.41), mats["glass"], target, root, "aluminium-framed-glazing", bevel=0.012)
        box(f"Front transom pane {index + 1:02d}", (width, 0.052, 0.34), (x, facade_y - 0.11, 2.50), mats["transom"], target, root, "clerestory-transom", bevel=0.008)
    for index, x in enumerate(bay_edges, 1):
        box(f"Front aluminium mullion {index:02d}", (0.075, 0.16, 2.56), (x, facade_y - 0.145, 1.48), mats["frame"], target, root, "aluminium-mullion", bevel=0.012)
    for index, z in enumerate([0.48, 2.30, 2.71], 1):
        box(f"Front aluminium rail {index}", (facade_width + 0.08, 0.16, 0.065), (facade_center_x, facade_y - 0.145, z), mats["frame"], target, root, "aluminium-window-rail", bevel=0.01)

    # The current manual photographs distinguish a single glazed yard door
    # and a wider paired/sliding glazed opening.
    for index, x in enumerate([0.18, 4.92, 6.05], 1):
        width = 0.92 if index == 1 else 1.04
        box(f"Play-yard glazed door {index}", (width, 0.075, 2.02), (x, facade_y - 0.195, 1.17), mats["door_glass"], target, root, "play-yard-external-door", bevel=0.018)
        for side in (-1, 1):
            box(f"Door {index} stile {side:+d}", (0.055, 0.10, 2.06), (x + side * width * 0.48, facade_y - 0.235, 1.17), mats["frame"], target, root, "external-door-frame")
        box(f"Door {index} pull", (0.035, 0.045, 0.38), (x + width * 0.28, facade_y - 0.285, 1.20), mats["metal"], target, root, "door-pull")

    box("Play-yard eave fascia", (20.75, 0.18, 0.25), (-0.115, -10.48, 3.01), mats["fascia"], target, root, "sloping-eave-fascia", rotation=(0.02, 0, 0), bevel=0.018)
    box("Play-yard canopy underside", (20.75, 0.92, 0.10), (-0.115, -10.15, 2.94), mats["canopy"], target, root, "entry-canopy")
    for index, x in enumerate([-9.15, -4.55, 0.05, 4.65, 9.10], 1):
        cylinder(f"Play-yard canopy post {index}", 0.065, 2.78, (x, -10.77, 1.39), mats["post"], target, root, "canopy-post", vertices=12)

    text_mesh("Emely Baker Centre fascia letters", "EMELY BAKER CENTRE", 0.31, (-4.65, -10.595, 3.06), mats["sign"], target, root, "documented-name-sign")


def add_courtyard(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    yard_front = -15.45
    yard_rear = -10.06
    yard_mid = (yard_front + yard_rear) * 0.5
    yard_depth = yard_rear - yard_front

    box("Play-yard hard paving", (24.45, yard_depth - 0.12, 0.07), (0, yard_mid, 0.035), mats["softfall"], target, root, "hard-paved-play-yard")
    box("Building-side concrete apron", (20.05, 1.25, 0.075), (-0.11, -10.67, 0.075), mats["concrete"], target, root, "accessible-concrete-apron")

    # Figure 144 shows a continuous high outer wall. The current venue image
    # resolves the narrow vertical-bar access gate at the western return, so
    # the outer wall is not split by the old procedural centre opening.
    box("Play-yard outer brick wall", (24.95, 0.22, 1.72), (0, -15.50, 0.86), mats["brick"], target, root, "tile-coped-court-wall")
    box("Play-yard outer wall tile coping", (25.08, 0.32, 0.11), (0, -15.50, 1.77), mats["coping"], target, root, "tile-coping", bevel=0.02)
    box("Play-yard east return wall", (0.22, yard_depth + 0.15, 1.72), (12.48, yard_mid, 0.86), mats["brick"], target, root, "tile-coped-court-wall")
    box("Play-yard east return coping", (0.32, yard_depth + 0.22, 0.11), (12.48, yard_mid, 1.77), mats["coping"], target, root, "tile-coping", bevel=0.02)

    gate_width = 1.72
    gate_center = -13.72
    rear_segment_center = (yard_rear + (gate_center + gate_width * 0.5)) * 0.5
    rear_segment_depth = yard_rear - (gate_center + gate_width * 0.5)
    front_segment_center = ((gate_center - gate_width * 0.5) + yard_front) * 0.5
    front_segment_depth = (gate_center - gate_width * 0.5) - yard_front
    box("Play-yard west return rear wall", (0.22, rear_segment_depth, 1.72), (-12.48, rear_segment_center, 0.86), mats["brick"], target, root, "tile-coped-court-wall")
    box("Play-yard west return rear coping", (0.32, rear_segment_depth + 0.06, 0.11), (-12.48, rear_segment_center, 1.77), mats["coping"], target, root, "tile-coping", bevel=0.02)
    box("Play-yard west return front wall", (0.22, front_segment_depth, 1.72), (-12.48, front_segment_center, 0.86), mats["brick"], target, root, "tile-coped-court-wall")
    box("Play-yard west return front coping", (0.32, front_segment_depth + 0.06, 0.11), (-12.48, front_segment_center, 1.77), mats["coping"], target, root, "tile-coping", bevel=0.02)

    # The leaf is held fully open into the yard, leaving the 1.72 m access
    # route visibly clear for the player proxy.
    hinge = (-12.34, gate_center + gate_width * 0.5)
    open_angle = math.radians(-82)
    direction = (math.sin(open_angle), math.cos(open_angle))
    for index in range(6):
        distance = 0.10 + index * ((gate_width - 0.20) / 5)
        x = hinge[0] + direction[0] * distance
        y = hinge[1] + direction[1] * distance
        box(f"Open yard gate vertical bar {index + 1}", (0.045, 0.045, 1.48), (x, y, 0.76), mats["gate"], target, root, "open-access-gate")
    for index, z in enumerate([0.34, 0.82, 1.48], 1):
        center_x = hinge[0] + direction[0] * gate_width * 0.5
        center_y = hinge[1] + direction[1] * gate_width * 0.5
        box(f"Open yard gate rail {index}", (0.06, gate_width, 0.06), (center_x, center_y, z), mats["gate"], target, root, "open-access-gate", rotation=(0, 0, open_angle))
    cylinder("Open yard gate hinge post", 0.075, 1.68, (hinge[0], hinge[1], 0.84), mats["gate"], target, root, "gate-hinge-post", vertices=12)

    # The current venue photographs show a dark tensile sail with a prominent
    # pale outer post, rather than the pale rectangular cloth in the fallback.
    anchors = [(-9.2, -10.62, 2.74), (1.15, -10.62, 2.68), (-4.0, -15.05, 2.58)]
    sail_vertices = [anchors[0], anchors[1], anchors[2]]
    mesh_object("Dark triangular play-yard shade sail", sail_vertices, [(0, 1, 2)], mats["sail"], target, root, "documented-shade-sail")
    cylinder("Shade-sail outer post", 0.085, 2.62, (-4.0, -15.05, 1.31), mats["post"], target, root, "shade-sail-post", vertices=14)
    for index, (x, y, z) in enumerate(anchors[:2], 1):
        box(f"Shade-sail wall anchor {index}", (0.16, 0.12, 0.16), (x, y + 0.05, z), mats["metal"], target, root, "shade-sail-anchor", bevel=0.02)


def add_other_elevations(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    # Rear windows correspond to exterior openings in the current manual's
    # floor plan; exact pane offsets remain proportional rather than surveyed.
    rear_y = 8.42
    for index, x in enumerate([-10.8, -7.3, -3.8, -0.3, 3.2, 6.7, 10.2], 1):
        box(f"Rear aluminium window {index}", (1.72, 0.07, 0.68), (x, rear_y, 1.62), mats["glass"], target, root, "rear-aluminium-window", bevel=0.015)
        for side in (-1, 1):
            box(f"Rear window {index} jamb {side:+d}", (0.045, 0.11, 0.76), (x + side * 0.88, rear_y + 0.02, 1.62), mats["frame"], target, root, "rear-window-frame")
        box(f"Rear window {index} rail", (1.82, 0.11, 0.045), (x, rear_y + 0.02, 1.62), mats["frame"], target, root, "rear-window-frame")

    for side, label in [(-1, "west"), (1, "east")]:
        x = -14.49 if side < 0 else 14.64
        cylinder(f"{label.title()} elevation downpipe", 0.07, 2.75, (x, 5.8, 1.38), mats["metal"], target, root, "rainwater-downpipe", vertices=12)
        box(f"{label.title()} downpipe shoe", (0.14, 0.32, 0.12), (x, 5.68, 0.10), mats["metal"], target, root, "rainwater-downpipe", rotation=(0.3, 0, 0))
    box("Rear eave gutter", (28.95, 0.16, 0.16), (0.07, 8.43, 3.49), mats["metal"], target, root, "rear-eave-gutter", bevel=0.018)

    # Figure 144 visibly documents this small exterior service installation.
    box("East exterior service cabinet", (0.16, 0.92, 0.82), (14.66, 5.05, 0.55), mats["service"], target, root, "exterior-service-cabinet", bevel=0.025)
    for index, z in enumerate([0.36, 0.55, 0.74], 1):
        box(f"Service cabinet louvre {index}", (0.025, 0.62, 0.035), (14.75, 5.05, z), mats["dark"], target, root, "service-cabinet-louvre")

    for index, x in enumerate([-7.0, 0.0, 7.0], 1):
        box(f"Low roof vent curb {index}", (0.72, 0.52, 0.18), (x, 3.1, 3.47 + x * 0.0001), mats["roof"], target, root, "roof-vent-curb", bevel=0.025)
        box(f"Low roof vent cap {index}", (0.86, 0.64, 0.10), (x, 3.1, 3.61 + x * 0.0001), mats["metal"], target, root, "roof-vent-cap", bevel=0.025)


def build(target: bpy.types.Collection) -> None:
    root = bpy.data.objects.new("Emely Baker Centre evidence root", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_condition_date"] = "2026-07-10"
    root["eg_source_way"] = "OpenStreetMap way 543505702"

    mats = {
        "brick": material("Emely Baker warm tan brick", 0x8A684B, 0.90),
        "brick_side": material("Emely Baker shaded tan brick", 0x916A4C, 0.91),
        "mortar": material("Recessed warm mortar", 0xB39A78, 0.96),
        "roof": material("Weathered metal tray deck", 0x74827E, 0.62, 0.22),
        "roof_seam": material("Tray-deck standing seams", 0x657470, 0.56, 0.28),
        "frame": material("Blue-grey aluminium frame", 0x526D70, 0.46, 0.42),
        "glass": material("Cool reflected window glass", 0x506A70, 0.34, 0.16),
        "transom": material("Pale clerestory glass", 0x8FA6A4, 0.42, 0.12),
        "door_glass": material("External door glass", 0x3F5B60, 0.30, 0.18),
        "recess": material("Deep glazed-wall recess", 0x243236, 0.70),
        "cream": material("Warm cream facade panel", 0xD8D0B5, 0.82),
        "fascia": material("Pale green-grey eave fascia", 0xA7B2A6, 0.68, 0.14),
        "canopy": material("Canopy underside", 0xC4C4AE, 0.84),
        "coping": material("Warm tile wall coping", 0xA79477, 0.82),
        "gate": material("Dark vertical-bar yard gate", 0x394845, 0.54, 0.38),
        "sail": material("Charcoal tensile shade sail", 0x202827, 0.86),
        "post": material("Pale galvanized posts", 0xC3C7BF, 0.46, 0.42),
        "metal": material("Galvanized service metal", 0x89958F, 0.50, 0.38),
        "softfall": material("Tan play-yard softfall", 0x9B805A, 1.0),
        "concrete": material("Accessible concrete apron", 0xAAA89A, 0.94),
        "service": material("Exterior service cabinet", 0x777E76, 0.60, 0.28),
        "dark": material("Service louvre shadow", 0x303936, 0.72),
        "sign": material("Emely Baker white name letters", 0xECE8D6, 0.76),
    }

    # Exact T-plan slab, followed by the two real massing zones that compose
    # that outline: the long rear service wing and narrower community hall.
    polygon_prism("Exact OSM T-plan foundation", SHELL_POLYGON, -0.08, 0.18, mats["concrete"], target, root, "exact-osm-foundation")
    box("Long rear service wing", (28.90, 9.52, 2.78), (0.075, 3.545, 1.39), mats["brick_side"], target, root, "rear-service-wing", bevel=0.035)
    box("Projecting community hall", (19.74, 8.82, 2.82), (-0.115, -5.61, 1.41), mats["brick"], target, root, "projecting-community-hall", bevel=0.035)

    skillion_roof(mats, target, root)
    add_front_glazing(mats, target, root)
    add_courtyard(mats, target, root)
    add_other_elevations(mats, target, root)
    add_brick_joint_lines(mats, target, root)


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.045, 0.060, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.58

    ground_mat = material("Preview winter grass", 0x59684C, 1.0)
    bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, -0.09))
    ground = bpy.context.object
    ground.name = "Preview ground"
    ground.data.materials.append(ground_mat)
    relink(ground, target)

    sun_data = bpy.data.lights.new("Winter sun", "SUN")
    sun_data.energy = 3.1
    sun_data.angle = math.radians(20)
    sun = bpy.data.objects.new("Winter sun", sun_data)
    target.objects.link(sun)
    sun.rotation_euler = (math.radians(32), math.radians(-15), math.radians(-38))

    area_data = bpy.data.lights.new("Play-yard sky fill", "AREA")
    area_data.energy = 900
    area_data.shape = "DISK"
    area_data.size = 16
    area = bpy.data.objects.new("Play-yard sky fill", area_data)
    target.objects.link(area)
    area.location = (-16, -22, 16)
    area.rotation_euler = (Vector((0, -3, 1.8)) - area.location).to_track_quat("-Z", "Y").to_euler()

    rear_data = bpy.data.lights.new("Rear elevation fill", "AREA")
    rear_data.energy = 720
    rear_data.shape = "RECTANGLE"
    rear_data.size = 16
    rear_data.size_y = 8
    rear = bpy.data.objects.new("Rear elevation fill", rear_data)
    target.objects.link(rear)
    rear.location = (14, 24, 13)
    rear.rotation_euler = (Vector((0, 2, 1.7)) - rear.location).to_track_quat("-Z", "Y").to_euler()

    camera_data = bpy.data.cameras.new("Emely Baker Centre audit camera")
    camera = bpy.data.objects.new("Emely Baker Centre audit camera", camera_data)
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
        ("01-play-yard-front", (24, -37, 11), (0, -8.7, 1.5)),
        ("02-north-west-cmp", (-29, -29, 9), (-1, -4.5, 1.5)),
        ("03-rear-service-wing", (25, 29, 9), (0, 3.0, 1.5)),
        ("04-east-service-wall", (31, 8, 7), (7, 1.5, 1.4)),
        ("05-west-access-gate", (-23, -23, 4.2), (-10.6, -13.0, 1.0)),
        ("06-yard-doors-close", (11, -23, 4.6), (2.5, -9.6, 1.45)),
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
    runtime_mesh.name = "Emely Baker Centre optimized runtime mesh"
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
        "label": "Emely Baker Centre",
        "conditionDate": "2026-07-10",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": str(blend.relative_to(Path.cwd())),
            "glb": str(glb.relative_to(Path.cwd())),
            "generator": "scripts/blender/build_emely_baker_centre.py",
        },
        "primaryEvidence": [
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.openstreetmap.org/way/543505702",
            "https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/emely-baker-centre",
            "https://www.yarracity.vic.gov.au/sites/default/files/2024-11/Emely%20Baker%20Venue%20Manual.pdf",
        ],
        "translatedCondition": "Active access-friendly community venue at 10 July 2026, with current gated play yard, dark shade sail and documented external doors",
        "dimensionsGameUnits": {"mappedLength": ASSET_LENGTH, "mappedDepth": ASSET_DEPTH, "rearRoofHeight": 3.60},
        "sourceFootprintMetres": {"mappedLength": ASSET_LENGTH / 1.28, "mappedDepth": ASSET_DEPTH / 1.28},
        "navigationContract": {
            "yardGate": "1.72 m clear opening in the photographed western return, with the vertical-bar leaf visibly held open",
            "accessibleApron": "continuous hard-paved route from the gate to the current play-yard doors",
            "communityRoom": "interaction remains at the external glazed community-room frontage rather than inventing free-roam interior access",
            "shadeShelter": "dark triangular sail is visibly supported over the gated outdoor play area",
        },
        "uncertainty": [
            "OSM fixes the T-shaped horizontal shell but no public measured elevation survey fixes every mullion, seam or eave dimension.",
            "The venue-manual floor plan is low resolution; rear-room window offsets are proportional translations of documented exterior openings.",
            "The CMP identifies a sandpit and hard paving, but current public photographs do not fix the sandpit boundary, so no precise sandpit is invented.",
            "The visible gate, doors and shade sail are current documented elements; their fine hardware and anchor dimensions are estimated from photographs.",
            "No free-roam interior is authored because the public plan and photographs do not constitute a measured, current architectural survey.",
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
    model = collection("EG_EMELY_BAKER_CENTRE_MODEL")
    preview = collection("EG_EMELY_BAKER_CENTRE_PREVIEW")
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

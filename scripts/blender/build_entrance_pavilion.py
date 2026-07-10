"""Build the reconstructed Edinburgh Gardens timber entrance pavilion asset."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-timber-entrance-pavilion"
LENGTH = 23.22
DEPTH = 4.27


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-output", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(values)


def color(value: int) -> tuple[float, float, float, float]:
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


def material(name: str, value: int, roughness: float, metallic: float = 0) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.diffuse_color = color(value)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color(value)
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
    return result


def finish(
    obj: bpy.types.Object,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    mat: bpy.types.Material,
    kind: str,
    *,
    bevel: float = 0,
) -> bpy.types.Object:
    relink(obj, target)
    obj.parent = root
    obj["eg_asset_id"] = ASSET_ID
    obj["eg_kind"] = kind
    obj["eg_evidence"] = "Lovell Chen Edinburgh Gardens CMP 2021 s3.2.6 and Figure 61"
    if hasattr(obj.data, "materials"):
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
    rotation_z: float = 0,
    bevel: float = 0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation_z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, target, root, mat, kind, bevel=bevel)


def beam(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    thickness: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    root: bpy.types.Object,
    kind: str,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    obj = box(name, (thickness, thickness, direction.length), tuple((start_v + end_v) * 0.5), mat, target, root, kind, bevel=thickness * 0.12)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def panel(
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    z: float,
    mats: dict[str, bpy.types.Material],
    target: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    door: bool = False,
) -> None:
    panel_material = mats["door"] if door else mats["cream"]
    kind = "narrow V-jointed board door" if door else "V-jointed board cladding"
    box(name, (width, 0.1, height), (x, y, z), panel_material, target, root, kind, bevel=0.02)
    groove_count = max(2, round(width / 0.42))
    for index in range(1, groove_count):
        groove_x = x - width / 2 + width * index / groove_count
        box(f"{name} V-joint {index:02d}", (0.018, 0.018, height * 0.92), (groove_x, y + math.copysign(0.058, y), z), mats["joint"], target, root, "V-jointed board groove")


def roof_mesh(mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    half_x = LENGTH / 2 + 0.42
    eave_y = DEPTH / 2 + 0.42
    eave_z = 2.78
    ridge_z = 3.58
    vertices = [
        (-half_x, -eave_y, eave_z),
        (half_x, -eave_y, eave_z),
        (-half_x, 0, ridge_z),
        (half_x, 0, ridge_z),
        (-half_x, eave_y, eave_z),
        (half_x, eave_y, eave_z),
    ]
    faces = [(0, 1, 3, 2), (2, 3, 5, 4), (0, 2, 4), (1, 5, 3)]
    mesh = bpy.data.meshes.new("Corrugated gable roof mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Corrugated galvanised gable roof", mesh)
    finish(obj, target, root, mats["roof"], "corrugated galvanised steel gable roof")

    for index in range(41):
        x = -half_x + index * (half_x * 2 / 40)
        points = [Vector((x, -eave_y - 0.012, eave_z + 0.015)), Vector((x, 0, ridge_z + 0.018)), Vector((x, eave_y + 0.012, eave_z + 0.015))]
        curve = bpy.data.curves.new(f"Roof corrugation {index + 1:02d}", "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 1
        curve.bevel_depth = 0.014
        curve.bevel_resolution = 0
        spline = curve.splines.new("POLY")
        spline.points.add(2)
        for point, source in zip(spline.points, points):
            point.co = (*source, 1)
        corrugation = bpy.data.objects.new(f"Roof corrugation {index + 1:02d}", curve)
        finish(corrugation, target, root, mats["roof_rib"], "corrugated roof standing rib")

    box("Cast-iron ridge cresting rail", (LENGTH + 0.35, 0.055, 0.055), (0, 0, 3.68), mats["crest"], target, root, "cast-iron ridge cresting")
    for index in range(31):
        x = -LENGTH / 2 + index * (LENGTH / 30)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.085, radius2=0, depth=0.22, location=(x, 0, 3.815), rotation=(0, 0, math.pi / 4))
        spike = bpy.context.object
        spike.name = f"Cast-iron ridge cresting finial {index + 1:02d}"
        finish(spike, target, root, mats["crest"], "cast-iron ridge cresting finial")


def gablet(side: int, mats: dict[str, bpy.types.Material], target: bpy.types.Collection, root: bpy.types.Object) -> None:
    y = side * (DEPTH / 2 + 0.47)
    face_y = y + side * 0.02
    vertices = [(-1.15, face_y, 2.75), (1.15, face_y, 2.75), (0, face_y, 3.42)]
    mesh = bpy.data.meshes.new(f"{'Front' if side < 0 else 'Rear'} gablet panel mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2)])
    mesh.update()
    obj = bpy.data.objects.new(f"{'Front' if side < 0 else 'Rear'} central gablet", mesh)
    finish(obj, target, root, mats["cream"], "central roof gablet")
    beam("Gablet left bar", (-1.15, face_y + side * 0.015, 2.75), (0, face_y + side * 0.015, 3.42), 0.075, mats["timber"], target, root, "gablet timber frame")
    beam("Gablet right bar", (0, face_y + side * 0.015, 3.42), (1.15, face_y + side * 0.015, 2.75), 0.075, mats["timber"], target, root, "gablet timber frame")
    box("Gablet sill", (2.3, 0.075, 0.075), (0, face_y + side * 0.015, 2.77), mats["timber"], target, root, "gablet timber sill")


def build(target: bpy.types.Collection) -> tuple[bpy.types.Object, dict[str, bpy.types.Material]]:
    mats = {
        "cream": material("Entrance pavilion warm cream boards", 0xD7C58F, 0.92),
        "door": material("Entrance pavilion V-jointed doors", 0xC9B77F, 0.92),
        "joint": material("Entrance pavilion board-joint shadow", 0x76624B, 0.96),
        "timber": material("Entrance pavilion red-brown timber frame", 0x654035, 0.86),
        "roof": material("Entrance pavilion galvanised roof", 0xBCC4BC, 0.67, 0.2),
        "roof_rib": material("Entrance pavilion roof rib highlight", 0xD5D8CC, 0.6, 0.23),
        "crest": material("Entrance pavilion cast-iron cresting", 0x3B4542, 0.7, 0.42),
        "concrete": material("Entrance pavilion concrete threshold", 0x858A7D, 0.96),
        "gate": material("Entrance pavilion open timber gates", 0xBBAA78, 0.9),
    }
    root = bpy.data.objects.new("EG Timber Entrance Pavilion", None)
    target.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_source_primary"] = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.2.6 and Figure 61"
    root["eg_source_geometry"] = "OpenStreetMap way 543505638; project WORLD_SCALE 1.28"
    root["eg_front"] = "-Y in Blender; +Z after glTF export"
    root["eg_units"] = "game-world metres"

    box("Concrete passage threshold", (LENGTH + 0.35, DEPTH + 0.42, 0.12), (0, 0, 0.06), mats["concrete"], target, root, "concrete pavilion threshold", bevel=0.035)

    front_y = -DEPTH / 2
    rear_y = DEPTH / 2
    end_bay_width = 4.15
    end_bay_center = LENGTH / 2 - end_bay_width / 2
    for side in (-1, 1):
        x = side * end_bay_center
        panel(f"{'West' if side < 0 else 'East'} front end-bay cladding", x, front_y, end_bay_width, 2.3, 1.27, mats, target, root)
        panel(f"{'West' if side < 0 else 'East'} rear end-bay cladding", x, rear_y, end_bay_width, 2.3, 1.27, mats, target, root)
        panel(f"{'West' if side < 0 else 'East'} narrow V-jointed door", x, front_y - 0.065, 1.22, 2.05, 1.15, mats, target, root, door=True)
        end_x = side * LENGTH / 2
        box(
            f"{'West' if side < 0 else 'East'} V-jointed end wall",
            (0.1, DEPTH - 0.18, 2.35),
            (end_x, 0, 1.29),
            mats["cream"],
            target,
            root,
            "V-jointed end-wall cladding",
            bevel=0.02,
        )
        for joint in range(1, 9):
            groove_y = -DEPTH / 2 + joint * (DEPTH / 9)
            box(
                f"{'West' if side < 0 else 'East'} end-wall V-joint {joint:02d}",
                (0.018, 0.018, 2.18),
                (end_x + side * 0.058, groove_y, 1.29),
                mats["joint"],
                target,
                root,
                "V-jointed end-wall groove",
            )
        for elevation, y in (("front", front_y - 0.075), ("rear", rear_y + 0.075)):
            for frame_index, local_x in enumerate((-end_bay_width / 2, -end_bay_width / 6, end_bay_width / 6, end_bay_width / 2), start=1):
                box(
                    f"{'West' if side < 0 else 'East'} {elevation} end-bay frame {frame_index:02d}",
                    (0.075, 0.075, 2.35),
                    (x + local_x, y, 1.29),
                    mats["timber"],
                    target,
                    root,
                    "stop-chamfered end-bay timber frame",
                    bevel=0.012,
                )
        for door_side in (-1, 1):
            box(
                f"{'West' if side < 0 else 'East'} door jamb {'left' if door_side < 0 else 'right'}",
                (0.08, 0.08, 2.12),
                (x + door_side * 0.66, front_y - 0.14, 1.15),
                mats["timber"],
                target,
                root,
                "narrow door timber jamb",
                bevel=0.012,
            )
        box(f"{'West' if side < 0 else 'East'} door lintel", (1.4, 0.08, 0.08), (x, front_y - 0.14, 2.2), mats["timber"], target, root, "narrow door timber lintel", bevel=0.012)

    post_xs = (-LENGTH / 2, -7.42, 0, 7.42, LENGTH / 2)
    for elevation, y in (("front", front_y - 0.06), ("rear", rear_y + 0.06)):
        for index, x in enumerate(post_xs, start=1):
            box(f"Stop-chamfered {elevation} post {index:02d}", (0.18, 0.18, 2.62), (x, y, 1.4), mats["timber"], target, root, "stop-chamfered timber post", bevel=0.025)
        box(f"{elevation.title()} timber wall plate", (LENGTH + 0.15, 0.2, 0.2), (0, y, 2.65), mats["timber"], target, root, "stop-chamfered timber beam", bevel=0.025)

        for opening_index, center_x in enumerate((-3.71, 3.71), start=1):
            box(f"{elevation.title()} diagonal-board transom {opening_index:02d}", (6.95, 0.11, 0.47), (center_x, y, 2.36), mats["cream"], target, root, "diagonal-board panel above passage")
            beam(f"{elevation.title()} transom rising diagonal {opening_index:02d}", (center_x - 3.18, y + math.copysign(0.075, y), 2.16), (center_x + 3.18, y + math.copysign(0.075, y), 2.57), 0.065, mats["timber"], target, root, "diagonal boarding")
            beam(f"{elevation.title()} transom falling diagonal {opening_index:02d}", (center_x - 3.18, y + math.copysign(0.075, y), 2.57), (center_x + 3.18, y + math.copysign(0.075, y), 2.16), 0.065, mats["timber"], target, root, "diagonal boarding")

        box(f"{elevation.title()} carved valance beam", (LENGTH + 0.22, 0.12, 0.16), (0, y + math.copysign(0.12, y), 2.56), mats["timber"], target, root, "carved timber eaves valance", bevel=0.018)
        for index in range(43):
            x = -LENGTH / 2 + index * (LENGTH / 42)
            bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.08, radius2=0, depth=0.19, location=(x, y + math.copysign(0.13, y), 2.43), rotation=(math.pi, 0, math.pi / 2))
            drop = bpy.context.object
            drop.name = f"{elevation.title()} carved valance drop {index + 1:02d}"
            finish(drop, target, root, mats["timber"], "carved timber valance drop")

    # The two current passage bays are open. The source-described V-jointed
    # gate leaves are represented stowed against the four bay jambs so they do
    # not turn the real circulation route into a closed wall.
    for index, x in enumerate((-7.08, -0.34, 0.34, 7.08), start=1):
        gate = box(f"Open V-jointed passage gate leaf {index:02d}", (0.12, 2.12, 1.34), (x, -0.86 if index % 2 else 0.86, 0.79), mats["gate"], target, root, "open V-jointed board gate leaf", bevel=0.02)
        gate["eg_navigation"] = "stowed clear of the two passage bays"
        for joint in range(1, 6):
            groove_y = gate.location.y - 0.96 + joint * (1.92 / 6)
            box(f"Open gate {index:02d} V-joint {joint:02d}", (0.018, 0.018, 1.22), (x + math.copysign(0.07, x), groove_y, 0.79), mats["joint"], target, root, "V-jointed gate groove")

    roof_mesh(mats, target, root)
    gablet(-1, mats, target, root)
    gablet(1, mats, target, root)
    return root, mats


def preview_scene(target: bpy.types.Collection) -> bpy.types.Object:
    lawn = material("Preview winter lawn", 0x6F805D, 0.98)
    bpy.ops.mesh.primitive_plane_add(size=55, location=(0, 0, -0.005))
    ground = bpy.context.object
    ground.name = "Preview ground (not exported)"
    relink(ground, target)
    ground.data.materials.append(lawn)

    world = bpy.context.scene.world or bpy.data.worlds.new("Entrance pavilion preview world")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = color(0xA9BCC1)
        background.inputs["Strength"].default_value = 0.55

    bpy.ops.object.light_add(type="SUN", location=(-10, -14, 18))
    sun = bpy.context.object
    relink(sun, target)
    sun.data.energy = 2.1
    sun.data.color = color(0xFFE0B2)[:3]
    sun.rotation_euler = (math.radians(25), math.radians(-18), math.radians(-28))

    bpy.ops.object.light_add(type="AREA", location=(9, -8, 9))
    fill = bpy.context.object
    relink(fill, target)
    fill.data.energy = 720
    fill.data.size = 9
    fill.data.color = color(0xC7D9E4)[:3]

    camera_data = bpy.data.cameras.new("Entrance pavilion audit camera")
    camera = bpy.data.objects.new("Entrance pavilion audit camera", camera_data)
    target.objects.link(camera)
    camera_data.lens = 54
    bpy.context.scene.camera = camera
    return camera


def aim(camera: bpy.types.Object, position: tuple[float, float, float], target: tuple[float, float, float]) -> None:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(camera: bpy.types.Object, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    views = {
        "01-front": ((0, -27, 6.8), (0, 0, 1.7)),
        "02-front-right": ((18, -20, 6.6), (0, 0, 1.7)),
        "03-east-end": ((28, -1.5, 5.2), (0, 0, 1.6)),
        "04-rear": ((0, 27, 6.5), (0, 0, 1.7)),
        "05-passage-approach": ((-3.7, -10.5, 2.1), (-3.7, 2.0, 1.55)),
        "06-passage-interior": ((2.6, -1.15, 1.65), (8.0, 6.5, 1.55)),
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
        "label": "Reconstructed timber entrance pavilion",
        "units": "game-world metres",
        "origin": "OSM footprint centre at threshold level",
        "front": "-Y in Blender; +Z in Three.js after glTF conversion",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": os.path.relpath(blend_path, Path.cwd()),
            "glb": os.path.relpath(glb_path, Path.cwd()),
            "generator": "scripts/blender/build_entrance_pavilion.py",
        },
        "primaryEvidence": [
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.openstreetmap.org/way/543505638",
        ],
        "translatedCondition": "2026 physical baseline; reconstructed 1996 timber pavilion in its current 1980s location",
        "dimensionsMetres": {"mappedLength": LENGTH, "mappedDepth": DEPTH, "ridgeHeight": 3.9},
        "navigationContract": {
            "openPassageCentersX": [-3.71, 3.71],
            "clearPassageWidth": 6.55,
            "clearPassageHeight": 2.12,
            "gateLeaves": "modelled stowed clear of the passages",
        },
        "uncertainty": [
            "OSM controls footprint dimensions and orientation; no public architectural survey fixes member sizes.",
            "Figure 61 and the CMP description control appearance, but small hardware and the precise reconstructed cresting pattern are not photographically resolved.",
            "Painterly colours are not paint-chip measurements.",
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
    parsed = args()
    cwd = Path.cwd()
    blend_path = (cwd / parsed.blend_output).resolve()
    glb_path = (cwd / parsed.glb_output).resolve()
    manifest_path = (cwd / parsed.manifest_output).resolve()
    render_path = (cwd / parsed.render_output).resolve()
    for folder in (blend_path.parent, glb_path.parent, manifest_path.parent, render_path):
        folder.mkdir(parents=True, exist_ok=True)

    reset()
    model = collection("EG_ENTRANCE_PAVILION_MODEL")
    preview = collection("EG_ENTRANCE_PAVILION_PREVIEW")
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

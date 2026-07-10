"""Build the evidence-based Edinburgh Gardens Memorial Rotunda asset.

Run with Blender 4.5 LTS or newer:

  blender --background --python scripts/blender/build_rotunda.py -- \
    --blend-output assets/blender/rotunda/edinburgh-gardens-rotunda.blend \
    --glb-output public/models/edinburgh-gardens/edinburgh-gardens-rotunda.glb \
    --manifest-output assets/blender/rotunda/edinburgh-gardens-rotunda.asset.json \
    --render-output tmp/blender-audit/rotunda

The asset origin is the centre of the concrete apron at ground level. Blender's
+Y elevation is the stair/front elevation; glTF converts that to Three.js -Z.
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


ASSET_ID = "edinburgh-gardens-memorial-rotunda"
FRONT_ANGLE = math.pi / 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-output", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def srgb(hex_value: int) -> tuple[float, float, float, float]:
    return (
        ((hex_value >> 16) & 0xFF) / 255,
        ((hex_value >> 8) & 0xFF) / 255,
        (hex_value & 0xFF) / 255,
        1.0,
    )


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def new_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: int,
    *,
    roughness: float = 0.86,
    metallic: float = 0.0,
    emission: int | None = None,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = srgb(color)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = srgb(color)
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
        if emission is not None:
            principled.inputs["Emission Color"].default_value = srgb(emission)
            principled.inputs["Emission Strength"].default_value = 0.12
    return material


def tag(obj: bpy.types.Object, kind: str, evidence: str = "CMP 2021 s3.10.1") -> bpy.types.Object:
    obj["eg_asset_id"] = ASSET_ID
    obj["eg_kind"] = kind
    obj["eg_evidence"] = evidence
    return obj


def finish_object(
    obj: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material | None,
    *,
    parent: bpy.types.Object,
    kind: str,
    smooth: bool = False,
    bevel: float = 0.0,
) -> bpy.types.Object:
    move_to_collection(obj, collection)
    obj.parent = parent
    tag(obj, kind)
    if material is not None and hasattr(obj.data, "materials"):
        obj.data.materials.append(material)
    if smooth and obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    if bevel > 0 and obj.type == "MESH":
        modifier = obj.modifiers.new(name="Painterly edge bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    rotation_z: float = 0.0,
    kind: str,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, rotation_z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_object(obj, collection, material, parent=root, kind=kind, bevel=bevel)


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    z: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    vertices: int = 48,
    kind: str,
    radius_top: float | None = None,
    smooth: bool = False,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
        location=(0, 0, z),
    )
    obj = bpy.context.object
    obj.name = name
    return finish_object(obj, collection, material, parent=root, kind=kind, smooth=smooth, bevel=bevel)


def add_uv_sphere(
    name: str,
    radius: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    kind: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish_object(obj, collection, material, parent=root, kind=kind, smooth=True)


def add_radial_box(
    name: str,
    angle: float,
    radius: float,
    width: float,
    height: float,
    depth: float,
    z: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    kind: str,
    bevel: float = 0.0,
) -> bpy.types.Object:
    return add_box(
        name,
        (width, depth, height),
        (math.cos(angle) * radius, math.sin(angle) * radius, z),
        material,
        collection,
        root,
        rotation_z=angle - math.pi / 2,
        kind=kind,
        bevel=bevel,
    )


def add_louvred_window(
    name: str,
    angle: float,
    materials: dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    add_radial_box(
        f"{name}_recess",
        angle,
        4.555,
        1.24,
        0.62,
        0.055,
        0.82,
        materials["opening"],
        collection,
        root,
        kind="lower-storey louvred window recess",
        bevel=0.025,
    )
    for index in range(5):
        add_radial_box(
            f"{name}_louvre_{index + 1:02d}",
            angle,
            4.595,
            1.08,
            0.055,
            0.045,
            0.62 + index * 0.1,
            materials["louvre"],
            collection,
            root,
            kind="steel-framed louvre with mesh screen",
        )
    for side in (-1, 1):
        tangent = Vector((-math.sin(angle), math.cos(angle), 0))
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        location = radial * 4.615 + tangent * (side * 0.58)
        add_box(
            f"{name}_mesh_frame_{'left' if side < 0 else 'right'}",
            (0.035, 0.045, 0.7),
            (location.x, location.y, 0.82),
            materials["steel"],
            collection,
            root,
            rotation_z=angle - math.pi / 2,
            kind="external wire-mesh security screen",
        )


def add_balustrade(
    side: int,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
) -> None:
    points: list[tuple[float, float, float, float]] = []
    for index in range(9):
        t = index / 8
        y = 7.48 - 3.18 * t
        x = side * (1.74 - 0.48 * t + 0.08 * math.sin(t * math.pi))
        bottom = 0.1 + 1.62 * t
        top = 1.32 + 1.35 * t
        points.append((x, y, bottom, top))

    thickness = 0.28
    vertices: list[tuple[float, float, float]] = []
    for x, y, bottom, top in points:
        inner_x = x - side * thickness / 2
        outer_x = x + side * thickness / 2
        vertices.extend(
            [
                (inner_x, y, bottom),
                (outer_x, y, bottom),
                (inner_x, y, top),
                (outer_x, y, top),
            ]
        )
    faces: list[tuple[int, ...]] = []
    for index in range(len(points) - 1):
        current = index * 4
        following = (index + 1) * 4
        faces.extend(
            [
                (current, following, following + 1, current + 1),
                (current + 2, current + 3, following + 3, following + 2),
                (current, current + 2, following + 2, following),
                (current + 1, following + 1, following + 3, current + 3),
            ]
        )
    faces.extend(((0, 1, 3, 2), (len(vertices) - 4, len(vertices) - 2, len(vertices) - 1, len(vertices) - 3)))
    mesh = bpy.data.meshes.new(f"Rotunda stair balustrade {'south' if side < 0 else 'north'} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"Rotunda stair balustrade {'left' if side < 0 else 'right'}", mesh)
    finish_object(obj, collection, material, parent=root, kind="outward-curving solid stair balustrade", bevel=0.055)


def create_dome_mesh(
    name: str,
    materials: list[bpy.types.Material],
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    inner: bool,
) -> tuple[bpy.types.Object, list[list[Vector]]]:
    segments = 24
    rings = 12
    theta_max = math.acos(0.58 / 4.58)
    ring_points: list[list[Vector]] = []
    vertices: list[tuple[float, float, float]] = []
    for ring in range(rings + 1):
        t = ring / rings
        theta = theta_max * t
        radius = 4.58 * math.cos(theta) - (0.11 if inner else 0)
        z = 6.18 + 2.34 * math.sin(theta) / math.sin(theta_max) - (0.08 if inner else 0)
        points: list[Vector] = []
        for segment in range(segments):
            angle = segment * math.tau / segments
            point = Vector((math.cos(angle) * radius, math.sin(angle) * radius, z))
            points.append(point)
            vertices.append(tuple(point))
        ring_points.append(points)

    faces: list[tuple[int, ...]] = []
    for ring in range(rings):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            a = ring * segments + segment
            b = ring * segments + next_segment
            c = (ring + 1) * segments + next_segment
            d = (ring + 1) * segments + segment
            faces.append((d, c, b, a) if inner else (a, b, c, d))

    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    finish_object(
        obj,
        collection,
        materials[0],
        parent=root,
        kind="cream-painted inner dome" if inner else "panelled copper-clad dome",
        smooth=False,
    )
    for material in materials[1:]:
        obj.data.materials.append(material)
    if not inner:
        for polygon in obj.data.polygons:
            polygon.material_index = (polygon.index % segments) // 4 % len(materials)
    return obj, ring_points


def add_curve_polyline(
    name: str,
    points: list[Vector],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    *,
    kind: str,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name=f"{name} curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, source in zip(spline.points, points):
        point.co = (*source, 1)
    obj = bpy.data.objects.new(name, curve)
    return finish_object(obj, collection, material, parent=root, kind=kind)


def build_model(model: bpy.types.Collection) -> tuple[bpy.types.Object, dict[str, bpy.types.Material]]:
    materials = {
        "render": make_material("Rotunda warm rendered masonry", 0xD7C69C, roughness=0.93),
        "trim": make_material("Rotunda pale moulded trim", 0xE8D8AD, roughness=0.9),
        "frieze": make_material("Rotunda shaded masonry triglyphs", 0xB9AC8A, roughness=0.94),
        "deck": make_material("Rotunda painted concrete deck", 0xA9A28C, roughness=0.96),
        "tread": make_material("Rotunda dark stair treads", 0x37423F, roughness=0.92),
        "bronze": make_material("Rotunda aged copper plaques", 0x69472E, roughness=0.62, metallic=0.52),
        "copper_a": make_material("Rotunda copper dome rose", 0xA76C55, roughness=0.76, metallic=0.22),
        "copper_b": make_material("Rotunda copper dome ochre", 0xB67C5D, roughness=0.76, metallic=0.2),
        "copper_c": make_material("Rotunda copper dome weathering", 0x83695B, roughness=0.8, metallic=0.18),
        "copper_rib": make_material("Rotunda copper dome ribs", 0xC7A77D, roughness=0.68, metallic=0.28),
        "steel": make_material("Rotunda dark steel gate and screens", 0x273335, roughness=0.7, metallic=0.44),
        "louvre": make_material("Rotunda painted steel louvres", 0x4B5D59, roughness=0.78, metallic=0.25),
        "opening": make_material("Rotunda shadowed openings", 0x152326, roughness=0.98),
    }

    root = bpy.data.objects.new("EG Memorial Rotunda", None)
    model.objects.link(root)
    root["eg_asset_id"] = ASSET_ID
    root["eg_source_primary"] = "Lovell Chen Edinburgh Gardens CMP 2021 section 3.10.1 and Figures 142-143"
    root["eg_source_geometry"] = "OpenStreetMap way 543505640; existing project 2026 geospatial ledger"
    root["eg_front"] = "+Y in Blender; -Z after glTF export"
    root["eg_units"] = "metres"

    add_cylinder("Concrete paved apron", 6.75, 0.12, 0.06, materials["deck"], model, root, vertices=64, kind="non-original concrete paved apron", bevel=0.035)
    add_cylinder("Rendered circular lower-storey drum", 4.55, 1.68, 0.94, materials["render"], model, root, vertices=64, kind="rendered lower-storey drum", smooth=True, bevel=0.045)
    add_cylinder("Lower drum plinth", 4.72, 0.26, 0.25, materials["trim"], model, root, vertices=64, kind="lower-storey plinth", bevel=0.035)
    add_cylinder("Raised platform fascia", 4.78, 0.28, 1.76, materials["trim"], model, root, vertices=64, kind="raised platform moulded fascia", bevel=0.045)
    add_cylinder("Painted concrete open deck", 4.56, 0.16, 1.92, materials["deck"], model, root, vertices=64, kind="painted concrete upper deck", bevel=0.025)

    add_louvred_window("East louvred window", 0, materials, model, root)
    add_louvred_window("West louvred window", math.pi, materials, model, root)
    for index, angle in enumerate((math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4), start=1):
        add_radial_box(f"Perforated base vent {index:02d}", angle, 4.58, 0.48, 0.3, 0.055, 0.72, materials["louvre"], model, root, kind="perforated metal base vent", bevel=0.018)

    add_radial_box("Under-stair V-jointed board door", FRONT_ANGLE, 4.57, 1.02, 1.25, 0.075, 0.78, materials["opening"], model, root, kind="under-stair V-jointed board door", bevel=0.025)
    for index in range(5):
        add_radial_box(f"Under-stair door joint {index + 1:02d}", FRONT_ANGLE, 4.62, 0.025, 1.12, 0.025, 0.78, materials["louvre"], model, root, kind="V-jointed door board line")

    for side, angle in (("south", FRONT_ANGLE - 0.36), ("north", FRONT_ANGLE + 0.36)):
        add_radial_box(f"{side.title()} First World War copper plaque", angle, 4.61, 0.83, 0.54, 0.06, 1.1, materials["bronze"], model, root, kind="memorial copper plaque", bevel=0.025)
    add_radial_box("Second World War small bronze plaque", FRONT_ANGLE - 0.55, 4.62, 0.34, 0.23, 0.065, 0.87, materials["bronze"], model, root, kind="Second World War bronze plaque", bevel=0.018)

    step_count = 7
    stair_front = 7.55
    stair_back = 4.3
    for index in range(step_count):
        front = stair_front - index * 0.43
        height = (index + 1) * (1.68 / step_count)
        width = 2.48 - index * 0.045
        add_box(
            f"Rotunda stair step {index + 1:02d}",
            (width, front - stair_back, height),
            (0, (front + stair_back) / 2, height / 2 + 0.1),
            materials["tread"],
            model,
            root,
            kind="rotunda-stair",
            bevel=0.025,
        )["eg_navigation"] = "walkable stair flight"

    add_balustrade(-1, materials["render"], model, root)
    add_balustrade(1, materials["render"], model, root)
    for side in (-1, 1):
        side_name = "left" if side < 0 else "right"
        add_box(f"{side_name.title()} stair pier", (0.62, 0.62, 1.22), (side * 1.82, 7.42, 0.71), materials["render"], model, root, kind="panelled stair pier", bevel=0.04)
        add_box(f"{side_name.title()} stair pier cap", (0.78, 0.78, 0.18), (side * 1.82, 7.42, 1.36), materials["trim"], model, root, kind="capped stair pier", bevel=0.035)
        add_box(f"{side_name.title()} stair pier panel", (0.34, 0.035, 0.58), (side * 1.82, 7.745, 0.73), materials["trim"], model, root, kind="recessed stair pier panel", bevel=0.018)

    for x in (-0.75, -0.375, 0, 0.375, 0.75):
        add_box("Stair entrance steel gate bar", (0.045, 0.055, 0.82), (x, 7.66, 0.63), materials["steel"], model, root, kind="rotunda-stair-gate")
    for z in (0.36, 0.78):
        add_box("Stair entrance steel gate rail", (1.58, 0.06, 0.055), (0, 7.66, z), materials["steel"], model, root, kind="rotunda-stair-gate-rail")

    column_radius = 4.03
    for index in range(8):
        angle = FRONT_ANGLE + math.pi / 8 + index * math.pi / 4
        x = math.cos(angle) * column_radius
        y = math.sin(angle) * column_radius
        prefix = f"Tuscan column {index + 1:02d}"
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.37, depth=0.13, location=(x, y, 2.09))
        finish_object(bpy.context.object, model, materials["trim"], parent=root, kind="Tuscan column base", smooth=True)
        bpy.context.object.name = f"{prefix} base"
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.27, radius2=0.225, depth=3.15, location=(x, y, 3.76))
        finish_object(bpy.context.object, model, materials["render"], parent=root, kind="Tuscan column shaft", smooth=True)
        bpy.context.object.name = f"{prefix} shaft"
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.31, radius2=0.4, depth=0.22, location=(x, y, 5.46))
        finish_object(bpy.context.object, model, materials["trim"], parent=root, kind="Tuscan column capital", smooth=True)
        bpy.context.object.name = f"{prefix} capital"

    add_cylinder("Entablature architrave", 4.72, 0.22, 5.61, materials["trim"], model, root, vertices=64, kind="moulded entablature architrave", bevel=0.03)
    add_cylinder("Entablature triglyph frieze", 4.82, 0.38, 5.89, materials["render"], model, root, vertices=64, kind="entablature triglyph frieze", bevel=0.025)
    add_cylinder("Entablature moulded cornice", 5.04, 0.22, 6.17, materials["trim"], model, root, vertices=64, kind="moulded entablature cornice", bevel=0.045)
    for index in range(24):
        angle = index * math.tau / 24
        add_radial_box(f"Entablature triglyph {index + 1:02d}", angle, 4.845, 0.19, 0.29, 0.055, 5.89, materials["frieze"], model, root, kind="triglyph", bevel=0.012)

    _, dome_points = create_dome_mesh("Panelled copper dome", [materials["copper_a"], materials["copper_b"], materials["copper_c"]], model, root, inner=False)
    create_dome_mesh("Cream-painted dome soffit", [materials["trim"]], model, root, inner=True)
    for index in range(12):
        segment = index * 2
        add_curve_polyline(f"Copper dome rib {index + 1:02d}", [ring[segment] for ring in dome_points], 0.038, materials["copper_rib"], model, root, kind="raised copper dome rib")

    add_cylinder("Copper lantern lower ring", 0.75, 0.16, 8.53, materials["copper_rib"], model, root, vertices=24, kind="copper lantern base", bevel=0.025)
    for index in range(8):
        angle = index * math.tau / 8
        x = math.cos(angle) * 0.59
        y = math.sin(angle) * 0.59
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.06, depth=0.58, location=(x, y, 8.86))
        finish_object(bpy.context.object, model, materials["copper_rib"], parent=root, kind="copper lantern post", smooth=True)
        bpy.context.object.name = f"Copper lantern post {index + 1:02d}"
    add_cylinder("Copper lantern dark louvres", 0.58, 0.45, 8.86, materials["opening"], model, root, vertices=24, kind="copper lantern louvred core", smooth=True)
    add_cylinder("Copper lantern upper ring", 0.7, 0.15, 9.19, materials["copper_rib"], model, root, vertices=24, kind="copper lantern cornice", bevel=0.025)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.62, radius2=0.22, depth=0.28, location=(0, 0, 9.4))
    finish_object(bpy.context.object, model, materials["copper_a"], parent=root, kind="copper lantern cap", smooth=True)
    bpy.context.object.name = "Copper lantern cap"
    add_uv_sphere("Rotunda copper finial", 0.13, (0, 0, 9.63), materials["copper_rib"], model, root, kind="copper dome finial")

    # The CMP confirms modern floodlights but does not publish their count or
    # angular positions. Two subdued fixtures retain the documented condition;
    # their opposing placement is explicitly recorded as schematic metadata.
    for index, angle in enumerate((0.15, math.pi + 0.15), start=1):
        fixture = add_radial_box(f"Schematic entablature floodlight {index:02d}", angle, 5.04, 0.25, 0.18, 0.2, 5.67, materials["steel"], model, root, kind="modern entablature floodlight; schematic position", bevel=0.025)
        fixture["eg_uncertainty"] = "Public evidence confirms floodlights but not exact count or angular positions"

    return root, materials


def add_preview_scene(preview: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    ground_material = make_material("Preview winter lawn", 0x74845F, roughness=0.98)
    bpy.ops.mesh.primitive_plane_add(size=42, location=(0, 0, -0.005))
    ground = bpy.context.object
    ground.name = "Preview ground (not exported)"
    move_to_collection(ground, preview)
    ground.data.materials.append(ground_material)

    world = bpy.context.scene.world or bpy.data.worlds.new("Rotunda preview world")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = srgb(0xA8BBC2)
        background.inputs["Strength"].default_value = 0.52

    bpy.ops.object.light_add(type="SUN", location=(-8, -10, 16))
    sun = bpy.context.object
    sun.name = "Preview winter sun"
    move_to_collection(sun, preview)
    sun.data.energy = 2.2
    sun.data.color = srgb(0xFFE0B2)[:3]
    sun.rotation_euler = (math.radians(24), math.radians(-18), math.radians(-32))

    bpy.ops.object.light_add(type="AREA", location=(7, 9, 10))
    fill = bpy.context.object
    fill.name = "Preview sky fill"
    move_to_collection(fill, preview)
    fill.data.energy = 650
    fill.data.shape = "DISK"
    fill.data.size = 8
    fill.data.color = srgb(0xBFD6E5)[:3]

    camera_data = bpy.data.cameras.new("Rotunda audit camera")
    camera = bpy.data.objects.new("Rotunda audit camera", camera_data)
    preview.objects.link(camera)
    camera_data.lens = 52
    camera_data.sensor_width = 36
    bpy.context.scene.camera = camera
    return camera


def point_camera(camera: bpy.types.Object, position: tuple[float, float, float], target: tuple[float, float, float]) -> None:
    camera.location = position
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(camera: bpy.types.Object, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    views = {
        "01-front": ((0, 18.5, 7.0), (0, 0.5, 4.1)),
        "02-front-right": ((13.5, 13.5, 7.2), (0, 0.4, 4.0)),
        "03-side-base": ((17.5, 1.8, 4.5), (0, 0.3, 2.8)),
        "04-rear": ((0, -18.5, 6.8), (0, 0, 4.0)),
        "05-stair-approach": ((0, 11.8, 2.35), (0, 3.8, 2.05)),
        "06-deck-interior": ((0, 2.1, 3.15), (0, -2.2, 4.05)),
    }
    for name, (position, target) in views.items():
        point_camera(camera, position, target)
        scene.render.filepath = str(output_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def export_glb(model: bpy.types.Collection, filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in model.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next((obj for obj in model.all_objects if obj.type == "MESH"), None)
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )


def evaluated_triangle_count(model: bpy.types.Collection) -> int:
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in model.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(dependency_graph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def write_manifest(path: Path, model: bpy.types.Collection, blend_path: Path, glb_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "label": "Edinburgh Gardens Memorial Rotunda",
        "units": "metres",
        "origin": "centre of concrete apron at ground level",
        "front": "+Y in Blender; -Z in Three.js after glTF conversion",
        "blenderVersion": bpy.app.version_string,
        "sourceFiles": {
            "blend": os.path.relpath(blend_path, Path.cwd()),
            "glb": os.path.relpath(glb_path, Path.cwd()),
            "generator": "scripts/blender/build_rotunda.py",
        },
        "primaryEvidence": [
            "https://the3068group.org/wp-content/uploads/2025/11/2021-conservation-management-plan-_merged.pdf",
            "https://www.yarracity.vic.gov.au/things-to-do/find-a-venue/edinburgh-gardens-rotunda",
            "OpenStreetMap way 543505640 from the repository raw research cache",
        ],
        "translatedCondition": "2026 physical baseline; only the separate game countdown clock indicates 2030",
        "dimensionsMetres": {"apronDiameter": 13.5, "drumDiameter": 9.1, "deckHeight": 1.92, "overallHeight": 9.76},
        "navigationContract": {
            "stairCount": 7,
            "stairAccessDistanceFromCentre": 7.55,
            "landingDistanceFromCentre": 4.3,
            "walkableDeckRadius": 4.56,
            "wheelchairAccessible": False,
        },
        "uncertainty": [
            "OSM controls centre, footprint and orientation; no public architectural survey supplies exact component dimensions.",
            "CMP 2021 confirms modern entablature floodlights but does not resolve exact count or angular positions; the asset uses two subdued opposing schematic fixtures.",
            "Colours are a painterly interpretation of current-condition photographs and are not paint-chip measurements.",
        ],
        "statistics": {
            "objectCount": len(model.all_objects),
            "meshObjectCount": sum(1 for obj in model.all_objects if obj.type == "MESH"),
            "materialCount": len({material.name for obj in model.all_objects if hasattr(obj.data, "materials") for material in obj.data.materials if material}),
            "triangleCount": evaluated_triangle_count(model),
        },
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    cwd = Path.cwd()
    blend_path = (cwd / args.blend_output).resolve()
    glb_path = (cwd / args.glb_output).resolve()
    manifest_path = (cwd / args.manifest_output).resolve()
    render_path = (cwd / args.render_output).resolve()
    for path in (blend_path.parent, glb_path.parent, manifest_path.parent, render_path):
        path.mkdir(parents=True, exist_ok=True)

    reset_scene()
    model = new_collection("EG_ROTUNDA_MODEL")
    preview = new_collection("EG_ROTUNDA_PREVIEW")
    _, materials = build_model(model)
    camera = add_preview_scene(preview, materials)
    render_views(camera, render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    export_glb(model, glb_path)
    write_manifest(manifest_path, model, blend_path, glb_path)
    print(f"Built {ASSET_ID}")
    print(f"Blend: {blend_path}")
    print(f"GLB: {glb_path}")
    print(f"Renders: {render_path}")


if __name__ == "__main__":
    main()

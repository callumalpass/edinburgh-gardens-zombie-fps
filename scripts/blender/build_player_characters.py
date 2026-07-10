"""Build the stylised Edinburgh Gardens survivor roster.

Run with Blender 4.5 LTS or newer:

  blender --background --python scripts/blender/build_player_characters.py -- \
    --blend-output assets/blender/characters/edinburgh-gardens-survivors.blend \
    --glb-dir public/models/characters \
    --manifest-output assets/blender/characters/edinburgh-gardens-survivors.asset.json \
    --render-output tmp/blender-audit/player-characters \
    --portrait-output public/images/avatars

The characters face Blender +Y, which becomes Three.js -Z after glTF export.
All animation is in-place so the game remains authoritative for locomotion.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


ASSET_ID = "edinburgh-gardens-survivor-roster"


@dataclass(frozen=True)
class AvatarSpec:
    avatar_id: str
    name: str
    role: str
    filename: str
    skin: int
    hair: int
    top: int
    top_dark: int
    pants: int
    accent: int
    shoes: int
    height_scale: float = 1.0
    build: float = 1.0


AVATARS = (
    AvatarSpec("milo", "Milo Reed", "Trail scout", "milo-reed.glb", 0xC9976E, 0x8B603D, 0x355866, 0x263E49, 0x4E493E, 0xC49445, 0x24282A, 0.94, 0.9),
    AvatarSpec("asha", "Asha Bell", "Community medic", "asha-bell.glb", 0x70472F, 0x201A18, 0x813E36, 0x572C2A, 0x273A3B, 0xD7CDA9, 0x202629, 1.0, 0.96),
    AvatarSpec("jules", "Jules Nguyen", "Park keeper", "jules-nguyen.glb", 0xB67952, 0x1F2525, 0x3F5948, 0x2B4137, 0x31373A, 0xD3C69E, 0x262A2B, 1.025, 1.05),
    AvatarSpec("maeve", "Maeve Costa", "Bike courier", "maeve-costa.glb", 0xA86F54, 0x55545B, 0x65465D, 0x493343, 0x27333B, 0xB8C46A, 0x20262A, 0.99, 0.93),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-dir", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    parser.add_argument("--portrait-output", required=True)
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
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.armatures,
        bpy.data.actions,
        bpy.data.cameras,
        bpy.data.lights,
    ):
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


def make_material(name: str, color: int, *, roughness: float = 0.88, metallic: float = 0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = srgb(color)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = srgb(color)
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
    return material


def tag(obj: bpy.types.Object, avatar_id: str, kind: str) -> bpy.types.Object:
    obj["eg_asset_id"] = ASSET_ID
    obj["eg_avatar_id"] = avatar_id
    obj["eg_kind"] = kind
    return obj


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def finish_mesh(
    obj: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    armature: bpy.types.Object,
    bone: str,
    avatar_id: str,
    kind: str,
) -> bpy.types.Object:
    move_to_collection(obj, collection)
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if material:
        obj.data.materials.append(material)
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Survivor armature", "ARMATURE")
    modifier.object = armature
    obj.name = f"{avatar_id}-{kind}"
    tag(obj, avatar_id, kind)
    return obj


def sphere_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    avatar_id: str,
    kind: str,
    bone: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    *,
    segments: int = 12,
    rings: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return finish_mesh(obj, collection, material, armature, bone, avatar_id, kind)


def ico_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    avatar_id: str,
    kind: str,
    bone: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    subdivisions: int = 1,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return finish_mesh(obj, collection, material, armature, bone, avatar_id, kind)


def cylinder_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    avatar_id: str,
    kind: str,
    bone: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    *,
    vertices: int = 10,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(start_v + end_v) * 0.5)
    obj = bpy.context.object
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return finish_mesh(obj, collection, material, armature, bone, avatar_id, kind)


def box_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    avatar_id: str,
    kind: str,
    bone: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.03,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Painted edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return finish_mesh(obj, collection, material, armature, bone, avatar_id, kind)


def torus_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    avatar_id: str,
    kind: str,
    bone: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=12,
        minor_segments=5,
        location=location,
        rotation=rotation,
    )
    return finish_mesh(bpy.context.object, collection, material, armature, bone, avatar_id, kind)


def create_armature(collection: bpy.types.Collection, avatar_id: str, scale: float) -> bpy.types.Object:
    data = bpy.data.armatures.new(f"{avatar_id}-survivor-rig")
    armature = bpy.data.objects.new(f"{avatar_id}-survivor-rig", data)
    collection.objects.link(armature)
    armature.show_in_front = True
    tag(armature, avatar_id, "survivor-rig")
    activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name: str, head: tuple[float, float, float], tail: tuple[float, float, float], parent: str | None = None) -> None:
        edit = data.edit_bones.new(name)
        edit.head = Vector(head) * scale
        edit.tail = Vector(tail) * scale
        if parent:
            edit.parent = data.edit_bones[parent]

    bone("Root", (0, 0, 0.02), (0, 0, 0.22))
    bone("Pelvis", (0, 0, 0.94), (0, 0, 1.1), "Root")
    bone("Spine", (0, 0, 1.02), (0, 0, 1.34), "Pelvis")
    bone("Chest", (0, 0, 1.3), (0, 0, 1.56), "Spine")
    bone("Neck", (0, 0, 1.54), (0, 0, 1.68), "Chest")
    bone("Head", (0, 0, 1.66), (0, 0, 1.93), "Neck")
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"UpperArm.{side}", (0.24 * sign, 0, 1.5), (0.43 * sign, 0, 1.24), "Chest")
        bone(f"Forearm.{side}", (0.43 * sign, 0, 1.24), (0.47 * sign, 0, 0.98), f"UpperArm.{side}")
        bone(f"Hand.{side}", (0.47 * sign, 0, 0.98), (0.48 * sign, 0.03, 0.86), f"Forearm.{side}")
        bone(f"Thigh.{side}", (0.13 * sign, 0, 0.98), (0.14 * sign, 0, 0.55), "Pelvis")
        bone(f"Shin.{side}", (0.14 * sign, 0, 0.55), (0.14 * sign, 0, 0.14), f"Thigh.{side}")
        bone(f"Foot.{side}", (0.14 * sign, 0, 0.14), (0.14 * sign, 0.23, 0.08), f"Shin.{side}")
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def add_face(parts: list[bpy.types.Object], collection, armature, materials, spec, scale: float) -> None:
    skin = materials["skin"]
    ink = materials["ink"]
    head_z = 1.76 * scale
    parts.append(sphere_part(collection, armature, skin, spec.avatar_id, "head", "Head", (0, 0, head_z), (0.205 * scale, 0.18 * scale, 0.245 * scale), segments=16, rings=10))
    for side in (-1, 1):
        parts.append(sphere_part(collection, armature, ink, spec.avatar_id, "eye", "Head", (0.071 * side * scale, 0.171 * scale, 1.79 * scale), (0.018 * scale, 0.012 * scale, 0.025 * scale), segments=8, rings=6))
        parts.append(box_part(collection, armature, materials["hair"], spec.avatar_id, "brow", "Head", (0.067 * side * scale, 0.178 * scale, 1.835 * scale), (0.045 * scale, 0.009 * scale, 0.009 * scale), rotation=(0, side * 0.08, side * 0.12), bevel=0.006))
    parts.append(ico_part(collection, armature, skin, spec.avatar_id, "nose", "Head", (0, 0.192 * scale, 1.745 * scale), (0.035 * scale, 0.038 * scale, 0.05 * scale), 1))
    parts.append(box_part(collection, armature, ink, spec.avatar_id, "mouth", "Head", (0, 0.183 * scale, 1.685 * scale), (0.055 * scale, 0.008 * scale, 0.009 * scale), bevel=0.005))


def add_bush_hat(parts: list[bpy.types.Object], collection, armature, materials, spec, scale: float) -> None:
    hair = materials["hair"]
    hat = materials["hat"]
    band = materials["ink"]
    curl_angles = [
        math.tau * index / 18
        for index in range(18)
        if not (math.sin(math.tau * index / 18) > 0.45 and abs(math.cos(math.tau * index / 18)) < 0.72)
    ]
    for index, angle in enumerate(curl_angles):
        radius_x = 0.19 + 0.02 * math.sin(index * 1.7)
        radius_y = 0.145 + 0.018 * math.cos(index * 1.3)
        z = 1.84 + 0.035 * math.sin(index * 2.1)
        parts.append(ico_part(collection, armature, hair, spec.avatar_id, "light-brown-curl", "Head", (math.cos(angle) * radius_x * scale, math.sin(angle) * radius_y * scale, z * scale), (0.055 * scale, 0.052 * scale, 0.058 * scale), 1))
    for index, x in enumerate((-0.13, -0.045, 0.045, 0.13)):
        curl_z = 1.875 - abs(index - 1.5) * 0.018
        parts.append(ico_part(collection, armature, hair, spec.avatar_id, "forehead-curl", "Head", (x * scale, 0.145 * scale, curl_z * scale), (0.048 * scale, 0.042 * scale, 0.065 * scale), 1))

    segments = 24
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for ring, (rx, ry) in enumerate(((0.17, 0.135), (0.35, 0.29))):
        for index in range(segments):
            angle = math.tau * index / segments
            side_curl = 0.05 * abs(math.cos(angle)) if ring else 0
            front_dip = -0.016 * max(0, math.sin(angle)) if ring else 0
            vertices.append((math.cos(angle) * rx * scale, math.sin(angle) * ry * scale, (1.925 + side_curl + front_dip) * scale))
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((index, nxt, segments + nxt, segments + index))
    mesh = bpy.data.meshes.new("Milo bush-hat brim mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    brim = bpy.data.objects.new("Milo weathered Australian bush-hat brim", mesh)
    collection.objects.link(brim)
    activate(brim)
    solidify = brim.modifiers.new("Bush-hat brim thickness", "SOLIDIFY")
    solidify.thickness = 0.025 * scale
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    parts.append(finish_mesh(brim, collection, hat, armature, "Head", spec.avatar_id, "bush-hat-brim"))
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.205 * scale, radius2=0.16 * scale, depth=0.195 * scale, location=(0, -0.008 * scale, 2.015 * scale), rotation=(0.04, 0, 0))
    parts.append(finish_mesh(bpy.context.object, collection, hat, armature, "Head", spec.avatar_id, "bush-hat-crown"))
    parts.append(torus_part(collection, armature, band, spec.avatar_id, "bush-hat-band", "Head", (0, 0, 1.94 * scale), 0.185 * scale, 0.018 * scale))
    for index in range(7):
        angle = -0.82 + index * 0.27
        x = math.sin(angle) * 0.17 * scale
        y = math.cos(angle) * 0.17 * scale
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.014 * scale, radius2=0.005 * scale, depth=0.06 * scale, location=(x, y, 1.947 * scale), rotation=(math.pi / 2, 0, -angle))
        parts.append(finish_mesh(bpy.context.object, collection, materials["bone"], armature, "Head", spec.avatar_id, "hat-band-tooth"))


def add_avatar_hair_and_gear(parts: list[bpy.types.Object], collection, armature, materials, spec, scale: float) -> None:
    if spec.avatar_id == "milo":
        add_bush_hat(parts, collection, armature, materials, spec, scale)
        parts.append(torus_part(collection, armature, materials["accent"], spec.avatar_id, "neckerchief", "Chest", (0, 0, 1.49 * scale), 0.19 * scale, 0.025 * scale))
        parts.append(box_part(collection, armature, materials["accent"], spec.avatar_id, "neckerchief-tail", "Chest", (0, 0.177 * scale, 1.4 * scale), (0.055 * scale, 0.018 * scale, 0.13 * scale), rotation=(0.12, 0, 0), bevel=0.012))
    elif spec.avatar_id == "asha":
        parts.append(sphere_part(collection, armature, materials["bluegum"], spec.avatar_id, "head-wrap", "Head", (0, -0.015 * scale, 1.86 * scale), (0.218 * scale, 0.19 * scale, 0.17 * scale), segments=14, rings=8))
        parts.append(torus_part(collection, armature, materials["top_dark"], spec.avatar_id, "head-wrap-band", "Head", (0, 0, 1.82 * scale), 0.205 * scale, 0.025 * scale))
        parts.append(box_part(collection, armature, materials["accent"], spec.avatar_id, "medical-armband", "UpperArm.L", (0.36 * scale, 0, 1.34 * scale), (0.095 * scale, 0.105 * scale, 0.055 * scale), rotation=(0, 0.62, -0.62), bevel=0.014))
        parts.append(box_part(collection, armature, materials["top_dark"], spec.avatar_id, "field-satchel", "Pelvis", (-0.3 * scale, 0.03 * scale, 0.88 * scale), (0.14 * scale, 0.09 * scale, 0.18 * scale), bevel=0.025))
    elif spec.avatar_id == "jules":
        parts.append(box_part(collection, armature, materials["hair"], spec.avatar_id, "undercut-top", "Head", (0, -0.025 * scale, 1.96 * scale), (0.185 * scale, 0.145 * scale, 0.07 * scale), rotation=(0.08, 0, -0.06), bevel=0.05))
        for side in (-1, 1):
            parts.append(box_part(collection, armature, materials["accent"], spec.avatar_id, "utility-pouch", "Pelvis", (0.25 * side * scale, 0.02 * scale, 0.87 * scale), (0.095 * scale, 0.075 * scale, 0.12 * scale), bevel=0.02))
        parts.append(torus_part(collection, armature, materials["ink"], spec.avatar_id, "utility-belt", "Pelvis", (0, 0, 0.98 * scale), 0.245 * scale, 0.027 * scale))
    else:
        for side in (-1, 1):
            for index in range(4):
                parts.append(ico_part(collection, armature, materials["hair"], spec.avatar_id, "bob-hair", "Head", ((0.14 + index * 0.018) * side * scale, -0.045 * scale, (1.82 - index * 0.055) * scale), (0.075 * scale, 0.075 * scale, 0.09 * scale), 1))
        parts.append(sphere_part(collection, armature, materials["top_dark"], spec.avatar_id, "bike-helmet", "Head", (0, -0.01 * scale, 1.95 * scale), (0.23 * scale, 0.195 * scale, 0.13 * scale), segments=14, rings=8))
        for x in (-0.1, 0, 0.1):
            parts.append(box_part(collection, armature, materials["ink"], spec.avatar_id, "helmet-vent", "Head", (x * scale, 0.176 * scale, 1.98 * scale), (0.025 * scale, 0.012 * scale, 0.055 * scale), rotation=(0.18, 0, 0), bevel=0.008))
        for side in (-1, 1):
            parts.append(torus_part(collection, armature, materials["accent"], spec.avatar_id, "reflective-ankle-band", f"Shin.{ 'L' if side > 0 else 'R' }", (0.14 * side * scale, 0, 0.25 * scale), 0.09 * scale, 0.018 * scale, rotation=(0, 0, 0)))


def build_avatar(spec: AvatarSpec) -> tuple[bpy.types.Collection, bpy.types.Object, dict[str, bpy.types.Action]]:
    collection = new_collection(f"EG_SURVIVOR_{spec.avatar_id.upper()}")
    scale = spec.height_scale
    armature = create_armature(collection, spec.avatar_id, scale)
    materials = {
        "skin": make_material(f"{spec.avatar_id}-skin", spec.skin, roughness=0.82),
        "hair": make_material(f"{spec.avatar_id}-hair", spec.hair, roughness=0.94),
        "top": make_material(f"{spec.avatar_id}-top", spec.top, roughness=0.9),
        "top_dark": make_material(f"{spec.avatar_id}-top-dark", spec.top_dark, roughness=0.92),
        "pants": make_material(f"{spec.avatar_id}-pants", spec.pants, roughness=0.92),
        "accent": make_material(f"{spec.avatar_id}-accent", spec.accent, roughness=0.82),
        "shoes": make_material(f"{spec.avatar_id}-shoes", spec.shoes, roughness=0.88),
        "ink": make_material(f"{spec.avatar_id}-ink", 0x171D1F, roughness=0.96),
        "bone": make_material(f"{spec.avatar_id}-bone", 0xD8CCAA, roughness=0.78),
        "hat": make_material(f"{spec.avatar_id}-hat", 0x6D5132, roughness=0.96),
        "bluegum": make_material(f"{spec.avatar_id}-bluegum", 0x426B68, roughness=0.92),
    }
    parts: list[bpy.types.Object] = []
    width = spec.build
    parts.append(sphere_part(collection, armature, materials["pants"], spec.avatar_id, "pelvis", "Pelvis", (0, 0, 0.99 * scale), (0.245 * width * scale, 0.16 * width * scale, 0.18 * scale), segments=12, rings=7))
    parts.append(box_part(collection, armature, materials["top_dark"], spec.avatar_id, "lower-torso", "Spine", (0, 0, 1.19 * scale), (0.225 * width * scale, 0.145 * width * scale, 0.2 * scale), bevel=0.08 * scale))
    parts.append(box_part(collection, armature, materials["top"], spec.avatar_id, "upper-torso", "Chest", (0, 0, 1.43 * scale), (0.285 * width * scale, 0.17 * width * scale, 0.2 * scale), bevel=0.09 * scale))
    parts.append(cylinder_part(collection, armature, materials["skin"], spec.avatar_id, "neck", "Neck", (0, 0, 1.54 * scale), (0, 0, 1.69 * scale), 0.08 * scale, vertices=10))
    add_face(parts, collection, armature, materials, spec, scale)

    for side, sign in (("L", 1), ("R", -1)):
        parts.append(cylinder_part(collection, armature, materials["top"], spec.avatar_id, "upper-arm", f"UpperArm.{side}", (0.25 * sign * scale, 0, 1.48 * scale), (0.43 * sign * scale, 0, 1.24 * scale), 0.095 * width * scale))
        parts.append(cylinder_part(collection, armature, materials["skin"], spec.avatar_id, "forearm", f"Forearm.{side}", (0.43 * sign * scale, 0, 1.24 * scale), (0.47 * sign * scale, 0, 0.99 * scale), 0.075 * scale))
        parts.append(ico_part(collection, armature, materials["skin"], spec.avatar_id, "hand", f"Hand.{side}", (0.48 * sign * scale, 0.015 * scale, 0.9 * scale), (0.075 * scale, 0.055 * scale, 0.095 * scale), 1))
        parts.append(cylinder_part(collection, armature, materials["pants"], spec.avatar_id, "thigh", f"Thigh.{side}", (0.13 * sign * scale, 0, 0.94 * scale), (0.14 * sign * scale, 0, 0.55 * scale), 0.115 * width * scale))
        parts.append(cylinder_part(collection, armature, materials["pants"], spec.avatar_id, "shin", f"Shin.{side}", (0.14 * sign * scale, 0, 0.55 * scale), (0.14 * sign * scale, 0, 0.15 * scale), 0.095 * width * scale))
        parts.append(box_part(collection, armature, materials["shoes"], spec.avatar_id, "shoe", f"Foot.{side}", (0.14 * sign * scale, 0.115 * scale, 0.08 * scale), (0.105 * width * scale, 0.18 * scale, 0.065 * scale), rotation=(0.05, 0, 0), bevel=0.035 * scale))
        parts.append(torus_part(collection, armature, materials["top_dark"], spec.avatar_id, "wrist-cuff", f"Forearm.{side}", (0.465 * sign * scale, 0, 1.055 * scale), 0.082 * scale, 0.017 * scale, rotation=(0, math.pi / 2, 0)))

    add_avatar_hair_and_gear(parts, collection, armature, materials, spec, scale)

    activate(parts[0])
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    character_mesh = bpy.context.object
    character_mesh.name = f"{spec.avatar_id}-survivor-mesh"
    character_mesh.parent = armature
    character_mesh.matrix_parent_inverse = armature.matrix_world.inverted()
    tag(character_mesh, spec.avatar_id, "survivor-mesh")

    socket = bpy.data.objects.new("WeaponSocket", None)
    collection.objects.link(socket)
    socket.parent = armature
    socket.parent_type = "BONE"
    socket.parent_bone = "Hand.R"
    socket.location = (0, 0.09 * scale, -0.02 * scale)
    socket.rotation_euler = (math.pi / 2, 0, math.pi)
    tag(socket, spec.avatar_id, "weapon-socket")

    actions = create_actions(armature)
    armature.animation_data_create()
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(1)
    return collection, armature, actions


def reset_pose(armature: bpy.types.Object) -> None:
    for bone in armature.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key_pose(armature: bpy.types.Object, frame: int, transforms: dict[str, dict[str, tuple[float, float, float]]]) -> None:
    reset_pose(armature)
    for name, values in transforms.items():
        bone = armature.pose.bones.get(name)
        if not bone:
            continue
        if "location" in values:
            bone.location = values["location"]
        if "rotation" in values:
            bone.rotation_euler = values["rotation"]
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)


def make_action(armature: bpy.types.Object, name: str, poses: list[tuple[int, dict]]) -> bpy.types.Action:
    action = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = action
    for frame, transforms in poses:
        key_pose(armature, frame, transforms)
    action.use_fake_user = True
    return action


def create_actions(armature: bpy.types.Object) -> dict[str, bpy.types.Action]:
    existing = {name: bpy.data.actions.get(name) for name in ("Idle", "Walk", "Run", "Crouch", "CrouchWalk", "Aim", "Melee", "Reload", "Jump", "Downed")}
    if all(existing.values()):
        return existing  # type: ignore[return-value]

    idle_a = {"Chest": {"rotation": (0.025, 0, -0.018)}, "Head": {"rotation": (-0.015, 0, 0.025)}}
    idle_b = {"Chest": {"rotation": (-0.018, 0, 0.018)}, "Head": {"rotation": (0.018, 0.04, -0.018)}, "Pelvis": {"location": (0, 0, 0.012)}}
    actions = {"Idle": make_action(armature, "Idle", [(1, idle_a), (24, idle_b), (48, idle_a)])}

    walk: list[tuple[int, dict]] = []
    run: list[tuple[int, dict]] = []
    crouch_walk: list[tuple[int, dict]] = []
    for frame, phase in ((1, 0), (10, 1), (20, 0), (30, -1), (40, 0)):
        walk.append((frame, {
            "Pelvis": {"location": (0, 0, 0.018 if phase == 0 else 0)},
            "Thigh.L": {"rotation": (0.48 * phase, 0, 0.03)},
            "Thigh.R": {"rotation": (-0.48 * phase, 0, -0.03)},
            "Shin.L": {"rotation": (-0.22 * max(0, phase), 0, 0)},
            "Shin.R": {"rotation": (0.22 * min(0, phase), 0, 0)},
            "UpperArm.L": {"rotation": (-0.34 * phase, 0, 0)},
            "UpperArm.R": {"rotation": (0.34 * phase, 0, 0)},
            "Chest": {"rotation": (0.04, 0, -0.05 * phase)},
        }))
        run.append((frame, {
            "Pelvis": {"location": (0, 0, 0.045 if phase == 0 else 0)},
            "Thigh.L": {"rotation": (0.78 * phase, 0, 0.04)},
            "Thigh.R": {"rotation": (-0.78 * phase, 0, -0.04)},
            "Shin.L": {"rotation": (-0.5 * max(0, phase), 0, 0)},
            "Shin.R": {"rotation": (0.5 * min(0, phase), 0, 0)},
            "UpperArm.L": {"rotation": (-0.58 * phase, 0, 0.12)},
            "UpperArm.R": {"rotation": (0.58 * phase, 0, -0.12)},
            "Chest": {"rotation": (0.18, 0, -0.08 * phase)},
        }))
        crouch_walk.append((frame, {
            "Pelvis": {"location": (0, 0, -0.25)},
            "Spine": {"rotation": (0.22, 0, 0)},
            "Thigh.L": {"rotation": (0.28 + 0.28 * phase, 0, 0.06)},
            "Thigh.R": {"rotation": (0.28 - 0.28 * phase, 0, -0.06)},
            "Shin.L": {"rotation": (-0.48, 0, 0)},
            "Shin.R": {"rotation": (-0.48, 0, 0)},
        }))
    actions["Walk"] = make_action(armature, "Walk", walk)
    actions["Run"] = make_action(armature, "Run", run)
    crouched = {"Pelvis": {"location": (0, 0, -0.25)}, "Spine": {"rotation": (0.22, 0, 0)}, "Thigh.L": {"rotation": (0.31, 0, 0.05)}, "Thigh.R": {"rotation": (0.31, 0, -0.05)}, "Shin.L": {"rotation": (-0.5, 0, 0)}, "Shin.R": {"rotation": (-0.5, 0, 0)}}
    actions["Crouch"] = make_action(armature, "Crouch", [(1, crouched), (30, {**crouched, "Chest": {"rotation": (0.025, 0, 0.02)}}), (60, crouched)])
    actions["CrouchWalk"] = make_action(armature, "CrouchWalk", crouch_walk)
    aim = {"Chest": {"rotation": (0.08, 0, 0)}, "UpperArm.L": {"rotation": (-1.12, -0.1, 0.16)}, "Forearm.L": {"rotation": (-0.42, 0.12, -0.18)}, "UpperArm.R": {"rotation": (-1.2, 0.08, -0.12)}, "Forearm.R": {"rotation": (-0.5, -0.08, 0.15)}, "Head": {"rotation": (-0.05, 0, 0)}}
    actions["Aim"] = make_action(armature, "Aim", [(1, aim), (24, {**aim, "Chest": {"rotation": (0.065, 0, 0.012)}}), (48, aim)])
    actions["Melee"] = make_action(armature, "Melee", [(1, aim), (8, {"Chest": {"rotation": (0.1, 0, -0.48)}, "UpperArm.R": {"rotation": (-0.58, 0.22, -0.65)}, "Forearm.R": {"rotation": (-0.32, 0, -0.2)}}), (16, {"Chest": {"rotation": (0.14, 0, 0.35)}, "UpperArm.R": {"rotation": (-1.48, -0.2, 0.38)}, "Forearm.R": {"rotation": (-0.12, 0, 0.16)}}), (28, aim)])
    actions["Reload"] = make_action(armature, "Reload", [(1, aim), (12, {"Chest": {"rotation": (0.08, 0, 0.08)}, "UpperArm.L": {"rotation": (-0.65, -0.2, 0.45)}, "Forearm.L": {"rotation": (-0.92, 0.25, -0.25)}, "UpperArm.R": {"rotation": (-0.82, 0.1, -0.15)}}), (28, {"Chest": {"rotation": (0.05, 0, -0.05)}, "UpperArm.L": {"rotation": (-0.95, 0.1, 0.1)}, "Forearm.L": {"rotation": (-0.55, 0, 0.2)}, "UpperArm.R": {"rotation": (-0.9, 0.05, -0.1)}}), (44, aim)])
    actions["Jump"] = make_action(armature, "Jump", [(1, {}), (10, {"Pelvis": {"location": (0, 0, -0.08)}, "Thigh.L": {"rotation": (0.34, 0, 0)}, "Thigh.R": {"rotation": (0.34, 0, 0)}, "Shin.L": {"rotation": (-0.48, 0, 0)}, "Shin.R": {"rotation": (-0.48, 0, 0)}}), (22, {"Pelvis": {"location": (0, 0, 0.12)}, "UpperArm.L": {"rotation": (-0.42, 0, 0.25)}, "UpperArm.R": {"rotation": (-0.42, 0, -0.25)}}), (38, {})])
    actions["Downed"] = make_action(armature, "Downed", [(1, {}), (18, {"Root": {"rotation": (0, 1.38, 0)}, "Pelvis": {"location": (0, 0.04, -0.55)}, "UpperArm.L": {"rotation": (-0.8, 0.2, 0.2)}, "UpperArm.R": {"rotation": (0.5, -0.2, -0.3)}}), (40, {"Root": {"rotation": (0, 1.52, 0)}, "Pelvis": {"location": (0, 0.02, -0.7)}})])
    reset_pose(armature)
    return actions


def add_preview_scene() -> tuple[bpy.types.Collection, bpy.types.Object]:
    collection = new_collection("EG_SURVIVOR_PREVIEW")
    floor_material = make_material("Preview wet bluestone", 0x26383C, roughness=0.78)
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -0.01))
    floor = bpy.context.object
    floor.name = "Survivor preview floor"
    floor.data.materials.append(floor_material)
    move_to_collection(floor, collection)
    camera_data = bpy.data.cameras.new("Survivor audit camera")
    camera = bpy.data.objects.new("Survivor audit camera", camera_data)
    camera_data.lens = 58
    collection.objects.link(camera)
    bpy.context.scene.camera = camera
    for name, light_type, energy, color, location, size in (
        ("Warm winter key", "AREA", 850, (1.0, 0.78, 0.56), (3.2, 4.2, 5.5), 4.0),
        ("Bluegum fill", "AREA", 560, (0.48, 0.72, 0.74), (-3.8, 1.2, 3.4), 3.5),
        ("Rim", "AREA", 720, (0.76, 0.86, 1.0), (0, -4.0, 4.2), 3.0),
    ):
        data = bpy.data.lights.new(name, light_type)
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        collection.objects.link(obj)
        point_camera(obj, location, (0, 0, 1.05))
    return collection, camera


def point_camera(camera: bpy.types.Object, position, target) -> None:
    camera.location = position
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_avatar_visibility(avatar_collections: dict[str, bpy.types.Collection], active: str) -> None:
    for avatar_id, collection in avatar_collections.items():
        collection.hide_render = avatar_id != active


def configure_render(transparent: bool, width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = transparent
    scene.render.image_settings.color_depth = "8"
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.018, 0.03, 0.035)


def render_avatar(
    spec: AvatarSpec,
    camera: bpy.types.Object,
    avatar_collections: dict[str, bpy.types.Collection],
    preview: bpy.types.Collection,
    render_root: Path,
    portrait_root: Path,
) -> None:
    set_avatar_visibility(avatar_collections, spec.avatar_id)
    avatar_dir = render_root / spec.avatar_id
    avatar_dir.mkdir(parents=True, exist_ok=True)
    views = {
        "01-front": ((0, 4.6, 1.72), (0, 0, 1.08)),
        "02-front-right": ((3.35, 3.55, 2.05), (0, 0, 1.08)),
        "03-side": ((4.7, 0.2, 1.72), (0, 0, 1.05)),
        "04-rear": ((0, -4.6, 1.8), (0, 0, 1.08)),
    }
    configure_render(False, 720, 720)
    preview.hide_render = False
    floor = preview.objects.get("Survivor preview floor")
    if floor: floor.hide_render = False
    for name, (position, target) in views.items():
        point_camera(camera, position, target)
        bpy.context.scene.render.filepath = str(avatar_dir / f"{name}.png")
        bpy.ops.render.render(write_still=True)

    portrait_root.mkdir(parents=True, exist_ok=True)
    configure_render(True, 512, 640)
    if floor: floor.hide_render = True
    point_camera(camera, (0, 4.0, 1.64), (0, 0, 1.18))
    bpy.context.scene.render.filepath = str(portrait_root / f"{Path(spec.filename).stem}.png")
    bpy.ops.render.render(write_still=True)
    if floor: floor.hide_render = False


def export_avatar(collection: bpy.types.Collection, filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    armature = next(obj for obj in collection.all_objects if obj.type == "ARMATURE")
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_morph=False,
        export_yup=True,
    )


def evaluated_triangle_count(collection: bpy.types.Collection) -> int:
    graph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in collection.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def write_manifest(path: Path, avatar_collections: dict[str, bpy.types.Collection], blend_path: Path, glb_dir: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "label": "Edinburgh Gardens survivor roster",
        "units": "metres",
        "origin": "between the feet at ground level",
        "front": "+Y in Blender; -Z in Three.js after glTF conversion",
        "blenderVersion": bpy.app.version_string,
        "generator": "scripts/blender/build_player_characters.py",
        "blend": os.path.relpath(blend_path, Path.cwd()),
        "designBasis": "Original fictional survivors shaped for the existing low-poly Melbourne anime palette; no external likenesses or scanned character assets.",
        "animationContract": {
            "rootMotion": False,
            "clips": ["Idle", "Walk", "Run", "Crouch", "CrouchWalk", "Aim", "Melee", "Reload", "Jump", "Downed"],
            "weaponSocket": "WeaponSocket parented to Hand.R",
        },
        "avatars": [],
    }
    for spec in AVATARS:
        collection = avatar_collections[spec.avatar_id]
        payload["avatars"].append({
            "id": spec.avatar_id,
            "name": spec.name,
            "role": spec.role,
            "glb": os.path.relpath(glb_dir / spec.filename, Path.cwd()),
            "triangleCount": evaluated_triangle_count(collection),
            "meshObjectCount": sum(1 for obj in collection.all_objects if obj.type == "MESH"),
            "armatureCount": sum(1 for obj in collection.all_objects if obj.type == "ARMATURE"),
            "distinctiveFeature": "light-brown curly hair and weathered Australian bush hat" if spec.avatar_id == "milo" else None,
        })
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    cwd = Path.cwd()
    blend_path = (cwd / args.blend_output).resolve()
    glb_dir = (cwd / args.glb_dir).resolve()
    manifest_path = (cwd / args.manifest_output).resolve()
    render_root = (cwd / args.render_output).resolve()
    portrait_root = (cwd / args.portrait_output).resolve()
    for path in (blend_path.parent, glb_dir, manifest_path.parent, render_root, portrait_root):
        path.mkdir(parents=True, exist_ok=True)

    reset_scene()
    preview, camera = add_preview_scene()
    avatar_collections: dict[str, bpy.types.Collection] = {}
    armatures: dict[str, bpy.types.Object] = {}
    for spec in AVATARS:
        collection, armature, _actions = build_avatar(spec)
        avatar_collections[spec.avatar_id] = collection
        armatures[spec.avatar_id] = armature

    for spec in AVATARS:
        armatures[spec.avatar_id].location = (0, 0, 0)
        render_avatar(spec, camera, avatar_collections, preview, render_root, portrait_root)
        export_avatar(avatar_collections[spec.avatar_id], glb_dir / spec.filename)

    set_avatar_visibility(avatar_collections, "milo")
    preview.hide_render = False
    for index, spec in enumerate(AVATARS):
        armatures[spec.avatar_id].location.x = (index - 1.5) * 1.65
        avatar_collections[spec.avatar_id].hide_viewport = spec.avatar_id != "milo"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    write_manifest(manifest_path, avatar_collections, blend_path, glb_dir)
    print(f"Built {ASSET_ID}")
    print(f"Blend: {blend_path}")
    print(f"GLBs: {glb_dir}")
    print(f"Renders: {render_root}")


if __name__ == "__main__":
    main()

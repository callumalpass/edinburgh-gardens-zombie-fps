"""Build the original Blender assets for the wave-three rescue scenario.

Run with Blender 4.5 LTS or newer:

  blender --background --python scripts/blender/build_rescue_scenario_assets.py -- \
    --blend-output assets/blender/rescue-scenario/edinburgh-gardens-rescue-scenario.blend \
    --glb-dir public/models/rescue-scenario \
    --manifest-output assets/blender/rescue-scenario/edinburgh-gardens-rescue-scenario.asset.json \
    --render-output tmp/blender-audit/rescue-scenario
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

sys.path.insert(0, str(Path.cwd()))
from scripts.blender import build_player_characters as pc
from scripts.blender import build_zombie_characters as zc


ASSET_ID = "edinburgh-gardens-wave-three-rescue"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-dir", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def mat(name: str, colour: int, *, roughness: float = 0.88, metalness: float = 0.02, emission: int | None = None) -> bpy.types.Material:
    material = pc.make_material(name, colour, roughness=roughness, metallic=metalness)
    if emission is not None:
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            rgb = tuple(((emission >> shift) & 0xFF) / 255 for shift in (16, 8, 0))
            bsdf.inputs["Emission Color"].default_value = (*rgb, 1)
            bsdf.inputs["Emission Strength"].default_value = 0.65
    return material


def add_caretaker_accessories(collection: bpy.types.Collection, armature: bpy.types.Object) -> None:
    s = 1.02
    owner = "caretaker"
    yellow = mat("caretaker-faded-hi-vis", 0xD9A942)
    orange = mat("caretaker-reflective-orange", 0xC9653D)
    reflective = mat("caretaker-reflective-tape", 0xDDE0C5, roughness=0.52, metalness=0.12)
    teal = mat("caretaker-council-teal", 0x315B56)
    leather = mat("caretaker-tool-leather", 0x513A2B)
    metal = mat("caretaker-key-metal", 0xA9A89A, roughness=0.48, metalness=0.55)
    red = mat("caretaker-radio-red", 0xA84639)
    wound = mat("caretaker-dried-wound", 0x6B2722)
    ink = mat("caretaker-lettering", 0x172323)
    parts: list[bpy.types.Object] = []

    # Cropped vest panels leave the original torn shirt readable underneath.
    parts.append(pc.box_part(collection, armature, yellow, owner, "hi-vis-front", "Chest", (0, 0.185, 1.39), (0.305, 0.025, 0.285), rotation=(0.1, 0, 0.035), bevel=0.055))
    parts.append(pc.box_part(collection, armature, teal, owner, "vest-collar", "Chest", (0, 0.225, 1.62), (0.2, 0.025, 0.055), rotation=(0.1, 0, 0.02), bevel=0.018))
    for z in (1.29, 1.48):
        parts.append(pc.box_part(collection, armature, reflective, owner, "reflective-strip", "Chest", (0, 0.217, z), (0.31, 0.012, 0.026), rotation=(0.1, 0, 0.035), bevel=0.006))
    for x in (-0.22, 0.22):
        parts.append(pc.box_part(collection, armature, orange, owner, "vest-edge", "Chest", (x, 0.21, 1.4), (0.026, 0.012, 0.25), rotation=(0.1, 0, x * 0.1), bevel=0.008))
    parts.append(pc.box_part(collection, armature, wound, owner, "torn-vest-wound", "Chest", (0.21, 0.244, 1.35), (0.095, 0.01, 0.075), rotation=(0.1, 0.12, -0.28), bevel=0.025))

    # Council patch and hand-painted identifier make the silhouette readable at range.
    patch = pc.box_part(collection, armature, teal, owner, "council-patch", "Chest", (-0.14, 0.247, 1.48), (0.09, 0.01, 0.065), rotation=(0.1, 0, 0.035), bevel=0.012)
    parts.append(patch)
    for index, width in enumerate((0.055, 0.038, 0.024)):
        parts.append(pc.box_part(collection, armature, reflective, owner, "patch-leaf", "Chest", (-0.14 + index * 0.026, 0.261, 1.49 + index * 0.014), (width, 0.006, 0.008), rotation=(0.1, 0.18, -0.42), bevel=0.003))

    # Tool belt, radio and dangling key ring are the quest tell.
    parts.append(pc.box_part(collection, armature, leather, owner, "tool-belt", "Pelvis", (0, 0.08, 1.02), (0.31, 0.1, 0.065), rotation=(0, 0, -0.04), bevel=0.02))
    parts.append(pc.box_part(collection, armature, red, owner, "shoulder-radio", "Chest", (0.27, 0.19, 1.58), (0.075, 0.045, 0.11), rotation=(0.08, 0, -0.12), bevel=0.018))
    parts.append(pc.cylinder_part(collection, armature, metal, owner, "radio-aerial", "Chest", (0.3, 0.19, 1.65), (0.34, 0.2, 1.79), 0.012, vertices=7))
    ring = pc.torus_part(collection, armature, metal, owner, "key-ring", "Pelvis", (-0.23, 0.12, 0.92), 0.09, 0.016, rotation=(math.pi / 2, 0.15, 0))
    parts.append(ring)
    for index, (x, z, angle) in enumerate(((-0.27, 0.78, -0.2), (-0.19, 0.76, 0.18), (-0.24, 0.71, 0.05))):
        parts.append(pc.box_part(collection, armature, metal, owner, f"key-{index}", "Pelvis", (x, 0.14, z), (0.023, 0.014, 0.1), rotation=(0.05, 0, angle), bevel=0.006))
        parts.append(pc.box_part(collection, armature, metal, owner, f"key-tooth-{index}", "Pelvis", (x + 0.018, 0.14, z - 0.08), (0.032, 0.014, 0.018), rotation=(0.05, 0, angle), bevel=0.004))

    # Soft teal beanie and a broken rake handle give a park-worker read without realism clutter.
    parts.append(pc.sphere_part(collection, armature, teal, owner, "beanie", "Head", (0.02, -0.015, 1.96), (0.24, 0.2, 0.15), segments=12, rings=7))
    parts.append(pc.torus_part(collection, armature, ink, owner, "beanie-band", "Head", (0.02, 0, 1.88), 0.205, 0.026, rotation=(0, 0, 0)))
    parts.append(pc.cylinder_part(collection, armature, leather, owner, "broken-rake-handle", "Chest", (-0.4, -0.12, 0.78), (0.32, -0.15, 1.75), 0.025, vertices=8))

    for part in parts:
        part["eg_asset_id"] = ASSET_ID
        part["eg_role"] = "caretaker"


def build_caretaker() -> tuple[bpy.types.Collection, bpy.types.Object]:
    spec = zc.ZombieSpec("caretaker", "caretaker.glb", 1.02, 0.96, 0x657057, 0x384640, 0xD7A94B, 0.1)
    collection, armature, _actions = zc.build_biped(spec)
    collection.name = "EG_RESCUE_CARETAKER"
    armature.name = "caretaker-infected-rig"
    add_caretaker_accessories(collection, armature)
    armature["eg_role"] = "caretaker"
    return collection, armature


def create_dog_armature(collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.armatures.new("rescue-dog-rig")
    armature = bpy.data.objects.new("rescue-dog-rig", data)
    collection.objects.link(armature)
    pc.activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {
        "Root": ((0, 0, 0.36), (0, 0.18, 0.36), None),
        "Body": ((0, -0.52, 0.68), (0, 0.45, 0.72), "Root"),
        "Neck": ((0, 0.34, 0.73), (0, 0.62, 0.94), "Body"),
        "Head": ((0, 0.58, 0.94), (0, 0.91, 0.98), "Neck"),
        "Tail.1": ((0, -0.5, 0.73), (0, -0.84, 0.92), "Body"),
        "Tail.2": ((0, -0.84, 0.92), (0, -1.1, 1.02), "Tail.1"),
        "ForeLeg.L": ((0.2, 0.28, 0.67), (0.2, 0.3, 0.12), "Body"),
        "ForeLeg.R": ((-0.2, 0.28, 0.67), (-0.2, 0.3, 0.12), "Body"),
        "HindLeg.L": ((0.22, -0.35, 0.66), (0.22, -0.3, 0.12), "Body"),
        "HindLeg.R": ((-0.22, -0.35, 0.66), (-0.22, -0.3, 0.12), "Body"),
    }
    for name, (head, tail, parent) in bones.items():
        bone = data.edit_bones.new(name)
        bone.head = Vector(head)
        bone.tail = Vector(tail)
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="POSE")
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature["eg_asset_id"] = ASSET_ID
    armature["eg_role"] = "rescue-dog"
    return armature


def cone_part(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
    owner: str,
    kind: str,
    bone: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    *,
    vertices: int = 7,
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0.015, depth=depth, location=location, rotation=rotation)
    return pc.finish_mesh(bpy.context.object, collection, material, armature, bone, owner, kind)


def build_dog() -> tuple[bpy.types.Collection, bpy.types.Object]:
    collection = pc.new_collection("EG_RESCUE_DOG")
    armature = create_dog_armature(collection)
    owner = "dog"
    coat = mat("dog-charcoal-coat", 0x202B2A)
    shadow = mat("dog-teal-shadow", 0x294943)
    tan = mat("dog-tan-markings", 0xB8784D)
    cream = mat("dog-cream-chest", 0xD7D0B4)
    ink = mat("dog-ink", 0x0E1717)
    ochre = mat("dog-ochre-bandanna", 0xD5A13E)
    tag = mat("dog-tag", 0xC2C5B0, roughness=0.45, metalness=0.42)
    parts: list[bpy.types.Object] = []
    parts.append(pc.sphere_part(collection, armature, coat, owner, "body", "Body", (0, -0.1, 0.7), (0.34, 0.6, 0.32), segments=12, rings=8))
    parts.append(pc.sphere_part(collection, armature, shadow, owner, "shoulders", "Body", (0, 0.32, 0.74), (0.36, 0.31, 0.36), segments=12, rings=8))
    parts.append(pc.sphere_part(collection, armature, coat, owner, "head", "Head", (0, 0.72, 0.98), (0.29, 0.3, 0.27), segments=12, rings=8))
    parts.append(pc.sphere_part(collection, armature, tan, owner, "muzzle", "Head", (0, 0.96, 0.9), (0.2, 0.22, 0.14), segments=10, rings=7))
    parts.append(pc.sphere_part(collection, armature, ink, owner, "nose", "Head", (0, 1.14, 0.94), (0.105, 0.075, 0.075), segments=9, rings=6))
    for side in (-1, 1):
        label = "L" if side > 0 else "R"
        parts.append(pc.cylinder_part(collection, armature, shadow, owner, "front-leg", f"ForeLeg.{label}", (0.2 * side, 0.29, 0.65), (0.2 * side, 0.31, 0.12), 0.075, vertices=9))
        parts.append(pc.cylinder_part(collection, armature, coat, owner, "hind-leg", f"HindLeg.{label}", (0.22 * side, -0.35, 0.66), (0.22 * side, -0.3, 0.12), 0.09, vertices=9))
        parts.append(pc.box_part(collection, armature, tan, owner, "paw", f"ForeLeg.{label}", (0.2 * side, 0.39, 0.08), (0.095, 0.14, 0.055), bevel=0.035))
        parts.append(pc.box_part(collection, armature, tan, owner, "paw", f"HindLeg.{label}", (0.22 * side, -0.2, 0.08), (0.105, 0.15, 0.06), bevel=0.035))
        parts.append(pc.sphere_part(collection, armature, cream, owner, "eyebrow", "Head", (0.11 * side, 0.95, 1.07), (0.07, 0.018, 0.025), segments=7, rings=5))
        parts.append(pc.sphere_part(collection, armature, ochre, owner, "eye", "Head", (0.105 * side, 0.982, 1.04), (0.03, 0.015, 0.03), segments=8, rings=5))
        ear_rotation = (-0.08, side * (0.08 if side > 0 else 0.62), side * (0.08 if side > 0 else 0.42))
        ear_location = (0.16 * side, 0.72 if side > 0 else 0.75, 1.3 if side > 0 else 1.19)
        parts.append(cone_part(collection, armature, coat, owner, "ear", "Head", ear_location, 0.14, 0.42 if side > 0 else 0.32, vertices=7, rotation=ear_rotation))
    parts.append(pc.box_part(collection, armature, cream, owner, "chest-flash", "Body", (0, 0.49, 0.68), (0.13, 0.025, 0.24), rotation=(-0.12, 0, 0), bevel=0.045))
    parts.append(pc.cylinder_part(collection, armature, shadow, owner, "tail-base", "Tail.1", (0, -0.5, 0.74), (0, -0.84, 0.92), 0.085, vertices=9))
    parts.append(pc.cylinder_part(collection, armature, coat, owner, "tail-tip", "Tail.2", (0, -0.84, 0.92), (0.03, -1.12, 1.02), 0.06, vertices=9))
    parts.append(pc.torus_part(collection, armature, ochre, owner, "collar", "Neck", (0, 0.54, 0.86), 0.235, 0.045, rotation=(math.pi / 2, 0, 0)))
    parts.append(pc.box_part(collection, armature, ochre, owner, "bandanna", "Neck", (0, 0.64, 0.68), (0.19, 0.035, 0.19), rotation=(0.12, math.pi / 4, 0), bevel=0.025))
    parts.append(pc.sphere_part(collection, armature, tag, owner, "tag", "Neck", (0, 0.69, 0.75), (0.055, 0.02, 0.065), segments=8, rings=5))
    zc.join_parts(parts, armature, "dog")

    idle = {"Head": {"rotation": (0.02, 0.08, 0.04)}, "Tail.1": {"rotation": (0, 0, 0.28)}, "Tail.2": {"rotation": (0, 0, 0.22)}}
    pc.make_action(armature, "dog_Idle", [(1, idle), (18, {**idle, "Head": {"rotation": (-0.06, -0.16, -0.05)}, "Tail.1": {"rotation": (0, 0, -0.38)}, "Tail.2": {"rotation": (0, 0, -0.24)}}), (36, idle)])
    walk = []
    for frame, phase in ((1, 0), (7, 1), (14, 0), (21, -1), (28, 0)):
        walk.append((frame, {"Body": {"rotation": (0.02, 0, phase * 0.035)}, "ForeLeg.L": {"rotation": (phase * 0.55, 0, 0)}, "ForeLeg.R": {"rotation": (-phase * 0.55, 0, 0)}, "HindLeg.L": {"rotation": (-phase * 0.5, 0, 0)}, "HindLeg.R": {"rotation": (phase * 0.5, 0, 0)}, "Tail.1": {"rotation": (0, 0, phase * 0.42)}, "Head": {"rotation": (-0.04, 0, -phase * 0.03)}}))
    pc.make_action(armature, "dog_Walk", walk)
    sit = {"Body": {"rotation": (0.08, 0, 0)}, "HindLeg.L": {"rotation": (-1.1, 0, 0.18)}, "HindLeg.R": {"rotation": (-1.1, 0, -0.18)}, "Head": {"rotation": (-0.08, 0.05, 0)}, "Tail.1": {"rotation": (0.4, 0, 0.5)}}
    pc.make_action(armature, "dog_Sit", [(1, idle), (15, sit), (45, {**sit, "Head": {"rotation": (-0.12, -0.18, -0.05)}}), (70, sit)])
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions.get("dog_Idle")
    pc.reset_pose(armature)
    return collection, armature


def link_object(collection: bpy.types.Collection, obj: bpy.types.Object) -> bpy.types.Object:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    obj["eg_asset_id"] = ASSET_ID
    return obj


def cube(collection, name, location, scale, material, *, bevel=0.04, rotation=(0, 0, 0), role=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = link_object(collection, bpy.context.object)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("painted edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(material)
    if role:
        obj["eg_cart_state"] = role
    return obj


def cylinder(collection, name, location, radius, depth, material, *, rotation=(0, 0, 0), vertices=12, role=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = link_object(collection, bpy.context.object)
    obj.name = name
    obj.data.materials.append(material)
    if role:
        obj["eg_cart_state"] = role
    return obj


def build_cart() -> bpy.types.Collection:
    collection = pc.new_collection("EG_RESCUE_MAINTENANCE_CART")
    teal = mat("cart-weathered-teal", 0x315D58, roughness=0.78, metalness=0.14)
    dark = mat("cart-ink-rubber", 0x172120, roughness=0.9)
    metal = mat("cart-galvanised", 0x8D9992, roughness=0.56, metalness=0.42)
    timber = mat("cart-timber-tray", 0x76543A, roughness=0.94)
    ochre = mat("cart-hazard-ochre", 0xD4A33F, roughness=0.78)
    red = mat("cart-tail-red", 0xA9473D, roughness=0.5, emission=0x6E211B)
    cream = mat("cart-sign-cream", 0xD9D2B6, roughness=0.82)
    battery = mat("cart-battery", 0x283C44, roughness=0.7, metalness=0.12)

    cube(collection, "cart-chassis", (0, 0, 0.42), (0.88, 1.55, 0.12), dark, bevel=0.09)
    cube(collection, "cart-cab-floor", (0, 0.42, 0.69), (0.82, 0.7, 0.12), teal, bevel=0.08)
    cube(collection, "cart-front-cowl", (0, 1.02, 0.95), (0.78, 0.42, 0.46), teal, bevel=0.12, rotation=(0.04, 0, 0))
    cube(collection, "cart-seat", (0, 0.2, 1.05), (0.7, 0.22, 0.16), dark, bevel=0.08, rotation=(-0.08, 0, 0))
    cube(collection, "cart-seat-back", (0, -0.03, 1.38), (0.7, 0.12, 0.42), dark, bevel=0.08, rotation=(-0.12, 0, 0))
    cube(collection, "cart-tray-bed", (0, -0.92, 0.85), (0.86, 0.62, 0.11), timber, bevel=0.04)
    for x in (-0.78, 0.78):
        cube(collection, "cart-tray-rail", (x, -0.92, 1.2), (0.06, 0.62, 0.36), timber, bevel=0.025)
    cube(collection, "cart-tailgate", (0, -1.5, 1.17), (0.86, 0.07, 0.33), timber, bevel=0.035)
    for x in (-0.68, 0.68):
        cube(collection, "cart-roof-post", (x, 0.25, 1.72), (0.045, 0.055, 0.75), metal, bevel=0.015, rotation=(0.03, 0, 0))
    cube(collection, "cart-canopy", (0, 0.24, 2.46), (0.88, 0.78, 0.09), cream, bevel=0.08)
    cylinder(collection, "cart-steering-column", (0, 0.72, 1.23), 0.035, 0.62, metal, rotation=(0.55, 0, 0))
    cylinder(collection, "cart-steering-wheel", (0, 0.58, 1.47), 0.22, 0.045, dark, rotation=(1.1, 0, 0), vertices=18)

    wheel_positions = ((-0.72, 0.95, 0.42), (0.72, 0.95, 0.42), (-0.72, -1.12, 0.42), (0.72, -1.12, 0.42))
    for index, position in enumerate(wheel_positions):
        state = "repaired" if index == 1 else None
        wheel = cylinder(collection, f"cart-wheel-{index}", position, 0.34, 0.18, dark, rotation=(0, math.pi / 2, 0), vertices=18, role=state)
        rim = cylinder(collection, f"cart-wheel-rim-{index}", position, 0.17, 0.195, metal, rotation=(0, math.pi / 2, 0), vertices=14, role=state)
        if index == 1:
            wheel.hide_viewport = True
            wheel.hide_render = True
            rim.hide_viewport = True
            rim.hide_render = True
    # Detached wheel and jack are damaged-state tells; runtime swaps them after repair.
    detached = cylinder(collection, "cart-detached-wheel", (1.13, 0.65, 0.35), 0.34, 0.18, dark, rotation=(0.12, 0.4, 0.15), vertices=18, role="damaged")
    detached_rim = cylinder(collection, "cart-detached-wheel-rim", (1.13, 0.65, 0.35), 0.17, 0.195, metal, rotation=(0.12, 0.4, 0.15), vertices=14, role="damaged")
    cube(collection, "cart-jack", (0.72, 0.86, 0.24), (0.2, 0.28, 0.09), ochre, bevel=0.03, rotation=(0, 0, -0.12), role="damaged")

    cube(collection, "cart-battery-bay-door", (-0.81, -0.2, 0.76), (0.04, 0.34, 0.31), teal, bevel=0.025, rotation=(0, 0, -0.45), role="damaged")
    cube(collection, "cart-battery-installed", (-0.64, -0.22, 0.74), (0.26, 0.3, 0.25), battery, bevel=0.04, role="repaired").hide_render = True
    cube(collection, "cart-empty-battery-bay", (-0.65, -0.22, 0.74), (0.27, 0.31, 0.26), dark, bevel=0.035, role="damaged")
    for x in (-0.6, -0.2, 0.2, 0.6):
        cube(collection, "cart-hazard-stripe", (x, 1.455, 0.76), (0.13, 0.025, 0.08), ochre if int((x + 0.8) * 3) % 2 == 0 else dark, bevel=0.01, rotation=(0, 0.38, 0))
    for offset in (-0.12, 0, 0.12):
        cube(collection, "cart-nose-leaf-mark", (offset, 1.458, 1.08 + offset * 0.42), (0.105, 0.012, 0.022), cream, bevel=0.008, rotation=(0.38, 0, -0.38))
    cube(collection, "cart-council-sign", (0, -1.575, 1.19), (0.42, 0.018, 0.17), cream, bevel=0.02)
    for offset in (-0.12, 0, 0.12):
        cube(collection, "cart-leaf-mark", (offset, -1.598, 1.2 + offset * 0.45), (0.11, 0.012, 0.025), teal, bevel=0.01, rotation=(0.38, 0, -0.38))
    for x in (-0.56, 0.56):
        cylinder(collection, "cart-tail-light", (x, -1.59, 1.02), 0.075, 0.035, red, rotation=(math.pi / 2, 0, 0), vertices=12)
    # Park tools make the tray useful at a glance.
    cylinder(collection, "cart-rake-handle", (-0.42, -0.88, 1.48), 0.026, 1.65, timber, rotation=(0.18, 0.12, 0.05), vertices=8)
    cube(collection, "cart-rake-head", (-0.24, -1.59, 1.56), (0.35, 0.05, 0.07), metal, bevel=0.02, rotation=(0.18, 0.12, 0.05))
    cube(collection, "cart-toolbox", (0.38, -0.85, 1.38), (0.34, 0.28, 0.2), ochre, bevel=0.06)
    for obj in collection.all_objects:
        obj["eg_role"] = "maintenance-cart"
    return collection


def add_preview_scene() -> tuple[bpy.types.Collection, bpy.types.Object]:
    preview, camera = pc.add_preview_scene()
    preview.name = "EG_RESCUE_PREVIEW"
    floor = preview.objects.get("Survivor preview floor")
    if floor:
        floor.name = "Rescue scenario preview floor"
    return preview, camera


def set_collection_visibility(collections: dict[str, bpy.types.Collection], active: str) -> None:
    for name, collection in collections.items():
        collection.hide_render = name != active


def render_asset(name: str, collection: bpy.types.Collection, camera: bpy.types.Object, collections: dict[str, bpy.types.Collection], output_root: Path) -> None:
    set_collection_visibility(collections, name)
    if name == "caretaker":
        armature = next(obj for obj in collection.all_objects if obj.type == "ARMATURE")
        armature.animation_data.action = bpy.data.actions.get("caretaker_Idle")
        target_z, distance = 1.05, 4.8
    elif name == "dog":
        armature = next(obj for obj in collection.all_objects if obj.type == "ARMATURE")
        armature.animation_data.action = bpy.data.actions.get("dog_Sit")
        target_z, distance = 0.65, 3.0
    else:
        target_z, distance = 1.1, 5.7
    bpy.context.scene.frame_set(18 if name == "dog" else 1)
    output = output_root / name
    output.mkdir(parents=True, exist_ok=True)
    pc.configure_render(False, 760, 760)
    views = {
        "01-front": ((0, distance, target_z + 0.62), (0, 0, target_z)),
        "02-front-right": ((distance * 0.72, distance * 0.72, target_z + 0.72), (0, 0, target_z)),
        "03-rear-left": ((-distance * 0.72, -distance * 0.72, target_z + 0.68), (0, 0, target_z)),
    }
    for view, (position, target) in views.items():
        pc.point_camera(camera, position, target)
        bpy.context.scene.render.filepath = str(output / f"{view}.png")
        bpy.ops.render.render(write_still=True)


def ensure_action_filter() -> None:
    from io_scene_gltf2 import GLTF2_filter_action
    if not hasattr(bpy.types.Scene, "gltf_action_filter"):
        bpy.types.Scene.gltf_action_filter = bpy.props.CollectionProperty(type=GLTF2_filter_action)
        bpy.types.Scene.gltf_action_filter_active = bpy.props.IntProperty()


def export_collection(collection: bpy.types.Collection, filepath: Path, action_prefix: str | None = None) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    active = next((obj for obj in collection.all_objects if obj.type == "ARMATURE"), next(iter(collection.all_objects)))
    bpy.context.view_layer.objects.active = active
    ensure_action_filter()
    bpy.context.scene.gltf_action_filter.clear()
    for action in bpy.data.actions:
        item = bpy.context.scene.gltf_action_filter.add()
        item.action = action
        item.keep = bool(action_prefix and action.name.startswith(action_prefix))
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_selection=True, export_extras=True,
        export_cameras=False, export_lights=False, export_apply=False, export_animations=bool(action_prefix),
        export_animation_mode="ACTIONS", export_action_filter=bool(action_prefix), export_force_sampling=True,
        export_skins=bool(action_prefix), export_morph=False, export_yup=True,
    )


def write_manifest(path: Path, blend_path: Path, glb_dir: Path, collections: dict[str, bpy.types.Collection]) -> None:
    payload = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "label": "Wave-three caretaker, rescue dog and maintenance cart",
        "blenderVersion": bpy.app.version_string,
        "blend": os.path.relpath(blend_path, Path.cwd()),
        "generator": "scripts/blender/build_rescue_scenario_assets.py",
        "designBasis": "Original painterly low-poly designs made for this game; no external likenesses, scans, or reference geometry.",
        "palette": {"parkTeal": "#315d58", "tramOchre": "#d4a33f", "paperCream": "#d9d2b6", "ink": "#172120"},
        "runtimeContract": {
            "caretakerClips": ["Idle", "Move", "Chase", "Attack", "Stagger"],
            "dogClips": ["Idle", "Walk", "Sit"],
            "cartStateTags": ["damaged", "repaired"],
            "rootMotion": False,
            "gameplayCollisionRemainsAuthoritative": True,
        },
        "assets": [],
    }
    for name, filename in (("caretaker", "caretaker.glb"), ("dog", "rescue-dog.glb"), ("cart", "maintenance-cart.glb")):
        collection = collections[name]
        payload["assets"].append({
            "id": name,
            "glb": os.path.relpath(glb_dir / filename, Path.cwd()),
            "triangleCount": pc.evaluated_triangle_count(collection),
            "meshObjectCount": sum(1 for obj in collection.all_objects if obj.type == "MESH"),
            "armatureCount": sum(1 for obj in collection.all_objects if obj.type == "ARMATURE"),
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    cwd = Path.cwd()
    blend_path = (cwd / args.blend_output).resolve()
    glb_dir = (cwd / args.glb_dir).resolve()
    manifest_path = (cwd / args.manifest_output).resolve()
    render_root = (cwd / args.render_output).resolve()
    for path in (blend_path.parent, glb_dir, manifest_path.parent, render_root):
        path.mkdir(parents=True, exist_ok=True)
    pc.reset_scene()
    _preview, camera = add_preview_scene()
    caretaker, caretaker_armature = build_caretaker()
    dog, dog_armature = build_dog()
    cart = build_cart()
    collections = {"caretaker": caretaker, "dog": dog, "cart": cart}
    for name, collection in collections.items():
        render_asset(name, collection, camera, collections, render_root)
    export_collection(caretaker, glb_dir / "caretaker.glb", "caretaker_")
    export_collection(dog, glb_dir / "rescue-dog.glb", "dog_")
    export_collection(cart, glb_dir / "maintenance-cart.glb")
    caretaker_armature.location.x = -2.1
    dog_armature.location.x = 0
    cart.hide_viewport = False
    for obj in cart.all_objects:
        obj.location.x += 2.4
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    write_manifest(manifest_path, blend_path, glb_dir, collections)
    print(f"Built {ASSET_ID}")


if __name__ == "__main__":
    main()

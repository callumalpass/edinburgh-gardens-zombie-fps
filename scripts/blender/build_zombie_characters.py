"""Build the five stylised Edinburgh Gardens zombie archetypes.

Run with Blender 4.5 LTS or newer:

  blender --background --python scripts/blender/build_zombie_characters.py -- \
    --blend-output assets/blender/zombies/edinburgh-gardens-zombies.blend \
    --glb-dir public/models/zombies \
    --manifest-output assets/blender/zombies/edinburgh-gardens-zombies.asset.json \
    --render-output tmp/blender-audit/zombies
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

sys.path.insert(0, str(Path.cwd()))
from scripts.blender import build_player_characters as pc


ASSET_ID = "edinburgh-gardens-zombie-roster"


@dataclass(frozen=True)
class ZombieSpec:
    zombie_type: str
    filename: str
    scale: float
    build: float
    skin: int
    shirt: int
    accent: int
    posture: float


ZOMBIES = (
    ZombieSpec("shambler", "shambler.glb", 1.0, 0.94, 0x687653, 0x3D4A3B, 0xC19B58, 0.08),
    ZombieSpec("sprinter", "sprinter.glb", 0.91, 0.72, 0x5C704D, 0x475147, 0xD9BA55, 0.22),
    ZombieSpec("bloater", "bloater.glb", 1.18, 1.45, 0x71815B, 0x45513E, 0xB7644F, -0.03),
    ZombieSpec("screamer", "screamer.glb", 1.06, 0.76, 0x82765D, 0x57423E, 0xE4CC71, 0.14),
    ZombieSpec("crawler", "crawler.glb", 0.88, 0.82, 0x526441, 0x2F3A33, 0x91AC71, 0.0),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-output", required=True)
    parser.add_argument("--glb-dir", required=True)
    parser.add_argument("--manifest-output", required=True)
    parser.add_argument("--render-output", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def zombie_materials(spec: ZombieSpec) -> dict[str, bpy.types.Material]:
    return {
        "skin": pc.make_material(f"{spec.zombie_type}-skin", spec.skin, roughness=0.96),
        "shirt": pc.make_material(f"{spec.zombie_type}-shirt", spec.shirt, roughness=0.94),
        "pants": pc.make_material(f"{spec.zombie_type}-pants", 0x252B29, roughness=0.92),
        "blood": pc.make_material(f"{spec.zombie_type}-blood", 0x681D17, roughness=0.9),
        "bone": pc.make_material(f"{spec.zombie_type}-bone", 0xB9AE8B, roughness=0.82),
        "hair": pc.make_material(f"{spec.zombie_type}-hair", 0x151612, roughness=0.98),
        "ink": pc.make_material(f"{spec.zombie_type}-ink", 0x100B0A, roughness=0.98),
        "accent": pc.make_material(f"{spec.zombie_type}-accent", spec.accent, roughness=0.78),
        "shoe": pc.make_material(f"{spec.zombie_type}-shoe", 0x171B19, roughness=0.9),
    }


def join_parts(parts: list[bpy.types.Object], armature: bpy.types.Object, zombie_type: str) -> bpy.types.Object:
    pc.activate(parts[0])
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = f"{zombie_type}-zombie-mesh"
    mesh.parent = armature
    mesh.matrix_parent_inverse = armature.matrix_world.inverted()
    mesh["eg_asset_id"] = ASSET_ID
    mesh["eg_zombie_type"] = zombie_type
    mesh["eg_kind"] = "zombie-mesh"
    return mesh


def add_zombie_face(parts, collection, armature, materials, spec, scale, head_z, head_scale=(0.22, 0.19, 0.25)) -> None:
    parts.append(pc.ico_part(collection, armature, materials["skin"], spec.zombie_type, "head", "Head", (0.035 * scale, 0.015 * scale, head_z * scale), tuple(value * scale for value in head_scale), 2))
    for side in (-1, 1):
        parts.append(pc.sphere_part(collection, armature, materials["ink"], spec.zombie_type, "eye-socket", "Head", (0.072 * side * scale, 0.19 * scale, (head_z + 0.045) * scale), (0.045 * scale, 0.02 * scale, 0.04 * scale), segments=8, rings=6))
        parts.append(pc.sphere_part(collection, armature, materials["accent"], spec.zombie_type, "infected-eye", "Head", (0.072 * side * scale, 0.211 * scale, (head_z + 0.045) * scale), (0.018 * scale, 0.01 * scale, 0.018 * scale), segments=8, rings=5))
    jaw_height = 0.11 if spec.zombie_type != "screamer" else 0.18
    parts.append(pc.box_part(collection, armature, materials["skin"], spec.zombie_type, "jaw", "Head", (0.025 * scale, 0.145 * scale, (head_z - 0.17) * scale), (0.13 * scale, 0.08 * scale, jaw_height * scale), rotation=(0.12 if spec.zombie_type == "screamer" else 0, 0, 0.04), bevel=0.025 * scale))
    parts.append(pc.box_part(collection, armature, materials["ink"], spec.zombie_type, "mouth", "Head", (0.02 * scale, 0.227 * scale, (head_z - 0.16) * scale), (0.1 * scale, 0.012 * scale, (0.05 if spec.zombie_type == "screamer" else 0.025) * scale), bevel=0.008))
    for tooth_x in (-0.07, -0.022, 0.026, 0.074):
        parts.append(pc.box_part(collection, armature, materials["bone"], spec.zombie_type, "tooth", "Head", (tooth_x * scale, 0.242 * scale, (head_z - 0.125) * scale), (0.012 * scale, 0.008 * scale, 0.032 * scale), rotation=(0, 0, tooth_x * 1.2), bevel=0.003))


def add_biped_details(parts, collection, armature, materials, spec, scale) -> None:
    if spec.zombie_type == "shambler":
        for index, x in enumerate((-0.14, 0, 0.14)):
            parts.append(pc.box_part(collection, armature, materials["bone"], spec.zombie_type, "exposed-rib", "Chest", (x * scale, 0.2 * scale, (1.44 + index * 0.055) * scale), (0.08 * scale, 0.018 * scale, 0.012 * scale), rotation=(0, 0, x * 0.8), bevel=0.004))
        parts.append(pc.box_part(collection, armature, materials["blood"], spec.zombie_type, "shoulder-wound", "UpperArm.L", (0.31 * scale, 0.07 * scale, 1.42 * scale), (0.07 * scale, 0.035 * scale, 0.1 * scale), rotation=(0, 0.5, -0.5), bevel=0.018))
        for index, (x, z) in enumerate(((-0.12, 1.98), (0.02, 2.01), (0.14, 1.94))):
            parts.append(pc.ico_part(collection, armature, materials["hair"], spec.zombie_type, "matted-hair", "Head", (x * scale, -0.04 * scale, z * scale), (0.09 * scale, 0.08 * scale, 0.055 * scale), 1))
        parts.append(pc.box_part(collection, armature, materials["shirt"], spec.zombie_type, "torn-shirt-tail", "Spine", (-0.18 * scale, 0.18 * scale, 1.12 * scale), (0.11 * scale, 0.02 * scale, 0.2 * scale), rotation=(0.08, 0, -0.18), bevel=0.012))
    elif spec.zombie_type == "sprinter":
        parts.append(pc.box_part(collection, armature, materials["accent"], spec.zombie_type, "track-stripe", "Chest", (0, 0.176 * scale, 1.4 * scale), (0.055 * scale, 0.012 * scale, 0.2 * scale), rotation=(0.12, 0, -0.08), bevel=0.012))
        for side in (-1, 1):
            parts.append(pc.box_part(collection, armature, materials["accent"], spec.zombie_type, "shin-stripe", f"Shin.{'L' if side > 0 else 'R'}", (0.14 * side * scale, 0.09 * scale, 0.37 * scale), (0.025 * scale, 0.012 * scale, 0.16 * scale), bevel=0.006))
    elif spec.zombie_type == "bloater":
        parts.append(pc.sphere_part(collection, armature, materials["shirt"], spec.zombie_type, "swollen-belly", "Spine", (0, 0.04 * scale, 1.23 * scale), (0.46 * scale, 0.35 * scale, 0.47 * scale), segments=14, rings=9))
        for index, (x, z, radius) in enumerate(((-0.2, 1.35, 0.055), (0.23, 1.48, 0.07), (0.08, 1.12, 0.045), (-0.28, 1.08, 0.05))):
            parts.append(pc.sphere_part(collection, armature, materials["blood"], spec.zombie_type, "lesion", "Spine", (x * scale, 0.35 * scale, z * scale), (radius * scale, 0.025 * scale, radius * scale), segments=8, rings=5))
    elif spec.zombie_type == "screamer":
        parts.append(pc.cylinder_part(collection, armature, materials["accent"], spec.zombie_type, "inflamed-throat", "Neck", (0, 0.09 * scale, 1.52 * scale), (0, 0.13 * scale, 1.7 * scale), 0.06 * scale, vertices=10))
        for side in (-1, 1):
            parts.append(pc.box_part(collection, armature, materials["hair"], spec.zombie_type, "stringy-hair", "Head", (0.17 * side * scale, -0.02 * scale, 1.78 * scale), (0.035 * scale, 0.04 * scale, 0.21 * scale), rotation=(0.08, side * 0.08, side * 0.05), bevel=0.012))


def build_biped(spec: ZombieSpec) -> tuple[bpy.types.Collection, bpy.types.Object, dict[str, bpy.types.Action]]:
    collection = pc.new_collection(f"EG_ZOMBIE_{spec.zombie_type.upper()}")
    scale = spec.scale
    armature = pc.create_armature(collection, spec.zombie_type, scale)
    armature["eg_zombie_type"] = spec.zombie_type
    armature["eg_kind"] = "zombie-rig"
    materials = zombie_materials(spec)
    parts: list[bpy.types.Object] = []
    width = spec.build
    torso_z = 1.34
    parts.append(pc.sphere_part(collection, armature, materials["pants"], spec.zombie_type, "pelvis", "Pelvis", (0, 0, 0.98 * scale), (0.23 * width * scale, 0.16 * width * scale, 0.18 * scale), segments=10, rings=7))
    parts.append(pc.box_part(collection, armature, materials["shirt"], spec.zombie_type, "torso", "Chest", (0, -0.02 * scale, torso_z * scale), (0.28 * width * scale, 0.18 * width * scale, 0.34 * scale), rotation=(spec.posture, 0, 0.05 if spec.zombie_type == "shambler" else 0), bevel=0.1 * scale))
    parts.append(pc.cylinder_part(collection, armature, materials["skin"], spec.zombie_type, "neck", "Neck", (0, 0, 1.55 * scale), (0, 0.02 * scale, (1.72 if spec.zombie_type == "screamer" else 1.67) * scale), (0.07 if spec.zombie_type == "screamer" else 0.085) * scale, vertices=9))
    add_zombie_face(parts, collection, armature, materials, spec, scale, 1.79 if spec.zombie_type == "screamer" else 1.76, (0.18, 0.17, 0.29) if spec.zombie_type == "screamer" else (0.22, 0.19, 0.25))

    for side, sign in (("L", 1), ("R", -1)):
        asymmetry = 1.1 if spec.zombie_type == "shambler" and side == "L" else 1.0
        arm_radius = (0.085 if spec.zombie_type == "sprinter" else 0.105 if spec.zombie_type == "bloater" else 0.09) * scale
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], spec.zombie_type, "upper-arm", f"UpperArm.{side}", (0.25 * sign * width * scale, 0, 1.5 * scale), (0.44 * sign * width * scale, 0.03 * scale, 1.23 * scale), arm_radius * asymmetry))
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], spec.zombie_type, "forearm", f"Forearm.{side}", (0.44 * sign * width * scale, 0.03 * scale, 1.23 * scale), (0.5 * sign * width * scale, 0.12 * scale, 0.92 * scale), arm_radius * 0.78 * asymmetry))
        parts.append(pc.ico_part(collection, armature, materials["skin"], spec.zombie_type, "claw-hand", f"Hand.{side}", (0.5 * sign * width * scale, 0.14 * scale, 0.86 * scale), (0.075 * scale, 0.065 * scale, 0.1 * scale), 1))
        for claw_index in (-1, 0, 1):
            parts.append(pc.box_part(collection, armature, materials["bone"], spec.zombie_type, "claw", f"Hand.{side}", ((0.5 * sign * width + claw_index * 0.025) * scale, 0.2 * scale, 0.82 * scale), (0.012 * scale, 0.055 * scale, 0.012 * scale), rotation=(0.4, 0, 0), bevel=0.003))
        leg_radius = (0.105 if spec.zombie_type == "bloater" else 0.08 if spec.zombie_type == "sprinter" else 0.09) * width * scale
        parts.append(pc.cylinder_part(collection, armature, materials["pants"], spec.zombie_type, "thigh", f"Thigh.{side}", (0.13 * sign * width * scale, 0, 0.94 * scale), (0.14 * sign * width * scale, 0, 0.54 * scale), leg_radius))
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], spec.zombie_type, "shin", f"Shin.{side}", (0.14 * sign * width * scale, 0, 0.54 * scale), (0.14 * sign * width * scale, 0.02 * scale, 0.14 * scale), leg_radius * 0.82))
        parts.append(pc.box_part(collection, armature, materials["shoe"], spec.zombie_type, "shoe", f"Foot.{side}", (0.14 * sign * width * scale, 0.12 * scale, 0.08 * scale), (0.1 * width * scale, 0.18 * scale, 0.065 * scale), rotation=(0.05, side == "L" and 0.08 or -0.08, 0), bevel=0.03 * scale))

    add_biped_details(parts, collection, armature, materials, spec, scale)
    mesh = join_parts(parts, armature, spec.zombie_type)
    actions = create_biped_actions(armature, spec.zombie_type)
    armature.animation_data_create()
    armature.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_set(1)
    return collection, armature, actions


def create_biped_actions(armature: bpy.types.Object, zombie_type: str) -> dict[str, bpy.types.Action]:
    def action_name(clip: str) -> str:
        return f"{zombie_type}_{clip}"

    idle = {"Chest": {"rotation": (0.17, 0, 0.08)}, "UpperArm.L": {"rotation": (-0.72, 0, 0.3)}, "UpperArm.R": {"rotation": (-0.9, 0, -0.28)}, "Head": {"rotation": (0.05, 0.12, 0.14)}}
    actions = {"Idle": pc.make_action(armature, action_name("Idle"), [(1, idle), (28, {**idle, "Head": {"rotation": (-0.02, -0.18, 0.08)}}), (56, idle)])}
    move = []
    chase = []
    for frame, phase in ((1, 0), (10, 1), (20, 0), (30, -1), (40, 0)):
        move.append((frame, {"Chest": {"rotation": (0.2, 0, 0.09 * phase)}, "Thigh.L": {"rotation": (0.46 * phase, 0, 0.04)}, "Thigh.R": {"rotation": (-0.46 * phase, 0, -0.04)}, "UpperArm.L": {"rotation": (-0.85 - 0.12 * phase, 0, 0.25)}, "UpperArm.R": {"rotation": (-0.85 + 0.12 * phase, 0, -0.25)}}))
        chase.append((frame, {"Chest": {"rotation": (0.38, 0, 0.12 * phase)}, "Thigh.L": {"rotation": (0.82 * phase, 0, 0.06)}, "Thigh.R": {"rotation": (-0.82 * phase, 0, -0.06)}, "Shin.L": {"rotation": (-0.4 * max(phase, 0), 0, 0)}, "Shin.R": {"rotation": (0.4 * min(phase, 0), 0, 0)}, "UpperArm.L": {"rotation": (-1.18 - 0.24 * phase, 0, 0.2)}, "UpperArm.R": {"rotation": (-1.18 + 0.24 * phase, 0, -0.2)}}))
    actions["Move"] = pc.make_action(armature, action_name("Move"), move)
    actions["Chase"] = pc.make_action(armature, action_name("Chase"), chase)
    actions["Attack"] = pc.make_action(armature, action_name("Attack"), [(1, idle), (10, {"Chest": {"rotation": (0.48, 0, 0)}, "UpperArm.L": {"rotation": (-1.55, 0, 0.12)}, "UpperArm.R": {"rotation": (-1.48, 0, -0.12)}, "Forearm.L": {"rotation": (-0.38, 0, 0)}, "Forearm.R": {"rotation": (-0.38, 0, 0)}}), (22, idle)])
    actions["Stagger"] = pc.make_action(armature, action_name("Stagger"), [(1, idle), (8, {"Chest": {"rotation": (-0.28, 0, 0.32)}, "Head": {"rotation": (-0.32, 0.2, -0.28)}, "UpperArm.L": {"rotation": (0.2, 0, 0.6)}, "UpperArm.R": {"rotation": (-0.2, 0, -0.5)}}), (20, idle)])
    actions["Scream"] = pc.make_action(armature, action_name("Scream"), [(1, idle), (12, {"Chest": {"rotation": (-0.12, 0, 0)}, "Head": {"rotation": (-0.45, 0, 0)}, "UpperArm.L": {"rotation": (0.18, 0, 1.02)}, "UpperArm.R": {"rotation": (0.18, 0, -1.02)}}), (34, idle)])
    pc.reset_pose(armature)
    return actions


def create_crawler_armature(collection: bpy.types.Collection, spec: ZombieSpec) -> bpy.types.Object:
    data = bpy.data.armatures.new("crawler-zombie-rig")
    armature = bpy.data.objects.new("crawler-zombie-rig", data)
    collection.objects.link(armature)
    pc.activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    bones = {
        "Root": ((0, 0, 0.15), (0, 0.2, 0.15), None),
        "Spine": ((0, -0.45, 0.52), (0, 0.48, 0.58), "Root"),
        "Head": ((0, 0.45, 0.58), (0, 0.82, 0.54), "Spine"),
        "UpperArm.L": ((0.22, 0.32, 0.53), (0.38, 0.42, 0.25), "Spine"),
        "Forearm.L": ((0.38, 0.42, 0.25), (0.46, 0.7, 0.08), "UpperArm.L"),
        "UpperArm.R": ((-0.22, 0.32, 0.53), (-0.38, 0.42, 0.25), "Spine"),
        "Forearm.R": ((-0.38, 0.42, 0.25), (-0.46, 0.7, 0.08), "UpperArm.R"),
        "Thigh.L": ((0.2, -0.35, 0.5), (0.34, -0.48, 0.26), "Spine"),
        "Shin.L": ((0.34, -0.48, 0.26), (0.42, -0.72, 0.08), "Thigh.L"),
        "Thigh.R": ((-0.2, -0.35, 0.5), (-0.34, -0.48, 0.26), "Spine"),
        "Shin.R": ((-0.34, -0.48, 0.26), (-0.42, -0.72, 0.08), "Thigh.R"),
    }
    for name, (head, tail, parent) in bones.items():
        bone = data.edit_bones.new(name)
        bone.head = Vector(head) * spec.scale
        bone.tail = Vector(tail) * spec.scale
        if parent: bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="POSE")
    for bone in armature.pose.bones: bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature["eg_zombie_type"] = "crawler"
    return armature


def build_crawler(spec: ZombieSpec) -> tuple[bpy.types.Collection, bpy.types.Object, dict[str, bpy.types.Action]]:
    collection = pc.new_collection("EG_ZOMBIE_CRAWLER")
    armature = create_crawler_armature(collection, spec)
    materials = zombie_materials(spec)
    s = spec.scale
    parts: list[bpy.types.Object] = []
    parts.append(pc.cylinder_part(collection, armature, materials["shirt"], "crawler", "horizontal-torso", "Spine", (0, -0.48 * s, 0.52 * s), (0, 0.48 * s, 0.58 * s), 0.29 * s, vertices=12))
    parts.append(pc.sphere_part(collection, armature, materials["pants"], "crawler", "raised-pelvis", "Spine", (0, -0.48 * s, 0.55 * s), (0.31 * s, 0.32 * s, 0.25 * s), segments=10, rings=7))
    for index, y in enumerate((-0.35, -0.12, 0.1, 0.32)):
        parts.append(pc.ico_part(collection, armature, materials["bone"], "crawler", "spine-knuckle", "Spine", ((-0.03 + index * 0.018) * s, y * s, 0.82 * s), (0.055 * s, 0.07 * s, 0.045 * s), 1))
    parts.append(pc.ico_part(collection, armature, materials["skin"], "crawler", "head", "Head", (0.04 * s, 0.72 * s, 0.55 * s), (0.24 * s, 0.27 * s, 0.2 * s), 2))
    for side in (-1, 1):
        parts.append(pc.sphere_part(collection, armature, materials["ink"], "crawler", "eye-socket", "Head", (0.09 * side * s, 0.94 * s, 0.59 * s), (0.05 * s, 0.02 * s, 0.04 * s), segments=8, rings=5))
        parts.append(pc.sphere_part(collection, armature, materials["accent"], "crawler", "infected-eye", "Head", (0.09 * side * s, 0.965 * s, 0.59 * s), (0.018 * s, 0.01 * s, 0.018 * s), segments=8, rings=5))
        label = "L" if side > 0 else "R"
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], "crawler", "front-upper-limb", f"UpperArm.{label}", (0.22 * side * s, 0.32 * s, 0.53 * s), (0.38 * side * s, 0.42 * s, 0.25 * s), 0.085 * s))
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], "crawler", "front-lower-limb", f"Forearm.{label}", (0.38 * side * s, 0.42 * s, 0.25 * s), (0.46 * side * s, 0.7 * s, 0.08 * s), 0.07 * s))
        for claw in (-1, 0, 1):
            parts.append(pc.box_part(collection, armature, materials["bone"], "crawler", "front-claw", f"Forearm.{label}", ((0.46 * side + claw * 0.022) * s, 0.76 * s, 0.065 * s), (0.01 * s, 0.055 * s, 0.01 * s), rotation=(0.32, 0, 0), bevel=0.002))
        parts.append(pc.cylinder_part(collection, armature, materials["pants"], "crawler", "rear-upper-limb", f"Thigh.{label}", (0.2 * side * s, -0.35 * s, 0.5 * s), (0.34 * side * s, -0.48 * s, 0.26 * s), 0.1 * s))
        parts.append(pc.cylinder_part(collection, armature, materials["skin"], "crawler", "rear-lower-limb", f"Shin.{label}", (0.34 * side * s, -0.48 * s, 0.26 * s), (0.42 * side * s, -0.72 * s, 0.08 * s), 0.07 * s))
    parts.append(pc.box_part(collection, armature, materials["blood"], "crawler", "back-wound", "Spine", (0.12 * s, -0.1 * s, 0.81 * s), (0.16 * s, 0.2 * s, 0.025 * s), rotation=(0.1, 0.1, -0.18), bevel=0.025))
    for x in (-0.09, -0.03, 0.03, 0.09):
        parts.append(pc.box_part(collection, armature, materials["bone"], "crawler", "teeth", "Head", (x * s, 0.97 * s, 0.49 * s), (0.012 * s, 0.012 * s, 0.035 * s), bevel=0.003))
    join_parts(parts, armature, "crawler")
    actions = create_crawler_actions(armature)
    armature.animation_data_create()
    armature.animation_data.action = actions["Crawler_Idle"]
    bpy.context.scene.frame_set(1)
    return collection, armature, actions


def create_crawler_actions(armature: bpy.types.Object) -> dict[str, bpy.types.Action]:
    idle = {"Spine": {"rotation": (0.02, 0, 0.05)}, "Head": {"rotation": (0, 0.08, -0.08)}}
    actions = {"Crawler_Idle": pc.make_action(armature, "Crawler_Idle", [(1, idle), (24, {"Spine": {"rotation": (-0.03, 0, -0.04)}, "Head": {"rotation": (0, -0.12, 0.1)}}), (48, idle)])}
    move = []
    chase = []
    for frame, phase in ((1, 0), (8, 1), (16, 0), (24, -1), (32, 0)):
        move.append((frame, {"UpperArm.L": {"rotation": (0.38 * phase, 0, 0)}, "UpperArm.R": {"rotation": (-0.38 * phase, 0, 0)}, "Thigh.L": {"rotation": (-0.32 * phase, 0, 0)}, "Thigh.R": {"rotation": (0.32 * phase, 0, 0)}, "Spine": {"rotation": (0.03, 0, 0.05 * phase)}}))
        chase.append((frame, {"UpperArm.L": {"rotation": (0.7 * phase, 0, 0)}, "UpperArm.R": {"rotation": (-0.7 * phase, 0, 0)}, "Thigh.L": {"rotation": (-0.58 * phase, 0, 0)}, "Thigh.R": {"rotation": (0.58 * phase, 0, 0)}, "Spine": {"rotation": (0.12, 0, 0.08 * phase)}}))
    actions["Crawler_Move"] = pc.make_action(armature, "Crawler_Move", move)
    actions["Crawler_Chase"] = pc.make_action(armature, "Crawler_Chase", chase)
    actions["Crawler_Attack"] = pc.make_action(armature, "Crawler_Attack", [(1, idle), (8, {"Spine": {"rotation": (0.28, 0, 0)}, "Head": {"rotation": (-0.35, 0, 0)}, "UpperArm.L": {"rotation": (-0.45, 0, 0)}, "UpperArm.R": {"rotation": (-0.45, 0, 0)}}), (18, idle)])
    actions["Crawler_Stagger"] = pc.make_action(armature, "Crawler_Stagger", [(1, idle), (7, {"Spine": {"rotation": (-0.25, 0.12, 0.32)}, "Head": {"rotation": (0.3, -0.2, -0.25)}}), (18, idle)])
    pc.reset_pose(armature)
    return actions


def add_preview_scene() -> tuple[bpy.types.Collection, bpy.types.Object]:
    preview, camera = pc.add_preview_scene()
    preview.name = "EG_ZOMBIE_PREVIEW"
    floor = preview.objects.get("Survivor preview floor")
    if floor: floor.name = "Zombie preview floor"
    return preview, camera


def render_zombie(spec, camera, collections, output_root) -> None:
    for zombie_type, collection in collections.items(): collection.hide_render = zombie_type != spec.zombie_type
    armature = next(obj for obj in collections[spec.zombie_type].all_objects if obj.type == "ARMATURE")
    clip, frame = {
        "sprinter": ("Chase", 10),
        "screamer": ("Scream", 12),
        "crawler": ("Move", 8),
    }.get(spec.zombie_type, ("Idle", 1))
    pose = (f"Crawler_{clip}" if spec.zombie_type == "crawler" else f"{spec.zombie_type}_{clip}", frame)
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions.get(pose[0])
    bpy.context.scene.frame_set(pose[1])
    output = output_root / spec.zombie_type
    output.mkdir(parents=True, exist_ok=True)
    pc.configure_render(False, 720, 720)
    target_z = 0.55 if spec.zombie_type == "crawler" else 1.05 * spec.scale
    distance = 3.7 if spec.zombie_type == "crawler" else 4.7
    views = {
        "01-front": ((0, distance, target_z + 0.55), (0, 0, target_z)),
        "02-front-right": ((distance * 0.72, distance * 0.72, target_z + 0.7), (0, 0, target_z)),
        "03-side": ((distance, 0.15, target_z + 0.55), (0, 0, target_z)),
        "04-rear": ((0, -distance, target_z + 0.6), (0, 0, target_z)),
    }
    for name, (position, target) in views.items():
        pc.point_camera(camera, position, target)
        bpy.context.scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)


def export_zombie(collection: bpy.types.Collection, filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects: obj.select_set(True)
    armature = next(obj for obj in collection.all_objects if obj.type == "ARMATURE")
    bpy.context.view_layer.objects.active = armature
    from io_scene_gltf2 import GLTF2_filter_action
    if not hasattr(bpy.types.Scene, "gltf_action_filter"):
        bpy.types.Scene.gltf_action_filter = bpy.props.CollectionProperty(type=GLTF2_filter_action)
        bpy.types.Scene.gltf_action_filter_active = bpy.props.IntProperty()
    action_prefix = "Crawler_" if armature.get("eg_zombie_type") == "crawler" else f"{armature.get('eg_zombie_type')}_"
    bpy.context.scene.gltf_action_filter.clear()
    for action in bpy.data.actions:
        item = bpy.context.scene.gltf_action_filter.add()
        item.action = action
        item.keep = action.name.startswith(action_prefix)
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_selection=True, export_extras=True,
        export_cameras=False, export_lights=False, export_apply=False, export_animations=True,
        export_animation_mode="ACTIONS", export_action_filter=True, export_force_sampling=True, export_skins=True,
        export_morph=False, export_yup=True,
    )


def write_manifest(path: Path, collections: dict[str, bpy.types.Collection], blend_path: Path, glb_dir: Path) -> None:
    payload = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "label": "Edinburgh Gardens zombie archetypes",
        "blenderVersion": bpy.app.version_string,
        "blend": os.path.relpath(blend_path, Path.cwd()),
        "generator": "scripts/blender/build_zombie_characters.py",
        "designBasis": "Original low-poly infected archetypes translating existing game silhouettes and behaviours; no external likenesses or scanned assets.",
        "animationContract": {
            "bipedClips": ["Idle", "Move", "Chase", "Attack", "Stagger", "Scream"],
            "crawlerClips": ["Idle", "Move", "Chase", "Attack", "Stagger"],
        },
        "runtimeContract": {
            "rootMotion": False,
            "gameplayHitZonesRemainAuthoritative": True,
            "contactShadowsRemainInstanced": True,
            "animationDistanceThrottling": True,
        },
        "zombies": [],
    }
    for spec in ZOMBIES:
        collection = collections[spec.zombie_type]
        payload["zombies"].append({
            "type": spec.zombie_type,
            "glb": os.path.relpath(glb_dir / spec.filename, Path.cwd()),
            "triangleCount": pc.evaluated_triangle_count(collection),
            "meshObjectCount": sum(1 for obj in collection.all_objects if obj.type == "MESH"),
            "armatureCount": sum(1 for obj in collection.all_objects if obj.type == "ARMATURE"),
            "rigFamily": "crawler" if spec.zombie_type == "crawler" else "biped",
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
    for path in (blend_path.parent, glb_dir, manifest_path.parent, render_root): path.mkdir(parents=True, exist_ok=True)
    pc.reset_scene()
    _preview, camera = add_preview_scene()
    collections: dict[str, bpy.types.Collection] = {}
    armatures: dict[str, bpy.types.Object] = {}
    for spec in ZOMBIES:
        collection, armature, _actions = build_crawler(spec) if spec.zombie_type == "crawler" else build_biped(spec)
        collections[spec.zombie_type] = collection
        armatures[spec.zombie_type] = armature
    for spec in ZOMBIES:
        render_zombie(spec, camera, collections, render_root)
        export_zombie(collections[spec.zombie_type], glb_dir / spec.filename)
    for index, spec in enumerate(ZOMBIES):
        armatures[spec.zombie_type].location.x = (index - 2) * 1.75
        collections[spec.zombie_type].hide_viewport = spec.zombie_type != "shambler"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    write_manifest(manifest_path, collections, blend_path, glb_dir)
    print(f"Built {ASSET_ID}")


if __name__ == "__main__":
    main()

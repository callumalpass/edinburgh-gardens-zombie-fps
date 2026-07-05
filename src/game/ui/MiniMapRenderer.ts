import { playerForward2D } from "../visibility";
import type { LevelData, Vec2 } from "../types";

export interface MiniMapZombie {
  position: Vec2;
  radius: number;
}

export interface MiniMapWeaponDrop {
  position: Vec2;
}

export interface MiniMapRenderState {
  playerPosition: Vec2;
  playerYaw: number;
  zombies: readonly MiniMapZombie[];
  weaponDrops: readonly MiniMapWeaponDrop[];
  isVisible: (point: Vec2, padding?: number) => boolean;
}

export class MiniMapRenderer {
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minZ: number;
  private readonly maxZ: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly level: LevelData
  ) {
    this.minX = Math.min(...level.boundary.map((point) => point.x));
    this.maxX = Math.max(...level.boundary.map((point) => point.x));
    this.minZ = Math.min(...level.boundary.map((point) => point.z));
    this.maxZ = Math.max(...level.boundary.map((point) => point.z));
  }

  render(state: MiniMapRenderState): number {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return 0;

    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    this.paintMapGround(ctx, w, h);

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "rgba(156, 190, 178, 0.18)";
    ctx.lineWidth = 0.7;
    ctx.lineCap = "round";
    for (let x = 18; x < w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x + 11, h - 12);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(62, 103, 77, 0.34)";
    ctx.beginPath();
    this.level.boundary.forEach((point, index) => {
      const mapped = this.mapPoint(point, w, h);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(190, 218, 199, 0.78)";
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    this.level.boundary.forEach((point, index) => {
      const mapped = this.mapPoint(point, w, h);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.stroke();

    for (const path of this.level.paths) {
      const stroke =
        path.kind === "rail"
          ? "rgba(154, 175, 169, 0.78)"
          : path.surface === "asphalt"
            ? "rgba(113, 156, 159, 0.66)"
            : "rgba(226, 195, 124, 0.78)";
      ctx.strokeStyle = "rgba(5, 15, 18, 0.24)";
      ctx.lineWidth = path.kind === "rail" ? 2.8 : path.kind === "cycleway" ? 2.3 : 2;
      ctx.lineCap = "round";
      ctx.setLineDash(path.kind === "rail" ? [4, 4] : []);
      ctx.beginPath();
      path.points.forEach((point, index) => {
        const mapped = this.mapPoint(point, w, h);
        if (index === 0) ctx.moveTo(mapped.x, mapped.y);
        else ctx.lineTo(mapped.x, mapped.y);
      });
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = path.kind === "rail" ? 1.5 : path.kind === "cycleway" ? 1.25 : 0.95;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const player = this.mapPoint(state.playerPosition, w, h);
    this.drawFacingIndicator(ctx, player, state.playerYaw);

    let visibleZombieCount = 0;
    for (const zombie of state.zombies) {
      if (!state.isVisible(zombie.position, zombie.radius)) {
        continue;
      }
      visibleZombieCount += 1;
      const mapped = this.mapPoint(zombie.position, w, h);
      ctx.fillStyle = "rgba(190, 88, 67, 0.96)";
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(21, 31, 26, 0.82)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(231, 192, 104, 0.94)";
    for (const station of this.level.upgradeStations) {
      const mapped = this.mapPoint(station.position, w, h);
      ctx.fillRect(mapped.x - 2, mapped.y - 2, 4, 4);
    }

    for (const amenity of this.level.amenities) {
      const mapped = this.mapPoint(amenity.position, w, h);
      ctx.fillStyle =
        amenity.kind === "drinking_water" || amenity.kind === "toilets"
          ? "rgba(103, 184, 198, 0.78)"
          : amenity.kind === "bench"
            ? "rgba(112, 180, 139, 0.68)"
            : amenity.kind === "clubroom" ||
                amenity.kind === "changeroom" ||
                amenity.kind === "umpire_room" ||
                amenity.kind === "gatehouse" ||
                amenity.kind === "maintenance_room" ||
                amenity.kind === "community_room" ||
                amenity.kind === "kitchenette" ||
                amenity.kind === "kiosk_hatch" ||
                amenity.kind === "utility_box" ||
                amenity.kind === "memorial_plaque"
              ? "rgba(227, 168, 74, 0.82)"
              : "rgba(213, 142, 67, 0.74)";
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(103, 184, 198, 0.95)";
    for (const drop of state.weaponDrops) {
      const mapped = this.mapPoint(drop.position, w, h);
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(239, 218, 157, 1)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, 4, 0, Math.PI * 2);
    ctx.fill();

    return visibleZombieCount;
  }

  private mapPoint(point: Vec2, width: number, height: number): { x: number; y: number } {
    return {
      x: ((point.x - this.minX) / (this.maxX - this.minX)) * (width - 24) + 12,
      y: ((point.z - this.minZ) / (this.maxZ - this.minZ)) * (height - 24) + 12
    };
  }

  private paintMapGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = "rgba(7, 18, 24, 0.9)";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.54;
    for (const wash of [
      { x: width * 0.34, y: height * 0.32, rx: width * 0.44, ry: height * 0.16, color: "rgba(73, 111, 85, 0.24)", angle: -0.18 },
      { x: width * 0.68, y: height * 0.7, rx: width * 0.36, ry: height * 0.14, color: "rgba(98, 122, 121, 0.18)", angle: 0.22 },
      { x: width * 0.48, y: height * 0.54, rx: width * 0.5, ry: height * 0.12, color: "rgba(224, 190, 111, 0.09)", angle: -0.08 }
    ]) {
      ctx.fillStyle = wash.color;
      ctx.beginPath();
      ctx.ellipse(wash.x, wash.y, wash.rx, wash.ry, wash.angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFacingIndicator(ctx: CanvasRenderingContext2D, player: { x: number; y: number }, playerYaw: number): void {
    const heading = playerForward2D(playerYaw);
    const lengthSquared = heading.x * heading.x + heading.z * heading.z;
    if (lengthSquared < 0.001) return;
    const length = Math.sqrt(lengthSquared);
    const screenHeading = {
      x: heading.x / length,
      y: heading.z / length
    };
    const angle = Math.atan2(screenHeading.y, screenHeading.x);
    const coneRadius = 30;
    const halfAngle = 0.48;

    ctx.fillStyle = "rgba(108, 184, 192, 0.16)";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, coneRadius, angle - halfAngle, angle + halfAngle);
    ctx.closePath();
    ctx.fill();

    const tip = { x: player.x + screenHeading.x * 12, y: player.y + screenHeading.y * 12 };
    const side = { x: -screenHeading.y, y: screenHeading.x };
    ctx.fillStyle = "rgba(239, 218, 157, 1)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(player.x - screenHeading.x * 4 + side.x * 5, player.y - screenHeading.y * 4 + side.y * 5);
    ctx.lineTo(player.x - screenHeading.x * 4 - side.x * 5, player.y - screenHeading.y * 4 - side.y * 5);
    ctx.closePath();
    ctx.fill();
  }
}

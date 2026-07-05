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
    ctx.fillStyle = "rgba(8, 19, 27, 0.92)";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "rgba(148, 178, 176, 0.24)";
    ctx.lineWidth = 0.8;
    for (let x = 16; x < w; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 14, h);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(49, 90, 67, 0.32)";
    ctx.beginPath();
    this.level.boundary.forEach((point, index) => {
      const mapped = this.mapPoint(point, w, h);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(156, 205, 194, 0.82)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    this.level.boundary.forEach((point, index) => {
      const mapped = this.mapPoint(point, w, h);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
    ctx.stroke();

    for (const path of this.level.paths) {
      ctx.strokeStyle =
        path.kind === "rail"
          ? "rgba(142, 163, 161, 0.78)"
          : path.surface === "asphalt"
            ? "rgba(104, 145, 151, 0.62)"
            : "rgba(226, 189, 113, 0.72)";
      ctx.lineWidth = path.kind === "rail" ? 1.7 : path.kind === "cycleway" ? 1.4 : 1.05;
      ctx.setLineDash(path.kind === "rail" ? [4, 4] : []);
      ctx.beginPath();
      path.points.forEach((point, index) => {
        const mapped = this.mapPoint(point, w, h);
        if (index === 0) ctx.moveTo(mapped.x, mapped.y);
        else ctx.lineTo(mapped.x, mapped.y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const player = this.mapPoint(state.playerPosition, w, h);
    this.drawFacingIndicator(ctx, player, state.playerYaw);

    let visibleZombieCount = 0;
    ctx.fillStyle = "rgba(204, 72, 55, 0.95)";
    for (const zombie of state.zombies) {
      if (!state.isVisible(zombie.position, zombie.radius)) {
        continue;
      }
      visibleZombieCount += 1;
      const mapped = this.mapPoint(zombie.position, w, h);
      ctx.beginPath();
      ctx.arc(mapped.x, mapped.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(235, 184, 86, 0.95)";
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

    ctx.fillStyle = "rgba(234, 219, 154, 1)";
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

    ctx.fillStyle = "rgba(103, 184, 198, 0.18)";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, coneRadius, angle - halfAngle, angle + halfAngle);
    ctx.closePath();
    ctx.fill();

    const tip = { x: player.x + screenHeading.x * 12, y: player.y + screenHeading.y * 12 };
    const side = { x: -screenHeading.y, y: screenHeading.x };
    ctx.fillStyle = "rgba(234, 219, 154, 1)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(player.x - screenHeading.x * 4 + side.x * 5, player.y - screenHeading.y * 4 + side.y * 5);
    ctx.lineTo(player.x - screenHeading.x * 4 - side.x * 5, player.y - screenHeading.y * 4 - side.y * 5);
    ctx.closePath();
    ctx.fill();
  }
}

import { describe, expect, it } from "vitest";
import { chooseZombiePickup, chooseZombieWeaponDrop, lootRiskScore, searchAmenityLoot } from "../src/game/loot";
import { SeededRandom } from "../src/game/random";

describe("location and zombie loot", () => {
  it("gives different resource profiles to different park amenities", () => {
    const bbq = searchAmenityLoot("bbq", new SeededRandom(10));
    const bin = searchAmenityLoot("waste_basket", new SeededRandom(10));
    const rack = searchAmenityLoot("bicycle_parking", new SeededRandom(10));

    expect(bbq.ammo).toBeGreaterThan(bin.ammo);
    expect(bbq.health).toBeGreaterThan(0);
    expect(rack.scrap).toBeGreaterThan(bin.scrap);
    expect(rack.bikePump).toBe(true);
    expect(bbq.bikePump).toBe(false);
  });

  it("gives source-backed structure access points distinct utility profiles", () => {
    const changeroom = searchAmenityLoot("changeroom", new SeededRandom(31));
    const umpireRoom = searchAmenityLoot("umpire_room", new SeededRandom(31));
    const gatehouse = searchAmenityLoot("gatehouse", new SeededRandom(31));
    const maintenance = searchAmenityLoot("maintenance_room", new SeededRandom(31));
    const communityRoom = searchAmenityLoot("community_room", new SeededRandom(31));
    const kitchenette = searchAmenityLoot("kitchenette", new SeededRandom(31));
    const kioskHatch = searchAmenityLoot("kiosk_hatch", new SeededRandom(31));
    const utilityBox = searchAmenityLoot("utility_box", new SeededRandom(31));

    expect(changeroom.health + changeroom.medicine).toBeGreaterThan(gatehouse.health + gatehouse.medicine);
    expect(umpireRoom.ammo + umpireRoom.scrap).toBeGreaterThan(communityRoom.ammo + communityRoom.scrap);
    expect(maintenance.scrap).toBeGreaterThan(gatehouse.scrap - 3);
    expect(communityRoom.health + communityRoom.medicine).toBeGreaterThan(maintenance.health);
    expect(kitchenette.health + kitchenette.medicine).toBeGreaterThan(gatehouse.health + gatehouse.medicine);
    expect(kioskHatch.health + kioskHatch.scrap).toBeGreaterThan(communityRoom.scrap);
    expect(utilityBox.scrap).toBeGreaterThan(maintenance.scrap - 3);
    expect(utilityBox.status).toMatch(/floodlights|switchboard/);
    expect(gatehouse.noiseMultiplier).toBeLessThan(maintenance.noiseMultiplier);
    expect(kioskHatch.noiseMultiplier).toBeGreaterThan(communityRoom.noiseMultiplier);
    expect(utilityBox.noiseMultiplier).toBeGreaterThan(kioskHatch.noiseMultiplier);
  });

  it("raises loot quality, noise, and search time in exposed zombie-dense areas", () => {
    const sheltered = searchAmenityLoot("bbq", new SeededRandom(22), { exposed: false, nearbyZombies: 0, wave: 1 });
    const exposed = searchAmenityLoot("bbq", new SeededRandom(22), { exposed: true, nearbyZombies: 4, wave: 7 });

    expect(lootRiskScore({ exposed: true, nearbyZombies: 4, wave: 7 })).toBeGreaterThan(lootRiskScore({ exposed: false, nearbyZombies: 0, wave: 1 }));
    expect(exposed.searchSecondsMultiplier).toBeGreaterThan(sheltered.searchSecondsMultiplier);
    expect(exposed.noiseMultiplier).toBeGreaterThan(sheltered.noiseMultiplier);
    expect(exposed.scrap + exposed.ammo + exposed.health).toBeGreaterThanOrEqual(sheltered.scrap + sheltered.ammo + sheltered.health);
  });

  it("uses zombie role profiles to shape pickup drops", () => {
    const bloaterDrops = Array.from({ length: 80 }, (_, index) => chooseZombiePickup("bloater", new SeededRandom(index + 1))).filter(Boolean);
    const crawlerDrops = Array.from({ length: 80 }, (_, index) => chooseZombiePickup("crawler", new SeededRandom(index + 1))).filter(Boolean);

    expect(bloaterDrops.length).toBeGreaterThan(crawlerDrops.length);
  });

  it("makes combat pickups worth taking without guaranteeing a drop", () => {
    const drops = Array.from({ length: 120 }, (_, index) => chooseZombiePickup("shambler", new SeededRandom(index + 1))).filter(Boolean);
    const ammoDrops = drops.filter((drop) => drop?.type === "ammo");

    expect(drops.length).toBeGreaterThan(40);
    expect(drops.length).toBeLessThan(80);
    expect(ammoDrops.some((drop) => (drop?.amount ?? 0) >= 18)).toBe(true);
  });

  it("keeps weapon drops scarce while allowing stronger late-wave finds", () => {
    const earlyDrops = Array.from({ length: 120 }, (_, index) => chooseZombieWeaponDrop("shambler", 1, new SeededRandom(index + 1))).filter(Boolean);
    const lateDrops = Array.from({ length: 120 }, (_, index) => chooseZombieWeaponDrop("bloater", 8, new SeededRandom(index + 1))).filter(Boolean);

    expect(earlyDrops.length).toBeGreaterThan(0);
    expect(lateDrops.length).toBeGreaterThan(earlyDrops.length);
    expect(lateDrops).toContain("rifle");
  });
});

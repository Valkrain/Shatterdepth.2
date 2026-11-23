import { buildBossSpecialList, countBossPartPixels } from './bossSpecials';
import { getBiomeForDepth, LOOTABLE_WEAPONS } from './catalog';
import { PixelWorld } from './PixelWorld';
import { fbm2D, jitterColor, packColor, SeededRNG, tintColor } from './prng';
import {
  BiomeConfig,
  BiomeId,
  BossBaseStyle,
  BossCoreSlot,
  BossCrownStyle,
  BossHullStyle,
  BossLimbStyle,
  BossParts,
  Enemy,
  EnemyKind,
  HubLightDef,
  HubNpc,
  HubTarget,
  LevelLightDef,
  Mat,
  Pickup,
  PixelBoss,
  Portal,
  RelicPedestal,
  WORLD_H,
  WORLD_W,
} from './types';

export interface GeneratedLevel {
  biome: BiomeConfig;
  spawnX: number;
  spawnY: number;
  portal: Portal;
  enemies: Enemy[];
  pickups: Pickup[];
  pedestals: RelicPedestal[];
  boss: PixelBoss | null;
  levelLights?: LevelLightDef[];
  hubNpcs?: HubNpc[];
  hubTargets?: HubTarget[];
  hubLights?: HubLightDef[];
}

function getBiomeShaftRgb(biome: BiomeConfig): [number, number, number] {
  if (biome.id === 'SUNKEN_MASONRY') {
    return [126, 224, 246];
  }
  if (biome.id === 'ASHEN_FOUNDRY') {
    return [255, 190, 108];
  }
  const [cr, cg, cb] = biome.atmosphere.crystalGlowRgb;
  return [
    Math.min(255, Math.round(cr * 0.72 + 72)),
    Math.min(255, Math.round(cg * 0.72 + 72)),
    Math.min(255, Math.round(cb * 0.72 + 72)),
  ];
}

function getBiomeSconceRgb(biome: BiomeConfig): [number, number, number] {
  if (biome.id === 'SUNKEN_MASONRY') return [255, 198, 114];
  if (biome.id === 'ASHEN_FOUNDRY') return [255, 148, 54];
  return biome.atmosphere.crystalGlowRgb;
}

function addCeilingShaftLight(
  lights: LevelLightDef[],
  world: PixelWorld,
  x: number,
  refY: number,
  rgb: [number, number, number],
  scale = 1
): void {
  const ceil = findCeilingSolidY(world, x, refY, 136);
  const topY = ceil !== null ? Math.max(18, ceil + 8) : Math.max(24, refY - 72);
  lights.push({
    x,
    y: topY,
    radius: Math.round(136 * scale),
    rgb,
    intensity: 0.84,
    volumetric: 0.30,
    castShadows: true,
    rayCount: 64,
  });
  const midY = Math.min(refY - 12, topY + 64);
  if (midY > topY + 18) {
    lights.push({
      x,
      y: midY,
      radius: Math.round(110 * scale),
      rgb,
      intensity: 0.56,
      volumetric: 0.22,
      castShadows: true,
      rayCount: 48,
    });
  }
}

type RoomKind =
  | 'START'
  | 'RUIN'
  | 'BRIDGE'
  | 'SHAFT'
  | 'VAULT'
  | 'CATACOMB'
  | 'FOUNDRY_CHAMBER'
  | 'CRYSTAL_GROTTO'
  | 'GAUNTLET'
  | 'PORTAL';

type PathProfile = 'ASCENDING' | 'DESCENDING' | 'UNDULATING' | 'STEPPED_TIERS' | 'CHASM_CAVERNS';

interface Waypoint {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: RoomKind;
}

export function generateLevel(world: PixelWorld, seed: number, depth: number): GeneratedLevel {
  const levelSeed = (seed ^ (depth * 2654435761)) >>> 0;
  const rng = new SeededRNG(levelSeed);
  const biome = getBiomeForDepth(depth, seed);

  // Leave open cavern air transparent so multi-layer biome parallax shines through chasms & arches
  world.clear(biome.bgSkyTop, biome.bgSkyBottom, true);

  // 1. Base cavern rock, tilted sedimentary strata & mineral fissures
  const noiseScaleX = rng.range(0.007, 0.012);
  const noiseScaleY = rng.range(0.009, 0.014);
  const strataSlope = rng.range(0.025, 0.055) * (rng.chance(0.5) ? 1 : -1);
  const strataFreq = rng.range(0.14, 0.22);

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (x < 4 || x >= WORLD_W - 4 || y < 4 || y >= WORLD_H - 4) {
        const ridge = ((x + y) % 6 === 0) ? 0.85 : ((x ^ y) & 3) === 0 ? 1.12 : 1.0;
        world.setPixel(
          x,
          y,
          Mat.BEDROCK,
          tintColor(jitterColor([32, 35, 42], () => rng.next(), 4), ridge)
        );
        continue;
      }

      const n = fbm2D(x * noiseScaleX, y * noiseScaleY, levelSeed, 3);
      const detail = fbm2D(x * 0.085, y * 0.085, levelSeed + 313, 2);

      // Foreground sedimentary strata bands + fracture seams + quartz/ore flecks
      const strataWave = Math.sin(x * strataSlope + y * strataFreq + n * 6.5);
      const strataBand = strataWave > 0.45 ? 1.11 : strataWave < -0.55 ? 0.88 : 1.0;
      const fissure = Math.abs(detail - 0.5) < 0.026 && n > 0.44;

      if (n > 0.62 && detail > 0.63) {
        const glint = (x + y) % 5 === 0 ? 1.16 : 0.96;
        world.setPixel(
          x,
          y,
          Mat.GOLD,
          tintColor(jitterColor([246, 196, 54], () => rng.next(), 16), glint)
        );
      } else if (n > 0.56 || n <= 0.42) {
        const fleck = detail > 0.78 && ((x * 7 + y * 13) % 19 === 0) ? 1.18 : 1.0;
        const shade = (fissure ? 0.72 : strataBand) * fleck;
        world.setPixel(
          x,
          y,
          Mat.STONE,
          tintColor(jitterColor(biome.stoneBase, () => rng.next(), 8), shade)
        );
      } else {
        // Rich loamy soil with subtle horizontal layering & dark pebbles
        const soilLayer = Math.sin(y * 0.35 + n * 4.0) > 0.3 ? 1.08 : 0.93;
        const pebble = detail < 0.24 && ((x + y * 3) % 11 === 0) ? 0.78 : 1.0;
        world.setPixel(
          x,
          y,
          Mat.DIRT,
          tintColor(jitterColor(biome.dirtBase, () => rng.next(), 9), soilLayer * pebble)
        );
      }
    }
  }

  // Sanctuary / Shop / Rare Event Level every 10 depths ending in 5 (Depth 5, 15, 25...)
  if (depth > 0 && depth % 10 === 5) {
    return generateSanctuaryLevel(world, biome, depth, rng);
  }

  // Boss Floor every 10 depths!
  if (depth > 0 && depth % 10 === 0) {
    return generateBossLevel(world, biome, depth, rng);
  }

  // 2. Varied Macro Path Profile (expanded 1920x512 open multi-route cavern network)
  const profiles: PathProfile[] = ['ASCENDING', 'DESCENDING', 'UNDULATING', 'STEPPED_TIERS', 'CHASM_CAVERNS'];
  const profile = profiles[(depth + rng.int(0, profiles.length - 1)) % profiles.length];
  const waypoints: Waypoint[] = [];
  const numZones = 10;

  let startY = rng.int(Math.round(WORLD_H * 0.42), Math.round(WORLD_H * 0.62));
  if (profile === 'ASCENDING') startY = rng.int(Math.round(WORLD_H * 0.62), WORLD_H - 122);
  else if (profile === 'DESCENDING') startY = rng.int(114, Math.round(WORLD_H * 0.34));
  else if (profile === 'CHASM_CAVERNS') startY = rng.int(Math.round(WORLD_H * 0.36), Math.round(WORLD_H * 0.56));

  waypoints.push({ x: 96, y: startY, w: 144, h: 116, kind: 'START' });

  let curY = startY;
  for (let i = 1; i < numZones - 1; i++) {
    const t = i / (numZones - 1);
    const wx = Math.round(220 + ((i - 0.5) / (numZones - 2)) * (WORLD_W - 440)) + rng.int(-24, 24);

    let targetY = curY;
    if (profile === 'ASCENDING') {
      targetY = curY - rng.int(22, 48) + rng.int(-14, 12);
    } else if (profile === 'DESCENDING') {
      targetY = curY + rng.int(22, 48) + rng.int(-12, 14);
    } else if (profile === 'STEPPED_TIERS') {
      targetY = i % 2 === 1 ? curY + rng.int(-96, -54) : curY + rng.int(54, 96);
    } else if (profile === 'UNDULATING') {
      targetY = Math.round(WORLD_H * 0.5) + Math.round(Math.sin(t * Math.PI * 2.5 + rng.next() * 0.6) * (WORLD_H * 0.24));
    } else {
      // CHASM_CAVERNS
      targetY = curY + rng.int(-76, 76);
    }

    curY = Math.max(114, Math.min(WORLD_H - 122, targetY));
    const kind = pickRoomKind(biome.id, i, rng);
    const baseW = profile === 'CHASM_CAVERNS' ? rng.int(180, 236) : rng.int(152, 204);
    const baseH = profile === 'CHASM_CAVERNS' ? rng.int(138, 178) : rng.int(120, 156);

    waypoints.push({
      x: wx,
      y: curY,
      w: baseW,
      h: baseH,
      kind,
    });
  }

  const portalY =
    profile === 'ASCENDING'
      ? Math.max(112, curY - rng.int(14, 38))
      : profile === 'DESCENDING'
      ? Math.min(WORLD_H - 118, curY + rng.int(14, 38))
      : Math.max(114, Math.min(WORLD_H - 120, curY + rng.int(-48, 48)));

  waypoints.push({ x: WORLD_W - 104, y: portalY, w: 152, h: 122, kind: 'PORTAL' });

  // Carve wide interconnected chambers, generous passages, and open mid-span clearings
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    carveCavernBox(world, wp.x, wp.y - 6, wp.w, wp.h, rng);

    if (i > 0) {
      const prev = waypoints[i - 1];
      carveTunnel(world, prev.x, prev.y, wp.x, wp.y, rng.int(48, 66), rng);

      // Open mid-span cavern clearing so transitions feel airy rather than tubular
      const midX = Math.round((prev.x + wp.x) * 0.5);
      const midY = Math.round((prev.y + wp.y) * 0.5);
      carveCavernBox(world, midX, midY - 4, rng.int(96, 132), rng.int(74, 102), rng);

      // Clean stepping platforms between waypoints for smooth vertical traversal
      const platY = midY + rng.int(-14, 22);
      drawWoodPlank(world, midX - 20, platY, 40, 5, biome, rng);
      drawFoundationPier(world, midX - 20, platY + 4, 8, biome, rng);
    }
  }

  // Carve 3 alternate upper/lower loop passages for open multi-path exploration
  const bypassAnchors = [1, 3, 6];
  for (const bIdx of bypassAnchors) {
    if (bIdx + 2 >= waypoints.length) continue;
    const a = waypoints[bIdx];
    const b = waypoints[bIdx + 2];
    const midX = Math.round((a.x + b.x) * 0.5);
    const avgY = (a.y + b.y) * 0.5;
    const arcOffset = avgY > WORLD_H * 0.5 ? -92 : 92;
    const arcY = Math.max(88, Math.min(WORLD_H - 92, Math.round(avgY + arcOffset)));
    const dia = rng.int(40, 54);
    carveTunnel(world, a.x, a.y, midX, arcY, dia, rng);
    carveTunnel(world, midX, arcY, b.x, b.y, dia, rng);
    carveCavernBox(world, midX, arcY, rng.int(94, 126), rng.int(68, 90), rng);
    drawWoodPlank(world, midX - 18, arcY + 18, 36, 4, biome, rng);
  }

  // Carve 3–4 spacious optional upper/lower side chambers with wide access & destructible masonry gates
  const sideCount = rng.int(3, 4);
  for (let s = 0; s < sideCount; s++) {
    const anchor = waypoints[rng.int(1, waypoints.length - 2)];
    const dirY = anchor.y > WORLD_H * 0.5 ? -1 : 1;
    const sy = Math.max(82, Math.min(WORLD_H - 82, anchor.y + dirY * rng.int(96, 126)));
    const sx = Math.max(120, Math.min(WORLD_W - 120, anchor.x + rng.int(-44, 44)));
    carveCavernBox(world, sx, sy, rng.int(108, 138), rng.int(74, 96), rng);
    carveTunnel(world, anchor.x, anchor.y, sx, sy, rng.int(32, 42), rng);
    drawBrickBlock(world, sx - 16, Math.round((anchor.y + sy) / 2) - 4, 32, 8, biome, rng);
    drawBrickBlock(world, sx - 28, sy + 22, 56, 7, biome, rng);
    drawFoundationPier(world, sx - 28, sy + 28, 10, biome, rng);
    drawFoundationPier(world, sx + 18, sy + 28, 10, biome, rng);
    stampCrystalCluster(world, sx - 18, sy + 21, biome, rng, -1);
    stampGoldVein(world, sx + 14, sy + 12, rng);
    if (rng.chance(0.6)) {
      stampJar(world, sx - 2, sy + 16, rng);
    }
  }

  // Smooth jagged 1–3px craggy rock spikes/outcroppings along cavern borders
  smoothCavernTerrain(world, biome, rng);

  // Flatten spawn & portal stone pedestals with grounded foundation piers
  const spawnWp = waypoints[0];
  const portalWp = waypoints[waypoints.length - 1];
  const spawnFloorY = spawnWp.y + Math.floor(spawnWp.h * 0.34);
  const portalFloorY = portalWp.y + Math.floor(portalWp.h * 0.34);

  carveRect(world, spawnWp.x - 42, spawnFloorY - 62, 84, 62);
  drawBrickBlock(world, spawnWp.x - 36, spawnFloorY, 72, 10, biome, rng);
  drawFoundationPier(world, spawnWp.x - 36, spawnFloorY + 9, 10, biome, rng);
  drawFoundationPier(world, spawnWp.x + 26, spawnFloorY + 9, 10, biome, rng);

  carveRect(world, portalWp.x - 44, portalFloorY - 64, 88, 64);
  drawBrickBlock(world, portalWp.x - 40, portalFloorY, 80, 10, biome, rng);
  drawFoundationPier(world, portalWp.x - 40, portalFloorY + 9, 10, biome, rng);
  drawFoundationPier(world, portalWp.x + 30, portalFloorY + 9, 10, biome, rng);

  decorateCavernSurfaces(world, biome, rng);
  stampSealedLightPockets(world, waypoints, biome, depth, rng);

  // 4. Populate each waypoint room with destructible architecture, traps, and biome-scaled enemies
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  const pedestals: RelicPedestal[] = [];
  const levelLights: LevelLightDef[] = [];
  const shaftRgb = getBiomeShaftRgb(biome);
  const sconceRgb = getBiomeSconceRgb(biome);
  let entityId = 1;

  stampTorch(world, spawnWp.x - 20, spawnFloorY - 1, rng);
  stampTorch(world, spawnWp.x + 20, spawnFloorY - 1, rng);
  stampBanner(world, spawnWp.x - 10, spawnFloorY - 26, biome, rng);
  addCeilingShaftLight(levelLights, world, spawnWp.x, spawnFloorY, shaftRgb, 0.92);
  levelLights.push({
    x: spawnWp.x,
    y: spawnFloorY - 16,
    radius: 76,
    rgb: sconceRgb,
    intensity: 0.78,
    volumetric: 0.16,
    castShadows: true,
    rayCount: 48,
    flickerSpeed: 6.4,
    flickerAmp: 0.06,
  });

  for (let i = 1; i < waypoints.length - 1; i++) {
    const wp = waypoints[i];
    const floorY = wp.y + Math.floor(wp.h * 0.34);

    if (wp.kind === 'BRIDGE') {
      const pitDepth = rng.int(26, 34);
      carveRect(world, wp.x - 48, floorY - 6, 96, pitDepth);
      const bridgeLiquid =
        biome.id === 'ASHEN_FOUNDRY' && rng.chance(0.55) ? Mat.LAVA : biome.liquidPrimary;
      drawVatBasin(world, wp.x - 46, floorY + 8, 92, pitDepth - 14, bridgeLiquid, biome, rng);

      // Grounded masonry abutments + stepped corbels + wide overlapping timber span
      drawBrickBlock(world, wp.x - 60, floorY, 16, 26, biome, rng);
      drawBrickBlock(world, wp.x + 44, floorY, 16, 26, biome, rng);
      drawFoundationPier(world, wp.x - 60, floorY + 25, 16, biome, rng);
      drawFoundationPier(world, wp.x + 44, floorY + 25, 16, biome, rng);
      drawCorbelBracket(world, wp.x - 44, floorY + 4, 1, 6, biome, rng);
      drawCorbelBracket(world, wp.x + 43, floorY + 4, -1, 6, biome, rng);
      drawWoodPlank(world, wp.x - 52, floorY, 104, 4, biome, rng);

      if (rng.chance(0.75)) {
        const bx = wp.x + rng.int(-18, 18);
        const ceilY = findCeilingSolidY(world, bx, wp.y);
        if (ceilY !== null && floorY - ceilY > 56) {
          stampHangingBarrel(world, bx, ceilY - 1, rng.int(12, Math.min(22, floorY - ceilY - 36)), rng);
        }
      }
      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x, floorY - 10, depth));
      if (depth >= 4 && rng.chance(0.55)) {
        enemies.push(makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x + rng.int(-30, 30), wp.y - 22, depth));
      }
    } else if (wp.kind === 'CATACOMB') {
      // Spacious multi-tiered crypt with open arched doorways, load-bearing piers, and wide shelves
      const cw = rng.int(96, 118);
      const cx = wp.x - Math.floor(cw / 2);
      const roofY = floorY - 68;
      paintInteriorBg(world, cx + 2, roofY + 2, cw - 4, 66, biome, rng);

      drawBrickBlock(world, cx - 6, floorY, cw + 12, 8, biome, rng);
      drawFoundationPier(world, cx - 6, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, wp.x - 5, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, cx + cw - 4, floorY + 7, 10, biome, rng);

      // Continuous brick walls connected into roof cap with open ground doorways
      drawBrickBlock(world, cx, roofY + 4, 8, 64, biome, rng);
      drawBrickBlock(world, cx + cw - 8, roofY + 4, 8, 64, biome, rng);
      drawBrickBlock(world, cx - 6, roofY, cw + 12, 7, biome, rng);
      drawCorbelBracket(world, cx + 8, roofY + 7, 1, 5, biome, rng);
      drawCorbelBracket(world, cx + cw - 9, roofY + 7, -1, 5, biome, rng);
      carveArchedDoorway(world, cx, floorY, 8, 28);
      carveArchedDoorway(world, cx + cw - 8, floorY, 8, 28);

      // Wall-anchored side shelves + pillared central sand-hopper platform
      drawWoodPlank(world, cx + 7, floorY - 29, 32, 4, biome, rng);
      drawCorbelBracket(world, cx + 8, floorY - 25, 1, 4, biome, rng);

      drawWoodPlank(world, cx + cw - 39, floorY - 35, 32, 4, biome, rng);
      drawCorbelBracket(world, cx + cw - 9, floorY - 31, -1, 4, biome, rng);

      drawBrickBlock(world, wp.x - 2, floorY - 50, 4, 50, biome, rng);
      drawWoodPlank(world, wp.x - 18, floorY - 52, 36, 3, biome, rng);
      drawSandBed(world, wp.x - 14, floorY - 59, 28, 7, rng);

      stampJar(world, cx + 16, floorY - 35, rng);
      stampJar(world, cx + cw - 28, floorY - 41, rng);
      stampTorch(world, cx + 15, floorY - 1, rng);
      stampBanner(world, wp.x - 14, roofY + 8, biome, rng);

      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x - 16, floorY - 10, depth));
      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), cx + cw - 24, floorY - 43, depth));
    } else if (wp.kind === 'FOUNDRY_CHAMBER') {
      // Spacious steel-framed chamber with contained molten lava crucible vat and high gantry
      const fw = rng.int(98, 122);
      const fx = wp.x - Math.floor(fw / 2);
      paintInteriorBg(world, fx + 2, floorY - 72, fw - 4, 72, biome, rng);
      drawBrickBlock(world, fx, floorY, fw, 8, biome, rng);
      drawFoundationPier(world, fx, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, fx + fw - 10, floorY + 7, 10, biome, rng);

      // Contained central molten lava vat strictly between the steel stanchions
      carveRect(world, wp.x - 21, floorY - 2, 42, 12);
      drawVatBasin(world, wp.x - 21, floorY + 1, 42, 10, Mat.LAVA, biome, rng);

      // Tall heavy steel gantry grounded onto outer masonry & braced with rivets/corbels
      drawMetalBeam(world, fx + 8, floorY - 44, 6, 46, rng);
      drawMetalBeam(world, fx + fw - 14, floorY - 44, 6, 46, rng);
      drawMetalBeam(world, fx + 6, floorY - 46, fw - 12, 5, rng);
      drawCorbelBracket(world, fx + 14, floorY - 41, 1, 5, biome, rng, true);
      drawCorbelBracket(world, fx + fw - 15, floorY - 41, -1, 5, biome, rng, true);

      stampBarrel(world, wp.x - 24, floorY - 54, rng);
      stampBarrel(world, wp.x + 18, floorY - 54, rng);
      const ceilY = findCeilingSolidY(world, wp.x, wp.y);
      if (ceilY !== null && floorY - 46 - ceilY > 34) {
        stampHangingBarrel(world, wp.x, ceilY - 1, Math.min(18, floorY - 46 - ceilY - 22), rng);
      }
      stampTorch(world, fx + 18, floorY - 1, rng);

      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x, floorY - 52, depth));
      enemies.push(makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x + 20, wp.y - 24, depth));
    } else if (wp.kind === 'CRYSTAL_GROTTO') {
      // Wide crystal floor, tall pillared wooden walkway, and ceiling-rooted spire
      drawBrickBlock(world, wp.x - 46, floorY, 92, 8, biome, rng);
      drawFoundationPier(world, wp.x - 46, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, wp.x + 36, floorY + 7, 10, biome, rng);

      drawWoodPlank(world, wp.x - 32, floorY - 34, 4, 34, biome, rng);
      drawWoodPlank(world, wp.x + 28, floorY - 34, 4, 34, biome, rng);
      drawWoodPlank(world, wp.x - 34, floorY - 35, 68, 4, biome, rng);
      drawCorbelBracket(world, wp.x - 28, floorY - 31, 1, 4, biome, rng);
      drawCorbelBracket(world, wp.x + 27, floorY - 31, -1, 4, biome, rng);

      stampCrystalCluster(world, wp.x - 18, floorY - 1, biome, rng, -1);
      stampCrystalCluster(world, wp.x + 18, floorY - 1, biome, rng, -1);
      const ceilY = findCeilingSolidY(world, wp.x, wp.y);
      if (ceilY !== null && floorY - 35 - ceilY > 36) {
        stampCrystalCluster(world, wp.x, ceilY - 1, biome, rng, 1);
      }
      stampGoldVein(world, wp.x, floorY + 12, rng);

      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x - 8, floorY - 42, depth));
      enemies.push(makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x + 18, wp.y - 22, depth));
    } else if (wp.kind === 'GAUNTLET') {
      // Twin grounded brick fortifications + wide braced overhead firing bridge
      drawBrickBlock(world, wp.x - 52, floorY, 104, 8, biome, rng);
      drawFoundationPier(world, wp.x - 52, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, wp.x + 42, floorY + 7, 10, biome, rng);

      drawBrickBlock(world, wp.x - 30, floorY - 32, 9, 33, biome, rng);
      drawBrickBlock(world, wp.x + 21, floorY - 40, 9, 41, biome, rng);
      drawWoodPlank(world, wp.x - 24, floorY - 32, 48, 4, biome, rng);
      drawCorbelBracket(world, wp.x - 21, floorY - 28, 1, 4, biome, rng);
      drawCorbelBracket(world, wp.x + 20, floorY - 28, -1, 4, biome, rng);
      stampBarrel(world, wp.x - 3, floorY - 40, rng);
      stampCrate(world, wp.x - 44, floorY - 8, biome, rng);

      enemies.push(makeEnemy(entityId++, 'TURRET', wp.x + 25, floorY - 48, depth));
      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x - 4, floorY - 10, depth));
    } else if (wp.kind === 'RUIN' || wp.kind === 'VAULT') {
      const rw = rng.int(86, 108);
      const rh = rng.int(64, 76);
      const rx = wp.x - Math.floor(rw / 2);
      const ry = floorY - rh;

      paintInteriorBg(world, rx + 2, ry + 2, rw - 4, rh - 2, biome, rng);
      drawBrickBlock(world, rx - 6, floorY, rw + 12, 8, biome, rng);
      drawFoundationPier(world, rx - 6, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, rx + rw - 4, floorY + 7, 10, biome, rng);

      // Load-bearing masonry walls with open ground-floor arched entryways
      drawBrickBlock(world, rx, ry + 5, 7, rh - 4, biome, rng);
      drawBrickBlock(world, rx + rw - 7, ry + 5, 7, rh - 4, biome, rng);
      drawBrickBlock(world, rx - 6, ry, rw + 12, 7, biome, rng);
      drawCorbelBracket(world, rx + 7, ry + 7, 1, 5, biome, rng);
      drawCorbelBracket(world, rx + rw - 8, ry + 7, -1, 5, biome, rng);
      carveArchedDoorway(world, rx, floorY, 7, 27);
      carveArchedDoorway(world, rx + rw - 7, floorY, 7, 27);
      for (let cx = rx - 4; cx < rx + rw + 2; cx += 12) {
        drawBrickBlock(world, cx, ry - 4, 6, 5, biome, rng);
      }

      // Mid-level timber floor anchored into both walls + central load-bearing strut
      const midY = ry + Math.floor(rh * 0.52);
      drawWoodPlank(world, rx + 5, midY, rw - 10, 4, biome, rng);
      drawCorbelBracket(world, rx + 7, midY + 4, 1, 4, biome, rng);
      drawCorbelBracket(world, rx + rw - 8, midY + 4, -1, 4, biome, rng);
      drawWoodPlank(world, wp.x - 2, midY + 3, 4, floorY - (midY + 3), biome, rng);
      drawWoodPlank(world, rx + 14, ry + 6, 4, midY - (ry + 5), biome, rng);

      stampTorch(world, rx + 14, floorY - 1, rng);
      stampTorch(world, rx + rw - 15, midY - 1, rng);
      stampBanner(world, wp.x - 3, ry + 8, biome, rng);
      stampCrate(world, rx + 20, floorY - 8, biome, rng);
      stampJar(world, rx + rw - 18, floorY - 6, rng);

      if (rng.chance(0.75)) {
        stampBarrel(world, wp.x + rng.int(-8, 10), midY - 8, rng);
      }

      if (wp.kind === 'VAULT') {
        pedestals.push({
          id: entityId++,
          x: wp.x,
          y: floorY - 2,
          used: false,
          weaponOffer: rng.pick(LOOTABLE_WEAPONS),
        });
        stampCrystalCluster(world, rx + 12, midY - 1, biome, rng, -1);
      }

      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x + 10, midY - 10, depth));
      if (rng.chance(0.75)) {
        enemies.push(makeEnemy(entityId++, depth > 1 ? 'TURRET' : pickEnemyKind(depth, biome.id, rng), wp.x - 12, ry - 9, depth));
      }
      if (rng.chance(0.65)) {
        enemies.push(makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x + rng.int(-26, 26), wp.y - 22, depth));
      }
    } else {
      // SHAFT: spacious grounded scaffolding tiers
      drawBrickBlock(world, wp.x - 44, floorY, 88, 8, biome, rng);
      drawFoundationPier(world, wp.x - 44, floorY + 7, 10, biome, rng);
      drawFoundationPier(world, wp.x + 34, floorY + 7, 10, biome, rng);

      drawWoodPlank(world, wp.x - 34, floorY - 28, 4, 28, biome, rng);
      drawWoodPlank(world, wp.x - 10, floorY - 28, 4, 28, biome, rng);
      drawWoodPlank(world, wp.x - 38, floorY - 29, 34, 4, biome, rng);

      drawWoodPlank(world, wp.x + 10, floorY - 48, 4, 48, biome, rng);
      drawWoodPlank(world, wp.x + 34, floorY - 48, 4, 48, biome, rng);
      drawWoodPlank(world, wp.x + 6, floorY - 49, 34, 4, biome, rng);

      stampCrystalCluster(world, wp.x - 20, floorY - 1, biome, rng, -1);
      stampCrate(world, wp.x + 18, floorY - 8, biome, rng);
      stampJar(world, wp.x + 20, floorY - 55, rng);
      enemies.push(makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x, floorY - 10, depth));
      if (rng.chance(0.72)) {
        enemies.push(makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x, floorY - 54, depth));
      }
    }

    // Biome-specific wall sconces, crystal blooms, and ceiling shafts per zone
    if (
      i % 2 === 1 ||
      wp.kind === 'BRIDGE' ||
      wp.kind === 'CRYSTAL_GROTTO' ||
      wp.kind === 'VAULT'
    ) {
      addCeilingShaftLight(levelLights, world, wp.x, floorY, shaftRgb, wp.kind === 'BRIDGE' ? 1.05 : 0.95);
    }

    if (wp.kind === 'GAUNTLET' || wp.kind === 'SHAFT' || wp.kind === 'BRIDGE') {
      stampTorch(world, wp.x - 28, floorY - 1, rng);
      levelLights.push({
        x: wp.x - 28,
        y: floorY - 11,
        radius: 68,
        rgb: sconceRgb,
        intensity: 0.78,
        volumetric: 0.18,
        castShadows: true,
        rayCount: 48,
        flickerSpeed: 6.8 + (i % 3) * 1.1,
        flickerAmp: 0.07,
      });
    } else {
      levelLights.push({
        x: wp.x,
        y: floorY - 18,
        radius: 74,
        rgb: wp.kind === 'CRYSTAL_GROTTO' ? biome.atmosphere.crystalGlowRgb : sconceRgb,
        intensity: 0.76,
        volumetric: 0.19,
        castShadows: true,
        rayCount: 48,
        flickerSpeed: 5.5 + (i % 4),
        flickerAmp: 0.06,
      });
    }

    if (biome.id !== 'ASHEN_FOUNDRY' && wp.kind !== 'CRYSTAL_GROTTO' && rng.chance(0.55)) {
      stampCrystalCluster(world, wp.x + rng.int(-24, 24), floorY - 1, biome, rng, -1);
    }

    // Extra enemy patrols scaling smoothly with depth
    if (depth >= 2 && rng.chance(Math.min(0.85, 0.35 + depth * 0.05))) {
      enemies.push(
        makeEnemy(entityId++, pickEnemyKind(depth, biome.id, rng), wp.x + rng.int(-22, 22), floorY - 12, depth)
      );
    }
    if (depth >= 6 && rng.chance(0.45)) {
      enemies.push(
        makeEnemy(entityId++, pickAerialEnemy(biome.id, rng), wp.x + rng.int(-26, 26), wp.y - 22, depth)
      );
    }
  }

  // Portal shrine frame & skylight beacon
  stampTorch(world, portalWp.x - 22, portalFloorY - 1, rng);
  stampTorch(world, portalWp.x + 22, portalFloorY - 1, rng);
  stampCrystalCluster(world, portalWp.x - 30, portalFloorY - 1, biome, rng, -1);
  stampCrystalCluster(world, portalWp.x + 30, portalFloorY - 1, biome, rng, -1);
  addCeilingShaftLight(levelLights, world, portalWp.x, portalFloorY, shaftRgb, 1.0);

  world.markAllDirty();

  return {
    biome,
    spawnX: spawnWp.x,
    spawnY: spawnFloorY - 16,
    portal: {
      x: portalWp.x,
      y: portalFloorY - 16,
      active: true,
    },
    enemies,
    pickups,
    pedestals,
    boss: null,
    levelLights,
  };
}

function generateBossLevel(
  world: PixelWorld,
  biome: BiomeConfig,
  depth: number,
  rng: SeededRNG
): GeneratedLevel {
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  const pedestals: RelicPedestal[] = [];
  let entityId = 1;

  // 1. Staging Vestibule (left) + Wide Breach Tunnel + Grand Vaulted Boss Arena + Portal Sanctuary (far right)
  const spawnX = 132;
  const spawnFloorY = WORLD_H - 172;
  const arenaMinX = 368;
  const arenaMaxX = WORLD_W - 240;
  const arenaCenterX = Math.round((arenaMinX + arenaMaxX) * 0.5);
  const arenaFloorY = WORLD_H - 96;
  const portalX = WORLD_W - 118;
  const portalFloorY = WORLD_H - 138;

  // Carve Staging Vestibule
  carveCavernBox(world, 156, spawnFloorY - 48, 210, 146, rng);
  // Carve wide connecting breach corridor into Arena
  carveTunnel(world, 224, spawnFloorY - 44, arenaMinX + 42, arenaFloorY - 76, 62, rng);
  // Carve Grand Boss Arena with towering ceiling headroom for colossal bosses
  carveCavernBox(world, arenaCenterX, Math.round(WORLD_H * 0.44), arenaMaxX - arenaMinX + 76, WORLD_H - 116, rng);
  carveRect(world, arenaMinX, 54, arenaMaxX - arenaMinX, arenaFloorY - 54);
  // Carve Portal Sanctuary
  carveTunnel(world, arenaMaxX - 28, arenaFloorY - 62, portalX, portalFloorY - 40, 52, rng);
  carveCavernBox(world, portalX, portalFloorY - 44, 164, 126, rng);

  smoothCavernTerrain(world, biome, rng);

  // Solid Arena Floor + Spawn Ledge + Portal Ledge (grounded into rock)
  carveRect(world, spawnX - 58, spawnFloorY - 72, 130, 72);
  drawBrickBlock(world, spawnX - 66, spawnFloorY, 152, 12, biome, rng);
  drawFoundationPier(world, spawnX - 66, spawnFloorY + 11, 14, biome, rng);
  drawFoundationPier(world, spawnX + 72, spawnFloorY + 11, 14, biome, rng);

  drawBrickBlock(world, arenaMinX - 22, arenaFloorY, arenaMaxX - arenaMinX + 48, 16, biome, rng);
  drawFoundationPier(world, arenaMinX - 22, arenaFloorY + 15, 18, biome, rng);
  drawFoundationPier(world, arenaMaxX + 8, arenaFloorY + 15, 18, biome, rng);

  carveRect(world, portalX - 48, portalFloorY - 68, 96, 68);
  drawBrickBlock(world, portalX - 48, portalFloorY, 96, 12, biome, rng);
  drawFoundationPier(world, portalX - 48, portalFloorY + 11, 12, biome, rng);
  drawFoundationPier(world, portalX + 36, portalFloorY + 11, 12, biome, rng);

  decorateCavernSurfaces(world, biome, rng);

  // Vestibule supplies: weapon pedestal + jars + torches
  pedestals.push({
    id: entityId++,
    x: spawnX + 58,
    y: spawnFloorY - 2,
    used: false,
    weaponOffer: rng.pick(LOOTABLE_WEAPONS),
  });
  stampTorch(world, spawnX - 34, spawnFloorY - 1, rng);
  stampTorch(world, spawnX + 36, spawnFloorY - 1, rng);
  stampJar(world, spawnX - 48, spawnFloorY - 7, rng);
  stampJar(world, spawnX + 86, spawnFloorY - 7, rng);
  stampBanner(world, spawnX + 8, spawnFloorY - 32, biome, rng);

  // Destructible Arena Architecture: Elevated fighting balconies, cover pillars, ceiling-rooted hangers
  const balconyY1 = arenaFloorY - 82;
  const balconyY2 = arenaFloorY - 178;

  // Left fighting balcony
  drawBrickBlock(world, arenaMinX + 54, balconyY1 + 3, 16, 81, biome, rng);
  drawBrickBlock(world, arenaMinX + 186, balconyY1 + 3, 16, 81, biome, rng);
  drawCorbelBracket(world, arenaMinX + 70, balconyY1 + 5, 1, 6, biome, rng);
  drawCorbelBracket(world, arenaMinX + 185, balconyY1 + 5, -1, 6, biome, rng);
  drawWoodPlank(world, arenaMinX + 40, balconyY1, 174, 5, biome, rng);
  stampTorch(world, arenaMinX + 64, balconyY1 - 1, rng);
  stampBarrel(world, arenaMinX + 122, balconyY1 - 9, rng);

  // Right fighting balcony
  drawBrickBlock(world, arenaMaxX - 202, balconyY1 + 3, 16, 81, biome, rng);
  drawBrickBlock(world, arenaMaxX - 70, balconyY1 + 3, 16, 81, biome, rng);
  drawCorbelBracket(world, arenaMaxX - 186, balconyY1 + 5, 1, 6, biome, rng);
  drawCorbelBracket(world, arenaMaxX - 71, balconyY1 + 5, -1, 6, biome, rng);
  drawWoodPlank(world, arenaMaxX - 214, balconyY1, 174, 5, biome, rng);
  stampTorch(world, arenaMaxX - 64, balconyY1 - 1, rng);
  stampBarrel(world, arenaMaxX - 130, balconyY1 - 9, rng);

  // Upper central catwalk suspended from thick riveted steel stanchions rooted into solid ceiling rock
  drawWoodPlank(world, arenaCenterX - 134, balconyY2, 268, 5, biome, rng);
  drawMetalBeam(world, arenaCenterX - 108, 46, 6, balconyY2 - 44, rng);
  drawMetalBeam(world, arenaCenterX + 102, 46, 6, balconyY2 - 44, rng);
  drawCorbelBracket(world, arenaCenterX - 102, balconyY2, 1, 5, biome, rng, true);
  drawCorbelBracket(world, arenaCenterX + 101, balconyY2, -1, 5, biome, rng, true);

  for (const hx of [arenaCenterX - 236, arenaCenterX + 236, arenaCenterX]) {
    const hCeil = findCeilingSolidY(world, hx, 92);
    if (hCeil !== null) {
      stampHangingBarrel(world, hx, hCeil - 1, hx === arenaCenterX ? 22 : 34, rng);
    }
  }

  // Arena floor cover & biome crystal pillars
  drawBrickBlock(world, arenaCenterX - 215, arenaFloorY - 32, 14, 34, biome, rng);
  drawBrickBlock(world, arenaCenterX + 201, arenaFloorY - 32, 14, 34, biome, rng);
  stampCrystalCluster(world, arenaMinX + 26, arenaFloorY - 1, biome, rng, -1);
  stampCrystalCluster(world, arenaMaxX - 28, arenaFloorY - 1, biome, rng, -1);

  // Portal shrine frames
  stampTorch(world, portalX - 24, portalFloorY - 1, rng);
  stampTorch(world, portalX + 24, portalFloorY - 1, rng);
  stampBanner(world, portalX - 28, portalFloorY - 32, biome, rng);
  stampBanner(world, portalX + 28, portalFloorY - 32, biome, rng);

  const levelLights: LevelLightDef[] = [];
  const shaftRgb = getBiomeShaftRgb(biome);
  const sconceRgb = getBiomeSconceRgb(biome);

  // Vestibule & Portal sconces + Grand Arena skylight shafts
  addCeilingShaftLight(levelLights, world, spawnX, spawnFloorY, shaftRgb, 0.9);
  addCeilingShaftLight(levelLights, world, arenaMinX + 165, arenaFloorY, shaftRgb, 1.15);
  addCeilingShaftLight(levelLights, world, arenaCenterX, arenaFloorY, shaftRgb, 1.25);
  addCeilingShaftLight(levelLights, world, arenaMaxX - 165, arenaFloorY, shaftRgb, 1.15);
  addCeilingShaftLight(levelLights, world, portalX, portalFloorY, shaftRgb, 0.95);

  for (const sx of [arenaMinX + 64, arenaCenterX - 130, arenaCenterX + 130, arenaMaxX - 64]) {
    levelLights.push({
      x: sx,
      y: balconyY1 - 12,
      radius: 86,
      rgb: sconceRgb,
      intensity: 0.84,
      volumetric: 0.2,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 6.5,
      flickerAmp: 0.07,
    });
  }

  // Build Colossal Pixel-Based Boss!
  const boss = buildPixelBoss(
    biome,
    depth,
    arenaCenterX + 165,
    arenaFloorY,
    arenaMinX + 48,
    arenaMaxX - 48,
    arenaFloorY,
    entityId++,
    rng
  );

  world.markAllDirty();

  return {
    biome,
    spawnX,
    spawnY: spawnFloorY - 16,
    portal: {
      x: portalX,
      y: portalFloorY - 16,
      active: false, // Sealed until Boss is defeated!
    },
    enemies,
    pickups,
    pedestals,
    boss,
    levelLights,
  };
}

type HullStyle = BossHullStyle;
type CrownStyle = BossCrownStyle;
type LimbStyle = BossLimbStyle;
type BaseStyle = BossBaseStyle;
type CoreSlot = BossCoreSlot;

function buildPixelBoss(
  biome: BiomeConfig,
  depth: number,
  startX: number,
  startY: number,
  arenaMinX: number,
  arenaMaxX: number,
  arenaFloorY: number,
  id: number,
  rng: SeededRNG
): PixelBoss {
  const tier = Math.max(1, Math.floor(depth / 10));
  const maxHp = Math.round(960 * (1 + (tier - 1) * 0.65));

  // Colossal 112x112 boss chassis (~7x taller and ~12x wider than the player)
  const w = 112;
  const h = 112;
  const cx = 56;
  const cy = 56;

  const hullStyle = rng.pick<HullStyle>(['CITADEL', 'BOILER', 'DIAMOND', 'RIBCAGE']);
  const crownStyle = rng.pick<CrownStyle>(
    biome.id === 'ASHEN_FOUNDRY'
      ? ['SMOKESTACKS', 'TURRET_CAP', 'HORNED', 'DOME']
      : biome.id === 'VITRIOL_VAULTS'
      ? ['PRONG_SPIRE', 'DOME', 'HORNED', 'TURRET_CAP']
      : ['HORNED', 'DOME', 'PRONG_SPIRE', 'TURRET_CAP']
  );
  const leftLimb = rng.pick<LimbStyle>([
    'PAULDRON_ARM',
    'CANNON_POD',
    'CRYSTAL_WING',
    'SHIELD_PLATE',
    'CLAW_PINCER',
  ]);
  const rightLimb = rng.chance(0.55)
    ? leftLimb
    : rng.pick<LimbStyle>(['PAULDRON_ARM', 'CANNON_POD', 'CRYSTAL_WING', 'SHIELD_PLATE', 'CLAW_PINCER']);
  const baseStyle = rng.pick<BaseStyle>(
    biome.id === 'VITRIOL_VAULTS'
      ? ['THRUSTER_BELLS', 'SPIKE_KEEL', 'PILLAR_LEGS']
      : ['PILLAR_LEGS', 'TANK_TREADS', 'THRUSTER_BELLS', 'SPIKE_KEEL']
  );
  const coreSlot = rng.pick<CoreSlot>(['CHEST', 'CROWN', 'LEFT_POD', 'RIGHT_POD', 'KEEL']);

  const hw = rng.int(20, 25);
  const hh = rng.int(19, 23);
  const leftMountY = rng.int(42, 58);
  const rightMountY = rng.chance(0.6) ? leftMountY : rng.int(42, 58);

  const mats = new Uint8Array(w * h);
  const colors = new Uint32Array(w * h);
  const isCore = new Uint8Array(w * h);

  const primaryMat: Mat =
    biome.id === 'SUNKEN_MASONRY'
      ? Mat.STONE
      : biome.id === 'ASHEN_FOUNDRY'
      ? Mat.BRICK
      : Mat.CRYSTAL;
  const primaryRgb: [number, number, number] =
    biome.id === 'SUNKEN_MASONRY'
      ? biome.stoneBase
      : biome.id === 'ASHEN_FOUNDRY'
      ? biome.brickBase
      : biome.crystalBase;
  const secondaryMat: Mat =
    biome.id === 'SUNKEN_MASONRY' ? Mat.BRICK : biome.id === 'ASHEN_FOUNDRY' ? Mat.METAL : Mat.STONE;
  const secondaryRgb: [number, number, number] =
    biome.id === 'SUNKEN_MASONRY'
      ? biome.brickBase
      : biome.id === 'ASHEN_FOUNDRY'
      ? [72, 66, 70]
      : biome.stoneBase;
  const trimRgb: [number, number, number] =
    biome.id === 'SUNKEN_MASONRY'
      ? [235, 192, 62]
      : biome.id === 'ASHEN_FOUNDRY'
      ? [240, 128, 48]
      : [110, 232, 148];
  const coreRgb: [number, number, number] =
    biome.id === 'SUNKEN_MASONRY'
      ? [56, 210, 255]
      : biome.id === 'ASHEN_FOUNDRY'
      ? [255, 168, 42]
      : [92, 255, 138];

  const setBossPx = (lx: number, ly: number, mat: Mat, col: number, core = false) => {
    const ix = Math.round(lx);
    const iy = Math.round(ly);
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
    const idx = iy * w + ix;
    mats[idx] = mat;
    colors[idx] = col;
    isCore[idx] = core ? 1 : 0;
  };

  const paintPlatePx = (lx: number, ly: number, isEdge: boolean) => {
    const bevel = ly < cy - 6 ? 1.14 : ly > cy + 8 ? 0.82 : 1.0;
    const panelSeam = lx % 11 === 0 || ly % 10 === 0;
    const rivet = (lx % 11 === 3 || lx % 11 === 8) && (ly % 10 === 3 || ly % 10 === 7);
    const conduit = Math.abs(lx - cx) === 11 && ly % 6 < 4;

    if (isEdge) {
      const col = rivet
        ? jitterColor(trimRgb, () => rng.next(), 8)
        : tintColor(jitterColor([78, 86, 102], () => rng.next(), 8), bevel);
      setBossPx(lx, ly, Mat.METAL, col);
    } else if (conduit) {
      setBossPx(lx, ly, Mat.CRYSTAL, tintColor(jitterColor(coreRgb, () => rng.next(), 8), 0.92));
    } else if (panelSeam) {
      setBossPx(
        lx,
        ly,
        secondaryMat,
        tintColor(jitterColor(secondaryRgb, () => rng.next(), 8), 0.7 * bevel)
      );
    } else if ((lx + ly * 2) % 9 === 0) {
      setBossPx(
        lx,
        ly,
        secondaryMat,
        tintColor(jitterColor(secondaryRgb, () => rng.next(), 8), bevel)
      );
    } else {
      setBossPx(
        lx,
        ly,
        primaryMat,
        tintColor(jitterColor(primaryRgb, () => rng.next(), 10), rivet ? 1.2 * bevel : bevel)
      );
    }
  };

  // 1. Assemble Colossal Torso / Core Chassis
  for (let y = cy - hh; y <= cy + hh; y++) {
    for (let x = cx - hw; x <= cx + hw; x++) {
      const nx = Math.abs(x - cx) / hw;
      const ny = Math.abs(y - cy) / hh;
      let inside = false;
      let edge = false;
      if (hullStyle === 'CITADEL') {
        const cornerCut = nx + ny <= 1.72;
        inside = nx <= 1 && ny <= 1 && cornerCut;
        edge = nx > 0.85 || ny > 0.85 || nx + ny > 1.56;
      } else if (hullStyle === 'BOILER') {
        inside = nx * nx * 0.86 + ny * ny <= 1.04;
        edge = nx * nx * 0.86 + ny * ny > 0.82;
      } else if (hullStyle === 'DIAMOND') {
        inside = nx + ny <= 1.28;
        edge = nx + ny > 1.08;
      } else {
        // RIBCAGE
        const rib = Math.abs(y - cy) % 8 <= 4;
        inside = nx <= 0.62 || (rib && nx <= 1.04);
        edge = nx > 0.86 || (ny > 0.82 && nx < 0.7);
      }
      if (inside) {
        paintPlatePx(x, y, edge);
      }
    }
  }

  // 2. Assemble Towering Head / Crown Segment
  const crownBaseY = cy - hh;
  if (crownStyle === 'HORNED') {
    for (let y = crownBaseY - 22; y <= crownBaseY + 2; y++) {
      for (let x = cx - 20; x <= cx + 20; x++) {
        const ax = Math.abs(x - cx);
        const dy = crownBaseY - y;
        const inHorn = ax >= 10 && ax <= 20 && dy >= (ax - 9) * 1.4 && dy <= 22;
        const inHelm = ax <= 13 && dy <= 14;
        if (inHorn || inHelm) {
          paintPlatePx(x, y, inHorn || dy >= 11);
        }
      }
    }
  } else if (crownStyle === 'SMOKESTACKS') {
    for (let y = crownBaseY - 24; y <= crownBaseY + 2; y++) {
      for (let x = cx - 20; x <= cx + 20; x++) {
        const ax = Math.abs(x - cx);
        const inStack = ax >= 9 && ax <= 16;
        const inDome = ax <= 8 && y >= crownBaseY - 12;
        if (inStack || inDome) {
          const stackGlow = inStack && y <= crownBaseY - 20;
          setBossPx(
            x,
            y,
            stackGlow ? Mat.GOLD : Mat.METAL,
            stackGlow
              ? jitterColor(trimRgb, () => rng.next(), 10)
              : jitterColor([72, 74, 82], () => rng.next(), 8)
          );
        }
      }
    }
  } else if (crownStyle === 'DOME') {
    for (let y = crownBaseY - 20; y <= crownBaseY + 2; y++) {
      for (let x = cx - 17; x <= cx + 17; x++) {
        const d = Math.hypot((x - cx) / 17, (y - crownBaseY) / 20);
        if (d <= 1) {
          const rib = Math.abs(x - cx) === 6 || d > 0.82;
          paintPlatePx(x, y, rib);
        }
      }
    }
  } else if (crownStyle === 'PRONG_SPIRE') {
    for (let y = crownBaseY - 26; y <= crownBaseY + 2; y++) {
      for (let x = cx - 17; x <= cx + 17; x++) {
        const ax = Math.abs(x - cx);
        const dy = crownBaseY - y;
        const centerSpire = ax <= Math.max(0, 7 - Math.floor(dy / 3.4));
        const sideProng = ax >= 11 && ax <= 15 && dy <= 18;
        if (centerSpire || sideProng) {
          setBossPx(
            x,
            y,
            Mat.CRYSTAL,
            tintColor(jitterColor(biome.crystalBase, () => rng.next(), 14), 0.9 + (dy / 26) * 0.3)
          );
        }
      }
    }
  } else {
    // TURRET_CAP
    for (let y = crownBaseY - 17; y <= crownBaseY + 2; y++) {
      for (let x = cx - 15; x <= cx + 15; x++) {
        paintPlatePx(x, y, y <= crownBaseY - 14 || Math.abs(x - cx) >= 13);
      }
    }
    for (let x = cx - 26; x <= cx + 26; x++) {
      if (Math.abs(x - cx) > 14) {
        setBossPx(x, crownBaseY - 11, Mat.METAL, packColor(96, 102, 118));
        setBossPx(x, crownBaseY - 10, Mat.METAL, packColor(72, 78, 92));
        setBossPx(x, crownBaseY - 9, Mat.METAL, packColor(58, 64, 78));
      }
    }
  }

  // Glowing twin optic visor slit across lower helm
  for (let x = cx - 8; x <= cx + 8; x++) {
    if (Math.abs(x - cx) >= 2 && Math.abs(x - cx) <= 6) {
      setBossPx(x, crownBaseY - 5, Mat.CRYSTAL, packColor(255, 240, 180));
      setBossPx(x, crownBaseY - 4, Mat.CRYSTAL, jitterColor(coreRgb, () => rng.next(), 8));
    }
  }

  // 3. Assemble Huge Articulated Left & Right Limb / Wing Modules
  const attachLimb = (side: -1 | 1, style: LimbStyle, mountY: number) => {
    const startX = cx + side * (hw - 2);
    if (style === 'PAULDRON_ARM') {
      for (let dy = -12; dy <= 24; dy++) {
        for (let step = 0; step <= 22; step++) {
          const lx = startX + side * step;
          const ly = mountY + dy;
          const inShoulder = dy <= 4 && step <= 19 && step + Math.max(0, -dy) <= 23;
          const inForearm = dy > 4 && step >= 7 && step <= 18;
          if (inShoulder || inForearm) {
            paintPlatePx(lx, ly, step >= 15 || dy <= -9 || dy >= 21);
          }
        }
      }
    } else if (style === 'CANNON_POD') {
      for (let dy = -10; dy <= 10; dy++) {
        for (let step = 0; step <= 25; step++) {
          const lx = startX + side * step;
          const ly = mountY + dy;
          const isHousing = step <= 14 && Math.abs(dy) <= 9;
          const isTwinBarrel = step > 14 && (Math.abs(dy + 4) <= 2 || Math.abs(dy - 4) <= 2);
          if (isHousing || isTwinBarrel) {
            const isMuzzle = step >= 22;
            setBossPx(
              lx,
              ly,
              isMuzzle ? Mat.GOLD : Mat.METAL,
              isMuzzle
                ? jitterColor(trimRgb, () => rng.next(), 10)
                : jitterColor([74, 82, 98], () => rng.next(), 10)
            );
          }
        }
      }
    } else if (style === 'CRYSTAL_WING') {
      for (let step = 0; step <= 27; step++) {
        const wingHalfH = Math.max(2, Math.round(16 - step * 0.48));
        for (let dy = -wingHalfH; dy <= wingHalfH - 4; dy++) {
          const lx = startX + side * step;
          const ly = mountY + dy - Math.floor(step * 0.38);
          const isRib = step <= 6 || dy === 0;
          setBossPx(
            lx,
            ly,
            isRib ? Mat.METAL : Mat.CRYSTAL,
            isRib
              ? packColor(84, 92, 108)
              : tintColor(jitterColor(biome.crystalBase, () => rng.next(), 14), 0.88 + step * 0.025)
          );
        }
      }
    } else if (style === 'SHIELD_PLATE') {
      for (let dy = -19; dy <= 21; dy++) {
        for (let step = 0; step <= 14; step++) {
          const lx = startX + side * step;
          const ly = mountY + dy;
          if (Math.abs(dy) < 21 - Math.floor(step * 0.65)) {
            const isTrim = step >= 11 || Math.abs(dy) >= 17 - Math.floor(step * 0.65);
            setBossPx(
              lx,
              ly,
              isTrim ? Mat.METAL : Mat.BRICK,
              isTrim
                ? jitterColor([108, 118, 134], () => rng.next(), 8)
                : jitterColor(biome.brickBase, () => rng.next(), 10)
            );
          }
        }
      }
    } else {
      // CLAW_PINCER
      for (let step = 0; step <= 25; step++) {
        for (let dy = -12; dy <= 12; dy++) {
          const isStrut = step <= 12 && Math.abs(dy) <= 5;
          const isJaw = step > 11 && Math.abs(dy) >= 4 && Math.abs(dy) <= 12 - Math.floor((step - 12) * 0.45);
          if (isStrut || isJaw) {
            paintPlatePx(startX + side * step, mountY + dy, step > 17);
          }
        }
      }
    }
  };

  attachLimb(-1, leftLimb, leftMountY);
  attachLimb(1, rightLimb, rightMountY);

  // 4. Assemble Massive Lower Base / Locomotion Segment
  const baseTopY = cy + hh - 2;
  if (baseStyle === 'PILLAR_LEGS') {
    for (let y = baseTopY; y <= h - 2; y++) {
      for (let x = cx - hw; x <= cx + hw; x++) {
        const ax = Math.abs(x - cx);
        const isLeg = ax >= 6 && ax <= Math.min(hw - 1, 20);
        const isBootFlare = y >= h - 8 && ax >= 5 && ax <= Math.min(hw + 3, 23);
        if (isLeg || isBootFlare) {
          paintPlatePx(x, y, y >= h - 7 || ax === 6 || ax >= 19);
        }
      }
    }
  } else if (baseStyle === 'TANK_TREADS') {
    for (let y = baseTopY; y <= h - 2; y++) {
      const treadSpan = y >= h - 16 ? hw + 8 : hw + 2;
      for (let x = cx - treadSpan; x <= cx + treadSpan; x++) {
        const ax = Math.abs(x - cx);
        if (y >= h - 16 || ax >= 6) {
          const isHub = y >= h - 11 && y <= h - 5 && ax % 9 >= 3 && ax % 9 <= 6;
          setBossPx(
            x,
            y,
            Mat.METAL,
            isHub
              ? jitterColor(trimRgb, () => rng.next(), 8)
              : (x + y) % 4 === 0
              ? packColor(48, 52, 60)
              : jitterColor([76, 82, 94], () => rng.next(), 8)
          );
        }
      }
    }
  } else if (baseStyle === 'THRUSTER_BELLS') {
    for (let y = baseTopY; y <= h - 4; y++) {
      const flare = Math.floor((y - baseTopY) * 0.42);
      for (let x = cx - hw - 4; x <= cx + hw + 4; x++) {
        const ax = Math.abs(x - cx);
        const centerBell = ax <= 4 + Math.floor(flare * 0.55);
        const outerBell = ax >= 11 && ax <= 17 + flare;
        if (centerBell || outerBell) {
          const ring = (y - baseTopY) % 6 === 0;
          setBossPx(
            x,
            y,
            ring ? Mat.GOLD : Mat.METAL,
            ring ? jitterColor(trimRgb, () => rng.next(), 8) : jitterColor([80, 92, 110], () => rng.next(), 10)
          );
        }
      }
    }
  } else {
    // SPIKE_KEEL
    for (let y = baseTopY; y <= h - 2; y++) {
      const t = (y - baseTopY) / Math.max(1, h - 2 - baseTopY);
      const halfSpan = Math.max(2, Math.round((hw - 1) * (1 - t * 0.85)));
      for (let x = cx - halfSpan; x <= cx + halfSpan; x++) {
        paintPlatePx(x, y, Math.abs(x - cx) >= halfSpan - 2);
      }
    }
  }

  // 5. Stamp Large Multi-Layered Weak Spot (`isCore`) + Protective Armor Bezel
  let coreCx = cx;
  let coreCy = cy;
  let coreSlotLabel = 'Chest-Core';
  if (coreSlot === 'CROWN') {
    coreCx = cx;
    coreCy = Math.max(16, crownBaseY - 7);
    coreSlotLabel = 'Crown-Node';
  } else if (coreSlot === 'LEFT_POD') {
    coreCx = Math.max(18, cx - hw - 6);
    coreCy = leftMountY;
    coreSlotLabel = 'Port-Reactor';
  } else if (coreSlot === 'RIGHT_POD') {
    coreCx = Math.min(w - 19, cx + hw + 6);
    coreCy = rightMountY;
    coreSlotLabel = 'Starboard-Reactor';
  } else if (coreSlot === 'KEEL') {
    coreCx = cx;
    coreCy = Math.min(h - 14, baseTopY + 5);
    coreSlotLabel = 'Keel-Core';
  }

  const coreShape = rng.pick<'ORB' | 'DIAMOND' | 'SLIT'>(['ORB', 'DIAMOND', 'SLIT']);
  const coreRadius = rng.range(8.5, 10.2);
  for (let y = coreCy - 14; y <= coreCy + 14; y++) {
    for (let x = coreCx - 14; x <= coreCx + 14; x++) {
      const dx = Math.abs(x - coreCx);
      const dy = Math.abs(y - coreCy);
      const d =
        coreShape === 'ORB'
          ? Math.hypot(dx, dy)
          : coreShape === 'DIAMOND'
          ? dx * 0.92 + dy * 0.92
          : Math.max(dx * 1.4, dy * 0.82);

      if (d <= coreRadius) {
        const innerHot = d <= coreRadius * 0.38;
        const glow = 1.04 + (1 - d / coreRadius) * 0.34;
        setBossPx(
          x,
          y,
          Mat.CRYSTAL,
          innerHot
            ? packColor(255, 250, 225)
            : tintColor(jitterColor(coreRgb, () => rng.next(), 12), glow),
          true
        );
      } else if (d <= coreRadius + 3.2 && (y >= coreCy - 2 || x % 3 !== 0)) {
        // Segmented gold/metal protective collar bezel around weak spot
        setBossPx(x, y, Mat.GOLD, jitterColor(trimRgb, () => rng.next(), 10), false);
      }
    }
  }

  let corePixelsTotal = 0;
  let totalPixelsInitial = 0;
  for (let i = 0; i < mats.length; i++) {
    if (mats[i] !== Mat.EMPTY) {
      totalPixelsInitial++;
      if (isCore[i]) corePixelsTotal++;
    }
  }

  let baseTitle = 'Monolith Warden';
  let weakSpotName = 'Sapphire Core';
  if (biome.id === 'ASHEN_FOUNDRY') {
    baseTitle = 'Slag Colossus';
    weakSpotName = 'Furnace Heart';
  } else if (biome.id === 'VITRIOL_VAULTS') {
    baseTitle = 'Sovereign Spire';
    weakSpotName = 'Crystal Nucleus';
  }

  const crownWord: Record<CrownStyle, string> = {
    HORNED: 'Horned',
    SMOKESTACKS: 'Foundry-Stack',
    DOME: 'Vaulted',
    PRONG_SPIRE: 'Spire-Crowned',
    TURRET_CAP: 'Bastion',
  };
  const hullWord: Record<HullStyle, string> = {
    CITADEL: 'Citadel',
    BOILER: 'Juggernaut',
    DIAMOND: 'Prism',
    RIBCAGE: 'Automaton',
  };

  const name = `The ${crownWord[crownStyle]} ${baseTitle}`;
  const subtitle = `${coreSlotLabel} ${hullWord[hullStyle]}`;

  const initialCounts = countBossPartPixels(mats, w, h, cx, hw, crownBaseY, baseTopY);
  const parts: BossParts = {
    hull: hullStyle,
    crown: crownStyle,
    leftLimb,
    rightLimb,
    base: baseStyle,
    coreSlot,
    hw,
    hh,
    leftMountY,
    rightMountY,
    crownBaseY,
    baseTopY,
    initialCounts,
  };
  const specialList = buildBossSpecialList(parts, () => rng.next());

  return {
    id,
    biomeId: biome.id,
    name,
    subtitle,
    weakSpotName,
    x: startX,
    y: startY,
    vx: 0,
    vy: 0,
    w,
    h,
    hp: maxHp,
    maxHp,
    corePixelsRemaining: corePixelsTotal,
    corePixelsTotal,
    totalPixelsInitial,
    mats,
    colors,
    pixelDmg: new Uint8Array(w * h),
    isCore,
    canvasDirty: true,
    facing: -1,
    phaseTimer: 0,
    attackCd: 1.6,
    secondaryCd: 3.4,
    hurtFlash: 0,
    anchorX: startX,
    anchorY: startY,
    arenaMinX,
    arenaMaxX,
    arenaFloorY,
    parts,
    specialList,
    specialIdx: 0,
    specialCd: 2.2,
    telegraphTimer: 0,
    telegraphDuration: 0,
    pendingSpecialId: null,
    pendingTargetX: startX,
    pendingTargetY: startY - 40,
    activeSpecialId: null,
    activeSpecialTimer: 0,
    activeSpecialTick: 0,
    specialDir: -1,
    shieldActiveTimer: 0,
    shieldSide: -1,
    disabledParts: {},
  };
}

function pickRoomKind(biomeId: BiomeId, slotIdx: number, rng: SeededRNG): RoomKind {
  if (slotIdx === 3) return 'VAULT';
  if (biomeId === 'SUNKEN_MASONRY') {
    return rng.pick(['RUIN', 'CATACOMB', 'BRIDGE', 'GAUNTLET', 'SHAFT']);
  }
  if (biomeId === 'ASHEN_FOUNDRY') {
    return rng.pick(['FOUNDRY_CHAMBER', 'BRIDGE', 'GAUNTLET', 'RUIN', 'SHAFT']);
  }
  return rng.pick(['CRYSTAL_GROTTO', 'BRIDGE', 'SHAFT', 'CATACOMB', 'VAULT']);
}

function pickAerialEnemy(biomeId: BiomeId, rng: SeededRNG): EnemyKind {
  if (biomeId === 'ASHEN_FOUNDRY') return rng.chance(0.65) ? 'PYRO_IMP' : 'DRONE';
  if (biomeId === 'VITRIOL_VAULTS') return rng.chance(0.65) ? 'CRYSTAL_WISP' : 'DRONE';
  return rng.chance(0.25) ? 'CRYSTAL_WISP' : 'DRONE';
}

function pickEnemyKind(depth: number, biomeId: BiomeId, rng: SeededRNG): EnemyKind {
  const pool: EnemyKind[] = ['CRAWLER', 'DRONE', 'SLIME'];

  if (biomeId === 'SUNKEN_MASONRY') {
    pool.push('STONE_WARDEN', 'STONE_WARDEN', 'SENTINEL');
    if (depth >= 2) pool.push('TURRET');
  } else if (biomeId === 'ASHEN_FOUNDRY') {
    pool.push('PYRO_IMP', 'PYRO_IMP', 'TURRET');
    if (depth >= 2) pool.push('SENTINEL', 'CRAWLER');
  } else {
    pool.push('CRYSTAL_WISP', 'CRYSTAL_WISP', 'SLIME');
    if (depth >= 2) pool.push('SENTINEL', 'TURRET');
  }

  return rng.pick(pool);
}

function makeEnemy(id: number, kind: EnemyKind, x: number, y: number, depth: number): Enemy {
  const scale = 1 + (depth - 1) * 0.28 + Math.floor(depth / 5) * 0.3;
  switch (kind) {
    case 'STONE_WARDEN':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 13,
        h: 17,
        hp: Math.round(78 * scale),
        maxHp: Math.round(78 * scale),
        facing: -1,
        grounded: false,
        attackCd: 1.5,
        aiTimer: Math.random() * 2,
        hurtFlash: 0,
        goldValue: 20 + depth * 3,
      };
    case 'PYRO_IMP':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 10,
        h: 10,
        hp: Math.round(36 * scale),
        maxHp: Math.round(36 * scale),
        facing: -1,
        grounded: false,
        attackCd: 1.1,
        aiTimer: Math.random() * 3,
        hurtFlash: 0,
        goldValue: 13 + depth * 2,
      };
    case 'CRYSTAL_WISP':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 9,
        h: 11,
        hp: Math.round(40 * scale),
        maxHp: Math.round(40 * scale),
        facing: 1,
        grounded: false,
        attackCd: 1.35,
        aiTimer: Math.random() * 3,
        hurtFlash: 0,
        goldValue: 14 + depth * 2,
      };
    case 'DRONE':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 9,
        h: 7,
        hp: Math.round(28 * scale),
        maxHp: Math.round(28 * scale),
        facing: 1,
        grounded: false,
        attackCd: 1.2,
        aiTimer: Math.random() * 2,
        hurtFlash: 0,
        goldValue: 8 + depth * 2,
      };
    case 'SENTINEL':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 11,
        h: 15,
        hp: Math.round(62 * scale),
        maxHp: Math.round(62 * scale),
        facing: -1,
        grounded: false,
        attackCd: 1.4,
        aiTimer: 0,
        hurtFlash: 0,
        goldValue: 16 + depth * 3,
      };
    case 'SLIME':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 9,
        h: 8,
        hp: Math.round(34 * scale),
        maxHp: Math.round(34 * scale),
        facing: 1,
        grounded: false,
        attackCd: 0.9,
        aiTimer: 0,
        hurtFlash: 0,
        goldValue: 9 + depth * 2,
      };
    case 'TURRET':
      return {
        id,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        w: 9,
        h: 9,
        hp: Math.round(42 * scale),
        maxHp: Math.round(42 * scale),
        facing: -1,
        grounded: false,
        attackCd: 1.6,
        aiTimer: 0,
        hurtFlash: 0,
        goldValue: 12 + depth * 2,
      };
    case 'CRAWLER':
    default:
      return {
        id,
        kind: 'CRAWLER',
        x,
        y,
        vx: 0,
        vy: 0,
        w: 9,
        h: 8,
        hp: Math.round(26 * scale),
        maxHp: Math.round(26 * scale),
        facing: 1,
        grounded: false,
        attackCd: 0.7,
        aiTimer: 0,
        hurtFlash: 0,
        goldValue: 6 + depth * 2,
      };
  }
}

function carveRect(world: PixelWorld, x: number, y: number, w: number, h: number): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    for (let px = x; px < x + w; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      world.setPixel(px, py, Mat.EMPTY, 0);
    }
  }
}

function carveArchedDoorway(
  world: PixelWorld,
  wallX: number,
  floorY: number,
  wallW: number,
  height: number
): void {
  const topY = floorY - height;
  for (let py = topY; py < floorY; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    for (let px = wallX; px < wallX + wallW; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      // Round top outer corners slightly so doorway feels arched
      if (py <= topY + 2 && (px === wallX || px === wallX + wallW - 1)) continue;
      world.setPixel(px, py, Mat.EMPTY, 0);
    }
  }
}

function carveCavernBox(
  world: PixelWorld,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rng: SeededRNG
): void {
  const rx = w * 0.5;
  const ry = h * 0.5;
  const x0 = Math.max(5, Math.floor(cx - rx - 8));
  const x1 = Math.min(WORLD_W - 6, Math.ceil(cx + rx + 8));
  const y0 = Math.max(5, Math.floor(cy - ry - 8));
  const y1 = Math.min(WORLD_H - 6, Math.ceil(cy + ry + 8));
  const noiseSeed = rng.int(1, 99999);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      // Smooth low-frequency undulation instead of sharp craggy spikes
      const macro = (fbm2D(x * 0.022, y * 0.022, noiseSeed, 2) - 0.5) * 0.22;
      const micro = (fbm2D(x * 0.055, y * 0.055, noiseSeed + 71, 1) - 0.5) * 0.06;
      const floorBias = ny > 0.62 ? 0.06 : 0;
      if (nx * nx + ny * ny + macro + micro + floorBias < 1.0) {
        world.setPixel(x, y, Mat.EMPTY, 0);
      }
    }
  }
}

function carveTunnel(
  world: PixelWorld,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  diameter: number,
  rng: SeededRNG
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const s = rng.int(1, 99999);
  const archDir = rng.chance(0.5) ? 1 : -1;
  const archAmp = rng.range(4, 14);
  const minR = Math.max(10, diameter * 0.43);

  for (let i = 0; i <= steps; i += 2) {
    const t = steps === 0 ? 0 : i / steps;
    const mx = x0 + (x1 - x0) * t;
    const my = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * archDir * archAmp;
    const rawR = diameter * 0.5 + (fbm2D(mx * 0.024, my * 0.024, s, 2) - 0.5) * 6;
    const r = Math.max(minR, rawR);
    const ir = Math.ceil(r);
    for (let dy = -ir; dy <= ir; dy++) {
      const py = Math.round(my + dy);
      if (py <= 4 || py >= WORLD_H - 5) continue;
      for (let dx = -ir; dx <= ir; dx++) {
        const px = Math.round(mx + dx);
        if (px <= 4 || px >= WORLD_W - 5) continue;
        if (dx * dx + dy * dy <= r * r) {
          world.setPixel(px, py, Mat.EMPTY, 0);
        }
      }
    }
  }
}

function smoothCavernTerrain(world: PixelWorld, biome: BiomeConfig, rng: SeededRNG): void {
  const mats = world.mat;
  const toClear: number[] = [];
  const toFill: number[] = [];

  for (let pass = 0; pass < 2; pass++) {
    toClear.length = 0;
    toFill.length = 0;

    for (let y = 6; y < WORLD_H - 6; y++) {
      const row = y * WORLD_W;
      for (let x = 6; x < WORLD_W - 6; x++) {
        const idx = row + x;
        const m = mats[idx] as Mat;
        if (m !== Mat.EMPTY && m !== Mat.STONE && m !== Mat.DIRT && m !== Mat.GOLD) continue;

        let empty4 = 0;
        if (mats[idx - 1] === Mat.EMPTY) empty4++;
        if (mats[idx + 1] === Mat.EMPTY) empty4++;
        if (mats[idx - WORLD_W] === Mat.EMPTY) empty4++;
        if (mats[idx + WORLD_W] === Mat.EMPTY) empty4++;

        let empty8 = empty4;
        if (mats[idx - WORLD_W - 1] === Mat.EMPTY) empty8++;
        if (mats[idx - WORLD_W + 1] === Mat.EMPTY) empty8++;
        if (mats[idx + WORLD_W - 1] === Mat.EMPTY) empty8++;
        if (mats[idx + WORLD_W + 1] === Mat.EMPTY) empty8++;

        if (m !== Mat.EMPTY) {
          // Prune jutting 1–2px craggy teeth, rock pins, and floating noise crumbs
          if (empty4 >= 3 || empty8 >= 5) {
            toClear.push(idx);
          }
        } else {
          // Fill isolated 1px pinholes inside solid rock
          if (empty8 <= 1) {
            toFill.push(idx);
          }
        }
      }
    }

    for (let i = 0; i < toClear.length; i++) {
      const idx = toClear[i];
      mats[idx] = Mat.EMPTY;
      world.color[idx] = 0;
    }
    for (let i = 0; i < toFill.length; i++) {
      const idx = toFill[i];
      mats[idx] = Mat.STONE;
      world.color[idx] = jitterColor(biome.stoneBase, () => rng.next(), 8);
    }
  }
}

function drawBrickBlock(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    const localY = py - y;
    const rowIdx = Math.floor(localY / 4);
    const inBrickY = localY % 4;
    const isMortarY = inBrickY === 3;
    for (let px = x; px < x + w; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      const localX = px - x + (rowIdx % 2) * 4;
      const colIdx = Math.floor(localX / 8);
      const inBrickX = localX % 8;
      const isMortarX = inBrickX === 7;

      // Deterministic per-brick variation
      const brickHash = (((colIdx * 73856093) ^ (rowIdx * 19349663)) >>> 0) % 100;
      const brickTone = 0.88 + (brickHash / 100) * 0.24;
      const base = jitterColor(biome.brickBase, () => rng.next(), 6);

      if (isMortarY || isMortarX) {
        world.setPixel(px, py, Mat.BRICK, tintColor(base, 0.56));
      } else {
        let shade = brickTone;
        if (inBrickY === 0 || inBrickX === 0) shade *= 1.14; // top-left brick bevel
        else if (inBrickY === 2 || inBrickX === 6) shade *= 0.84; // bottom-right bevel
        if (brickHash < 14 && inBrickX === 3 && inBrickY === 1) shade *= 0.74; // weathered chip
        world.setPixel(px, py, Mat.BRICK, tintColor(base, shade));
      }
    }
  }
}

function drawMetalBeam(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: SeededRNG
): void {
  const horizontal = w >= h;
  for (let py = y; py < y + h; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    const ly = py - y;
    for (let px = x; px < x + w; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      const lx = px - x;
      const base = jitterColor([84, 93, 108], () => rng.next(), 5);
      let shade = 1.0;

      if (horizontal) {
        if (ly === 0) shade = 1.28; // top flange specular
        else if (ly === h - 1) shade = 0.68; // bottom flange shadow
        else if (ly > 0 && ly < h - 1 && h >= 4) shade = 0.85; // recessed I-beam web
        const isRivet = lx % 8 === 2 && (ly === 1 || ly === Math.floor(h / 2));
        if (isRivet) shade = 1.42;
      } else {
        if (lx === 0) shade = 1.24;
        else if (lx === w - 1) shade = 0.68;
        else if (lx > 0 && lx < w - 1 && w >= 4) shade = 0.86;
        const isRivet = ly % 8 === 2 && (lx === 1 || lx === Math.floor(w / 2));
        if (isRivet) shade = 1.42;
      }

      world.setPixel(px, py, Mat.METAL, tintColor(base, shade));
    }
  }
}

function drawSandBed(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    for (let px = x; px < x + w; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      const ripple = Math.sin(px * 0.45 + py * 0.9) > 0.25 ? 1.1 : 0.92;
      world.setPixel(
        px,
        py,
        Mat.SAND,
        tintColor(jitterColor([206, 174, 106], () => rng.next(), 10), ripple)
      );
    }
  }
}

function drawWoodPlank(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    const ly = py - y;
    for (let px = x; px < x + w; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      const lx = px - x;
      const seam = h >= 4 && ly === Math.floor(h / 2);
      const topTrim = ly === 0;
      const botShade = ly === h - 1;
      const nail = (lx === 2 || lx === w - 3 || lx % 18 === 9) && (ly === 1 || ly === h - 2);
      if (nail) {
        world.setPixel(px, py, Mat.WOOD, packColor(54, 58, 66));
        continue;
      }
      const grain = Math.sin(lx * 0.28 + ly * 1.9) > 0.4 ? 0.86 : 1.04;
      const shade = seam ? 0.66 : topTrim ? 1.18 : botShade ? 0.78 : grain;
      const col = tintColor(jitterColor(biome.woodBase, () => rng.next(), 7), shade);
      world.setPixel(px, py, Mat.WOOD, col);
    }
  }
}

function paintInteriorBg(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py < 0 || py >= WORLD_H) continue;
    const ly = py - y;
    const rowIdx = Math.floor(ly / 5);
    const mortarY = ly % 5 === 4;
    for (let px = x; px < x + w; px++) {
      if (px < 0 || px >= WORLD_W) continue;
      const lx = px - x + (rowIdx % 2) * 5;
      const mortarX = lx % 10 === 9;
      const beam = ly % 16 === 0 || (px - x) % 24 === 0;
      const vignetteY = Math.min(1, ly / 14);
      const factor = beam
        ? 0.28
        : mortarY || mortarX
        ? 0.14
        : (0.19 + (rng.next() - 0.5) * 0.025) * (0.78 + vignetteY * 0.22);
      world.setBgPixel(
        px,
        py,
        packColor(
          biome.brickBase[0] * factor,
          biome.brickBase[1] * factor,
          biome.brickBase[2] * factor
        )
      );
    }
  }
}

function findCeilingSolidY(world: PixelWorld, x: number, startY: number, maxRise = 96): number | null {
  for (let dy = 0; dy <= maxRise; dy++) {
    const y = startY - dy;
    if (y <= 5) return 6;
    const m = world.getMat(x, y);
    if (m === Mat.STONE || m === Mat.DIRT || m === Mat.BRICK || m === Mat.BEDROCK) {
      return y + 1;
    }
  }
  return null;
}

function drawFoundationPier(
  world: PixelWorld,
  x: number,
  topY: number,
  w: number,
  biome: BiomeConfig,
  rng: SeededRNG,
  maxDrop = 68
): void {
  for (let px = x; px < x + w; px++) {
    if (px <= 4 || px >= WORLD_W - 5) continue;
    let solidDepth = 0;
    for (let dy = 0; dy < maxDrop; dy++) {
      const py = topY + dy;
      if (py >= WORLD_H - 4) break;
      const existing = world.getMat(px, py);
      if (existing === Mat.STONE || existing === Mat.DIRT || existing === Mat.BEDROCK) {
        solidDepth++;
        if (solidDepth >= 3) break;
      } else {
        solidDepth = 0;
      }
      const rowIdx = Math.floor(dy / 4);
      const inBrickY = dy % 4;
      const inBrickX = (px - x + (rowIdx % 2) * 3) % 6;
      const isMortar = inBrickY === 3 || inBrickX === 5;
      const edgeHighlight = px === x || inBrickY === 0 ? 1.12 : px === x + w - 1 ? 0.82 : 1.0;
      const base = jitterColor(biome.brickBase, () => rng.next(), 7);
      world.setPixel(px, py, Mat.BRICK, tintColor(base, isMortar ? 0.58 : edgeHighlight));
    }
  }
}

function drawCorbelBracket(
  world: PixelWorld,
  cornerX: number,
  cornerY: number,
  dirX: 1 | -1,
  size: number,
  biome: BiomeConfig,
  rng: SeededRNG,
  useMetal = false
): void {
  for (let row = 0; row < size; row++) {
    const span = size - row;
    for (let s = 0; s < span; s++) {
      const px = cornerX + dirX * s;
      const py = cornerY + row;
      if (px <= 4 || px >= WORLD_W - 5 || py <= 4 || py >= WORLD_H - 5) continue;
      const edge = s === span - 1 ? 0.78 : row === 0 ? 1.12 : 0.92;
      if (useMetal) {
        world.setPixel(px, py, Mat.METAL, tintColor(jitterColor([84, 92, 106], () => rng.next(), 6), edge));
      } else {
        world.setPixel(px, py, Mat.BRICK, tintColor(jitterColor(biome.brickBase, () => rng.next(), 7), edge));
      }
    }
  }
}

function drawVatBasin(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  liquidMat: Mat.WATER | Mat.OIL | Mat.ACID | Mat.LAVA,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  const wallMat = liquidMat === Mat.ACID ? Mat.CRYSTAL : Mat.BRICK;
  const wallRgb = liquidMat === Mat.ACID ? biome.crystalBase : biome.brickBase;

  for (let py = y; py < y + h + 2; py++) {
    if (py <= 4 || py >= WORLD_H - 5) continue;
    for (let px = x - 2; px < x + w + 2; px++) {
      if (px <= 4 || px >= WORLD_W - 5) continue;
      const isLiner = px < x || px >= x + w || py >= y + h;
      if (isLiner) {
        const rim = py === y ? 1.15 : 0.85;
        world.setPixel(px, py, wallMat, tintColor(jitterColor(wallRgb, () => rng.next(), 8), rim));
      } else {
        world.setPixel(px, py, Mat.EMPTY, 0);
      }
    }
  }
  fillLiquidBasin(world, x, y, w, h, liquidMat, rng);
}

function fillLiquidBasin(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  mat: Mat.WATER | Mat.OIL | Mat.ACID | Mat.LAVA,
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    const depthShade = 1.05 - ((py - y) / Math.max(1, h)) * 0.22;
    for (let px = x; px < x + w; px++) {
      if (world.getMat(px, py) !== Mat.EMPTY) continue;
      let col = 0;
      if (mat === Mat.WATER) {
        col = tintColor(jitterColor([44, 140, 224], () => rng.next(), 10, 235), depthShade);
      } else if (mat === Mat.OIL) {
        col = tintColor(jitterColor([32, 26, 38], () => rng.next(), 6, 255), depthShade);
      } else if (mat === Mat.LAVA) {
        col = tintColor(jitterColor([248, 108, 22], () => rng.next(), 18, 255), depthShade);
      } else {
        col = tintColor(jitterColor([74, 230, 96], () => rng.next(), 14, 240), depthShade);
      }
      world.setPixel(px, py, mat, col);
    }
  }
}

function stampTorch(world: PixelWorld, x: number, bottomY: number, _rng: SeededRNG): void {
  // Wrought-iron sconce pedestal with flared ember brazier & glowing coals
  for (let i = 0; i <= 5; i++) {
    world.setPixel(x, bottomY - i, Mat.METAL, i === 0 ? packColor(60, 64, 74) : packColor(84, 90, 102));
  }
  world.setPixel(x - 1, bottomY, Mat.METAL, packColor(66, 72, 82));
  world.setPixel(x + 1, bottomY, Mat.METAL, packColor(54, 58, 68));
  // Brazier cup
  world.setPixel(x - 1, bottomY - 5, Mat.METAL, packColor(102, 108, 120));
  world.setPixel(x + 1, bottomY - 5, Mat.METAL, packColor(74, 80, 92));
  world.setPixel(x - 1, bottomY - 6, Mat.WOOD, packColor(120, 62, 24));
  world.setPixel(x + 1, bottomY - 6, Mat.WOOD, packColor(110, 52, 20));
  world.setPixel(x, bottomY - 6, Mat.TORCH, packColor(255, 225, 110), 1);
  world.setPixel(x, bottomY - 7, Mat.FIRE, packColor(255, 175, 50), 12);
}

function stampBanner(
  world: PixelWorld,
  x: number,
  topY: number,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  const bannerRgb = biome.bannerRgb;

  // Crossbar with brass finials
  world.setPixel(x - 4, topY, Mat.GOLD, packColor(235, 190, 72));
  world.setPixel(x + 4, topY, Mat.GOLD, packColor(215, 170, 58));
  for (let dx = -3; dx <= 3; dx++) {
    world.setPixel(x + dx, topY, Mat.WOOD, packColor(126, 86, 46));
  }
  for (let dy = 1; dy <= 13; dy++) {
    const halfW = dy > 10 ? Math.max(0, 3 - (dy - 10)) : 3;
    for (let dx = -halfW; dx <= halfW; dx++) {
      const isTrim = Math.abs(dx) === halfW && dy < 10;
      const isEmblem = dx === 0 && dy >= 3 && dy <= 7;
      const fold = dx < 0 ? 1.1 : dx > 0 ? 0.88 : 1.0;
      const col = isEmblem
        ? packColor(246, 206, 92)
        : isTrim
        ? tintColor(packColor(bannerRgb[0], bannerRgb[1], bannerRgb[2]), 1.32)
        : tintColor(jitterColor(bannerRgb, () => rng.next(), 8), fold);
      world.setPixel(x + dx, topY + dy, Mat.BANNER, col);
    }
  }
}

function stampCrate(
  world: PixelWorld,
  x: number,
  topY: number,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  const s = 9;
  for (let dy = 0; dy < s; dy++) {
    for (let dx = 0; dx < s; dx++) {
      const isCorner = (dx <= 1 || dx >= s - 2) && (dy <= 1 || dy >= s - 2);
      const isFrame = dx === 0 || dx === s - 1 || dy === 0 || dy === s - 1;
      const isDiag = dx === dy || dx + dy === s - 1;
      const base = jitterColor(biome.woodBase, () => rng.next(), 7);
      if (isCorner && (dx === 0 || dx === s - 1 || dy === 0 || dy === s - 1)) {
        world.setPixel(x + dx, topY + dy, Mat.METAL, packColor(78, 84, 96));
      } else if (isFrame) {
        const bevel = dy === 0 || dx === 0 ? 1.15 : 0.72;
        world.setPixel(x + dx, topY + dy, Mat.WOOD, tintColor(base, bevel));
      } else if (isDiag) {
        world.setPixel(x + dx, topY + dy, Mat.WOOD, tintColor(base, 0.84));
      } else {
        world.setPixel(x + dx, topY + dy, Mat.WOOD, tintColor(base, 0.7));
      }
    }
  }
}

function stampJar(world: PixelWorld, x: number, topY: number, rng: SeededRNG): void {
  const pattern = [
    ' 11111 ',
    '  131  ',
    ' 12221 ',
    '1143211',
    '1432211',
    '1422211',
    ' 12211 ',
    '  111  ',
  ];
  for (let dy = 0; dy < pattern.length; dy++) {
    for (let dx = 0; dx < pattern[dy].length; dx++) {
      const ch = pattern[dy][dx];
      if (ch === ' ') continue;
      if (ch === '3') {
        world.setPixel(x + dx, topY + dy, Mat.GOLD, jitterColor([248, 204, 64], () => rng.next(), 10));
      } else if (ch === '4') {
        // Specular ceramic glint on left curve
        world.setPixel(x + dx, topY + dy, Mat.JAR, packColor(218, 146, 108));
      } else if (ch === '2') {
        world.setPixel(x + dx, topY + dy, Mat.JAR, jitterColor([178, 108, 72], () => rng.next(), 8));
      } else {
        // Rim / shadow
        world.setPixel(x + dx, topY + dy, Mat.JAR, jitterColor([124, 68, 44], () => rng.next(), 8));
      }
    }
  }
}

function stampBarrel(world: PixelWorld, x: number, topY: number, rng: SeededRNG): void {
  for (let dy = 0; dy < 9; dy++) {
    const rowSpan = dy === 0 || dy === 8 ? 1 : 0;
    for (let dx = rowSpan; dx < 7 - rowSpan; dx++) {
      const band = dy === 2 || dy === 6;
      const fuse = dy === 0 && dx === 3;
      const highlight = dx === 1;
      const shadow = dx === 5 || dy === 8;
      if (fuse) {
        world.setPixel(x + dx, topY + dy, Mat.GOLD, packColor(245, 195, 65));
        continue;
      }
      const col = band
        ? packColor(highlight ? 105 : 66, highlight ? 112 : 70, highlight ? 124 : 78)
        : tintColor(
            jitterColor([198, 54, 42], () => rng.next(), 10),
            highlight ? 1.2 : shadow ? 0.74 : 1.0
          );
      world.setPixel(x + dx, topY + dy, Mat.BARREL, col);
    }
  }
}

function stampHangingBarrel(
  world: PixelWorld,
  x: number,
  ceilY: number,
  chainLen: number,
  rng: SeededRNG
): void {
  for (let dy = 0; dy < chainLen; dy++) {
    if (dy % 3 === 0) {
      world.setPixel(x, ceilY + dy, Mat.CHAIN, packColor(148, 156, 168));
    } else {
      world.setPixel(x, ceilY + dy, Mat.CHAIN, packColor(96, 102, 114));
      if (dy % 3 === 1) {
        world.setPixel(x - 1, ceilY + dy, Mat.CHAIN, packColor(118, 124, 136));
      }
    }
  }
  stampBarrel(world, x - 3, ceilY + chainLen, rng);
}

function stampCrystalCluster(
  world: PixelWorld,
  x: number,
  baseY: number,
  biome: BiomeConfig,
  rng: SeededRNG,
  dir: 1 | -1
): void {
  const shardOffsets = [-4, -1, 2, 4];
  for (let s = 0; s < shardOffsets.length; s++) {
    const sx = x + shardOffsets[s];
    const len = s === 1 || s === 2 ? rng.int(10, 15) : rng.int(6, 10);
    const tilt = s < 2 ? -0.18 : 0.18;
    for (let i = 0; i < len; i++) {
      const py = baseY + dir * i;
      const cx = Math.round(sx + i * tilt);
      const halfW = i < len - 3 ? 1 : 0;
      for (let dx = -halfW; dx <= halfW; dx++) {
        const tipGlow = 0.86 + (i / len) * 0.42;
        const facetShade = dx === -halfW ? 1.24 : dx === halfW ? 0.76 : 1.04;
        const base = jitterColor(biome.crystalBase, () => rng.next(), 10);
        const col =
          i >= len - 2
            ? packColor(
                Math.min(255, biome.crystalBase[0] + 70),
                Math.min(255, biome.crystalBase[1] + 70),
                Math.min(255, biome.crystalBase[2] + 70)
              )
            : tintColor(base, tipGlow * facetShade);
        world.setPixel(cx + dx, py, Mat.CRYSTAL, col);
      }
    }
  }
}

function stampGoldVein(world: PixelWorld, cx: number, cy: number, rng: SeededRNG): void {
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      const d2 = dx * dx * 0.55 + dy * dy;
      if (d2 <= 16 && rng.chance(0.78)) {
        const glint = dy < 0 && dx < 0 ? 1.18 : 0.92;
        world.setPixel(
          cx + dx,
          cy + dy,
          Mat.GOLD,
          tintColor(jitterColor([248, 202, 58], () => rng.next(), 14), glint)
        );
      } else if (d2 <= 22 && rng.chance(0.45)) {
        world.setPixel(cx + dx, cy + dy, Mat.STONE, packColor(52, 46, 38));
      }
    }
  }
}

function hasVerticalAir(world: PixelWorld, x: number, startY: number, dir: 1 | -1, required: number): boolean {
  for (let i = 0; i < required; i++) {
    const py = startY + dir * i;
    if (py <= 5 || py >= WORLD_H - 6) return false;
    if (world.getMat(x, py) !== Mat.EMPTY) return false;
  }
  return true;
}

function decorateCavernSurfaces(
  world: PixelWorld,
  biome: BiomeConfig,
  rng: SeededRNG
): void {
  let lastSpireX = -20;
  for (let x = 8; x < WORLD_W - 8; x++) {
    for (let y = 8; y < WORLD_H - 8; y++) {
      const m = world.getMat(x, y);
      if (m === Mat.STONE || m === Mat.DIRT) {
        if (world.getMat(x, y - 1) === Mat.EMPTY && rng.chance(0.32)) {
          world.setPixel(x, y - 1, Mat.MOSS, tintColor(jitterColor(biome.mossBase, () => rng.next(), 14), 1.08));
          if (rng.chance(0.35) && world.getMat(x, y - 2) === Mat.EMPTY) {
            world.setPixel(x, y - 2, Mat.MOSS, tintColor(jitterColor(biome.mossBase, () => rng.next(), 16), 1.18));
          }
          // Rare clean stalagmite only in tall open chambers so feet don't snag in passages
          if (x - lastSpireX > 14 && rng.chance(0.005) && hasVerticalAir(world, x, y - 1, -1, 44)) {
            lastSpireX = x;
            const h = rng.int(3, 6);
            for (let s = 1; s <= h; s++) {
              if (world.getMat(x, y - s) !== Mat.EMPTY) break;
              world.setPixel(x, y - s, Mat.STONE, tintColor(jitterColor(biome.stoneBase, () => rng.next(), 8), 1.08));
            }
          }
        }
        if (world.getMat(x, y + 1) === Mat.EMPTY) {
          // Hanging vines and stalactites only when there is generous vertical clearance below
          if (rng.chance(0.032) && hasVerticalAir(world, x, y + 1, 1, 36)) {
            const vineLen = rng.int(4, 12);
            for (let v = 1; v <= vineLen; v++) {
              if (world.getMat(x, y + v) !== Mat.EMPTY) break;
              const tip = v === vineLen ? 1.24 : 0.96;
              world.setPixel(x, y + v, Mat.MOSS, tintColor(jitterColor(biome.mossBase, () => rng.next(), 12), tip));
            }
          } else if (x - lastSpireX > 10 && rng.chance(0.008) && hasVerticalAir(world, x, y + 1, 1, 46)) {
            lastSpireX = x;
            const stalLen = rng.int(4, 9);
            for (let s = 1; s <= stalLen; s++) {
              if (world.getMat(x, y + s) !== Mat.EMPTY) break;
              world.setPixel(x, y + s, Mat.STONE, jitterColor(biome.stoneBase, () => rng.next(), 8));
              if (s < stalLen * 0.55 && world.getMat(x + 1, y + s) === Mat.EMPTY) {
                world.setPixel(x + 1, y + s, Mat.STONE, tintColor(jitterColor(biome.stoneBase, () => rng.next(), 8), 0.86));
              }
            }
          }
        }
      }
    }
  }
}

function stampSealedLightPockets(
  world: PixelWorld,
  waypoints: Waypoint[],
  biome: BiomeConfig,
  _depth: number,
  rng: SeededRNG
): void {
  // Carve hidden pockets just inside solid rock near waypoint chambers & tunnels so
  // breaching a 5-7px masonry/rock seal dramatically spills trapped lava or crystal light!
  for (let i = 1; i < waypoints.length - 1; i++) {
    const wp = waypoints[i];
    const side = rng.chance(0.5) ? -1 : 1;
    const pocketX = Math.max(48, Math.min(WORLD_W - 48, wp.x + rng.int(-38, 38)));
    const pocketY = Math.max(
      36,
      Math.min(WORLD_H - 36, wp.y + side * Math.round(wp.h * 0.5 + rng.int(18, 28)))
    );

    // Ensure target pocket sits inside solid rock so it stays sealed until excavated
    let solidSamples = 0;
    for (let dy = -12; dy <= 12; dy += 6) {
      for (let dx = -16; dx <= 16; dx += 8) {
        const m = world.getMat(pocketX + dx, pocketY + dy);
        if (m === Mat.STONE || m === Mat.DIRT) solidSamples++;
      }
    }
    if (solidSamples < 14) continue;

    const pw = rng.int(34, 48);
    const ph = rng.int(22, 28);
    const x0 = Math.max(10, pocketX - Math.floor(pw * 0.5));
    const y0 = Math.max(10, pocketY - Math.floor(ph * 0.5));
    paintInteriorBg(world, x0, y0, pw, ph, biome, rng);
    carveRect(world, x0, y0, pw, ph);

    const isMagma =
      biome.id === 'ASHEN_FOUNDRY' ? rng.chance(0.75) : rng.chance(0.32);

    if (isMagma) {
      // Glowing molten magma pocket + gold/stone rim
      fillLiquidBasin(world, x0 + 1, y0 + Math.floor(ph * 0.45), pw - 2, Math.ceil(ph * 0.52), Mat.LAVA, rng);
      stampGoldVein(world, pocketX, y0 + 5, rng);
    } else {
      // Bioluminescent crystal geode pocket + treasure ore
      stampCrystalCluster(world, pocketX - 8, y0 + ph - 1, biome, rng, -1);
      stampCrystalCluster(world, pocketX + 8, y0 + 1, biome, rng, 1);
      stampGoldVein(world, pocketX, y0 + Math.floor(ph * 0.5), rng);
    }

    // Add a thin destructible brick telltale window facing the cavern on half the pockets
    if (rng.chance(0.55)) {
      const sealY = side < 0 ? y0 + ph : y0 - 4;
      drawBrickBlock(world, pocketX - 10, sealY, 20, 4, biome, rng);
    }
  }
}

function generateSanctuaryLevel(
  world: PixelWorld,
  biome: BiomeConfig,
  _depth: number,
  rng: SeededRNG
): GeneratedLevel {
  const enemies: Enemy[] = []; // Zero enemies in sanctuary / shop level!
  const pickups: Pickup[] = [];
  const pedestals: RelicPedestal[] = [];
  let entityId = 1;

  const spawnX = rng.int(120, 180);
  const spawnFloorY = rng.int(WORLD_H - 210, WORLD_H - 165);
  const arenaCenterX = Math.round(WORLD_W * rng.range(0.44, 0.56));
  const arenaFloorY = rng.int(WORLD_H - 135, WORLD_H - 90);
  const portalX = WORLD_W - rng.int(120, 180);
  const portalFloorY = rng.int(WORLD_H - 210, WORLD_H - 165);

  // 1. Procedural Expanded Sanctuary Grotto + Wide Entry/Exit Concourses
  const grottoW = rng.int(1140, 1440);
  const grottoH = rng.int(270, 340);
  const grottoCy = Math.round(WORLD_H * 0.48);
  carveCavernBox(world, arenaCenterX, grottoCy, grottoW, grottoH, rng);
  carveCavernBox(world, spawnX + 20, spawnFloorY - 40, 170, 128, rng);
  carveCavernBox(world, portalX - 20, portalFloorY - 40, 170, 128, rng);
  carveTunnel(world, spawnX + 40, spawnFloorY - 36, arenaCenterX - Math.floor(grottoW * 0.34), arenaFloorY - 48, 56, rng);
  carveTunnel(world, arenaCenterX + Math.floor(grottoW * 0.34), arenaFloorY - 48, portalX - 40, portalFloorY - 36, 56, rng);

  smoothCavernTerrain(world, biome, rng);

  // Guarantee completely open air pockets around spawn and portal exits
  carveRect(world, spawnX - 45, spawnFloorY - 75, 90, 75);
  carveRect(world, portalX - 45, portalFloorY - 75, 90, 75);

  // Grounded flooring
  drawBrickBlock(world, spawnX - 65, spawnFloorY, 150, 12, biome, rng);
  drawFoundationPier(world, spawnX - 65, spawnFloorY + 11, 14, biome, rng);
  drawFoundationPier(world, spawnX + 71, spawnFloorY + 11, 14, biome, rng);

  const mainPlatformW = WORLD_W - rng.int(640, 780);
  drawBrickBlock(world, arenaCenterX - Math.floor(mainPlatformW / 2), arenaFloorY, mainPlatformW, 16, biome, rng);
  drawFoundationPier(world, arenaCenterX - Math.floor(mainPlatformW / 2), arenaFloorY + 15, 18, biome, rng);
  drawFoundationPier(world, arenaCenterX + Math.floor(mainPlatformW / 2) - 18, arenaFloorY + 15, 18, biome, rng);

  drawBrickBlock(world, portalX - 75, portalFloorY, 150, 12, biome, rng);
  drawFoundationPier(world, portalX - 75, portalFloorY + 11, 12, biome, rng);
  drawFoundationPier(world, portalX + 63, portalFloorY + 11, 12, biome, rng);

  // 2. Procedural Upper Balconies / Platforms for vertical platforming
  if (rng.chance(0.85)) {
    const upperY = arenaFloorY - rng.int(64, 92);
    const upperW = rng.int(180, 290);
    drawWoodPlank(world, arenaCenterX - Math.floor(upperW / 2), upperY, upperW, 5, biome, rng);
    drawCorbelBracket(world, arenaCenterX - Math.floor(upperW / 2) + 12, upperY + 4, 1, 5, biome, rng);
    drawCorbelBracket(world, arenaCenterX + Math.floor(upperW / 2) - 16, upperY + 4, -1, 5, biome, rng);
    if (rng.chance(0.65)) {
      stampJar(world, arenaCenterX, upperY - 7, rng);
    }
  }

  decorateCavernSurfaces(world, biome, rng);

  // 3. Procedural Shops, Events & Items (Random 2 to 4 altars/pedestals)
  const altarCount = rng.int(2, 4);
  const altarSpacing = Math.floor(mainPlatformW / (altarCount + 1));
  for (let a = 1; a <= altarCount; a++) {
    const ax = arenaCenterX - Math.floor(mainPlatformW / 2) + a * altarSpacing + rng.int(-18, 18);
    pedestals.push({
      id: entityId++,
      x: ax,
      y: arenaFloorY - 2,
      used: false,
      weaponOffer: rng.pick(LOOTABLE_WEAPONS),
    });
    if (rng.chance(0.5)) {
      stampJar(world, ax + rng.int(-24, 24), arenaFloorY - 7, rng);
    } else {
      stampCrate(world, ax + rng.int(-24, 24), arenaFloorY - 8, biome, rng);
    }
  }

  // 4. Procedural Decorations & Lighting
  const torchCount = rng.int(6, 10);
  for (let t = 0; t < torchCount; t++) {
    const tx = rng.int(100, WORLD_W - 100);
    const ty = rng.int(130, arenaFloorY - 12);
    stampTorch(world, tx, ty, rng);
  }

  const bannerCount = rng.int(3, 6);
  for (let b = 0; b < bannerCount; b++) {
    const bx = rng.int(180, WORLD_W - 180);
    stampBanner(world, bx, arenaFloorY - rng.int(40, 72), biome, rng);
  }

  const clusterCount = rng.int(3, 6);
  for (let c = 0; c < clusterCount; c++) {
    const cx = rng.int(140, WORLD_W - 140);
    stampCrystalCluster(world, cx, arenaFloorY - 1, biome, rng, rng.chance(0.5) ? 1 : -1);
  }

  const levelLights: LevelLightDef[] = [];
  const shaftRgb = getBiomeShaftRgb(biome);
  const sconceRgb = getBiomeSconceRgb(biome);
  addCeilingShaftLight(levelLights, world, spawnX, spawnFloorY, shaftRgb, 0.9);
  addCeilingShaftLight(levelLights, world, arenaCenterX - 240, arenaFloorY, shaftRgb, 1.15);
  addCeilingShaftLight(levelLights, world, arenaCenterX, arenaFloorY, shaftRgb, 1.25);
  addCeilingShaftLight(levelLights, world, arenaCenterX + 240, arenaFloorY, shaftRgb, 1.15);
  addCeilingShaftLight(levelLights, world, portalX, portalFloorY, shaftRgb, 0.95);
  for (let a = 1; a <= altarCount; a++) {
    const ax = arenaCenterX - Math.floor(mainPlatformW / 2) + a * altarSpacing;
    levelLights.push({
      x: ax,
      y: arenaFloorY - 18,
      radius: 78,
      rgb: sconceRgb,
      intensity: 0.82,
      volumetric: 0.2,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 5.2 + a,
      flickerAmp: 0.06,
    });
  }

  world.markAllDirty();

  return {
    biome,
    spawnX,
    spawnY: spawnFloorY - 16,
    portal: {
      x: portalX,
      y: portalFloorY - 16,
      active: true,
    },
    enemies,
    pickups,
    pedestals,
    boss: null,
    levelLights,
  };
}

function drawBastionBrick(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  baseRgb: [number, number, number],
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 3 || py >= WORLD_H - 4) continue;
    const ly = py - y;
    const rowIdx = Math.floor(ly / 4);
    const inBrickY = ly % 4;
    const isMortarY = inBrickY === 3;
    for (let px = x; px < x + w; px++) {
      if (px <= 3 || px >= WORLD_W - 4) continue;
      const lx = px - x + (rowIdx % 2) * 4;
      const colIdx = Math.floor(lx / 8);
      const inBrickX = lx % 8;
      const isMortarX = inBrickX === 7;
      const hash = (((colIdx * 73856093) ^ (rowIdx * 19349663)) >>> 0) % 100;
      const tone = 0.88 + (hash / 100) * 0.24;
      const base = jitterColor(baseRgb, () => rng.next(), 5);
      if (isMortarY || isMortarX) {
        world.setPixel(px, py, Mat.BEDROCK, tintColor(base, 0.56));
      } else {
        let shade = tone;
        if (inBrickY === 0 || inBrickX === 0) shade *= 1.14;
        else if (inBrickY === 2 || inBrickX === 6) shade *= 0.84;
        world.setPixel(px, py, Mat.BEDROCK, tintColor(base, shade));
      }
    }
  }
}

function drawBastionMetal(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  rng: SeededRNG
): void {
  const horizontal = w >= h;
  for (let py = y; py < y + h; py++) {
    if (py <= 3 || py >= WORLD_H - 4) continue;
    const ly = py - y;
    for (let px = x; px < x + w; px++) {
      if (px <= 3 || px >= WORLD_W - 4) continue;
      const lx = px - x;
      const base = jitterColor([76, 84, 98], () => rng.next(), 4);
      let shade = 1.0;
      if (horizontal) {
        if (ly === 0) shade = 1.28;
        else if (ly === h - 1) shade = 0.68;
        else if (h >= 4) shade = 0.86;
        if (lx % 10 === 3 && (ly === 1 || ly === Math.floor(h / 2))) shade = 1.4;
      } else {
        if (lx === 0) shade = 1.24;
        else if (lx === w - 1) shade = 0.68;
        else if (w >= 4) shade = 0.86;
        if (ly % 10 === 3 && (lx === 1 || lx === Math.floor(w / 2))) shade = 1.4;
      }
      world.setPixel(px, py, Mat.BEDROCK, tintColor(base, shade));
    }
  }
}

function drawBastionTimber(
  world: PixelWorld,
  x: number,
  y: number,
  w: number,
  h: number,
  baseRgb: [number, number, number],
  rng: SeededRNG
): void {
  for (let py = y; py < y + h; py++) {
    if (py <= 3 || py >= WORLD_H - 4) continue;
    const ly = py - y;
    for (let px = x; px < x + w; px++) {
      if (px <= 3 || px >= WORLD_W - 4) continue;
      const lx = px - x;
      const isCap = lx < 3 || lx >= w - 3;
      if (isCap) {
        world.setPixel(px, py, Mat.BEDROCK, packColor(ly === 0 ? 110 : 72, ly === 0 ? 118 : 78, ly === 0 ? 132 : 90));
        continue;
      }
      const seam = h >= 4 && ly === Math.floor(h / 2);
      const grain = Math.sin(lx * 0.25 + ly * 1.8) > 0.35 ? 0.86 : 1.04;
      const shade = seam ? 0.68 : ly === 0 ? 1.18 : ly === h - 1 ? 0.78 : grain;
      world.setPixel(px, py, Mat.BEDROCK, tintColor(jitterColor(baseRgb, () => rng.next(), 6), shade));
    }
  }
}

function stampBastionChain(world: PixelWorld, x: number, topY: number, len: number): void {
  for (let dy = 0; dy < len; dy++) {
    const py = topY + dy;
    if (py <= 3 || py >= WORLD_H - 4) break;
    if (dy % 3 === 0) {
      world.setPixel(x, py, Mat.CHAIN, packColor(148, 156, 170));
    } else {
      world.setPixel(x, py, Mat.CHAIN, packColor(88, 94, 108));
      if (dy % 3 === 1) {
        world.setPixel(x - 1, py, Mat.CHAIN, packColor(112, 118, 132));
      }
    }
  }
}

function stampBastionBrazier(world: PixelWorld, x: number, floorY: number): void {
  // Heavy wrought-iron floor pedestal + ember bowl
  for (let dx = -3; dx <= 3; dx++) {
    world.setPixel(x + dx, floorY - 1, Mat.BEDROCK, packColor(68, 74, 86));
  }
  for (let dy = 2; dy <= 5; dy++) {
    world.setPixel(x - 1, floorY - dy, Mat.BEDROCK, packColor(82, 88, 102));
    world.setPixel(x, floorY - dy, Mat.BEDROCK, packColor(96, 102, 116));
    world.setPixel(x + 1, floorY - dy, Mat.BEDROCK, packColor(64, 70, 82));
  }
  // Wide iron fire bowl
  for (let dx = -4; dx <= 4; dx++) {
    const rim = Math.abs(dx) === 4;
    world.setPixel(x + dx, floorY - 6, Mat.BEDROCK, rim ? packColor(118, 124, 138) : packColor(82, 88, 100));
  }
  for (let dx = -3; dx <= 3; dx++) {
    world.setPixel(x + dx, floorY - 7, Mat.BEDROCK, Math.abs(dx) === 3 ? packColor(110, 116, 130) : packColor(58, 34, 22));
  }
  // Glowing hearth coals & perpetual torch flame
  for (let dx = -2; dx <= 2; dx++) {
    world.setPixel(x + dx, floorY - 8, Mat.TORCH, packColor(255, 200, 82), 1);
    world.setPixel(x + dx, floorY - 9, Mat.FIRE, packColor(255, 148, 38), 10);
  }
  world.setPixel(x, floorY - 10, Mat.FIRE, packColor(255, 232, 124), 12);
}

function stampWallSconce(world: PixelWorld, x: number, y: number): void {
  world.setPixel(x, y, Mat.BEDROCK, packColor(102, 108, 122));
  world.setPixel(x, y - 1, Mat.BEDROCK, packColor(124, 130, 144));
  world.setPixel(x - 1, y - 1, Mat.BEDROCK, packColor(82, 88, 100));
  world.setPixel(x + 1, y - 1, Mat.BEDROCK, packColor(82, 88, 100));
  world.setPixel(x, y - 2, Mat.TORCH, packColor(255, 225, 112), 1);
  world.setPixel(x, y - 3, Mat.FIRE, packColor(255, 170, 50), 10);
}

function stampBastionAnvil(world: PixelWorld, x: number, floorY: number): void {
  for (let dx = -4; dx <= 4; dx++) {
    world.setPixel(x + dx, floorY - 1, Mat.BEDROCK, packColor(60, 66, 76));
  }
  for (let dy = 2; dy <= 4; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      world.setPixel(x + dx, floorY - dy, Mat.BEDROCK, packColor(76, 82, 94));
    }
  }
  for (let dx = -5; dx <= 5; dx++) {
    world.setPixel(x + dx, floorY - 5, Mat.BEDROCK, packColor(94, 102, 116));
    world.setPixel(x + dx, floorY - 6, Mat.BEDROCK, dx < 0 ? packColor(126, 134, 148) : packColor(106, 114, 128));
  }
  // Glowing hot ingot resting atop anvil
  world.setPixel(x - 1, floorY - 7, Mat.TORCH, packColor(255, 178, 62), 1);
  world.setPixel(x, floorY - 7, Mat.TORCH, packColor(255, 226, 110), 1);
  world.setPixel(x + 1, floorY - 7, Mat.TORCH, packColor(255, 152, 42), 1);
}

export function generateHubLevel(world: PixelWorld): GeneratedLevel {
  const seed = 999999;
  const rng = new SeededRNG(seed);
  const baseBiome = getBiomeForDepth(2, seed);

  const biome: BiomeConfig = {
    ...baseBiome,
    name: 'Subterranean Bastion',
    atmosphere: {
      ...baseBiome.atmosphere,
      ambientTintRgb: [36, 26, 20],
      lightColorRgb: [255, 188, 92],
      lightRadiusScale: 1.15,
      vignetteRgb: [10, 8, 12],
      vignetteAlpha: 0.48,
      portalHex: '#38BDF8',
    },
    hudPalette: {
      ...baseBiome.hudPalette,
      atmosphereTitle: 'Foundry Bastion',
    },
  };

  // Transparent open air reveals parallax backdrop; protectChains keeps bastion hangers intact
  world.clear(biome.bgSkyTop, biome.bgSkyBottom, true, true);

  const floorY = 408;
  const brickRgb: [number, number, number] = [66, 60, 62];
  const darkBrickRgb: [number, number, number] = [44, 42, 48];
  const timberRgb: [number, number, number] = [112, 74, 44];

  // 1. Bastion Outer Perimeter: Left & Right retaining walls + Vaulted Roof with 3 Open Skylight Shafts
  drawBastionBrick(world, 108, 86, 40, 384, brickRgb, rng);
  drawBastionMetal(world, 144, 92, 5, 340, rng);
  drawBastionBrick(world, 1768, 86, 40, 384, brickRgb, rng);
  drawBastionMetal(world, 1763, 92, 5, 340, rng);

  // Vaulted ceiling segments leaving 3 skylight openings for volumetric shafts:
  // Skylight 1 (Archive): x 320..385
  // Skylight 2 (Central Foundry Chimney): x 920..1005
  // Skylight 3 (East Portal Atrium): x 1625..1705
  drawBastionBrick(world, 148, 88, 172, 26, brickRgb, rng);
  drawBastionMetal(world, 148, 114, 172, 5, rng);

  drawBastionBrick(world, 385, 88, 535, 26, brickRgb, rng);
  drawBastionMetal(world, 385, 114, 535, 5, rng);

  drawBastionBrick(world, 1005, 88, 620, 26, brickRgb, rng);
  drawBastionMetal(world, 1005, 114, 620, 5, rng);

  drawBastionBrick(world, 1705, 88, 60, 26, brickRgb, rng);
  drawBastionMetal(world, 1705, 114, 60, 5, rng);

  // Decorative arched iron struts flanking skylight shafts
  drawBastionMetal(world, 316, 88, 5, 38, rng);
  drawBastionMetal(world, 384, 88, 5, 38, rng);
  drawBastionMetal(world, 916, 88, 5, 42, rng);
  drawBastionMetal(world, 1004, 88, 5, 42, rng);
  drawBastionMetal(world, 1621, 88, 5, 38, rng);
  drawBastionMetal(world, 1704, 88, 5, 38, rng);

  // 2. Main Bastion Foundation Floor & Wing Elevation
  // Ground floor spans smoothly from West Archive -> Central Hearth -> East Expedition Dais
  drawBastionBrick(world, 148, floorY, 1620, 58, brickRgb, rng);
  drawBastionMetal(world, 148, floorY, 1620, 3, rng);

  // West Wing: Quiet Archive Raised Study (floor y = 394, easy 2-step rise at x 428..452)
  drawBastionBrick(world, 148, 394, 282, 16, darkBrickRgb, rng);
  drawBastionTimber(world, 148, 394, 282, 4, timberRgb, rng);
  drawBastionBrick(world, 430, 401, 20, 8, darkBrickRgb, rng);

  // Archive Mezzanine Roof & Overhang Shelf (y = 286)
  drawBastionBrick(world, 148, 284, 284, 12, brickRgb, rng);
  drawBastionMetal(world, 148, 296, 284, 4, rng);
  // Stepping access balcony into Archive upper gallery (y = 338)
  drawBastionTimber(world, 405, 340, 88, 5, timberRgb, rng);
  stampBastionChain(world, 415, 119, 221);
  stampBastionChain(world, 482, 119, 221);
  // Upper Archive Gallery Deck (x 164..330, y = 228) - reach via double jump or step
  drawBastionTimber(world, 164, 232, 172, 5, timberRgb, rng);
  stampBastionChain(world, 180, 119, 113);
  stampBastionChain(world, 315, 119, 113);

  // Wing Divider Pillars (high archways keeping ground path clear!)
  drawBastionBrick(world, 528, 119, 18, 200, brickRgb, rng);
  drawBastionMetal(world, 526, 314, 22, 6, rng);

  // Central Wing: Molten Foundry Furnace Pit safely sealed beneath walkable iron grate deck (x 876..1044)
  for (let x = 876; x < 1044; x++) {
    for (let y = floorY + 5; y < floorY + 34; y++) {
      world.setPixel(x, y, Mat.EMPTY, 0);
    }
  }
  drawBastionBrick(world, 870, floorY + 34, 180, 20, darkBrickRgb, rng);
  drawBastionMetal(world, 870, floorY + 4, 6, 32, rng);
  drawBastionMetal(world, 1044, floorY + 4, 6, 32, rng);
  // Molten foundry lava glowing beneath the walkway grates
  for (let x = 876; x < 1044; x++) {
    for (let y = floorY + 14; y < floorY + 34; y++) {
      world.setPixel(
        x,
        y,
        Mat.LAVA,
        tintColor(jitterColor([252, 112, 24], () => rng.next(), 16), 1.0)
      );
    }
  }
  // Vertical iron furnace grate bars behind walkway
  for (let gx = 888; gx <= 1032; gx += 16) {
    drawBastionMetal(world, gx, floorY + 3, 3, 12, rng);
  }

  // Central Hearth -> Target Range Ascending Catwalks
  drawBastionTimber(world, 558, 356, 112, 5, timberRgb, rng);
  stampBastionChain(world, 568, 119, 237);
  stampBastionChain(world, 658, 119, 237);

  drawBastionTimber(world, 735, 322, 138, 5, timberRgb, rng);
  stampBastionChain(world, 748, 119, 203);
  stampBastionChain(world, 860, 119, 203);

  drawBastionTimber(world, 815, 360, 102, 5, timberRgb, rng);
  stampBastionChain(world, 825, 119, 241);

  // Upper Wing: Firing & Movement Target Range Deck (x 918..1462, deck at y = 304)
  drawBastionMetal(world, 918, 304, 544, 7, rng);
  drawBastionTimber(world, 926, 303, 526, 4, timberRgb, rng);
  // Arched steel support columns with wide 48px-tall ground doorways keeping hallway open!
  stampBastionChain(world, 945, 119, 184);
  stampBastionChain(world, 1160, 119, 184);
  stampBastionChain(world, 1390, 119, 184);
  drawBastionMetal(world, 922, 311, 8, 49, rng);
  drawBastionMetal(world, 916, 355, 20, 5, rng);
  drawBastionMetal(world, 1446, 311, 8, 49, rng);
  drawBastionMetal(world, 1440, 355, 20, 5, rng);

  // Elevated Target Range Perch Catwalk (x 1055..1275, y = 250)
  drawBastionTimber(world, 1055, 250, 220, 5, timberRgb, rng);
  stampBastionChain(world, 1068, 119, 131);
  stampBastionChain(world, 1262, 119, 131);

  // Armored Target Range Backstop Wall at x 1448..1464, y 212..308
  drawBastionBrick(world, 1448, 212, 16, 94, darkBrickRgb, rng);
  drawBastionMetal(world, 1445, 212, 5, 94, rng);

  // East Wing: Expedition Staging & Descent Gate Dais (x 1472..1763, floor y = 396)
  drawBastionBrick(world, 1472, 396, 291, 14, darkBrickRgb, rng);
  drawBastionMetal(world, 1472, 396, 291, 3, rng);
  drawBastionBrick(world, 1456, 402, 18, 7, darkBrickRgb, rng);

  // 3. Props, Banners, Braziers, Sconces & Destructible Range Crates/Jars
  stampBastionAnvil(world, 638, floorY);

  // Braziers across all wings for warm hearth pools & shadow-casting glow
  const brazierSpots: Array<{ x: number; y: number }> = [
    { x: 205, y: 394 },
    { x: 326, y: 394 },
    { x: 472, y: floorY },
    { x: 604, y: floorY },
    { x: 765, y: floorY },
    { x: 862, y: floorY },
    { x: 1058, y: floorY },
    { x: 1215, y: floorY },
    { x: 1380, y: floorY },
    { x: 1585, y: 396 },
    { x: 1732, y: 396 },
    // Upper tier braziers
    { x: 965, y: 303 },
    { x: 1310, y: 303 },
    { x: 1085, y: 250 },
  ];
  for (const bz of brazierSpots) {
    stampBastionBrazier(world, bz.x, bz.y);
  }

  // Elevated wall sconces
  const sconceSpots: Array<{ x: number; y: number }> = [
    { x: 162, y: 356 },
    { x: 405, y: 325 },
    { x: 548, y: 278 },
    { x: 1442, y: 256 },
    { x: 1752, y: 348 },
  ];
  for (const sc of sconceSpots) {
    stampWallSconce(world, sc.x, sc.y);
  }

  // Banners framing the Foundry Hearth, Target Range & East Portal Hall
  stampBanner(world, 537, 134, biome, rng);
  stampBanner(world, 902, 134, biome, rng);
  stampBanner(world, 1018, 134, biome, rng);
  stampBanner(world, 1605, 134, biome, rng);
  stampBanner(world, 1720, 134, biome, rng);

  // Decorative crates & ceramic jars in corners/galleries
  stampCrate(world, 172, 385, biome, rng);
  stampJar(world, 190, 386, rng);
  stampCrate(world, 575, 347, biome, rng);
  stampJar(world, 772, 314, rng);
  stampCrate(world, 1412, 294, biome, rng);

  const spawnX = 815;
  const spawnY = floorY - 16;

  // Interactive Hub Pedestals (preserving IDs 9991 Vault, 9992 Expedition, 9993 Settings)
  const pedestals: RelicPedestal[] = [
    { id: 9993, x: 492, y: floorY - 2, used: false },
    { id: 9991, x: 695, y: floorY - 2, used: false },
    { id: 9992, x: 1525, y: 396 - 2, used: false },
  ];

  // Mysterious Archivist NPC standing quietly in the West Archive Alcove
  const hubNpcs: HubNpc[] = [
    {
      id: 'ARCHIVIST',
      name: 'The Archivist',
      title: 'Keeper of Fractured Annals',
      x: 274,
      y: 394,
      facing: 1,
      idlePhase: 0,
      glowRgb: [165, 226, 240],
      greetCooldown: 0,
      loreReady: false,
    },
  ];

  // Live Target Range Dummies (respawn automatically after destruction)
  const hubTargets: HubTarget[] = [
    { id: 1, x: 1130, y: 303, w: 10, h: 18, hp: 120, maxHp: 120, hitFlash: 0, respawnTimer: 0, label: 'Light Dummy' },
    { id: 2, x: 1245, y: 303, w: 11, h: 19, hp: 260, maxHp: 260, hitFlash: 0, respawnTimer: 0, label: 'Armored Dummy' },
    { id: 3, x: 1190, y: 250, w: 10, h: 18, hp: 150, maxHp: 150, hitFlash: 0, respawnTimer: 0, label: 'High Perch' },
    { id: 4, x: 1370, y: 303, w: 12, h: 20, hp: 450, maxHp: 450, hitFlash: 0, respawnTimer: 0, label: 'Heavy Plating' },
  ];

  // Rich Bastion Lighting Rig (warm braziers, molten foundry hearth, Archivist lantern, volumetric shafts)
  const hubLights: HubLightDef[] = [
    // Braziers (flickering warm amber)
    ...brazierSpots.map((bz, idx) => ({
      x: bz.x,
      y: bz.y - 11,
      radius: idx % 2 === 0 ? 86 : 76,
      rgb: [255, 166, 68] as [number, number, number],
      intensity: 0.92,
      volumetric: 0.24,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 6.2 + (idx % 3) * 1.4,
      flickerAmp: 0.08,
    })),
    // Wall sconces
    ...sconceSpots.map((sc, idx) => ({
      x: sc.x,
      y: sc.y - 4,
      radius: 58,
      rgb: [255, 184, 92] as [number, number, number],
      intensity: 0.72,
      volumetric: 0.16,
      castShadows: true,
      rayCount: 32,
      flickerSpeed: 7.5 + idx,
      flickerAmp: 0.06,
    })),
    // Molten Foundry Hearth underglow
    {
      x: 912,
      y: floorY + 2,
      radius: 105,
      rgb: [255, 114, 38],
      intensity: 1.05,
      volumetric: 0.30,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 4.1,
      flickerAmp: 0.1,
    },
    {
      x: 960,
      y: floorY - 2,
      radius: 118,
      rgb: [255, 134, 48],
      intensity: 1.12,
      volumetric: 0.32,
      castShadows: true,
      rayCount: 64,
      flickerSpeed: 3.6,
      flickerAmp: 0.09,
    },
    {
      x: 1008,
      y: floorY + 2,
      radius: 105,
      rgb: [255, 114, 38],
      intensity: 1.05,
      volumetric: 0.30,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 4.8,
      flickerAmp: 0.1,
    },
    // Volumetric Skylight Shafts pouring down through roof openings
    {
      x: 352,
      y: 126,
      radius: 145,
      rgb: [255, 214, 148],
      intensity: 0.88,
      volumetric: 0.34,
      castShadows: true,
      rayCount: 64,
    },
    {
      x: 358,
      y: 215,
      radius: 120,
      rgb: [255, 206, 138],
      intensity: 0.68,
      volumetric: 0.28,
      castShadows: true,
      rayCount: 48,
    },
    {
      x: 962,
      y: 128,
      radius: 155,
      rgb: [255, 204, 128],
      intensity: 0.94,
      volumetric: 0.36,
      castShadows: true,
      rayCount: 64,
    },
    {
      x: 962,
      y: 230,
      radius: 135,
      rgb: [255, 194, 116],
      intensity: 0.72,
      volumetric: 0.28,
      castShadows: true,
      rayCount: 48,
    },
    {
      x: 1665,
      y: 128,
      radius: 150,
      rgb: [192, 224, 255],
      intensity: 0.84,
      volumetric: 0.32,
      castShadows: true,
      rayCount: 64,
    },
    {
      x: 1665,
      y: 235,
      radius: 125,
      rgb: [186, 220, 255],
      intensity: 0.64,
      volumetric: 0.26,
      castShadows: true,
      rayCount: 48,
    },
    // Target Range overhead flood lamps
    {
      x: 1150,
      y: 205,
      radius: 110,
      rgb: [255, 210, 136],
      intensity: 0.82,
      volumetric: 0.22,
      castShadows: true,
      rayCount: 48,
    },
    {
      x: 1335,
      y: 205,
      radius: 110,
      rgb: [255, 210, 136],
      intensity: 0.82,
      volumetric: 0.22,
      castShadows: true,
      rayCount: 48,
    },
    // Mysterious Archivist soft scholar lantern aura
    {
      x: 282,
      y: 380,
      radius: 68,
      rgb: [174, 230, 245],
      intensity: 0.86,
      volumetric: 0.24,
      castShadows: true,
      rayCount: 48,
      flickerSpeed: 2.8,
      flickerAmp: 0.05,
    },
  ];

  world.markAllDirty();

  return {
    biome,
    spawnX,
    spawnY,
    portal: {
      x: 1665,
      y: 396 - 20,
      active: true,
    },
    enemies: [],
    pickups: [],
    pedestals,
    boss: null,
    levelLights: hubLights,
    hubNpcs,
    hubTargets,
    hubLights,
  };
}


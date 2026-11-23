import { BiomeConfig, DamageType, Mat, WORLD_H, WORLD_W } from './types';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  rgb: [number, number, number];
  intensity: number; // 0..1.4 lightmap additive energy
  volumetric: number; // 0..0.5 screen-space shadow-clipped atmospheric bloom
  castShadows: boolean;
  rayCount?: number;
}

const RAY_COUNTS = [32, 48, 64, 96] as const;
const COS_TABLES = new Map<number, Float32Array>();
const SIN_TABLES = new Map<number, Float32Array>();

for (const count of RAY_COUNTS) {
  const cosArr = new Float32Array(count);
  const sinArr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    cosArr[i] = Math.cos(a);
    sinArr[i] = Math.sin(a);
  }
  COS_TABLES.set(count, cosArr);
  SIN_TABLES.set(count, sinArr);
}

// Solid structural materials that block light and cast shadows.
// Translucent crystal, torches, fire, liquids, moss, chains, banners allow light through.
const OCCLUDER_LUT = new Uint8Array(32);
OCCLUDER_LUT[Mat.BEDROCK] = 1;
OCCLUDER_LUT[Mat.STONE] = 1;
OCCLUDER_LUT[Mat.DIRT] = 1;
OCCLUDER_LUT[Mat.SAND] = 1;
OCCLUDER_LUT[Mat.BRICK] = 1;
OCCLUDER_LUT[Mat.WOOD] = 1;
OCCLUDER_LUT[Mat.METAL] = 1;
OCCLUDER_LUT[Mat.GOLD] = 1;
OCCLUDER_LUT[Mat.ASH] = 1;
OCCLUDER_LUT[Mat.RUBBLE] = 1;
OCCLUDER_LUT[Mat.JAR] = 1;
OCCLUDER_LUT[Mat.BARREL] = 1;

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length === 6) {
    const n = parseInt(clean, 16);
    if (!Number.isNaN(n)) {
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }
  return [248, 190, 88];
}

export function getAmmoLightSpec(
  damageType: DamageType,
  colorHex: string,
  isBomb: boolean,
  age: number,
  timeSec: number
): {
  radius: number;
  rgb: [number, number, number];
  intensity: number;
  volumetric: number;
  castShadows: boolean;
  rayCount: number;
} {
  if (isBomb) {
    const pulse = Math.sin(age * 18) > 0;
    return {
      radius: pulse ? 34 : 26,
      rgb: pulse ? [255, 120, 48] : [251, 191, 36],
      intensity: pulse ? 0.9 : 0.68,
      volumetric: pulse ? 0.24 : 0.14,
      castShadows: true,
      rayCount: 48,
    };
  }

  switch (damageType) {
    case 'PLASMA':
      return {
        radius: 36,
        rgb: [56, 189, 248],
        intensity: 0.94,
        volumetric: 0.26,
        castShadows: true,
        rayCount: 48,
      };
    case 'THERMAL':
      return {
        radius: 26 + Math.sin(timeSec * 24 + age * 14) * 3,
        rgb: [255, 138, 42],
        intensity: 0.8,
        volumetric: 0.2,
        castShadows: true,
        rayCount: 32,
      };
    case 'ARC':
      return {
        radius: 27 + Math.sin(timeSec * 36 + age * 20) * 4,
        rgb: [130, 255, 224],
        intensity: 0.86,
        volumetric: 0.23,
        castShadows: true,
        rayCount: 32,
      };
    case 'CORROSIVE':
      return {
        radius: 27,
        rgb: [74, 232, 120],
        intensity: 0.76,
        volumetric: 0.19,
        castShadows: true,
        rayCount: 32,
      };
    case 'LASER':
      return {
        radius: 30,
        rgb: [253, 224, 71],
        intensity: 0.88,
        volumetric: 0.24,
        castShadows: true,
        rayCount: 32,
      };
    case 'CRYOGENIC':
      return {
        radius: 28,
        rgb: [103, 232, 249],
        intensity: 0.78,
        volumetric: 0.19,
        castShadows: true,
        rayCount: 32,
      };
    case 'SONIC':
      return {
        radius: 25 + Math.sin(age * 22) * 3.5,
        rgb: [192, 132, 252],
        intensity: 0.74,
        volumetric: 0.18,
        castShadows: true,
        rayCount: 32,
      };
    case 'VOID':
      return {
        radius: 42,
        rgb: [139, 130, 248],
        intensity: 0.9,
        volumetric: 0.27,
        castShadows: true,
        rayCount: 48,
      };
    case 'EXPLOSIVE':
      return {
        radius: 26,
        rgb: parseHexRgb(colorHex),
        intensity: 0.74,
        volumetric: 0.18,
        castShadows: true,
        rayCount: 32,
      };
    case 'KINETIC':
    default:
      return {
        radius: 13,
        rgb: parseHexRgb(colorHex),
        intensity: 0.36,
        volumetric: 0.07,
        castShadows: false,
        rayCount: 32,
      };
  }
}

interface EnvBucket {
  lavaCount: number;
  lavaX: number;
  lavaY: number;
  fireCount: number;
  fireX: number;
  fireY: number;
  crystalCount: number;
  crystalX: number;
  crystalY: number;
  acidCount: number;
  acidX: number;
  acidY: number;
}

const MAX_BUCKET_COLS = 32;
const MAX_BUCKET_ROWS = 24;

export class LightingEngine {
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private lightW = 0;
  private lightH = 0;

  // Pre-allocated polygon vertex buffers (max 96 vertices)
  private polyX = new Float32Array(96);
  private polyY = new Float32Array(96);

  // Cache traced polygons per frame so Pass 2 volumetric shafts reuse Pass 1 raycasts
  private cachedPolys: Array<{ len: number; xs: Float32Array; ys: Float32Array }> = [];

  // Reusable grid buckets for scanning visible world light emitters
  private buckets: EnvBucket[] = [];

  constructor() {
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = 384;
    this.lightCanvas.height = 216;
    const ctx = this.lightCanvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to create lighting offscreen canvas');
    this.lightCtx = ctx;

    for (let i = 0; i < MAX_BUCKET_COLS * MAX_BUCKET_ROWS; i++) {
      this.buckets.push({
        lavaCount: 0,
        lavaX: 0,
        lavaY: 0,
        fireCount: 0,
        fireX: 0,
        fireY: 0,
        crystalCount: 0,
        crystalX: 0,
        crystalY: 0,
        acidCount: 0,
        acidX: 0,
        acidY: 0,
      });
    }
  }

  private ensureLightmapSize(w: number, h: number): void {
    const iw = Math.max(64, Math.ceil(w));
    const ih = Math.max(64, Math.ceil(h));
    if (iw !== this.lightW || ih !== this.lightH) {
      this.lightW = iw;
      this.lightH = ih;
      this.lightCanvas.width = iw;
      this.lightCanvas.height = ih;
    }
  }

  collectEnvironmentLights(
    mats: Uint8Array,
    biome: BiomeConfig,
    sx: number,
    sy: number,
    viewSimW: number,
    viewSimH: number,
    timeSec: number,
    outLights: LightSource[]
  ): void {
    const margin = 64;
    const x0 = Math.max(2, Math.floor(sx - margin));
    const y0 = Math.max(2, Math.floor(sy - margin));
    const x1 = Math.min(WORLD_W - 3, Math.ceil(sx + viewSimW + margin));
    const y1 = Math.min(WORLD_H - 3, Math.ceil(sy + viewSimH + margin));

    const bucketSize = 18;
    const cols = Math.min(MAX_BUCKET_COLS, Math.max(1, Math.ceil((x1 - x0 + 1) / bucketSize)));
    const rows = Math.min(MAX_BUCKET_ROWS, Math.max(1, Math.ceil((y1 - y0 + 1) / bucketSize)));
    const totalBuckets = cols * rows;

    for (let i = 0; i < totalBuckets; i++) {
      const b = this.buckets[i];
      b.lavaCount = 0;
      b.lavaX = 0;
      b.lavaY = 0;
      b.fireCount = 0;
      b.fireX = 0;
      b.fireY = 0;
      b.crystalCount = 0;
      b.crystalX = 0;
      b.crystalY = 0;
      b.acidCount = 0;
      b.acidX = 0;
      b.acidY = 0;
    }

    const stride = 3;
    for (let wy = y0; wy <= y1; wy += stride) {
      const by = Math.min(rows - 1, ((wy - y0) / bucketSize) | 0);
      const rowOffset = wy * WORLD_W;
      const bRow = by * cols;

      for (let wx = x0; wx <= x1; wx += stride) {
        const m = mats[rowOffset + wx];
        if (m !== Mat.LAVA && m !== Mat.TORCH && m !== Mat.FIRE && m !== Mat.CRYSTAL && m !== Mat.ACID) {
          continue;
        }
        const bx = Math.min(cols - 1, ((wx - x0) / bucketSize) | 0);
        const b = this.buckets[bRow + bx];

        if (m === Mat.LAVA) {
          b.lavaCount++;
          b.lavaX += wx + 0.5;
          b.lavaY += wy + 0.5;
        } else if (m === Mat.TORCH || m === Mat.FIRE) {
          const weight = m === Mat.TORCH ? 3 : 1;
          b.fireCount += weight;
          b.fireX += (wx + 0.5) * weight;
          b.fireY += (wy + 0.5) * weight;
        } else if (m === Mat.CRYSTAL) {
          b.crystalCount++;
          b.crystalX += wx + 0.5;
          b.crystalY += wy + 0.5;
        } else if (m === Mat.ACID) {
          b.acidCount++;
          b.acidX += wx + 0.5;
          b.acidY += wy + 0.5;
        }
      }
    }

    const viewCx = sx + viewSimW * 0.5;
    const viewCy = sy + viewSimH * 0.5;
    const candidates: Array<{ score: number; light: LightSource }> = [];

    for (let i = 0; i < totalBuckets; i++) {
      const b = this.buckets[i];
      if (b.lavaCount === 0 && b.fireCount === 0 && b.crystalCount === 0 && b.acidCount === 0) {
        continue;
      }

      if (b.lavaCount > 0) {
        const lx = b.lavaX / b.lavaCount;
        const ly = b.lavaY / b.lavaCount;
        const flick = 0.92 + 0.08 * Math.sin(timeSec * 4.8 + i * 1.7);
        const rad = Math.min(72, 40 + b.lavaCount * 1.4) * flick;
        const dist = Math.hypot(lx - viewCx, ly - viewCy);
        candidates.push({
          score: 140 - dist * 0.45 + b.lavaCount * 2,
          light: {
            x: lx,
            y: ly,
            radius: rad,
            rgb: [255, 118, 28],
            intensity: Math.min(1.12, 0.78 + b.lavaCount * 0.03) * flick,
            volumetric: 0.25,
            castShadows: true,
            rayCount: 48,
          },
        });
      }

      if (b.fireCount > 0) {
        const lx = b.fireX / b.fireCount;
        const ly = b.fireY / b.fireCount;
        const flick =
          0.9 +
          0.07 * Math.sin(timeSec * 12.4 + i * 2.3) +
          0.04 * Math.sin(timeSec * 23.1 + i * 0.9);
        const rad = Math.min(64, 38 + b.fireCount * 1.6) * flick;
        const dist = Math.hypot(lx - viewCx, ly - viewCy);
        candidates.push({
          score: 120 - dist * 0.45 + b.fireCount * 1.5,
          light: {
            x: lx,
            y: ly,
            radius: rad,
            rgb: [255, 162, 54],
            intensity: Math.min(1.05, 0.78 + b.fireCount * 0.03) * flick,
            volumetric: 0.22,
            castShadows: true,
            rayCount: 48,
          },
        });
      }

      if (b.crystalCount >= 2) {
        const lx = b.crystalX / b.crystalCount;
        const ly = b.crystalY / b.crystalCount;
        const pulse = 0.94 + 0.06 * Math.sin(timeSec * 3.1 + i * 1.9);
        const rad = Math.min(62, 32 + b.crystalCount * 1.45) * pulse;
        const dist = Math.hypot(lx - viewCx, ly - viewCy);
        candidates.push({
          score: 102 - dist * 0.42 + b.crystalCount * 1.35,
          light: {
            x: lx,
            y: ly,
            radius: rad,
            rgb: biome.atmosphere.crystalGlowRgb,
            intensity: Math.min(0.96, 0.62 + b.crystalCount * 0.04) * pulse,
            volumetric: 0.21,
            castShadows: true,
            rayCount: 48,
          },
        });
      }

      if (b.acidCount >= 3) {
        const lx = b.acidX / b.acidCount;
        const ly = b.acidY / b.acidCount;
        const pulse = 0.93 + 0.07 * Math.sin(timeSec * 4.2 + i * 2.7);
        const rad = Math.min(48, 26 + b.acidCount * 0.9) * pulse;
        const dist = Math.hypot(lx - viewCx, ly - viewCy);
        candidates.push({
          score: 74 - dist * 0.45 + b.acidCount,
          light: {
            x: lx,
            y: ly,
            radius: rad,
            rgb: [72, 235, 112],
            intensity: Math.min(0.74, 0.48 + b.acidCount * 0.025),
            volumetric: 0.16,
            castShadows: true,
            rayCount: 32,
          },
        });
      }
    }

    if (candidates.length > 30) {
      candidates.sort((a, b) => b.score - a.score);
      candidates.length = 30;
    }

    for (let i = 0; i < candidates.length; i++) {
      outLights.push(candidates[i].light);
    }
  }

  private traceVisibilityPolygon(
    mats: Uint8Array,
    lx: number,
    ly: number,
    radius: number,
    rayCount: number,
    outX: Float32Array,
    outY: Float32Array
  ): number {
    const safeCount =
      rayCount >= 96 ? 96 : rayCount >= 64 ? 64 : rayCount >= 48 ? 48 : 32;
    const cosArr = COS_TABLES.get(safeCount)!;
    const sinArr = SIN_TABLES.get(safeCount)!;

    let ox = lx;
    let oy = ly;
    const ix0 = Math.round(ox);
    const iy0 = Math.round(oy);

    // If emitter sits right on the edge of a solid pixel (e.g. crater/brick lip),
    // nudge 2px toward immediate open air so light spills outward cleanly, while
    // keeping deeply sealed buried sources trapped behind >= 4px walls!
    if (
      ix0 >= 0 &&
      ix0 < WORLD_W &&
      iy0 >= 0 &&
      iy0 < WORLD_H &&
      OCCLUDER_LUT[mats[iy0 * WORLD_W + ix0]] === 1
    ) {
      let nudged = false;
      const probes = [
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
      ];
      for (let p = 0; p < probes.length; p++) {
        const px = ix0 + probes[p][0];
        const py = iy0 + probes[p][1];
        if (px >= 1 && px < WORLD_W - 1 && py >= 1 && py < WORLD_H - 1) {
          if (OCCLUDER_LUT[mats[py * WORLD_W + px]] === 0) {
            ox = lx + probes[p][0];
            oy = ly + probes[p][1];
            nudged = true;
            break;
          }
        }
      }
      if (!nudged) {
        // Fully entombed inside solid rock -> tiny self-halo only
        for (let r = 0; r < safeCount; r++) {
          outX[r] = ox + cosArr[r] * 2.5;
          outY[r] = oy + sinArr[r] * 2.5;
        }
        return safeCount;
      }
    }

    const step = radius > 68 ? 1.85 : radius > 42 ? 1.55 : 1.3;
    const edgePenetration = 2.0; // illuminates the front-facing wall surface bevel

    for (let r = 0; r < safeCount; r++) {
      const dx = cosArr[r];
      const dy = sinArr[r];
      let hitDist = radius;

      for (let d = step; d <= radius; d += step) {
        const wx = (ox + dx * d + 0.5) | 0;
        const wy = (oy + dy * d + 0.5) | 0;
        if (wx <= 0 || wx >= WORLD_W - 1 || wy <= 0 || wy >= WORLD_H - 1) {
          hitDist = d;
          break;
        }
        if (OCCLUDER_LUT[mats[wy * WORLD_W + wx]] === 1) {
          // Refine hit edge by half-step for smoother wall contact
          const backD = d - step * 0.5;
          const bx = (ox + dx * backD + 0.5) | 0;
          const by = (oy + dy * backD + 0.5) | 0;
          const exactHit =
            bx >= 0 &&
            bx < WORLD_W &&
            by >= 0 &&
            by < WORLD_H &&
            OCCLUDER_LUT[mats[by * WORLD_W + bx]] === 1
              ? backD
              : d;
          hitDist = Math.min(radius, exactHit + edgePenetration);
          break;
        }
      }

      outX[r] = ox + dx * hitDist;
      outY[r] = oy + dy * hitDist;
    }

    return safeCount;
  }

  renderLighting(
    mainCtx: CanvasRenderingContext2D,
    mats: Uint8Array,
    lights: LightSource[],
    biome: BiomeConfig,
    depth: number,
    sx: number,
    sy: number,
    viewSimW: number,
    viewSimH: number,
    cw: number,
    ch: number,
    scaleX: number,
    scaleY: number
  ): void {
    this.ensureLightmapSize(viewSimW, viewSimH);
    const lCtx = this.lightCtx;
    const lw = this.lightW;
    const lh = this.lightH;
    const atm = biome.atmosphere;

    // 1. Subterranean ambient base fill (rich depth & biome tint, floored so silhouettes & parallax stay readable)
    const depthNorm = Math.min(1, Math.max(0, (depth - 1) / 18));
    const ambScale = 1.0 - depthNorm * 0.30;
    const [tr, tg, tb] = atm.ambientTintRgb;
    const [sr, sg, sb] = biome.bgSkyBottom;
    const baseR = Math.round(Math.max(48, Math.min(122, (sr * 1.95 + tr * 0.8 + 26) * ambScale)));
    const baseG = Math.round(Math.max(50, Math.min(122, (sg * 1.95 + tg * 0.8 + 26) * ambScale)));
    const baseB = Math.round(Math.max(58, Math.min(132, (sb * 1.95 + tb * 0.8 + 30) * ambScale)));

    lCtx.globalCompositeOperation = 'source-over';
    const ambGrad = lCtx.createLinearGradient(0, 0, 0, lh);
    ambGrad.addColorStop(
      0,
      `rgb(${Math.round(baseR * 0.88)}, ${Math.round(baseG * 0.88)}, ${Math.round(baseB * 0.92)})`
    );
    ambGrad.addColorStop(
      1,
      `rgb(${Math.min(255, Math.round(baseR * 1.12))}, ${Math.min(255, Math.round(baseG * 1.08))}, ${Math.min(255, Math.round(baseB * 1.12))})`
    );
    lCtx.fillStyle = ambGrad;
    lCtx.fillRect(0, 0, lw, lh);

    // 2. Accumulate dynamic raycasted light polygons into offscreen lightmap
    lCtx.globalCompositeOperation = 'lighter';

    let polyPoolIdx = 0;
    const lightVolRef: Array<{ light: LightSource; polyIdx: number }> = [];

    for (let i = 0; i < lights.length; i++) {
      const lt = lights[i];
      const lx = lt.x - sx;
      const ly = lt.y - sy;
      const r = lt.radius;
      if (lx + r < 0 || lx - r > lw || ly + r < 0 || ly - r > lh || r <= 1 || lt.intensity <= 0.01) {
        continue;
      }

      const [cr, cg, cb] = lt.rgb;
      const alpha = Math.min(1, lt.intensity);
      const grad = lCtx.createRadialGradient(lx, ly, 0, lx, ly, r);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha.toFixed(3)})`);
      grad.addColorStop(0.38, `rgba(${cr}, ${cg}, ${cb}, ${(alpha * 0.56).toFixed(3)})`);
      grad.addColorStop(0.76, `rgba(${cr}, ${cg}, ${cb}, ${(alpha * 0.16).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

      if (lt.castShadows) {
        const count = this.traceVisibilityPolygon(
          mats,
          lt.x,
          lt.y,
          r,
          lt.rayCount ?? 48,
          this.polyX,
          this.polyY
        );

        lCtx.save();
        lCtx.beginPath();
        lCtx.moveTo(this.polyX[0] - sx, this.polyY[0] - sy);
        for (let k = 1; k < count; k++) {
          lCtx.lineTo(this.polyX[k] - sx, this.polyY[k] - sy);
        }
        lCtx.closePath();
        lCtx.clip();
        lCtx.fillStyle = grad;
        lCtx.fillRect(lx - r, ly - r, r * 2, r * 2);
        lCtx.restore();

        if (lt.volumetric > 0.01) {
          if (!this.cachedPolys[polyPoolIdx]) {
            this.cachedPolys[polyPoolIdx] = {
              len: count,
              xs: new Float32Array(96),
              ys: new Float32Array(96),
            };
          }
          const cache = this.cachedPolys[polyPoolIdx];
          cache.len = count;
          cache.xs.set(this.polyX.subarray(0, count));
          cache.ys.set(this.polyY.subarray(0, count));
          lightVolRef.push({ light: lt, polyIdx: polyPoolIdx });
          polyPoolIdx++;
        }
      } else {
        lCtx.fillStyle = grad;
        lCtx.fillRect(lx - r, ly - r, r * 2, r * 2);
        if (lt.volumetric > 0.01) {
          lightVolRef.push({ light: lt, polyIdx: -1 });
        }
      }
    }

    // 3. Multiply lightmap cleanly onto main scene (bilinear smoothed for soft shadow penumbras)
    mainCtx.save();
    mainCtx.imageSmoothingEnabled = true;
    mainCtx.globalCompositeOperation = 'multiply';
    mainCtx.drawImage(this.lightCanvas, 0, 0, lw, lh, 0, 0, cw, ch);
    mainCtx.restore();

    // 4. Shadow-clipped volumetric atmospheric light shafts & color blooms
    if (lightVolRef.length > 0) {
      mainCtx.save();
      mainCtx.scale(scaleX, scaleY);
      mainCtx.translate(-sx, -sy);
      mainCtx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < lightVolRef.length; i++) {
        const { light, polyIdx } = lightVolRef[i];
        const [cr, cg, cb] = light.rgb;
        const r = light.radius * 0.92;
        const vAlpha = Math.min(0.45, light.volumetric);
        const vGrad = mainCtx.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
        vGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${vAlpha.toFixed(3)})`);
        vGrad.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${(vAlpha * 0.34).toFixed(3)})`);
        vGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

        if (polyIdx >= 0) {
          const cache = this.cachedPolys[polyIdx];
          mainCtx.save();
          mainCtx.beginPath();
          mainCtx.moveTo(cache.xs[0], cache.ys[0]);
          for (let k = 1; k < cache.len; k++) {
            mainCtx.lineTo(cache.xs[k], cache.ys[k]);
          }
          mainCtx.closePath();
          mainCtx.clip();
          mainCtx.fillStyle = vGrad;
          mainCtx.fillRect(light.x - r, light.y - r, r * 2, r * 2);
          mainCtx.restore();
        } else {
          mainCtx.fillStyle = vGrad;
          mainCtx.fillRect(light.x - r, light.y - r, r * 2, r * 2);
        }
      }

      mainCtx.restore();
    }

    // 5. Subtle screen-edge cavern vignette for atmospheric framing
    const [vr, vg, vb] = atm.vignetteRgb;
    const outerR = Math.max(cw, ch) * 0.84;
    const innerR = Math.min(cw, ch) * 0.34;
    const vig = mainCtx.createRadialGradient(cw * 0.5, ch * 0.5, innerR, cw * 0.5, ch * 0.5, outerR);
    vig.addColorStop(0, `rgba(${vr}, ${vg}, ${vb}, 0)`);
    vig.addColorStop(1, `rgba(${vr}, ${vg}, ${vb}, ${(atm.vignetteAlpha * 0.65).toFixed(3)})`);
    mainCtx.fillStyle = vig;
    mainCtx.fillRect(0, 0, cw, ch);
  }
}

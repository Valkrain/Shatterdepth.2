import {
  CHUNK_SIZE,
  CHUNKS_X,
  CHUNKS_Y,
  CrumblingBody,
  DamageType,
  DynamicParticle,
  MAT_PROPS,
  Mat,
  ParticleVisualKind,
  WORLD_H,
  WORLD_W,
} from './types';
import { IS_LITTLE_ENDIAN, packColor, tintColor, unpackColor } from './prng';
import { sfx } from './SoundFX';

const MAX_PARTICLES = 5000;
const GRAVITY = 280; // sim-pixels / s^2

export interface BlastEvent {
  x: number;
  y: number;
  radius: number;
  power: number;
  ignite?: boolean;
  acid?: boolean;
}

export interface CrushHit {
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
}

export class PixelWorld {
  readonly width = WORLD_W;
  readonly height = WORLD_H;
  readonly size = WORLD_W * WORLD_H;

  mat = new Uint8Array(this.size);
  color = new Uint32Array(this.size);
  bgColor = new Uint32Array(this.size);
  meta = new Uint8Array(this.size); // fire life, barrel chain, etc.
  pixelDmg = new Uint8Array(this.size); // accumulated per-pixel damage before breaking

  // Dirty chunks for fast cellular automata
  private dirtyChunks = new Uint8Array(CHUNKS_X * CHUNKS_Y);
  private nextDirtyChunks = new Uint8Array(CHUNKS_X * CHUNKS_Y);

  // Render buffer
  readonly offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imgData: ImageData;
  private imgU32: Uint32Array;

  // Dynamic ballistic particles
  readonly particles: DynamicParticle[] = [];
  private particleCursor = 0;

  // Crumbling rigid wall segments
  readonly bodies: CrumblingBody[] = [];
  private bodyIdCounter = 1;
  private bodyCanvases = new Map<number, HTMLCanvasElement>();

  // Structural check queue
  private structQueue: Array<{ x: number; y: number }> = [];

  // Pre-allocated BFS buffers for structural integrity solver
  private readonly checkRadius = 86;
  private readonly checkSpan = 86 * 2 + 1; // 173
  private bfsVisited = new Uint8Array(173 * 173);
  private bfsQueue = new Int32Array(173 * 173);
  private islandMask = new Uint8Array(173 * 173);
  private islandQueue = new Int32Array(173 * 173);

  // Counters & callbacks
  pixelsDestroyedCount = 0;
  segmentsCollapsedCount = 0;
  private stepParity = 0;
  private renderTick = 0;
  private pendingBarrelExplosions: Array<{ x: number; y: number }> = [];
  private pendingCrushHits: CrushHit[] = [];
  private pendingGoldDrops: Array<{ x: number; y: number }> = [];
  transparentEmpty = false;
  protectChains = false;

  constructor() {
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = WORLD_W;
    this.offscreen.height = WORLD_H;
    const ctx = this.offscreen.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to create offscreen 2D context');
    this.offCtx = ctx;
    this.offCtx.imageSmoothingEnabled = false;
    this.imgData = this.offCtx.createImageData(WORLD_W, WORLD_H);
    this.imgU32 = new Uint32Array(this.imgData.data.buffer);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        mat: Mat.EMPTY,
        color: 0,
        life: 0,
        maxLife: 1,
        bounces: 0,
        size: 1,
        kind: 'DEBRIS',
        settleOnRest: true,
        igniteOnHit: false,
      });
    }
  }

  clear(
    skyTop: [number, number, number],
    skyBottom: [number, number, number],
    transparentEmpty = false,
    protectChains = false
  ): void {
    this.transparentEmpty = transparentEmpty;
    this.protectChains = protectChains;
    this.mat.fill(Mat.EMPTY);
    this.meta.fill(0);
    this.pixelDmg.fill(0);
    this.dirtyChunks.fill(1);
    this.nextDirtyChunks.fill(1);
    this.bodies.length = 0;
    this.bodyCanvases.clear();
    this.structQueue.length = 0;
    this.pendingBarrelExplosions.length = 0;
    this.pendingCrushHits.length = 0;
    this.pendingGoldDrops.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].active = false;
    }

    if (transparentEmpty) {
      this.bgColor.fill(0);
      this.color.fill(0);
      return;
    }

    for (let y = 0; y < WORLD_H; y++) {
      const t = y / (WORLD_H - 1);
      const r = skyTop[0] + (skyBottom[0] - skyTop[0]) * t;
      const g = skyTop[1] + (skyBottom[1] - skyTop[1]) * t;
      const b = skyTop[2] + (skyBottom[2] - skyTop[2]) * t;
      const rowCol = packColor(r, g, b, 255);
      const rowStart = y * WORLD_W;
      for (let x = 0; x < WORLD_W; x++) {
        this.bgColor[rowStart + x] = rowCol;
        this.color[rowStart + x] = 0;
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;
  }

  getMat(x: number, y: number): Mat {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return Mat.BEDROCK;
    return this.mat[y * WORLD_W + x] as Mat;
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return true;
    const m = this.mat[y * WORLD_W + x] as Mat;
    return MAT_PROPS[m].solid;
  }

  setPixel(x: number, y: number, m: Mat, col: number, metaVal = 0): void {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
    const idx = y * WORLD_W + x;
    this.mat[idx] = m;
    this.color[idx] = col;
    this.meta[idx] = metaVal;
    this.pixelDmg[idx] = 0;
    this.markDirty(x, y);
  }

  setBgPixel(x: number, y: number, col: number): void {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
    this.bgColor[y * WORLD_W + x] = col;
  }

  markDirty(x: number, y: number): void {
    const cx = (x / CHUNK_SIZE) | 0;
    const cy = (y / CHUNK_SIZE) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= CHUNKS_Y) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= CHUNKS_X) continue;
        this.nextDirtyChunks[ny * CHUNKS_X + nx] = 1;
      }
    }
  }

  markAllDirty(): void {
    this.nextDirtyChunks.fill(1);
  }

  spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    mat: Mat,
    col: number,
    life = 2.5,
    settleOnRest = true,
    igniteOnHit = false,
    size = 1,
    kind?: ParticleVisualKind
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.x = x;
    p.y = y;
    p.prevX = x;
    p.prevY = y;
    p.vx = vx;
    p.vy = vy;
    p.mat = mat;
    p.color = col;
    p.life = life;
    p.maxLife = life;
    p.bounces = 0;
    p.size = size;
    p.kind =
      kind ?? (mat === Mat.SMOKE ? 'DUST' : mat === Mat.EMBER ? 'SPARK' : 'DEBRIS');
    p.settleOnRest = settleOnRest;
    p.igniteOnHit = igniteOnHit;
  }

  destroyCircle(
    cx: number,
    cy: number,
    radius: number,
    power: number,
    damageType: DamageType = 'EXPLOSIVE',
    ignite = false,
    acid = false,
    checkStructure = true
  ): number {
    const icx = Math.round(cx);
    const icy = Math.round(cy);
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    let destroyed = 0;
    let chipped = 0;
    let resisted = 0;
    let brokeChain = false;

    for (let dy = -r; dy <= r; dy++) {
      const y = icy + dy;
      if (y <= 1 || y >= WORLD_H - 3) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = icx + dx;
        if (x <= 1 || x >= WORLD_W - 2) continue;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;

        const idx = y * WORLD_W + x;
        const m = this.mat[idx] as Mat;
        if (m === Mat.EMPTY || m === Mat.SMOKE) {
          if (ignite && dist2 < r2 * 0.45 && Math.random() < 0.28) {
            this.setPixel(x, y, Mat.FIRE, packColor(255, 140 + Math.random() * 90, 30), 25 + ((Math.random() * 25) | 0));
          } else if ((acid || damageType === 'CORROSIVE') && dist2 < r2 * 0.42 && Math.random() < 0.24) {
            this.setPixel(x, y, Mat.ACID, packColor(70, 235, 95), 0);
          }
          continue;
        }
        const distRatio = Math.sqrt(dist2) / Math.max(1, radius);
        if (m === Mat.LAVA && damageType === 'CRYOGENIC' && distRatio < 0.85) {
          this.setPixel(x, y, Mat.STONE, packColor(52, 44, 48));
          continue;
        }

        const props = MAT_PROPS[m];

        if (this.protectChains && m === Mat.CHAIN) {
          continue;
        }

        if (props.hardness >= 255) {
          if (distRatio < 0.45 && Math.random() < 0.14) {
            const ang = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.1;
            this.spawnParticle(
              x + 0.5,
              y + 0.5,
              Math.cos(ang) * 90,
              Math.sin(ang) * 90 - 25,
              Mat.EMBER,
              packColor(255, 220, 140),
              0.28,
              false
            );
          }
          continue;
        }

        const rawHit = power * 5.2 * (1.25 - distRatio * 0.75);
        const typeMul = props.damageMul[damageType] ?? 1.0;
        const effDmg = rawHit * typeMul;

        if (m === Mat.BARREL) {
          if (effDmg >= 2 || distRatio < 0.85) {
            this.mat[idx] = Mat.EMPTY;
            this.color[idx] = 0;
            this.pixelDmg[idx] = 0;
            this.pendingBarrelExplosions.push({ x, y });
            destroyed++;
          }
          continue;
        }

        const dmgDelta = effDmg >= 0.85 ? Math.round(effDmg) : Math.random() < effDmg ? 1 : 0;
        const nextDmg = this.pixelDmg[idx] + dmgDelta;
        const breaks = nextDmg >= props.maxHp || (!props.solid && distRatio < 0.85);

        if (breaks) {
          const oldCol = this.color[idx];
          this.mat[idx] = Mat.EMPTY;
          this.color[idx] = 0;
          this.meta[idx] = 0;
          this.pixelDmg[idx] = 0;
          this.markDirty(x, y);
          destroyed++;
          if (m === Mat.CHAIN) {
            brokeChain = true;
          }

          if ((m === Mat.GOLD || m === Mat.JAR) && Math.random() < 0.25) {
            this.pendingGoldDrops.push({ x, y });
          }

          // Material-specific secondary destruction behaviors!
          if (damageType === 'ARC' && (m === Mat.CRYSTAL || m === Mat.METAL || m === Mat.CHAIN)) {
            // Harmonic crystal shatter & electrical conduction along adjacent metal/crystal
            const arcDirs = [-1, 1, -WORLD_W, WORLD_W, -WORLD_W - 1, WORLD_W + 1];
            for (let k = 0; k < 2; k++) {
              const off = arcDirs[(Math.random() * arcDirs.length) | 0];
              const ni = idx + off;
              if (ni > WORLD_W && ni < this.size - WORLD_W) {
                const nm = this.mat[ni] as Mat;
                if (nm === Mat.CRYSTAL || nm === Mat.CHAIN || nm === Mat.METAL) {
                  const nProps = MAT_PROPS[nm];
                  const condDmg = nm === Mat.CRYSTAL ? 18 : 20;
                  const nd = this.pixelDmg[ni] + condDmg;
                  if (nd >= nProps.maxHp) {
                    const nCol = this.color[ni];
                    this.mat[ni] = Mat.EMPTY;
                    this.color[ni] = 0;
                    this.meta[ni] = 0;
                    this.pixelDmg[ni] = 0;
                    destroyed++;
                    const nx = ni % WORLD_W;
                    const ny = (ni / WORLD_W) | 0;
                    this.markDirty(nx, ny);
                    if (Math.random() < 0.55) {
                      this.spawnParticle(
                        nx + 0.5,
                        ny + 0.5,
                        (Math.random() - 0.5) * 140,
                        -45 - Math.random() * 80,
                        nm === Mat.CRYSTAL ? Mat.CRYSTAL : Mat.EMBER,
                        nm === Mat.CRYSTAL ? nCol : packColor(165, 243, 252),
                        0.45,
                        nm === Mat.CRYSTAL
                      );
                    }
                  } else {
                    this.pixelDmg[ni] = nd;
                    this.markDirty(ni % WORLD_W, (ni / WORLD_W) | 0);
                  }
                }
              }
            }
          }

          if ((damageType === 'CORROSIVE' || acid) && props.corrodible && Math.random() < 0.22) {
            // Acid splash residue on corroded surfaces
            this.setPixel(x, y, Mat.ACID, packColor(72, 238, 98), 0);
          }

          // Convert into flying ballistic pixel particle + chunky debris & dust puffs
          if (props.solid && Math.random() < (radius > 7 ? 0.52 : 0.78)) {
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
            const speed = (65 + Math.random() * 145) * (1.15 - distRatio * 0.45);
            const debrisMat =
              m === Mat.BRICK || m === Mat.STONE || m === Mat.METAL
                ? Mat.RUBBLE
                : m === Mat.DIRT
                ? Mat.DIRT
                : m === Mat.WOOD || m === Mat.MOSS
                ? Mat.EMBER
                : m;
            const pCol =
              debrisMat === Mat.EMBER && (ignite || damageType === 'THERMAL' || damageType === 'PLASMA')
                ? packColor(255, 175, 50)
                : damageType === 'CORROSIVE'
                ? packColor(100, 235, 110)
                : damageType === 'ARC'
                ? packColor(180, 248, 255)
                : oldCol;
            const chunkSize =
              debrisMat === Mat.RUBBLE && Math.random() < 0.34 ? 2 : 1;
            this.spawnParticle(
              x + 0.5,
              y + 0.5,
              Math.cos(angle) * speed,
              Math.sin(angle) * speed - 42,
              debrisMat,
              pCol,
              1.6 + Math.random() * 1.4,
              debrisMat !== Mat.EMBER && damageType !== 'CORROSIVE',
              ignite || damageType === 'THERMAL',
              chunkSize
            );
            // Emit expanding dust cloud puff on masonry/dirt blasts
            if (Math.random() < 0.22 && (m === Mat.BRICK || m === Mat.STONE || m === Mat.DIRT)) {
              this.spawnParticle(
                x + 0.5,
                y + 0.5,
                Math.cos(angle) * speed * 0.28 + (Math.random() - 0.5) * 20,
                Math.sin(angle) * speed * 0.28 - 18,
                Mat.SMOKE,
                tintColor(oldCol, 1.15),
                0.55 + Math.random() * 0.45,
                false,
                false,
                radius >= 8 ? 3 : 2,
                'DUST'
              );
            }
          } else if (m === Mat.OIL && (ignite || damageType === 'THERMAL' || damageType === 'PLASMA')) {
            this.setPixel(x, y, Mat.FIRE, packColor(255, 165, 35), 40);
          } else if ((ignite || damageType === 'THERMAL') && props.flammable && Math.random() < 0.55) {
            this.setPixel(x, y, Mat.FIRE, packColor(255, 130, 30), 35);
          } else if ((damageType === 'PLASMA' || damageType === 'LASER') && m === Mat.SAND && Math.random() < 0.35) {
            this.spawnParticle(
              x + 0.5,
              y + 0.5,
              (Math.random() - 0.5) * 90,
              -35 - Math.random() * 55,
              Mat.EMBER,
              packColor(255, 225, 130),
              0.45,
              false,
              false,
              1,
              'SPARK'
            );
          }
        } else {
          // Material survived hit -> accumulate visible structural wear
          if (dmgDelta > 0) {
            this.pixelDmg[idx] = Math.min(254, nextDmg);
            this.markDirty(x, y);
            chipped++;
          }
          if (typeMul < 0.55) {
            resisted++;
            // Metallic/stone deflection sparks on resisted impact
            if (distRatio < 0.55 && Math.random() < 0.22) {
              const ang = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.3;
              this.spawnParticle(
                x + 0.5,
                y + 0.5,
                Math.cos(ang) * (80 + Math.random() * 70),
                Math.sin(ang) * (80 + Math.random() * 70) - 25,
                Mat.EMBER,
                m === Mat.METAL ? packColor(255, 235, 165) : packColor(210, 210, 220),
                0.26,
                false
              );
            }
          }
          if ((ignite || damageType === 'THERMAL') && props.flammable && Math.random() < 0.38) {
            this.setPixel(x, y, Mat.FIRE, packColor(255, 130, 30), 40);
          } else if ((acid || damageType === 'CORROSIVE') && props.corrodible && Math.random() < 0.16) {
            this.spawnParticle(
              x + 0.5,
              y + 0.5,
              (Math.random() - 0.5) * 45,
              -20 - Math.random() * 30,
              Mat.EMBER,
              packColor(90, 245, 110),
              0.32,
              false
            );
          }
        }
      }
    }

    if (destroyed > 0) {
      this.pixelsDestroyedCount += destroyed;
      if (destroyed <= 12) {
        sfx.playChip();
      }
      if (checkStructure && (destroyed >= 4 || brokeChain)) {
        this.queueStructuralCheck(icx, icy);
      }
    } else if (chipped > 0 || resisted > 0) {
      sfx.playChip();
    }

    // Handle barrel chain reactions
    if (this.pendingBarrelExplosions.length > 0) {
      const barrels = this.pendingBarrelExplosions.splice(0, 6);
      // Coalesce close barrel pixels so one barrel = 1 big boom
      const triggered: Array<{ x: number; y: number }> = [];
      for (const b of barrels) {
        if (!triggered.some((t) => Math.hypot(t.x - b.x, t.y - b.y) < 12)) {
          triggered.push(b);
          sfx.playExplosion(1.1);
          this.destroyCircle(b.x, b.y, 18, 8, 'EXPLOSIVE', true, false, true);
        }
      }
    }

    return destroyed;
  }

  queueStructuralCheck(x: number, y: number): void {
    // Avoid duplicate nearby checks in same frame
    for (const q of this.structQueue) {
      if (Math.abs(q.x - x) < 28 && Math.abs(q.y - y) < 28) return;
    }
    if (this.structQueue.length < 6) {
      this.structQueue.push({ x, y });
    }
  }

  private isStructuralSolid(m: Mat): boolean {
    if (m === Mat.EMPTY || m === Mat.SAND || m === Mat.RUBBLE || m === Mat.ASH) return false;
    if (m === Mat.CHAIN) return true;
    const p = MAT_PROPS[m];
    return p.solid;
  }

  private runStructuralCheck(cx: number, cy: number): void {
    // Center slightly above blast so tall roofs/towers above a severed base are included
    const r = this.checkRadius;
    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(WORLD_W - 1, cx + r);
    const y0 = Math.max(0, cy - r - 22);
    const y1 = Math.min(WORLD_H - 1, cy + r - 22);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w < 8 || h < 8) return;

    const visited = this.bfsVisited;
    const queue = this.bfsQueue;
    visited.fill(0, 0, w * h);
    let head = 0;
    let tail = 0;

    // Seed BFS from any structural pixel on the perimeter of the window OR BEDROCK inside
    for (let ly = 0; ly < h; ly++) {
      const wy = y0 + ly;
      const rowOffset = wy * WORLD_W;
      const lRow = ly * w;
      for (let lx = 0; lx < w; lx++) {
        const wx = x0 + lx;
        const m = this.mat[rowOffset + wx] as Mat;
        if (!this.isStructuralSolid(m)) continue;

        const onEdge = lx === 0 || lx === w - 1 || ly === 0 || ly === h - 1;
        if (onEdge || m === Mat.BEDROCK) {
          const li = lRow + lx;
          visited[li] = 1;
          queue[tail++] = li;
        }
      }
    }

    // Flood-fill anchored pixels
    while (head < tail) {
      const curr = queue[head++];
      const lx = curr % w;
      const ly = (curr / w) | 0;

      // 4-neighbors
      if (lx > 0) {
        const ni = curr - 1;
        if (visited[ni] === 0 && this.isStructuralSolid(this.mat[(y0 + ly) * WORLD_W + (x0 + lx - 1)] as Mat)) {
          visited[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (lx + 1 < w) {
        const ni = curr + 1;
        if (visited[ni] === 0 && this.isStructuralSolid(this.mat[(y0 + ly) * WORLD_W + (x0 + lx + 1)] as Mat)) {
          visited[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (ly > 0) {
        const ni = curr - w;
        if (visited[ni] === 0 && this.isStructuralSolid(this.mat[(y0 + ly - 1) * WORLD_W + (x0 + lx)] as Mat)) {
          visited[ni] = 1;
          queue[tail++] = ni;
        }
      }
      if (ly + 1 < h) {
        const ni = curr + w;
        if (visited[ni] === 0 && this.isStructuralSolid(this.mat[(y0 + ly + 1) * WORLD_W + (x0 + lx)] as Mat)) {
          visited[ni] = 1;
          queue[tail++] = ni;
        }
      }
    }

    // Extract any unvisited connected structural islands!
    const mask = this.islandMask;
    mask.fill(0, 0, w * h);
    const iQueue = this.islandQueue;

    for (let ly = 1; ly < h - 1; ly++) {
      for (let lx = 1; lx < w - 1; lx++) {
        const li = ly * w + lx;
        if (visited[li] !== 0 || mask[li] !== 0) continue;
        const m = this.mat[(y0 + ly) * WORLD_W + (x0 + lx)] as Mat;
        if (!this.isStructuralSolid(m)) continue;

        // Collect connected island
        let iHead = 0;
        let iTail = 0;
        mask[li] = 1;
        iQueue[iTail++] = li;
        let minX = lx;
        let maxX = lx;
        let minY = ly;
        let maxY = ly;

        while (iHead < iTail) {
          const c = iQueue[iHead++];
          const clx = c % w;
          const cly = (c / w) | 0;
          if (clx < minX) minX = clx;
          if (clx > maxX) maxX = clx;
          if (cly < minY) minY = cly;
          if (cly > maxY) maxY = cly;

          const neighbors = [
            clx > 0 ? c - 1 : -1,
            clx + 1 < w ? c + 1 : -1,
            cly > 0 ? c - w : -1,
            cly + 1 < h ? c + w : -1,
          ];
          for (let k = 0; k < 4; k++) {
            const ni = neighbors[k];
            if (ni < 0 || visited[ni] !== 0 || mask[ni] !== 0) continue;
            const nlx = ni % w;
            const nly = (ni / w) | 0;
            const nm = this.mat[(y0 + nly) * WORLD_W + (x0 + nlx)] as Mat;
            if (this.isStructuralSolid(nm)) {
              mask[ni] = 1;
              iQueue[iTail++] = ni;
            }
          }
        }

        const count = iTail;
        if (count <= 14) {
          // Small fragments scatter directly into ballistic pixels
          for (let i = 0; i < count; i++) {
            const c = iQueue[i];
            const wx = x0 + (c % w);
            const wy = y0 + ((c / w) | 0);
            const idx = wy * WORLD_W + wx;
            const pm = this.mat[idx] as Mat;
            const pc = this.color[idx];
            this.mat[idx] = Mat.EMPTY;
            this.color[idx] = 0;
            this.pixelDmg[idx] = 0;
            this.markDirty(wx, wy);
            this.spawnParticle(
              wx + 0.5,
              wy + 0.5,
              (Math.random() - 0.5) * 65,
              -20 + (Math.random() - 0.5) * 40,
              pm === Mat.BRICK || pm === Mat.STONE ? Mat.RUBBLE : pm,
              pc,
              2.2,
              true
            );
          }
        } else if (this.bodies.length < 24) {
          // Extract into a rigid rotating CrumblingBody!
          const bw = maxX - minX + 1;
          const bh = maxY - minY + 1;
          const mats = new Uint8Array(bw * bh);
          const colors = new Uint32Array(bw * bh);
          let sumX = 0;
          let sumY = 0;

          for (let i = 0; i < count; i++) {
            const c = iQueue[i];
            const clx = c % w;
            const cly = (c / w) | 0;
            const wx = x0 + clx;
            const wy = y0 + cly;
            const idx = wy * WORLD_W + wx;

            const bx = clx - minX;
            const by = cly - minY;
            const bi = by * bw + bx;
            mats[bi] = this.mat[idx];
            colors[bi] = this.color[idx];

            sumX += bx;
            sumY += by;

            this.mat[idx] = Mat.EMPTY;
            this.color[idx] = 0;
            this.meta[idx] = 0;
            this.pixelDmg[idx] = 0;
            this.markDirty(wx, wy);
          }

          const localCx = sumX / count + 0.5;
          const localCy = sumY / count + 0.5;
          const worldCenterX = x0 + minX + localCx;
          const worldCenterY = y0 + minY + localCy;
          const tiltDir = worldCenterX >= cx ? 1 : -1;

          const body: CrumblingBody = {
            id: this.bodyIdCounter++,
            x: worldCenterX,
            y: worldCenterY,
            vx: tiltDir * (12 + Math.random() * 18),
            vy: 8,
            angle: 0,
            angularVel: tiltDir * (0.9 + Math.random() * 1.4),
            w: bw,
            h: bh,
            cx: localCx,
            cy: localCy,
            mats,
            colors,
            pixelCount: count,
            age: 0,
            settledFrames: 0,
            hasCrushedOnce: false,
          };

          this.createBodyCanvas(body);
          this.bodies.push(body);
          this.segmentsCollapsedCount++;
          sfx.playCollapse(Math.min(2, count / 180));
        }
      }
    }
  }

  private createBodyCanvas(body: CrumblingBody): void {
    const c = document.createElement('canvas');
    c.width = body.w;
    c.height = body.h;
    const ctx = c.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(body.w, body.h);
      const u32 = new Uint32Array(img.data.buffer);
      u32.set(body.colors);
      ctx.putImageData(img, 0, 0);
    }
    this.bodyCanvases.set(body.id, c);
  }

  spawnDetachedChunk(
    worldX: number,
    worldY: number,
    w: number,
    h: number,
    cx: number,
    cy: number,
    mats: Uint8Array,
    colors: Uint32Array,
    pixelCount: number,
    vx: number,
    vy: number,
    angularVel: number
  ): void {
    if (this.bodies.length < 28 && pixelCount >= 12) {
      const body: CrumblingBody = {
        id: this.bodyIdCounter++,
        x: worldX,
        y: worldY,
        vx,
        vy,
        angle: 0,
        angularVel,
        w,
        h,
        cx,
        cy,
        mats,
        colors,
        pixelCount,
        age: 0,
        settledFrames: 0,
        hasCrushedOnce: false,
      };
      this.createBodyCanvas(body);
      this.bodies.push(body);
      this.segmentsCollapsedCount++;
      return;
    }

    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const bi = ly * w + lx;
        const m = mats[bi] as Mat;
        if (m === Mat.EMPTY) continue;
        if (Math.random() < 0.65) {
          this.spawnParticle(
            worldX + (lx - cx),
            worldY + (ly - cy),
            vx + (Math.random() - 0.5) * 90,
            vy - 20 - Math.random() * 65,
            m === Mat.BRICK || m === Mat.STONE || m === Mat.METAL ? Mat.RUBBLE : m,
            colors[bi],
            1.8,
            m !== Mat.CRYSTAL
          );
        }
      }
    }
  }

  private shatterBody(body: CrumblingBody, impactSpeed: number): void {
    this.bodyCanvases.delete(body.id);
    const cos = Math.cos(body.angle);
    const sin = Math.sin(body.angle);

    // If large and high impact, split into 2 smaller bodies + spray debris!
    if (body.pixelCount > 85 && impactSpeed > 65 && this.bodies.length < 20) {
      const splitVert = body.w >= body.h;
      const halfA = {
        minX: body.w,
        maxX: 0,
        minY: body.h,
        maxY: 0,
        pts: [] as Array<{ x: number; y: number; m: Mat; c: number }>,
      };
      const halfB = {
        minX: body.w,
        maxX: 0,
        minY: body.h,
        maxY: 0,
        pts: [] as Array<{ x: number; y: number; m: Mat; c: number }>,
      };

      for (let ly = 0; ly < body.h; ly++) {
        for (let lx = 0; lx < body.w; lx++) {
          const bi = ly * body.w + lx;
          const m = body.mats[bi] as Mat;
          if (m === Mat.EMPTY) continue;
          const col = body.colors[bi];

          // Fracture seam loses ~25% pixels as flying rubble
          const distFromSeam = splitVert
            ? Math.abs(lx - body.cx)
            : Math.abs(ly - body.cy);

          const rx = lx - body.cx;
          const ry = ly - body.cy;
          const wx = body.x + rx * cos - ry * sin;
          const wy = body.y + rx * sin + ry * cos;

          if (distFromSeam < 1.8 && Math.random() < 0.7) {
            this.spawnParticle(
              wx,
              wy,
              body.vx * 0.4 + (Math.random() - 0.5) * 90,
              -35 - Math.random() * 70,
              m === Mat.BRICK || m === Mat.STONE ? Mat.RUBBLE : m,
              col,
              1.8,
              true
            );
            continue;
          }

          const bucket = (splitVert ? lx < body.cx : ly < body.cy) ? halfA : halfB;
          if (lx < bucket.minX) bucket.minX = lx;
          if (lx > bucket.maxX) bucket.maxX = lx;
          if (ly < bucket.minY) bucket.minY = ly;
          if (ly > bucket.maxY) bucket.maxY = ly;
          bucket.pts.push({ x: lx, y: ly, m, c: col });
        }
      }

      for (const h of [halfA, halfB]) {
        if (h.pts.length < 16) {
          for (const pt of h.pts) {
            const rx = pt.x - body.cx;
            const ry = pt.y - body.cy;
            this.spawnParticle(
              body.x + rx * cos - ry * sin,
              body.y + rx * sin + ry * cos,
              (Math.random() - 0.5) * 85,
              -30 - Math.random() * 60,
              Mat.RUBBLE,
              pt.c,
              2.0,
              true
            );
          }
          continue;
        }
        const nw = h.maxX - h.minX + 1;
        const nh = h.maxY - h.minY + 1;
        const nmats = new Uint8Array(nw * nh);
        const ncols = new Uint32Array(nw * nh);
        let sx = 0;
        let sy = 0;
        for (const pt of h.pts) {
          const nx = pt.x - h.minX;
          const ny = pt.y - h.minY;
          const ni = ny * nw + nx;
          nmats[ni] = pt.m;
          ncols[ni] = pt.c;
          sx += nx;
          sy += ny;
        }
        const ncx = sx / h.pts.length + 0.5;
        const ncy = sy / h.pts.length + 0.5;
        const relX = h.minX + ncx - body.cx;
        const relY = h.minY + ncy - body.cy;
        const sub: CrumblingBody = {
          id: this.bodyIdCounter++,
          x: body.x + relX * cos - relY * sin,
          y: body.y + relX * sin + relY * cos,
          vx: body.vx * 0.4 + (relX >= 0 ? 22 : -22),
          vy: -32 - Math.random() * 25,
          angle: body.angle,
          angularVel: (Math.random() - 0.5) * 3.5,
          w: nw,
          h: nh,
          cx: ncx,
          cy: ncy,
          mats: nmats,
          colors: ncols,
          pixelCount: h.pts.length,
          age: 0,
          settledFrames: 0,
          hasCrushedOnce: true,
        };
        this.createBodyCanvas(sub);
        this.bodies.push(sub);
      }

      sfx.playCollapse(1.2);
      return;
    }

    // Final shatter/settle into rubble + flying pixels + billowing dust clouds!
    let settled = 0;
    for (let d = 0; d < Math.min(28, Math.round(body.pixelCount * 0.24)); d++) {
      this.spawnParticle(
        body.x + (Math.random() - 0.5) * body.w,
        body.y + (Math.random() - 0.5) * body.h,
        (Math.random() - 0.5) * 75,
        -25 - Math.random() * 45,
        Mat.SMOKE,
        packColor(175, 180, 190, 175),
        1.1 + Math.random() * 1.1,
        false,
        false,
        Math.random() < 0.45 ? 4 : 3,
        'DUST'
      );
    }

    for (let ly = 0; ly < body.h; ly++) {
      for (let lx = 0; lx < body.w; lx++) {
        const bi = ly * body.w + lx;
        const m = body.mats[bi] as Mat;
        if (m === Mat.EMPTY) continue;
        const col = body.colors[bi];

        const rx = lx - body.cx;
        const ry = ly - body.cy;
        const wx = Math.round(body.x + rx * cos - ry * sin);
        const wy = Math.round(body.y + rx * sin + ry * cos);

        if (m === Mat.BARREL) {
          this.destroyCircle(wx, wy, 16, 8, 'EXPLOSIVE', true, false, true);
          continue;
        }

        if (Math.random() < 0.38 && impactSpeed > 32) {
          this.spawnParticle(
            wx,
            wy,
            (Math.random() - 0.5) * 90,
            -28 - Math.random() * 60,
            m === Mat.BRICK || m === Mat.STONE ? Mat.RUBBLE : m,
            col,
            2.1,
            true,
            false,
            Math.random() < 0.3 ? 2 : 1,
            'DEBRIS'
          );
        } else if (this.inBounds(wx, wy) && !this.isSolid(wx, wy)) {
          const settledMat =
            m === Mat.BRICK || m === Mat.STONE ? Mat.RUBBLE : m;
          this.setPixel(wx, wy, settledMat, tintColor(col, 0.94));
          settled++;
        }
      }
    }
    if (settled > 0) {
      sfx.playCollapse(0.7);
    }
  }

  consumeCrushHits(): CrushHit[] {
    if (this.pendingCrushHits.length === 0) return [];
    return this.pendingCrushHits.splice(0, this.pendingCrushHits.length);
  }

  consumeGoldDrops(): Array<{ x: number; y: number }> {
    if (this.pendingGoldDrops.length === 0) return [];
    return this.pendingGoldDrops.splice(0, this.pendingGoldDrops.length);
  }

  step(dt: number): void {
    // 1. Run queued structural checks (max 2 per frame for silky framerate)
    for (let i = 0; i < 2 && this.structQueue.length > 0; i++) {
      const item = this.structQueue.shift()!;
      this.runStructuralCheck(item.x, item.y);
    }

    // 2. Step CrumblingBody segments
    this.stepCrumblingBodies(dt);

    // 3. Step dynamic ballistic particles
    this.stepParticles(dt);

    // 4. Step cellular automata in dirty chunks
    this.stepCA();
  }

  private stepCrumblingBodies(dt: number): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.age += dt;
      b.vy += GRAVITY * dt;
      if (b.vy > 240) b.vy = 240;

      const nextX = b.x + b.vx * dt;
      const nextY = b.y + b.vy * dt;
      const nextAngle = b.angle + b.angularVel * dt;

      // Check collision of body pixels against static terrain
      const cos = Math.cos(nextAngle);
      const sin = Math.sin(nextAngle);
      let hitSolid = false;
      const stepStride = b.pixelCount > 300 ? 2 : 1;

      for (let ly = 0; ly < b.h && !hitSolid; ly += stepStride) {
        for (let lx = 0; lx < b.w; lx += stepStride) {
          if (b.mats[ly * b.w + lx] === Mat.EMPTY) continue;
          const rx = lx - b.cx;
          const ry = ly - b.cy;
          const wx = Math.round(nextX + rx * cos - ry * sin);
          const wy = Math.round(nextY + rx * sin + ry * cos);
          if (wy >= WORLD_H - 4 || wx <= 1 || wx >= WORLD_W - 2 || this.isSolid(wx, wy)) {
            hitSolid = true;
            break;
          }
        }
      }

      if (hitSolid) {
        const impactSpeed = Math.hypot(b.vx, b.vy);
        if (impactSpeed > 42 || b.age > 3.5) {
          // Emit crush damage zone on impact
          const radius = Math.max(b.w, b.h) * 0.6;
          this.pendingCrushHits.push({
            x: b.x - radius,
            y: b.y - radius,
            w: radius * 2,
            h: radius * 2,
            damage: Math.min(60, Math.round(12 + b.pixelCount * 0.14)),
          });

          this.bodies.splice(i, 1);
          this.shatterBody(b, impactSpeed);
          continue;
        } else {
          b.vx *= 0.4;
          b.vy = 0;
          b.angularVel *= 0.4;
          b.settledFrames++;
          if (b.settledFrames > 14) {
            this.bodies.splice(i, 1);
            this.shatterBody(b, 15);
            continue;
          }
        }
      } else {
        b.x = nextX;
        b.y = nextY;
        b.angle = nextAngle;
        b.settledFrames = 0;

        // Moving falling body also crushes entities in mid-air!
        if (b.vy > 35) {
          const hw = Math.max(b.w, b.h) * 0.45;
          this.pendingCrushHits.push({
            x: b.x - hw,
            y: b.y - hw,
            w: hw * 2,
            h: hw * 2,
            damage: Math.min(50, Math.round(10 + b.pixelCount * 0.1)),
          });
        }
      }
    }
  }

  private stepParticles(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;

      if (p.kind === 'DUST') {
        p.vy -= 14 * dt; // Gentle billowing lift
        const drag = Math.pow(0.18, dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x <= 1 || p.x >= WORLD_W - 2 || p.y <= 1 || p.y >= WORLD_H - 3) {
          p.active = false;
        }
        continue;
      }

      p.vy += (p.kind === 'SPARK' ? GRAVITY * 0.58 : GRAVITY) * dt;
      p.vx *= 0.992;

      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const ix = Math.round(nx);
      const iy = Math.round(ny);

      if (ix <= 1 || ix >= WORLD_W - 2 || iy <= 1 || iy >= WORLD_H - 3) {
        p.active = false;
        continue;
      }

      const hitMat = this.getMat(ix, iy);
      const hitProps = MAT_PROPS[hitMat];

      if (hitProps.solid) {
        if (p.igniteOnHit && hitProps.flammable) {
          this.setPixel(ix, iy, Mat.FIRE, packColor(255, 145, 35), 35);
        }

        const speed = Math.hypot(p.vx, p.vy);
        if (p.settleOnRest && (speed < 48 || p.bounces >= 2)) {
          // Deposit back into the pixel world grid near the impact point!
          const px = Math.round(p.x);
          const py = Math.round(p.y);
          if (this.inBounds(px, py) && !this.isSolid(px, py)) {
            this.setPixel(px, py, p.mat, p.color);
          }
          p.active = false;
          continue;
        }

        // Bounce off pixel surface normal (approximate vertical vs horizontal)
        const prevX = Math.round(p.x);
        const prevY = Math.round(p.y);
        if (this.isSolid(ix, prevY)) {
          p.vx = -p.vx * 0.45;
        } else {
          p.vx *= 0.72;
        }
        if (this.isSolid(prevX, iy)) {
          p.vy = -p.vy * 0.42;
        } else {
          p.vy *= 0.75;
        }
        p.bounces++;
      } else {
        p.x = nx;
        p.y = ny;
      }
    }
  }

  private stepCA(): void {
    // Swap dirty buffers
    this.dirtyChunks.set(this.nextDirtyChunks);
    this.nextDirtyChunks.fill(0);
    this.stepParity = 1 - this.stepParity;

    // Scan chunks bottom-to-top for falling/flowing materials
    for (let cy = CHUNKS_Y - 1; cy >= 0; cy--) {
      const yStart = cy * CHUNK_SIZE;
      const yEnd = Math.min(WORLD_H - 2, yStart + CHUNK_SIZE - 1);

      for (let cxi = 0; cxi < CHUNKS_X; cxi++) {
        const cx = this.stepParity === 0 ? cxi : CHUNKS_X - 1 - cxi;
        if (this.dirtyChunks[cy * CHUNKS_X + cx] === 0) continue;

        const xStart = Math.max(1, cx * CHUNK_SIZE);
        const xEnd = Math.min(WORLD_W - 2, cx * CHUNK_SIZE + CHUNK_SIZE - 1);

        for (let y = yEnd; y >= yStart; y--) {
          if (y < 1 || y >= WORLD_H - 2) continue;
          const row = y * WORLD_W;

          for (let xi = 0; xi <= xEnd - xStart; xi++) {
            const x = this.stepParity === 0 ? xStart + xi : xEnd - xi;
            const idx = row + x;
            const m = this.mat[idx] as Mat;
            if (m === Mat.EMPTY || m === Mat.BEDROCK || m === Mat.STONE || m === Mat.BRICK || m === Mat.METAL) {
              continue;
            }

            if (m === Mat.SAND || m === Mat.RUBBLE || m === Mat.ASH || m === Mat.EMBER) {
              this.stepPowder(x, y, idx, m);
            } else if (m === Mat.WATER || m === Mat.OIL || m === Mat.ACID || m === Mat.LAVA) {
              this.stepLiquid(x, y, idx, m);
            } else if (m === Mat.FIRE) {
              this.stepFire(x, y, idx);
            } else if (m === Mat.SMOKE) {
              this.stepSmoke(x, y, idx);
            } else if (m === Mat.TORCH) {
              // Torches emit live decorative flame pixels (life <= 15 so they don't burn down structures)
              this.nextDirtyChunks[cy * CHUNKS_X + cx] = 1;
              if (Math.random() < 0.14 && this.mat[(y - 1) * WORLD_W + x] === Mat.EMPTY) {
                this.setPixel(
                  x,
                  y - 1,
                  Mat.FIRE,
                  packColor(255, 165 + Math.random() * 75, 40),
                  9 + ((Math.random() * 6) | 0)
                );
              }
            }
          }
        }
      }
    }

    if (this.pendingBarrelExplosions.length > 0) {
      const barrels = this.pendingBarrelExplosions.splice(0, 6);
      const triggered: Array<{ x: number; y: number }> = [];
      for (const b of barrels) {
        if (!triggered.some((t) => Math.hypot(t.x - b.x, t.y - b.y) < 12)) {
          triggered.push(b);
          sfx.playExplosion(1.1);
          this.destroyCircle(b.x, b.y, 18, 8, 'EXPLOSIVE', true, false, true);
        }
      }
    }
  }

  private swap(idxA: number, xA: number, yA: number, idxB: number, xB: number, yB: number): void {
    const tmpM = this.mat[idxA];
    const tmpC = this.color[idxA];
    const tmpMeta = this.meta[idxA];
    const tmpDmg = this.pixelDmg[idxA];

    this.mat[idxA] = this.mat[idxB];
    this.color[idxA] = this.color[idxB];
    this.meta[idxA] = this.meta[idxB];
    this.pixelDmg[idxA] = this.pixelDmg[idxB];

    this.mat[idxB] = tmpM;
    this.color[idxB] = tmpC;
    this.meta[idxB] = tmpMeta;
    this.pixelDmg[idxB] = tmpDmg;

    this.markDirty(xA, yA);
    this.markDirty(xB, yB);
  }

  private stepPowder(x: number, y: number, idx: number, m: Mat): void {
    if (m === Mat.EMBER) {
      if (Math.random() < 0.08) {
        this.mat[idx] = Mat.ASH;
        this.color[idx] = packColor(68, 64, 62);
        this.markDirty(x, y);
        return;
      }
      // Ignite neighbors
      const nIdx = idx + (Math.random() < 0.5 ? 1 : -1);
      const nm = this.mat[nIdx] as Mat;
      if (MAT_PROPS[nm].flammable && Math.random() < 0.18) {
        this.mat[nIdx] = Mat.FIRE;
        this.color[nIdx] = packColor(255, 150, 35);
        this.meta[nIdx] = 35;
        this.markDirty(x, y);
      }
    }

    const below = idx + WORLD_W;
    const bm = this.mat[below] as Mat;
    if (bm === Mat.EMPTY || MAT_PROPS[bm].liquid || MAT_PROPS[bm].gas) {
      this.swap(idx, x, y, below, x, y + 1);
      return;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    const diag1 = below + dir;
    const d1m = this.mat[diag1] as Mat;
    if (d1m === Mat.EMPTY || MAT_PROPS[d1m].liquid || MAT_PROPS[d1m].gas) {
      this.swap(idx, x, y, diag1, x + dir, y + 1);
      return;
    }

    const diag2 = below - dir;
    const d2m = this.mat[diag2] as Mat;
    if (d2m === Mat.EMPTY || MAT_PROPS[d2m].liquid || MAT_PROPS[d2m].gas) {
      this.swap(idx, x, y, diag2, x - dir, y + 1);
    }
  }

  private stepLiquid(x: number, y: number, idx: number, m: Mat): void {
    // Acid progressively corrodes vulnerable materials using their CORROSIVE multiplier
    if (m === Mat.ACID && Math.random() < 0.1) {
      const offsets = [WORLD_W, -1, 1, -WORLD_W];
      const off = offsets[(Math.random() * 4) | 0];
      const targetIdx = idx + off;
      const tm = this.mat[targetIdx] as Mat;
      const tProps = MAT_PROPS[tm];
      if (tProps.corrodible) {
        const corrMul = tProps.damageMul.CORROSIVE ?? 1.0;
        const dmg = Math.max(3, Math.round(14 * corrMul));
        const nextD = this.pixelDmg[targetIdx] + dmg;
        if (nextD >= tProps.maxHp) {
          this.mat[targetIdx] = Mat.EMPTY;
          this.color[targetIdx] = 0;
          this.pixelDmg[targetIdx] = 0;
          this.mat[idx] = Mat.SMOKE;
          this.color[idx] = packColor(120, 210, 120, 170);
          this.meta[idx] = 20;
          this.markDirty(x, y);
        } else {
          this.pixelDmg[targetIdx] = nextD;
          if (Math.random() < 0.45) {
            this.mat[idx] = Mat.SMOKE;
            this.color[idx] = packColor(120, 210, 120, 170);
            this.meta[idx] = 16;
          }
          this.markDirty(x, y);
        }
        return;
      }
    }

    // Lava: ignites flammables, turns into basalt stone + steam on contact with water, flows sluggishly
    if (m === Mat.LAVA) {
      this.markDirty(x, y);
      const dirs = [WORLD_W, -1, 1, -WORLD_W];
      const off = dirs[(Math.random() * 4) | 0];
      const ni = idx + off;
      const nm = this.mat[ni] as Mat;
      if (nm === Mat.WATER) {
        this.mat[idx] = Mat.STONE;
        this.color[idx] = packColor(46, 42, 48);
        this.meta[idx] = 0;
        this.mat[ni] = Mat.SMOKE;
        this.color[ni] = packColor(200, 206, 215, 155);
        this.meta[ni] = 20;
        return;
      }
      if (MAT_PROPS[nm].flammable && Math.random() < 0.16) {
        if (nm === Mat.BARREL) {
          this.pendingBarrelExplosions.push({ x, y });
          this.mat[ni] = Mat.EMPTY;
          this.color[ni] = 0;
          this.pixelDmg[ni] = 0;
        } else {
          this.mat[ni] = Mat.FIRE;
          this.color[ni] = packColor(255, 155, 35);
          this.meta[ni] = nm === Mat.OIL ? 42 : 30;
        }
      }
      // Occasional bubbling surface spark above open lava
      if (this.mat[idx - WORLD_W] === Mat.EMPTY && Math.random() < 0.005) {
        this.spawnParticle(
          x + 0.5,
          y - 0.5,
          (Math.random() - 0.5) * 26,
          -34 - Math.random() * 28,
          Mat.EMBER,
          packColor(255, 195, 65),
          0.36,
          false,
          false,
          1,
          'SPARK'
        );
      }
      // Viscous: only advance flow 58% of ticks
      if (Math.random() > 0.58) return;
    }

    // Water extinguishes fire & cools lava surface
    if (m === Mat.WATER) {
      const below = idx + WORLD_W;
      if (this.mat[below] === Mat.FIRE) {
        this.mat[below] = Mat.SMOKE;
        this.color[below] = packColor(190, 200, 210, 140);
        this.meta[below] = 18;
      } else if (this.mat[below] === Mat.LAVA) {
        this.mat[below] = Mat.STONE;
        this.color[below] = packColor(48, 44, 50);
        this.mat[idx] = Mat.SMOKE;
        this.color[idx] = packColor(200, 206, 215, 155);
        this.meta[idx] = 20;
        this.markDirty(x, y);
        return;
      }
    }

    const below = idx + WORLD_W;
    const bm = this.mat[below] as Mat;
    if (bm === Mat.EMPTY || bm === Mat.SMOKE || (m === Mat.WATER && bm === Mat.OIL) || (m === Mat.LAVA && (bm === Mat.OIL || bm === Mat.FIRE))) {
      this.swap(idx, x, y, below, x, y + 1);
      return;
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    const diag = below + dir;
    if (this.mat[diag] === Mat.EMPTY) {
      this.swap(idx, x, y, diag, x + dir, y + 1);
      return;
    }

    // Lateral dispersion (up to 3 pixels for snappy fluid leveling, 1-2 for thick lava)
    const maxStep = m === Mat.LAVA ? 1 : 3;
    for (let step = 1; step <= maxStep; step++) {
      const nx = x + dir * step;
      if (nx <= 1 || nx >= WORLD_W - 2) break;
      const sideIdx = y * WORLD_W + nx;
      const sm = this.mat[sideIdx] as Mat;
      if (sm === Mat.EMPTY) {
        this.swap(idx, x, y, sideIdx, nx, y);
        return;
      }
      if (MAT_PROPS[sm].solid) break;
    }
  }

  private stepFire(x: number, y: number, idx: number): void {
    let life = this.meta[idx];
    if (life <= 1) {
      if (Math.random() < 0.35) {
        this.mat[idx] = Mat.SMOKE;
        this.color[idx] = packColor(72, 70, 74, 150);
        this.meta[idx] = 22;
      } else {
        this.mat[idx] = Mat.EMPTY;
        this.color[idx] = 0;
        this.meta[idx] = 0;
      }
      this.markDirty(x, y);
      return;
    }

    this.meta[idx] = life - 1;
    // Flicker color
    this.color[idx] = packColor(
      255,
      110 + ((Math.random() * 120) | 0),
      20 + ((Math.random() * 40) | 0)
    );
    this.markDirty(x, y);

    // Spread to flammable neighbors only for intense fires (weapon/barrel/oil fire), not small torch sparks
    if (life > 15) {
      const dirs = [-1, 1, -WORLD_W, WORLD_W];
      for (let d = 0; d < 4; d++) {
        const ni = idx + dirs[d];
        const nm = this.mat[ni] as Mat;
        if (MAT_PROPS[nm].flammable && Math.random() < 0.08) {
          if (nm === Mat.BARREL) {
            this.pendingBarrelExplosions.push({ x, y });
            this.mat[ni] = Mat.EMPTY;
            this.color[ni] = 0;
            this.pixelDmg[ni] = 0;
          } else {
            this.mat[ni] = Mat.FIRE;
            this.color[ni] = packColor(255, 145, 30);
            this.meta[ni] = nm === Mat.OIL ? 45 : 32;
            this.pixelDmg[ni] = 0;
          }
        }
      }
    }

    // Rise upward
    if (y > 2 && Math.random() < 0.55) {
      const upIdx = idx - WORLD_W + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0);
      if (this.mat[upIdx] === Mat.EMPTY) {
        this.swap(idx, x, y, upIdx, x, y - 1);
      }
    }
  }

  private stepSmoke(x: number, y: number, idx: number): void {
    const life = this.meta[idx];
    if (life <= 1 || y <= 2) {
      this.mat[idx] = Mat.EMPTY;
      this.color[idx] = 0;
      this.meta[idx] = 0;
      this.markDirty(x, y);
      return;
    }
    this.meta[idx] = life - 1;
    const drift = Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const upIdx = idx - WORLD_W + drift;
    if (this.inBounds(x + drift, y - 1) && this.mat[upIdx] === Mat.EMPTY) {
      this.swap(idx, x, y, upIdx, x + drift, y - 1);
    } else {
      this.markDirty(x, y);
    }
  }

  renderToOffscreen(viewX = 0, viewY = 0, viewW = WORLD_W, viewH = WORLD_H): void {
    this.renderTick = (this.renderTick + 1) | 0;
    const tick = this.renderTick;
    const u32 = this.imgU32;
    const mats = this.mat;
    const fg = this.color;
    const bg = this.bgColor;
    const dmgArr = this.pixelDmg;
    const total = this.size;
    const rowStride = WORLD_W;

    const x0 = Math.max(0, Math.floor(viewX) - 4);
    const y0 = Math.max(0, Math.floor(viewY) - 4);
    const x1 = Math.min(WORLD_W - 1, Math.ceil(viewX + viewW) + 4);
    const y1 = Math.min(WORLD_H - 1, Math.ceil(viewY + viewH) + 4);

    for (let y = y0; y <= y1; y++) {
      const rowOffset = y * rowStride;
      for (let x = x0; x <= x1; x++) {
        const i = rowOffset + x;
        const m = mats[i];
        if (m === Mat.EMPTY) {
          u32[i] = bg[i];
          continue;
        }

        if (m === Mat.SMOKE) {
          const fc = fg[i];
          const bc = bg[i];
          if (this.transparentEmpty && bc === 0) {
            if (IS_LITTLE_ENDIAN) {
              u32[i] = (140 << 24) | (fc & 0x00ffffff);
            } else {
              const [sr, sg, sb] = unpackColor(fc);
              u32[i] = packColor(sr, sg, sb, 140);
            }
          } else if (IS_LITTLE_ENDIAN) {
            const r = (((fc & 0xff) + (bc & 0xff)) >> 1);
            const g = ((((fc >>> 8) & 0xff) + ((bc >>> 8) & 0xff)) >> 1);
            const b = ((((fc >>> 16) & 0xff) + ((bc >>> 16) & 0xff)) >> 1);
            u32[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
          } else {
            const [sr, sg, sb] = unpackColor(fc);
            const [br, bgc, bb] = unpackColor(bc);
            u32[i] = packColor((sr + br) >> 1, (sg + bgc) >> 1, (sb + bb) >> 1, 255);
          }
          continue;
        }

        if (m === Mat.WATER || m === Mat.ACID || m === Mat.OIL || m === Mat.LAVA) {
          const fc = fg[i];
          const bc = bg[i];
          const above = i >= rowStride ? mats[i - rowStride] : Mat.EMPTY;
          const onSurface = above === Mat.EMPTY || above === Mat.SMOKE;
          if (IS_LITTLE_ENDIAN) {
            let r = fc & 0xff;
            let g = (fc >>> 8) & 0xff;
            let b = (fc >>> 16) & 0xff;
            const br = bc & 0xff;
            const bgg = (bc >>> 8) & 0xff;
            const bb = (bc >>> 16) & 0xff;

            if (m === Mat.WATER) {
              r = (r * 3 + br) >> 2;
              g = (g * 3 + bgg) >> 2;
              b = (b * 3 + bb) >> 2;
              if (onSurface) {
                const crest = ((x + (tick >> 2)) & 7) < 2;
                r = Math.min(255, r + (crest ? 90 : 38));
                g = Math.min(255, g + (crest ? 105 : 46));
                b = Math.min(255, b + (crest ? 115 : 54));
              }
            } else if (m === Mat.ACID) {
              if (onSurface) {
                const bubble = ((x + (tick >> 1)) & 11) < 2;
                r = Math.min(255, r + (bubble ? 85 : 28));
                g = Math.min(255, g + (bubble ? 65 : 22));
                b = Math.min(255, b + (bubble ? 40 : 10));
              } else if (((i + (tick >> 2)) & 63) === 0) {
                r = Math.min(255, r + 55);
                g = Math.min(255, g + 35);
              }
            } else if (m === Mat.LAVA) {
              // Animated swirling magma convection veins & incandescent surface crust
              const wave = ((x * 3 + y * 5 + (tick >> 1)) & 15);
              if (onSurface) {
                r = 255;
                g = wave < 5 ? 232 : 168;
                b = wave < 5 ? 96 : 28;
              } else if (wave < 4) {
                r = 255;
                g = Math.min(255, g + 68);
                b = Math.min(255, b + 28);
              } else if (wave > 12) {
                r = Math.max(150, r - 48);
                g = Math.max(30, g - 52);
                b = Math.max(8, b - 10);
              }
            } else if (onSurface && ((x + (tick >> 3)) & 9) === 0) {
              // Subtle iridescent oil sheen
              r = Math.min(255, r + 26);
              g = Math.min(255, g + 18);
              b = Math.min(255, b + 36);
            }
            u32[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
          } else {
            u32[i] = fc;
          }
          continue;
        }

        const d = dmgArr[i];
        const c = fg[i];

        // Dynamic edge beveling & overhang ambient occlusion for solid terrain
        let shadeScale = 256; // 256 = 1.0
        const props = MAT_PROPS[m as Mat];
        if (props.solid && m !== Mat.BEDROCK) {
          const above = i >= rowStride ? mats[i - rowStride] : Mat.BEDROCK;
          const below = i + rowStride < total ? mats[i + rowStride] : Mat.BEDROCK;
          const aboveOpen = above === Mat.EMPTY || above === Mat.LAVA || (above >= Mat.WATER && above <= Mat.SMOKE);
          const belowOpen = below === Mat.EMPTY || below === Mat.LAVA || (below >= Mat.WATER && below <= Mat.SMOKE);

          if (aboveOpen) {
            shadeScale = 312; // 1.22x top rim highlight
          } else if (belowOpen) {
            shadeScale = 176; // 0.69x overhang underside shadow
          } else {
            const left = i > 0 ? mats[i - 1] : Mat.BEDROCK;
            const right = i + 1 < total ? mats[i + 1] : Mat.BEDROCK;
            const sideOpen =
              left === Mat.EMPTY ||
              right === Mat.EMPTY ||
              left === Mat.LAVA ||
              right === Mat.LAVA ||
              (left >= Mat.WATER && left <= Mat.SMOKE) ||
              (right >= Mat.WATER && right <= Mat.SMOKE);
            if (sideOpen) {
              shadeScale = 220; // 0.86x side edge definition
            } else if (i >= rowStride * 2 && mats[i - rowStride * 2] === Mat.EMPTY) {
              shadeScale = 276; // 1.08x subtle inner top bevel
            }
          }

          // Animated shimmer glints on Crystal & Gold veins
          if ((m === Mat.CRYSTAL || m === Mat.GOLD) && ((i + (i >> 9) * 3 + (tick >> 2)) & 63) === 0) {
            shadeScale = 345;
          }
        }

        if (d > 0) {
          const maxHp = props.maxHp || 16;
          const frac = Math.min(1, d / maxHp);
          const isCrack = frac > 0.36 && ((i ^ (i >> 10)) & 1) === 0;
          const dmgScale = isCrack ? 105 : ((256 - frac * 112) | 0);
          shadeScale = (shadeScale * dmgScale) >> 8;
        }

        if (shadeScale === 256) {
          u32[i] = c;
        } else if (IS_LITTLE_ENDIAN) {
          let r = ((c & 0xff) * shadeScale) >> 8;
          let g = (((c >>> 8) & 0xff) * shadeScale) >> 8;
          let b = (((c >>> 16) & 0xff) * shadeScale) >> 8;
          if (r > 255) r = 255;
          if (g > 255) g = 255;
          if (b > 255) b = 255;
          u32[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
        } else {
          u32[i] = tintColor(c, shadeScale / 256);
        }
      }
    }

    // Draw dynamic particles directly into imgU32 (chunky debris, glowing spark streaks, soft dust puffs)
    const minPx = Math.max(1, x0);
    const maxPx = Math.min(WORLD_W - 2, x1);
    const minPy = Math.max(1, y0);
    const maxPy = Math.min(WORLD_H - 2, y1);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (px < minPx || px > maxPx || py < minPy || py > maxPy) continue;

      if (p.kind === 'DUST') {
        const alphaRatio = Math.max(0, Math.min(1, p.life / p.maxLife));
        const rad = p.size >= 3 ? 2 : 1;
        const pc = p.color;
        const pr = pc & 0xff;
        const pg = (pc >>> 8) & 0xff;
        const pb = (pc >>> 16) & 0xff;
        const mix = (alphaRatio * 0.42 * 256) | 0;
        if (mix <= 4) continue;
        const inv = 256 - mix;

        for (let dy = -rad; dy <= rad; dy++) {
          const yy = py + dy;
          if (yy <= 0 || yy >= WORLD_H - 1) continue;
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.abs(dx) + Math.abs(dy) > rad + 1) continue;
            const xx = px + dx;
            if (xx <= 0 || xx >= WORLD_W - 1) continue;
            const ui = yy * rowStride + xx;
            if (IS_LITTLE_ENDIAN) {
              const dst = u32[ui];
              if (this.transparentEmpty && (dst >>> 24) === 0) {
                u32[ui] = ((mix >> 1) << 24) | (pb << 16) | (pg << 8) | pr;
                continue;
              }
              const rr = ((dst & 0xff) * inv + pr * mix) >> 8;
              const gg = (((dst >>> 8) & 0xff) * inv + pg * mix) >> 8;
              const bb = (((dst >>> 16) & 0xff) * inv + pb * mix) >> 8;
              u32[ui] = (0xff << 24) | (bb << 16) | (gg << 8) | rr;
            }
          }
        }
      } else if (p.kind === 'SPARK') {
        u32[py * rowStride + px] = p.color;
        const tx = Math.round(p.x - p.vx * 0.014);
        const ty = Math.round(p.y - p.vy * 0.014);
        if (tx >= minPx && tx <= maxPx && ty >= minPy && ty <= maxPy) {
          const midX = (px + tx) >> 1;
          const midY = (py + ty) >> 1;
          u32[midY * rowStride + midX] = p.color;
          u32[ty * rowStride + tx] = tintColor(p.color, 0.65);
        }
      } else if (p.size >= 2) {
        // Chunky 2x2 shaded fragment
        u32[py * rowStride + px] = tintColor(p.color, 1.12);
        u32[py * rowStride + px + 1] = p.color;
        u32[(py + 1) * rowStride + px] = p.color;
        u32[(py + 1) * rowStride + px + 1] = tintColor(p.color, 0.75);
      } else {
        u32[py * rowStride + px] = p.color;
      }
    }

    this.offCtx.putImageData(this.imgData, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);

    // Draw rotating CrumblingBody wall segments!
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.x + b.w < x0 || b.x - b.w > x1 || b.y + b.h < y0 || b.y - b.h > y1) continue;
      const c = this.bodyCanvases.get(b.id);
      if (!c) continue;
      this.offCtx.save();
      this.offCtx.translate(b.x, b.y);
      this.offCtx.rotate(b.angle);
      this.offCtx.drawImage(c, -b.cx, -b.cy);
      this.offCtx.restore();
    }
  }
}

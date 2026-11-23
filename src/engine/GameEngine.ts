import {
  BOSS_SPECIAL_CATALOG,
  BossPartKey,
  countBossPartPixels,
  getBossOriginWorld,
  getPartDisabledCallout,
} from './bossSpecials';
import { BOSS_RELICS, CLASSES, LOOTABLE_WEAPONS, PERKS, WEAPONS } from './catalog';
import { generateHubLevel, generateLevel } from './LevelGenerator';
import { getAmmoLightSpec, LightingEngine, LightSource, parseHexRgb } from './LightingEngine';
import { PixelWorld } from './PixelWorld';
import { packColor } from './prng';
import { rockMusic } from './RockMusicEngine';
import { sfx } from './SoundFX';
import {
  BiomeConfig,
  ClassId,
  DamageType,
  Enemy,
  GameState,
  HubNpc,
  HubTarget,
  HudPalette,
  HudSnapshot,
  LevelLightDef,
  MAT_PROPS,
  Mat,
  MetaProgress,
  PerkDef,
  PerkId,
  Pickup,
  PixelBoss,
  Player,
  Portal,
  Projectile,
  RelicDraftOption,
  RelicId,
  RelicPedestal,
  RunStats,
  WORLD_H,
  WORLD_W,
  WeaponId,
} from './types';

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
}

interface BeamFlash {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  life: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface VfxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'SPARK' | 'SMOKE' | 'CASING' | 'MOTE' | 'SHARD';
  rot: number;
  rotSpeed: number;
}

interface MuzzleFlash {
  x: number;
  y: number;
  angle: number;
  color: string;
  life: number;
  maxLife: number;
}

interface DashGhost {
  x: number;
  y: number;
  facing: 1 | -1;
  life: number;
  maxLife: number;
}

interface TransientLight {
  x: number;
  y: number;
  radius: number;
  rgb: [number, number, number];
  intensity: number;
  volumetric: number;
  life: number;
  maxLife: number;
  castShadows: boolean;
}

export interface EngineCallbacks {
  onStateChange: (state: GameState) => void;
  onHudUpdate: (hud: HudSnapshot) => void;
  onPaletteChange?: (palette: HudPalette) => void;
  onUpgradeChoices: (choices: PerkDef[]) => void;
  onBossRelicChoices: (choices: RelicDraftOption[]) => void;
  onGameOver: (stats: RunStats) => void;
  onOpenVaultModal?: () => void;
  onOpenExpeditionModal?: () => void;
  onOpenSettingsModal?: () => void;
}

const GRAVITY = 420;

export class GameEngine {
  readonly world = new PixelWorld();
  private lighting = new LightingEngine();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private state: GameState = 'TITLE_MENU';
  private rafId = 0;
  private lastTime = 0;
  private hudTimer = 0;

  // Level & run state
  private seed = 482913;
  private depth = 1;
  private biome!: BiomeConfig;
  private player!: Player;
  private enemies: Enemy[] = [];
  private boss: PixelBoss | null = null;
  private bossCanvas: HTMLCanvasElement = document.createElement('canvas');
  private bossRelicPendingTimer = 0;
  private bossBfsComp = new Int32Array(0);
  private bossBfsQueue = new Int32Array(0);
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private pedestals: RelicPedestal[] = [];
  private portal!: Portal;
  private floatingTexts: FloatingText[] = [];
  private beamFlashes: BeamFlash[] = [];
  private shockRings: ShockRing[] = [];
  private vfxParticles: VfxParticle[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private dashGhosts: DashGhost[] = [];
  private transientLights: TransientLight[] = [];
  private hubNpcs: HubNpc[] = [];
  private hubTargets: HubTarget[] = [];
  private levelLights: LevelLightDef[] = [];
  private archivistLineIdx = 0;
  private scarfNodes: Array<{ x: number; y: number }> = [];
  private weaponRecoil = 0;
  private ambientMoteTimer = 0;
  private nextId = 1000;

  // Stats
  private kills = 0;
  private elapsedSeconds = 0;
  private playerSpeedMul = 1.0;
  private metaDamageMul = 1.0;
  private metaArmorMul = 1.0;
  private dashCount = 0;
  private collapseHealCooldown = 0;

  // Camera
  private camX = 0;
  private camY = 0;
  private viewSimW = 400;
  private viewSimH = 225;
  private shakeMag = 0;
  private demoPanDir = 1;

  // Input
  private keys = new Set<string>();
  private mouseScreenX = 0;
  private mouseScreenY = 0;
  private hasPointerMoved = false;
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private touchMoveAxis = 0;
  private touchAimActive = false;
  private touchAimFiring = false;
  private touchAimAngle = 0;
  private touchAimHoldTimer = 0;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onTouchStartBound: (e: TouchEvent) => void;
  private onTouchMoveBound: (e: TouchEvent) => void;
  private onTouchEndBound: (e: TouchEvent) => void;
  private onWheelBound: (e: WheelEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onResizeBound: () => void;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not initialize 2D context');
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onMouseMoveBound = this.handleMouseMove.bind(this);
    this.onMouseDownBound = this.handleMouseDown.bind(this);
    this.onMouseUpBound = this.handleMouseUp.bind(this);
    this.onTouchStartBound = this.handleTouchStart.bind(this);
    this.onTouchMoveBound = this.handleTouchMove.bind(this);
    this.onTouchEndBound = this.handleTouchEnd.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);
    this.onContextMenuBound = (e) => e.preventDefault();
    this.onResizeBound = this.handleResize.bind(this);

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    canvas.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    canvas.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
    window.addEventListener('touchend', this.onTouchEndBound);
    window.addEventListener('touchcancel', this.onTouchEndBound);
    canvas.addEventListener('wheel', this.onWheelBound, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenuBound);
    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.addEventListener('resize', this.onResizeBound);

    this.handleResize();
    this.loadTitlePreview(this.seed);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    this.canvas.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    this.canvas.removeEventListener('touchstart', this.onTouchStartBound);
    this.canvas.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('touchend', this.onTouchEndBound);
    window.removeEventListener('touchcancel', this.onTouchEndBound);
    this.canvas.removeEventListener('wheel', this.onWheelBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.removeEventListener('resize', this.onResizeBound);
  }

  startLoop(): void {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(0.033, Math.max(0.001, rawDt));
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  loadTitlePreview(seed: number): void {
    this.seed = seed;
    this.depth = 1;
    const lvl = generateLevel(this.world, this.seed, 1);
    this.biome = lvl.biome;
    this.enemies = lvl.enemies;
    this.boss = null;
    this.pedestals = lvl.pedestals;
    this.portal = lvl.portal;
    this.pickups = [];
    this.projectiles = [];
    this.transientLights = [];
    this.hubNpcs = [];
    this.hubTargets = [];
    this.levelLights = lvl.levelLights ?? [];
    this.camX = 120;
    this.camY = Math.max(0, Math.min(WORLD_H - this.viewSimH, lvl.spawnY - this.viewSimH * 0.5));
    this.callbacks.onPaletteChange?.(this.biome.hudPalette);
  }

  loadHubWorld(): void {
    sfx.unlock();
    const lvl = generateHubLevel(this.world);
    this.biome = lvl.biome;
    this.depth = 1;
    this.enemies = [];
    this.boss = null;
    this.pickups = [];
    this.pedestals = lvl.pedestals;
    this.portal = lvl.portal;
    this.hubNpcs = lvl.hubNpcs ?? [];
    this.hubTargets = lvl.hubTargets ?? [];
    this.levelLights = lvl.levelLights ?? lvl.hubLights ?? [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.beamFlashes = [];
    this.shockRings = [];
    this.vfxParticles = [];
    this.muzzleFlashes = [];
    this.dashGhosts = [];
    this.transientLights = [];
    this.weaponRecoil = 0;

    const cls = CLASSES['BREACHER'];
    this.player = {
      x: lvl.spawnX,
      y: lvl.spawnY,
      vx: 0,
      vy: 0,
      w: 8,
      h: 15,
      hp: cls.maxHp,
      maxHp: cls.maxHp,
      facing: 1,
      aimAngle: 0,
      grounded: true,
      coyoteTimer: 0.32,
      jumpBufferTimer: 0,
      jumpsRemaining: 1,
      maxAirJumps: 1,
      dashTimer: 0,
      dashCooldown: 0,
      invulnTimer: 0,
      weapons: [cls.primaryWeapon, cls.secondaryWeapon],
      weaponDupes: {},
      activeWeaponIdx: 0,
      fireCooldown: 0,
      bombs: cls.maxBombs,
      maxBombs: cls.maxBombs,
      bombRechargeTimer: 0,
      gold: 0,
      perks: [],
      relics: [],
      relicLevels: {},
    };
    this.scarfNodes = [
      { x: lvl.spawnX, y: lvl.spawnY - 11 },
      { x: lvl.spawnX - 2, y: lvl.spawnY - 11 },
      { x: lvl.spawnX - 4, y: lvl.spawnY - 10 },
    ];

    this.camX = Math.max(0, Math.min(WORLD_W - this.viewSimW, this.player.x - this.viewSimW * 0.5));
    this.camY = Math.max(0, Math.min(WORLD_H - this.viewSimH, this.player.y - this.viewSimH * 0.55));
    this.callbacks.onPaletteChange?.(this.biome.hudPalette);
    this.setState('HUB_WORLD');
    this.emitHud();
  }

  startNewRun(classId: ClassId, seed: number, meta?: MetaProgress): void {
    sfx.unlock();
    const cls = CLASSES[classId];
    this.seed = seed;
    this.depth = 1;
    this.kills = 0;
    this.elapsedSeconds = 0;
    this.dashCount = 0;
    this.collapseHealCooldown = 0;

    const maxHp = cls.maxHp + (meta?.maxHpLevel ?? 0) * 25;
    const maxBombs = cls.maxBombs + (meta?.startBombsLevel ?? 0);
    this.metaDamageMul = 1.0 + (meta?.damageLevel ?? 0) * 0.06;
    this.metaArmorMul = Math.max(0.1, 1.0 - (meta?.armorLevel ?? 0) * 0.04);
    this.playerSpeedMul = cls.speedMul * (1.0 + (meta?.speedLevel ?? 0) * 0.05);

    this.world.pixelsDestroyedCount = 0;
    this.world.segmentsCollapsedCount = 0;
    this.forgeUpgradeCount = 0;
    this.forgeRerollCount = 0;

    this.player = {
      x: 60,
      y: 120,
      vx: 0,
      vy: 0,
      w: 8,
      h: 15,
      hp: maxHp,
      maxHp: maxHp,
      facing: 1,
      aimAngle: 0,
      grounded: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpsRemaining: 0,
      maxAirJumps: 0,
      dashTimer: 0,
      dashCooldown: 0,
      invulnTimer: 0,
      weapons: [cls.primaryWeapon, cls.secondaryWeapon],
      weaponDupes: {},
      activeWeaponIdx: 0,
      fireCooldown: 0,
      bombs: maxBombs,
      maxBombs: maxBombs,
      bombRechargeTimer: 0,
      gold: 0,
      perks: [],
      relics: [],
      relicLevels: {},
    };

    this.loadDepth(1);
    this.setState('PLAYING');
  }

  startBossRun(classId: ClassId, seed: number, meta?: MetaProgress, targetDepth = 10): void {
    sfx.unlock();
    const cls = CLASSES[classId];
    this.seed = (seed ^ Math.floor(Math.random() * 0x7FFFFFFF)) >>> 0;
    this.depth = targetDepth;
    this.kills = 0;
    this.elapsedSeconds = 0;
    this.dashCount = 0;
    this.collapseHealCooldown = 0;

    const maxHp = cls.maxHp + (meta?.maxHpLevel ?? 0) * 25;
    const maxBombs = cls.maxBombs + (meta?.startBombsLevel ?? 0);
    this.metaDamageMul = 1.0 + (meta?.damageLevel ?? 0) * 0.06;
    this.metaArmorMul = Math.max(0.1, 1.0 - (meta?.armorLevel ?? 0) * 0.04);
    this.playerSpeedMul = cls.speedMul * (1.0 + (meta?.speedLevel ?? 0) * 0.05);

    this.world.pixelsDestroyedCount = 0;
    this.world.segmentsCollapsedCount = 0;
    this.forgeUpgradeCount = 0;
    this.forgeRerollCount = 0;

    this.player = {
      x: 60,
      y: 120,
      vx: 0,
      vy: 0,
      w: 8,
      h: 15,
      hp: maxHp,
      maxHp: maxHp,
      facing: 1,
      aimAngle: 0,
      grounded: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpsRemaining: 0,
      maxAirJumps: 0,
      dashTimer: 0,
      dashCooldown: 0,
      invulnTimer: 0,
      weapons: [cls.primaryWeapon, cls.secondaryWeapon],
      weaponDupes: {},
      activeWeaponIdx: 0,
      fireCooldown: 0,
      bombs: maxBombs,
      maxBombs: maxBombs,
      bombRechargeTimer: 0,
      gold: 250,
      perks: [],
      relics: [],
      relicLevels: {},
    };

    this.loadDepth(targetDepth);
    this.setState('PLAYING');
  }

  private loadDepth(depth: number): void {
    this.depth = depth;
    const lvl = generateLevel(this.world, this.seed, depth);
    this.biome = lvl.biome;
    this.enemies = lvl.enemies;
    this.boss = lvl.boss;
    this.bossRelicPendingTimer = 0;
    if (this.boss) {
      this.bossCanvas.width = this.boss.w;
      this.bossCanvas.height = this.boss.h;
    }
    this.pickups = lvl.pickups;
    this.pedestals = lvl.pedestals;
    this.portal = lvl.portal;
    this.projectiles = [];
    this.floatingTexts = [];
    this.beamFlashes = [];
    this.shockRings = [];
    this.vfxParticles = [];
    this.muzzleFlashes = [];
    this.dashGhosts = [];
    this.transientLights = [];
    this.hubNpcs = [];
    this.hubTargets = [];
    this.levelLights = lvl.levelLights ?? [];
    this.weaponRecoil = 0;

    this.player.x = lvl.spawnX;
    this.player.y = lvl.spawnY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invulnTimer = 1.0;
    this.scarfNodes = [
      { x: lvl.spawnX, y: lvl.spawnY - 11 },
      { x: lvl.spawnX - 2, y: lvl.spawnY - 11 },
      { x: lvl.spawnX - 4, y: lvl.spawnY - 10 },
    ];

    this.camX = Math.max(0, Math.min(WORLD_W - this.viewSimW, this.player.x - this.viewSimW * 0.35));
    this.camY = Math.max(0, Math.min(WORLD_H - this.viewSimH, this.player.y - this.viewSimH * 0.55));
    this.callbacks.onPaletteChange?.(this.biome.hudPalette);
    this.emitHud();
  }

  setState(newState: GameState): void {
    this.state = newState;
    this.mouseDownLeft = false;
    this.mouseDownRight = false;
    this.touchMoveAxis = 0;
    this.touchAimActive = false;
    this.touchAimFiring = false;
    this.touchAimHoldTimer = 0;
    this.callbacks.onStateChange(newState);
  }

  setTouchMove(axis: number): void {
    this.touchMoveAxis = Math.max(-1, Math.min(1, axis));
  }

  setTouchAim(dx: number, dy: number, active: boolean): void {
    if (active) {
      sfx.unlock();
      this.touchAimActive = true;
      const mag = Math.hypot(dx, dy);
      if (mag > 0.12) {
        this.touchAimAngle = Math.atan2(dy, dx);
        this.touchAimHoldTimer = 1.4;
        this.hasPointerMoved = false;
      }
      this.touchAimFiring = mag > 0.24;
    } else {
      this.touchAimActive = false;
      this.touchAimFiring = false;
    }
  }

  setTouchJump(pressed: boolean): void {
    sfx.unlock();
    if ((this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') || !this.player) return;
    if (pressed) {
      this.player.jumpBufferTimer = 0.24;
    } else if (this.player.vy < -75) {
      this.player.vy *= 0.55;
    }
  }

  triggerTouchDash(): void {
    sfx.unlock();
    if ((this.state === 'PLAYING' || this.state === 'HUB_WORLD') && this.player) {
      this.tryDash();
    }
  }

  triggerTouchBomb(): void {
    sfx.unlock();
    if ((this.state === 'PLAYING' || this.state === 'HUB_WORLD') && this.player) {
      this.tryThrowBomb();
    }
  }

  triggerTouchInteract(): void {
    sfx.unlock();
    if ((this.state === 'PLAYING' || this.state === 'HUB_WORLD') && this.player) {
      this.tryInteract();
    }
  }

  cycleWeapon(): void {
    sfx.unlock();
    if (!this.player || this.player.weapons.length <= 1) return;
    this.player.activeWeaponIdx = (this.player.activeWeaponIdx + 1) % this.player.weapons.length;
    this.emitHud();
  }

  selectWeapon(idx: number): void {
    if (!this.player) return;
    if (idx >= 0 && idx < this.player.weapons.length) {
      this.player.activeWeaponIdx = idx;
      this.emitHud();
    }
  }

  applyPerkAndDescend(perkId: PerkId): void {
    sfx.playPickup('upgrade');
    this.player.perks.push(perkId);
    if (perkId === 'TITAN_PLATING') {
      this.player.maxHp += 35;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
    } else if (perkId === 'DEMOLITIONIST') {
      this.player.maxBombs += 2;
      this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 2);
    } else if (perkId === 'TWIN_THRUSTERS') {
      this.player.maxAirJumps += 1;
    }
    // Small depth recovery
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
    this.loadDepth(this.depth + 1);
    this.setState('PLAYING');
  }

  applyRelicAndContinue(relicId: RelicId): void {
    sfx.playPickup('upgrade');
    const nextLv = (this.player.relicLevels[relicId] ?? 0) + 1;
    this.player.relicLevels[relicId] = nextLv;
    if (!this.player.relics.includes(relicId)) {
      this.player.relics.push(relicId);
    }
    if (relicId === 'SIEGE_HEART') {
      this.player.maxBombs += 1;
      this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1);
    } else if (relicId === 'SALVAGE_MAGNET') {
      this.player.maxHp += 45;
      this.player.hp = this.player.maxHp;
    } else if (relicId === 'CHRONO_THRUSTER') {
      this.playerSpeedMul *= nextLv === 1 ? 1.2 : 1.1;
    }
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    const label = nextLv > 1 ? `${BOSS_RELICS[relicId].name} Rank ${nextLv}` : BOSS_RELICS[relicId].name;
    this.spawnFloatingText(this.player.x, this.player.y - 18, label, BOSS_RELICS[relicId].accentColor);
    this.setState('PLAYING');
    this.emitHud();
  }

  private getRelicLevel(id: RelicId): number {
    return this.player?.relicLevels[id] ?? 0;
  }

  private hasRelic(id: RelicId): boolean {
    return this.getRelicLevel(id) > 0;
  }

  private hasPerk(id: PerkId): boolean {
    return this.player.perks.includes(id);
  }

  private countPerk(id: PerkId): number {
    let c = 0;
    for (const p of this.player.perks) if (p === id) c++;
    return c;
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width || window.innerWidth));
    const h = Math.max(200, Math.round(rect.height || window.innerHeight));
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;

    const aspect = w / h;
    if (aspect >= 1) {
      // Landscape (desktop, tablet, or landscape phone): keep square pixels
      const targetH = h < 500 ? 170 : 216;
      this.viewSimH = Math.min(WORLD_H, targetH);
      this.viewSimW = Math.min(WORLD_W, Math.round(this.viewSimH * aspect));
      if (this.viewSimW >= WORLD_W) {
        this.viewSimW = WORLD_W;
        this.viewSimH = Math.min(WORLD_H, Math.round(this.viewSimW / aspect));
      }
    } else {
      // Portrait phone: target comfortable horizontal width while maintaining 1:1 square pixels
      const targetW = 192;
      const rawH = Math.round(targetW / aspect);
      this.viewSimH = Math.min(WORLD_H, rawH);
      this.viewSimW = Math.min(WORLD_W, Math.round(this.viewSimH * aspect));
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const code = e.code;

    if (code === 'Escape') {
      if (this.state === 'PLAYING' || this.state === 'HUB_WORLD') {
        this.setState('PAUSED');
      } else if (this.state === 'PAUSED') {
        this.setState('PLAYING');
      }
      return;
    }

    if (this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') return;

    if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
      e.preventDefault();
    }

    if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
      this.player.jumpBufferTimer = 0.24;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.tryDash();
    }
    if (code === 'KeyE' || code === 'KeyQ') {
      this.tryThrowBomb();
    }
    if (code === 'Digit1') this.selectWeapon(0);
    if (code === 'Digit2') this.selectWeapon(1);
    if (code === 'Digit3') this.selectWeapon(2);
    if (code === 'KeyF') {
      this.tryInteract();
    }

    this.keys.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.code);
    // Variable jump height cut
    if (
      (this.state === 'PLAYING' || this.state === 'HUB_WORLD') &&
      (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') &&
      this.player.vy < -75
    ) {
      this.player.vy *= 0.55;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreenX = e.clientX - rect.left;
    this.mouseScreenY = e.clientY - rect.top;
    this.hasPointerMoved = true;
  }

  private handleMouseDown(e: MouseEvent): void {
    sfx.unlock();
    if (this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') return;
    if (e.button === 0) {
      this.mouseDownLeft = true;
    } else if (e.button === 2) {
      this.mouseDownRight = true;
      this.tryThrowBomb();
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseDownLeft = false;
    if (e.button === 2) this.mouseDownRight = false;
  }

  private handleTouchStart(e: TouchEvent): void {
    sfx.unlock();
    if (this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') return;
    e.preventDefault();
  }

  private handleTouchMove(e: TouchEvent): void {
    if (this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') return;
    e.preventDefault();
  }

  private handleTouchEnd(_e: TouchEvent): void {
    // Touch aiming and firing are handled by the right thumbstick
  }

  private handleWheel(e: WheelEvent): void {
    if ((this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') || !this.player) return;
    const len = this.player.weapons.length;
    if (len <= 1) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.player.activeWeaponIdx = (this.player.activeWeaponIdx + dir + len) % len;
    this.emitHud();
  }

  private getMouseWorld(): { x: number; y: number } {
    const wx = this.camX + (this.mouseScreenX / Math.max(1, this.canvas.width)) * this.viewSimW;
    const wy = this.camY + (this.mouseScreenY / Math.max(1, this.canvas.height)) * this.viewSimH;
    return { x: wx, y: wy };
  }

  private update(dt: number): void {
    if (this.state === 'TITLE_MENU') {
      this.world.step(dt);
      this.updateAmbientMotes(dt);
      this.updateEffects(dt);
      this.camX += this.demoPanDir * 14 * dt;
      if (this.camX > WORLD_W - this.viewSimW - 40) this.demoPanDir = -1;
      if (this.camX < 40) this.demoPanDir = 1;
      rockMusic.updateIntensity(0);
      return;
    }

    if (this.state !== 'PLAYING' && this.state !== 'HUB_WORLD') {
      rockMusic.updateIntensity(0);
      return;
    }

    const isHub = this.state === 'HUB_WORLD';

    const enemyCount = isHub ? 0 : this.enemies.length;
    const projCount = this.projectiles.length;
    const hasBoss = (isHub || !this.boss) ? 0 : 1;
    const actionIntensity = isHub ? 0 : Math.min(
      1,
      enemyCount * 0.14 + projCount * 0.04 + hasBoss * 0.45 + (this.shakeMag > 1.5 ? 0.35 : 0)
    );
    rockMusic.updateIntensity(actionIntensity);

    this.elapsedSeconds += dt;
    this.collapseHealCooldown = Math.max(0, this.collapseHealCooldown - dt);

    if (!isHub && this.bossRelicPendingTimer > 0) {
      this.bossRelicPendingTimer -= dt;
      if (this.bossRelicPendingTimer <= 0 && !this.boss) {
        this.openBossRelicChoice();
        return;
      }
    }

    // Step pixel world (CA, falling particles, rotating crumbling wall segments!)
    this.world.step(dt);

    if (!isHub) {
      // Spawn collectible gold shards from mined GOLD veins & smashed JARs
      const goldDrops = this.world.consumeGoldDrops();
      for (const g of goldDrops) {
        this.pickups.push({
          id: this.nextId++,
          kind: 'GOLD',
          x: g.x,
          y: g.y,
          vx: (Math.random() - 0.5) * 65,
          vy: -55 - Math.random() * 45,
          value: 2,
          age: 0,
        });
      }

      // Apply crushing hits from falling CrumblingBody segments!
      const crushHits = this.world.consumeCrushHits();
      if (crushHits.length > 0) {
        const saboteurMul = this.hasPerk('STRUCTURAL_SABOTEUR') ? 2.0 : 1.0;
        const siegeLv = this.getRelicLevel('SIEGE_HEART');
        if (siegeLv > 0 && this.collapseHealCooldown <= 0) {
          this.collapseHealCooldown = 1.2;
          const healAmt = 8 * siegeLv;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
          this.spawnFloatingText(this.player.x, this.player.y - this.player.h - 6, `+${healAmt} HP`, '#F59E0B');
        }
        for (const hit of crushHits) {
          this.shakeMag = Math.max(this.shakeMag, 3.2);
          if (siegeLv > 0) {
            const hx = hit.x + hit.w * 0.5;
            const hy = hit.y + hit.h * 0.5;
            this.spawnShockRing(hx, hy, 20 + (siegeLv - 1) * 6, '#F59E0B');
          }
          for (let i = this.enemies.length - 1; i >= 0; i--) {
            const en = this.enemies[i];
            if (
              en.x + en.w * 0.5 >= hit.x &&
              en.x - en.w * 0.5 <= hit.x + hit.w &&
              en.y + en.h * 0.5 >= hit.y &&
              en.y - en.h * 0.5 <= hit.y + hit.h
            ) {
              this.damageEnemy(en, Math.round(hit.damage * saboteurMul), true);
            }
          }
          if (this.boss) {
            const bx0 = this.boss.x - this.boss.w * 0.5;
            const by0 = this.boss.y - this.boss.h;
            if (
              hit.x + hit.w >= bx0 &&
              hit.x <= bx0 + this.boss.w &&
              hit.y + hit.h >= by0 &&
              hit.y <= this.boss.y
            ) {
              const cx = Math.max(bx0, Math.min(bx0 + this.boss.w, hit.x + hit.w * 0.5));
              const cy = Math.max(by0, Math.min(this.boss.y, hit.y + hit.h * 0.5));
              this.damageBossAtWorld(cx, cy, 10, 7, Math.round(hit.damage * saboteurMul), 'EXPLOSIVE', false, false);
            }
          }
        }
      }
    }

    this.updatePlayer(dt);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    if (isHub) {
      this.updateHubEntities(dt);
    } else {
      this.updateEnemies(dt);
      this.updateBoss(dt);
    }
    this.updatePickups(dt);
    this.updateAmbientMotes(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);

    this.hudTimer += dt;
    if (this.hudTimer >= 0.08) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dashTimer = Math.max(0, p.dashTimer - dt);
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);

    // Bomb recharge
    if (p.bombs < p.maxBombs) {
      const rechargeDur = this.hasPerk('DEMOLITIONIST') ? 4.8 : 7.5;
      p.bombRechargeTimer += dt;
      if (p.bombRechargeTimer >= rechargeDur) {
        p.bombRechargeTimer = 0;
        p.bombs++;
      }
    } else {
      p.bombRechargeTimer = 0;
    }

    // Horizontal input (keyboard + analog left thumbstick)
    const keyLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const keyRight = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const keyDir = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    const moveDir = keyDir !== 0 ? keyDir : this.touchMoveAxis;

    if (!this.touchAimActive && this.touchAimHoldTimer > 0) {
      this.touchAimHoldTimer = Math.max(0, this.touchAimHoldTimer - dt);
    }

    // Aim angle (right thumbstick > mouse pointer > movement facing)
    if (this.touchAimActive || this.touchAimHoldTimer > 0) {
      p.aimAngle = this.touchAimAngle;
      p.facing = Math.cos(this.touchAimAngle) >= 0 ? 1 : -1;
    } else if (this.hasPointerMoved) {
      const mw = this.getMouseWorld();
      const aimDx = mw.x - p.x;
      const aimDy = mw.y - (p.y - p.h * 0.45);
      p.aimAngle = Math.atan2(aimDy, aimDx);
      p.facing = aimDx >= 0 ? 1 : -1;
    } else {
      if (Math.abs(moveDir) > 0.2) p.facing = moveDir > 0 ? 1 : -1;
      p.aimAngle = p.facing >= 0 ? 0 : Math.PI;
    }

    const maxRunSpeed = 108 * this.playerSpeedMul;
    this.weaponRecoil = Math.max(0, this.weaponRecoil - dt * 10);

    if (p.dashTimer > 0) {
      // Dash afterimage silhouette & intense thruster plumes
      if (Math.random() < 0.72) {
        this.dashGhosts.push({
          x: p.x,
          y: p.y,
          facing: p.facing,
          life: 0.16,
          maxLife: 0.16,
        });
      }
      this.spawnVfx(
        p.x - p.facing * 4,
        p.y - p.h * 0.45 + (Math.random() - 0.5) * 4,
        -p.facing * (70 + Math.random() * 45),
        (Math.random() - 0.5) * 30,
        'SPARK',
        '#38BDF8',
        1.4,
        0.24
      );
      this.world.spawnParticle(
        p.x - p.facing * 4,
        p.y - p.h * 0.4 + (Math.random() - 0.5) * 4,
        -p.facing * 60 + (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 25,
        Mat.EMBER,
        packColor(255, 190, 60),
        0.35,
        false
      );
    } else {
      const targetVx = moveDir * maxRunSpeed;
      const accel = p.grounded ? 560 : 420;
      if (moveDir === 0) {
        const friction = p.grounded ? 720 : 340;
        if (p.vx > 0) p.vx = Math.max(0, p.vx - friction * dt);
        else if (p.vx < 0) p.vx = Math.min(0, p.vx + friction * dt);
      } else {
        if (p.vx < targetVx) {
          p.vx = Math.min(targetVx, p.vx + accel * dt);
        } else if (p.vx > targetVx) {
          p.vx = Math.max(targetVx, p.vx - accel * dt);
        }
      }
    }

    // Update trailing tactical scarf nodes
    const anchorX = p.x - p.facing * 2;
    const anchorY = p.y - 11;
    if (this.scarfNodes.length < 3) {
      this.scarfNodes = [
        { x: anchorX, y: anchorY },
        { x: anchorX - p.facing * 2, y: anchorY + 1 },
        { x: anchorX - p.facing * 4, y: anchorY + 2 },
      ];
    } else {
      this.scarfNodes[0].x = anchorX;
      this.scarfNodes[0].y = anchorY;
      for (let s = 1; s < this.scarfNodes.length; s++) {
        const prev = this.scarfNodes[s - 1];
        const cur = this.scarfNodes[s];
        const targetX = prev.x - p.facing * 2.1 - p.vx * 0.015;
        const targetY = prev.y + 0.8 + Math.sin(this.elapsedSeconds * 11 + s) * 0.55;
        cur.x += (targetX - cur.x) * Math.min(1, 22 * dt);
        cur.y += (targetY - cur.y) * Math.min(1, 22 * dt);
      }
    }

    // Liquid buoyancy check
    const bodyMat = this.world.getMat(Math.round(p.x), Math.round(p.y - 4));
    const inLiquid = bodyMat === Mat.WATER || bodyMat === Mat.OIL || bodyMat === Mat.ACID || bodyMat === Mat.LAVA;

    if (p.dashTimer <= 0) {
      p.vy += (inLiquid ? GRAVITY * 0.42 : GRAVITY) * dt;
      if (p.vy > (inLiquid ? 95 : 270)) p.vy = inLiquid ? 95 : 270;
    }

    // Jump execution (with coyote time + air jump)
    if (p.jumpBufferTimer > 0) {
      if (p.coyoteTimer > 0 || inLiquid) {
        p.vy = -190;
        p.grounded = false;
        p.coyoteTimer = 0;
        p.jumpBufferTimer = 0;
        sfx.playJump();
      } else if (p.jumpsRemaining > 0) {
        p.vy = -178;
        p.jumpsRemaining--;
        p.jumpBufferTimer = 0;
        sfx.playJump();
        for (let i = 0; i < 6; i++) {
          this.world.spawnParticle(
            p.x + (Math.random() - 0.5) * 6,
            p.y,
            (Math.random() - 0.5) * 55,
            45 + Math.random() * 40,
            Mat.EMBER,
            packColor(140, 220, 255),
            0.25,
            false
          );
        }
      }
    }

    // Move & collide horizontally with step-up, leg-pixel wading, and jump clearance
    this.moveEntityWithPixelCollision(p, p.vx * dt, p.vy * dt, true, true);

    if (p.grounded) {
      p.coyoteTimer = 0.32;
      p.jumpsRemaining = 1 + p.maxAirJumps;
    }

    // Environmental hazard check (FIRE, LAVA, or ACID) — safe in Hub Bastion
    if (this.state !== 'HUB_WORLD' && p.invulnTimer <= 0) {
      let fireHits = 0;
      let lavaHits = 0;
      let acidHits = 0;
      for (let py = Math.round(p.y - p.h + 2); py <= Math.round(p.y - 1); py += 3) {
        const m = this.world.getMat(Math.round(p.x), py);
        if (m === Mat.FIRE && !this.hasRelic('THERMAL_REACTOR')) fireHits++;
        if (m === Mat.LAVA && !this.hasRelic('THERMAL_REACTOR')) lavaHits++;
        if (m === Mat.ACID && !this.hasRelic('ALCHEMIST_HEART')) acidHits++;
      }
      if (lavaHits > 0 || acidHits > 0 || fireHits > 1) {
        const resist = this.hasPerk('CRYO_SHIELDING') ? 0.4 : 1.0;
        const baseDmg = lavaHits > 0 ? 9 : acidHits > 0 ? 7 : 5;
        const dmg = Math.max(1, Math.round(baseDmg * resist));
        this.damagePlayer(dmg, 0);
      }
    }
  }

  private tryDash(): void {
    const p = this.player;
    if (p.dashCooldown > 0) return;
    const moveLeft = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const moveRight = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const dir = moveRight
      ? 1
      : moveLeft
      ? -1
      : Math.abs(this.touchMoveAxis) > 0.2
      ? this.touchMoveAxis > 0
        ? 1
        : -1
      : p.facing;

    p.vx = dir * 245;
    p.vy = Math.min(p.vy, 0) * 0.2;
    p.dashTimer = 0.14;
    p.invulnTimer = Math.max(p.invulnTimer, 0.22);
    p.dashCooldown = this.hasPerk('TWIN_THRUSTERS') ? 0.65 : 0.95;

    const chronoLv = this.getRelicLevel('CHRONO_THRUSTER');
    if (chronoLv > 0) {
      this.dashCount++;
      const bx = p.x;
      const by = p.y - p.h * 0.5;
      const pulseRad = 14 + (chronoLv - 1) * 6;
      const pulseDmg = 28 * chronoLv;
      this.world.destroyCircle(bx, by, pulseRad, 6 + (chronoLv - 1) * 2, 'EXPLOSIVE', this.hasRelic('THERMAL_REACTOR'), this.hasRelic('ALCHEMIST_HEART'));
      this.spawnShockRing(bx, by, pulseRad + 8, '#A78BFA');
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const en = this.enemies[i];
        if (Math.hypot(en.x - bx, en.y - en.h * 0.5 - by) <= pulseRad + 12) {
          this.damageEnemy(en, pulseDmg, false);
        }
      }
      if (this.boss) {
        const bx0 = this.boss.x - this.boss.w * 0.5;
        const by0 = this.boss.y - this.boss.h;
        const cx = Math.max(bx0, Math.min(bx0 + this.boss.w, bx));
        const cy = Math.max(by0, Math.min(this.boss.y, by));
        if (Math.hypot(cx - bx, cy - by) <= pulseRad + 10) {
          this.damageBossAtWorld(cx, cy, pulseRad, 6 + (chronoLv - 1) * 2, 32 * chronoLv, 'EXPLOSIVE', false, false);
        }
      }
      const bombCadence = chronoLv >= 2 ? 1 : 2;
      if (this.dashCount % bombCadence === 0 && p.bombs < p.maxBombs) {
        const restoreAmt = chronoLv >= 3 ? 2 : 1;
        p.bombs = Math.min(p.maxBombs, p.bombs + restoreAmt);
        this.spawnFloatingText(p.x, p.y - p.h - 4, `+${restoreAmt} Bomb`, '#A78BFA');
      }
    }

    sfx.playDash();
  }

  private tryThrowBomb(): void {
    const p = this.player;
    if (p.bombs <= 0) return;
    p.bombs--;
    const spd = 215;
    const muzzleX = p.x + Math.cos(p.aimAngle) * 6;
    const muzzleY = p.y - p.h * 0.5 + Math.sin(p.aimAngle) * 6;

    const siegeLv = this.getRelicLevel('SIEGE_HEART');
    const demoBonus = (this.hasPerk('DEMOLITIONIST') ? 1.35 : 1.0) * (siegeLv > 0 ? 1 + 0.5 * siegeLv : 1.0);
    const powerBonus = 3 * siegeLv;
    this.projectiles.push({
      id: this.nextId++,
      fromPlayer: true,
      damageType: 'EXPLOSIVE',
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(p.aimAngle) * spd + p.vx * 0.25,
      vy: Math.sin(p.aimAngle) * spd - 35,
      damage: Math.round(60 * this.metaDamageMul),
      blastRadius: 19 * demoBonus,
      blastPower: 8 + powerBonus,
      pierce: 0,
      gravity: 260,
      ignite: this.hasPerk('THERMITE_PAYLOAD') || this.hasRelic('THERMAL_REACTOR'),
      acid: this.hasRelic('ALCHEMIST_HEART'),
      isBomb: true,
      fuse: 1.15,
      color: '#F59E0B',
      radius: 2.5,
      age: 0,
    });
    sfx.playShoot('flak');
    this.emitHud();
  }

  private grantWeaponOrDupe(weaponId: WeaponId, fx: number, fy: number): void {
    const p = this.player;
    const wDef = WEAPONS[weaponId];
    if (!p.weapons.includes(weaponId)) {
      if (p.weapons.length < 3) {
        p.weapons.push(weaponId);
        p.activeWeaponIdx = p.weapons.length - 1;
      } else {
        p.weapons[p.activeWeaponIdx] = weaponId;
      }
      this.spawnFloatingText(fx, fy, wDef.name, wDef.color);
    } else {
      const nextDupe = (p.weaponDupes[weaponId] ?? 0) + 1;
      p.weaponDupes[weaponId] = nextDupe;
      p.gold += 15;
      const totalPct = (nextDupe * 0.01).toFixed(2);
      this.spawnFloatingText(fx, fy, `${wDef.name} +0.01% (+${totalPct}%)`, wDef.color);
    }
  }

  private tryInteract(): void {
    const p = this.player;
    // Check weapon pickups at player's feet for weapon swapping
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.kind === 'WEAPON' && pk.weaponId && Math.hypot(pk.x - p.x, pk.y - p.y) < 28) {
        const oldWeaponId = p.weapons[p.activeWeaponIdx];
        p.weapons[p.activeWeaponIdx] = pk.weaponId;
        const wDef = WEAPONS[pk.weaponId];
        this.spawnFloatingText(p.x, p.y - p.h - 6, `Swapped for ${wDef.name}`, wDef.color);

        // Drop the old weapon back on the ground as a pickup
        this.pickups.push({
          id: this.nextId++,
          kind: 'WEAPON',
          x: p.x,
          y: p.y - 4,
          vx: (Math.random() - 0.5) * 40,
          vy: -60,
          value: 1,
          weaponId: oldWeaponId,
          age: 0,
        });

        this.pickups.splice(i, 1);
        sfx.playPickup('upgrade');
        this.emitHud();
        return;
      }
    }

    // Check hub NPCs & stations if in Hub World
    if (this.state === 'HUB_WORLD') {
      for (const npc of this.hubNpcs) {
        if (Math.hypot(npc.x - p.x, npc.y - p.y) < 30) {
          this.interactWithHubNpc(npc);
          return;
        }
      }
      for (const ped of this.pedestals) {
        if (Math.hypot(ped.x - p.x, ped.y - p.y) < 28) {
          if (ped.id === 9991) {
            this.callbacks.onOpenVaultModal?.();
            return;
          } else if (ped.id === 9992) {
            this.callbacks.onOpenExpeditionModal?.();
            return;
          } else if (ped.id === 9993) {
            this.callbacks.onOpenSettingsModal?.();
            return;
          }
        }
      }
      if (this.portal.active && Math.hypot(this.portal.x - p.x, this.portal.y - (p.y - 8)) < 26) {
        this.callbacks.onOpenExpeditionModal?.();
        return;
      }
    }

    // Check pedestals
    for (const ped of this.pedestals) {
      if (ped.used) continue;
      if (Math.hypot(ped.x - p.x, ped.y - p.y) < 22) {
        ped.used = true;
        if (ped.weaponOffer) {
          this.grantWeaponOrDupe(ped.weaponOffer, ped.x, ped.y - 16);
        }
        p.hp = Math.min(p.maxHp, p.hp + 20);
        sfx.playPickup('upgrade');
        this.emitHud();
        return;
      }
    }

    // Check portal
    if (this.portal.active && Math.hypot(this.portal.x - p.x, this.portal.y - (p.y - 8)) < 22) {
      this.openUpgradeChoice();
    }
  }

  private openUpgradeChoice(): void {
    const allIds = Object.keys(PERKS) as PerkId[];
    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3).map((id) => PERKS[id]);
    this.setState('LEVEL_UPGRADE');
    this.callbacks.onUpgradeChoices(choices);
  }

  private forgeUpgradeCount = 0;
  private forgeRerollCount = 0;

  getUpgradeCost(): number {
    return 40 + this.forgeUpgradeCount * 35;
  }

  getRerollCost(): number {
    return 55 + this.forgeRerollCount * 45;
  }

  forgeUpgradeWeapon(weaponIdx: number): boolean {
    const p = this.player;
    if (!p || weaponIdx < 0 || weaponIdx >= p.weapons.length) return false;
    const cost = this.getUpgradeCost();
    if (p.gold < cost) return false;

    p.gold -= cost;
    this.forgeUpgradeCount++;
    const wId = p.weapons[weaponIdx];
    p.weaponDupes[wId] = (p.weaponDupes[wId] ?? 0) + 2;
    sfx.playPickup('upgrade');
    this.emitHud();
    return true;
  }

  forgeRerollWeapon(weaponIdx: number): boolean {
    const p = this.player;
    if (!p || weaponIdx < 0 || weaponIdx >= p.weapons.length) return false;
    const cost = this.getRerollCost();
    if (p.gold < cost) return false;

    p.gold -= cost;
    this.forgeRerollCount++;
    const allWeapons = Object.keys(WEAPONS) as WeaponId[];
    const available = allWeapons.filter((id) => !p.weapons.includes(id));
    if (available.length > 0) {
      const nextW = available[(Math.random() * available.length) | 0];
      p.weapons[weaponIdx] = nextW;
    }
    sfx.playPickup('upgrade');
    this.emitHud();
    return true;
  }

  private updateWeapons(dt: number): void {
    if (!this.mouseDownLeft && !this.touchAimFiring) return;
    const p = this.player;
    if (p.fireCooldown > 0) return;

    const wId = p.weapons[p.activeWeaponIdx];
    const wDef = WEAPONS[wId];
    const dupes = p.weaponDupes[wId] ?? 0;
    const dupeMul = 1 + dupes * 0.0001; // +0.01% weapon stats per duplicate

    const siegeLv = this.getRelicLevel('SIEGE_HEART');
    const thermalLv = this.getRelicLevel('THERMAL_REACTOR');
    const railLv = this.getRelicLevel('RAIL_FOCUSER');
    const alchLv = this.getRelicLevel('ALCHEMIST_HEART');
    const salvageLv = this.getRelicLevel('SALVAGE_MAGNET');

    let rateMul = (this.hasPerk('OVERCLOCKED_BARREL') ? 1.28 : 1.0) * dupeMul;
    if (thermalLv > 0 && this.isNearFlames(p.x, p.y - 6, 20)) {
      rateMul *= 1 + 0.4 * thermalLv;
    }
    p.fireCooldown = wDef.cooldown / rateMul;

    const goldBonus = salvageLv > 0 ? Math.floor(p.gold / 15) * 0.01 * salvageLv : 0;
    const alchemistBonus = alchLv > 0 && wDef.acid ? 0.35 * alchLv : 0;
    const dmgMul = (1 + this.countPerk('TUNGSTEN_SLUGS') * 0.35 + goldBonus + alchemistBonus) * dupeMul;
    const extraPierce = this.countPerk('TUNGSTEN_SLUGS') + 2 * railLv;
    const seismicMul = (1 + this.countPerk('SEISMIC_ROUNDS') * 0.65) * (siegeLv > 0 ? 1 + 0.5 * siegeLv : 1.0) * dupeMul;
    const powerBonus = 3 * siegeLv;
    const speedMul = (railLv > 0 ? 1.6 + 0.25 * (railLv - 1) : 1.0) * dupeMul;
    const ignite = wDef.ignite || this.hasPerk('THERMITE_PAYLOAD') || thermalLv > 0;
    const acid = wDef.acid || alchLv > 0;
    const shotDamage = wDef.damage * dmgMul * this.metaDamageMul;

    const muzzleX = p.x + Math.cos(p.aimAngle) * 7.5;
    const muzzleY = p.y - p.h * 0.52 + Math.sin(p.aimAngle) * 7.5;
    this.weaponRecoil = Math.min(2.6, wDef.cooldown > 0.25 ? 2.4 : 1.3);

    if (wDef.isBeam) {
      sfx.playShoot('beam');
      let hitX = muzzleX;
      let hitY = muzzleY;
      const step = 1.5;
      const maxDist = 88;
      const cos = Math.cos(p.aimAngle);
      const sin = Math.sin(p.aimAngle);
      let hitSomething = false;

      for (let d = 0; d <= maxDist; d += step) {
        const rx = muzzleX + cos * d;
        const ry = muzzleY + sin * d;
        hitX = rx;
        hitY = ry;
        const mRx = Math.round(rx);
        const mRy = Math.round(ry);
        if (
          this.world.isSolid(mRx, mRy) ||
          (this.state !== 'HUB_WORLD' && this.world.getMat(mRx, mRy) === Mat.CHAIN)
        ) {
          this.world.destroyCircle(rx, ry, wDef.blastRadius * seismicMul, wDef.blastPower + powerBonus, wDef.damageType, ignite, acid);
          hitSomething = true;
          break;
        }
        if (this.boss && this.isBossSolidAtWorld(rx, ry)) {
          this.damageBossAtWorld(
            rx,
            ry,
            wDef.blastRadius * seismicMul,
            wDef.blastPower + powerBonus,
            shotDamage,
            wDef.damageType,
            ignite,
            true
          );
          hitSomething = true;
          break;
        }
        // Check enemy hit
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const en = this.enemies[ei];
          if (Math.abs(rx - en.x) <= en.w * 0.55 && Math.abs(ry - (en.y - en.h * 0.5)) <= en.h * 0.55) {
            this.damageEnemy(en, shotDamage, false);
            hitSomething = true;
            break;
          }
        }
        // Check Hub target dummy hit
        if (!hitSomething && this.state === 'HUB_WORLD') {
          for (const tgt of this.hubTargets) {
            if (tgt.hp <= 0) continue;
            if (Math.abs(rx - tgt.x) <= tgt.w * 0.55 && Math.abs(ry - (tgt.y - tgt.h * 0.5)) <= tgt.h * 0.55) {
              this.damageHubTarget(tgt, shotDamage, rx, ry, wDef.color);
              hitSomething = true;
              break;
            }
          }
        }
        if (hitSomething) break;
      }

      if (hitSomething && Math.random() < 0.75) {
        for (let k = 0; k < 2; k++) {
          const ang = p.aimAngle + Math.PI + (Math.random() - 0.5) * 1.4;
          const spd = 45 + Math.random() * 65;
          this.spawnVfx(hitX, hitY, Math.cos(ang) * spd, Math.sin(ang) * spd - 20, 'SPARK', wDef.color, 1.2, 0.18);
        }
      }

      this.beamFlashes.push({
        x0: muzzleX,
        y0: muzzleY,
        x1: hitX,
        y1: hitY,
        color: wDef.color,
        life: 0.065,
      });
      return;
    }

    const soundMap: Record<WeaponId, 'pulse' | 'scatter' | 'flak' | 'rail' | 'arc' | 'acid' | 'beam'> = {
      PULSE_CARBINE: 'pulse',
      EMBER_SCATTER: 'scatter',
      FLAK_CANNON: 'flak',
      PLASMA_RAIL: 'rail',
      ARC_CASTER: 'arc',
      ACID_MORTAR: 'acid',
      MINING_BEAM: 'beam',
      CRYOMANCER_BLASTER: 'pulse',
      SONIC_REPEATER: 'arc',
      VOID_SINGULARITY_GUN: 'rail',
      HEAVY_CHAIN_MINIGUN: 'scatter',
      GRAVITON_CANNON: 'flak',
    };
    sfx.playShoot(soundMap[wId]);

    // Directional muzzle flash & weapon-specific sparks / ejecting brass casings
    this.muzzleFlashes.push({
      x: muzzleX,
      y: muzzleY,
      angle: p.aimAngle,
      color: wDef.color,
      life: 0.065,
      maxLife: 0.065,
    });
    const flashSparks = wDef.pellets > 1 ? 5 : 3;
    for (let k = 0; k < flashSparks; k++) {
      const ang = p.aimAngle + (Math.random() - 0.5) * 0.9;
      const spd = 65 + Math.random() * 90;
      this.spawnVfx(muzzleX, muzzleY, Math.cos(ang) * spd, Math.sin(ang) * spd, 'SPARK', wDef.color, 1.1, 0.14);
    }
    if (wDef.damageType === 'KINETIC' || wDef.damageType === 'EXPLOSIVE' || wId === 'EMBER_SCATTER') {
      const ejectDir = -p.facing;
      this.spawnVfx(
        p.x + Math.cos(p.aimAngle) * 3,
        p.y - p.h * 0.55 + Math.sin(p.aimAngle) * 3,
        ejectDir * (28 + Math.random() * 24),
        -55 - Math.random() * 35,
        'CASING',
        '#FBBF24',
        1.5,
        0.55
      );
    }

    for (let i = 0; i < wDef.pellets; i++) {
      const ang = p.aimAngle + (Math.random() - 0.5) * wDef.spread;
      this.projectiles.push({
        id: this.nextId++,
        fromPlayer: true,
        damageType: wDef.damageType,
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(ang) * wDef.speed * speedMul,
        vy: Math.sin(ang) * wDef.speed * speedMul,
        damage: shotDamage,
        blastRadius: wDef.blastRadius * seismicMul,
        blastPower: wDef.blastPower + powerBonus,
        pierce: wDef.pierce + extraPierce,
        gravity: wDef.gravity,
        ignite,
        acid,
        isBomb: false,
        fuse: 0,
        color: wDef.color,
        radius: wId === 'FLAK_CANNON' || wId === 'ACID_MORTAR' || wId === 'GRAVITON_CANNON' ? 2.3 : wId === 'VOID_SINGULARITY_GUN' ? 2.8 : 1.5,
        age: 0,
      });
    }
  }

  private isNearFlames(cx: number, cy: number, radius: number): boolean {
    const r = Math.round(radius);
    let count = 0;
    for (let dy = -r; dy <= r; dy += 4) {
      for (let dx = -r; dx <= r; dx += 4) {
        const m = this.world.getMat(Math.round(cx + dx), Math.round(cy + dy));
        if (m === Mat.FIRE || m === Mat.EMBER || m === Mat.LAVA) {
          count++;
          if (count >= 2) return true;
        }
      }
    }
    return false;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += dt;
      if (pr.age > 5.0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      pr.vy += pr.gravity * dt;

      if (pr.isBomb) {
        pr.fuse -= dt;
        // Sputtering fuse sparks
        if (Math.random() < 0.55) {
          this.spawnVfx(
            pr.x,
            pr.y - 3,
            (Math.random() - 0.5) * 45,
            -35 - Math.random() * 35,
            'SPARK',
            Math.random() < 0.5 ? '#FEF08A' : '#F97316',
            1.1,
            0.22
          );
        }
        const nx = pr.x + pr.vx * dt;
        const ny = pr.y + pr.vy * dt;
        if (this.world.isSolid(Math.round(nx), Math.round(pr.y))) {
          pr.vx = -pr.vx * 0.45;
        } else {
          pr.x = nx;
        }
        if (this.world.isSolid(Math.round(pr.x), Math.round(ny))) {
          pr.vy = -pr.vy * 0.4;
          pr.vx *= 0.72;
        } else {
          pr.y = ny;
        }
        if (pr.fuse <= 0) {
          this.detonateBomb(pr);
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      // Projectile trail particles based on weapon damage type
      if (pr.fromPlayer && Math.random() < (pr.damageType === 'VOID' || pr.damageType === 'PLASMA' ? 0.85 : 0.4)) {
        const trailKind =
          pr.damageType === 'EXPLOSIVE'
            ? 'SMOKE'
            : pr.damageType === 'CRYOGENIC' || pr.damageType === 'VOID'
            ? 'SHARD'
            : 'SPARK';
        this.spawnVfx(
          pr.x + (Math.random() - 0.5) * 2,
          pr.y + (Math.random() - 0.5) * 2,
          -pr.vx * 0.08 + (Math.random() - 0.5) * 20,
          -pr.vy * 0.08 + (Math.random() - 0.5) * 20,
          trailKind,
          pr.color,
          trailKind === 'SMOKE' ? 2.0 : 1.0,
          trailKind === 'SMOKE' ? 0.3 : 0.16
        );
      }

      const dist = Math.hypot(pr.vx * dt, pr.vy * dt);
      const steps = Math.max(1, Math.ceil(dist / 2));
      const sdx = (pr.vx * dt) / steps;
      const sdy = (pr.vy * dt) / steps;
      let removed = false;

      for (let s = 0; s < steps && !removed; s++) {
        pr.x += sdx;
        pr.y += sdy;

        const ix = Math.round(pr.x);
        const iy = Math.round(pr.y);

        if (ix <= 1 || ix >= WORLD_W - 2 || iy <= 1 || iy >= WORLD_H - 2) {
          removed = true;
          break;
        }

        if (pr.fromPlayer) {
          // Active Shield Plate Aegis Repulsor deflection
          if (this.boss && this.boss.shieldActiveTimer > 0) {
            const shieldPos = getBossOriginWorld(
              this.boss,
              this.boss.shieldSide < 0 ? 'LEFT_LIMB' : 'RIGHT_LIMB'
            );
            if (Math.hypot(pr.x - shieldPos.x, pr.y - shieldPos.y) <= 28) {
              pr.fromPlayer = false;
              pr.vx = -pr.vx * 0.75;
              pr.vy = -Math.abs(pr.vy) * 0.6 - 35;
              pr.color = '#60A5FA';
              pr.damage = Math.max(8, Math.round(pr.damage * 0.45));
              pr.pierce = 0;
              this.emitImpactBurst(pr.x, pr.y, '#93C5FD', 5);
              if (Math.random() < 0.35) {
                this.spawnFloatingText(pr.x, pr.y - 6, 'DEFLECTED', '#60A5FA');
              }
              break;
            }
          }

          // Check pixel-based Boss hit
          if (this.boss && this.isBossSolidAtWorld(pr.x, pr.y)) {
            this.damageBossAtWorld(
              pr.x,
              pr.y,
              Math.max(2.6, pr.blastRadius),
              pr.blastPower,
              pr.damage,
              pr.damageType,
              pr.ignite,
              true
            );
            this.emitImpactBurst(pr.x, pr.y, pr.color, pr.blastRadius >= 6 ? 12 : 5);
            if (pr.blastRadius >= 6) {
              this.spawnShockRing(pr.x, pr.y, pr.blastRadius * 1.4, pr.color);
              sfx.playExplosion(0.7);
            }
            if (pr.pierce > 0) {
              pr.pierce--;
            } else {
              removed = true;
            }
            break;
          }

          for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
            const en = this.enemies[ei];
            if (
              Math.abs(pr.x - en.x) <= en.w * 0.55 + pr.radius &&
              Math.abs(pr.y - (en.y - en.h * 0.5)) <= en.h * 0.55 + pr.radius
            ) {
              this.damageEnemy(en, pr.damage, false);
              this.emitImpactBurst(pr.x, pr.y, pr.color, pr.blastRadius >= 6 ? 10 : 5);
              if (pr.blastRadius >= 6) {
                this.world.destroyCircle(pr.x, pr.y, pr.blastRadius, pr.blastPower, pr.damageType, pr.ignite, pr.acid);
                this.spawnShockRing(pr.x, pr.y, pr.blastRadius * 1.4, pr.color);
                sfx.playExplosion(0.7);
              }
              if (pr.pierce > 0) {
                pr.pierce--;
              } else {
                removed = true;
              }
              break;
            }
          }

          if (!removed && this.state === 'HUB_WORLD') {
            for (const tgt of this.hubTargets) {
              if (tgt.hp <= 0) continue;
              if (
                Math.abs(pr.x - tgt.x) <= tgt.w * 0.55 + pr.radius &&
                Math.abs(pr.y - (tgt.y - tgt.h * 0.5)) <= tgt.h * 0.55 + pr.radius
              ) {
                this.damageHubTarget(tgt, pr.damage, pr.x, pr.y, pr.color);
                this.emitImpactBurst(pr.x, pr.y, pr.color, pr.blastRadius >= 6 ? 10 : 5);
                if (pr.blastRadius >= 6) {
                  this.spawnShockRing(pr.x, pr.y, pr.blastRadius * 1.4, pr.color);
                  sfx.playExplosion(0.7);
                }
                if (pr.pierce > 0) {
                  pr.pierce--;
                } else {
                  removed = true;
                }
                break;
              }
            }
          }
        } else {
          const p = this.player;
          if (
            p.invulnTimer <= 0 &&
            Math.abs(pr.x - p.x) <= p.w * 0.5 + pr.radius &&
            Math.abs(pr.y - (p.y - p.h * 0.5)) <= p.h * 0.5 + pr.radius
          ) {
            this.damagePlayer(pr.damage, pr.vx >= 0 ? 1 : -1);
            this.emitImpactBurst(pr.x, pr.y, pr.color, 6);
            removed = true;
            break;
          }
        }

        if (removed) break;

        if (
          this.world.isSolid(ix, iy) ||
          (this.state !== 'HUB_WORLD' && this.world.getMat(ix, iy) === Mat.CHAIN)
        ) {
          const hitChainOnly = !this.world.isSolid(ix, iy);
          this.world.destroyCircle(
            pr.x,
            pr.y,
            hitChainOnly ? Math.max(2.4, pr.blastRadius) : pr.blastRadius,
            pr.blastPower,
            pr.damageType,
            pr.ignite,
            pr.acid
          );
          this.emitImpactBurst(pr.x, pr.y, pr.color, pr.blastRadius >= 7 ? 14 : 5);
          const impactSpec = getAmmoLightSpec(pr.damageType, pr.color, false, pr.age, this.elapsedSeconds);
          this.spawnTransientLight(
            pr.x - sdx,
            pr.y - sdy,
            pr.blastRadius >= 7 ? pr.blastRadius * 3.2 : impactSpec.radius * 1.35,
            impactSpec.rgb,
            pr.blastRadius >= 7 ? 1.15 : 0.78,
            pr.blastRadius >= 7 ? 0.34 : 0.18,
            pr.blastRadius >= 7 ? 0.18 : 0.09,
            true
          );
          if (pr.blastRadius >= 7) {
            this.spawnShockRing(pr.x, pr.y, pr.blastRadius * 1.4, pr.color);
            this.shakeMag = Math.max(this.shakeMag, 2.5);
            sfx.playExplosion(0.65);
          }
          if (pr.pierce > 0) {
            pr.pierce--;
          } else {
            removed = true;
          }
        }
      }

      if (removed) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private detonateBomb(bomb: Projectile): void {
    sfx.playExplosion(1.3);
    this.shakeMag = Math.max(this.shakeMag, 5.5);
    this.world.destroyCircle(bomb.x, bomb.y, bomb.blastRadius, bomb.blastPower, bomb.damageType, bomb.ignite, bomb.acid);
    this.spawnShockRing(bomb.x, bomb.y, bomb.blastRadius * 1.6, '#F59E0B');
    this.spawnTransientLight(bomb.x, bomb.y - 1, bomb.blastRadius * 3.8, [255, 168, 52], 1.35, 0.42, 0.25, true);
    this.emitImpactBurst(bomb.x, bomb.y, '#F59E0B', 20);
    for (let s = 0; s < 10; s++) {
      this.spawnVfx(
        bomb.x + (Math.random() - 0.5) * 10,
        bomb.y + (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 55,
        -25 - Math.random() * 40,
        'SMOKE',
        '#CBD5E1',
        4 + Math.random() * 4,
        0.75 + Math.random() * 0.45
      );
    }

    // Damage enemies in blast radius
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      const dist = Math.hypot(en.x - bomb.x, en.y - en.h * 0.5 - bomb.y);
      if (dist <= bomb.blastRadius * 1.5) {
        const falloff = 1 - (dist / (bomb.blastRadius * 1.6)) * 0.5;
        this.damageEnemy(en, Math.round(bomb.damage * falloff), false);
      }
    }

    // Damage & carve pixels on Boss if inside blast radius
    if (this.boss) {
      const bossDist = Math.hypot(
        this.boss.x - bomb.x,
        this.boss.y - this.boss.h * 0.5 - bomb.y
      );
      if (bossDist <= bomb.blastRadius + Math.max(this.boss.w, this.boss.h) * 0.65) {
        this.damageBossAtWorld(
          bomb.x,
          bomb.y,
          bomb.blastRadius * 0.9,
          bomb.blastPower,
          bomb.damage,
          bomb.damageType,
          bomb.ignite,
          false
        );
      }
    }

    // Damage Hub Target Dummies if in blast radius
    if (this.state === 'HUB_WORLD') {
      for (const tgt of this.hubTargets) {
        if (tgt.hp <= 0) continue;
        const dist = Math.hypot(tgt.x - bomb.x, tgt.y - tgt.h * 0.5 - bomb.y);
        if (dist <= bomb.blastRadius * 1.6) {
          const falloff = 1 - (dist / (bomb.blastRadius * 1.7)) * 0.5;
          this.damageHubTarget(tgt, Math.round(bomb.damage * falloff), tgt.x, tgt.y - tgt.h * 0.5, '#F59E0B');
        }
      }
    }

    // Self-damage check (safe inside Hub World)
    const p = this.player;
    if (this.state !== 'HUB_WORLD' && p.invulnTimer <= 0) {
      const pDist = Math.hypot(p.x - bomb.x, p.y - p.h * 0.5 - bomb.y);
      if (pDist <= bomb.blastRadius * 1.15) {
        const resist = this.hasPerk('CRYO_SHIELDING') ? 0.35 : 0.65;
        this.damagePlayer(Math.round(14 * resist), p.x >= bomb.x ? 1 : -1);
      }
    }

    // Cluster shrapnel perk
    if (this.hasPerk('CLUSTER_SHRAPNEL')) {
      for (let k = 0; k < 6; k++) {
        const ang = -Math.PI * 0.15 - (k / 5) * Math.PI * 0.7 + (Math.random() - 0.5) * 0.2;
        const spd = 110 + Math.random() * 55;
        this.projectiles.push({
          id: this.nextId++,
          fromPlayer: true,
          damageType: 'EXPLOSIVE',
          x: bomb.x,
          y: bomb.y - 2,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          damage: 20,
          blastRadius: 9,
          blastPower: 5,
          pierce: 0,
          gravity: 250,
          ignite: bomb.ignite,
          acid: bomb.acid,
          isBomb: false,
          fuse: 0,
          color: '#FBBF24',
          radius: 2,
          age: 0,
        });
      }
    }
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    const dmgScale = 1 + (this.depth - 1) * 0.12;
    const spdScale = 1 + Math.min(0.65, (this.depth - 1) * 0.045);
    const cdScale = Math.max(0.55, 1 - (this.depth - 1) * 0.03);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      en.hurtFlash = Math.max(0, en.hurtFlash - dt);
      en.attackCd = Math.max(0, en.attackCd - dt);
      en.aiTimer += dt;

      const dx = p.x - en.x;
      const dy = p.y - en.y;
      const dist = Math.hypot(dx, dy);

      if (en.kind === 'DRONE') {
        if (dist < 215) {
          en.facing = dx >= 0 ? 1 : -1;
          const targetVx = dist > 55 ? Math.sign(dx) * 44 * spdScale : -Math.sign(dx) * 24 * spdScale;
          const hoverY = p.y - 28 + Math.sin(en.aiTimer * 3.5) * 8;
          const targetVy = Math.max(-48, Math.min(48, (hoverY - en.y) * 2.2));
          en.vx += (targetVx - en.vx) * 3 * dt;
          en.vy += (targetVy - en.vy) * 3 * dt;

          if (en.attackCd <= 0 && dist < 175) {
            en.attackCd = 1.65 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - en.y, p.x - en.x);
            this.spawnEnemyShot(en.x, en.y, ang, 165 * spdScale, Math.round(9 * dmgScale), '#FB7185');
            if (this.depth >= 6) {
              this.spawnEnemyShot(en.x, en.y, ang + 0.18, 155 * spdScale, Math.round(8 * dmgScale), '#FB7185');
            }
          }
        } else {
          en.vx *= 0.92;
          en.vy = Math.sin(en.aiTimer * 2.5) * 12;
        }
        this.moveEntityWithPixelCollision(en, en.vx * dt, en.vy * dt, false);
      } else if (en.kind === 'PYRO_IMP') {
        // Ashen Foundry signature aerial enemy: weaves erratically & lobs igniting ember bolts
        if (dist < 230) {
          en.facing = dx >= 0 ? 1 : -1;
          const strafe = Math.sin(en.aiTimer * 4.2) * 34;
          const targetVx = (dist > 68 ? Math.sign(dx) * 48 : -Math.sign(dx) * 34) * spdScale + strafe;
          const hoverY = p.y - 36 + Math.cos(en.aiTimer * 3.8) * 12;
          const targetVy = Math.max(-55, Math.min(55, (hoverY - en.y) * 2.5));
          en.vx += (targetVx - en.vx) * 3.5 * dt;
          en.vy += (targetVy - en.vy) * 3.5 * dt;

          if (en.attackCd <= 0 && dist < 185) {
            en.attackCd = 1.5 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - en.y, p.x - en.x);
            this.spawnEnemyShot(en.x, en.y, ang, 155 * spdScale, Math.round(11 * dmgScale), '#FB923C', 65, true, false);
            if (this.depth >= 4) {
              this.spawnEnemyShot(en.x, en.y, ang - 0.22, 145 * spdScale, Math.round(10 * dmgScale), '#FB923C', 65, true, false);
            }
          }
        } else {
          en.vx *= 0.92;
          en.vy = Math.sin(en.aiTimer * 3.1) * 15;
        }
        this.moveEntityWithPixelCollision(en, en.vx * dt, en.vy * dt, false);
      } else if (en.kind === 'CRYSTAL_WISP') {
        // Vitriol Vaults signature enemy: figure-8 hover, bursts crystal/acid shards
        if (dist < 225) {
          en.facing = dx >= 0 ? 1 : -1;
          const targetVx = Math.cos(en.aiTimer * 2.1) * 36 * spdScale + Math.sign(dx) * 14;
          const hoverY = p.y - 26 + Math.sin(en.aiTimer * 4.2) * 14;
          const targetVy = Math.max(-44, Math.min(44, (hoverY - en.y) * 2.3));
          en.vx += (targetVx - en.vx) * 2.8 * dt;
          en.vy += (targetVy - en.vy) * 2.8 * dt;

          if (en.attackCd <= 0 && dist < 185) {
            en.attackCd = 1.85 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - en.y, p.x - en.x);
            const count = this.depth >= 5 ? 3 : 2;
            for (let s = 0; s < count; s++) {
              const offset = (s - (count - 1) * 0.5) * 0.22;
              this.spawnEnemyShot(en.x, en.y, ang + offset, 145 * spdScale, Math.round(10 * dmgScale), '#4ADE80', 0, false, true);
            }
          }
        } else {
          en.vx = Math.cos(en.aiTimer * 1.5) * 14;
          en.vy = Math.sin(en.aiTimer * 3) * 12;
        }
        this.moveEntityWithPixelCollision(en, en.vx * dt, en.vy * dt, false);
      } else if (en.kind === 'TURRET') {
        en.vy += GRAVITY * dt;
        this.moveEntityWithPixelCollision(en, 0, en.vy * dt, false);
        if (dist < 200) {
          en.facing = dx >= 0 ? 1 : -1;
          if (en.attackCd <= 0) {
            en.attackCd = 1.85 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - (en.y - 5), p.x - en.x);
            this.spawnEnemyShot(en.x, en.y - 5, ang, 210 * spdScale, Math.round(12 * dmgScale), '#F43F5E');
          }
        }
      } else if (en.kind === 'STONE_WARDEN') {
        // Sunken Masonry heavy armored colossus
        en.vy += GRAVITY * dt;
        if (dist < 220) {
          en.facing = dx >= 0 ? 1 : -1;
          en.vx = en.facing * 26 * spdScale;
          if (en.grounded && Math.abs(dy) > 16 && en.attackCd <= 0) {
            en.vy = -126;
            en.attackCd = 1.4;
          }
          if (dist > 36 && en.attackCd <= 0) {
            en.attackCd = 2.1 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - (en.y - 9), p.x - en.x);
            const shots = this.depth >= 4 ? 3 : 2;
            for (let s = 0; s < shots; s++) {
              const spread = (s - (shots - 1) * 0.5) * 0.16;
              this.spawnEnemyShot(en.x, en.y - 9, ang + spread, 150 * spdScale, Math.round(13 * dmgScale), '#38BDF8');
            }
          }
        } else {
          en.vx = Math.sin(en.aiTimer * 1.1) * 14;
        }
        this.moveEntityWithPixelCollision(en, en.vx * dt, en.vy * dt, true);
      } else {
        // Grounded enemies: CRAWLER, SENTINEL, SLIME
        en.vy += GRAVITY * dt;
        if (dist < 205) {
          en.facing = dx >= 0 ? 1 : -1;
          const baseSpd = en.kind === 'CRAWLER' ? 54 : en.kind === 'SENTINEL' ? 32 : 40;
          en.vx = en.facing * baseSpd * spdScale;

          if (en.grounded && (en.kind === 'SLIME' || Math.abs(dy) > 14) && en.attackCd <= 0) {
            en.vy = en.kind === 'SLIME' ? -145 : -130;
            en.attackCd = 1.25 * cdScale;
          }

          if (en.kind === 'SENTINEL' && dist > 42 && en.attackCd <= 0) {
            en.attackCd = 2.0 * cdScale;
            const ang = Math.atan2(p.y - p.h * 0.5 - (en.y - 7), p.x - en.x);
            this.spawnEnemyShot(en.x, en.y - 7, ang, 155 * spdScale, Math.round(13 * dmgScale), '#FBBF24');
          }
        } else {
          en.vx = Math.sin(en.aiTimer * 1.4) * 16;
        }

        this.moveEntityWithPixelCollision(en, en.vx * dt, en.vy * dt, true);
      }

      if (
        p.invulnTimer <= 0 &&
        Math.abs(p.x - en.x) < (p.w + en.w) * 0.45 &&
        Math.abs(p.y - p.h * 0.5 - (en.y - en.h * 0.5)) < (p.h + en.h) * 0.45
      ) {
        const contactDmg = Math.round((en.kind === 'STONE_WARDEN' ? 16 : en.kind === 'SENTINEL' ? 14 : 10) * dmgScale);
        this.damagePlayer(contactDmg, p.x >= en.x ? 1 : -1);
      }
    }
  }

  private spawnEnemyShot(
    x: number,
    y: number,
    ang: number,
    spd: number,
    dmg: number,
    color: string,
    gravity = 0,
    ignite = false,
    acid = false,
    opts?: {
      blastRadius?: number;
      blastPower?: number;
      projRadius?: number;
      pierce?: number;
      damageType?: DamageType;
    }
  ): void {
    const damageType: DamageType = opts?.damageType ?? (acid ? 'CORROSIVE' : ignite ? 'THERMAL' : 'KINETIC');
    this.projectiles.push({
      id: this.nextId++,
      fromPlayer: false,
      damageType,
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      damage: dmg,
      blastRadius: opts?.blastRadius ?? (ignite || acid ? 3.2 : 2.2),
      blastPower: opts?.blastPower ?? 2,
      pierce: opts?.pierce ?? 0,
      gravity,
      ignite,
      acid,
      isBomb: false,
      fuse: 0,
      color,
      radius: opts?.projRadius ?? 1.6,
      age: 0,
    });
  }

  private fireBossBeam(
    startX: number,
    startY: number,
    ang: number,
    maxLen: number,
    dmg: number,
    color: string,
    blastRadius = 6
  ): void {
    const p = this.player;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let endX = startX + dx * maxLen;
    let endY = startY + dy * maxLen;
    let hitPlayer = false;
    let terrainHits = 0;

    for (let dist = 8; dist <= maxLen; dist += 2) {
      const rx = startX + dx * dist;
      const ry = startY + dy * dist;
      const ix = Math.round(rx);
      const iy = Math.round(ry);

      if (ix <= 2 || ix >= WORLD_W - 3 || iy <= 2 || iy >= WORLD_H - 3) {
        endX = rx;
        endY = ry;
        break;
      }

      if (
        !hitPlayer &&
        p.invulnTimer <= 0 &&
        Math.abs(rx - p.x) <= p.w * 0.5 + 2 &&
        Math.abs(ry - (p.y - p.h * 0.5)) <= p.h * 0.5 + 2
      ) {
        hitPlayer = true;
        this.damagePlayer(dmg, dx >= 0 ? 1 : -1);
      }

      if (this.world.isSolid(ix, iy)) {
        if (this.world.getMat(ix, iy) === Mat.BEDROCK) {
          endX = rx;
          endY = ry;
          break;
        }
        terrainHits++;
        if (terrainHits === 1) {
          this.world.destroyCircle(rx, ry, blastRadius, 5, 'LASER', false, false);
        }
        if (terrainHits >= 4) {
          endX = rx;
          endY = ry;
          break;
        }
      }
    }

    this.beamFlashes.push({
      x0: startX,
      y0: startY,
      x1: endX,
      y1: endY,
      color,
      life: 0.24,
    });
    this.spawnShockRing(endX, endY, Math.max(12, blastRadius * 1.8), color);
    this.spawnTransientLight(endX, endY, 56, parseHexRgb(color), 1.0, 0.28, 0.2, true);
    sfx.playShoot('rail');
  }

  private damageEnemy(en: Enemy, dmg: number, fromCrush: boolean): void {
    const isArmored = en.kind === 'SENTINEL' || en.kind === 'STONE_WARDEN' || en.kind === 'TURRET';
    const railLv = this.getRelicLevel('RAIL_FOCUSER');
    const finalDmg = !fromCrush && isArmored && railLv > 0 ? dmg * (1 + 0.45 * railLv) : dmg;
    const dispDmg = Math.max(1, Math.round(finalDmg));

    en.hp -= finalDmg;
    en.hurtFlash = 0.14;
    this.spawnFloatingText(
      en.x,
      en.y - en.h - 2,
      fromCrush ? `CRUSH -${dispDmg}` : `${dispDmg}`,
      fromCrush ? '#FBBF24' : '#F4F4F5'
    );

    if (en.kind === 'SLIME' || en.kind === 'CRYSTAL_WISP') {
      for (let k = 0; k < 4; k++) {
        this.world.spawnParticle(
          en.x,
          en.y - 3,
          (Math.random() - 0.5) * 65,
          -40 - Math.random() * 35,
          Mat.ACID,
          packColor(75, 235, 95),
          1.2,
          true
        );
      }
    }

    if (en.hp <= 0) {
      const idx = this.enemies.indexOf(en);
      if (idx !== -1) this.enemies.splice(idx, 1);
      this.kills++;

      let healAmt = 0;
      if (this.hasPerk('VAMPIRIC_CORE')) healAmt += 5;
      healAmt += 3 * this.getRelicLevel('ALCHEMIST_HEART');
      if (healAmt > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
      }

      // Burst of pixel sparks
      for (let k = 0; k < 14; k++) {
        this.world.spawnParticle(
          en.x,
          en.y - en.h * 0.5,
          (Math.random() - 0.5) * 110,
          -35 - Math.random() * 80,
          en.kind === 'DRONE' || en.kind === 'PYRO_IMP' ? Mat.EMBER : Mat.RUBBLE,
          en.kind === 'SLIME' || en.kind === 'CRYSTAL_WISP'
            ? packColor(80, 235, 95)
            : packColor(245, 165, 55),
          0.9,
          false
        );
      }

      const bonusGold = fromCrush && this.hasPerk('STRUCTURAL_SABOTEUR') ? 8 : 0;
      const shards = Math.max(2, Math.round((en.goldValue + bonusGold) / 3));
      for (let g = 0; g < shards; g++) {
        this.pickups.push({
          id: this.nextId++,
          kind: 'GOLD',
          x: en.x,
          y: en.y - 4,
          vx: (Math.random() - 0.5) * 85,
          vy: -65 - Math.random() * 45,
          value: 3,
          age: 0,
        });
      }
      if (Math.random() < 0.25) {
        this.pickups.push({
          id: this.nextId++,
          kind: 'HEALTH',
          x: en.x,
          y: en.y - 4,
          vx: (Math.random() - 0.5) * 40,
          vy: -70,
          value: 15,
          age: 0,
        });
      }
      const weaponDropChance = en.kind === 'STONE_WARDEN' || en.kind === 'SENTINEL' ? 0.22 : 0.05;
      if (Math.random() < weaponDropChance) {
        const wId = LOOTABLE_WEAPONS[Math.floor(Math.random() * LOOTABLE_WEAPONS.length)];
        this.pickups.push({
          id: this.nextId++,
          kind: 'WEAPON',
          x: en.x,
          y: en.y - 5,
          vx: (Math.random() - 0.5) * 50,
          vy: -85,
          value: 1,
          weaponId: wId,
          age: 0,
        });
      }
    }
  }

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss) return;

    boss.hurtFlash = Math.max(0, boss.hurtFlash - dt);
    boss.shieldActiveTimer = Math.max(0, boss.shieldActiveTimer - dt);
    boss.phaseTimer += dt;

    // Damage venting smoke & crackling sparks from craters on wounded colossal bosses
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    if (hpRatio < 0.85 && Math.random() < dt * (2 + (1 - hpRatio) * 18)) {
      const originX = boss.x - boss.w * 0.5;
      const originY = boss.y - boss.h;
      for (let attempt = 0; attempt < 6; attempt++) {
        const lx: number = 2 + Math.floor(Math.random() * (boss.w - 4));
        const ly: number = 2 + Math.floor(Math.random() * (boss.h - 4));
        const idx: number = ly * boss.w + lx;
        if (boss.mats[idx] !== Mat.EMPTY) {
          const nearEmpty =
            boss.mats[idx - 1] === Mat.EMPTY ||
            boss.mats[idx + 1] === Mat.EMPTY ||
            boss.mats[idx - boss.w] === Mat.EMPTY;
          if (nearEmpty || boss.isCore[idx] === 1) {
            const wx = originX + lx + 0.5;
            const wy = originY + ly + 0.5;
            this.vfxParticles.push({
              x: wx,
              y: wy,
              vx: (Math.random() - 0.5) * 18,
              vy: -16 - Math.random() * 24,
              size: 1.5 + Math.random() * 2,
              color: hpRatio < 0.35 && Math.random() < 0.45 ? '#F59E0B' : '#475569',
              alpha: 0.65,
              life: 0,
              maxLife: 0.45 + Math.random() * 0.35,
              kind: 'SMOKE',
              rot: 0,
              rotSpeed: 0,
            });
            break;
          }
        }
      }
    }

    const p = this.player;
    if (p.x < boss.arenaMinX - 50 && boss.hp === boss.maxHp) {
      return;
    }

    const tier = Math.max(1, Math.floor(this.depth / 10));
    const dx = p.x - boss.x;
    const dy = p.y - p.h * 0.5 - (boss.y - boss.h * 0.5);
    boss.facing = dx >= 0 ? 1 : -1;

    // 1. Telegraph phase before a modular special attack fires
    if (boss.pendingSpecialId) {
      const meta = BOSS_SPECIAL_CATALOG[boss.pendingSpecialId];
      boss.telegraphTimer -= dt;

      if (meta?.telegraphKind === 'DROP') {
        const hoverTargetX = boss.pendingTargetX;
        const hoverTargetY = boss.arenaFloorY - 122;
        boss.vx += ((hoverTargetX - boss.x) * 3.5 - boss.vx) * 6 * dt;
        boss.vy += ((hoverTargetY - boss.y) * 4.5 - boss.vy) * 6 * dt;
        boss.x += boss.vx * dt;
        boss.y += boss.vy * dt;
      } else {
        boss.vx *= Math.max(0, 1 - 6 * dt);
        if (boss.biomeId !== 'VITRIOL_VAULTS') {
          boss.vy += GRAVITY * 0.85 * dt;
          boss.y += boss.vy * dt;
          if (boss.y >= boss.arenaFloorY) {
            boss.y = boss.arenaFloorY;
            boss.vy = 0;
          }
        }
        boss.x += boss.vx * dt;
        if (meta?.telegraphKind === 'RUSH' && Math.random() < dt * 22) {
          this.world.spawnParticle(
            boss.x - boss.specialDir * 16 + (Math.random() - 0.5) * 18,
            boss.y - 3,
            -boss.specialDir * (35 + Math.random() * 35),
            -18 - Math.random() * 25,
            Mat.EMBER,
            packColor(251, 191, 36),
            0.35,
            false
          );
        }
      }

      if (boss.telegraphTimer <= 0) {
        const fireId = boss.pendingSpecialId;
        boss.pendingSpecialId = null;
        this.triggerBossSpecial(boss, fireId, tier);
        this.emitHud();
      }
    } else if (boss.activeSpecialId) {
      // 2. Active multi-tick special execution
      this.updateActiveBossSpecial(boss, dt, tier);
    } else {
      // 3. Standard biome locomotion + cooldown ticking
      boss.attackCd = Math.max(0, boss.attackCd - dt);
      boss.secondaryCd = Math.max(0, boss.secondaryCd - dt);
      boss.specialCd = Math.max(0, boss.specialCd - dt);

      if (boss.biomeId === 'SUNKEN_MASONRY') {
        const patrolX = boss.anchorX + Math.sin(boss.phaseTimer * 0.85) * 145;
        const targetVx = Math.max(-52, Math.min(52, (patrolX - boss.x) * 1.6));
        boss.vx += (targetVx - boss.vx) * 3 * dt;
        boss.vy += GRAVITY * 0.85 * dt;

        boss.x += boss.vx * dt;
        boss.y += boss.vy * dt;
        if (boss.y >= boss.arenaFloorY) {
          if (boss.vy > 110) {
            this.shakeMag = Math.max(this.shakeMag, 7.2);
            this.spawnShockRing(boss.x, boss.arenaFloorY - 2, 72, '#38BDF8');
            this.spawnShockRing(boss.x, boss.arenaFloorY - 2, 42, '#E0F2FE');
            this.spawnTransientLight(boss.x, boss.arenaFloorY - 6, 74, [56, 189, 248], 0.95, 0.25, 0.28, false);
            for (let s = 0; s < 14; s++) {
              const sx = boss.x + (Math.random() - 0.5) * 56;
              this.world.spawnParticle(
                sx,
                boss.arenaFloorY - 2,
                (sx - boss.x) * 2.5 + (Math.random() - 0.5) * 45,
                -30 - Math.random() * 65,
                Mat.RUBBLE,
                packColor(148, 163, 184),
                0.75,
                true
              );
            }
            sfx.playExplosion(1.1);
          }
          boss.y = boss.arenaFloorY;
          boss.vy = 0;
        }

        if (boss.secondaryCd <= 0 && boss.y >= boss.arenaFloorY - 1) {
          boss.secondaryCd = Math.max(2.6, 4.2 - tier * 0.35);
          boss.vy = -195;
          boss.vx = Math.sign(dx) * 85;
        }

        if (boss.attackCd <= 0) {
          boss.attackCd = Math.max(1.3, 2.2 - tier * 0.15);
          const fireY = boss.y - boss.h * 0.54;
          const baseAng = Math.atan2(p.y - p.h * 0.5 - fireY, p.x - boss.x);
          const count = 3 + Math.min(2, tier - 1);
          for (let k = 0; k < count; k++) {
            const offset = (k - (count - 1) * 0.5) * 0.19;
            this.spawnEnemyShot(
              boss.x + boss.facing * 12,
              fireY,
              baseAng + offset,
              165 + tier * 14,
              12 + tier * 2,
              '#38BDF8'
            );
          }
        }
      } else if (boss.biomeId === 'ASHEN_FOUNDRY') {
        const targetX = p.x + Math.sin(boss.phaseTimer * 1.1) * 95;
        const desiredVx = Math.max(-68, Math.min(68, (targetX - boss.x) * 1.4));
        boss.vx += (desiredVx - boss.vx) * 2.5 * dt;
        boss.vy += GRAVITY * dt;
        boss.x += boss.vx * dt;
        boss.y += boss.vy * dt;
        if (boss.y >= boss.arenaFloorY) {
          boss.y = boss.arenaFloorY;
          boss.vy = 0;
          if (Math.abs(boss.vx) > 28 && Math.random() < dt * 16) {
            this.world.spawnParticle(
              boss.x + (Math.random() - 0.5) * 48,
              boss.arenaFloorY - 2,
              -boss.vx * 0.35 + (Math.random() - 0.5) * 30,
              -18 - Math.random() * 28,
              Mat.EMBER,
              packColor(251, 146, 60),
              0.4,
              false
            );
          }
        }

        if (boss.secondaryCd <= 0 && !boss.disabledParts.crown) {
          boss.secondaryCd = Math.max(2.2, 3.4 - tier * 0.25);
          for (const stackSign of [-1, 1]) {
            const stackX = boss.x + stackSign * 14;
            const stackY = boss.y - boss.h + 12;
            const ang = Math.atan2(-120, p.x - stackX + stackSign * 30);
            this.spawnEnemyShot(
              stackX,
              stackY,
              ang,
              180 + Math.abs(dx) * 0.34,
              14 + tier * 2,
              '#FB923C',
              210,
              true,
              false
            );
          }
          this.spawnTransientLight(boss.x, boss.y - boss.h + 12, 56, [251, 146, 60], 0.85, 0.2, 0.2, false);
        }

        if (boss.attackCd <= 0) {
          boss.attackCd = Math.max(1.15, 1.9 - tier * 0.15);
          const fireX = boss.x + boss.facing * 16;
          const fireY = boss.y - boss.h * 0.5;
          const baseAng = Math.atan2(p.y - p.h * 0.5 - fireY, p.x - fireX);
          for (let k = -1; k <= 1; k++) {
            this.spawnEnemyShot(
              fireX,
              fireY,
              baseAng + k * 0.16,
              180,
              11 + tier * 2,
              '#F59E0B',
              0,
              true,
              false
            );
          }
        }
      } else {
        const targetX = boss.anchorX + Math.sin(boss.phaseTimer * 0.95) * 165;
        const targetY = boss.arenaFloorY - 34 + Math.sin(boss.phaseTimer * 1.9) * 28;
        boss.vx += ((targetX - boss.x) * 1.8 - boss.vx) * 3 * dt;
        boss.vy += ((targetY - boss.y) * 2.2 - boss.vy) * 3 * dt;
        boss.x += boss.vx * dt;
        boss.y += boss.vy * dt;

        if (boss.attackCd <= 0) {
          boss.attackCd = Math.max(1.25, 2.0 - tier * 0.15);
          const fireY = boss.y - boss.h * 0.54;
          const baseAng = Math.atan2(p.y - p.h * 0.5 - fireY, p.x - boss.x);
          for (let k = -1; k <= 1; k++) {
            this.spawnEnemyShot(
              boss.x + boss.facing * 12,
              fireY,
              baseAng + k * 0.2,
              170,
              12 + tier * 2,
              '#4ADE80',
              0,
              false,
              true
            );
          }
        }

        if (boss.secondaryCd <= 0) {
          boss.secondaryCd = Math.max(2.6, 3.8 - tier * 0.25);
          const ringCount = 8 + Math.min(4, tier * 2);
          for (let k = 0; k < ringCount; k++) {
            const ang = (k / ringCount) * Math.PI * 2 + boss.phaseTimer;
            this.spawnEnemyShot(
              boss.x,
              boss.y - boss.h * 0.5,
              ang,
              128,
              11 + tier * 2,
              '#10B981',
              0,
              false,
              true
            );
          }
        }
      }

      // 4. Queue next modular Part Special Attack
      if (boss.specialCd <= 0 && boss.specialList.length > 0) {
        let pickedId: string | null = null;
        for (let attempt = 0; attempt < boss.specialList.length; attempt++) {
          const candidateId = boss.specialList[(boss.specialIdx + attempt) % boss.specialList.length];
          const meta = BOSS_SPECIAL_CATALOG[candidateId];
          if (!meta) continue;
          const missingReq = meta.requiredParts.some((pk) => boss.disabledParts[pk]);
          if (!missingReq) {
            pickedId = candidateId;
            boss.specialIdx = (boss.specialIdx + attempt + 1) % boss.specialList.length;
            break;
          }
        }

        if (pickedId) {
          const meta = BOSS_SPECIAL_CATALOG[pickedId];
          const origin = getBossOriginWorld(boss, meta.origin);
          boss.pendingSpecialId = pickedId;
          boss.telegraphDuration = meta.telegraphDuration;
          boss.telegraphTimer = meta.telegraphDuration;
          boss.pendingTargetX = p.x;
          boss.pendingTargetY = p.y - p.h * 0.5;
          boss.specialDir = p.x >= boss.x ? 1 : -1;
          this.spawnShockRing(origin.x, origin.y, 18, meta.color);
          this.spawnFloatingText(boss.x, boss.y - boss.h - 10, meta.title.toUpperCase(), meta.color);
          this.emitHud();
        } else {
          boss.specialCd = 1.5;
        }
      }
    }

    boss.x = Math.max(boss.arenaMinX + boss.w * 0.5, Math.min(boss.arenaMaxX - boss.w * 0.5, boss.x));
    boss.y = Math.max(76 + boss.h, Math.min(boss.arenaFloorY, boss.y));

    // Contact check against actual remaining Boss pixels (3x4 grid on player)
    if (p.invulnTimer <= 0) {
      let hitSolid = false;
      for (const sx of [p.x - p.w * 0.42, p.x, p.x + p.w * 0.42]) {
        if (hitSolid) break;
        for (const sy of [p.y - p.h + 2, p.y - p.h * 0.65, p.y - p.h * 0.35, p.y - 2]) {
          if (this.isBossSolidAtWorld(sx, sy)) {
            this.damagePlayer(16 + tier * 2, p.x >= boss.x ? 1 : -1);
            hitSolid = true;
            break;
          }
        }
      }
    }
  }

  private triggerBossSpecial(boss: PixelBoss, id: string, tier: number): void {
    const p = this.player;
    const meta = BOSS_SPECIAL_CATALOG[id];
    const origin = getBossOriginWorld(boss, meta?.origin ?? 'CHEST');
    const dmgBase = 13 + tier * 2;
    const aimAng = Math.atan2(p.y - p.h * 0.5 - origin.y, p.x - origin.x);
    const lockedAng = Math.atan2(boss.pendingTargetY - origin.y, boss.pendingTargetX - origin.x);
    const phaseEnrage = boss.hp < boss.maxHp * 0.5 ? 0.65 : 0;
    const nextCooldown = () => Math.max(1.75, 2.95 - tier * 0.22 - phaseEnrage);

    const startSustained = (duration: number) => {
      boss.activeSpecialId = id;
      boss.activeSpecialTimer = duration;
      boss.activeSpecialTick = 0;
    };

    switch (id) {
      // --- Crowns ---
      case 'CROWN_HORNED': {
        this.spawnShockRing(origin.x, origin.y, 26, '#FBBF24');
        startSustained(0.65);
        return;
      }
      case 'CROWN_SMOKESTACKS': {
        for (let k = 0; k < 6; k++) {
          const sx = boss.x + (k % 2 === 0 ? -14 : 14);
          const sy = boss.y - boss.h + 12;
          const targetSpan = -140 + k * 56 + (Math.random() - 0.5) * 20;
          const ang = Math.atan2(-150 - Math.random() * 35, p.x - sx + targetSpan * 0.55);
          this.spawnEnemyShot(sx, sy, ang, 175 + Math.random() * 45, dmgBase + 2, '#FB923C', 240, true, false, {
            blastRadius: 7,
            blastPower: 4,
            projRadius: 2.5,
          });
        }
        this.spawnTransientLight(origin.x, origin.y, 70, [251, 146, 60], 1.1, 0.3, 0.25, false);
        sfx.playExplosion(0.9);
        break;
      }
      case 'CROWN_DOME': {
        const count = 12;
        for (let k = 0; k < count; k++) {
          const ang = -Math.PI + (k / (count - 1)) * Math.PI * 1.15 - 0.08;
          this.spawnEnemyShot(origin.x, origin.y - 6, ang, 145, dmgBase, '#38BDF8', 95, false, false, {
            projRadius: 2.0,
          });
        }
        this.spawnShockRing(origin.x, origin.y - 6, 36, '#38BDF8');
        sfx.playShoot('rail');
        break;
      }
      case 'CROWN_PRONG_SPIRE': {
        this.fireBossBeam(origin.x, origin.y, lockedAng, 340, dmgBase + 6, '#4ADE80', 7);
        this.spawnEnemyShot(origin.x, origin.y, lockedAng - 0.18, 195, dmgBase - 1, '#86EFAC', 0, false, true);
        this.spawnEnemyShot(origin.x, origin.y, lockedAng + 0.18, 195, dmgBase - 1, '#86EFAC', 0, false, true);
        break;
      }
      case 'CROWN_TURRET_CAP': {
        startSustained(0.68);
        return;
      }

      // --- Limbs (Left / Right) ---
      case 'LEFT_PAULDRON_ARM':
      case 'RIGHT_PAULDRON_ARM': {
        const dir = p.x >= origin.x ? 1 : -1;
        this.shakeMag = Math.max(this.shakeMag, 4.8);
        this.spawnShockRing(origin.x, boss.y - 4, 34, '#93C5FD');
        for (let k = 0; k < 5; k++) {
          const ang = dir > 0 ? -0.15 - k * 0.14 : -Math.PI + 0.15 + k * 0.14;
          this.spawnEnemyShot(
            origin.x,
            origin.y,
            ang,
            135 + k * 24,
            dmgBase + 1,
            '#93C5FD',
            260,
            false,
            false,
            { blastRadius: 6, blastPower: 4, projRadius: 2.4 }
          );
        }
        sfx.playExplosion(0.85);
        break;
      }
      case 'LEFT_CANNON_POD':
      case 'RIGHT_CANNON_POD': {
        startSustained(0.52);
        return;
      }
      case 'LEFT_CRYSTAL_WING':
      case 'RIGHT_CRYSTAL_WING': {
        for (let k = -2; k <= 2; k++) {
          this.spawnEnemyShot(origin.x, origin.y, aimAng + k * 0.15, 205 - Math.abs(k) * 12, dmgBase, '#34D399', 0, false, true, {
            projRadius: 2.0,
          });
        }
        this.spawnShockRing(origin.x, origin.y, 22, '#34D399');
        sfx.playShoot('rail');
        break;
      }
      case 'LEFT_SHIELD_PLATE':
      case 'RIGHT_SHIELD_PLATE': {
        boss.shieldSide = id.startsWith('LEFT') ? -1 : 1;
        boss.shieldActiveTimer = 1.65;
        for (let k = -2; k <= 1; k++) {
          this.spawnEnemyShot(
            origin.x,
            origin.y,
            aimAng + (k + 0.5) * 0.22,
            165,
            dmgBase,
            '#60A5FA',
            0,
            false,
            false,
            { blastRadius: 4.5, blastPower: 3, projRadius: 2.2 }
          );
        }
        this.spawnShockRing(origin.x, origin.y, 30, '#60A5FA');
        sfx.playExplosion(0.75);
        break;
      }
      case 'LEFT_CLAW_PINCER':
      case 'RIGHT_CLAW_PINCER': {
        const dir = p.x >= boss.x ? 1 : -1;
        for (const offset of [-0.22, 0, 0.22]) {
          this.spawnEnemyShot(origin.x, origin.y, aimAng + offset, 215, dmgBase + 1, '#F87171', 0, false, false, {
            projRadius: 2.1,
          });
        }
        if (Math.abs(p.x - boss.x) < 120) {
          boss.vx = dir * 145;
        }
        this.spawnShockRing(origin.x, origin.y, 20, '#F87171');
        break;
      }

      // --- Hulls ---
      case 'HULL_CITADEL': {
        const dir = p.x >= boss.x ? 1 : -1;
        for (let k = -2; k <= 2; k++) {
          this.spawnEnemyShot(
            boss.x + dir * 20,
            boss.y - boss.h * 0.5 + k * 14,
            dir > 0 ? 0 : Math.PI,
            175,
            dmgBase + 1,
            '#E2E8F0',
            0,
            false,
            false,
            { blastRadius: 5.5, blastPower: 3, projRadius: 2.4 }
          );
        }
        this.spawnShockRing(boss.x + dir * 20, boss.y - boss.h * 0.5, 28, '#E2E8F0');
        sfx.playExplosion(0.9);
        break;
      }
      case 'HULL_BOILER': {
        const ring = 12;
        for (let k = 0; k < ring; k++) {
          const ang = (k / ring) * Math.PI * 2;
          this.spawnEnemyShot(origin.x, origin.y, ang, 155, dmgBase, '#F97316', 45, true, false, {
            blastRadius: 4.5,
            blastPower: 3,
            projRadius: 2.1,
          });
        }
        this.spawnShockRing(origin.x, origin.y, 58, '#F97316');
        this.spawnTransientLight(origin.x, origin.y, 96, [249, 115, 22], 1.25, 0.35, 0.3, false);
        sfx.playExplosion(1.1);
        break;
      }
      case 'HULL_DIAMOND': {
        for (const dAng of [0.35, Math.PI - 0.35, -0.35, -Math.PI + 0.35]) {
          this.fireBossBeam(origin.x, origin.y, dAng, 260, dmgBase + 2, '#38BDF8', 5);
        }
        for (let k = 0; k < 4; k++) {
          this.spawnEnemyShot(origin.x, origin.y, aimAng + (k - 1.5) * 0.25, 165, dmgBase, '#7DD3FC');
        }
        break;
      }
      case 'HULL_RIBCAGE': {
        startSustained(0.76);
        return;
      }

      // --- Bases ---
      case 'BASE_PILLAR_LEGS': {
        boss.vy = -215;
        boss.vx = boss.specialDir * 70;
        startSustained(1.1);
        return;
      }
      case 'BASE_TANK_TREADS': {
        startSustained(0.92);
        return;
      }
      case 'BASE_THRUSTER_BELLS': {
        boss.vy = -120;
        startSustained(0.98);
        return;
      }
      case 'BASE_SPIKE_KEEL': {
        boss.vx = 0;
        boss.vy = 315;
        startSustained(0.85);
        return;
      }

      // --- Core Slot Resonances ---
      case 'CORE_RESONANCE_CHEST': {
        for (let k = -3; k <= 3; k++) {
          this.spawnEnemyShot(origin.x, origin.y, aimAng + k * 0.14, 185, dmgBase + 2, '#38BDF8', 0, false, false, {
            blastRadius: 5,
            blastPower: 3,
            projRadius: 2.3,
          });
        }
        this.spawnShockRing(origin.x, origin.y, 44, '#38BDF8');
        sfx.playShoot('rail');
        break;
      }
      case 'CORE_RESONANCE_CROWN': {
        this.fireBossBeam(origin.x, origin.y, lockedAng - 0.1, 340, dmgBase + 3, '#38BDF8', 6);
        this.fireBossBeam(origin.x, origin.y, lockedAng + 0.1, 340, dmgBase + 3, '#7DD3FC', 6);
        break;
      }
      case 'CORE_RESONANCE_LEFT_POD':
      case 'CORE_RESONANCE_RIGHT_POD': {
        startSustained(0.62);
        return;
      }
      case 'CORE_RESONANCE_KEEL': {
        for (let k = 0; k < 8; k++) {
          const ang = -Math.PI + (k / 7) * Math.PI;
          this.spawnEnemyShot(origin.x, boss.y - 6, ang, 185, dmgBase + 1, '#F59E0B', 240, true, false, {
            blastRadius: 6,
            blastPower: 4,
            projRadius: 2.3,
          });
        }
        this.spawnShockRing(origin.x, boss.y - 6, 48, '#F59E0B');
        sfx.playExplosion(1.0);
        break;
      }

      // --- Part-Mix Synergy Combos ---
      case 'COMBO_INFERNAL_OVERPRESSURE': {
        for (let k = 0; k < 4; k++) {
          const sx = boss.x + (k % 2 === 0 ? -14 : 14);
          this.spawnEnemyShot(sx, boss.y - boss.h + 12, Math.atan2(-165, p.x - sx + (k - 1.5) * 45), 195, dmgBase + 3, '#FB923C', 235, true, false, {
            blastRadius: 8,
            blastPower: 5,
            projRadius: 2.8,
          });
        }
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          this.spawnEnemyShot(boss.x, boss.y - boss.h * 0.5, ang, 155, dmgBase, '#FBBF24', 0, true, false);
        }
        this.spawnShockRing(boss.x, boss.y - boss.h * 0.5, 62, '#FB923C');
        sfx.playExplosion(1.2);
        break;
      }
      case 'COMBO_BASTION_SIEGE': {
        this.fireBossBeam(origin.x, origin.y, lockedAng - 0.14, 340, dmgBase + 3, '#FBBF24', 6);
        this.fireBossBeam(origin.x, origin.y, lockedAng + 0.14, 340, dmgBase + 3, '#FBBF24', 6);
        for (let k = -2; k <= 2; k++) {
          this.spawnEnemyShot(boss.x + boss.facing * 18, boss.y - boss.h * 0.55 + k * 10, aimAng + k * 0.08, 190, dmgBase + 1, '#F59E0B', 0, false, false, {
            blastRadius: 5.5,
            blastPower: 4,
            projRadius: 2.4,
          });
        }
        break;
      }
      case 'COMBO_PRISMATIC_ANNIHILATION': {
        for (let k = -2; k <= 2; k++) {
          this.fireBossBeam(origin.x, origin.y, lockedAng + k * 0.16, 350, dmgBase + 3, k % 2 === 0 ? '#4ADE80' : '#38BDF8', 6);
        }
        break;
      }
      case 'COMBO_REND_HARVEST': {
        startSustained(0.68);
        return;
      }
      case 'COMBO_SERAPHIM_DIVE': {
        boss.vy = -90;
        startSustained(0.84);
        return;
      }
      case 'COMBO_BLITZKRIEG_THUNDER': {
        startSustained(0.95);
        return;
      }
      case 'COMBO_CATACLYSM_PILEDRIVER': {
        boss.vx = 0;
        boss.vy = 330;
        startSustained(0.9);
        return;
      }
      case 'COMBO_PHALANX_CRUSHER': {
        boss.shieldSide = boss.parts.leftLimb === 'SHIELD_PLATE' ? -1 : 1;
        boss.shieldActiveTimer = 2.0;
        for (let k = 0; k < 5; k++) {
          this.spawnEnemyShot(
            boss.x,
            boss.y - boss.h * 0.55,
            aimAng + (k - 2) * 0.16,
            165 + k * 12,
            dmgBase + 2,
            '#60A5FA',
            180,
            false,
            false,
            { blastRadius: 7, blastPower: 4, projRadius: 2.6 }
          );
        }
        this.spawnShockRing(boss.x, boss.y - boss.h * 0.5, 48, '#60A5FA');
        sfx.playExplosion(1.0);
        break;
      }
      case 'COMBO_BROADSIDE_OBLITERATION': {
        startSustained(0.76);
        return;
      }
      case 'COMBO_SOLAR_ECLIPSE': {
        for (let k = 0; k < 10; k++) {
          const sx = boss.x - 42 + (k / 9) * 84;
          const sy = boss.y - boss.h + 24;
          const ang = Math.atan2(p.y - p.h * 0.5 - sy, p.x - sx);
          this.spawnEnemyShot(sx, sy, ang + (Math.random() - 0.5) * 0.12, 185, dmgBase, '#4ADE80', 0, false, true, {
            projRadius: 2.1,
          });
        }
        this.spawnShockRing(boss.x, boss.y - boss.h * 0.6, 56, '#4ADE80');
        sfx.playShoot('rail');
        break;
      }
      case 'COMBO_SANCTUM_TREMOR': {
        boss.vy = -210;
        boss.vx = boss.specialDir * 60;
        startSustained(1.1);
        return;
      }
      default:
        break;
    }

    boss.specialCd = nextCooldown();
  }

  private updateActiveBossSpecial(boss: PixelBoss, dt: number, tier: number): void {
    const id = boss.activeSpecialId;
    if (!id) return;

    const p = this.player;
    const dmgBase = 12 + tier * 2;
    const prevTimer = boss.activeSpecialTimer;
    boss.activeSpecialTimer -= dt;
    const elapsed = Math.max(0, boss.activeSpecialTick);
    boss.activeSpecialTick += dt;

    const phaseEnrage = boss.hp < boss.maxHp * 0.5 ? 0.65 : 0;
    const finishSpecial = () => {
      boss.activeSpecialId = null;
      boss.activeSpecialTimer = 0;
      boss.specialCd = Math.max(1.75, 2.95 - tier * 0.22 - phaseEnrage);
    };

    const tickInterval = (interval: number, fn: (step: number) => void) => {
      const prevStep = Math.floor(elapsed / interval);
      const currStep = Math.floor((elapsed + dt) / interval);
      if (currStep > prevStep) {
        fn(currStep);
      }
    };

    if (id === 'CROWN_HORNED') {
      boss.vx = boss.specialDir * 180;
      boss.x += boss.vx * dt;
      boss.vy += GRAVITY * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
      }
      tickInterval(0.18, () => {
        const crownPos = getBossOriginWorld(boss, 'CROWN');
        const ang = boss.specialDir > 0 ? 0.08 : Math.PI - 0.08;
        this.spawnEnemyShot(crownPos.x + boss.specialDir * 14, crownPos.y, ang, 225, dmgBase, '#FBBF24', 0, true, false, {
          blastRadius: 4.5,
          blastPower: 3,
        });
      });
    } else if (id === 'CROWN_TURRET_CAP') {
      tickInterval(0.11, (step) => {
        const crownPos = getBossOriginWorld(boss, 'CROWN');
        const sweepOffset = Math.sin(step * 0.9) * 0.22;
        const ang = Math.atan2(p.y - p.h * 0.5 - crownPos.y, p.x - crownPos.x) + sweepOffset;
        this.spawnEnemyShot(crownPos.x + Math.cos(ang) * 18, crownPos.y, ang, 210, dmgBase - 1, '#F59E0B');
        sfx.playExplosion(0.35);
      });
    } else if (id === 'LEFT_CANNON_POD' || id === 'RIGHT_CANNON_POD') {
      const sideOrigin = getBossOriginWorld(boss, id.startsWith('LEFT') ? 'LEFT_LIMB' : 'RIGHT_LIMB');
      tickInterval(0.16, () => {
        const ang = Math.atan2(p.y - p.h * 0.5 - sideOrigin.y, p.x - sideOrigin.x);
        this.spawnEnemyShot(sideOrigin.x, sideOrigin.y, ang + (Math.random() - 0.5) * 0.12, 200, dmgBase + 2, '#FB923C', 30, true, false, {
          blastRadius: 7,
          blastPower: 4,
          projRadius: 2.5,
        });
        sfx.playExplosion(0.6);
      });
    } else if (id === 'HULL_RIBCAGE') {
      tickInterval(0.12, (step) => {
        const ang = Math.atan2(p.y - p.h * 0.5 - (boss.y - boss.h * 0.5), p.x - boss.x);
        const wave = Math.sin(step * 0.8) * 0.28;
        this.spawnEnemyShot(boss.x, boss.y - boss.h * 0.5, ang + wave, 180, dmgBase, '#C084FC', 0, false, false, {
          projRadius: 2.0,
        });
        this.spawnEnemyShot(boss.x, boss.y - boss.h * 0.5, ang - wave, 165, dmgBase, '#E879F9', 0, false, false, {
          projRadius: 2.0,
        });
      });
    } else if (id === 'BASE_TANK_TREADS') {
      boss.vx = boss.specialDir * 195;
      boss.x += boss.vx * dt;
      boss.vy += GRAVITY * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
      }
      tickInterval(0.18, () => {
        this.spawnEnemyShot(
          boss.x - boss.specialDir * 24,
          boss.y - 6,
          Math.atan2(-90, -boss.specialDir * 55),
          120,
          dmgBase,
          '#FBBF24',
          260,
          true,
          false,
          { blastRadius: 6, blastPower: 3 }
        );
      });
    } else if (id === 'BASE_THRUSTER_BELLS') {
      boss.vx = boss.specialDir * 165;
      boss.x += boss.vx * dt;
      const hoverY = boss.arenaFloorY - 78;
      boss.vy += ((hoverY - boss.y) * 4 - boss.vy) * 5 * dt;
      boss.y += boss.vy * dt;
      tickInterval(0.18, () => {
        this.spawnEnemyShot(boss.x, boss.y - 6, Math.PI * 0.5 + (Math.random() - 0.5) * 0.25, 130, dmgBase + 1, '#FB923C', 210, true, false, {
          blastRadius: 7,
          blastPower: 4,
          projRadius: 2.5,
        });
      });
    } else if (id === 'BASE_PILLAR_LEGS' || id === 'COMBO_SANCTUM_TREMOR') {
      boss.x += boss.vx * dt;
      boss.vy += GRAVITY * 1.15 * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY && prevTimer < 0.95) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
        boss.vx = 0;
        this.shakeMag = Math.max(this.shakeMag, 9.5);
        this.spawnShockRing(boss.x, boss.arenaFloorY - 2, 86, '#38BDF8');
        sfx.playExplosion(1.3);
        for (let k = 0; k < 6; k++) {
          const ang = -Math.PI * 0.15 - (k / 5) * Math.PI * 0.7;
          this.spawnEnemyShot(boss.x + (k - 2.5) * 14, boss.arenaFloorY - 6, ang, 175 + Math.random() * 45, dmgBase + 1, '#94A3B8', 290, false, false, {
            blastRadius: 6,
            blastPower: 4,
            projRadius: 2.4,
          });
        }
        if (id === 'COMBO_SANCTUM_TREMOR') {
          for (let k = 0; k < 10; k++) {
            const ang = -Math.PI + (k / 9) * Math.PI;
            this.spawnEnemyShot(boss.x, boss.y - boss.h + 16, ang, 165, dmgBase, '#38BDF8', 75);
          }
        }
        finishSpecial();
        return;
      }
    } else if (id === 'BASE_SPIKE_KEEL' || id === 'COMBO_CATACLYSM_PILEDRIVER') {
      boss.vy += 650 * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
        this.shakeMag = Math.max(this.shakeMag, 10.5);
        this.spawnShockRing(boss.x, boss.arenaFloorY - 2, 92, '#F43F5E');
        this.spawnTransientLight(boss.x, boss.arenaFloorY - 8, 95, [244, 63, 94], 1.3, 0.35, 0.32, false);
        sfx.playExplosion(1.4);
        for (let k = 0; k < 8; k++) {
          const ang = -Math.PI * 0.12 - (k / 7) * Math.PI * 0.76;
          this.spawnEnemyShot(boss.x, boss.arenaFloorY - 6, ang, 185, dmgBase + 2, '#F43F5E', 210, false, false, {
            blastRadius: 6.5,
            blastPower: 4,
            projRadius: 2.5,
          });
        }
        if (id === 'COMBO_CATACLYSM_PILEDRIVER') {
          this.spawnEnemyShot(boss.x - 16, boss.arenaFloorY - 8, Math.PI - 0.05, 220, dmgBase + 3, '#FBBF24', 0, true, false, {
            blastRadius: 7,
            blastPower: 4,
            projRadius: 2.8,
          });
          this.spawnEnemyShot(boss.x + 16, boss.arenaFloorY - 8, 0.05, 220, dmgBase + 3, '#FBBF24', 0, true, false, {
            blastRadius: 7,
            blastPower: 4,
            projRadius: 2.8,
          });
        }
        finishSpecial();
        return;
      }
    } else if (id === 'CORE_RESONANCE_LEFT_POD' || id === 'CORE_RESONANCE_RIGHT_POD') {
      const origin = getBossOriginWorld(boss, id === 'CORE_RESONANCE_LEFT_POD' ? 'LEFT_LIMB' : 'RIGHT_LIMB');
      tickInterval(0.11, (step) => {
        const ang = Math.atan2(p.y - p.h * 0.5 - origin.y, p.x - origin.x) + (step - 3) * 0.09;
        this.spawnEnemyShot(origin.x, origin.y, ang, 215, dmgBase + 2, '#38BDF8', 0, false, false, {
          blastRadius: 5,
          blastPower: 3,
          projRadius: 2.3,
        });
        sfx.playShoot('rail');
      });
    } else if (id === 'COMBO_REND_HARVEST') {
      boss.vx = boss.specialDir * 150;
      boss.x += boss.vx * dt;
      boss.vy += GRAVITY * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
      }
      tickInterval(0.16, () => {
        const ang = Math.atan2(p.y - p.h * 0.5 - (boss.y - boss.h * 0.5), p.x - boss.x);
        this.spawnEnemyShot(boss.x + boss.specialDir * 24, boss.y - boss.h * 0.5, ang - 0.14, 210, dmgBase + 1, '#F87171');
        this.spawnEnemyShot(boss.x + boss.specialDir * 24, boss.y - boss.h * 0.5, ang + 0.14, 210, dmgBase + 1, '#F87171');
      });
    } else if (id === 'COMBO_SERAPHIM_DIVE') {
      boss.vx = boss.specialDir * 175;
      boss.x += boss.vx * dt;
      const arcY = boss.arenaFloorY - 45 - Math.sin((elapsed / 0.84) * Math.PI) * 58;
      boss.vy += ((arcY - boss.y) * 5 - boss.vy) * 6 * dt;
      boss.y += boss.vy * dt;
      tickInterval(0.1, () => {
        const ang = Math.atan2(p.y - p.h * 0.5 - (boss.y - boss.h * 0.5), p.x - boss.x);
        this.spawnEnemyShot(boss.x, boss.y - boss.h * 0.55, ang, 195, dmgBase, '#34D399', 0, false, true);
      });
    } else if (id === 'COMBO_BLITZKRIEG_THUNDER') {
      boss.vx = boss.specialDir * 170;
      boss.x += boss.vx * dt;
      boss.vy += GRAVITY * dt;
      boss.y += boss.vy * dt;
      if (boss.y >= boss.arenaFloorY) {
        boss.y = boss.arenaFloorY;
        boss.vy = 0;
      }
      tickInterval(0.2, () => {
        const ang = Math.atan2(p.y - p.h * 0.5 - (boss.y - boss.h * 0.5), p.x - boss.x);
        this.spawnEnemyShot(boss.x + boss.specialDir * 22, boss.y - boss.h * 0.5, ang, 205, dmgBase + 2, '#F97316', 25, true, false, {
          blastRadius: 6.5,
          blastPower: 4,
          projRadius: 2.5,
        });
        sfx.playExplosion(0.55);
      });
    } else if (id === 'COMBO_BROADSIDE_OBLITERATION') {
      tickInterval(0.14, (step) => {
        const origin = getBossOriginWorld(boss, step % 2 === 0 ? 'LEFT_LIMB' : 'RIGHT_LIMB');
        const ang = Math.atan2(p.y - p.h * 0.5 - origin.y, p.x - origin.x);
        this.spawnEnemyShot(origin.x, origin.y, ang + (Math.random() - 0.5) * 0.14, 200, dmgBase + 2, '#FB923C', 20, true, false, {
          blastRadius: 6.5,
          blastPower: 4,
          projRadius: 2.5,
        });
        sfx.playExplosion(0.55);
      });
    }

    if (boss.activeSpecialTimer <= 0) {
      finishSpecial();
    }
  }

  private isBossSolidAtWorld(wx: number, wy: number): boolean {
    const boss = this.boss;
    if (!boss) return false;
    const lx = Math.floor(wx - (boss.x - boss.w * 0.5));
    const ly = Math.floor(wy - (boss.y - boss.h));
    if (lx < 0 || lx >= boss.w || ly < 0 || ly >= boss.h) return false;
    return boss.mats[ly * boss.w + lx] !== Mat.EMPTY;
  }

  private severDisconnectedBossChunks(boss: PixelBoss, hitWx: number, hitWy: number): number {
    const w = boss.w;
    const h = boss.h;
    const n = w * h;
    if (this.bossBfsComp.length < n) this.bossBfsComp = new Int32Array(n);
    if (this.bossBfsQueue.length < n) this.bossBfsQueue = new Int32Array(n);
    const comp = this.bossBfsComp;
    const queue = this.bossBfsQueue;
    comp.fill(0, 0, n);

    interface BossComponent {
      id: number;
      count: number;
      coreCount: number;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      sumX: number;
      sumY: number;
    }

    const components: BossComponent[] = [];
    let nextCompId = 1;

    for (let startIdx = 0; startIdx < n; startIdx++) {
      if (boss.mats[startIdx] === Mat.EMPTY || comp[startIdx] !== 0) continue;

      const compId = nextCompId++;
      comp[startIdx] = compId;
      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = startIdx;

      let count = 0;
      let coreCount = 0;
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      let sumX = 0;
      let sumY = 0;

      while (qHead < qTail) {
        const idx = queue[qHead++];
        const lx = idx % w;
        const ly = (idx / w) | 0;
        count++;
        if (boss.isCore[idx] === 1) coreCount++;
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
        sumX += lx;
        sumY += ly;

        if (lx > 0) {
          const ni = idx - 1;
          if (comp[ni] === 0 && boss.mats[ni] !== Mat.EMPTY) {
            comp[ni] = compId;
            queue[qTail++] = ni;
          }
        }
        if (lx + 1 < w) {
          const ni = idx + 1;
          if (comp[ni] === 0 && boss.mats[ni] !== Mat.EMPTY) {
            comp[ni] = compId;
            queue[qTail++] = ni;
          }
        }
        if (ly > 0) {
          const ni = idx - w;
          if (comp[ni] === 0 && boss.mats[ni] !== Mat.EMPTY) {
            comp[ni] = compId;
            queue[qTail++] = ni;
          }
        }
        if (ly + 1 < h) {
          const ni = idx + w;
          if (comp[ni] === 0 && boss.mats[ni] !== Mat.EMPTY) {
            comp[ni] = compId;
            queue[qTail++] = ni;
          }
        }
      }

      components.push({
        id: compId,
        count,
        coreCount,
        minX,
        maxX,
        minY,
        maxY,
        sumX,
        sumY,
      });
    }

    if (components.length <= 1) return 0;

    // Preserve the largest connected landmass as the active boss hull
    let mainComp = components[0];
    for (let i = 1; i < components.length; i++) {
      if (components[i].count > mainComp.count) {
        mainComp = components[i];
      }
    }

    const originX = boss.x - w * 0.5;
    const originY = boss.y - h;
    let totalBonusDmg = 0;
    let showedCallout = false;

    for (const c of components) {
      if (c.id === mainComp.id) continue;

      const cWorldX = originX + c.sumX / c.count + 0.5;
      const cWorldY = originY + c.sumY / c.count + 0.5;
      const outX = cWorldX - boss.x + (cWorldX - hitWx) * 0.6;
      const outY = cWorldY - (boss.y - h * 0.5) - 24;
      const pushDir = outX >= 0 ? 1 : -1;
      const vx = pushDir * (38 + Math.random() * 52) + Math.max(-65, Math.min(65, outX * 1.1));
      const vy = -55 - Math.random() * 48 + Math.max(-45, Math.min(20, outY * 0.45));
      const angularVel = (Math.random() - 0.5) * 6.5;

      if (c.count <= 10) {
        for (let ly = c.minY; ly <= c.maxY; ly++) {
          for (let lx = c.minX; lx <= c.maxX; lx++) {
            const idx = ly * w + lx;
            if (comp[idx] !== c.id) continue;
            const col = boss.colors[idx];
            const wasCore = boss.isCore[idx] === 1;
            boss.mats[idx] = Mat.EMPTY;
            boss.colors[idx] = 0;
            boss.pixelDmg[idx] = 0;
            boss.isCore[idx] = 0;
            if (wasCore) boss.corePixelsRemaining = Math.max(0, boss.corePixelsRemaining - 1);
            this.world.pixelsDestroyedCount++;
            this.world.spawnParticle(
              originX + lx + 0.5,
              originY + ly + 0.5,
              vx + (Math.random() - 0.5) * 55,
              vy - Math.random() * 30,
              wasCore ? Mat.EMBER : Mat.RUBBLE,
              col,
              0.9,
              !wasCore
            );
          }
        }
        totalBonusDmg += Math.max(1, Math.round(c.count * 0.4 + c.coreCount * 2.5));
        boss.canvasDirty = true;
        continue;
      }

      const cw = c.maxX - c.minX + 1;
      const ch = c.maxY - c.minY + 1;
      const cMats = new Uint8Array(cw * ch);
      const cColors = new Uint32Array(cw * ch);
      const localCx = c.sumX / c.count - c.minX + 0.5;
      const localCy = c.sumY / c.count - c.minY + 0.5;

      for (let ly = c.minY; ly <= c.maxY; ly++) {
        for (let lx = c.minX; lx <= c.maxX; lx++) {
          const idx = ly * w + lx;
          if (comp[idx] !== c.id) continue;
          const ci = (ly - c.minY) * cw + (lx - c.minX);
          cMats[ci] = boss.mats[idx];
          cColors[ci] = boss.colors[idx];

          if (boss.isCore[idx] === 1) {
            boss.isCore[idx] = 0;
            boss.corePixelsRemaining = Math.max(0, boss.corePixelsRemaining - 1);
          }
          boss.mats[idx] = Mat.EMPTY;
          boss.colors[idx] = 0;
          boss.pixelDmg[idx] = 0;
          this.world.pixelsDestroyedCount++;
        }
      }

      boss.canvasDirty = true;
      this.world.spawnDetachedChunk(
        cWorldX,
        cWorldY,
        cw,
        ch,
        localCx,
        localCy,
        cMats,
        cColors,
        c.count,
        vx,
        vy,
        angularVel
      );

      const chunkDmg = Math.min(95, Math.max(4, Math.round(c.count * 0.16 + c.coreCount * 3.0)));
      totalBonusDmg += chunkDmg;

      this.shakeMag = Math.max(this.shakeMag, Math.min(7.5, 3.0 + c.count * 0.025));
      this.spawnShockRing(
        cWorldX,
        cWorldY,
        Math.min(48, 16 + Math.sqrt(c.count) * 1.8),
        c.coreCount > 0 ? '#38BDF8' : '#FACC15'
      );
      this.spawnTransientLight(
        cWorldX,
        cWorldY,
        54,
        c.coreCount > 0 ? [56, 189, 248] : [251, 146, 60],
        0.9,
        0.24,
        0.28,
        false
      );
      sfx.playCollapse(Math.min(1.5, 0.65 + c.count / 120));

      if (!showedCallout && c.count >= 20) {
        showedCallout = true;
        this.spawnFloatingText(
          cWorldX,
          cWorldY - 6,
          c.coreCount > 0 ? `CORE CHUNK SEVERED! -${chunkDmg}` : `PART SEVERED! -${chunkDmg}`,
          c.coreCount > 0 ? '#38BDF8' : '#FACC15'
        );
      }
    }

    return totalBonusDmg;
  }

  private damageBossAtWorld(
    wx: number,
    wy: number,
    radius: number,
    power: number,
    baseDmg: number,
    damageType: DamageType,
    ignite: boolean,
    isDirectHit: boolean
  ): void {
    const boss = this.boss;
    if (!boss) return;

    const originX = boss.x - boss.w * 0.5;
    const originY = boss.y - boss.h;
    const clx = wx - originX;
    const cly = wy - originY;
    const ir = Math.ceil(radius);

    let armorCleared = 0;
    let coreCleared = 0;
    let touchedCore = false;
    let mulSum = 0;
    let mulCount = 0;

    for (let dy = -ir; dy <= ir; dy++) {
      const ly = Math.round(cly + dy);
      if (ly < 0 || ly >= boss.h) continue;
      for (let dx = -ir; dx <= ir; dx++) {
        const lx = Math.round(clx + dx);
        if (lx < 0 || lx >= boss.w) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;

        const idx = ly * boss.w + lx;
        const m = boss.mats[idx] as Mat;
        if (m === Mat.EMPTY) continue;

        const props = MAT_PROPS[m];
        const isCorePx = boss.isCore[idx] === 1;
        if (isCorePx) touchedCore = true;

        const rawMul = props.damageMul[damageType] ?? 1.0;
        const effMul = isCorePx ? Math.max(0.95, rawMul) : rawMul;
        mulSum += effMul;
        mulCount++;

        const distRatio = dist / Math.max(1, radius);
        const rawHit = power * 5.2 * (1.25 - distRatio * 0.75);
        const effDmg = rawHit * effMul;
        const dmgDelta = effDmg >= 0.85 ? Math.round(effDmg) : Math.random() < effDmg ? 1 : 0;
        const nextDmg = boss.pixelDmg[idx] + dmgDelta;

        if (nextDmg >= props.maxHp || (isCorePx && dist <= radius * 0.65)) {
          const col = boss.colors[idx];
          boss.mats[idx] = Mat.EMPTY;
          boss.colors[idx] = 0;
          boss.pixelDmg[idx] = 0;
          boss.canvasDirty = true;
          this.world.pixelsDestroyedCount++;

          if (isCorePx) {
            boss.isCore[idx] = 0;
            boss.corePixelsRemaining = Math.max(0, boss.corePixelsRemaining - 1);
            coreCleared++;
          } else {
            armorCleared++;
          }

          if (Math.random() < 0.45) {
            this.world.spawnParticle(
              originX + lx + 0.5,
              originY + ly + 0.5,
              (dx + (Math.random() - 0.5) * 4) * 14,
              (dy - 2) * 14 - Math.random() * 45,
              isCorePx ? Mat.EMBER : ignite ? Mat.EMBER : Mat.RUBBLE,
              col,
              0.85,
              !isCorePx
            );
          }
        } else if (dmgDelta > 0) {
          boss.pixelDmg[idx] = Math.min(254, nextDmg);
          boss.canvasDirty = true;
          if (effMul < 0.55 && Math.random() < 0.25) {
            this.world.spawnParticle(
              originX + lx + 0.5,
              originY + ly + 0.5,
              (Math.random() - 0.5) * 90,
              -30 - Math.random() * 45,
              Mat.EMBER,
              packColor(255, 232, 160),
              0.24,
              false
            );
          }
        }
      }
    }

    const avgMul = mulCount > 0 ? Math.max(0.5, Math.min(1.55, mulSum / mulCount)) : 1.0;
    const railLv = this.getRelicLevel('RAIL_FOCUSER');
    const focuserMul = railLv > 0 ? 1 + 0.45 * railLv : 1.0;
    const coreBonus = touchedCore || coreCleared > 0 ? 2.6 : 1.0;
    const chipBonus = armorCleared * 0.45 + coreCleared * 3.5;
    const rawDmg = isDirectHit ? baseDmg : Math.max(baseDmg * 0.65, chipBonus);
    const totalDmg = rawDmg * avgMul * coreBonus * focuserMul;
    const dispDmg = Math.max(1, Math.round(totalDmg));

    let severDmg = 0;
    if (armorCleared + coreCleared > 0) {
      severDmg = this.severDisconnectedBossChunks(boss, wx, wy);

      // Check whether any modular part (crown, limbs, base) has lost >=75% of its structure
      const remCounts = countBossPartPixels(
        boss.mats,
        boss.w,
        boss.h,
        boss.w * 0.5,
        boss.parts.hw,
        boss.parts.crownBaseY,
        boss.parts.baseTopY
      );
      for (const partKey of ['crown', 'leftLimb', 'rightLimb', 'base'] as BossPartKey[]) {
        const initCount = boss.parts.initialCounts[partKey];
        if (!boss.disabledParts[partKey] && initCount > 0 && remCounts[partKey] / initCount < 0.25) {
          boss.disabledParts[partKey] = true;
          const region =
            partKey === 'crown'
              ? 'CROWN'
              : partKey === 'leftLimb'
              ? 'LEFT_LIMB'
              : partKey === 'rightLimb'
              ? 'RIGHT_LIMB'
              : 'BASE';
          const pOrigin = getBossOriginWorld(boss, region);
          this.spawnShockRing(pOrigin.x, pOrigin.y, 28, '#FACC15');
          this.spawnFloatingText(pOrigin.x, pOrigin.y - 8, getPartDisabledCallout(partKey, boss.parts), '#FACC15');

          // Interrupt queued or active special if it relied on this destroyed module
          if (boss.pendingSpecialId) {
            const pMeta = BOSS_SPECIAL_CATALOG[boss.pendingSpecialId];
            if (pMeta?.requiredParts.includes(partKey)) {
              boss.pendingSpecialId = null;
              boss.telegraphTimer = 0;
              boss.specialCd = 1.6;
            }
          }
          if (boss.activeSpecialId) {
            const aMeta = BOSS_SPECIAL_CATALOG[boss.activeSpecialId];
            if (aMeta?.requiredParts.includes(partKey)) {
              boss.activeSpecialId = null;
              boss.activeSpecialTimer = 0;
              boss.specialCd = 1.6;
            }
          }
        }
      }
    }

    boss.hp = Math.max(0, boss.hp - totalDmg - severDmg);
    boss.hurtFlash = 0.1;

    const label =
      coreBonus > 1
        ? `CORE -${dispDmg}!`
        : avgMul >= 1.35
        ? `WEAK -${dispDmg}`
        : avgMul <= 0.65
        ? `RESIST -${dispDmg}`
        : `${dispDmg}`;
    const labelColor =
      coreBonus > 1
        ? '#38BDF8'
        : avgMul >= 1.35
        ? '#FACC15'
        : avgMul <= 0.65
        ? '#94A3B8'
        : '#F4F4F5';

    this.spawnFloatingText(wx, wy - 6, label, labelColor);

    const coreThreshold = Math.floor(boss.corePixelsTotal * 0.08);
    if (boss.corePixelsRemaining <= coreThreshold || boss.hp <= 0) {
      this.defeatBoss(boss.corePixelsRemaining <= coreThreshold);
    }
  }

  private defeatBoss(byWeakSpot: boolean): void {
    const boss = this.boss;
    if (!boss) return;

    const originX = boss.x - boss.w * 0.5;
    const originY = boss.y - boss.h;
    for (let ly = 0; ly < boss.h; ly++) {
      for (let lx = 0; lx < boss.w; lx++) {
        const idx = ly * boss.w + lx;
        const m = boss.mats[idx] as Mat;
        if (m === Mat.EMPTY) continue;
        this.world.pixelsDestroyedCount++;
        if (Math.random() < 0.32) {
          this.world.spawnParticle(
            originX + lx + 0.5,
            originY + ly + 0.5,
            (lx - boss.w * 0.5) * 6 + (Math.random() - 0.5) * 95,
            (ly - boss.h * 0.5) * 5 - 45 - Math.random() * 75,
            boss.isCore[idx] ? Mat.EMBER : Mat.RUBBLE,
            boss.colors[idx],
            1.35,
            !boss.isCore[idx]
          );
        }
      }
    }

    sfx.playExplosion(2.0);
    this.shakeMag = Math.max(this.shakeMag, 12);
    this.spawnShockRing(boss.x, boss.y - boss.h * 0.5, 96, '#38BDF8');
    this.spawnShockRing(boss.x, boss.y - boss.h * 0.5, 62, '#F59E0B');
    this.spawnShockRing(boss.x, boss.y - boss.h * 0.5, 36, '#FFFFFF');
    this.spawnTransientLight(boss.x, boss.y - boss.h * 0.5, 145, [255, 224, 150], 1.4, 0.42, 0.55, true);

    this.kills++;
    this.portal.active = true;

    this.spawnFloatingText(
      boss.x,
      boss.y - boss.h - 10,
      byWeakSpot ? `${boss.weakSpotName.toUpperCase()} SHATTERED!` : `${boss.name.toUpperCase()} DEFEATED!`,
      '#FACC15'
    );

    const goldShards = 18 + this.depth;
    for (let g = 0; g < goldShards; g++) {
      this.pickups.push({
        id: this.nextId++,
        kind: 'GOLD',
        x: boss.x + (Math.random() - 0.5) * 32,
        y: boss.y - boss.h * 0.5 + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 145,
        vy: -85 - Math.random() * 80,
        value: 5,
        age: 0,
      });
    }
    for (let h = 0; h < 2; h++) {
      this.pickups.push({
        id: this.nextId++,
        kind: 'HEALTH',
        x: boss.x + (h === 0 ? -14 : 14),
        y: boss.y - boss.h * 0.5,
        vx: (h === 0 ? -1 : 1) * 50,
        vy: -95,
        value: 25,
        age: 0,
      });
    }
    const dropWeaponId = LOOTABLE_WEAPONS[Math.floor(Math.random() * LOOTABLE_WEAPONS.length)];
    this.pickups.push({
      id: this.nextId++,
      kind: 'WEAPON',
      x: boss.x,
      y: boss.y - boss.h * 0.5,
      vx: 0,
      vy: -105,
      value: 1,
      weaponId: dropWeaponId,
      age: 0,
    });

    this.boss = null;
    this.bossRelicPendingTimer = 0.85;
    this.emitHud();
  }

  private openBossRelicChoice(): void {
    const allIds = Object.keys(BOSS_RELICS) as RelicId[];
    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    const choices: RelicDraftOption[] = shuffled.slice(0, 3).map((id) => {
      const currentLevel = this.getRelicLevel(id);
      return {
        def: BOSS_RELICS[id],
        currentLevel,
        nextLevel: currentLevel + 1,
      };
    });
    this.setState('BOSS_RELIC');
    this.callbacks.onBossRelicChoices(choices);
  }

  private damagePlayer(dmg: number, knockDir: number): void {
    const p = this.player;
    const finalDmg = Math.max(1, Math.round(dmg * this.metaArmorMul));
    p.hp = Math.max(0, p.hp - finalDmg);
    p.invulnTimer = 0.65;
    if (knockDir !== 0) {
      p.vx = knockDir * 115;
      p.vy = -85;
    }
    this.shakeMag = Math.max(this.shakeMag, 4.0);
    this.spawnFloatingText(p.x, p.y - p.h - 4, `-${finalDmg}`, '#EF4444');
    sfx.playHurt();
    this.emitHud();

    if (p.hp <= 0) {
      this.setState('GAME_OVER');
      this.callbacks.onGameOver({
        depth: this.depth,
        biomeName: this.biome.name,
        seed: this.seed,
        kills: this.kills,
        pixelsDestroyed: this.world.pixelsDestroyedCount,
        segmentsCollapsed: this.world.segmentsCollapsedCount,
        goldCollected: p.gold,
        elapsedSeconds: Math.round(this.elapsedSeconds),
      });
    }
  }

  private findPickupSurfaceAbove(px: number, py: number, maxSearch = 72): number | null {
    for (let step = 0; step <= maxSearch; step++) {
      const ty = py - step;
      if (ty <= 5) return null;
      if (
        !this.world.isSolid(px, ty) &&
        !(this.world.isSolid(px - 1, ty) && this.world.isSolid(px + 1, ty)) &&
        !this.world.isSolid(px, ty - 1) &&
        !this.world.isSolid(px, ty - 2)
      ) {
        return ty;
      }
    }
    return null;
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const salvageLv = this.getRelicLevel('SALVAGE_MAGNET');
    const magnetRadius = salvageLv > 0
      ? 150 + 50 * (salvageLv - 1)
      : this.hasPerk('MAGNET_RELAY')
      ? 92
      : 24;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.age += dt;

      const dx = p.x - pk.x;
      const dy = p.y - p.h * 0.5 - pk.y;
      const dist = Math.hypot(dx, dy);

      const px = Math.round(pk.x);
      const py = Math.round(pk.y);
      const buriedCenter =
        this.world.isSolid(px, py) ||
        (this.world.isSolid(px - 1, py) && this.world.isSolid(px + 1, py));
      const buriedTop =
        pk.vy >= -10 &&
        (this.world.isSolid(px, py - 1) ||
          (this.world.isSolid(px - 1, py - 1) && this.world.isSolid(px + 1, py - 1)));

      let migrating = false;
      if (buriedCenter || buriedTop) {
        const topY = this.findPickupSurfaceAbove(px, py, 72);
        if (topY !== null) {
          migrating = true;
          const migrateSpeed = 120;
          pk.y = Math.max(topY, pk.y - migrateSpeed * dt);
          pk.vy = 0;
          pk.vx *= 0.85;
        }
      }

      if (!migrating) {
        pk.vy += GRAVITY * 0.75 * dt;

        if (dist < magnetRadius && dist > 1) {
          pk.vx += (dx / dist) * 320 * dt;
          pk.vy += (dy / dist) * 320 * dt;
        }

        const nx = pk.x + pk.vx * dt;
        const ny = pk.y + pk.vy * dt;
        if (!this.world.isSolid(Math.round(nx), Math.round(pk.y))) {
          pk.x = nx;
        } else {
          pk.vx *= -0.3;
        }
        if (!this.world.isSolid(Math.round(pk.x), Math.round(ny))) {
          pk.y = ny;
        } else {
          pk.vy = 0;
          pk.vx *= 0.8;
        }
      } else if (dist < magnetRadius && dist > 1) {
        // Still allow subtle horizontal pull toward player while emerging
        const nx = pk.x + Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt);
        if (!this.world.isSolid(Math.round(nx), Math.round(pk.y))) {
          pk.x = nx;
        }
      }

      if (dist < 10) {
        if (pk.kind === 'GOLD') {
          p.gold += pk.value;
          sfx.playPickup('gold');
        } else if (pk.kind === 'HEALTH') {
          p.hp = Math.min(p.maxHp, p.hp + pk.value);
          this.spawnFloatingText(p.x, p.y - p.h - 3, `+${pk.value} HP`, '#10B981');
          sfx.playPickup('health');
        } else if (pk.kind === 'WEAPON' && pk.weaponId) {
          const isHeld = p.weapons.includes(pk.weaponId);
          const isFull = p.weapons.length >= 2;
          if (isHeld || !isFull) {
            this.grantWeaponOrDupe(pk.weaponId, p.x, p.y - p.h - 6);
            sfx.playPickup('upgrade');
            this.emitHud();
            this.pickups.splice(i, 1);
          }
          continue;
        }
        this.pickups.splice(i, 1);
      }
    }
  }

  private moveEntityWithPixelCollision(
    ent: { x: number; y: number; vx: number; vy: number; w: number; h: number; grounded: boolean },
    dx: number,
    dy: number,
    allowStepUp: boolean,
    isPlayer = false
  ): void {
    const halfW = Math.floor(ent.w * 0.5);
    const legH = 6; // bottom 6px correspond to player's feet & legs

    // If fallen pixels settled around the player's feet/legs, gently float up onto them when headroom allows
    if (isPlayer && !this.collidesUpperBody(ent.x, ent.y, halfW, ent.h, legH)) {
      for (let lift = 0; lift < 2; lift++) {
        if (
          this.collidesBox(ent.x, ent.y, halfW, ent.h) &&
          !this.collidesUpperBody(ent.x, ent.y - 1, halfW, ent.h, legH)
        ) {
          ent.y -= 1;
        } else {
          break;
        }
      }
    }

    const maxStepUp = isPlayer ? legH : 3;

    // Horizontal move + step-up over rubble + leg-pixel wading for player
    if (dx !== 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(dx)));
      const stepX = dx / steps;
      for (let s = 0; s < steps; s++) {
        const testX = ent.x + stepX;
        if (!this.collidesBox(testX, ent.y, halfW, ent.h)) {
          ent.x = testX;
        } else if (allowStepUp) {
          let stepped = false;
          for (let up = 1; up <= maxStepUp; up++) {
            if (!this.collidesBox(testX, ent.y - up, halfW, ent.h)) {
              ent.x = testX;
              ent.y -= up;
              stepped = true;
              break;
            }
          }
          if (!stepped && isPlayer && !this.collidesUpperBody(testX, ent.y, halfW, ent.h, legH)) {
            const alreadyEmbedded = this.collidesBox(ent.x, ent.y, halfW, ent.h);
            if (this.tryWadeLegPixels(testX, ent.y, halfW, legH, Math.sign(dx), alreadyEmbedded)) {
              ent.x = testX;
              stepped = true;
            }
          }
          if (!stepped) {
            ent.vx = 0;
            break;
          }
        } else {
          ent.vx = 0;
          break;
        }
      }
    }

    // Vertical move
    ent.grounded = false;
    if (dy !== 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(dy)));
      const stepY = dy / steps;
      for (let s = 0; s < steps; s++) {
        const testY = ent.y + stepY;
        const blocked =
          isPlayer && dy < 0
            ? this.collidesUpperBody(ent.x, testY, halfW, ent.h, legH)
            : this.collidesBox(ent.x, testY, halfW, ent.h);
        if (!blocked) {
          ent.y = testY;
        } else {
          if (dy > 0) ent.grounded = true;
          ent.vy = 0;
          break;
        }
      }
    } else {
      ent.grounded =
        this.collidesBox(ent.x, ent.y + 1, halfW, ent.h) ||
        (isPlayer && this.collidesBox(ent.x, ent.y, halfW, ent.h));
    }

    ent.x = Math.max(6 + halfW, Math.min(WORLD_W - 6 - halfW, ent.x));
    ent.y = Math.max(ent.h + 5, Math.min(WORLD_H - 5, ent.y));
  }

  private tryWadeLegPixels(
    cx: number,
    bottomY: number,
    halfW: number,
    legH: number,
    moveDir: number,
    alreadyEmbedded: boolean
  ): boolean {
    const x0 = Math.round(cx - halfW);
    const x1 = Math.round(cx + halfW);
    const y0 = Math.round(bottomY - legH + 1);
    const y1 = Math.round(bottomY);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const m = this.world.getMat(x, y);
        if (!MAT_PROPS[m].solid) continue;
        if (m === Mat.BEDROCK) return false;
        if (!MAT_PROPS[m].powder && (!alreadyEmbedded || MAT_PROPS[m].hardness > 3)) {
          return false;
        }
      }
    }

    // Scatter overlapping pixels in the leading foot edge so debris yields around player boots
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const m = this.world.getMat(x, y);
        if (!MAT_PROPS[m].solid) continue;
        const idx = y * WORLD_W + x;
        const col = this.world.color[idx];
        this.world.setPixel(x, y, Mat.EMPTY, 0);
        if (Math.random() < 0.35) {
          this.world.spawnParticle(
            x + 0.5,
            y + 0.5,
            -moveDir * (18 + Math.random() * 28) + (Math.random() - 0.5) * 16,
            -26 - Math.random() * 34,
            m,
            col,
            1.1,
            true
          );
        }
      }
    }
    return true;
  }

  private collidesUpperBody(
    cx: number,
    bottomY: number,
    halfW: number,
    h: number,
    legH: number
  ): boolean {
    return this.collidesRange(cx, bottomY - h + 1, bottomY - legH, halfW);
  }

  private collidesRange(cx: number, yTop: number, yBot: number, halfW: number): boolean {
    const x0 = Math.round(cx - halfW);
    const x1 = Math.round(cx + halfW);
    const xc = Math.round(cx);
    const y0 = Math.round(yTop);
    const y1 = Math.round(yBot);
    for (let y = y0; y <= y1; y += 2) {
      if (this.world.isSolid(x0, y) || this.world.isSolid(x1, y) || this.world.isSolid(xc, y)) {
        return true;
      }
    }
    return this.world.isSolid(x0, y1) || this.world.isSolid(x1, y1) || this.world.isSolid(xc, y1);
  }

  private collidesBox(cx: number, bottomY: number, halfW: number, h: number): boolean {
    return this.collidesRange(cx, bottomY - h + 1, bottomY, halfW);
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({ x, y, vy: -22, text, color, life: 0.75 });
  }

  private spawnShockRing(x: number, y: number, maxRadius: number, color: string): void {
    this.shockRings.push({ x, y, radius: 2, maxRadius, color, life: 0.24, maxLife: 0.24 });
  }

  private spawnTransientLight(
    x: number,
    y: number,
    radius: number,
    rgb: [number, number, number],
    intensity: number,
    volumetric: number,
    life: number,
    castShadows = true
  ): void {
    if (this.transientLights.length >= 16) {
      this.transientLights.shift();
    }
    this.transientLights.push({
      x,
      y,
      radius,
      rgb,
      intensity,
      volumetric,
      life,
      maxLife: life,
      castShadows,
    });
  }

  private spawnVfx(
    x: number,
    y: number,
    vx: number,
    vy: number,
    kind: VfxParticle['kind'],
    color: string,
    size = 1.4,
    life = 0.3
  ): void {
    if (this.vfxParticles.length >= 460) {
      this.vfxParticles.shift();
    }
    this.vfxParticles.push({
      x,
      y,
      vx,
      vy,
      size,
      color,
      alpha: 1,
      life,
      maxLife: life,
      kind,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 14,
    });
  }

  private emitImpactBurst(x: number, y: number, color: string, count: number): void {
    for (let k = 0; k < count; k++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 115;
      this.spawnVfx(
        x,
        y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 20,
        k % 3 === 0 ? 'SHARD' : 'SPARK',
        color,
        1.1 + Math.random() * 0.9,
        0.18 + Math.random() * 0.16
      );
    }
  }

  private updateAmbientMotes(dt: number): void {
    this.ambientMoteTimer += dt;
    if (this.ambientMoteTimer < 0.08 || this.vfxParticles.length > 360) return;
    this.ambientMoteTimer = 0;

    const mx = this.camX + Math.random() * this.viewSimW;
    const my = this.camY + Math.random() * this.viewSimH;
    if (this.world.isSolid(Math.round(mx), Math.round(my))) return;

    const biomeId = this.biome?.id;
    const color =
      biomeId === 'ASHEN_FOUNDRY'
        ? Math.random() < 0.5
          ? '#FB923C'
          : '#FDE047'
        : biomeId === 'VITRIOL_VAULTS'
        ? this.biome.hudPalette.accentSoftHex
        : '#7DD3FC';
    const vy = biomeId === 'ASHEN_FOUNDRY' ? -12 - Math.random() * 14 : (Math.random() - 0.5) * 10;
    this.spawnVfx(
      mx,
      my,
      (Math.random() - 0.5) * 10,
      vy,
      'MOTE',
      color,
      0.8 + Math.random() * 0.8,
      2.2 + Math.random() * 1.8
    );
  }

  private updateEffects(dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.beamFlashes.length - 1; i >= 0; i--) {
      this.beamFlashes[i].life -= dt;
      if (this.beamFlashes[i].life <= 0) this.beamFlashes.splice(i, 1);
    }
    for (let i = this.shockRings.length - 1; i >= 0; i--) {
      const r = this.shockRings[i];
      r.life -= dt;
      r.radius = r.maxRadius * (1 - r.life / r.maxLife);
      if (r.life <= 0) this.shockRings.splice(i, 1);
    }
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      this.muzzleFlashes[i].life -= dt;
      if (this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
    }
    for (let i = this.dashGhosts.length - 1; i >= 0; i--) {
      this.dashGhosts[i].life -= dt;
      if (this.dashGhosts[i].life <= 0) this.dashGhosts.splice(i, 1);
    }
    for (let i = this.transientLights.length - 1; i >= 0; i--) {
      this.transientLights[i].life -= dt;
      if (this.transientLights[i].life <= 0) this.transientLights.splice(i, 1);
    }
    for (let i = this.vfxParticles.length - 1; i >= 0; i--) {
      const v = this.vfxParticles[i];
      v.life -= dt;
      if (v.life <= 0) {
        this.vfxParticles.splice(i, 1);
        continue;
      }
      v.rot += v.rotSpeed * dt;
      if (v.kind === 'SMOKE') {
        v.vy -= 12 * dt;
        v.vx *= 0.94;
        v.vy *= 0.94;
        v.size += 3.5 * dt;
      } else if (v.kind === 'CASING') {
        v.vy += GRAVITY * 0.72 * dt;
        const ny = v.y + v.vy * dt;
        if (this.world.isSolid(Math.round(v.x), Math.round(ny))) {
          v.vy = -v.vy * 0.4;
          v.vx *= 0.65;
          v.rotSpeed *= 0.5;
        }
      } else if (v.kind === 'MOTE') {
        v.vx += Math.sin(this.elapsedSeconds * 2 + i) * 6 * dt;
      } else {
        v.vy += GRAVITY * 0.35 * dt;
        v.vx *= 0.96;
      }
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      v.alpha = Math.max(0, v.life / v.maxLife);
    }
  }

  private getAimWorldTarget(): { x: number; y: number } {
    const p = this.player;
    if (this.touchAimActive || this.touchAimHoldTimer > 0 || !this.hasPointerMoved) {
      return {
        x: p.x + Math.cos(p.aimAngle) * 44,
        y: p.y - p.h * 0.45 + Math.sin(p.aimAngle) * 44,
      };
    }
    return this.getMouseWorld();
  }

  private updateCamera(dt: number): void {
    const p = this.player;
    const mw = this.getAimWorldTarget();
    const leadX = Math.max(-32, Math.min(32, (mw.x - p.x) * 0.2));
    const leadY = Math.max(-20, Math.min(20, (mw.y - p.y) * 0.16));

    let targetX = p.x + leadX - this.viewSimW * 0.5;
    let targetY = p.y - p.h * 0.5 + leadY - this.viewSimH * (this.viewSimH > 260 ? 0.44 : 0.52);

    if (this.boss && p.x >= this.boss.arenaMinX - 80) {
      const bossCenterY = this.boss.y - this.boss.h * 0.55;
      const bossPullX = Math.max(-34, Math.min(34, (this.boss.x - p.x) * 0.16));
      const bossPullY = Math.max(-22, Math.min(18, (bossCenterY - (p.y - p.h * 0.5)) * 0.18));
      targetX += bossPullX;
      targetY += bossPullY;
    }

    this.camX += (targetX - this.camX) * Math.min(1, 8 * dt);
    this.camY += (targetY - this.camY) * Math.min(1, 8 * dt);

    this.camX = Math.max(0, Math.min(WORLD_W - this.viewSimW, this.camX));
    this.camY = Math.max(0, Math.min(WORLD_H - this.viewSimH, this.camY));

    this.shakeMag = Math.max(0, this.shakeMag - 16 * dt);
  }

  private emitHud(): void {
    if (!this.player) return;
    const p = this.player;
    let nearInteractable: string | null = null;
    if (this.state === 'HUB_WORLD') {
      for (const npc of this.hubNpcs) {
        if (Math.hypot(npc.x - p.x, npc.y - p.y) < 30) {
          nearInteractable = `Press F to approach ${npc.name}`;
          break;
        }
      }
      if (!nearInteractable) {
        for (const ped of this.pedestals) {
          if (Math.hypot(ped.x - p.x, ped.y - p.y) < 28) {
            if (ped.id === 9991) nearInteractable = 'Press F to open Vault Upgrades';
            else if (ped.id === 9992) nearInteractable = 'Press F to open Expedition Staging';
            else if (ped.id === 9993) nearInteractable = 'Press F for Settings & Profiles';
            break;
          }
        }
      }
    } else {
      for (const ped of this.pedestals) {
        if (!ped.used && Math.hypot(ped.x - p.x, ped.y - p.y) < 22) {
          nearInteractable = `Press F to claim ${ped.weaponOffer ? WEAPONS[ped.weaponOffer].name : 'Relic'}`;
          break;
        }
      }
    }
    if (!nearInteractable && Math.hypot(this.portal.x - p.x, this.portal.y - (p.y - 8)) < 26) {
      if (this.state === 'HUB_WORLD') {
        nearInteractable = 'Press F to enter Expedition Portal';
      } else if (this.portal.active) {
        nearInteractable = `Press F to descend to Depth ${this.depth + 1}`;
      } else if (this.boss) {
        nearInteractable = `Portal sealed — defeat ${this.boss.name} to unlock`;
      }
    }

    if (!nearInteractable) {
      for (const pk of this.pickups) {
        if (pk.kind === 'WEAPON' && pk.weaponId && Math.hypot(pk.x - p.x, pk.y - p.y) < 28) {
          const wName = WEAPONS[pk.weaponId].name;
          const activeName = WEAPONS[p.weapons[p.activeWeaponIdx]].name;
          nearInteractable = `Press F to swap ${activeName} for ${wName}`;
          break;
        }
      }
    }

    const rechargeDur = this.hasPerk('DEMOLITIONIST') ? 4.8 : 7.5;
    const dashMax = this.hasPerk('TWIN_THRUSTERS') ? 0.65 : 0.95;

    this.callbacks.onHudUpdate({
      hp: p.hp,
      maxHp: p.maxHp,
      bombs: p.bombs,
      maxBombs: p.maxBombs,
      bombRechargePct: p.bombs >= p.maxBombs ? 1 : p.bombRechargeTimer / rechargeDur,
      dashReadyPct: p.dashCooldown <= 0 ? 1 : 1 - p.dashCooldown / dashMax,
      gold: p.gold,
      depth: this.depth,
      biomeName: this.biome.name,
      hudPalette: this.biome.hudPalette,
      seed: this.seed,
      weapons: p.weapons.map((id) => WEAPONS[id]),
      weaponDupes: p.weapons.map((id) => p.weaponDupes[id] ?? 0),
      activeWeaponIdx: p.activeWeaponIdx,
      perks: p.perks.map((id) => PERKS[id]),
      relics: p.relics.map((id) => ({
        def: BOSS_RELICS[id],
        level: p.relicLevels[id] ?? 1,
      })),
      kills: this.kills,
      pixelsDestroyed: this.world.pixelsDestroyedCount,
      segmentsCollapsed: this.world.segmentsCollapsedCount,
      nearInteractable,
      enemiesRemaining: this.enemies.length + (this.boss ? 1 : 0),
      bossAlert: this.boss ? `${this.boss.name} — ${this.boss.subtitle}` : null,
      boss: this.boss
        ? {
            name: this.boss.name,
            subtitle: this.boss.subtitle,
            weakSpotName: this.boss.weakSpotName,
            hp: Math.ceil(this.boss.hp),
            maxHp: this.boss.maxHp,
            corePct: Math.max(
              0,
              Math.round((this.boss.corePixelsRemaining / Math.max(1, this.boss.corePixelsTotal)) * 100)
            ),
            activeAttack: this.boss.pendingSpecialId
              ? BOSS_SPECIAL_CATALOG[this.boss.pendingSpecialId]?.title ?? null
              : this.boss.activeSpecialId
              ? BOSS_SPECIAL_CATALOG[this.boss.activeSpecialId]?.title ?? null
              : null,
          }
        : null,
    });
  }

  private render(): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scaleX = cw / this.viewSimW;
    const scaleY = ch / this.viewSimH;

    const shakeX = this.shakeMag > 0.1 ? (Math.random() - 0.5) * this.shakeMag : 0;
    const shakeY = this.shakeMag > 0.1 ? (Math.random() - 0.5) * this.shakeMag : 0;
    const sx = Math.max(0, Math.min(WORLD_W - this.viewSimW, this.camX + shakeX));
    const sy = Math.max(0, Math.min(WORLD_H - this.viewSimH, this.camY + shakeY));

    this.renderBiomeParallaxBackdrop(sx, sy, cw, ch, scaleX, scaleY);

    this.world.renderToOffscreen(sx, sy, this.viewSimW, this.viewSimH);

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      this.world.offscreen,
      sx,
      sy,
      this.viewSimW,
      this.viewSimH,
      0,
      0,
      cw,
      ch
    );

    if (this.state === 'TITLE_MENU') {
      this.renderAtmosphereLighting(sx, sy, cw, ch, scaleX, scaleY, false);
      this.ctx.save();
      this.ctx.scale(scaleX, scaleY);
      this.ctx.translate(-sx, -sy);
      this.drawVfxParticles();
      this.ctx.restore();
      return;
    }

    this.ctx.save();
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-sx, -sy);

    // 1. Descent Portal (carved stone rune arch + swirling multi-ring dimensional vortex)
    if (this.portal) {
      const t = performance.now() * 0.004;
      const px = this.portal.x;
      const py = this.portal.y + 4;
      const [pr, pg, pb] = this.biome.hudPalette.accentRgb;

      // Stone archway pillars flanking portal
      this.ctx.fillStyle = '#1E293B';
      this.ctx.fillRect(px - 11, py - 12, 3, 24);
      this.ctx.fillRect(px + 8, py - 12, 3, 24);
      this.ctx.fillRect(px - 12, py - 14, 24, 3);
      this.ctx.fillStyle = '#475569';
      this.ctx.fillRect(px - 10, py - 11, 2, 22);
      this.ctx.fillRect(px + 8, py - 11, 2, 22);
      this.ctx.fillStyle = this.portal.active ? this.biome.atmosphere.portalHex : '#EF4444';
      this.ctx.fillRect(px - 10, py - 13, 2, 1);
      this.ctx.fillRect(px + 8, py - 13, 2, 1);

      if (this.portal.active) {
        this.ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.28)`;
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 9 + Math.sin(t) * 1.4, 13 + Math.cos(t) * 1.4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = this.biome.atmosphere.portalHex;
        this.ctx.lineWidth = 1.4;
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 6.5, 10.5, 0, 0, Math.PI * 2);
        this.ctx.stroke();

        // Swirling inner vortex ring & orbiting rune motes
        this.ctx.strokeStyle = '#F8FAFC';
        this.ctx.lineWidth = 0.8;
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 3.6, 6.4, Math.sin(t * 0.8) * 0.35, 0, Math.PI * 2);
        this.ctx.stroke();

        for (let m = 0; m < 4; m++) {
          const a = t * 1.6 + (m * Math.PI) / 2;
          const ox = px + Math.cos(a) * 6.5;
          const oy = py + Math.sin(a) * 9.5;
          this.ctx.fillStyle = '#FFFFFF';
          this.ctx.fillRect(Math.round(ox), Math.round(oy), 1, 1);
        }
      } else {
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 8, 12, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = '#EF4444';
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.ellipse(px, py, 6.5, 10.5, 0, 0, Math.PI * 2);
        this.ctx.stroke();

        // Crossed barrier lock lines
        this.ctx.beginPath();
        this.ctx.moveTo(px - 5, py - 6);
        this.ctx.lineTo(px + 5, py + 6);
        this.ctx.moveTo(px + 5, py - 6);
        this.ctx.lineTo(px - 5, py + 6);
        this.ctx.stroke();
      }
    }

    // 2. Relic Pedestals (stepped carved altar + beam + hovering artifact)
    for (const ped of this.pedestals) {
      this.ctx.fillStyle = '#1E293B';
      this.ctx.fillRect(ped.x - 7, ped.y - 3, 14, 3);
      this.ctx.fillStyle = '#475569';
      this.ctx.fillRect(ped.x - 6, ped.y - 4, 12, 2);
      this.ctx.fillStyle = '#64748B';
      this.ctx.fillRect(ped.x - 4, ped.y - 8, 8, 4);
      this.ctx.fillStyle = '#94A3B8';
      this.ctx.fillRect(ped.x - 5, ped.y - 9, 10, 2);

      if (!ped.used) {
        const t = performance.now() * 0.005 + ped.id;
        const bob = Math.sin(t) * 1.6;
        const wCol =
          ped.id === 9991
            ? '#F59E0B'
            : ped.id === 9992
            ? '#38BDF8'
            : ped.id === 9993
            ? '#A78BFA'
            : ped.weaponOffer
            ? WEAPONS[ped.weaponOffer].color
            : '#38BDF8';
        // Subtle upward light column
        this.ctx.fillStyle = wCol;
        this.ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 1.4);
        this.ctx.fillRect(ped.x - 3, ped.y - 22, 6, 13);
        this.ctx.globalAlpha = 1;

        // Floating faceted weapon/artifact crystal
        const cy = ped.y - 15 + bob;
        this.ctx.fillStyle = '#0F172A';
        this.ctx.fillRect(ped.x - 4, cy - 2, 8, 5);
        this.ctx.fillStyle = wCol;
        this.ctx.fillRect(ped.x - 3, cy - 1, 6, 3);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(ped.x - 2, cy - 1, 2, 1);

        if (this.state === 'HUB_WORLD') {
          const stationLabel =
            ped.id === 9991 ? 'Vault' : ped.id === 9992 ? 'Expedition' : ped.id === 9993 ? 'Settings' : null;
          if (stationLabel) {
            this.ctx.font = 'bold 5px "JetBrains Mono", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillStyle = 'rgba(244, 244, 245, 0.78)';
            this.ctx.fillText(stationLabel, ped.x, ped.y - 25);
          }
        }
      }
    }

    // 3. Pickups (faceted gold nuggets, glowing med-capsules, aura-framed weapons)
    for (const pk of this.pickups) {
      const t = performance.now() * 0.007 + pk.id;
      if (pk.kind === 'GOLD') {
        const gx = Math.round(pk.x);
        const gy = Math.round(pk.y - 2);
        this.ctx.fillStyle = '#78350F';
        this.ctx.fillRect(gx - 2, gy - 1, 4, 4);
        this.ctx.fillStyle = '#F59E0B';
        this.ctx.fillRect(gx - 1, gy - 1, 3, 3);
        this.ctx.fillStyle = '#FACC15';
        this.ctx.fillRect(gx - 1, gy, 2, 2);
        if (Math.sin(t * 2.2) > 0.3) {
          this.ctx.fillStyle = '#FEF9C3';
          this.ctx.fillRect(gx - 1, gy, 1, 1);
        }
      } else if (pk.kind === 'WEAPON' && pk.weaponId) {
        const wCol = WEAPONS[pk.weaponId].color;
        const bob = Math.sin(t) * 1.4;
        const wx = Math.round(pk.x);
        const wy = Math.round(pk.y - 5 + bob);
        // Subtle glow ring
        this.ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 1.5);
        this.ctx.fillStyle = wCol;
        this.ctx.beginPath();
        this.ctx.arc(wx, wy + 1, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;

        this.ctx.fillStyle = '#0F172A';
        this.ctx.fillRect(wx - 5, wy - 2, 10, 6);
        this.ctx.fillStyle = wCol;
        this.ctx.fillRect(wx - 4, wy - 1, 7, 3);
        this.ctx.fillRect(wx - 3, wy + 2, 2, 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(wx - 3, wy - 1, 4, 1);
      } else {
        // Bio-med capsule
        const hx = Math.round(pk.x);
        const hy = Math.round(pk.y - 3);
        this.ctx.fillStyle = '#064E3B';
        this.ctx.fillRect(hx - 3, hy - 2, 6, 5);
        this.ctx.fillStyle = '#10B981';
        this.ctx.fillRect(hx - 2, hy - 1, 4, 3);
        this.ctx.fillStyle = '#94A3B8';
        this.ctx.fillRect(hx - 2, hy - 2, 4, 1);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(hx - 1, hy, 2, 1);
        this.ctx.fillRect(hx, hy - 1, 1, 3);
      }
    }

    // 4. Hub NPCs, Target Dummies, Enemies & Pixel Boss
    if (this.state === 'HUB_WORLD') {
      for (const npc of this.hubNpcs) {
        this.drawHubNpc(npc);
      }
      for (const tgt of this.hubTargets) {
        this.drawHubTarget(tgt);
      }
    }
    for (const en of this.enemies) {
      this.drawEnemy(en);
    }
    if (this.boss) {
      this.drawBoss(this.boss);
    }

    // 4b. Dash Ghosts & Player
    for (const dg of this.dashGhosts) {
      const a = (dg.life / dg.maxLife) * 0.42;
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle = '#38BDF8';
      this.ctx.fillRect(Math.round(dg.x - 3), Math.round(dg.y - 15), 6, 15);
      this.ctx.globalAlpha = 1;
    }
    if (this.player) {
      this.drawPlayer(this.player);
    }
    this.ctx.restore();

    // Dynamic raycast lighting & destructible shadow-casting pass (multiply + volumetric shafts)
    this.renderAtmosphereLighting(sx, sy, cw, ch, scaleX, scaleY, true);

    // 6. Emissive projectiles, muzzle flashes, beams, shockwaves & bright sparks drawn above shadow multiply
    this.ctx.save();
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-sx, -sy);

    for (const pr of this.projectiles) {
      if (pr.isBomb) {
        const bx = Math.round(pr.x);
        const by = Math.round(pr.y);
        const blink = Math.floor(pr.fuse * 10) % 2 === 0;
        this.ctx.fillStyle = '#1E293B';
        this.ctx.fillRect(bx - 3, by - 3, 6, 6);
        this.ctx.fillStyle = blink ? '#F59E0B' : '#EF4444';
        this.ctx.fillRect(bx - 2, by - 2, 4, 4);
        this.ctx.fillStyle = '#FEF08A';
        this.ctx.fillRect(bx - 1, by - 1, 2, 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(bx, by - 4, 1, 1);
      } else if (pr.damageType === 'VOID') {
        this.ctx.fillStyle = 'rgba(129, 140, 248, 0.35)';
        this.ctx.beginPath();
        this.ctx.arc(pr.x, pr.y, 4.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#C7D2FE';
        this.ctx.lineWidth = 0.8;
        this.ctx.beginPath();
        this.ctx.arc(pr.x, pr.y, 2.8, pr.age * 10, pr.age * 10 + Math.PI * 1.4);
        this.ctx.stroke();
        this.ctx.fillStyle = '#09090B';
        this.ctx.beginPath();
        this.ctx.arc(pr.x, pr.y, 1.8, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        const ang = Math.atan2(pr.vy, pr.vx);
        const tailLen = Math.min(8, Math.max(3, Math.hypot(pr.vx, pr.vy) * 0.018));
        const tx = pr.x - Math.cos(ang) * tailLen;
        const ty = pr.y - Math.sin(ang) * tailLen;

        // Outer glow streak
        this.ctx.globalAlpha = 0.42;
        this.ctx.strokeStyle = pr.color;
        this.ctx.lineWidth = pr.radius * 2.1;
        this.ctx.beginPath();
        this.ctx.moveTo(tx, ty);
        this.ctx.lineTo(pr.x, pr.y);
        this.ctx.stroke();

        // Bright core streak + white tip
        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = pr.color;
        this.ctx.lineWidth = Math.max(1.0, pr.radius * 1.15);
        this.ctx.beginPath();
        this.ctx.moveTo((tx + pr.x) * 0.5, (ty + pr.y) * 0.5);
        this.ctx.lineTo(pr.x, pr.y);
        this.ctx.stroke();

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(Math.round(pr.x - 0.5), Math.round(pr.y - 0.5), 1.4, 1.4);
      }
    }

    for (const mf of this.muzzleFlashes) {
      const t = mf.life / mf.maxLife;
      this.ctx.save();
      this.ctx.translate(mf.x, mf.y);
      this.ctx.rotate(mf.angle);
      this.ctx.globalAlpha = t * 0.9;
      this.ctx.fillStyle = mf.color;
      this.ctx.beginPath();
      this.ctx.ellipse(2.5, 0, 4.5 * t, 2.2 * t, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.beginPath();
      this.ctx.ellipse(1.5, 0, 2.4 * t, 1.1 * t, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // 7. Layered Beams, Shockwaves & VFX Particles
    for (const b of this.beamFlashes) {
      this.ctx.globalAlpha = 0.35;
      this.ctx.strokeStyle = b.color;
      this.ctx.lineWidth = 3.8;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x0, b.y0);
      this.ctx.lineTo(b.x1, b.y1);
      this.ctx.stroke();

      this.ctx.globalAlpha = 1;
      this.ctx.strokeStyle = b.color;
      this.ctx.lineWidth = 1.8;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x0, b.y0);
      this.ctx.lineTo(b.x1, b.y1);
      this.ctx.stroke();

      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = 0.7;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x0, b.y0);
      this.ctx.lineTo(b.x1, b.y1);
      this.ctx.stroke();

      // Impact flare
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.beginPath();
      this.ctx.arc(b.x1, b.y1, 2.2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    for (const r of this.shockRings) {
      this.ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
      this.ctx.strokeStyle = r.color;
      this.ctx.lineWidth = 1.4;
      this.ctx.beginPath();
      this.ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }

    this.drawVfxParticles();

    this.ctx.restore();

    // 8. Floating damage / info numbers & 9. Reticle (rendered above atmosphere & combat VFX)
    this.ctx.save();
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-sx, -sy);

    this.ctx.font = 'bold 6px "JetBrains Mono", monospace';
    this.ctx.textAlign = 'center';
    for (const f of this.floatingTexts) {
      this.ctx.globalAlpha = Math.min(1, f.life * 1.8);
      this.ctx.fillStyle = f.color;
      this.ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
      this.ctx.globalAlpha = 1;
    }

    if (
      (this.state === 'PLAYING' || this.state === 'HUB_WORLD') &&
      (this.hasPointerMoved || this.touchAimActive || this.touchAimHoldTimer > 0)
    ) {
      const mw = this.getAimWorldTarget();
      const rx = Math.round(mw.x);
      const ry = Math.round(mw.y);
      this.ctx.strokeStyle = this.biome.hudPalette.accentHex;
      this.ctx.lineWidth = 0.85;
      this.ctx.strokeRect(rx - 3, ry - 3, 6, 6);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(rx, ry, 1, 1);
    }

    this.ctx.restore();
  }

  private updateHubEntities(dt: number): void {
    const p = this.player;
    // Rapid bomb recharge in Hub so Target Range testing never stalls
    if (p && p.bombs < p.maxBombs) {
      p.bombRechargeTimer += dt;
      if (p.bombRechargeTimer >= 1.5) {
        p.bombRechargeTimer = 0;
        p.bombs++;
      }
    }

    for (const npc of this.hubNpcs) {
      npc.idlePhase += dt * 2.1;
      npc.greetCooldown = Math.max(0, npc.greetCooldown - dt);
      if (p && Math.hypot(p.x - npc.x, p.y - npc.y) < 130) {
        npc.facing = p.x >= npc.x ? 1 : -1;
      }
      if (Math.random() < dt * 2.4) {
        this.spawnVfx(
          npc.x + npc.facing * 5 + (Math.random() - 0.5) * 3,
          npc.y - 10,
          (Math.random() - 0.5) * 6,
          -9 - Math.random() * 8,
          'MOTE',
          '#BAE6FD',
          0.9,
          1.4
        );
      }
    }

    for (const tgt of this.hubTargets) {
      tgt.hitFlash = Math.max(0, tgt.hitFlash - dt);
      if (tgt.hp <= 0) {
        tgt.respawnTimer -= dt;
        if (tgt.respawnTimer <= 0) {
          tgt.hp = tgt.maxHp;
          tgt.hitFlash = 0.22;
          this.spawnShockRing(tgt.x, tgt.y - tgt.h * 0.5, 13, '#F59E0B');
          this.spawnFloatingText(tgt.x, tgt.y - tgt.h - 4, 'Reset', '#FCD34D');
        }
      }
    }
  }

  private interactWithHubNpc(npc: HubNpc): void {
    if (npc.greetCooldown > 0) return;
    npc.greetCooldown = 1.8;
    const quietLines = [
      '...',
      'The archive slumbers still.',
      'Every fracture leaves a record.',
      'Speak with me when the chronicle opens.',
    ];
    const line = quietLines[this.archivistLineIdx % quietLines.length];
    this.archivistLineIdx++;
    sfx.playPickup('upgrade');
    this.spawnShockRing(npc.x + npc.facing * 5, npc.y - 9, 16, '#7DD3FC');
    this.spawnFloatingText(npc.x, npc.y - 24, line, '#BAE6FD');
  }

  private damageHubTarget(tgt: HubTarget, rawDmg: number, hx: number, hy: number, color: string): void {
    const dmg = Math.max(1, Math.round(rawDmg));
    tgt.hp = Math.max(0, tgt.hp - dmg);
    tgt.hitFlash = 0.14;
    this.spawnFloatingText(tgt.x + (Math.random() - 0.5) * 6, tgt.y - tgt.h - 3, `${dmg}`, '#FDE047');
    this.emitImpactBurst(hx, hy, color, 6);
    if (tgt.hp <= 0) {
      tgt.respawnTimer = 2.6;
      sfx.playExplosion(0.55);
      this.spawnShockRing(tgt.x, tgt.y - tgt.h * 0.5, 16, '#F59E0B');
      this.emitImpactBurst(tgt.x, tgt.y - tgt.h * 0.5, '#F59E0B', 14);
      this.spawnFloatingText(tgt.x, tgt.y - tgt.h - 10, 'Shattered', '#FB923C');
    }
  }

  private renderBiomeParallaxBackdrop(
    sx: number,
    sy: number,
    cw: number,
    ch: number,
    scaleX: number,
    scaleY: number
  ): void {
    const ctx = this.ctx;
    const t = performance.now() * 0.001;
    const isHub = this.state === 'HUB_WORLD';
    const biomeId = this.biome?.id ?? 'SUNKEN_MASONRY';
    const depthNorm = isHub ? 0.25 : Math.min(1, Math.max(0, (this.depth - 1) / 18));

    const [skyTR, skyTG, skyTB] = this.biome?.bgSkyTop ?? [10, 14, 22];
    const [skyBR, skyBG, skyBB] = this.biome?.bgSkyBottom ?? [22, 26, 38];
    const [glowR, glowG, glowB] = this.biome?.atmosphere.crystalGlowRgb ?? [120, 220, 255];

    // Layer 0: Deep Subterranean Cavern Sky + Depth-Shifted Ambient Underglow (0.05x parallax)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
    if (isHub) {
      skyGrad.addColorStop(0, '#06080D');
      skyGrad.addColorStop(0.52, '#0E121B');
      skyGrad.addColorStop(0.84, '#1B1415');
      skyGrad.addColorStop(1, '#261410');
    } else if (biomeId === 'SUNKEN_MASONRY') {
      const topLum = 1 - depthNorm * 0.35;
      skyGrad.addColorStop(0, `rgb(${Math.round(skyTR * topLum)}, ${Math.round(skyTG * topLum)}, ${Math.round(skyTB * topLum)})`);
      skyGrad.addColorStop(0.55, `rgb(${Math.round(skyBR * 0.72)}, ${Math.round(skyBG * 0.78)}, ${Math.round(skyBB * 0.92)})`);
      skyGrad.addColorStop(1, `rgb(${Math.round(skyBR * 0.5 + glowR * (0.08 + depthNorm * 0.1))}, ${Math.round(skyBG * 0.5 + glowG * (0.08 + depthNorm * 0.1))}, ${Math.round(skyBB * 0.6 + glowB * (0.1 + depthNorm * 0.12))})`);
    } else if (biomeId === 'ASHEN_FOUNDRY') {
      const magmaGain = 0.14 + depthNorm * 0.26;
      skyGrad.addColorStop(0, `rgb(${Math.round(skyTR * 0.7)}, ${Math.round(skyTG * 0.65)}, ${Math.round(skyTB * 0.7)})`);
      skyGrad.addColorStop(0.54, `rgb(${Math.round(skyBR * 0.85)}, ${Math.round(skyBG * 0.72)}, ${Math.round(skyBB * 0.7)})`);
      skyGrad.addColorStop(1, `rgb(${Math.min(92, Math.round(38 + magmaGain * 145))}, ${Math.round(16 + magmaGain * 42)}, ${Math.round(12 + magmaGain * 16)})`);
    } else {
      // VITRIOL_VAULTS
      skyGrad.addColorStop(0, `rgb(${Math.round(skyTR * 0.75)}, ${Math.round(skyTG * 0.75)}, ${Math.round(skyTB * 0.78)})`);
      skyGrad.addColorStop(0.52, `rgb(${Math.round(skyBR * 0.72)}, ${Math.round(skyBG * 0.72)}, ${Math.round(skyBB * 0.78)})`);
      skyGrad.addColorStop(1, `rgb(${Math.round(skyBR * 0.55 + glowR * 0.14)}, ${Math.round(skyBG * 0.55 + glowG * 0.14)}, ${Math.round(skyBB * 0.55 + glowB * 0.14)})`);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Diagonal background dust / water / prismatic light shafts (0.08x parallax)
    ctx.save();
    const beamShift = -(sx * 0.08 * scaleX);
    const beamColor = isHub
      ? [255, 204, 136]
      : biomeId === 'SUNKEN_MASONRY'
      ? [116, 224, 248]
      : biomeId === 'ASHEN_FOUNDRY'
      ? [255, 174, 88]
      : [Math.min(255, Math.round(glowR * 0.75 + 64)), Math.min(255, Math.round(glowG * 0.75 + 64)), Math.min(255, Math.round(glowB * 0.75 + 64))];
    const beamAlpha = isHub ? 0.065 : biomeId === 'SUNKEN_MASONRY' ? 0.08 - depthNorm * 0.032 : 0.062;
    const beamSpan = isHub ? 150 : biomeId === 'VITRIOL_VAULTS' ? 168 : 158;
    for (let b = 0; b < 5; b++) {
      const bx = ((b * beamSpan * scaleX + beamShift) % (cw + 240 * scaleX)) - 80 * scaleX;
      const beamGrad = ctx.createLinearGradient(bx, 0, bx + 65 * scaleX, ch * 0.88);
      beamGrad.addColorStop(0, `rgba(${beamColor[0]}, ${beamColor[1]}, ${beamColor[2]}, ${beamAlpha.toFixed(3)})`);
      beamGrad.addColorStop(0.7, `rgba(${beamColor[0]}, ${beamColor[1]}, ${beamColor[2]}, ${(beamAlpha * 0.32).toFixed(3)})`);
      beamGrad.addColorStop(1, `rgba(${beamColor[0]}, ${beamColor[1]}, ${beamColor[2]}, 0)`);
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 40 * scaleX, 0);
      ctx.lineTo(bx + 112 * scaleX, ch);
      ctx.lineTo(bx + 46 * scaleX, ch);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Layer 1: Distant Biome Architecture / Geological Silhouettes (0.18x parallax)
    ctx.save();
    const vert1 = -(sy * 0.12 * scaleY);
    if (isHub || biomeId === 'ASHEN_FOUNDRY') {
      const span1 = 135 * scaleX;
      const off1 = -((sx * 0.18 * scaleX) % span1);
      const archTop1 = ch * 0.16 + vert1 * 0.35;
      const archBot1 = ch * 0.94 + vert1 * 0.35;
      const pillarW1 = 22 * scaleX;

      ctx.fillStyle = isHub ? '#141822' : '#161215';
      ctx.fillRect(0, archTop1 + 14 * scaleY, cw, 10 * scaleY);
      ctx.fillStyle = isHub ? '#1D2230' : '#231A1D';
      ctx.fillRect(0, archTop1 + 14 * scaleY, cw, 2 * scaleY);

      for (let x = off1 - span1; x < cw + span1; x += span1) {
        // Distant pier + smokestack chimney silhouettes in deep foundry levels
        ctx.fillStyle = isHub ? '#121620' : '#141013';
        ctx.fillRect(x, archTop1, pillarW1, archBot1 - archTop1);
        ctx.fillStyle = isHub ? '#1A202D' : '#26181A';
        ctx.fillRect(x + pillarW1 - 3 * scaleX, archTop1, 3 * scaleX, archBot1 - archTop1);

        if (!isHub && depthNorm > 0.25) {
          // Distant industrial smokestack silhouette between piers
          const stackX = x + pillarW1 + (span1 - pillarW1) * 0.18;
          ctx.fillStyle = '#110D10';
          ctx.fillRect(stackX, 0, 12 * scaleX, ch * 0.44 + vert1 * 0.25);
        }

        const bayX = x + pillarW1;
        const bayW = span1 - pillarW1;
        ctx.fillStyle = isHub ? '#121620' : '#141013';
        ctx.beginPath();
        ctx.moveTo(bayX, archTop1);
        ctx.lineTo(bayX + bayW, archTop1);
        ctx.lineTo(bayX + bayW, archTop1 + 42 * scaleY);
        ctx.arc(bayX + bayW * 0.5, archTop1 + 42 * scaleY, bayW * 0.5, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();

        const pulse = (isHub ? 0.16 : 0.14 + depthNorm * 0.12) + 0.06 * Math.sin(t * 2.1 + x * 0.01);
        const slitX = bayX + bayW * 0.44;
        const slitW = bayW * 0.12;
        const slitY = ch * 0.5 + vert1 * 0.3;
        const slitH = 38 * scaleY;
        ctx.fillStyle = `rgba(234, 88, 12, ${(pulse * 1.4).toFixed(3)})`;
        ctx.fillRect(slitX, slitY, slitW, slitH);
        ctx.fillStyle = `rgba(253, 186, 116, ${(pulse * 0.9).toFixed(3)})`;
        ctx.fillRect(slitX + slitW * 0.25, slitY + slitH * 0.25, slitW * 0.5, slitH * 0.6);

        const glow = ctx.createRadialGradient(
          slitX + slitW * 0.5,
          slitY + slitH * 0.6,
          2,
          slitX + slitW * 0.5,
          slitY + slitH * 0.6,
          36 * scaleX
        );
        glow.addColorStop(0, `rgba(251, 146, 60, ${pulse.toFixed(3)})`);
        glow.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(slitX - 36 * scaleX, slitY - 12 * scaleY, 72 * scaleX + slitW, slitH + 40 * scaleY);
      }
    } else if (biomeId === 'SUNKEN_MASONRY') {
      // Distant Flooded Aqueduct Arches, Sunken Monoliths & Bioluminescent Vents
      const span1 = 148 * scaleX;
      const off1 = -((sx * 0.18 * scaleX) % span1);
      const archTop1 = ch * 0.12 + vert1 * 0.35;
      const archBot1 = ch * 0.96 + vert1 * 0.35;
      const pierW = 20 * scaleX;

      ctx.fillStyle = `rgba(${Math.max(8, skyTR - 4)}, ${Math.max(12, skyTG - 2)}, ${Math.max(20, skyTB + 6)}, 0.85)`;
      ctx.fillRect(0, archTop1 + 10 * scaleY, cw, 12 * scaleY);

      for (let x = off1 - span1; x < cw + span1; x += span1) {
        ctx.fillStyle = '#0D1420';
        ctx.fillRect(x, archTop1, pierW, archBot1 - archTop1);
        ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${(0.1 + depthNorm * 0.1).toFixed(3)})`;
        ctx.fillRect(x + pierW - 2 * scaleX, archTop1, 2 * scaleX, archBot1 - archTop1);

        const bayX = x + pierW;
        const bayW = span1 - pierW;
        ctx.fillStyle = '#0D1420';
        ctx.beginPath();
        ctx.moveTo(bayX, archTop1);
        ctx.lineTo(bayX + bayW, archTop1);
        ctx.lineTo(bayX + bayW, archTop1 + 46 * scaleY);
        ctx.arc(bayX + bayW * 0.5, archTop1 + 46 * scaleY, bayW * 0.5, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();

        // Distant submerged aqueduct tier & obelisk silhouette
        const obX = bayX + bayW * 0.48;
        const obTop = ch * (0.44 - depthNorm * 0.06) + vert1 * 0.25;
        ctx.fillStyle = '#111A29';
        ctx.beginPath();
        ctx.moveTo(obX - 8 * scaleX, archBot1);
        ctx.lineTo(obX - 5 * scaleX, obTop + 8 * scaleY);
        ctx.lineTo(obX, obTop);
        ctx.lineTo(obX + 5 * scaleX, obTop + 8 * scaleY);
        ctx.lineTo(obX + 8 * scaleX, archBot1);
        ctx.closePath();
        ctx.fill();

        // Bioluminescent abyssal rune / vent glow at deeper layers
        const bioAlpha = 0.08 + depthNorm * 0.16 + 0.04 * Math.sin(t * 1.8 + x * 0.02);
        const ventGlow = ctx.createRadialGradient(obX, obTop + 16 * scaleY, 1, obX, obTop + 16 * scaleY, 26 * scaleX);
        ventGlow.addColorStop(0, `rgba(${glowR}, ${glowG}, ${glowB}, ${bioAlpha.toFixed(3)})`);
        ventGlow.addColorStop(1, `rgba(${glowR}, ${glowG}, ${glowB}, 0)`);
        ctx.fillStyle = ventGlow;
        ctx.fillRect(obX - 28 * scaleX, obTop - 10 * scaleY, 56 * scaleX, 56 * scaleY);
      }
    } else {
      // VITRIOL_VAULTS: Giant Distant Faceted Crystal Spires & Containment Conduits
      const span1 = 142 * scaleX;
      const off1 = -((sx * 0.18 * scaleX) % span1);
      for (let idx = -1; idx < Math.ceil(cw / span1) + 2; idx++) {
        const x = off1 + idx * span1;
        const spireH = (76 + ((Math.abs(idx) * 29) % 44) + depthNorm * 26) * scaleY;
        const spireX = x + 28 * scaleX;
        const baseY = ch + vert1 * 0.3;

        // Rising faceted crystal spire silhouette
        ctx.fillStyle = '#111420';
        ctx.beginPath();
        ctx.moveTo(spireX - 18 * scaleX, baseY);
        ctx.lineTo(spireX - 11 * scaleX, baseY - spireH * 0.72);
        ctx.lineTo(spireX, baseY - spireH);
        ctx.lineTo(spireX + 12 * scaleX, baseY - spireH * 0.68);
        ctx.lineTo(spireX + 18 * scaleX, baseY);
        ctx.closePath();
        ctx.fill();

        // Crystalline bevel facet edge
        ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${(0.16 + depthNorm * 0.12).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(spireX - 11 * scaleX, baseY - spireH * 0.72);
        ctx.lineTo(spireX, baseY - spireH);
        ctx.lineTo(spireX - 2 * scaleX, baseY);
        ctx.lineTo(spireX - 18 * scaleX, baseY);
        ctx.closePath();
        ctx.fill();

        // Ceiling stalactite crystal cluster
        const ceilH = (44 + ((Math.abs(idx) * 19) % 34)) * scaleY;
        const cx = x + 96 * scaleX;
        const ceilY = vert1 * 0.25;
        ctx.fillStyle = '#121722';
        ctx.beginPath();
        ctx.moveTo(cx - 12 * scaleX, ceilY);
        ctx.lineTo(cx, ceilY + ceilH);
        ctx.lineTo(cx + 12 * scaleX, ceilY);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Layer 2: Midground Structural Pillars, Hanging Chains/Tendrils & Rising Motes (0.36x parallax)
    ctx.save();
    const span2 = isHub ? 176 * scaleX : 194 * scaleX;
    const off2 = -((sx * 0.36 * scaleX) % span2);
    const vert2 = -(sy * 0.22 * scaleY);
    const top2 = ch * 0.05 + vert2 * 0.45;
    const bot2 = ch * 0.98 + vert2 * 0.45;

    for (let idx = -1; idx < Math.ceil(cw / span2) + 2; idx++) {
      const x = off2 + idx * span2;
      const pierW = 16 * scaleX;

      ctx.fillStyle = isHub || biomeId === 'ASHEN_FOUNDRY' ? '#181D27' : biomeId === 'SUNKEN_MASONRY' ? '#121925' : '#151923';
      ctx.fillRect(x, top2, pierW, bot2 - top2);

      const rimAlpha = isHub ? 0.16 : 0.14 + depthNorm * 0.08;
      ctx.fillStyle =
        isHub || biomeId === 'ASHEN_FOUNDRY'
          ? `rgba(245, 158, 11, ${rimAlpha.toFixed(3)})`
          : `rgba(${glowR}, ${glowG}, ${glowB}, ${rimAlpha.toFixed(3)})`;
      ctx.fillRect(x + pierW - 2 * scaleX, top2, 2 * scaleX, bot2 - top2);
      ctx.fillStyle = '#242B3A';
      ctx.fillRect(x, top2, 3 * scaleX, bot2 - top2);

      // Cross-brace arch collar
      ctx.fillStyle = '#1E2431';
      ctx.fillRect(x - 4 * scaleX, top2 + 24 * scaleY, pierW + 8 * scaleX, 6 * scaleY);

      // Hanging Chains (Hub & Foundry), Tendrils (Sunken), or Prism Rods (Vitriol)
      const chainOffsets = isHub ? [0.28, 0.52, 0.74] : [0.34, 0.68];
      for (let c = 0; c < chainOffsets.length; c++) {
        const sway = Math.sin(t * 0.75 + idx * 1.7 + c) * 1.2 * scaleX;
        const cx = x + span2 * chainOffsets[c] + sway;
        const chainLen = (50 + ((c * 37 + Math.abs(idx) * 23) % 48)) * scaleY;
        const linkH = Math.max(3, 3.2 * scaleY);
        const linkW = Math.max(2, 2.2 * scaleX);
        for (let cy = top2; cy < top2 + chainLen; cy += linkH * 1.65) {
          ctx.fillStyle = biomeId === 'SUNKEN_MASONRY' ? '#1B2D36' : '#262D3B';
          ctx.fillRect(cx - linkW * 0.5, cy, linkW, linkH);
          ctx.fillStyle =
            isHub || biomeId === 'ASHEN_FOUNDRY'
              ? 'rgba(251, 191, 36, 0.18)'
              : `rgba(${glowR}, ${glowG}, ${glowB}, 0.20)`;
          ctx.fillRect(cx - linkW * 0.5, cy, Math.max(1, linkW * 0.35), linkH * 0.5);
        }
        ctx.fillStyle = biomeId === 'VITRIOL_VAULTS' ? `rgba(${glowR}, ${glowG}, ${glowB}, 0.42)` : '#2D3545';
        ctx.fillRect(cx - linkW, top2 + chainLen, linkW * 2, linkH * 1.2);
      }
    }

    // Floating depth-motes (embers in Hub/Foundry, bioluminescent plankton in Sunken, prism spores in Vitriol)
    const moteCount = isHub ? 18 : 16;
    for (let e = 0; e < moteCount; e++) {
      const seedX = ((e * 197 + 43) % 1000) / 1000;
      const speed = isHub || biomeId === 'ASHEN_FOUNDRY' ? 14 + (e % 5) * 6 : 6 + (e % 4) * 3;
      const ex = ((seedX * cw * 1.4 - sx * 0.25 * scaleX + Math.sin(t * 1.3 + e) * 12) % cw + cw) % cw;
      const ey =
        isHub || biomeId === 'ASHEN_FOUNDRY'
          ? ch - ((t * speed + e * 49) % (ch * 0.92))
          : ((t * speed + e * 53) % (ch * 0.92));
      if (isHub || biomeId === 'ASHEN_FOUNDRY') {
        ctx.fillStyle = e % 3 === 0 ? 'rgba(253, 224, 71, 0.45)' : 'rgba(251, 146, 60, 0.4)';
      } else {
        ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${(0.28 + (e % 3) * 0.1).toFixed(2)})`;
      }
      const sz = Math.max(1.5, (e % 2 === 0 ? 1.5 : 1.1) * scaleX);
      ctx.fillRect(ex, ey, sz, sz);
    }

    ctx.restore();
  }

  private drawHubNpc(npc: HubNpc): void {
    const ctx = this.ctx;
    const x = Math.round(npc.x);
    const y = Math.round(npc.y);
    const f = npc.facing;
    const sway = Math.sin(npc.idlePhase) * 0.8;
    const hover = Math.sin(npc.idlePhase * 0.85) > 0.3 ? -1 : 0;

    // Grounded soft shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(x - 5, y - 1, 10, 2);

    // Flowing scholar robes (deep slate-indigo with tarnished gold trim)
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(x - 4, y - 12, 8, 12);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x - 3, y - 12, 6, 11);
    // Gold rune hem along robe bottom & stole
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - 4, y - 2, 8, 1);
    ctx.fillRect(x + f * 1, y - 11, 1, 8);

    // Draped mantle & hood
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 4, y - 13, 8, 3);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x - 3, y - 18, 6, 6);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 2, y - 18, 4, 1);

    // Shadowed cowl interior + subtle luminous eyes
    ctx.fillStyle = '#09090B';
    ctx.fillRect(f > 0 ? x - 1 : x - 2, y - 16, 3, 3);
    ctx.fillStyle = '#7DD3FC';
    ctx.fillRect(f > 0 ? x + 1 : x - 2, y - 15, 1, 1);

    // Bound Archive Tome tucked at side
    const tomeX = x - f * 4;
    ctx.fillStyle = '#78350F';
    ctx.fillRect(tomeX - 1, y - 10, 3, 4);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(tomeX - 1, y - 9, 1, 2);

    // Brass Hanging Staff Lantern gently swaying
    const staffX = x + f * 5;
    ctx.fillStyle = '#78350F';
    ctx.fillRect(staffX, y - 16, 1, 16);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(staffX, y - 17, 2, 1);
    const lx = Math.round(staffX + f * 2 + sway);
    const ly = Math.round(y - 14 + hover);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(lx, ly - 1, 1, 1);
    ctx.fillStyle = '#BAE6FD';
    ctx.fillRect(lx - 1, ly, 3, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(lx, ly + 1, 1, 1);

    if (this.player && Math.hypot(this.player.x - npc.x, this.player.y - npc.y) < 46) {
      ctx.font = 'bold 5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#BAE6FD';
      ctx.fillText(npc.name, x, y - 21);
    }
  }

  private drawHubTarget(tgt: HubTarget): void {
    const ctx = this.ctx;
    const x = Math.round(tgt.x);
    const y = Math.round(tgt.y);

    if (tgt.hp <= 0) {
      // Broken post stump while awaiting reset
      ctx.fillStyle = '#334155';
      ctx.fillRect(x - 3, y - 2, 6, 2);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(x - 1, y - 5, 2, 3);
      return;
    }

    const flash = tgt.hitFlash > 0;
    const isHeavy = tgt.maxHp >= 250;

    // Iron base & support post
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(x - 4, y - 2, 8, 2);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x - 1, y - 7, 2, 5);

    // Target torso shield board
    const bx = x - Math.floor(tgt.w * 0.5);
    const by = y - tgt.h;
    ctx.fillStyle = flash ? '#FFFFFF' : isHeavy ? '#334155' : '#78350F';
    ctx.fillRect(bx, by, tgt.w, tgt.h - 6);
    ctx.fillStyle = flash ? '#FEF08A' : isHeavy ? '#64748B' : '#B45309';
    ctx.fillRect(bx + 1, by + 1, tgt.w - 2, tgt.h - 8);

    // Bullseye target rings
    if (!flash) {
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(x - 2, by + 3, 4, 4);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(x - 1, by + 4, 2, 2);
    }

    // Subtle HP bar when damaged
    if (tgt.hp < tgt.maxHp) {
      const pct = Math.max(0, tgt.hp / tgt.maxHp);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x - 6, by - 4, 12, 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(x - 6, by - 4, Math.max(1, Math.round(12 * pct)), 2);
    }
  }

  private renderAtmosphereLighting(
    sx: number,
    sy: number,
    cw: number,
    ch: number,
    scaleX: number,
    scaleY: number,
    withEntities: boolean
  ): void {
    const atm = this.biome?.atmosphere;
    if (!atm) return;

    const timeSec = performance.now() * 0.001;
    const lights: LightSource[] = [];

    // 1. Clustered world pixel lights (lava pockets, torches, fire, bioluminescent crystals, acid pools)
    this.lighting.collectEnvironmentLights(
      this.world.mat,
      this.biome,
      sx,
      sy,
      this.viewSimW,
      this.viewSimH,
      timeSec,
      lights
    );

    if (this.levelLights.length > 0) {
      for (let i = 0; i < this.levelLights.length; i++) {
        const ll = this.levelLights[i];
        const flick =
          ll.flickerSpeed && ll.flickerAmp
            ? 1 + Math.sin(timeSec * ll.flickerSpeed + i * 1.7) * ll.flickerAmp
            : 1;
        lights.push({
          x: ll.x,
          y: ll.y,
          radius: ll.radius * flick,
          rgb: ll.rgb,
          intensity: ll.intensity * (0.94 + 0.06 * flick),
          volumetric: ll.volumetric,
          castShadows: ll.castShadows,
          rayCount: ll.rayCount ?? 48,
        });
      }
    }

    if (withEntities && this.player) {
      // 2. Player visor/suit lantern casting dynamic shadows behind cavern ridges & structures
      const pulse = 0.96 + 0.04 * Math.sin(timeSec * 3.4);
      const aimLeadX = Math.cos(this.player.aimAngle) * 7;
      const aimLeadY = Math.sin(this.player.aimAngle) * 5;
      lights.push({
        x: this.player.x + aimLeadX * 0.35,
        y: this.player.y - this.player.h * 0.55 + aimLeadY * 0.35,
        radius: 92 * atm.lightRadiusScale * pulse,
        rgb: atm.lightColorRgb,
        intensity: 1.05,
        volumetric: 0.14,
        castShadows: true,
        rayCount: 96,
      });

      // 3. Themed ammo dynamic lights from active projectiles & bombs
      let projLightCount = 0;
      for (let i = 0; i < this.projectiles.length && projLightCount < 14; i++) {
        const pr = this.projectiles[i];
        const spec = getAmmoLightSpec(pr.damageType, pr.color, pr.isBomb, pr.age, timeSec);
        lights.push({
          x: pr.x,
          y: pr.y,
          radius: spec.radius,
          rgb: spec.rgb,
          intensity: spec.intensity,
          volumetric: spec.volumetric,
          castShadows: spec.castShadows,
          rayCount: spec.rayCount,
        });
        projLightCount++;
      }

      // 4. Active muzzle flashes (directional weapon-themed blast light)
      for (let i = 0; i < this.muzzleFlashes.length; i++) {
        const mf = this.muzzleFlashes[i];
        const t = mf.life / mf.maxLife;
        lights.push({
          x: mf.x,
          y: mf.y,
          radius: 36 * t + 10,
          rgb: parseHexRgb(mf.color),
          intensity: 0.95 * t,
          volumetric: 0.25 * t,
          castShadows: true,
          rayCount: 32,
        });
      }

      // 5. Laser beam illumination at origin, midpoint, and superheated impact point
      for (let i = 0; i < this.beamFlashes.length; i++) {
        const b = this.beamFlashes[i];
        const spec = getAmmoLightSpec('LASER', b.color, false, 0, timeSec);
        const midX = (b.x0 + b.x1) * 0.5;
        const midY = (b.y0 + b.y1) * 0.5;
        lights.push({
          x: midX,
          y: midY,
          radius: spec.radius,
          rgb: spec.rgb,
          intensity: 0.72,
          volumetric: 0.16,
          castShadows: true,
          rayCount: 32,
        });
        lights.push({
          x: b.x1,
          y: b.y1,
          radius: spec.radius * 1.15,
          rgb: spec.rgb,
          intensity: spec.intensity,
          volumetric: spec.volumetric,
          castShadows: true,
          rayCount: 32,
        });
      }

      // 6. Shockwave & transient explosion impact flashes
      for (let i = 0; i < this.shockRings.length && i < 4; i++) {
        const r = this.shockRings[i];
        const t = Math.max(0, r.life / r.maxLife);
        lights.push({
          x: r.x,
          y: r.y,
          radius: r.radius + 22,
          rgb: parseHexRgb(r.color),
          intensity: 0.85 * t,
          volumetric: 0.26 * t,
          castShadows: true,
          rayCount: 48,
        });
      }

      for (let i = 0; i < this.transientLights.length; i++) {
        const tl = this.transientLights[i];
        const t = Math.max(0, tl.life / tl.maxLife);
        lights.push({
          x: tl.x,
          y: tl.y,
          radius: tl.radius * (0.7 + 0.3 * t),
          rgb: tl.rgb,
          intensity: tl.intensity * t,
          volumetric: tl.volumetric * t,
          castShadows: tl.castShadows,
          rayCount: 48,
        });
      }

      // 7. Portal & unclaimed Relic/Weapon Pedestal beacons
      if (this.portal) {
        lights.push({
          x: this.portal.x,
          y: this.portal.y + 4,
          radius: this.portal.active ? 58 : 34,
          rgb: this.portal.active ? atm.lightColorRgb : [239, 68, 68],
          intensity: this.portal.active ? 0.95 : 0.72,
          volumetric: 0.24,
          castShadows: true,
          rayCount: 48,
        });
      }

      for (let i = 0; i < this.pedestals.length; i++) {
        const ped = this.pedestals[i];
        if (ped.used) continue;
        const wCol = ped.weaponOffer ? WEAPONS[ped.weaponOffer].color : '#38BDF8';
        lights.push({
          x: ped.x,
          y: ped.y - 14,
          radius: 36,
          rgb: parseHexRgb(wCol),
          intensity: 0.72,
          volumetric: 0.18,
          castShadows: true,
          rayCount: 32,
        });
      }

      // 8. Boss glowing furnace/crystal core & bioluminescent/fiery enemies
      if (this.boss) {
        lights.push({
          x: this.boss.x,
          y: this.boss.y - this.boss.h * 0.5,
          radius: 112,
          rgb: atm.crystalGlowRgb,
          intensity: 1.15,
          volumetric: 0.32,
          castShadows: true,
          rayCount: 64,
        });
      }

      let enemyGlowCount = 0;
      for (let i = 0; i < this.enemies.length && enemyGlowCount < 6; i++) {
        const en = this.enemies[i];
        if (
          en.x + 30 < sx ||
          en.x - 30 > sx + this.viewSimW ||
          en.y + 30 < sy ||
          en.y - 30 > sy + this.viewSimH
        ) {
          continue;
        }
        if (en.kind === 'PYRO_IMP') {
          lights.push({
            x: en.x,
            y: en.y - en.h * 0.5,
            radius: 26,
            rgb: [255, 146, 54],
            intensity: 0.68,
            volumetric: 0.16,
            castShadows: true,
            rayCount: 32,
          });
          enemyGlowCount++;
        } else if (en.kind === 'CRYSTAL_WISP') {
          lights.push({
            x: en.x,
            y: en.y - en.h * 0.5,
            radius: 28,
            rgb: atm.crystalGlowRgb,
            intensity: 0.7,
            volumetric: 0.17,
            castShadows: true,
            rayCount: 32,
          });
          enemyGlowCount++;
        } else if (en.kind === 'DRONE') {
          lights.push({
            x: en.x,
            y: en.y - en.h * 0.5,
            radius: 17,
            rgb: [251, 113, 133],
            intensity: 0.45,
            volumetric: 0.1,
            castShadows: false,
          });
          enemyGlowCount++;
        }
      }
    }

    this.lighting.renderLighting(
      this.ctx,
      this.world.mat,
      lights,
      this.biome,
      this.depth,
      sx,
      sy,
      this.viewSimW,
      this.viewSimH,
      cw,
      ch,
      scaleX,
      scaleY
    );
  }

  private drawVfxParticles(): void {
    const ctx = this.ctx;
    for (let i = 0; i < this.vfxParticles.length; i++) {
      const v = this.vfxParticles[i];
      if (v.kind === 'SMOKE') {
        ctx.globalAlpha = v.alpha * 0.38;
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (v.kind === 'MOTE') {
        const pulse = 0.55 + 0.45 * Math.sin(this.elapsedSeconds * 3 + i);
        ctx.globalAlpha = Math.min(1, v.alpha * 0.5 * pulse);
        ctx.fillStyle = v.color;
        ctx.fillRect(Math.round(v.x), Math.round(v.y), v.size, v.size);
      } else if (v.kind === 'CASING') {
        ctx.globalAlpha = v.alpha;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.rot);
        ctx.fillStyle = v.color;
        ctx.fillRect(-1, -0.5, 2, 1);
        ctx.restore();
      } else if (v.kind === 'SHARD') {
        ctx.globalAlpha = v.alpha * 0.9;
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.rot);
        ctx.fillStyle = v.color;
        ctx.fillRect(-v.size * 0.5, -v.size * 0.5, v.size, v.size);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-0.4, -0.4, 0.8, 0.8);
        ctx.restore();
      } else {
        // SPARK velocity streak
        ctx.globalAlpha = v.alpha;
        ctx.strokeStyle = v.color;
        ctx.lineWidth = Math.max(0.7, v.size * 0.7);
        ctx.beginPath();
        ctx.moveTo(v.x - v.vx * 0.015, v.y - v.vy * 0.015);
        ctx.lineTo(v.x, v.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(p: Player): void {
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    const ctx = this.ctx;

    if (p.invulnTimer > 0 && Math.floor(p.invulnTimer * 18) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    // 1. Dynamic trailing tactical scarf behind player
    if (this.scarfNodes.length >= 3) {
      ctx.strokeStyle = '#EA580C';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(this.scarfNodes[0].x, this.scarfNodes[0].y);
      for (let s = 1; s < this.scarfNodes.length; s++) {
        ctx.lineTo(this.scarfNodes[s].x, this.scarfNodes[s].y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#FDBA74';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(this.scarfNodes[0].x, this.scarfNodes[0].y - 0.5);
      ctx.lineTo(this.scarfNodes[1].x, this.scarfNodes[1].y - 0.5);
      ctx.stroke();
    }

    const isRunning = Math.abs(p.vx) > 12 && p.grounded;
    const stride = isRunning ? Math.sin(performance.now() * 0.022) : 0;
    const bob = isRunning ? Math.abs(Math.cos(performance.now() * 0.022)) * -1 : 0;
    const f = p.facing;

    // 2. Articulated legs + armored boots
    const leftLegLift = !p.grounded ? -1 : stride > 0.25 ? -1 : 0;
    const rightLegLift = !p.grounded ? 0 : stride < -0.25 ? -1 : 0;
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(px - 3, py - 5 + leftLegLift, 2, 4);
    ctx.fillRect(px + 1, py - 5 + rightLegLift, 2, 4);
    ctx.fillStyle = '#475569';
    ctx.fillRect(px - 3, py - 5 + leftLegLift, 2, 2);
    ctx.fillRect(px + 1, py - 5 + rightLegLift, 2, 2);
    // Boots
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(px - 3, py - 2 + leftLegLift, 3, 2);
    ctx.fillRect(px + 1, py - 2 + rightLegLift, 3, 2);

    // 3. Thruster backpack + animated jetpack flame when airborne/dashing
    const packX = px - f * 4;
    const packY = py - 11 + bob;
    ctx.fillStyle = '#9A3412';
    ctx.fillRect(packX, packY, 2, 6);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(packX, packY + 1, 2, 2);
    if (!p.grounded || p.dashTimer > 0) {
      const flameH = p.dashTimer > 0 ? 5 : p.vy < 0 ? 4 : 2;
      ctx.fillStyle = p.dashTimer > 0 ? '#38BDF8' : '#FB923C';
      ctx.fillRect(packX, packY + 6, 2, flameH);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(packX, packY + 6, 1, Math.max(1, flameH - 1));
    }

    // 4. Exo-suit torso + chest armor + core light
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(px - 4, py - 12 + bob, 8, 7);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(px - 3, py - 11 + bob, 6, 6);
    ctx.fillStyle = '#334155';
    ctx.fillRect(px - 3, py - 11 + bob, 6, 2); // shoulder armor highlight
    ctx.fillStyle = '#475569';
    ctx.fillRect(px - 3, py - 7 + bob, 6, 1); // tactical belt
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(px + f * 1, py - 10 + bob, 1, 2); // chest core node

    // 5. Shaded Helmet & Reflective Visor
    ctx.fillStyle = '#334155';
    ctx.fillRect(px - 3, py - 16 + bob, 6, 5); // helmet shadow shell
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(px - 3, py - 16 + bob, 6, 4);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(px - 2, py - 16 + bob, 4, 1); // top rim highlight
    // Visor
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(f > 0 ? px : px - 3, py - 14 + bob, 3, 2);
    ctx.fillStyle = '#7DD3FC';
    ctx.fillRect(f > 0 ? px + 1 : px - 3, py - 14 + bob, 2, 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(f > 0 ? px + 2 : px - 3, py - 14 + bob, 1, 1);

    // 6. Detailed Held Pixel Weapon rotated cleanly at aimAngle with recoil kickback
    const activeWeapon = WEAPONS[p.weapons[p.activeWeaponIdx]];
    const shoulderX = px + f * 1;
    const shoulderY = py - 9 + bob;
    const recoil = this.weaponRecoil;

    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(p.aimAngle);
    if (Math.cos(p.aimAngle) < 0) {
      ctx.scale(1, -1);
    }
    ctx.translate(-recoil, 0);

    // Grip + dark weapon frame
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-1, -1.5, 9, 3.2);
    ctx.fillRect(0, 1, 2, 2); // handgrip
    // Metallic receiver
    ctx.fillStyle = '#64748B';
    ctx.fillRect(-1, -1, 7, 2);
    // Colored energy barrel / chamber
    ctx.fillStyle = activeWeapon.color;
    if (activeWeapon.id === 'FLAK_CANNON' || activeWeapon.id === 'ACID_MORTAR' || activeWeapon.id === 'GRAVITON_CANNON') {
      ctx.fillRect(2, -2, 6, 3);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(7, -1.5, 1.5, 2);
    } else if (activeWeapon.id === 'PLASMA_RAIL' || activeWeapon.id === 'VOID_SINGULARITY_GUN') {
      ctx.fillRect(1, -1.5, 9, 1.2);
      ctx.fillRect(1, 0.5, 8, 1);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(4, -0.5, 4, 0.8);
    } else {
      ctx.fillRect(2, -1, 6, 1.5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(6, -0.8, 2, 0.8);
    }
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  private drawBoss(boss: PixelBoss): void {
    const bctx = this.bossCanvas.getContext('2d');
    if (bctx && boss.canvasDirty) {
      const img = bctx.createImageData(boss.w, boss.h);
      const u32 = new Uint32Array(img.data.buffer);
      for (let i = 0; i < boss.mats.length; i++) {
        const m = boss.mats[i] as Mat;
        if (m === Mat.EMPTY) {
          u32[i] = 0;
        } else {
          const d = boss.pixelDmg[i];
          if (d === 0) {
            u32[i] = boss.colors[i];
          } else {
            const maxHp = MAT_PROPS[m].maxHp || 24;
            const frac = Math.min(1, d / maxHp);
            const mul = frac > 0.45 && ((i ^ (i >> 5)) & 1) === 0 ? 0.44 : 1 - frac * 0.4;
            const c = boss.colors[i];
            const r = ((c & 0xff) * mul) | 0;
            const g = (((c >>> 8) & 0xff) * mul) | 0;
            const b = (((c >>> 16) & 0xff) * mul) | 0;
            u32[i] = (0xff << 24) | (b << 16) | (g << 8) | r;
          }
        }
      }
      bctx.putImageData(img, 0, 0);
      boss.canvasDirty = false;
    }

    const bx = Math.round(boss.x - boss.w * 0.5);
    const by = Math.round(boss.y - boss.h);

    // Thruster flame exhausts for hovering / furnace bosses
    if (boss.biomeId === 'VITRIOL_VAULTS' || boss.vy < -15) {
      const flick = 9 + Math.sin(performance.now() * 0.035) * 4;
      const isVitriol = boss.biomeId === 'VITRIOL_VAULTS';
      const outerColor = isVitriol ? 'rgba(74, 222, 128, 0.72)' : 'rgba(251, 146, 60, 0.78)';
      const innerColor = isVitriol ? 'rgba(220, 252, 231, 0.85)' : 'rgba(254, 240, 138, 0.88)';
      for (const txOff of [-17, -2, 13]) {
        const tx = Math.round(boss.x + txOff);
        const ty = Math.round(boss.y - 3);
        this.ctx.fillStyle = outerColor;
        this.ctx.fillRect(tx, ty, 5, flick);
        this.ctx.fillStyle = innerColor;
        this.ctx.fillRect(tx + 1, ty, 3, Math.max(4, flick * 0.55));
      }
    }

    this.ctx.drawImage(this.bossCanvas, bx, by);

    // Shimmer highlight over intact Special Spot pixels + subtle corner target brackets
    const pulse = 0.45 + 0.35 * Math.sin(performance.now() * 0.008);
    this.ctx.fillStyle =
      boss.hurtFlash > 0
        ? 'rgba(255,255,255,0.65)'
        : boss.biomeId === 'SUNKEN_MASONRY'
        ? `rgba(56, 189, 248, ${pulse * 0.45})`
        : boss.biomeId === 'ASHEN_FOUNDRY'
        ? `rgba(251, 146, 60, ${pulse * 0.5})`
        : `rgba(74, 222, 128, ${pulse * 0.5})`;

    let minCx = boss.w;
    let maxCx = -1;
    let minCy = boss.h;
    let maxCy = -1;
    for (let ly = 0; ly < boss.h; ly++) {
      for (let lx = 0; lx < boss.w; lx++) {
        const idx = ly * boss.w + lx;
        if (boss.mats[idx] !== Mat.EMPTY && boss.isCore[idx] === 1) {
          this.ctx.fillRect(bx + lx, by + ly, 1, 1);
          if (lx < minCx) minCx = lx;
          if (lx > maxCx) maxCx = lx;
          if (ly < minCy) minCy = ly;
          if (ly > maxCy) maxCy = ly;
        }
      }
    }

    if (maxCx >= minCx) {
      this.ctx.strokeStyle =
        boss.biomeId === 'SUNKEN_MASONRY'
          ? `rgba(125, 211, 252, ${0.5 + pulse * 0.45})`
          : boss.biomeId === 'ASHEN_FOUNDRY'
          ? `rgba(253, 186, 116, ${0.5 + pulse * 0.45})`
          : `rgba(134, 239, 172, ${0.5 + pulse * 0.45})`;
      this.ctx.lineWidth = 1;
      const rx = bx + minCx - 2;
      const ry = by + minCy - 2;
      const rw = maxCx - minCx + 5;
      const rh = maxCy - minCy + 5;
      const bLen = Math.min(5, Math.floor(Math.min(rw, rh) * 0.35));
      this.ctx.beginPath();
      // Top-left bracket
      this.ctx.moveTo(rx, ry + bLen);
      this.ctx.lineTo(rx, ry);
      this.ctx.lineTo(rx + bLen, ry);
      // Top-right bracket
      this.ctx.moveTo(rx + rw - bLen, ry);
      this.ctx.lineTo(rx + rw, ry);
      this.ctx.lineTo(rx + rw, ry + bLen);
      // Bottom-left bracket
      this.ctx.moveTo(rx, ry + rh - bLen);
      this.ctx.lineTo(rx, ry + rh);
      this.ctx.lineTo(rx + bLen, ry + rh);
      // Bottom-right bracket
      this.ctx.moveTo(rx + rw - bLen, ry + rh);
      this.ctx.lineTo(rx + rw, ry + rh);
      this.ctx.lineTo(rx + rw, ry + rh - bLen);
      this.ctx.stroke();
    }

    // Active Shield Plate Aegis Repulsor barrier arc
    if (boss.shieldActiveTimer > 0) {
      const sOrigin = getBossOriginWorld(boss, boss.shieldSide < 0 ? 'LEFT_LIMB' : 'RIGHT_LIMB');
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(96, 165, 250, 0.85)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      const startAng = boss.shieldSide < 0 ? Math.PI * 0.58 : -Math.PI * 0.42;
      const endAng = boss.shieldSide < 0 ? Math.PI * 1.42 : Math.PI * 0.42;
      this.ctx.arc(sOrigin.x, sOrigin.y, 26, startAng, endAng);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Telegraph aura & target sightline for upcoming modular special attacks
    if (boss.pendingSpecialId) {
      const meta = BOSS_SPECIAL_CATALOG[boss.pendingSpecialId];
      if (meta) {
        const origin = getBossOriginWorld(boss, meta.origin);
        const frac = 1 - Math.max(0, boss.telegraphTimer) / Math.max(0.05, boss.telegraphDuration);
        this.ctx.save();
        this.ctx.strokeStyle = meta.color;
        this.ctx.fillStyle = meta.color;

        if (meta.telegraphKind === 'LASER') {
          this.ctx.globalAlpha = 0.45 + 0.4 * Math.sin(performance.now() * 0.04);
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([4, 3]);
          this.ctx.beginPath();
          this.ctx.moveTo(origin.x, origin.y);
          const ang = Math.atan2(boss.pendingTargetY - origin.y, boss.pendingTargetX - origin.x);
          this.ctx.lineTo(origin.x + Math.cos(ang) * 320, origin.y + Math.sin(ang) * 320);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        } else if (meta.telegraphKind === 'DROP') {
          this.ctx.globalAlpha = 0.35 + frac * 0.35;
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([3, 3]);
          this.ctx.beginPath();
          this.ctx.moveTo(boss.x - 16, boss.y);
          this.ctx.lineTo(boss.x - 16, boss.arenaFloorY);
          this.ctx.moveTo(boss.x + 16, boss.y);
          this.ctx.lineTo(boss.x + 16, boss.arenaFloorY);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        } else if (meta.telegraphKind === 'RUSH') {
          this.ctx.globalAlpha = 0.55 + frac * 0.35;
          this.ctx.lineWidth = 1.4;
          for (let c = 0; c < 3; c++) {
            const cxPos = boss.x + boss.specialDir * (38 + c * 11);
            const cyPos = boss.y - boss.h * 0.45;
            this.ctx.beginPath();
            this.ctx.moveTo(cxPos - boss.specialDir * 4, cyPos - 5);
            this.ctx.lineTo(cxPos + boss.specialDir * 3, cyPos);
            this.ctx.lineTo(cxPos - boss.specialDir * 4, cyPos + 5);
            this.ctx.stroke();
          }
        }

        // Charge core ring on firing part
        this.ctx.globalAlpha = 0.3 + frac * 0.65;
        this.ctx.lineWidth = 1.4;
        this.ctx.beginPath();
        this.ctx.arc(origin.x, origin.y, 4 + frac * 11, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.globalAlpha = 0.75;
        this.ctx.beginPath();
        this.ctx.arc(origin.x, origin.y, 2 + frac * 3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  private drawEnemy(en: Enemy): void {
    const ex = Math.round(en.x);
    const ey = Math.round(en.y);
    const flash = en.hurtFlash > 0;
    const ctx = this.ctx;
    const t = performance.now() * 0.01 + en.id;

    if (en.kind === 'STONE_WARDEN') {
      // Towering moss-draped rune monolith golem
      ctx.fillStyle = flash ? '#FFFFFF' : '#1E293B';
      ctx.fillRect(ex - 7, ey - 18, 14, 18); // silhouette outline
      ctx.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx.fillRect(ex - 6, ey - 17, 12, 16);
      ctx.fillStyle = flash ? '#FFFFFF' : '#64748B';
      ctx.fillRect(ex - 5, ey - 16, 10, 4); // brow highlight
      // Moss shoulder patches
      ctx.fillStyle = flash ? '#FFFFFF' : '#22C55E';
      ctx.fillRect(ex - 6, ey - 17, 4, 2);
      ctx.fillRect(ex + 2, ey - 17, 4, 2);
      // Heavy stone fists
      const armSwing = Math.sin(t * 0.8) * 1.2;
      ctx.fillStyle = flash ? '#FFFFFF' : '#334155';
      ctx.fillRect(ex - 8, ey - 11 + armSwing, 2, 7);
      ctx.fillRect(ex + 6, ey - 11 - armSwing, 2, 7);
      // Glowing cyan runic eye & chest sigil
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(ex - 2, ey - 13, 4, 2);
      ctx.fillRect(ex - 1, ey - 9, 2, 3);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(ex + en.facing * 1, ey - 13, 1, 1);
    } else if (en.kind === 'PYRO_IMP') {
      // Horned winged ember fiend
      const flap = Math.round(Math.sin(t * 2.6) * 2);
      // Flapping wings
      ctx.fillStyle = flash ? '#FFFFFF' : '#F97316';
      ctx.fillRect(ex - 7, ey - 10 + flap, 3, 4);
      ctx.fillRect(ex + 4, ey - 10 + flap, 3, 4);
      ctx.fillStyle = flash ? '#FFFFFF' : '#FDE047';
      ctx.fillRect(ex - 6, ey - 9 + flap, 1, 2);
      ctx.fillRect(ex + 5, ey - 9 + flap, 1, 2);
      // Horns & dark obsidian body
      ctx.fillStyle = flash ? '#FFFFFF' : '#450A0A';
      ctx.fillRect(ex - 4, ey - 11, 2, 2);
      ctx.fillRect(ex + 2, ey - 11, 2, 2);
      ctx.fillStyle = flash ? '#FFFFFF' : '#9A3412';
      ctx.fillRect(ex - 4, ey - 9, 8, 8);
      ctx.fillStyle = flash ? '#FFFFFF' : '#EA580C';
      ctx.fillRect(ex - 2, ey - 6, 4, 3); // glowing molten core
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(ex + en.facing * 1, ey - 8, 2, 2);
    } else if (en.kind === 'CRYSTAL_WISP') {
      // Faceted crystal prism orbited by floating shards
      const hover = Math.sin(t) * 1.2;
      ctx.fillStyle = flash ? '#FFFFFF' : '#059669';
      ctx.fillRect(ex - 3, ey - 10 + hover, 6, 8);
      ctx.fillStyle = flash ? '#FFFFFF' : '#34D399';
      ctx.fillRect(ex - 2, ey - 11 + hover, 4, 10);
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(ex - 1, ey - 9 + hover, 2, 5);
      // Orbiting crystal motes
      for (let m = 0; m < 2; m++) {
        const ang = t * 1.5 + m * Math.PI;
        const ox = ex + Math.cos(ang) * 5;
        const oy = ey - 6 + Math.sin(ang) * 3;
        ctx.fillStyle = '#6EE7B7';
        ctx.fillRect(Math.round(ox), Math.round(oy), 2, 2);
      }
    } else if (en.kind === 'DRONE') {
      // Spinning twin-rotor security drone
      const rotorW = Math.floor(t * 4) % 2 === 0 ? 11 : 7;
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(ex - Math.floor(rotorW / 2), ey - 8, rotorW, 1);
      ctx.fillStyle = '#475569';
      ctx.fillRect(ex - 1, ey - 7, 2, 1);
      // Armored hull
      ctx.fillStyle = flash ? '#FFFFFF' : '#1E293B';
      ctx.fillRect(ex - 5, ey - 6, 10, 6);
      ctx.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx.fillRect(ex - 4, ey - 5, 8, 4);
      // Scanner lens & exhaust
      ctx.fillStyle = '#FB7185';
      ctx.fillRect(ex + en.facing * 2, ey - 4, 2, 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(ex + en.facing * 3, ey - 4, 1, 1);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(ex - 2, ey, 1, 2);
      ctx.fillRect(ex + 1, ey, 1, 2);
    } else if (en.kind === 'SENTINEL') {
      // Armored heavy sentinel with shoulder pauldrons & lance barrel
      ctx.fillStyle = flash ? '#FFFFFF' : '#1E293B';
      ctx.fillRect(ex - 6, ey - 15, 12, 15);
      ctx.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx.fillRect(ex - 5, ey - 14, 10, 12);
      // Pauldrons
      ctx.fillStyle = flash ? '#FFFFFF' : '#94A3B8';
      ctx.fillRect(ex - 6, ey - 14, 3, 4);
      ctx.fillRect(ex + 3, ey - 14, 3, 4);
      // Visor & chest core
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(ex - 3, ey - 12, 6, 2);
      ctx.fillRect(ex - 1, ey - 8, 2, 2);
      // Cannon arm
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(ex + en.facing * 3, ey - 9, 4 * en.facing, 2);
    } else if (en.kind === 'SLIME') {
      // Squash-and-stretch translucent gelatinous slime
      const sq = en.grounded ? Math.sin(t * 1.4) * 0.8 : -1;
      const sw = Math.round(9 + sq);
      const sh = Math.round(7 - sq * 0.6);
      ctx.fillStyle = flash ? '#FFFFFF' : '#15803D';
      ctx.fillRect(ex - Math.floor(sw / 2), ey - sh - 1, sw, sh + 1);
      ctx.fillStyle = flash ? '#FFFFFF' : '#22C55E';
      ctx.fillRect(ex - Math.floor(sw / 2) + 1, ey - sh, sw - 2, sh - 1);
      // Inner nucleus & specular shine
      ctx.fillStyle = '#86EFAC';
      ctx.fillRect(ex - 1, ey - Math.ceil(sh * 0.6), 3, 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(ex - Math.floor(sw / 2) + 2, ey - sh + 1, 2, 1);
    } else if (en.kind === 'TURRET') {
      // Anchored tripod turret with tracking gun barrel
      ctx.fillStyle = '#334155';
      ctx.fillRect(ex - 5, ey - 2, 10, 2);
      ctx.fillRect(ex - 3, ey - 5, 6, 3);
      ctx.fillStyle = flash ? '#FFFFFF' : '#64748B';
      ctx.fillRect(ex - 4, ey - 9, 8, 5);
      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(ex + en.facing * 1, ey - 7, 2, 2);
      // Tracking barrel
      if (this.player) {
        const ang = Math.atan2(this.player.y - this.player.h * 0.5 - (ey - 6), this.player.x - ex);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex, ey - 6);
        ctx.lineTo(ex + Math.cos(ang) * 6, ey - 6 + Math.sin(ang) * 6);
        ctx.stroke();
      }
    } else {
      // CRAWLER: armored chitin beetle with animated scuttling legs & mandibles
      const step = Math.floor(t * 3) % 2;
      ctx.fillStyle = flash ? '#FFFFFF' : '#450A0A';
      ctx.fillRect(ex - 5, ey - 8, 10, 6);
      ctx.fillStyle = flash ? '#FFFFFF' : '#B91C1C';
      ctx.fillRect(ex - 4, ey - 7, 8, 4);
      ctx.fillStyle = flash ? '#FFFFFF' : '#EF4444';
      ctx.fillRect(ex - 3, ey - 7, 6, 1); // carapace highlight
      // Glowing eyes & mandibles
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(ex + en.facing * 2, ey - 6, 2, 2);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(ex + en.facing * 4, ey - 5, 1, 2);
      // Scuttling legs
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(ex - 4 + step, ey - 2, 2, 2);
      ctx.fillRect(ex - 1 - step, ey - 2, 2, 2);
      ctx.fillRect(ex + 2 + step, ey - 2, 2, 2);
    }

    if (en.hp < en.maxHp) {
      const pct = Math.max(0, en.hp / en.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(ex - 5, ey - en.h - 5, 10, 2);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(ex - 5, ey - en.h - 5, Math.round(10 * pct), 2);
    }
  }
}

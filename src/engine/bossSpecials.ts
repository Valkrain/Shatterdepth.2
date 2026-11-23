import { BossParts, Mat, PixelBoss } from './types';

export type BossPartKey = 'crown' | 'leftLimb' | 'rightLimb' | 'base';
export type TelegraphKind = 'CHARGE' | 'LASER' | 'DROP' | 'RUSH' | 'NOVA';
export type OriginRegion = 'CROWN' | 'LEFT_LIMB' | 'RIGHT_LIMB' | 'CHEST' | 'BASE';

export interface BossSpecialMeta {
  id: string;
  title: string;
  color: string;
  origin: OriginRegion;
  requiredParts: BossPartKey[];
  telegraphDuration: number;
  telegraphKind: TelegraphKind;
  isCombo?: boolean;
}

export const BOSS_SPECIAL_CATALOG: Record<string, BossSpecialMeta> = {
  // --- Crown Specials (5) ---
  CROWN_HORNED: {
    id: 'CROWN_HORNED',
    title: 'Horned Tempest',
    color: '#FBBF24',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.5,
    telegraphKind: 'RUSH',
  },
  CROWN_SMOKESTACKS: {
    id: 'CROWN_SMOKESTACKS',
    title: 'Cinder Rain Mortar',
    color: '#FB923C',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.48,
    telegraphKind: 'CHARGE',
  },
  CROWN_DOME: {
    id: 'CROWN_DOME',
    title: 'Orbital Prism Dome',
    color: '#38BDF8',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.52,
    telegraphKind: 'NOVA',
  },
  CROWN_PRONG_SPIRE: {
    id: 'CROWN_PRONG_SPIRE',
    title: 'Apex Rail Lance',
    color: '#4ADE80',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.62,
    telegraphKind: 'LASER',
  },
  CROWN_TURRET_CAP: {
    id: 'CROWN_TURRET_CAP',
    title: 'Auto-Cannon Sweep',
    color: '#F59E0B',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.44,
    telegraphKind: 'CHARGE',
  },

  // --- Left Limb Specials (5) ---
  LEFT_PAULDRON_ARM: {
    id: 'LEFT_PAULDRON_ARM',
    title: 'Port Seismic Slam',
    color: '#93C5FD',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.48,
    telegraphKind: 'CHARGE',
  },
  LEFT_CANNON_POD: {
    id: 'LEFT_CANNON_POD',
    title: 'Port Artillery Salvo',
    color: '#FB923C',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.45,
    telegraphKind: 'CHARGE',
  },
  LEFT_CRYSTAL_WING: {
    id: 'LEFT_CRYSTAL_WING',
    title: 'Port Featherblade',
    color: '#34D399',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.44,
    telegraphKind: 'CHARGE',
  },
  LEFT_SHIELD_PLATE: {
    id: 'LEFT_SHIELD_PLATE',
    title: 'Port Aegis Repulsor',
    color: '#60A5FA',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.42,
    telegraphKind: 'NOVA',
  },
  LEFT_CLAW_PINCER: {
    id: 'LEFT_CLAW_PINCER',
    title: 'Port Viper Pincer',
    color: '#F87171',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.42,
    telegraphKind: 'CHARGE',
  },

  // --- Right Limb Specials (5) ---
  RIGHT_PAULDRON_ARM: {
    id: 'RIGHT_PAULDRON_ARM',
    title: 'Starboard Seismic Slam',
    color: '#93C5FD',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.48,
    telegraphKind: 'CHARGE',
  },
  RIGHT_CANNON_POD: {
    id: 'RIGHT_CANNON_POD',
    title: 'Starboard Artillery Salvo',
    color: '#FB923C',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.45,
    telegraphKind: 'CHARGE',
  },
  RIGHT_CRYSTAL_WING: {
    id: 'RIGHT_CRYSTAL_WING',
    title: 'Starboard Featherblade',
    color: '#34D399',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.44,
    telegraphKind: 'CHARGE',
  },
  RIGHT_SHIELD_PLATE: {
    id: 'RIGHT_SHIELD_PLATE',
    title: 'Starboard Aegis Repulsor',
    color: '#60A5FA',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.42,
    telegraphKind: 'NOVA',
  },
  RIGHT_CLAW_PINCER: {
    id: 'RIGHT_CLAW_PINCER',
    title: 'Starboard Viper Pincer',
    color: '#F87171',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.42,
    telegraphKind: 'CHARGE',
  },

  // --- Hull Specials (4) ---
  HULL_CITADEL: {
    id: 'HULL_CITADEL',
    title: 'Fortress Siege Wall',
    color: '#E2E8F0',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.5,
    telegraphKind: 'CHARGE',
  },
  HULL_BOILER: {
    id: 'HULL_BOILER',
    title: 'Pressure Vent Nova',
    color: '#F97316',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.54,
    telegraphKind: 'NOVA',
  },
  HULL_DIAMOND: {
    id: 'HULL_DIAMOND',
    title: 'Refraction Matrix',
    color: '#38BDF8',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.58,
    telegraphKind: 'LASER',
  },
  HULL_RIBCAGE: {
    id: 'HULL_RIBCAGE',
    title: 'Heartcore Pulsar',
    color: '#C084FC',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.46,
    telegraphKind: 'CHARGE',
  },

  // --- Base / Locomotion Specials (4) ---
  BASE_PILLAR_LEGS: {
    id: 'BASE_PILLAR_LEGS',
    title: 'Titan Earthquake',
    color: '#38BDF8',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.52,
    telegraphKind: 'DROP',
  },
  BASE_TANK_TREADS: {
    id: 'BASE_TANK_TREADS',
    title: 'Juggernaut Overrun',
    color: '#FBBF24',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.56,
    telegraphKind: 'RUSH',
  },
  BASE_THRUSTER_BELLS: {
    id: 'BASE_THRUSTER_BELLS',
    title: 'Afterburner Carpet Bomb',
    color: '#FB923C',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.48,
    telegraphKind: 'RUSH',
  },
  BASE_SPIKE_KEEL: {
    id: 'BASE_SPIKE_KEEL',
    title: 'Meteor Keel Drop',
    color: '#F43F5E',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.6,
    telegraphKind: 'DROP',
  },

  // --- Core Slot Resonance Specials (5) ---
  CORE_RESONANCE_CHEST: {
    id: 'CORE_RESONANCE_CHEST',
    title: 'Chest-Core Overdrive',
    color: '#38BDF8',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.54,
    telegraphKind: 'NOVA',
    isCombo: true,
  },
  CORE_RESONANCE_CROWN: {
    id: 'CORE_RESONANCE_CROWN',
    title: 'Crown-Node Overload',
    color: '#38BDF8',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.6,
    telegraphKind: 'LASER',
    isCombo: true,
  },
  CORE_RESONANCE_LEFT_POD: {
    id: 'CORE_RESONANCE_LEFT_POD',
    title: 'Port-Reactor Surge',
    color: '#38BDF8',
    origin: 'LEFT_LIMB',
    requiredParts: ['leftLimb'],
    telegraphDuration: 0.5,
    telegraphKind: 'CHARGE',
    isCombo: true,
  },
  CORE_RESONANCE_RIGHT_POD: {
    id: 'CORE_RESONANCE_RIGHT_POD',
    title: 'Starboard-Reactor Surge',
    color: '#38BDF8',
    origin: 'RIGHT_LIMB',
    requiredParts: ['rightLimb'],
    telegraphDuration: 0.5,
    telegraphKind: 'CHARGE',
    isCombo: true,
  },
  CORE_RESONANCE_KEEL: {
    id: 'CORE_RESONANCE_KEEL',
    title: 'Keel-Core Eruption',
    color: '#F59E0B',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.56,
    telegraphKind: 'NOVA',
    isCombo: true,
  },

  // --- Synergy Combo Permutations (11) ---
  COMBO_INFERNAL_OVERPRESSURE: {
    id: 'COMBO_INFERNAL_OVERPRESSURE',
    title: 'Infernal Overpressure',
    color: '#FB923C',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.62,
    telegraphKind: 'NOVA',
    isCombo: true,
  },
  COMBO_BASTION_SIEGE: {
    id: 'COMBO_BASTION_SIEGE',
    title: 'Bastion Siege Barrage',
    color: '#FBBF24',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.62,
    telegraphKind: 'LASER',
    isCombo: true,
  },
  COMBO_PRISMATIC_ANNIHILATION: {
    id: 'COMBO_PRISMATIC_ANNIHILATION',
    title: 'Prismatic Annihilation',
    color: '#4ADE80',
    origin: 'CROWN',
    requiredParts: ['crown'],
    telegraphDuration: 0.68,
    telegraphKind: 'LASER',
    isCombo: true,
  },
  COMBO_REND_HARVEST: {
    id: 'COMBO_REND_HARVEST',
    title: 'Rend & Harvest',
    color: '#F87171',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.52,
    telegraphKind: 'RUSH',
    isCombo: true,
  },
  COMBO_SERAPHIM_DIVE: {
    id: 'COMBO_SERAPHIM_DIVE',
    title: 'Seraphim Crystal Dive',
    color: '#34D399',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.56,
    telegraphKind: 'RUSH',
    isCombo: true,
  },
  COMBO_BLITZKRIEG_THUNDER: {
    id: 'COMBO_BLITZKRIEG_THUNDER',
    title: 'Blitzkrieg Rolling Thunder',
    color: '#F97316',
    origin: 'BASE',
    requiredParts: ['base'],
    telegraphDuration: 0.58,
    telegraphKind: 'RUSH',
    isCombo: true,
  },
  COMBO_CATACLYSM_PILEDRIVER: {
    id: 'COMBO_CATACLYSM_PILEDRIVER',
    title: 'Cataclysm Piledriver',
    color: '#F43F5E',
    origin: 'BASE',
    requiredParts: ['crown', 'base'],
    telegraphDuration: 0.64,
    telegraphKind: 'DROP',
    isCombo: true,
  },
  COMBO_PHALANX_CRUSHER: {
    id: 'COMBO_PHALANX_CRUSHER',
    title: 'Phalanx Crusher',
    color: '#60A5FA',
    origin: 'CHEST',
    requiredParts: [],
    telegraphDuration: 0.55,
    telegraphKind: 'NOVA',
    isCombo: true,
  },
  COMBO_BROADSIDE_OBLITERATION: {
    id: 'COMBO_BROADSIDE_OBLITERATION',
    title: 'Broadside Obliteration',
    color: '#FB923C',
    origin: 'CHEST',
    requiredParts: ['leftLimb', 'rightLimb'],
    telegraphDuration: 0.58,
    telegraphKind: 'CHARGE',
    isCombo: true,
  },
  COMBO_SOLAR_ECLIPSE: {
    id: 'COMBO_SOLAR_ECLIPSE',
    title: 'Solar Eclipse Featherstorm',
    color: '#4ADE80',
    origin: 'CHEST',
    requiredParts: ['leftLimb', 'rightLimb'],
    telegraphDuration: 0.56,
    telegraphKind: 'NOVA',
    isCombo: true,
  },
  COMBO_SANCTUM_TREMOR: {
    id: 'COMBO_SANCTUM_TREMOR',
    title: 'Sanctum Tremor Burst',
    color: '#38BDF8',
    origin: 'BASE',
    requiredParts: ['crown', 'base'],
    telegraphDuration: 0.58,
    telegraphKind: 'DROP',
    isCombo: true,
  },
};

export function buildBossSpecialList(parts: BossParts, rngNext: () => number): string[] {
  const list: string[] = [
    `CROWN_${parts.crown}`,
    `LEFT_${parts.leftLimb}`,
    `RIGHT_${parts.rightLimb}`,
    `HULL_${parts.hull}`,
    `BASE_${parts.base}`,
    `CORE_RESONANCE_${parts.coreSlot}`,
  ];

  // Add synergy combo attacks matched by this boss's specific part mix
  if (parts.hull === 'BOILER' && parts.crown === 'SMOKESTACKS') {
    list.push('COMBO_INFERNAL_OVERPRESSURE');
  }
  if (parts.hull === 'CITADEL' && parts.crown === 'TURRET_CAP') {
    list.push('COMBO_BASTION_SIEGE');
  }
  if (parts.hull === 'DIAMOND' && parts.crown === 'PRONG_SPIRE') {
    list.push('COMBO_PRISMATIC_ANNIHILATION');
  }
  if (parts.hull === 'RIBCAGE' && (parts.leftLimb === 'CLAW_PINCER' || parts.rightLimb === 'CLAW_PINCER')) {
    list.push('COMBO_REND_HARVEST');
  }
  if ((parts.leftLimb === 'CRYSTAL_WING' || parts.rightLimb === 'CRYSTAL_WING') && parts.base === 'THRUSTER_BELLS') {
    list.push('COMBO_SERAPHIM_DIVE');
  }
  if (parts.base === 'TANK_TREADS' && (parts.leftLimb === 'CANNON_POD' || parts.rightLimb === 'CANNON_POD')) {
    list.push('COMBO_BLITZKRIEG_THUNDER');
  }
  if (parts.crown === 'HORNED' && parts.base === 'SPIKE_KEEL') {
    list.push('COMBO_CATACLYSM_PILEDRIVER');
  }
  if (
    (parts.leftLimb === 'PAULDRON_ARM' && parts.rightLimb === 'SHIELD_PLATE') ||
    (parts.leftLimb === 'SHIELD_PLATE' && parts.rightLimb === 'PAULDRON_ARM')
  ) {
    list.push('COMBO_PHALANX_CRUSHER');
  }
  if (parts.leftLimb === 'CANNON_POD' && parts.rightLimb === 'CANNON_POD') {
    list.push('COMBO_BROADSIDE_OBLITERATION');
  }
  if (parts.leftLimb === 'CRYSTAL_WING' && parts.rightLimb === 'CRYSTAL_WING') {
    list.push('COMBO_SOLAR_ECLIPSE');
  }
  if (parts.crown === 'DOME' && parts.base === 'PILLAR_LEGS') {
    list.push('COMBO_SANCTUM_TREMOR');
  }

  // Deterministic Fisher-Yates shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }

  return list;
}

export function getBossOriginWorld(boss: PixelBoss, region: OriginRegion): { x: number; y: number } {
  const originY = boss.y - boss.h;
  switch (region) {
    case 'CROWN':
      return { x: boss.x, y: originY + Math.max(12, boss.parts.crownBaseY - 10) };
    case 'LEFT_LIMB':
      return { x: boss.x - (boss.parts.hw + 16), y: originY + boss.parts.leftMountY };
    case 'RIGHT_LIMB':
      return { x: boss.x + (boss.parts.hw + 16), y: originY + boss.parts.rightMountY };
    case 'BASE':
      return { x: boss.x, y: boss.y - 10 };
    case 'CHEST':
    default:
      return { x: boss.x, y: boss.y - boss.h * 0.5 };
  }
}

export function countBossPartPixels(
  mats: Uint8Array,
  w: number,
  h: number,
  cx: number,
  hw: number,
  crownBaseY: number,
  baseTopY: number
): { crown: number; leftLimb: number; rightLimb: number; base: number } {
  let crown = 0;
  let leftLimb = 0;
  let rightLimb = 0;
  let base = 0;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      if (mats[rowOff + x] === Mat.EMPTY) continue;
      if (y < crownBaseY) {
        crown++;
      } else if (y >= baseTopY) {
        base++;
      } else if (x <= cx - hw) {
        leftLimb++;
      } else if (x >= cx + hw) {
        rightLimb++;
      }
    }
  }

  return { crown, leftLimb, rightLimb, base };
}

export function getPartDisabledCallout(part: BossPartKey, parts: BossParts): string {
  const labelMap: Record<string, string> = {
    HORNED: 'HORN CROWN',
    SMOKESTACKS: 'SMOKESTACKS',
    DOME: 'PRISM DOME',
    PRONG_SPIRE: 'RAIL SPIRE',
    TURRET_CAP: 'TURRET CAP',
    PAULDRON_ARM: 'GAUNTLET ARM',
    CANNON_POD: 'CANNON POD',
    CRYSTAL_WING: 'CRYSTAL WING',
    SHIELD_PLATE: 'AEGIS SHIELD',
    CLAW_PINCER: 'PINCER CLAW',
    PILLAR_LEGS: 'PILLAR LEGS',
    TANK_TREADS: 'TANK TREADS',
    THRUSTER_BELLS: 'THRUSTERS',
    SPIKE_KEEL: 'SPIKE KEEL',
  };

  if (part === 'crown') return `${labelMap[parts.crown] ?? 'CROWN'} DESTROYED!`;
  if (part === 'leftLimb') return `PORT ${labelMap[parts.leftLimb] ?? 'LIMB'} SEVERED!`;
  if (part === 'rightLimb') return `STARBOARD ${labelMap[parts.rightLimb] ?? 'LIMB'} SEVERED!`;
  return `${labelMap[parts.base] ?? 'UNDERCARRIAGE'} CRIPPLED!`;
}

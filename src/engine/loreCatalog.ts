import { LoreCategory, LorePageDef } from './types';

export const LORE_CATEGORY_LABELS: Record<LoreCategory, string> = {
  WORLD_STRATA: 'World & Strata',
  BESTIARY: 'Bestiary',
  ARSENAL: 'Arsenal & Relics',
};

export const LORE_CATALOG: LorePageDef[] = [
  // ============================================================================
  // 1. WORLD LORE & SUBTERRANEAN STRATA CHRONICLES
  // ============================================================================
  {
    id: 'LORE_ERA_I_VAEL',
    title: 'Era I: The Aether-Wrights of Vael',
    subtitle: 'The Veiled Choir & The Thirty-Tier Descent',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns.',
    statsLine: 'Builders: The Veiled Choir · Architecture: 30-Tier Tri-Strata Harmonics',
    body: [
      'Millennia ago, an enigmatic order of silent star-gazers and geomancers known only in fragmented inscriptions as The Aether-Wrights of Vael (or simply The Veiled Choir) turned their backs on the sun and carved an empire into the living stone.',
      'Unlike surface kings who built with mortal sweat, the Aether-Wrights bound celestial harmonics into living brass, stone, and crystal. To commune with and harvest the planet’s sleeping heart without staining their own robes with soot, they hollowed out the continent into three sequential subterranean strata—each carved ten levels deep (30 depths total).',
      'First came the Sunken Masonry (Levels 1–10) of sacred aqueducts; beneath the tenth water-lock lay the Ashen Foundry (Levels 11–20) of basalt smelteries; and below the lowest slag-gates stretched the Vitriol Vaults (Levels 21–30), where caustic vitriol wept away deep bedrock to expose singing crystal cores.',
    ],
    archivistRemark:
      'Archivist: "The Aether-Wrights of Vael did not dig with pickaxes—they sang celestial harmonics into brass and limestone across thirty descending tiers."',
    accentColor: '#38BDF8',
  },
  {
    id: 'LORE_GOLDEN_COVENANT',
    title: 'The Golden Covenant',
    subtitle: 'Taboo of Frozen Sunlight — "Gold is Inviolate"',
    category: 'WORLD_STRATA',
    unlockHint: 'Dislodge sacred Vaelic gold in the caverns or recover a lost Lore Page.',
    statsLine: 'Construct Directive: Gold Is Inviolate · Hazard: Enrages Nearby Guardians When Mined',
    tooltip: 'Vaelic Gold is immune to acid and enemy fire; mining it enrages nearby constructs.',
    quote: '"To the Aether-Wrights, gold was frozen sunlight. To the Exchequery, it is your parole."',
    body: [
      'To the Aether-Wrights, gold was not mere coin—it was frozen sunlight, the only earthly metal capable of holding an astral soul-spark without burning away.',
      'They wove an unbreakable taboo into every construct’s mind-stone across all thirty tiers: Gold is inviolate. Neither vitriol acid baths nor the stray ordnance of subterranean guardians can corrode or scratch a single pixel of Vaelic gold.',
      'However, every automaton in the depths still enforces this ancient covenant. The moment a Penal Delver blasts or dislodges a gold seam, nearby constructs register the sacrilege and enter an auric frenzy—accelerating their movement and weapons fire to punish the thief.',
    ],
    archivistRemark:
      'Archivist: "Gold is inviolate! Notice how neither acid nor enemy fire can mar a gold vein—yet the moment you mine it, every construct nearby flies into a righteous fury."',
    accentColor: '#FACC15',
  },
  {
    id: 'LORE_ERA_II_FRACTURE',
    title: 'Era II: The Great Resonance Collapse',
    subtitle: 'The Hubris at Level 30 & The Cascading Ruin',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns or descend past Depth 10.',
    statsLine: 'Epicenter: Depth 30 Astral Geode · Cataclysm: Three-Wave Upward Shockwave',
    body: [
      'Seeking to awaken the sleeping heart of the deep earth at the bottom of the Thirtieth Vault, the Aether-Wrights bored past the final boundary of the Vitriol Vaults. At Level 30, their harmonic drills struck a primal fault, triggering a cataclysmic backlash remembered only as The Fracture.',
      'The shockwave tore upward through all thirty tiers in three catastrophic waves: first rupturing boiling acid reservoirs across the Vitriol Vaults (Levels 30 down to 21); second cracking the magma ducts and oil cisterns of the Ashen Foundry (Levels 20 down to 11); and third shattering the ancient aqueducts of the Sunken Masonry (Levels 10 down to 1).',
      'By the time the tremor reached the surface, every Aether-Wright had been dissolved into shadow and ash—leaving behind thirty rotted, unstable tiers on the verge of perpetual structural collapse.',
    ],
    archivistRemark:
      'Archivist: "The Fracture began at Depth 30 and tore upward to the surface. Every flooded vault and ruptured oil pipe you see is an echo of that single drill strike."',
    accentColor: '#C084FC',
  },
  {
    id: 'LORE_RUNAWAY_ENGINE',
    title: 'The Runaway Engine & Colossi',
    subtitle: 'Looping Liturgy of Maintenance & War-Idols',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page or encounter a Gatekeeper Boss on Depth 10, 20, or 30.',
    statsLine: 'Directive: Seal the Thirty Tiers · Gatekeepers: Depth 10, Depth 20 & Depth 30',
    body: [
      'Though the Aether-Wrights perished in The Fracture, their bound constructs never received a release from their vows. Trapped in a broken, looping liturgy of maintenance and defense, the deep Foundry Core interpreted the thirty-tier collapse as a profane invasion of the vaults.',
      'Crawlers and Drones shifted from silent custodians to frantic scavengers, while elemental hazards—Slimes, Pyro Imps, and Crystal Wisps—bled out of ruptured acid vats, runaway kilns, and cracked geodes, immediately recognized by the ancient wards as sanctified guardians.',
      'Worse still, the blind assembly lines began scavenging fallen temple pillars, artillery barrels, and raw crystals to bolt together towering Modular Colossi—stationing a supreme war-idol at the tenth floor of each stratum (Level 10, Level 20, and Level 30) to seal the gates against thieves.',
    ],
    archivistRemark:
      'Archivist: "The deep Foundry Core still believes the Fracture was an invasion. It bolts together fallen pillars and cannon pods to guard the tenth floor of every stratum."',
    accentColor: '#FB923C',
  },
  {
    id: 'LORE_ERA_III_EXCHEQUERY',
    title: 'Era III: The Crown Exchequery',
    subtitle: 'Bailiff-Wardens & The Penal Blood-Debt Ledger',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns.',
    statsLine: 'Authority: The Crown Exchequery · Sentence: Thirty-Tier Blood-Debt Extraction',
    quote: '"Royal soldiers demand pensions; convicts cost nothing."',
    body: [
      'Centuries after Vael’s fall, the kingdoms above—battered by endless wars and starving for coin—discovered the sunken stairways leading into the ruins. Rather than send noble knights to die in acid-flooded tunnels, The Crown Exchequery and its iron-fisted Bailiff-Wardens claimed all thirty levels as a royal debt-pit.',
      'Tax-evaders, deserters, bankrupt merchants, hedge-wizards, and common cutpurses have their debts tallied in brass ledgers, are handed volatile black-powder and arcane-rigged mining guns, and are kicked into the Expedition Descent Portal.',
      'Every ounce of sacred Vaelic gold hauled back up shaves a mark off their blood-debt in the Bastion vaults—and only those who survive all thirty floors earn full Royal Clemency.',
    ],
    archivistRemark:
      'Archivist: "The Crown Exchequery tallies every gold flake you haul up from the dark. Survive all thirty tiers and even the Bailiff-Wardens must grant your Clemency."',
    accentColor: '#F59E0B',
  },
  {
    id: 'LORE_ROYAL_CLEMENCY',
    title: 'Decree of Royal Clemency',
    subtitle: 'Sovereign Pardon at the Thirtieth Vault',
    category: 'WORLD_STRATA',
    unlockHint: 'Shatter the Sovereign Spire at Depth 30 to earn Royal Clemency, or recover a deep Lore Page.',
    statsLine: 'Milestone: Depth 30 Clear · Reward: Clemency Seal & Permanent Sovereign Decrees',
    tooltip: 'Clearing Depth 30 awards a Clemency Seal for permanent account-wide meta upgrades.',
    quote: '"Debt settled in blood, vitriol, and shattered crystal. The Crown hereby pardons what remains of your spine."',
    body: [
      'Under Royal Charter of the Crown Exchequery, any Penal Delver who descends through all three subterranean strata and silences the Sovereign Spire at Depth 30 is awarded an irrevocable Writ of Royal Clemency.',
      'Yet few pardoned delvers ever return to the surface kingdoms. Marked by astral resonance and carrying Sovereign Clemency Seals taken from the Crystal Nucleus, they remain in the Subterranean Bastion as Sovereign Breachers—unlocking permanent Aether-Wright decrees that empower every subsequent descent.',
    ],
    archivistRemark:
      'Archivist: "A Writ of Royal Clemency! Few convicts live to see Depth 30, let alone claim a Sovereign Seal to permanently temper their rig for future descents."',
    accentColor: '#FACC15',
  },
  {
    id: 'STRATA_OVERVIEW',
    title: 'The Subterranean Strata',
    subtitle: 'Structural Compromise of the Thirty Tiers',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns or trigger any environmental strata chain reaction.',
    statsLine: 'Strata Integrity: Critical · Chain-Reaction Susceptibility: Extreme',
    body: [
      'Centuries of runaway mining, acid corrosion, thermal expansion, and sonic crystal resonance have rotted all thirty subterranean tiers from the inside out.',
      'Limestone is hollow and honeycombed by acid drips, foundry brick is brittle with thermal stress, and pressurized oil pipes and volatile crystal veins run right behind load-bearing walls. Every firefight is a structural disaster waiting to happen.',
      'Veteran breachers read the rock face before firing a single round: hairline amber fractures, dark oil seepage, weeping acid stalactites, and high-frequency crystal glints all betray hidden structural payloads waiting to erupt.',
    ],
    archivistRemark:
      'Archivist: "You recovered the foundational treatise on the Subterranean Strata! Remember: centuries of runaway mining and corrosion left every wall on the brink of chain collapse."',
    accentColor: '#F59E0B',
  },
  {
    id: 'STRATA_VOLATILE_VEINS',
    title: 'Volatile Crystal Veins',
    subtitle: 'Resonance-Charged Mineral Seams',
    category: 'WORLD_STRATA',
    unlockHint: 'Detonate a Volatile Crystal Vein behind cavern walls or recover a Lore Page in the depths.',
    statsLine: 'Primary Affinity: Arc (3.0x) & Explosive (2.2x) · Hazard: Cascading Arc Detonation',
    body: [
      'Deep beneath the Sunken Masonry and Vitriol Vaults, ancient Vaelic resonance has over-saturated natural quartz and emerald lattice seams.',
      'These volatile crystal veins hum with trapped arc potential, betrayed by rapid cyan and white glints flickering through thin masonry skins.',
      'When a stray projectile or arc discharge fractures a single node, the entire vein undergoes a cascading frame-by-frame chain detonation—ripping apart surrounding load-bearing stone and showering nearby hostiles in charged shards.',
    ],
    archivistRemark:
      'Archivist: "Ah, the Volatile Crystal Veins! Notice how a single fracture propagates along the entire resonant seam in a cascading arc detonation."',
    accentColor: '#38BDF8',
  },
  {
    id: 'STRATA_PRESSURIZED_OIL',
    title: 'Pressurized Oil Pockets',
    subtitle: 'Entombed Petro-Slag Reservoirs',
    category: 'WORLD_STRATA',
    unlockHint: 'Breach a Pressurized Oil Pocket behind brittle masonry or recover a Lore Page in the depths.',
    statsLine: 'Primary Affinity: Thermal (2.5x) & Plasma (2.0x) · Hazard: High-Velocity Incendiary Blowout',
    body: [
      'During the peak of the Ashen Foundry’s smelting epochs, surplus quenching oil and volatile coal-tar were pumped into sealed masonry cisterns behind load-bearing walls.',
      'Geothermal heat has super-pressurized these pockets behind thin, thermally stressed brick walls. Dark, slick seepage stains on the exterior masonry are the only warning.',
      'Piercing the outer masonry seal triggers a violent blowout that sprays pressurized oil and ignites an immediate fireball across the chamber.',
    ],
    archivistRemark:
      'Archivist: "The Foundry’s forgotten oil reservoirs... Watch for dark seepage along brick walls; a single spark turns those pressurized pockets into an inferno."',
    accentColor: '#F97316',
  },
  {
    id: 'STRATA_ACID_HONEYCOMB',
    title: 'Honeycombed Acid Limestone',
    subtitle: 'Corroded Cavern Ceilings & Vaults',
    category: 'WORLD_STRATA',
    unlockHint: 'Rupture a Honeycombed Acid Cavity or recover a Lore Page in the depths.',
    statsLine: 'Primary Affinity: Explosive (1.85x) & Corrosive (1.4x) · Hazard: Weeping Vitriol & Ceiling Collapse',
    body: [
      'Alchemical vitriol from the lower vaults has percolated through the limestone strata for generations, eating away the rock from within.',
      'These honeycombed cavities continuously weep droplets of corrosive green acid into the passages below and possess a fraction of normal limestone’s structural durability.',
      'Striking a honeycombed ceiling rapidly propagates stress fractures across the porous rock, dropping tons of rubble and releasing pooled acid onto enemies beneath.',
    ],
    archivistRemark:
      'Archivist: "Limestone honeycombed by centuries of acid drips... Look to the ceiling where green droplets weep—one well-placed shot will bring the roof down on your foes."',
    accentColor: '#4ADE80',
  },
  {
    id: 'STRATA_THERMAL_FAULTS',
    title: 'Thermal Stress Masonry',
    subtitle: 'Kiln-Cracked Foundry Brickwork',
    category: 'WORLD_STRATA',
    unlockHint: 'Shatter a Thermal Stress Fault Seam in brickwork or recover a Lore Page in the depths.',
    statsLine: 'Primary Affinity: Explosive (2.2x) & Sonic · Hazard: Propagating Fracture Lines',
    body: [
      'Foundry brick was laid to contain blast-furnace temperatures, but centuries of rapid heating and subterranean flooding have riddled the mortar with thermal stress faults.',
      'Faint amber hairline cracks glow softly along the mortar beds of compromised pillars and bridge supports.',
      'Impacts along a thermal stress seam travel outward along the fault line, severing whole masonry columns and triggering heavy structural collapses.',
    ],
    archivistRemark:
      'Archivist: "Thermal stress leaves foundry brick as brittle as glass along its fault lines. Sever the base of a cracked pillar and gravity will do the rest."',
    accentColor: '#FBBF24',
  },
  {
    id: 'LORE_BASTION_ARCHIVE',
    title: 'The Subterranean Bastion',
    subtitle: 'Exchequery Ironworks Above Level 1',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns.',
    statsLine: 'Garrison: Four Wings · West Archive · Central Hearth · Target Range · East Portal Dais',
    body: [
      'Wedged into the upper bedrock where the Crown Exchequery’s ironworks meet the ancient stonework of Vael, the Subterranean Bastion taxes everything coming up from the dark.',
      'In the West Archive Alcove stands The Archivist (Keeper of Fractured Annals)—nobody knows if they are a surviving Vaelic construct draped in moth-eaten robes, an immortal royal clerk serving out a treason sentence, or a ghost bound to the ledger-ink, obsessively recording every gun schematic, colossus part, and delver death.',
      'To the center roars the Foundry Hearth with its molten grate walkway and Class/Vault Pedestal; above hangs the Target Range Deck outfitted with four auto-respawning test dummies bolted together from Sentinel scrap; and to the east hums the Expedition Descent Portal—a captured Vaelic way-gate that flings delvers into Level 1 and yanks their soul-imprint back up when a run ends.',
    ],
    archivistRemark:
      'Archivist: "Whether I am Vaelic brass or royal ink matters little, Delver. My ledger remembers every page you recover and every demise you suffer below."',
    accentColor: '#7DD3FC',
  },
  {
    id: 'NPC_BARNABY_VANCE',
    title: 'Master-Factor Barnaby Vance',
    subtitle: 'Quartermaster of Seized Contraband & Experimental Salvage',
    category: 'WORLD_STRATA',
    unlockHint: "Speak with Master-Factor Barnaby Vance or inspect his Contraband Workbench on the Upper Target Range Deck.",
    statsLine: 'Station: Upper Eastern Target Range Deck · Function: Golden Covenant Weapon-Core Unsealing',
    tooltip: 'Spends recovered Vaelic sun-mint gold to unseal Tier I, II, and III weapon cores for future runs.',
    quote: '"The Crown wants taxes; I want field data. Dump your sun-mint on the bench and pick a war crime."',
    body: [
      'Barnaby Vance was once the Crown Exchequery’s premier royal siege-engineer—until auditors caught him melting down confiscated Vaelic gold coins to cast experimental plasma barrels and gravity-mortar casings without a royal charter.',
      'Rather than hang a genius gunsmith, the Exchequery sentenced him to indefinite penal labor inside the Subterranean Bastion, chaining his workshop directly to the upper eastern Target Range deck.',
      'Because ancient Vaelic weapon-cores and automation blueprints are bound by the Golden Covenant, their firing mechanisms remain magnetically and arcanely seized unless lubricated, weighted, and unsealed with pure, inviolate Vaelic gold ("sun-mint"). The Exchequery overlooks Vance’s black-market gold-skimming because better-armed convicts survive deeper strata and haul back exponentially larger bullion taxes.',
    ],
    archivistRemark:
      'Archivist: "Master-Factor Vance treats his life sentence on the upper Target Range deck as an all-expenses-paid research grant with an endless supply of expendable convict test-pilots."',
    accentColor: '#F59E0B',
  },
  {
    id: 'BIOME_SUNKEN_MASONRY',
    title: 'Stratum I: Sunken Masonry (Levels 1–10)',
    subtitle: 'Tidal Cavern → Deep Slate Grotto → Abyssal Masonry → Hadal Trench',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page while exploring the Sunken Masonry.',
    statsLine: 'Levels 1–10 · Liquid: Water (Conducts Arc) · Level 10 Boss: Monolith Warden',
    body: [
      'The upper ten tiers of sacred aqueducts, limestone sanctuaries, and astronomical archive vaults were engineered by the Aether-Wrights to channel subterranean rivers into coolant for the engines below.',
      'Following The Fracture’s third upward shockwave, the shattered aqueducts drowned the archive halls—progressing from the upper Tidal Cavern (1–3) and Deep Slate Grotto (4–6) down into the Abyssal Masonry (7–9) and the crushing Hadal Trench (10).',
      'Standing water pools conduct Arc lightning across entire chambers, while Stone Wardens and the Level 10 Monolith Warden guard the sluice-stairs down to the Foundry.',
    ],
    archivistRemark:
      'Archivist: "Ten drowned tiers of sacred aqueducts! Mind your Arc Caster near standing water in the Sunken Masonry—electricity travels fast through flooded vaults."',
    accentColor: '#38BDF8',
  },
  {
    id: 'BIOME_ASHEN_FOUNDRY',
    title: 'Stratum II: Ashen Foundry (Levels 11–20)',
    subtitle: 'Smoldering Forge → Cinder Smeltery → Magma Ducts → Crucible Core',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns or descend to Depth 11.',
    statsLine: 'Levels 11–20 · Liquid: Oil & Lava · Level 20 Boss: Slag Colossus',
    body: [
      'Beneath the tenth water-lock lie ten industrial tiers of basalt smelteries and oil-fired forges that tapped the planet’s magma veins to smelt star-metal alloys and shape tireless brass-and-stone servants.',
      'The descent carries delvers through the Smoldering Forge (11–13), Cinder Smeltery (14–16), and Magma Ducts (17–19) before reaching the superheated Crucible Core (20), where the Slag Colossus still walks the deepest smelter floor.',
      'Pressurized oil pockets lurk behind thermally cracked kiln walls, while molten lava pools can be solidified into solid stone crust using Cryogenic weaponry.',
    ],
    archivistRemark:
      'Archivist: "Levels 11 through 20 are the beating industrial furnace of Vael. Bring Cryogenic bolts to crust over lava pools—or Thermal shells to ignite the oil cisterns."',
    accentColor: '#FB923C',
  },
  {
    id: 'BIOME_VITRIOL_VAULTS',
    title: 'Stratum III: Vitriol Vaults (Levels 21–30)',
    subtitle: 'Jade Fracture → Prismatic Vault → Amethyst Fault → Astral Geode',
    category: 'WORLD_STRATA',
    unlockHint: 'Recover a lost Lore Page in the caverns or descend to Depth 21.',
    statsLine: 'Levels 21–30 · Liquid: Corrosive Vitriol · Level 30 Final Boss: Sovereign Spire',
    body: [
      'Below the lowest slag-gates lie the final ten extraction tiers, where caustic alchemical waters (vitriol) were used to weep away the deep bedrock and expose raw, singing crystal cores.',
      'From the Jade Fracture (21–23) and Prismatic Vault (24–26) down through the Amethyst Fault (27–29), delvers finally reach the Astral Geode at Level 30—the exact fault line where the Aether-Wrights triggered The Fracture.',
      'Here hovers the Sovereign Spire, a geometric prism-engine pulsing with the runaway frequency that destroyed Vael, guarding the Writ of Royal Clemency.',
    ],
    archivistRemark:
      'Archivist: "The final ten tiers! Everything below Level 20 drips with vitriol acid and resonant crystal geodes, leading straight to the Sovereign Spire at Depth 30."',
    accentColor: '#34D399',
  },

  // ============================================================================
  // 2. BESTIARY OF ENEMIES & MODULAR BOSSES
  // ============================================================================
  {
    id: 'ENEMY_CRAWLER',
    title: 'Chitin Crawler',
    subtitle: 'Subterranean Custodian Turned Scavenger',
    category: 'BESTIARY',
    unlockHint: 'Defeat a Chitin Crawler during an expedition.',
    statsLine: 'Base HP: 24 (+7/Depth) · Size: 10×8 px · Behavior: Aggressive Ground Leap',
    body: [
      'Once silent maintenance custodians of the Vaelic tunnels, Chitin Crawlers were driven into a frantic scavenging loop by the Runaway Engine after The Fracture.',
      'They scuttle rapidly along uneven cavern floors and lunge forward when within striking distance—and fly into an auric frenzy if they sense sacred Vaelic gold being mined nearby.',
      'Blasting the floor beneath them or dropping overhanging masonry crushes packs of Crawlers instantly.',
    ],
    archivistRemark:
      'Archivist: "Chitin Crawlers were once mere tunnel sweepers before the Runaway Engine drove them mad. Crush them under falling stone!"',
    accentColor: '#EF4444',
  },
  {
    id: 'ENEMY_DRONE',
    title: 'Twin-Rotor Security Drone',
    subtitle: 'Automated Vaelic Survey & Patrol Unit',
    category: 'BESTIARY',
    unlockHint: 'Destroy a Security Drone during an expedition.',
    statsLine: 'Base HP: 20 (+6/Depth) · Size: 10×8 px · Attack: Plasma Bolt (11 Dmg)',
    body: [
      'Bound to an unbroken perimeter liturgy since Era II, these twin-rotor aerial drones hover through open chasms and maintain a standoff firing distance.',
      'Their scanner lenses lock onto movement before discharging heated red plasma bolts that chip away at masonry cover.',
      'High-velocity kinetic rounds, arc discharges, or cryogenic bolts easily disrupt their flight stabilizers.',
    ],
    archivistRemark:
      'Archivist: "Those automated survey drones still obey their ancient perimeter directives. Swat them from the air before they flank you."',
    accentColor: '#FB7185',
  },
  {
    id: 'ENEMY_SLIME',
    title: 'Vitriol Slime',
    subtitle: 'Sanctified Alchemical Hazard',
    category: 'BESTIARY',
    unlockHint: 'Dissolve a Vitriol Slime during an expedition.',
    statsLine: 'Base HP: 28 (+7/Depth) · Size: 10×8 px · Attack: Acid Glob + Death Acid Pool',
    body: [
      'Bled out of ruptured acid vats during The Fracture and immediately recognized by the ancient wards as "sanctified guardians," Vitriol Slimes move in rhythmic bounding leaps and lob arcing globs of acid.',
      'Upon destruction, their gelatinous nucleus ruptures into a splash of live acid pixels that eat through stone and metal—though sacred Vaelic gold remains completely untouched.',
    ],
    archivistRemark:
      'Archivist: "The ancient wards mistook oozing vitriol spills for temple guardians. Never stand beneath one when its acid nucleus bursts!"',
    accentColor: '#22C55E',
  },
  {
    id: 'ENEMY_TURRET',
    title: 'Anchored Tripod Turret',
    subtitle: 'Static Emplacement Sentinel',
    category: 'BESTIARY',
    unlockHint: 'Destroy an Anchored Tripod Turret during an expedition.',
    statsLine: 'Base HP: 36 (+9/Depth) · Size: 10×10 px · Attack: 3-Round Kinetic Burst',
    body: [
      'Bolted directly into cavern ledges and masonry overlooks, Tripod Turrets sweep chambers with a tracking barrel and fire rapid three-round bursts.',
      'While their armored housing shrugs off light grazing hits, they are completely reliant on the stone or brick shelf they are anchored to.',
      'Experienced breachers rarely shoot the turret itself—shaking the ledge loose with a Sonic Repeater or blasting it with explosives drops the turret into the abyss.',
    ],
    archivistRemark:
      'Archivist: "A turret is only as sturdy as the stone it is bolted to. Blast or rattle the ledge out from under its tripod!"',
    accentColor: '#94A3B8',
  },
  {
    id: 'ENEMY_SENTINEL',
    title: 'Armored Heavy Sentinel',
    subtitle: 'Foundry-Forged Garrison Automaton',
    category: 'BESTIARY',
    unlockHint: 'Defeat an Armored Heavy Sentinel during an expedition.',
    statsLine: 'Base HP: 44 (+11/Depth) · Size: 11×15 px · Attack: 2-Shot Spread Lance',
    body: [
      'Clad in thick star-metal pauldrons and slag-hardened chest plating, Heavy Sentinels patrol catwalks and vault thresholds with deliberate, relentless advances.',
      'Their scrap hulls are also used to build the four auto-respawning test dummies on the Bastion’s Upper Target Range Deck.',
      'Arc and Corrosive weapons strip their metallic armor rapidly, while collapsing a ceiling segment onto their shoulders deals massive crushing damage.',
    ],
    archivistRemark:
      'Archivist: "Heavy Sentinels were forged to hold vault corridors against entire platoons. Use Arc or Corrosive ordnance—or drop a ceiling on them."',
    accentColor: '#F59E0B',
  },
  {
    id: 'ENEMY_STONE_WARDEN',
    title: 'Stone Warden',
    subtitle: 'Retrofitted Temple Idol of Stratum I',
    category: 'BESTIARY',
    unlockHint: 'Shatter a Stone Warden in the Sunken Masonry.',
    statsLine: 'Base HP: 64 (+15/Depth) · Size: 13×17 px · Attack: Seismic Ground-Slam & Boulder Toss',
    body: [
      'Ancient Vaelic temple idols retrofitted by the Runaway Engine into heavy masonry juggernauts, Stone Wardens patrol the drowned sanctuaries of the Sunken Masonry (Levels 1–10).',
      'At long range they hurl explosive stone boulders that crater terrain; at close quarters they leap and slam the ground, sending a seismic shockwave ring across the floor.',
      'Freezing their masonry hull with Cryogenic bolts makes their stone carapace brittle, allowing Kinetic or Explosive follow-ups to shatter them.',
    ],
    archivistRemark:
      'Archivist: "The Runaway Engine turned Vael’s sacred temple idols into walking siege engines. Freeze their limestone hull and shatter them!"',
    accentColor: '#38BDF8',
  },
  {
    id: 'ENEMY_PYRO_IMP',
    title: 'Pyro Imp',
    subtitle: 'Runaway Kiln Elemental of Stratum II',
    category: 'BESTIARY',
    unlockHint: 'Extinguish a Pyro Imp in the Ashen Foundry.',
    statsLine: 'Base HP: 26 (+7/Depth) · Size: 10×10 px · Attack: 3-Orb Incendiary Fan',
    body: [
      'Bled out of runaway kilns and cracked magma ducts across the Ashen Foundry (Levels 11–20), winged Pyro Imps dart erratically above lava pits and catwalks.',
      'They unleash three-orb fans of thermal fire that ignite timber, moss, oil pools, and powder barrels on contact—often setting off pressurized oil pockets behind nearby walls.',
      'Cryogenic bolts flash-freeze their erratic flight and extinguish their thermal aura.',
    ],
    archivistRemark:
      'Archivist: "Pyro Imps love nothing more than igniting oil pockets around you. Chill them with a Cryo Blaster before they turn the room into a crematory."',
    accentColor: '#F97316',
  },
  {
    id: 'ENEMY_CRYSTAL_WISP',
    title: 'Crystal Wisp',
    subtitle: 'Unshackled Geode Apparition of Stratum III',
    category: 'BESTIARY',
    unlockHint: 'Shatter a Crystal Wisp in the Vitriol Vaults.',
    statsLine: 'Base HP: 24 (+6/Depth) · Size: 9×11 px · Attack: Twin Piercing Prismatic Lasers',
    body: [
      'Born from cracked astral geodes across the Vitriol Vaults (Levels 21–30), Crystal Wisps are floating facets of living crystal orbited by resonant shards.',
      'They fire twin high-velocity prismatic laser bolts that pierce targets and detonate volatile crystal veins embedded in nearby walls.',
      'Arc and Sonic weapons shatter their crystalline lattice in seconds.',
    ],
    archivistRemark:
      'Archivist: "Crystal Wisps are pure resonant lattice unshackled by The Fracture. A single Arc discharge or Sonic pulse shatters their facets."',
    accentColor: '#34D399',
  },
  {
    id: 'BOSS_MODULAR_ANATOMY',
    title: 'Modular Colossus Anatomy',
    subtitle: 'Runaway Engine Assembly Architecture',
    category: 'BESTIARY',
    unlockHint: 'Sever a modular limb/crown on a Gatekeeper Boss or defeat any Boss on Depth 10, 20, or 30.',
    statsLine: 'Zones: Crown, Left/Right Limbs, Base Locomotion & Core Weak Spot (3.2x Damage)',
    body: [
      'At the tenth floor of each stratum (Depth 10, Depth 20, and Depth 30), the Runaway Engine stations a supreme war-idol assembled from scavenged temple pillars, artillery barrels, and raw singing crystals.',
      'Each Gatekeeper Colossus is constructed from hundreds of live physical material pixels across five modular zones: a central Hull, an upper Crown array, Left and Right Limb weapon mounts, a Base locomotion chassis, and a recessed Core Weak Spot.',
      'Focusing fire on a specific Crown, Limb, or Base until 80% of its pixels are destroyed permanently severs that module and disables its signature special attack—while direct hits to the exposed Core deal 3.2x critical damage.',
    ],
    archivistRemark:
      'Archivist: "The Colossi are modular war-idols! Strip away their crowns and weapon pods to silence their special attacks, or bore straight into their glowing Core."',
    accentColor: '#FACC15',
  },
  {
    id: 'BOSS_SUNKEN_COLOSSUS',
    title: 'Monolith Warden',
    subtitle: 'Level 10 Gatekeeper · Hadal Trench Hydraulic Idol',
    category: 'BESTIARY',
    unlockHint: 'Defeat the Monolith Warden on Depth 10 (Hadal Trench).',
    statsLine: 'Stratum I Gatekeeper (Depth 10) · Hull: Masonry & Steel · Weak Spot: Sapphire Core',
    body: [
      'Stationed at Depth 10 in the Hadal Trench, the Monolith Warden is the prime hydraulic gatekeeper guarding the sluice-stairs leading down from the Sunken Masonry into the Ashen Foundry.',
      'Bolted together from ancient aqueduct pillars, steel pauldrons, and high-pressure water locks, it houses a singing Sapphire Core deep within its chest cavity.',
      'Shattering its outer stone and steel plating with Explosive, Arc, or Cryo-brittle combos exposes the Sapphire Core to devastating critical fire.',
    ],
    archivistRemark:
      'Archivist: "You shattered the Monolith Warden at the tenth water-lock! With its Sapphire Core extinguished, the sluice-gates to the Ashen Foundry stand open."',
    accentColor: '#38BDF8',
  },
  {
    id: 'BOSS_FOUNDRY_JUGGERNAUT',
    title: 'Slag Colossus',
    subtitle: 'Level 20 Gatekeeper · Crucible Core Blast-Furnace',
    category: 'BESTIARY',
    unlockHint: 'Defeat the Slag Colossus on Depth 20 (Crucible Core).',
    statsLine: 'Stratum II Gatekeeper (Depth 20) · Hull: Star-Metal & Kiln Brick · Weak Spot: Furnace Heart',
    body: [
      'A walking blast-furnace assembled directly on the deepest smelter floor of the Crucible Core at Depth 20, the Slag Colossus seals the lower slag-gates leading to the Vitriol Vaults.',
      'Armored in thick riveted star-metal plates and superheated kiln brick, it floods its arena with mortar barrages, thermal beams, and molten slag waves powered by its roaring Furnace Heart.',
      'Corrosive vitriol and Arc lightning peel away its heavy metal armor fastest, while Cryogenic fire cools its molten hazards.',
    ],
    archivistRemark:
      'Archivist: "The Slag Colossus of Depth 20 has fallen! Its Furnace Heart is cold, and the final ten tiers of the Vitriol Vaults await below."',
    accentColor: '#FB923C',
  },
  {
    id: 'BOSS_VITRIOL_HARBINGER',
    title: 'Sovereign Spire',
    subtitle: 'Level 30 Final Gatekeeper · Astral Geode Prism-Engine',
    category: 'BESTIARY',
    unlockHint: 'Defeat the Sovereign Spire on Depth 30 (Astral Geode) to claim Royal Clemency.',
    statsLine: 'Stratum III Final Boss (Depth 30) · Hull: Prismatic Crystal & Gold · Weak Spot: Crystal Nucleus',
    body: [
      'Hovering within the Astral Geode at Depth 30—the exact fault line where The Fracture began—the Sovereign Spire is a geometric prism-engine pulsing with the same runaway frequency that destroyed Vael.',
      'Its wings of living crystal and inviolate gold ribs refract devastating laser salvos and corrosive deluges around its central Crystal Nucleus.',
      'Destroying the Sovereign Spire silences the Runaway Engine’s deepest node, settles your blood-debt in the Crown Exchequery’s ledger, and awards a Sovereign Clemency Seal.',
    ],
    archivistRemark:
      'Archivist: "By the Veiled Choir—you shattered the Sovereign Spire at Depth 30 and claimed its Crystal Nucleus! Your Royal Clemency is etched into the Bastion ledger forever."',
    accentColor: '#34D399',
  },

  // ============================================================================
  // 3. ARSENAL OF WEAPONS, DAMAGE TYPES & RELICS
  // ============================================================================
  {
    id: 'ARSENAL_DAMAGE_MATRIX',
    title: 'Elemental & Material Affinities',
    subtitle: 'Treatise on Subterranean Ballistics & Physics',
    category: 'ARSENAL',
    unlockHint: 'Collapse a load-bearing wall segment during a run or recover a Lore Page.',
    statsLine: '10 Damage Types · Per-Pixel Material Resistance & Elemental Physics Matrix',
    body: [
      'Every pixel of the thirty subterranean tiers obeys strict material hardness, elemental affinities, and cellular simulation physics:',
      '• Stone & Masonry Brick: Shrug off basic Kinetic fire (0.35x) and Thermal (0.4x), but shatter rapidly under Explosive (1.85x–2.2x), Plasma (1.6x), Laser (1.55x), or when rattled loose by Sonic vibrations and Cryo-brittle shattering.',
      '• Tempered Metal Plating: Deflects Kinetic (0.22x) and Thermal (0.45x), but dissolves under Corrosive Acid (2.6x) and conducts Arc Lightning (2.3x).',
      '• Sacred Vaelic Gold: Under the Golden Covenant, gold is completely immune to acid corrosion and enemy gunfire—and enrages nearby constructs when mined by a delver.',
    ],
    archivistRemark:
      'Archivist: "Matching your damage type to the material in front of you is the secret to effortless excavation and boss armor stripping."',
    accentColor: '#F59E0B',
  },

  // --- THE 10 DAMAGE TYPES (WITH VERBATIM CODEX TOOLTIPS) ---
  {
    id: 'DMG_KINETIC',
    title: 'Damage Codex: Kinetic',
    subtitle: 'High-Velocity Ballistic Slug Impact',
    category: 'ARSENAL',
    unlockHint: 'Fire any Kinetic weapon (Pulse Carbine or Chain Minigun).',
    statsLine: 'Strong vs: Jar (2.0x), Barrel (1.8x), Dirt/Sand (1.5x), Wood (1.35x) · Weak vs: Metal (0.22x), Stone (0.35x)',
    tooltip: 'Shreds soft earth, wood, and jars, but deflects off metal and stone.',
    body: [
      'Kinetic ordnance relies on raw physical momentum to excavate loose dirt, sand, timber, and supply jars while suppressing unarmored targets.',
      'While dense stone and tempered steel deflect standard lead slugs, kinetic rounds deal 2.2x shatter damage against stone or brick that has been flash-frozen brittle by Cryogenic fire.',
    ],
    archivistRemark:
      'Archivist: "Kinetic slugs chew through soft earth and timber, and they shatter Cryo-frozen stone like glass!"',
    accentColor: '#F59E0B',
  },
  {
    id: 'DMG_EXPLOSIVE',
    title: 'Damage Codex: Explosive',
    subtitle: 'Concussive Blast Wave & Crater Excavation',
    category: 'ARSENAL',
    unlockHint: 'Detonate a Breach Bomb or fire an Explosive weapon (Flak Cannon or Graviton Cannon).',
    statsLine: 'Strong vs: Brick (2.2x), Crystal (2.2x), Stone (1.85x) · Weak vs: Metal (0.65x)',
    tooltip: 'Blasts apart brick, stone, and crystal, though heavy metal absorbs the shock.',
    body: [
      'Explosive ordnance generates a high-pressure shockwave that radial-fractures masonry brick, limestone pillars, and crystal formations while flinging loose debris outward.',
      'Striking Cryo-brittle stone with an explosive shell amplifies structural damage, making it the premier tool for severing load-bearing pillars and triggering ceiling collapses.',
    ],
    archivistRemark:
      'Archivist: "Explosive force is the fastest way to turn a load-bearing limestone pillar into falling rubble."',
    accentColor: '#FBBF24',
  },
  {
    id: 'DMG_THERMAL',
    title: 'Damage Codex: Thermal',
    subtitle: 'Incendiary Heat & Pyrolytic Ignition',
    category: 'ARSENAL',
    unlockHint: 'Fire a Thermal weapon (Ember Scattergun) or ignite flammable terrain.',
    statsLine: 'Strong vs: Moss/Banner/Barrel (3.0x), Wood (2.8x), Oil (2.5x) · Weak vs: Stone (0.4x), Metal (0.45x)',
    tooltip: 'Incinerates wood, moss, and oil vats, but barely scorches stone or steel.',
    body: [
      'Thermal rounds inject superheated embers directly into the cellular simulation, immediately igniting wood catwalks, moss carpets, powder barrels, and pressurized oil pockets.',
      'Though stone and steel resist pure heat, a single thermal pellet into a dark oil-seepage wall triggers a chain-reaction blowout.',
    ],
    archivistRemark:
      'Archivist: "Thermal ordnance turns timber bridges and pressurized oil veins into self-sustaining infernos."',
    accentColor: '#FB923C',
  },
  {
    id: 'DMG_PLASMA',
    title: 'Damage Codex: Plasma',
    subtitle: 'Superheated Ionized Matter Lance',
    category: 'ARSENAL',
    unlockHint: 'Fire a Plasma weapon (Plasma Railgun).',
    statsLine: 'Strong vs: Barrel (2.5x), Oil (2.0x), Metal (1.65x), Stone/Wood (1.6x), Brick (1.45x)',
    tooltip: 'Superheated rounds that melt straight through metal, stone, and brick alike.',
    body: [
      'Plasma combines extreme thermal energy with hyper-velocity magnetic containment, boring effortlessly through tempered metal plating, stone, and brick without suffering deflection.',
      'Its ionized wake also ignites volatile oil reservoirs and pierces multiple enemies in a single line.',
    ],
    archivistRemark:
      'Archivist: "Plasma cares neither for stone nor star-metal armor—it melts through both in a single blinding line."',
    accentColor: '#38BDF8',
  },
  {
    id: 'DMG_ARC',
    title: 'Damage Codex: Arc',
    subtitle: 'Electro-Resonant Discharge & Conduction',
    category: 'ARSENAL',
    unlockHint: 'Fire an Arc weapon (Arc Caster) or detonate a Volatile Crystal Vein.',
    statsLine: 'Strong vs: Crystal (3.0x), Chain (2.6x), Metal (2.3x), Water (1.5x) · Grounded by: Sand (0.25x), Dirt (0.3x), Wood (0.35x)',
    tooltip: 'Shatters crystals and conducts through metal and water; insulated by dirt and wood.',
    body: [
      'Arc discharges resonate violently with crystalline lattices—instantly detonating Volatile Crystal Veins—while snapping iron suspension chains and stripping steel armor.',
      'In the cellular simulation, Arc bolts conduct across connected pools of Water and Metal girders to shock every hostile in contact, but are immediately grounded and absorbed by Dirt, Sand, and Wood.',
    ],
    archivistRemark:
      'Archivist: "Arc lightning leaps through flooded pools and steel girders to shock everything in reach, yet dry dirt grounds the current instantly."',
    accentColor: '#A7F3D0',
  },
  {
    id: 'DMG_CORROSIVE',
    title: 'Damage Codex: Corrosive',
    subtitle: 'Alchemical Vitriol Dissolution',
    category: 'ARSENAL',
    unlockHint: 'Fire a Corrosive weapon (Vitriol Mortar) or rupture an Acid Honeycomb cavity.',
    statsLine: 'Strong vs: Metal (2.6x), Chain (2.2x), Brick (1.6x), Stone (1.4x) · Resisted by: Gold (Immune), Crystal (0.15x)',
    tooltip: 'Dissolves metal plating and mortar, while gold and crystal remain unharmed.',
    body: [
      'Corrosive ordnance splashes live alchemical vitriol across the terrain, eating through heavy star-metal armor, iron chains, and brick mortar over time.',
      'In accordance with the Golden Covenant and Vaelic alchemy, both sacred Gold and resonant Crystal are impervious to vitriol dissolution.',
    ],
    archivistRemark:
      'Archivist: "Vitriol acid reduces heavy steel plating to bubbling green sludge, yet leaves Vaelic gold and crystal untouched."',
    accentColor: '#4ADE80',
  },
  {
    id: 'DMG_LASER',
    title: 'Damage Codex: Laser',
    subtitle: 'Coherent Harmonic Cutting Beam',
    category: 'ARSENAL',
    unlockHint: 'Fire a Laser weapon (Cutter Beam).',
    statsLine: 'Strong vs: Crystal (1.7x), Gold (1.6x), Stone (1.55x), Wood (1.45x) · Partially Deflected by: Metal (0.75x)',
    tooltip: 'Cuts cleanly through stone, crystal, and gold, though steel partially deflects it.',
    body: [
      'Coherent laser beams deliver continuous zero-travel-time cutting power across granite, limestone, crystal spires, and gold veins.',
      'While polished steel plating partially reflects the beam (0.75x), nothing matches a laser for surgical long-range excavation.',
    ],
    archivistRemark:
      'Archivist: "A coherent laser beam carves stone, crystal, and gold seams with surgical precision from across the chamber."',
    accentColor: '#FDE047',
  },
  {
    id: 'DMG_CRYOGENIC',
    title: 'Damage Codex: Cryogenic',
    subtitle: 'Sub-Zero Thermal Shock & Frost Embrittlement',
    category: 'ARSENAL',
    unlockHint: 'Fire a Cryogenic weapon (Cryo Blaster).',
    statsLine: 'Physics: Freezes Enemies, Embrittles Stone/Brick (2.2x Shatter) & Solidifies Lava into Stone',
    tooltip: 'Flash-freezes enemies, makes stone brittle, and solidifies molten lava.',
    body: [
      'Cryogenic projectiles drain all thermal energy on impact: flash-freezing enemies to severely slow their movement and firing rate, and solidifying molten Lava pixels directly into walkable Stone.',
      'Furthermore, surviving Stone, Brick, and Crystal pixels within a Cryogenic blast become frost-brittle—glowing icy cyan and suffering 2.2x shatter damage from subsequent Kinetic, Explosive, or Sonic impacts.',
    ],
    archivistRemark:
      'Archivist: "Cryogenic bolts turn molten lava into solid stone bridges and leave masonry so frost-brittle that a single kinetic bullet shatters it!"',
    accentColor: '#67E8F9',
  },
  {
    id: 'DMG_SONIC',
    title: 'Damage Codex: Sonic',
    subtitle: 'High-Frequency Structural Resonance',
    category: 'ARSENAL',
    unlockHint: 'Fire a Sonic weapon (Sonic Repeater).',
    statsLine: 'Physics: Vibrates Stone, Brick & Crystal Foundations Loose into Falling Rubble',
    tooltip: 'Structural vibrations that rattle brick and stone foundations apart.',
    body: [
      'Sonic ordnance weaponizes the very harmonic frequencies that caused The Fracture, transmitting high-amplitude acoustic waves through rigid masonry.',
      'Beyond its direct impact crater, a Sonic pulse rattles surrounding Stone, Brick, and Crystal border pixels loose—converting rigid load-bearing walls directly into cascading Rubble and Sand.',
    ],
    archivistRemark:
      'Archivist: "Sonic pulses vibrate at the exact resonant pitch of Vaelic mortar—rattling solid brick walls into showers of loose rubble."',
    accentColor: '#C084FC',
  },
  {
    id: 'DMG_VOID',
    title: 'Damage Codex: Void',
    subtitle: 'Gravitational Singularity & Matter Compression',
    category: 'ARSENAL',
    unlockHint: 'Fire a Void weapon (Void Singularity).',
    statsLine: 'Physics: Pulls Loose Terrain Pixels, Liquids & Enemies Inward Toward the Singularity',
    tooltip: 'Gravitational collapse that tears terrain and enemies into a central point.',
    body: [
      'Void ordnance tears a temporary micro-rift in space, generating an intense gravitational well along its flight path and point of collapse.',
      'Nearby enemies, loose earth (Sand, Dirt, Rubble), and liquids (Water, Oil, Acid) are violently wrenched inward toward the singularity core before being annihilated.',
    ],
    archivistRemark:
      'Archivist: "Void singularities drag loose stone, acid pools, and struggling constructs alike into a single crushing point of annihilation."',
    accentColor: '#818CF8',
  },

  // --- THE 24 WEAPONS (TIER I, TIER II & TIER III WITH CODEX TOOLTIPS & FLAVOR QUOTES) ---
  {
    id: 'WEAPON_RIVET_PUNCHER',
    title: 'Rivet Puncher',
    subtitle: 'Tier I Starter · Pneumatic Delayed-Charge Riveter',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Rivet Puncher.',
    statsLine: 'Tier I Starter · Type: Explosive / Kinetic (Delayed) · Dmg: 22 · Cooldown: 0.34s · Blast: 7.5 px',
    tooltip: 'Fires superheated iron rivets that embed into brick, stone, and enemies before popping with a concussive charge.',
    quote: '"Standard-issue for stubborn masonry and even more stubborn union organizers."',
    body: [
      'Re-purposed pneumatic bridge-building tools from the Exchequery docks. Fires heavy, superheated iron construction rivets at high velocity.',
      'Unlike standard bullets that bounce off stone, rivets embed themselves directly into brick, stone, and armored enemies before popping with a concussive demolition charge a half-second later.',
    ],
    archivistRemark:
      'Archivist: "Those dockyard rivet guns were meant for bridge girders, yet their delayed concussive pop cracks subterranean masonry with admirable efficiency."',
    accentColor: '#FB923C',
  },
  {
    id: 'WEAPON_CINDER_BELLOWS',
    title: 'Cinder Bellows',
    subtitle: 'Tier I Starter · Wide-Cone Coal-Dust Igniter',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Cinder Bellows.',
    statsLine: 'Tier I Starter · Type: Thermal · Dmg: 7×6 Embers · Cooldown: 0.28s · Ignites Flammables',
    tooltip: 'Short-range, wide-cone coal-dust blower that spews burning embers to ignite oil, moss, wood, and crawler packs.',
    quote: '"Keep your eyebrows trimmed and your back to the wind."',
    body: [
      'A rusted foundry furnace-igniter fitted with a heavy leather bellows pump that spews lingering sparks and burning coal embers across a wide cone.',
      'Though useless against solid stone at long range, it immediately ignites oil vats, moss carpets, wooden bridges, and entire packs of rushing Chitin Crawlers.',
    ],
    archivistRemark:
      'Archivist: "A crude leather furnace-bellows—yet one puff into a pressurized oil seam or crawler pack turns the corridor into a roaring hearth."',
    accentColor: '#F97316',
  },
  {
    id: 'WEAPON_PULSE_CARBINE',
    title: 'Pulse Carbine',
    subtitle: 'Tier I Starter · Rapid-Fire Kinetic Service Rifle',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Pulse Carbine.',
    statsLine: 'Tier I Starter · Type: Kinetic · Dmg: 14 · Cooldown: 0.14s · Blast Radius: 3.2 px',
    tooltip: 'Shreds dirt, wood, and jars; ricochets off heavy metal.',
    quote: '"Standard-issue pea shooter—great for crates, suicide against armored steel."',
    body: [
      'Standard-issue rapid kinetic carbine issued by the Crown Exchequery to Breacher convicts. Excels at sustained suppression, clearing loose dirt, wood, and supply jars, and picking off agile aerial drones.',
      'While light kinetic slugs deflect off heavy star-metal plating, pairing the Pulse Carbine with Cryo-brittle stone or aiming directly at hairline thermal stress faults readily triggers strata chain reactions.',
    ],
    archivistRemark:
      'Archivist: "Standard-issue pea shooter, the convicts call it—yet aimed at a frost-brittle pillar or volatile crystal glint, the Pulse Carbine brings down the roof."',
    accentColor: '#F59E0B',
  },
  {
    id: 'WEAPON_BRINE_SPRAYER',
    title: 'Brine Sprayer',
    subtitle: 'Tier I Surplus · Corrosive Bilge & Conductive Primer',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (80g) or fire the Brine Sprayer.",
    statsLine: 'Tier I Surplus (80g) · Type: Corrosive + Water Primer · Dmg: 11×2 · Cooldown: 0.16s',
    tooltip: 'Pumps pressurized salt-and-vitriol bilge water that corrodes metal and leaves conductive water puddles for Arc weapons.',
    quote: '"Smells like low tide and dissolves Exchequery boot-leather in forty seconds flat."',
    body: [
      'Salvaged from the flood-pumps in the upper Sunken Masonry. Pumps pressurized, salt-and-vitriol bilge water in a heavy arc.',
      'Deals steady corrosion to metal plating and leaves wet conductive puddles on impact that dramatically amplify Arc lightning conduction if you swap weapons or shoot near crystal circuits.',
    ],
    archivistRemark:
      'Archivist: "Soak a chamber floor with the Brine Sprayer, then discharge an Arc weapon into the puddle—every construct standing in the brine will convulse simultaneously!"',
    accentColor: '#34D399',
  },
  {
    id: 'WEAPON_QUARRY_THUMPER',
    title: 'Quarry Thumper',
    subtitle: 'Tier I Surplus · Break-Action Slag-Ball Cannon',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (90g) or fire the Quarry Thumper.",
    statsLine: 'Tier I Surplus (90g) · Type: Kinetic (Heavy Impact) · Dmg: 36 · Cooldown: 0.62s · Blast: 9.5 px',
    tooltip: 'Single-shot break-action demolition cannon that lobs heavy iron slag-balls to smash brick and knock enemies back.',
    quote: '"Technically a mining tool, assuming the ore you\'re mining is made of Sentinel ribs."',
    body: [
      'Built to clear collapsed coal-shafts; mostly used by penal delvers to clear hallway bottlenecks. Lobs heavy iron slag-balls with high ballistic drop.',
      'Despite its deliberate reload, each heavy iron sphere smashes cleanly through brick walls and knocks charging Stone Wardens and Sentinels backward.',
    ],
    archivistRemark:
      'Archivist: "A single iron slag-ball from the Quarry Thumper hits with the momentum of a falling boulder—ideal for knocking Stone Wardens back into acid pits."',
    accentColor: '#D97706',
  },
  {
    id: 'WEAPON_EMBER_SCATTER',
    title: 'Ember Scattergun',
    subtitle: 'Five-Pellet Incendiary Trench Shotgun',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Ember Scattergun.',
    statsLine: 'Type: Thermal · Dmg: 9×5 Pellets · Cooldown: 0.42s · Ignites Flammables',
    tooltip: 'Five-pellet incendiary burst that ignites wood, moss, and oil; weak vs stone.',
    quote: '"Turns oil-soaked tunnels into instant crematoriums—try not to stand in the puddle."',
    body: [
      'Unleashes a wide spread of five superheated slag pellets that ignite wood, moss, banners, and oil on contact.',
      'A single close-range blast against a pressurized oil pocket wall breaches the masonry seal and immediately ignites the erupting oil spray into a room-clearing fireball.',
    ],
    archivistRemark:
      'Archivist: "The Pyromancer’s favored scattergun. One pull of the trigger turns an oil-soaked tunnel into an instant crematorium."',
    accentColor: '#FB923C',
  },
  {
    id: 'WEAPON_FLAK_CANNON',
    title: 'Flak Cannon',
    subtitle: 'Heavy Arcing Demolition Launcher',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Flak Cannon.',
    statsLine: 'Type: Explosive · Dmg: 32 · Cooldown: 0.56s · Blast Radius: 11 px',
    tooltip: 'Heavy arcing shells that shatter brick, stone pillars, and crystal.',
    quote: '"The blast radius doesn\'t care which side of the wall your organs are on."',
    body: [
      'Lobs heavy high-explosive shells that detonate with an 11-pixel crater radius, tearing through stone pillars, foundry brickwork, and crystal formations.',
      'Ideal for severing the base of load-bearing walls to trigger massive crushing collapses on enemies below.',
    ],
    archivistRemark:
      'Archivist: "Nothing reshapes subterranean architecture quite like the Flak Cannon. Just mind the blast radius in tight tunnels!"',
    accentColor: '#FBBF24',
  },
  {
    id: 'WEAPON_PLASMA_RAIL',
    title: 'Plasma Railgun',
    subtitle: 'Hyper-Velocity Piercing Lance',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Plasma Railgun.',
    statsLine: 'Type: Plasma · Dmg: 44 · Cooldown: 0.65s · Pierce: 5 Targets · Ignites',
    tooltip: 'Superheated piercing slug that bores cleanly through stone, brick, and metal.',
    quote: '"MANUFACTURER ADVISORY: Check behind your target before firing unless you enjoy roof collapses."',
    body: [
      'Accelerates a magnetic pinch of superheated plasma to 540 px/s, punching through up to five targets and boring deep tunnels through stone, brick, and star-metal alike.',
      'Excels at drilling straight through a Gatekeeper Colossus’s outer hull to strike its recessed Core Weak Spot—though careless shots frequently sever the support pillars behind your target.',
    ],
    archivistRemark:
      'Archivist: "Heed the manufacturer advisory on the Plasma Railgun: check what load-bearing pillar stands behind your target before squeezing the trigger!"',
    accentColor: '#38BDF8',
  },
  {
    id: 'WEAPON_ARC_CASTER',
    title: 'Arc Caster',
    subtitle: 'Electro-Resonant Twin Bolt Projector',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Arc Caster.',
    statsLine: 'Type: Arc · Dmg: 16×2 · Cooldown: 0.24s · Conducts in Water/Metal · Grounded by Dirt',
    tooltip: 'Twin lightning bolts that shatter crystal and fry chains; grounded by dirt and wood.',
    quote: '"Rubber boots sold separately."',
    body: [
      'Fires twin high-voltage lightning bolts that deal 3.0x structural damage to crystal formations, 2.6x to suspension chains, and 2.3x to heavy metal armor.',
      'When fired into flooded Sunken Masonry pools or metal girders, the Arc Caster electrifies the conductive surface to shock nearby hostiles—while dirt and wood harmlessly ground the discharge.',
    ],
    archivistRemark:
      'Archivist: "Twin lightning bolts that fry chains, detonate crystal seams, and electrify standing water. Rubber boots sold separately indeed!"',
    accentColor: '#A7F3D0',
  },
  {
    id: 'WEAPON_ACID_MORTAR',
    title: 'Vitriol Mortar',
    subtitle: 'Corrosive Alchemical Lobber',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Vitriol Mortar.',
    statsLine: 'Type: Corrosive · Dmg: 24 · Cooldown: 0.48s · Spawns Live Acid Pixels',
    tooltip: 'Acid shells that melt metal and masonry; gold and crystal resist corrosion.',
    quote: '"Dissolves everything except your debt and the gold coins needed to pay it."',
    body: [
      'Launches pressurized shells of concentrated vitriol that burst on impact and coat the terrain in live, dripping acid pixels.',
      'Because star-metal suffers 2.6x damage from corrosive ordnance, the Vitriol Mortar melts through Armored Sentinels, Turrets, and the Slag Colossus—while leaving sacred Vaelic gold veins completely intact for collection.',
    ],
    archivistRemark:
      'Archivist: "The Vitriol Mortar dissolves steel armor and masonry floors alike, yet conveniently leaves every ounce of Vaelic gold untouched for the Exchequery."',
    accentColor: '#4ADE80',
  },
  {
    id: 'WEAPON_MINING_BEAM',
    title: 'Cutter Beam',
    subtitle: 'Continuous Precision Excavation Laser',
    category: 'ARSENAL',
    unlockHint: 'Wield or fire the Cutter Beam.',
    statsLine: 'Type: Laser · Dmg: 5/tick · Cooldown: 0.06s · Continuous Raycast Beam',
    tooltip: 'Continuous mining laser effective against stone, crystal, brick, and wood.',
    quote: '"Carves granite like butter and amputates careless fingers just as cleanly."',
    body: [
      'Projects a continuous coherent laser beam that carves surgical channels through stone, crystal, brick, timber, and gold seams.',
      'Allows a delver to slice through overhead support struts, sever hanging chains, or safely lance volatile strata pockets from across the cavern.',
    ],
    archivistRemark:
      'Archivist: "The Cutter Beam carves granite like butter—the finest surgical excavation instrument in the Bastion."',
    accentColor: '#FDE047',
  },
  {
    id: 'WEAPON_CRYOMANCER_BLASTER',
    title: 'Cryo Blaster',
    subtitle: 'Sub-Zero Frost Bolt Carbine',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Cryo Blaster.',
    statsLine: 'Type: Cryogenic · Dmg: 18 · Cooldown: 0.18s · Freezes Foes, Embrittles Stone & Cools Lava',
    tooltip: 'Sub-zero bolts that freeze targets solid, brittle stone, and cool lava.',
    quote: '"Shattering a frozen target counts as two kills on the ledger and zero cleanup for the janitors."',
    body: [
      'Fires sub-zero cryogenic bolts that flash-freeze enemies, coat surrounding stone and brick in brittle frost (doubling subsequent kinetic and explosive shatter damage), and solidify molten lava pools into solid rock.',
      'An indispensable tool in the Ashen Foundry for crusting over lava hazards and setting up one-shot masonry demolitions.',
    ],
    archivistRemark:
      'Archivist: "Freeze the stone with the Cryo Blaster, then shatter it with a kinetic slug—or cool a pool of molten lava into a bridge beneath your boots!"',
    accentColor: '#67E8F9',
  },
  {
    id: 'WEAPON_SONIC_REPEATER',
    title: 'Sonic Repeater',
    subtitle: 'High-Frequency Structural Pulse Rifle',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Sonic Repeater.',
    statsLine: 'Type: Sonic · Dmg: 12 · Cooldown: 0.12s · Pierce: 2 · Shakes Foundations Loose',
    tooltip: 'High-frequency pulses that shake brick and stone foundations loose instantly.',
    quote: '"Did you know the human eardrum ruptures at the exact same pitch as load-bearing limestone?"',
    body: [
      'Emits rapid high-frequency acoustic pulses that pierce through multiple targets while shaking nearby brick, stone, and crystal foundations loose into falling rubble and sand.',
      'A few sustained bursts at the base of a masonry column will rattle the entire structure into a cascading collapse.',
    ],
    archivistRemark:
      'Archivist: "The Sonic Repeater vibrates at the exact pitch of load-bearing limestone—shaking solid walls loose into falling rubble."',
    accentColor: '#C084FC',
  },
  {
    id: 'WEAPON_VOID_SINGULARITY_GUN',
    title: 'Void Singularity',
    subtitle: 'Micro-Black Hole Rift Projector',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Void Singularity.',
    statsLine: 'Type: Void · Dmg: 55 · Cooldown: 0.75s · Pierce: 4 · Blast Radius: 14 px · Gravitational Pull',
    tooltip: 'Fires micro-black holes that pull in terrain pixels, debris, and enemies.',
    quote: '"Next of kin will be billed for all compressed terrain."',
    body: [
      'Fires slow-moving microscopic black holes that wrench loose terrain pixels, liquids, debris, and nearby enemies inward toward the vortex before erasing matter in a 14-pixel sphere.',
      'Few structures or enemy formations in the thirty tiers can survive being dragged into a Void Singularity’s event horizon.',
    ],
    archivistRemark:
      'Archivist: "A terrifying instrument that pulls loose earth, acid, and enemies into a micro-black hole. Do not stand near its event horizon!"',
    accentColor: '#818CF8',
  },
  {
    id: 'WEAPON_HEAVY_CHAIN_MINIGUN',
    title: 'Chain Minigun',
    subtitle: 'Rotary High-Rate Kinetic Lead Shredder',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Chain Minigun.',
    statsLine: 'Type: Kinetic · Dmg: 7 · Cooldown: 0.05s · 20 Rounds/Sec',
    tooltip: 'High-rate kinetic lead shredder for rapid excavation and soft targets.',
    quote: '"Every bullet fired adds three days to your sentence, so aim carefully."',
    body: [
      'Spools up a twenty-round-per-second torrent of kinetic lead that chews through soft earth, wood, and unarmored hostiles while blanketing cavern walls.',
      'Even a brief sweep across a chamber is virtually guaranteed to strike every hidden volatile crystal vein and thermal fault in sight.',
    ],
    archivistRemark:
      'Archivist: "The Exchequery bills convicts by the cartridge, yet twenty rounds a second from the Chain Minigun will uncover every volatile vein in the room."',
    accentColor: '#F97316',
  },
  {
    id: 'WEAPON_GRAVITON_CANNON',
    title: 'Graviton Cannon',
    subtitle: 'Heavy Gravity-Shock Demolition Ordnance',
    category: 'ARSENAL',
    unlockHint: 'Claim or fire the Graviton Cannon.',
    statsLine: 'Type: Explosive · Dmg: 48 · Cooldown: 0.85s · Blast Radius: 16 px',
    tooltip: 'Heavy gravity-shock ordnance that triggers catastrophic ceiling collapses.',
    quote: '"Turns any cavern ceiling into a high-velocity pancake maker."',
    body: [
      'The heaviest portable demolition launcher in the Bastion’s armory. Fires a gravity-shock shell that excavates a 16-pixel crater and destabilizes overhead ceilings on detonation.',
      'One shell can sever an entire bridge span, bring down a cavern roof, or strip an outer limb from a Modular Colossus.',
    ],
    archivistRemark:
      'Archivist: "The Graviton Cannon turns any cavern ceiling into a high-velocity pancake maker. Fire it at the roof above your foes!"',
    accentColor: '#EC4899',
  },
  {
    id: 'WEAPON_SLAG_SLINGER',
    title: 'Slag Slinger',
    subtitle: "Tier II Vance Prototype · Molten Smelter Lobber",
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (150g) or fire the Slag Slinger.",
    statsLine: 'Tier II Prototype (150g) · Type: Thermal + Lava Spawn · Dmg: 26 · Cooldown: 0.52s',
    tooltip: 'Lobs gloopy blobs of molten Ashen Foundry slag that burn through wood and drip temporary pools of lava.',
    quote: '"Vance\'s Third Law: Anything becomes a liquid if you hate it hot enough."',
    body: [
      'Master-Factor Barnaby Vance tapped a pressurized smelter pipe directly into a mortar tube and slapped a wooden handle on it.',
      'Lobs gloopy blobs of molten Ashen Foundry slag that stick to walls and ceilings, burning through timber structures and dripping live pools of molten lava onto enemies below.',
    ],
    archivistRemark:
      'Archivist: "Only Barnaby Vance would bottle molten foundry slag inside a handheld mortar. Lob it onto a ceiling and watch liquid magma rain upon your enemies!"',
    accentColor: '#EF4444',
  },
  {
    id: 'WEAPON_AETHER_SAW',
    title: 'Aether Sawblade',
    subtitle: 'Tier II Vance Prototype · Ricocheting Survey Disc Launcher',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (165g) or fire the Aether Sawblade.",
    statsLine: 'Tier II Prototype (165g) · Type: Laser / Kinetic · Dmg: 21 · Cooldown: 0.26s · 4 Ricochets',
    tooltip: 'Launches spinning, laser-rimmed Vaelic survey discs that slice soft earth and ricochet up to 4 times off stone and metal.',
    quote: '"Bouncing blades don\'t have friends, so duck after pulling the trigger."',
    body: [
      'Built by Vance from stripped-down Drone gyroscopes wired to a cracked Vaelic mining crystal.',
      'Launches high-speed laser-rimmed discs that slice straight through soft earth, wood, and flesh while ricocheting violently off heavy metal and stone corridors up to four times per shot.',
    ],
    archivistRemark:
      'Archivist: "Vance wired a mining laser around a drone gyroscope! Bank those spinning discs around stone corners to shred turrets out of line-of-sight."',
    accentColor: '#38BDF8',
  },
  {
    id: 'WEAPON_RIME_HARPOON',
    title: 'Rime Harpoon',
    subtitle: 'Tier II Vance Prototype · Cryogenic Tether Spike',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (180g) or fire the Rime Harpoon.",
    statsLine: 'Tier II Prototype (180g) · Type: Cryogenic · Dmg: 28 · Cooldown: 0.46s · Freezes & Yanks Foes',
    tooltip: 'Fires a tethered cryogenic spike that flash-freezes terrain or enemies brittle and yanks frozen foes toward you.',
    quote: '"Turns a charging Stone Warden into a very large, very fragile ice sculpture."',
    body: [
      'Originally engineered to cool runaway magma vents in Stratum II before Barnaby Vance bolted a high-torque winch onto the receiver.',
      'Fires a tethered cryogenic spike that freezes the first target or terrain chunk it hits—making stone brittle enough to shatter with a single follow-up shot while yanking frozen enemies off ledges.',
    ],
    archivistRemark:
      'Archivist: "Harpoon a Stone Warden to flash-freeze its limestone carapace and yank it off balance, then shatter it with a kinetic follow-up!"',
    accentColor: '#22D3EE',
  },
  {
    id: 'WEAPON_RESONANCE_FORK',
    title: 'Resonance Fork',
    subtitle: 'Tier II Vance Prototype · Harmonic Crumble-Wave Rifle',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (195g) or fire the Resonance Fork.",
    statsLine: 'Tier II Prototype (195g) · Type: Sonic · Dmg: 24 · Cooldown: 0.44s · Pierce: 3 · Crumbles Masonry in Flight',
    tooltip: 'Two-pronged Vaelic tuning-fork rifle that fires a slow harmonic wave, vibrating brick and stone into crumbling rubble.',
    quote: '"Hum a bar, shatter a load-bearing pillar, bury a squad of Sentinels."',
    body: [
      'Stolen from an Aether-Wright observatory altar and crudely wired by Vance to a hand-crank capacitor battery.',
      'Fires a slow-moving harmonic wave that continuously vibrates brick, stone, and crystal blocks along its flight path into cascading rubble, triggering delayed chain-reaction collapses.',
    ],
    archivistRemark:
      'Archivist: "That tuning-fork was meant to tune astral geodes, not rattle temple pillars into avalanches! One harmonic wave can destabilize an entire corridor."',
    accentColor: '#A855F7',
  },
  {
    id: 'WEAPON_SUN_SIPHON_LANCE',
    title: 'Sun-Siphon Lance',
    subtitle: 'Tier III Forbidden Vaelic Relic · Gold-Scaling Auric Beam',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (290g) or fire the Sun-Siphon Lance.",
    statsLine: 'Tier III Vaelic Relic (290g) · Type: Plasma / Laser · Dmg: 8+/tick (Scales with Run Gold) · Continuous Beam',
    tooltip: 'Channels a searing beam of frozen sunlight whose width, blast power, and damage scale dynamically with unspent run Gold.',
    quote: '"Proof that enough gold really can vaporize all your problems."',
    body: [
      'A sacred Vaelic ceremonial scepter that draws power directly from the Golden Covenant itself, channeling a searing beam of "frozen sunlight."',
      'The beam’s width, terrain-carving blast radius, and armor-melting damage scale dynamically with how much unspent Vaelic Gold you are carrying on your current expedition.',
    ],
    archivistRemark:
      'Archivist: "The Sun-Siphon Lance feeds on the Golden Covenant! The heavier your pouch of unspent gold, the wider and deadlier its beam of frozen sunlight becomes."',
    accentColor: '#FACC15',
  },
  {
    id: 'WEAPON_OBLIVION_CHIME',
    title: 'Oblivion Chime',
    subtitle: 'Tier III Forbidden Vaelic Relic · Dark-Crystal Void Eraser',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (320g) or fire the Oblivion Chime.",
    statsLine: 'Tier III Vaelic Relic (320g) · Type: Void · Dmg: 52 · Cooldown: 0.72s · Blast: 15.5 px · Implosive Terrain Erasure',
    tooltip: 'Strikes a dark-crystal bell, firing a silent wave that hangs in mid-air before imploding to erase a circular chunk of all non-gold terrain.',
    quote: '"Where did that wall go? Better question: where did the guy standing next to it go?"',
    body: [
      'Used by the Veiled Choir in Era I to carve the thirty subterranean tiers without leaving rubble behind.',
      'Strikes a miniature dark-crystal bell, firing a resonant void wave that hangs in mid-air before imploding—dragging enemies inward and cleanly erasing a wide circular chunk of all non-gold terrain (even heavy star-metal).',
    ],
    archivistRemark:
      'Archivist: "The Veiled Choir rang the Oblivion Chime to hollow out entire vaults without leaving a single pebble of rubble behind."',
    accentColor: '#A78BFA',
  },
  {
    id: 'WEAPON_TEMPEST_CHOIR',
    title: 'Tempest Choir',
    subtitle: 'Tier III Forbidden Vaelic Relic · Drifting Ball-Lightning Orb',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (340g) or fire the Tempest Choir.",
    statsLine: 'Tier III Vaelic Relic (340g) · Type: Arc · Dmg: 34 · Cooldown: 0.64s · Continuous Arc Tendrils',
    tooltip: 'Fires a slow-drifting ball-lightning orb that continuously arcs lethal lightning tendrils to nearby crystals, metal, water, and enemies.',
    quote: '"Turns flooded tunnels into an all-you-can-fry buffet."',
    body: [
      'Houses a caged storm-spirit harvested from the deepest lightning-rods of the Astral Geode at Depth 30.',
      'Fires a slow-drifting ball-lightning orb that continuously lashes lethal lightning tendrils to nearby enemies, volatile crystals, metal plates, and water pools as it floats across the room.',
    ],
    archivistRemark:
      'Archivist: "A single orb from the Tempest Choir drifting above a flooded Sunken Masonry hall will electrocute every guardian in the room!"',
    accentColor: '#60A5FA',
  },
  {
    id: 'WEAPON_TECTONIC_RAM',
    title: 'Tectonic Ram',
    subtitle: 'Tier III Forbidden Vaelic Relic · Seismic Tunnel Bore',
    category: 'ARSENAL',
    unlockHint: "Unseal at Vance's Contraband Workbench (360g) or fire the Tectonic Ram.",
    statsLine: 'Tier III Vaelic Relic (360g) · Type: Explosive / Sonic · Dmg: 46×3 · Cooldown: 0.68s · Blast: 12.5 px',
    tooltip: 'Shoulder-mounted Vaelic pile-driver that unleashes a directional seismic shockwave—blasting a tunnel through stone while hurling shrapnel.',
    quote: '"Why look for a doorway when you have four rounds left in the chamber?"',
    body: [
      'The heavy boring-engine that caused the Great Resonance Collapse at Level 30, miniaturized by Barnaby Vance for handheld use.',
      'Unleashes a directional triple-wave seismic blast that bores a tunnel straight through stone and brick while shaking surrounding foundations into falling rock-shrapnel.',
    ],
    archivistRemark:
      'Archivist: "By the Choir—Vance miniaturized the very harmonic boring-ram that cracked Level 30! Point it at a wall and it manufactures an instant corridor."',
    accentColor: '#F43F5E',
  },

  // --- BOSS RELICS ---
  {
    id: 'RELIC_SIEGE_HEART',
    title: 'Siege Heart',
    subtitle: 'Boss Relic · Demolition Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Siege Heart after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: +50% Blast Radius, +3 Blast Power, +1 Max Bomb & Wall Collapses Heal +8 HP',
    body: [
      'Recovered from the shattered chest of a subterranean Colossus, the Siege Heart links the bearer’s penal rig to seismic shockwaves.',
      'Every time you collapse a load-bearing wall segment, the falling masonry emits a concussive shock ring and restores vital suit integrity.',
    ],
    archivistRemark:
      'Archivist: "With the Siege Heart bound, every collapsing wall in the strata becomes both your weapon and your shield."',
    accentColor: '#F59E0B',
  },
  {
    id: 'RELIC_THERMAL_REACTOR',
    title: 'Thermal Reactor',
    subtitle: 'Boss Relic · Pyro Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Thermal Reactor after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: All Attacks Ignite, Fire/Oil Immunity & +40% Fire Rate Near Flames',
    body: [
      'Channels the superheated Furnace Heart of a Foundry titan directly into your firing chamber, superheating every projectile you discharge.',
      'Grants complete immunity to fire and burning oil while accelerating weapon cycling whenever you fight amidst active flames.',
    ],
    archivistRemark:
      'Archivist: "The Thermal Reactor turns every weapon in your hands into an incendiary trigger—and lets you walk through burning oil unscathed."',
    accentColor: '#FB923C',
  },
  {
    id: 'RELIC_RAIL_FOCUSER',
    title: 'Rail Focuser',
    subtitle: 'Boss Relic · Precision & Pierce Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Rail Focuser after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: +60% Projectile Velocity, +2 Pierce & +45% Damage vs Armor/Weak Spots',
    body: [
      'A crystalline magnetic aperture salvaged from a Colossus crown that aligns outgoing projectiles into hyper-velocity lances capable of piercing through multiple targets and deep boss armor layers.',
    ],
    archivistRemark:
      'Archivist: "The Rail Focuser turns even scattered fire into an armor-piercing lance aimed straight at a Colossus’s Core."',
    accentColor: '#38BDF8',
  },
  {
    id: 'RELIC_CHRONO_THRUSTER',
    title: 'Chrono Thruster',
    subtitle: 'Boss Relic · Mobility & Bomb Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Chrono Thruster after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: +20% Move Speed, Dash Blast Pulse & +1 Bomb Restored Every 2 Dashes',
    body: [
      'Overclocks suit actuators while discharging a concussive blast pulse along your dash trajectory and synthesizing a fresh Breach Bomb every second dash.',
    ],
    archivistRemark:
      'Archivist: "Speed and endless breach bombs—the Chrono Thruster lets you dance across collapsing caverns unscathed."',
    accentColor: '#A78BFA',
  },
  {
    id: 'RELIC_ALCHEMIST_HEART',
    title: 'Alchemist Heart',
    subtitle: 'Boss Relic · Vitriol & Sustain Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Alchemist Heart after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: Attacks Splash Acid, Acid Immunity, +35% Vitriol Dmg & +3 HP per Kill',
    body: [
      'Coats every outgoing shot in alchemical vitriol that dissolves stone and steel into live acid droplets while granting complete immunity to acid pools and siphoning restorative energy from slain constructs.',
    ],
    archivistRemark:
      'Archivist: "The Alchemist Heart distills the essence of the Vitriol Vaults—every shot corrodes armor and sustains your descent."',
    accentColor: '#10B981',
  },
  {
    id: 'RELIC_SALVAGE_MAGNET',
    title: 'Salvage Magnet',
    subtitle: 'Boss Relic · Avarice & Tank Build',
    category: 'ARSENAL',
    unlockHint: 'Bind the Salvage Magnet after defeating a Gatekeeper Boss.',
    statsLine: 'Effect: +45 Max HP, Full Heal, 150px Magnet & +1% Weapon Damage per 15 Gold',
    body: [
      'Generates a wide-radius auric field that pulls sacred Vaelic gold shards and supplies out of rubble while converting your accumulated gold reserves directly into weapon amplification.',
    ],
    archivistRemark:
      'Archivist: "The Salvage Magnet harnesses the Golden Covenant itself—turning every ounce of Vaelic gold you carry into raw destructive power."',
    accentColor: '#FACC15',
  },
];

export const LORE_CATALOG_MAP: Record<string, LorePageDef> = Object.fromEntries(
  LORE_CATALOG.map((page) => [page.id, page])
);

export const WORLD_LORE_IDS: string[] = LORE_CATALOG.filter(
  (p) => p.category === 'WORLD_STRATA'
).map((p) => p.id);

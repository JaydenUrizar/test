// Emberwild game data: items, resource nodes, recipes, loot tables, progression.
// Shared by server (authoritative) and client (display / prediction).

export const HOTBAR = 6;
export const INV_SLOTS = 30; // 0..5 hotbar, 6..29 backpack
export const EQUIP_SLOTS = ['head', 'chest', 'legs', 'feet'];

// cat: res | food | tool | melee | gun | bow | ammo | armor | deploy | bp | med | build | seed
// shape/color drive procedural icon art in the client.
const I = {};
const def = (id, o) => { I[id] = { id, stack: 1, ...o }; };

// ---- Resources
def('wood', { name: 'Wood', cat: 'res', stack: 1000, shape: 'log', color: '#a8743f', desc: 'Chopped timber. The backbone of every camp.' });
def('stone', { name: 'Stone', cat: 'res', stack: 1000, shape: 'rock', color: '#9aa0a6', desc: 'Rough stone for tools and walls.' });
def('fiber', { name: 'Plant Fiber', cat: 'res', stack: 500, shape: 'fiber', color: '#7fbf5a', desc: 'Tough strands from wild hemp.' });
def('cloth', { name: 'Cloth', cat: 'res', stack: 200, shape: 'cloth', color: '#e8e0c8', desc: 'Woven fibers. Needed for bandages and clothing.' });
def('hide', { name: 'Animal Hide', cat: 'res', stack: 100, shape: 'hide', color: '#b07a4a', desc: 'Skin from hunted animals.' });
def('iron_ore', { name: 'Iron Ore', cat: 'res', stack: 500, shape: 'ore', color: '#c98b5a', desc: 'Smelt in a furnace.' });
def('iron_ingot', { name: 'Iron Ingot', cat: 'res', stack: 300, shape: 'ingot', color: '#c9d1d9', desc: 'Refined iron. Strong tools and guns.' });
def('sulfur_ore', { name: 'Sulfur Ore', cat: 'res', stack: 500, shape: 'ore', color: '#e6d64a', desc: 'Yellow crystals. Handle with care.' });
def('gunpowder', { name: 'Gunpowder', cat: 'res', stack: 500, shape: 'powder', color: '#4a4a52', desc: 'Black powder for ammo and explosives.' });
def('scrap', { name: 'Scrap', cat: 'res', stack: 500, shape: 'gear', color: '#8fa1b3', desc: 'Salvage from old world ruins.' });

// ---- Food & medical
def('berries', { name: 'Wild Berries', cat: 'food', stack: 50, shape: 'berry', color: '#c0354f', food: 8, water: 3, desc: 'Sweet and slightly hydrating.' });
def('corn', { name: 'Corn', cat: 'food', stack: 50, shape: 'corn', color: '#f2c94c', food: 16, water: 2, desc: 'Farmed crop.' });
def('pumpkin', { name: 'Pumpkin', cat: 'food', stack: 30, shape: 'pumpkin', color: '#e8862a', food: 24, water: 8, desc: 'Farmed crop. Filling.' });
def('raw_meat', { name: 'Raw Meat', cat: 'food', stack: 30, shape: 'meat', color: '#d9534f', food: 10, water: 0, sick: 0.35, desc: 'Risky to eat raw. Cook it.' });
def('cooked_meat', { name: 'Cooked Meat', cat: 'food', stack: 30, shape: 'meat', color: '#8c4a2f', food: 38, water: 0, desc: 'Hearty and safe.' });
def('canned_beans', { name: 'Canned Beans', cat: 'food', stack: 20, shape: 'can', color: '#c96a3a', food: 30, water: 4, desc: 'Old-world rations.' });
def('soda', { name: 'Fizz Cola', cat: 'food', stack: 20, shape: 'can', color: '#d43c3c', food: 4, water: 30, desc: 'Somehow still fizzy.' });
def('water_bottle', { name: 'Water Bottle', cat: 'food', stack: 20, shape: 'bottle', color: '#5cc0e8', food: 0, water: 45, desc: 'Clean water.' });
def('bandage', { name: 'Bandage', cat: 'med', stack: 20, shape: 'bandage', color: '#f2f2f2', heal: 18, hot: 4, desc: 'Heals a little over a few seconds.' });
def('medkit', { name: 'Medkit', cat: 'med', stack: 5, shape: 'medkit', color: '#e84a4a', heal: 65, hot: 6, desc: 'Fast, serious healing.' });

// ---- Seeds
def('corn_seed', { name: 'Corn Seeds', cat: 'seed', stack: 50, shape: 'seed', color: '#f2c94c', plant: 'corn', desc: 'Plant in open soil. Grows in about 6 minutes.' });
def('pumpkin_seed', { name: 'Pumpkin Seeds', cat: 'seed', stack: 50, shape: 'seed', color: '#e8862a', plant: 'pumpkin', desc: 'Plant in open soil. Grows in about 9 minutes.' });

// ---- Tools (power = damage to nodes per hit)
def('rock', { name: 'Rock', cat: 'tool', shape: 'rock', color: '#a0a4a8', power: { axe: 8, pick: 8 }, melee: { dmg: 8, rate: 0.55, range: 2.2, kind: 'blunt' }, hold: 'rock', desc: 'Better than bare hands.' });
def('stone_hatchet', { name: 'Stone Hatchet', cat: 'tool', shape: 'hatchet', color: '#9aa0a6', power: { axe: 26, pick: 6 }, melee: { dmg: 18, rate: 0.6, range: 2.3, kind: 'blade' }, dur: 150, hold: 'hatchet', desc: 'Chops trees decently.' });
def('stone_pickaxe', { name: 'Stone Pickaxe', cat: 'tool', shape: 'pickaxe', color: '#9aa0a6', power: { pick: 26, axe: 6 }, melee: { dmg: 16, rate: 0.7, range: 2.3, kind: 'blade' }, dur: 150, hold: 'pickaxe', desc: 'Breaks rock and low-grade ore.' });
def('iron_hatchet', { name: 'Iron Hatchet', cat: 'tool', shape: 'hatchet', color: '#d5dbe1', power: { axe: 55, pick: 10 }, melee: { dmg: 28, rate: 0.55, range: 2.3, kind: 'blade' }, dur: 400, hold: 'hatchet', desc: 'Fells trees fast.' });
def('iron_pickaxe', { name: 'Iron Pickaxe', cat: 'tool', shape: 'pickaxe', color: '#d5dbe1', power: { pick: 55, axe: 10 }, melee: { dmg: 24, rate: 0.65, range: 2.3, kind: 'blade' }, dur: 400, hold: 'pickaxe', desc: 'Mines everything.' });
def('hammer', { name: 'Builder Hammer', cat: 'build', shape: 'hammer', color: '#c99a5b', hold: 'hammer', melee: { dmg: 8, rate: 0.6, range: 2.3, kind: 'blunt' }, desc: 'Hold to open the build menu. Right-click pieces to upgrade, hold R to repair.' });
def('torch', { name: 'Torch', cat: 'tool', shape: 'torch', color: '#ff9a3c', hold: 'torch', light: true, warmth: 6, melee: { dmg: 10, rate: 0.6, range: 2.2, kind: 'blunt' }, desc: 'Lights the dark and keeps you warmer.' });

// ---- Melee weapons
def('stone_spear', { name: 'Stone Spear', cat: 'melee', shape: 'spear', color: '#b58a5a', melee: { dmg: 26, rate: 0.75, range: 3.1, kind: 'blade' }, dur: 120, hold: 'spear', desc: 'Long reach.' });
def('machete', { name: 'Iron Machete', cat: 'melee', shape: 'machete', color: '#d5dbe1', melee: { dmg: 38, rate: 0.5, range: 2.5, kind: 'blade' }, power: { axe: 20, pick: 0 }, dur: 300, hold: 'machete', desc: 'Fast, deadly blade.' });

// ---- Ranged
def('bow', { name: 'Hunting Bow', cat: 'bow', shape: 'bow', color: '#a8743f', hold: 'bow', gun: { type: 'bow', dmg: 42, rate: 0.9, mag: 1, reload: 0, ammo: 'arrow', speed: 55, gravity: 12, spread: 0.4, range: 120, draw: 0.55, recoil: 1.0, sound: 'bow' }, desc: 'Silent and lethal. Arrows can be recovered.' });
def('revolver', { name: 'Ember Revolver', cat: 'gun', shape: 'revolver', color: '#b8bcc4', hold: 'revolver', gun: { type: 'gun', dmg: 34, rate: 0.42, mag: 6, reload: 2.4, ammo: 'pistol_ammo', spread: 0.35, bloom: 0.5, range: 140, auto: false, recoil: 3.2, zoom: 1.1, sound: 'revolver', pellets: 1 }, dur: 500, desc: 'Accurate and punchy. Slow reload.' });
def('smg', { name: 'Hornet SMG', cat: 'gun', shape: 'smg', color: '#5c6470', hold: 'smg', gun: { type: 'gun', dmg: 13, rate: 0.085, mag: 30, reload: 2.0, ammo: 'pistol_ammo', spread: 1.2, bloom: 0.55, range: 90, auto: true, recoil: 1.15, zoom: 1.05, sound: 'smg', pellets: 1 }, dur: 600, desc: 'Fast fire, climbs hard. Great up close.' });
def('shotgun', { name: 'Thumper Shotgun', cat: 'gun', shape: 'shotgun', color: '#8a5a3a', hold: 'shotgun', gun: { type: 'gun', dmg: 9, rate: 0.95, mag: 6, reload: 0.55, perShell: true, ammo: 'shell', spread: 4.8, bloom: 0, range: 45, auto: false, recoil: 6.5, zoom: 1.0, sound: 'shotgun', pellets: 8 }, dur: 500, desc: 'Devastating at close range. Loads one shell at a time.' });
def('rifle', { name: 'Longwatch Rifle', cat: 'gun', shape: 'rifle', color: '#6b5b45', hold: 'rifle', gun: { type: 'gun', dmg: 82, rate: 1.35, mag: 5, reload: 3.0, ammo: 'rifle_ammo', spread: 0.06, bloom: 0.6, range: 320, auto: false, recoil: 5.0, zoom: 3.0, sound: 'rifle', pellets: 1 }, dur: 600, desc: 'Bolt-action precision with a scope. Right-click to zoom.' });

// ---- Ammo
def('arrow', { name: 'Arrow', cat: 'ammo', stack: 64, shape: 'arrow', color: '#c9a36b', desc: 'For the hunting bow.' });
def('pistol_ammo', { name: '9mm Rounds', cat: 'ammo', stack: 120, shape: 'bullet', color: '#d9a441', desc: 'Revolver and SMG ammo.' });
def('shell', { name: 'Shotgun Shell', cat: 'ammo', stack: 40, shape: 'shell', color: '#d94b3a', desc: 'Buckshot.' });
def('rifle_ammo', { name: 'Rifle Rounds', cat: 'ammo', stack: 60, shape: 'bullet', color: '#9bb04a', desc: 'Long-range rounds.' });

// ---- Armor (slot, armor = fraction of damage absorbed, warmth = deg)
def('cloth_hood', { name: 'Cloth Hood', cat: 'armor', slot: 'head', armor: 0.03, warmth: 3, shape: 'hood', color: '#d8cfae', desc: 'Light head cover.' });
def('cloth_shirt', { name: 'Cloth Jacket', cat: 'armor', slot: 'chest', armor: 0.05, warmth: 6, shape: 'shirt', color: '#d8cfae', desc: 'Keeps the chill off.' });
def('cloth_pants', { name: 'Cloth Pants', cat: 'armor', slot: 'legs', armor: 0.04, warmth: 4, shape: 'pants', color: '#d8cfae', desc: 'Simple trousers.' });
def('cloth_boots', { name: 'Cloth Boots', cat: 'armor', slot: 'feet', armor: 0.02, warmth: 3, shape: 'boots', color: '#d8cfae', desc: 'Wrapped feet.' });
def('iron_helmet', { name: 'Iron Helmet', cat: 'armor', slot: 'head', armor: 0.12, warmth: 1, shape: 'helmet', color: '#c9d1d9', desc: 'Heavy protection.' });
def('iron_chestplate', { name: 'Iron Chestplate', cat: 'armor', slot: 'chest', armor: 0.22, warmth: 2, shape: 'chest', color: '#c9d1d9', desc: 'Stops a lot of lead.' });
def('iron_greaves', { name: 'Iron Greaves', cat: 'armor', slot: 'legs', armor: 0.14, warmth: 1, shape: 'pants', color: '#c9d1d9', desc: 'Leg guards.' });
def('iron_boots', { name: 'Iron Boots', cat: 'armor', slot: 'feet', armor: 0.07, warmth: 1, shape: 'boots', color: '#c9d1d9', desc: 'Clanky.' });

// ---- Deployables
def('campfire', { name: 'Campfire', cat: 'deploy', stack: 5, shape: 'campfire', color: '#ff8a3c', deploy: 'campfire', desc: 'Cook food, stay warm, light the night.' });
def('furnace', { name: 'Furnace', cat: 'deploy', stack: 3, shape: 'furnace', color: '#8a8f96', deploy: 'furnace', desc: 'Smelts ore into ingots.' });
def('workbench_1', { name: 'Workbench I', cat: 'deploy', stack: 2, shape: 'bench', color: '#b98a54', deploy: 'workbench_1', desc: 'Unlocks tier-1 crafting nearby.' });
def('workbench_2', { name: 'Workbench II', cat: 'deploy', stack: 2, shape: 'bench', color: '#7d8791', deploy: 'workbench_2', desc: 'Weapons, armor and machines.' });
def('sleeping_bag', { name: 'Sleeping Bag', cat: 'deploy', stack: 3, shape: 'bag', color: '#d6743a', deploy: 'sleeping_bag', desc: 'Sets your respawn point.' });
def('storage_box', { name: 'Storage Box', cat: 'deploy', stack: 5, shape: 'box', color: '#b98a54', deploy: 'storage_box', desc: '18 slots.' });
def('large_box', { name: 'Large Chest', cat: 'deploy', stack: 3, shape: 'chest3', color: '#8a5a3a', deploy: 'large_box', desc: '36 slots.' });
def('code_lock', { name: 'Code Lock', cat: 'deploy', stack: 5, shape: 'lock', color: '#d9b84a', deploy: 'lock', desc: 'Use on a door or box. Set a 4-digit code.' });
def('spike_barricade', { name: 'Spike Barricade', cat: 'deploy', stack: 10, shape: 'spikes', color: '#a8743f', deploy: 'spike_barricade', desc: 'Hurts anything that touches it.' });
def('turret', { name: 'Auto Turret', cat: 'deploy', stack: 2, shape: 'turret', color: '#5c6470', deploy: 'turret', desc: 'Shoots strangers on sight. Load it with ammo.' });
def('satchel', { name: 'Satchel Charge', cat: 'deploy', stack: 5, shape: 'satchel', color: '#7a6a4a', deploy: 'satchel', desc: 'Sticks to a structure. 8-second fuse. Blows up bases.' });

// ---- Blueprints (consume to learn a recipe)
const BPS = {
  bp_iron_tools: ['Iron Tools Blueprint', 'iron tools'],
  bp_revolver: ['Revolver Blueprint', 'revolver'],
  bp_smg: ['SMG Blueprint', 'smg'],
  bp_shotgun: ['Shotgun Blueprint', 'shotgun'],
  bp_rifle: ['Rifle Blueprint', 'rifle'],
  bp_iron_armor: ['Iron Armor Blueprint', 'iron armor'],
  bp_turret: ['Turret Blueprint', 'auto turret'],
  bp_satchel: ['Satchel Blueprint', 'satchel charge'],
};
for (const [id, [name, what]] of Object.entries(BPS)) def(id, { name, cat: 'bp', stack: 1, shape: 'bp', color: '#4aa3e8', learn: id, desc: `Use to learn how to craft: ${what}.` });

export const ITEMS = I;
export const item = (id) => I[id];

// ---------------- Resource nodes
// tool: axe | pick | hand. req: minimum tool power to harvest.
export const NODES = {
  tree_pine: { name: 'Pine Tree', tool: 'axe', hp: 220, req: 0, drops: [['wood', 6]], xp: 2, r: 0.55, respawn: 900 },
  tree_oak: { name: 'Oak Tree', tool: 'axe', hp: 260, req: 0, drops: [['wood', 7]], xp: 2, r: 0.7, respawn: 900 },
  tree_palm: { name: 'Palm Tree', tool: 'axe', hp: 150, req: 0, drops: [['wood', 5], ['fiber', 1]], xp: 2, r: 0.4, respawn: 900 },
  tree_dead: { name: 'Dead Tree', tool: 'axe', hp: 120, req: 0, drops: [['wood', 5]], xp: 1, r: 0.4, respawn: 900 },
  cactus: { name: 'Cactus', tool: 'axe', hp: 60, req: 0, drops: [['fiber', 4]], xp: 1, r: 0.45, respawn: 600, thorns: 3 },
  rock: { name: 'Boulder', tool: 'pick', hp: 320, req: 0, drops: [['stone', 6]], xp: 2, r: 1.1, respawn: 1000 },
  ore_iron: { name: 'Iron Vein', tool: 'pick', hp: 420, req: 20, drops: [['iron_ore', 4], ['stone', 2]], xp: 5, r: 1.1, respawn: 1500 },
  ore_sulfur: { name: 'Sulfur Vein', tool: 'pick', hp: 380, req: 20, drops: [['sulfur_ore', 4], ['stone', 2]], xp: 5, r: 1.0, respawn: 1500 },
  bush_berry: { name: 'Berry Bush', tool: 'hand', hp: 30, req: 0, drops: [['berries', 4], ['fiber', 1]], seedDrop: [['corn_seed', 0.12], ['pumpkin_seed', 0.06]], xp: 1, r: 0, respawn: 420 },
  fiber_plant: { name: 'Wild Hemp', tool: 'hand', hp: 24, req: 0, drops: [['fiber', 6]], xp: 1, r: 0, respawn: 300 },
};
export const nodeDef = (t) => NODES[t];

// ---------------- Deployable definitions
export const DEPLOY = {
  campfire: { name: 'Campfire', hp: 100, r: 0.6, solid: false, slots: 5, fuel: true, device: 'campfire', burn: 10 },
  furnace: { name: 'Furnace', hp: 300, r: 0.8, solid: true, slots: 7, fuel: true, device: 'furnace', burn: 12 },
  workbench_1: { name: 'Workbench I', hp: 300, r: 1.0, solid: true, bench: 1 },
  workbench_2: { name: 'Workbench II', hp: 500, r: 1.0, solid: true, bench: 2 },
  sleeping_bag: { name: 'Sleeping Bag', hp: 80, r: 0.6, solid: false, bag: true },
  storage_box: { name: 'Storage Box', hp: 200, r: 0.55, solid: true, slots: 18, lockable: true },
  large_box: { name: 'Large Chest', hp: 400, r: 0.8, solid: true, slots: 36, lockable: true },
  spike_barricade: { name: 'Spike Barricade', hp: 200, r: 0.9, solid: false, spikes: 8 },
  turret: { name: 'Auto Turret', hp: 400, r: 0.5, solid: true, slots: 3, turret: true },
  satchel: { name: 'Satchel Charge', hp: 20, r: 0.3, solid: false, fuse: 8 },
  loot_bag: { name: 'Loot Bag', hp: 1, r: 0.4, solid: false, slots: 36, corpse: true },
};

// device -> input item -> [output item, seconds]
export const SMELT = {
  furnace: { iron_ore: ['iron_ingot', 8] },
  campfire: { raw_meat: ['cooked_meat', 10] },
};

// ---------------- Crops
export const CROPS = {
  corn: { name: 'Corn', seed: 'corn_seed', yield: [['corn', 3], ['corn_seed', 1]], grow: 360 },
  pumpkin: { name: 'Pumpkin', seed: 'pumpkin_seed', yield: [['pumpkin', 2], ['pumpkin_seed', 1]], grow: 540 },
};

// ---------------- Recipes
// bench: 0 hand, 1 workbench I, 2 workbench II. gate: { level, bp }
export const RECIPES = [
  // Hand
  { id: 'stone_hatchet', out: 'stone_hatchet', n: 1, ing: { wood: 30, stone: 20 }, time: 6, bench: 0, xp: 6 },
  { id: 'stone_pickaxe', out: 'stone_pickaxe', n: 1, ing: { wood: 30, stone: 25 }, time: 6, bench: 0, xp: 6 },
  { id: 'torch', out: 'torch', n: 1, ing: { wood: 20, fiber: 5 }, time: 3, bench: 0, xp: 2 },
  { id: 'campfire', out: 'campfire', n: 1, ing: { wood: 50, stone: 10 }, time: 5, bench: 0, xp: 4 },
  { id: 'hammer', out: 'hammer', n: 1, ing: { wood: 40, stone: 15 }, time: 5, bench: 0, xp: 4 },
  { id: 'cloth', out: 'cloth', n: 1, ing: { fiber: 10 }, time: 2, bench: 0, xp: 1 },
  { id: 'bandage', out: 'bandage', n: 1, ing: { cloth: 3 }, time: 3, bench: 0, xp: 2 },
  { id: 'stone_spear', out: 'stone_spear', n: 1, ing: { wood: 40, stone: 15, fiber: 10 }, time: 6, bench: 0, xp: 5 },
  { id: 'bow', out: 'bow', n: 1, ing: { wood: 50, fiber: 25 }, time: 8, bench: 0, xp: 6 },
  { id: 'arrow', out: 'arrow', n: 4, ing: { wood: 8, stone: 4 }, time: 3, bench: 0, xp: 1 },
  { id: 'sleeping_bag', out: 'sleeping_bag', n: 1, ing: { cloth: 15, fiber: 20 }, time: 8, bench: 0, xp: 5, gate: { level: 2 } },
  { id: 'storage_box', out: 'storage_box', n: 1, ing: { wood: 80 }, time: 6, bench: 0, xp: 4 },
  { id: 'workbench_1', out: 'workbench_1', n: 1, ing: { wood: 120, stone: 40, fiber: 20 }, time: 10, bench: 0, xp: 12 },
  { id: 'spike_barricade', out: 'spike_barricade', n: 1, ing: { wood: 60, fiber: 10 }, time: 5, bench: 0, xp: 3 },
  // Workbench I
  { id: 'furnace', out: 'furnace', n: 1, ing: { stone: 120, wood: 30 }, time: 10, bench: 1, xp: 10 },
  { id: 'large_box', out: 'large_box', n: 1, ing: { wood: 180, iron_ingot: 8 }, time: 10, bench: 1, xp: 8 },
  { id: 'code_lock', out: 'code_lock', n: 1, ing: { iron_ingot: 6, scrap: 3 }, time: 6, bench: 1, xp: 6 },
  { id: 'gunpowder', out: 'gunpowder', n: 2, ing: { sulfur_ore: 2, wood: 4 }, time: 4, bench: 1, xp: 2 },
  { id: 'cloth_hood', out: 'cloth_hood', n: 1, ing: { cloth: 8 }, time: 6, bench: 1, xp: 4 },
  { id: 'cloth_shirt', out: 'cloth_shirt', n: 1, ing: { cloth: 16 }, time: 8, bench: 1, xp: 5 },
  { id: 'cloth_pants', out: 'cloth_pants', n: 1, ing: { cloth: 12 }, time: 7, bench: 1, xp: 5 },
  { id: 'cloth_boots', out: 'cloth_boots', n: 1, ing: { cloth: 8, hide: 2 }, time: 6, bench: 1, xp: 4 },
  { id: 'iron_hatchet', out: 'iron_hatchet', n: 1, ing: { iron_ingot: 12, wood: 30 }, time: 10, bench: 1, xp: 12, gate: { bp: 'bp_iron_tools' } },
  { id: 'iron_pickaxe', out: 'iron_pickaxe', n: 1, ing: { iron_ingot: 14, wood: 30 }, time: 10, bench: 1, xp: 12, gate: { bp: 'bp_iron_tools' } },
  { id: 'machete', out: 'machete', n: 1, ing: { iron_ingot: 15, wood: 20, cloth: 4 }, time: 10, bench: 1, xp: 14, gate: { bp: 'bp_iron_tools' } },
  { id: 'workbench_2', out: 'workbench_2', n: 1, ing: { wood: 200, stone: 100, iron_ingot: 30 }, time: 15, bench: 1, xp: 25, gate: { level: 4 } },
  { id: 'medkit', out: 'medkit', n: 1, ing: { cloth: 8, bandage: 2, iron_ingot: 2 }, time: 8, bench: 1, xp: 6, gate: { level: 3 } },
  // Workbench II
  { id: 'revolver', out: 'revolver', n: 1, ing: { iron_ingot: 25, wood: 15, scrap: 5 }, time: 15, bench: 2, xp: 25, gate: { bp: 'bp_revolver' } },
  { id: 'smg', out: 'smg', n: 1, ing: { iron_ingot: 45, wood: 20, scrap: 15 }, time: 22, bench: 2, xp: 40, gate: { bp: 'bp_smg' } },
  { id: 'shotgun', out: 'shotgun', n: 1, ing: { iron_ingot: 40, wood: 35, scrap: 10 }, time: 20, bench: 2, xp: 35, gate: { bp: 'bp_shotgun' } },
  { id: 'rifle', out: 'rifle', n: 1, ing: { iron_ingot: 55, wood: 30, scrap: 20 }, time: 25, bench: 2, xp: 45, gate: { bp: 'bp_rifle' } },
  { id: 'pistol_ammo', out: 'pistol_ammo', n: 8, ing: { iron_ingot: 1, gunpowder: 3 }, time: 4, bench: 2, xp: 2 },
  { id: 'shell', out: 'shell', n: 4, ing: { iron_ingot: 1, gunpowder: 4 }, time: 4, bench: 2, xp: 2 },
  { id: 'rifle_ammo', out: 'rifle_ammo', n: 5, ing: { iron_ingot: 2, gunpowder: 4 }, time: 5, bench: 2, xp: 3 },
  { id: 'iron_helmet', out: 'iron_helmet', n: 1, ing: { iron_ingot: 25, cloth: 5 }, time: 12, bench: 2, xp: 15, gate: { bp: 'bp_iron_armor' } },
  { id: 'iron_chestplate', out: 'iron_chestplate', n: 1, ing: { iron_ingot: 45, cloth: 8 }, time: 16, bench: 2, xp: 20, gate: { bp: 'bp_iron_armor' } },
  { id: 'iron_greaves', out: 'iron_greaves', n: 1, ing: { iron_ingot: 30, cloth: 6 }, time: 14, bench: 2, xp: 16, gate: { bp: 'bp_iron_armor' } },
  { id: 'iron_boots', out: 'iron_boots', n: 1, ing: { iron_ingot: 20, hide: 3 }, time: 10, bench: 2, xp: 12, gate: { bp: 'bp_iron_armor' } },
  { id: 'turret', out: 'turret', n: 1, ing: { iron_ingot: 60, scrap: 25, gunpowder: 20 }, time: 25, bench: 2, xp: 30, gate: { bp: 'bp_turret' } },
  { id: 'satchel', out: 'satchel', n: 1, ing: { gunpowder: 40, cloth: 10, iron_ingot: 5 }, time: 15, bench: 2, xp: 20, gate: { bp: 'bp_satchel' } },
];
export const RECIPE = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// ---------------- Loot tables: [item, weight, min, max]
export const LOOT = {
  barrel: { rolls: [1, 2], items: [['scrap', 30, 2, 8], ['wood', 20, 10, 30], ['cloth', 18, 2, 6], ['water_bottle', 10, 1, 1], ['soda', 8, 1, 2], ['canned_beans', 8, 1, 2], ['stone', 10, 10, 30], ['pistol_ammo', 4, 4, 10]] },
  crate: { rolls: [2, 4], items: [['scrap', 24, 3, 10], ['iron_ingot', 10, 2, 8], ['cloth', 14, 3, 10], ['canned_beans', 12, 1, 3], ['bandage', 10, 1, 3], ['pistol_ammo', 10, 6, 16], ['arrow', 8, 6, 16], ['corn_seed', 6, 2, 5], ['pumpkin_seed', 4, 2, 4], ['gunpowder', 6, 4, 12], ['stone_spear', 3, 1, 1], ['revolver', 1.2, 1, 1], ['bp_iron_tools', 2.2, 1, 1], ['medkit', 1.5, 1, 1], ['shell', 3, 2, 6]] },
  military: { rolls: [3, 5], items: [['iron_ingot', 16, 5, 15], ['scrap', 20, 8, 20], ['gunpowder', 14, 8, 20], ['pistol_ammo', 12, 10, 30], ['shell', 8, 4, 10], ['rifle_ammo', 8, 5, 12], ['medkit', 6, 1, 2], ['bandage', 8, 2, 4], ['iron_helmet', 1.2, 1, 1], ['smg', 1.2, 1, 1], ['shotgun', 1.4, 1, 1], ['rifle', 0.8, 1, 1], ['bp_revolver', 3.5, 1, 1], ['bp_smg', 2.2, 1, 1], ['bp_shotgun', 2.6, 1, 1], ['bp_rifle', 1.6, 1, 1], ['bp_iron_armor', 2.2, 1, 1], ['bp_turret', 1.2, 1, 1], ['bp_satchel', 1.2, 1, 1], ['bp_iron_tools', 3, 1, 1]] },
  farm: { rolls: [2, 3], items: [['corn_seed', 20, 2, 6], ['pumpkin_seed', 14, 2, 5], ['corn', 12, 2, 5], ['pumpkin', 8, 1, 2], ['cloth', 10, 2, 6], ['stone_hatchet', 3, 1, 1], ['water_bottle', 10, 1, 2]] },
  raider: { rolls: [1, 3], items: [['pistol_ammo', 30, 6, 20], ['shell', 10, 3, 8], ['scrap', 20, 3, 10], ['bandage', 14, 1, 2], ['canned_beans', 10, 1, 2], ['revolver', 3, 1, 1], ['bp_revolver', 3, 1, 1], ['cloth_shirt', 6, 1, 1], ['iron_ingot', 8, 2, 6]] },
};

// ---------------- Progression
export const MAX_LEVEL = 30;
export const xpForLevel = (lvl) => Math.round(80 * Math.pow(lvl, 1.55)); // xp to go from lvl -> lvl+1
export const PERKS = {
  gather: { name: 'Forager', desc: '+12% resources per rank when gathering.', max: 5 },
  vital: { name: 'Toughness', desc: '+8 max health per rank.', max: 5 },
  endure: { name: 'Endurance', desc: '+10 max stamina and slower hunger per rank.', max: 5 },
  brawn: { name: 'Brawn', desc: '+5% weapon damage per rank.', max: 5 },
  craft: { name: 'Artisan', desc: '-10% crafting time per rank.', max: 5 },
  scav: { name: 'Scavenger', desc: '+10% extra loot from containers per rank.', max: 5 },
};

// ---------------- Server rule presets
export const MODES = {
  survival: { label: 'Survival (PvP)', pvp: true, raiding: true, friendlyFire: false, mobs: true, deathDrop: 'all', gatherRate: 1, lootRate: 1, dayLength: 1200, decay: true },
  cooperative: { label: 'Cooperative (PvE)', pvp: false, raiding: false, friendlyFire: false, mobs: true, deathDrop: 'all', gatherRate: 1.5, lootRate: 1.25, dayLength: 1200, decay: false },
  relaxed: { label: 'Relaxed (PvE, keep gear)', pvp: false, raiding: false, friendlyFire: false, mobs: true, deathDrop: 'none', gatherRate: 2.5, lootRate: 2, dayLength: 1800, decay: false },
  hardcore: { label: 'Hardcore (PvP, raid)', pvp: true, raiding: true, friendlyFire: true, mobs: true, deathDrop: 'all', gatherRate: 0.7, lootRate: 0.8, dayLength: 900, decay: true },
};
export const RULE_KEYS = ['pvp', 'raiding', 'friendlyFire', 'mobs', 'deathDrop', 'gatherRate', 'lootRate', 'dayLength', 'decay'];

export function itemName(id) { return I[id]?.name || id; }
export function canStack(id) { return (I[id]?.stack || 1) > 1; }

// Harden lookups: client-supplied ids like "__proto__" / "constructor" must never resolve to anything.
for (const o of [ITEMS, NODES, DEPLOY, SMELT, CROPS, LOOT, PERKS, MODES, RECIPE]) Object.setPrototypeOf(o, null);

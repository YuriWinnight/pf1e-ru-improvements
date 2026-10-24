import { MATERIALS, materialStats } from "./special-materials-data.js";
const armor = ["lightArmor", "mediumArmor", "heavyArmor"], weapons = ["weapon", "ammo"];
// Prices are from the user's SPECIAL MATERIAL descriptions, not finished items.
export const EQUIPMENT_MATERIALS = {
  adamantine: { kinds: [...weapons, ...armor, "shield"], prices: { weapon: 3000, ammo: 60, lightArmor: 5000, mediumArmor: 10000, heavyArmor: 15000 }, masterwork: true },
  abysium: { kinds: [...weapons, ...armor, "shield"] },
  silver: { kinds: weapons, prices: { ammo: 2 }, weaponPrices: { light: 20, "1h": 90, "2h": 180 } },
  angelskin: { kinds: armor.slice(0, 2), prices: { lightArmor: 1000, mediumArmor: 2000 }, masterwork: true },
  aszite: { kinds: armor, prices: { lightArmor: 750, mediumArmor: 750, heavyArmor: 1000 } },
  wyroot: { kinds: ["weapon"], grades: [1000, 2000, 4000] },
  viridium: { kinds: weapons, prices: { weapon: 200, ammo: 20 } },
  horacalcum: { kinds: [...weapons, ...armor], prices: { weapon: 6000, lightArmor: 10000, mediumArmor: 30000, heavyArmor: 60000 }, masterwork: true },
  "griffon-mane": { kinds: ["lightArmor"], prices: { lightArmor: 200 } },
  dragonhide: { kinds: [...armor, "shield"], priceMode: "doubleMasterwork", masterwork: true },
  "living-steel": { kinds: [...weapons, ...armor, "shield"], prices: { weapon: 500, ammo: 10, lightArmor: 500, mediumArmor: 1000, heavyArmor: 1000, shield: 100 } },
  "fire-forged": { kinds: [...weapons, ...armor], prices: { weapon: 600, ammo: 15, lightArmor: 1000, mediumArmor: 2500, heavyArmor: 3000 }, masterwork: true },
  dace: { kinds: weapons, prices: { weapon: 10000, ammo: 300 } },
  greenwood: { kinds: [...weapons, "shield"], perPound: 50, masterwork: true, separateMasterwork: true },
  "blight-quartz": { kinds: weapons, prices: { weapon: 2500, ammo: 200 } },
  "blood-crystal": { kinds: weapons, prices: { weapon: 1500, ammo: 30 } },
  mithral: { kinds: [...weapons, ...armor, "shield"], prices: { lightArmor: 1000, mediumArmor: 4000, heavyArmor: 9000, shield: 1000 }, perPound: 500, masterwork: true, acp: 3, dex: 2, asf: -10, lighter: true },
  noqual: { kinds: ["weapon", ...armor, "shield"], prices: { weapon: 500, lightArmor: 4000, mediumArmor: 8000, heavyArmor: 12000, shield: 2000 }, acp: 3, dex: 2, asf: 20, lighter: true },
  whipwood: { kinds: ["weapon"], prices: { weapon: 500 } },
  "singing-steel": { kinds: ["weapon", ...armor, "shield"], prices: { weapon: 6000, lightArmor: 750, mediumArmor: 9000, heavyArmor: 12000, shield: 7000 }, masterwork: true, acp: 1, dex: 1, asf: -5, lighter: true },
  sunsilver: { kinds: [...weapons, ...armor, "shield"], perPound: 25, masterwork: true, separateMasterwork: true },
  voidglass: { kinds: ["weapon", ...armor, "shield"], prices: { weapon: 1000, lightArmor: 1000, mediumArmor: 2000, heavyArmor: 4500, shield: 3000 } },
  darkwood: { kinds: [...weapons, "shield"], perPound: 10, masterwork: true, separateMasterwork: true, shieldAcp: 2 },
  darkleaf: { kinds: armor.slice(0, 2), prices: { lightArmor: 1000, mediumArmor: 2000 }, masterwork: true, acp: 3, dex: 2, asf: -10, minAsf: 5 },
  "frost-forged": { kinds: [...weapons, ...armor], prices: { weapon: 600, ammo: 15, lightArmor: 1000, mediumArmor: 2500, heavyArmor: 3000 }, masterwork: true },
  "cold-iron": { kinds: weapons, priceMode: "doubleBase" },
  "eel-hide": { kinds: armor.slice(0, 2), prices: { lightArmor: 1200, mediumArmor: 1800 }, masterwork: true, acp: 1, dex: 1 },
  "elysian-bronze": { kinds: [...weapons, ...armor], prices: { weapon: 1000, ammo: 20, lightArmor: 1000, mediumArmor: 2000, heavyArmor: 3000 } }
};
export function gearKind(type, system) {
  if (type === "equipment") return system.subType === "shield" ? "shield" : armor.includes(system.equipmentSubtype) ? system.equipmentSubtype : null;
  if (type === "loot" && system.subType === "ammo") return "ammo";
  return ["weapon", "attack"].includes(type) ? "weapon" : null;
}
export function availableMaterials(type, system) {
  const kind = gearKind(type, system);
  return MATERIALS.filter(m => EQUIPMENT_MATERIALS[m.id]?.kinds.includes(kind));
}
export function equipmentStats(config, system, type, enhancement) {
  const kind = gearKind(type, system), rule = EQUIPMENT_MATERIALS[config.id] ?? {};
  const base = config.base, enh = Math.max(0, Number(enhancement) || 0), isArmor = type === "equipment";
  const stats = materialStats(base, config.id, enh, isArmor);
  for (const key of ["hp", "hardness", "weight"]) {
    const n = config.manual?.[key];
    if (Number.isFinite(n)) stats[key] = Math.max(0, n + (key === "weight" ? 0 : (enh - (config.manual.enhancement ?? enh)) * (key === "hp" ? 10 : 2)));
  }
  const requiredMasterwork = Boolean(rule.masterwork || enh > 0);
  stats.masterwork = Boolean(requiredMasterwork || config.masterworkChoice);
  const mwPrice = kind === "ammo" ? 6 : isArmor ? 150 : system.properties?.dbl ? 600 : 300;
  let surcharge = !config.id ? 0 : rule.prices?.[kind] ?? (kind === "weapon" ? rule.weaponPrices?.[system.weaponSubtype] : undefined);
  if (config.id === "silver" && kind === "weapon" && system.properties?.dbl) surcharge = config.silverEnds === 1 ? 90 : 180;
  if (surcharge == null && rule.perPound != null) surcharge = base.weight * rule.perPound;
  if (rule.grades) surcharge = rule.grades[Math.max(0, Math.min(2, (config.grade ?? 1) - 1))];
  if (rule.priceMode === "doubleBase") surcharge = base.price;
  if (rule.priceMode === "doubleMasterwork") surcharge = base.price + mwPrice * 2;
  if (config.id === "viridium" && config.reinforced) surcharge += kind === "ammo" ? 20 : 1000;
  stats.priceUnknown = surcharge == null;
  if (Number.isFinite(config.materialPrice)) { surcharge = config.materialPrice; stats.priceUnknown = false; }
  const mw = stats.masterwork && (!rule.masterwork || rule.separateMasterwork) ? mwPrice : 0;
  const magic = enh ** 2 * (isArmor ? 1000 : 2000) / (kind === "ammo" ? 50 : 1);
  // Cold iron's one-time magic surcharge is part of the price, not a cumulative update.
  const specialMagic = config.id === "cold-iron" && enh > 0 ? 2000 / (kind === "ammo" ? 50 : 1) : 0;
  stats.price = Math.round((base.price + (surcharge ?? 0) + mw + magic + specialMagic) * 100) / 100;
  stats.priceParts = { base: base.price, material: surcharge ?? 0, masterwork: mw, enhancement: magic, specialMagic };
  if (isArmor) {
    const materialReduction = kind === "shield" ? (rule.shieldAcp ?? rule.acp ?? 0) : rule.acp ?? 0;
    const reduction = Math.max(rule.masterwork ? 1 : 0, materialReduction) + (stats.masterwork && !rule.masterwork ? 1 : 0);
    stats.acp = Math.sign(base.acp || 1) * Math.max(0, Math.abs(base.acp ?? 0) - reduction);
    stats.dex = base.dex == null ? null : base.dex + (rule.dex ?? 0);
    stats.spellFailure = Math.min(100, Math.max(Math.min(base.spellFailure ?? 0, rule.minAsf ?? 0), (base.spellFailure ?? 0) + (rule.asf ?? 0)));
    stats.ac = base.ac ?? 0; // Enhancement AC is already added by PF1, never add it twice here.
  }
  return stats;
}

// Pure PF1 damage rules. No documents or mutable actor data are used here.
export const PHYSICAL = ["slashing", "piercing", "bludgeoning"];
export const ENERGY = ["fire", "cold", "electric", "acid", "sonic"];
const aliases = {
  slashing: ["режущий", "режущее", "рубящий", "s"], piercing: ["колющий", "колющее", "p"],
  bludgeoning: ["дробящий", "дробящее", "b"], fire: ["огонь", "огненный", "огню"],
  cold: ["холод", "холоду"], electric: ["electricity", "электричество", "электричеству"],
  acid: ["кислота", "кислоте"], sonic: ["звук", "звуковой", "звуку"],
  force: ["сила", "силовой"], positive: ["позитивный", "положительная энергия"],
  negative: ["негативный", "отрицательная энергия"], untyped: ["без типа"],
  precision: ["точный", "точный урон"], nonlethal: ["нелетальный", "несмертельный"],
  coldIron: ["cold iron", "coldiron", "холодное железо", "холодным железом"],
  silver: ["серебро", "алхимическое серебро", "alchemical silver", "mithral", "мифрал"],
  adamantine: ["адамантин", "адамантиновый"], magic: ["магия", "магическое", "магический", "magical"],
  good: ["добро", "добром", "добрый"], evil: ["зло", "злом", "злой"],
  lawful: ["law", "порядок", "порядком", "закон", "принципиальность"],
  chaotic: ["chaos", "хаос", "хаосом", "хаотичность"],
  physical: ["физический", "физический урон"], energy: ["энергия", "стихии"],
  all: ["все", "любой урон"], "-": ["—", "–", "nothing", "ничем"]
};
const normalize = v => String(v ?? "").trim().toLowerCase().replaceAll("ё", "е").replaceAll("-", " ").replace(/\s+/g, " ");
export function damageKey(value) {
  if (["-", "—", "–"].includes(String(value).trim())) return "-";
  const n = normalize(value);
  for (const [key, names] of Object.entries(aliases)) if ([key, ...names].some(v => normalize(v) === n)) return key;
  return null;
}
const splitEntries = text => String(text ?? "").split(/[;,\n]+/).map(v => v.trim()).filter(Boolean);
export function expression(value) {
  const s = String(value ?? "").trim();
  if (!s) return [["-"]];
  // OR of AND groups: both qualities are needed for "cold iron AND good".
  return s.split(/\s+(?:or|или)\s+|\s*[|,]\s*/i).map(group => group.split(/\s+(?:and|и)\s+|\s*&\s*/i).map(part => {
    const key = damageKey(part);
    if (!key) throw new Error(`Не распознано свойство защиты: «${part}». Уточните запись или введите итоговый урон вручную.`);
    return key;
  }));
}
export function resistanceEntries(trait, kind = "dr") {
  const result = [];
  for (const row of (typeof trait === "object" && Array.isArray(trait?.value) ? trait.value : [])) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Некорректное значение защиты.");
    if (!amount) continue;
    const types = (row.types ?? []).filter(Boolean);
    const groups = types.map(v => expression(v));
    const or = row.operator !== false && row.operator !== "false";
    let clauses = or ? groups.flat() : groups.reduce((a, b) => a.flatMap(x => b.map(y => [...x, ...y])), [[]]);
    if (!types.length) clauses = [["-"]];
    result.push({ amount, clauses });
  }
  const custom = typeof trait === "string" ? trait : trait?.custom;
  const entries = kind === "dr" ? String(custom ?? "").split(/[;\n]+|,(?=\s*(?:DR|СУ)?\s*\d+\s*\/)/i).map(s => s.trim()).filter(Boolean) : splitEntries(custom);
  for (const entry of entries) {
    let match = entry.match(/^(?:DR|СУ)?\s*(\d+)\s*\/\s*(.+)$/i);
    if (!match && kind !== "dr") {
      match = entry.match(/^(\d+)\s+(.+)$/);
      if (!match) { const m = entry.match(/^(.+?)\s+(\d+)$/); if (m) match = [m[0], m[2], m[1]]; }
    }
    if (!match) throw new Error(`Не распознана защита: «${entry}». Используйте, например, «10/холодное железо и добро» или «огонь 10».`);
    result.push({ amount: Number(match[1]), clauses: expression(match[2]) });
  }
  return result;
}
export function traitTypes(trait) {
  const values = [...(Array.isArray(trait?.value) ? trait.value : []), ...splitEntries(typeof trait === "string" ? trait : trait?.custom)];
  return new Set(values.map(v => {
    const key = damageKey(v);
    if (!key) throw new Error(`Не распознана невосприимчивость/уязвимость: «${v}». Введите итоговый урон вручную.`);
    return key;
  }));
}
export function bypassProperties(source = {}) {
  const props = new Set(source.alignments ?? []);
  const material = source.material;
  if (material === "cold-iron") props.add("coldIron");
  if (["silver", "mithral", "sunsilver", "singing-steel"].includes(material)) props.add("silver");
  if (material === "adamantine") props.add("adamantine");
  const enh = Number(source.enhancement) || 0;
  if (enh >= 1) props.add("magic");
  if (enh >= 3) { props.add("silver"); props.add("coldIron"); }
  if (enh >= 4) props.add("adamantine");
  if (enh >= 5) ["good", "evil", "lawful", "chaotic"].forEach(v => props.add(v));
  return props;
}
export const matches = (clauses, properties) => clauses.some(group => group.every(key => key !== "-" && properties.has(key)));
export function componentsFromRolls(rolls, nonlethal = false) {
  return rolls.map(r => {
    const type = r.options?.damageType ?? {};
    const types = [...(type.values ?? []), ...splitEntries(type.custom)].map(v => {
      const k = damageKey(v);
      if (![...PHYSICAL, ...ENERGY, "force", "positive", "negative", "untyped", "precision", "nonlethal"].includes(k)) throw new Error(`Не распознан тип урона: «${v}». Введите итоговый урон вручную.`);
      return k;
    });
    const total = Number(r.total);
    if (!Number.isFinite(total)) throw new Error("В броске нет числового результата урона.");
    return { amount: total, types: types.length ? types : ["untyped"], nonlethal: nonlethal || types.includes("nonlethal") };
  });
}
function hasType(set, types) {
  return set.has("all") || types.some(t => set.has(t)) || (types.some(t => PHYSICAL.includes(t)) && set.has("physical"))
    || (types.some(t => ENERGY.includes(t)) && set.has("energy"));
}
const typeNames = { slashing: 'режущий', piercing: 'колющий', bludgeoning: 'дробящий', fire: 'огонь', cold: 'холод',
  electric: 'электричество', acid: 'кислота', sonic: 'звук', force: 'сила', positive: 'положительная энергия',
  negative: 'отрицательная энергия', untyped: 'без типа', precision: 'точный урон', nonlethal: 'нелетальный урон',
  physical: 'физический урон', energy: 'энергия', all: 'любой урон' };
function matchingTypes(set, types) {
  return [...set].filter(type => hasType(new Set([type]), types)).map(type => typeNames[type] ?? type).join(', ');
}
export function describeDR(entry) {
  const names = { coldIron: "холодное железо", silver: "серебро", adamantine: "адамантин", magic: "магия",
    good: "добро", evil: "зло", lawful: "порядок", chaotic: "хаос", slashing: "режущий", piercing: "колющий", bludgeoning: "дробящий", "-": "—" };
  const condition = entry.clauses.map(group => {
    const text = group.map(type => names[type] ?? type).join(" и ");
    return group.length > 1 && entry.clauses.length > 1 ? `(${text})` : text;
  }).join(" или ");
  return `СУ ${entry.amount}/${condition}`;
}
export function calculateDamage({ components, source = {}, traits = {}, half = false }) {
  const dr = resistanceEntries(traits.dr), resistance = resistanceEntries(traits.eres, "energy");
  const immune = traitTypes(traits.di), vulnerable = traitTypes(traits.dv);
  const bypass = bypassProperties(source);
  const groups = new Map();
  const primaryTypes = components.find(p => p.types?.some(t => PHYSICAL.includes(t)))?.types.filter(t => PHYSICAL.includes(t)) ?? [];
  for (const part of components) {
    const types = [...new Set(part.types ?? ["untyped"])];
    if (types.every(t => ["precision", "nonlethal"].includes(t))) types.push(...(primaryTypes.length ? primaryTypes : ["untyped"]));
    const base = types.filter(t => !["precision", "nonlethal"].includes(t));
    if (base.length > 1 && !base.every(t => PHYSICAL.includes(t))) {
      throw new Error("В одной строке смешаны разные энергии или энергия с физическим уроном. Разделите формулы по типам либо введите итоговый урон вручную.");
    }
    const key = [...types].sort().join("|") + Boolean(part.nonlethal);
    const group = groups.get(key) ?? { types, nonlethal: Boolean(part.nonlethal), amount: 0 };
    group.amount += part.amount;
    groups.set(key, group);
  }
  const parts = [...groups.values()];
  if (source.weapon && dr.length && parts.some(p => p.types.includes("untyped") && p.amount > 0)) {
    throw new Error("Для физического урона оружия не указан тип. Выберите режущий, колющий или дробящий тип либо введите итог вручную.");
  }
  let original = parts.reduce((n, p) => n + p.amount, 0);
  // PF1's minimum weapon damage is one point of nonlethal damage.
  if (original < 1 && source.weapon) {
    parts.splice(0, parts.length, { amount: 1, types: parts[0]?.types ?? ["untyped"], nonlethal: true }); original = 1;
  }
  for (const p of parts) p.amount = Math.max(0, p.amount);
  // Halve the combined rolled total once, distributing the rounding deterministically.
  if (half) {
    let carry = 0;
    for (const p of parts) { const v = p.amount / 2 + carry; p.amount = Math.floor(v); carry = v - p.amount; }
  }
  const details = [];
  let absorbed = 0, drBypassed = false;
  for (const p of parts) {
    const before = p.amount;
    if (hasType(immune, p.types) || (p.nonlethal && immune.has("nonlethal"))) p.amount = 0;
    if (p.amount !== before) { absorbed += before; details.push(`Сработала невосприимчивость (${matchingTypes(immune, [...p.types, ...(p.nonlethal ? ['nonlethal'] : [])])}): −${before}`); }
  }
  // One resistance budget per energy per attack, even when separate damage dice have the same type.
  const energyTypes = [...new Set(parts.flatMap(p => p.types).filter(t => !PHYSICAL.includes(t) && !["precision", "nonlethal", "untyped"].includes(t)))];
  for (const type of energyTypes) {
    const props = new Set([type, ...(ENERGY.includes(type) ? ["energy"] : [])]);
    let remaining = Math.max(0, ...resistance.filter(r => matches(r.clauses, props)).map(r => r.amount));
    const rating = remaining;
    let reduced = 0;
    for (const p of parts.filter(p => p.types.includes(type))) { const n = Math.min(remaining, p.amount); p.amount -= n; remaining -= n; reduced += n; }
    if (reduced) { absorbed += reduced; details.push(`Сопротивление ${rating} (${typeNames[type] ?? type}): −${reduced}`); }
  }
  // Apply DR once to the physical attack, not separately to every damage row.
  if (source.weapon) {
    const physical = parts.filter(p => p.types.some(t => PHYSICAL.includes(t)));
    const properties = new Set([...bypass, ...physical.flatMap(p => p.types)]);
    const bypassed = physical.some(p => p.amount > 0) ? dr.filter(r => matches(r.clauses, properties)) : [];
    for (const entry of bypassed) details.push(`Преодолено ${describeDR(entry)}`);
    const blocking = dr.filter(r => !matches(r.clauses, properties));
    let remaining = Math.max(0, ...blocking.map(r => r.amount));
    const strongest = blocking.filter(r => r.amount === remaining);
    let reduced = 0;
    for (const p of physical) { const n = Math.min(remaining, p.amount); p.amount -= n; remaining -= n; reduced += n; }
    if (reduced) { absorbed += reduced; details.push(`Сработало ${strongest.map(describeDR).join('; ')}: −${reduced}`); }
    if (dr.length && bypassed.length === dr.length) drBypassed = true;
  }
  // Chosen PF1 table convention: resistance before vulnerability; see the documented
  // Paizo discussion and its D&D 3.5 precedent in MATERIALS-AND-DAMAGE.md.
  const remainders = new Map();
  for (const p of parts) if (hasType(vulnerable, p.types)) {
    const key = p.types.filter(t => !["precision", "nonlethal"].includes(t)).sort().join("|");
    const before = p.amount, value = p.amount * 1.5 + (remainders.get(key) ?? 0);
    p.amount = Math.floor(value); remainders.set(key, value - p.amount);
    if (p.amount !== before) details.push(`Задета уязвимость (${matchingTypes(vulnerable, p.types)}): +${p.amount - before}`);
  }
  return { original, absorbed, drBypassed, lethal: parts.filter(p => !p.nonlethal).reduce((n, p) => n + p.amount, 0),
    nonlethal: parts.filter(p => p.nonlethal).reduce((n, p) => n + p.amount, 0), details };
}
export function applyToHealth(hp, damage) {
  const nonlethal = Math.min(Math.max(0, hp.max - hp.nonlethal), damage.nonlethal);
  const lethal = damage.lethal + damage.nonlethal - nonlethal;
  const absorbed = Math.min(hp.temp, lethal);
  return { value: hp.value - lethal + absorbed, temp: hp.temp - absorbed, nonlethal: hp.nonlethal + nonlethal, max: hp.max };
}

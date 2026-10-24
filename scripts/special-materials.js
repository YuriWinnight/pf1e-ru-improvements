import { MATERIALS } from "./special-materials-data.js";
import { availableMaterials, equipmentStats, gearKind, EQUIPMENT_MATERIALS } from "./material-equipment-rules.js";
export const MODULE = "pf1e-ru-improvements";
export const ALIGNMENTS = { good: "Оружие добра", evil: "Оружие зла", chaotic: "Оружие хаотичности", lawful: "Оружие порядка" };
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = (o, p) => foundry.utils.getProperty(o, p);
export const materialConfig = item => item?.getFlag?.(MODULE, "material") ?? {};
const applicable = item => Boolean(gearKind(item?.type, item?._source?.system ?? item?.system ?? {}));
const enhancement = (item, system = item._source.system) => Number(item.type === "equipment" ? system.armor?.enh : system.enh) || 0;
export function initialMaterialConfig(item) {
  const sys = item._source.system, enh = enhancement(item), config = foundry.utils.deepClone(materialConfig(item));
  config.base = { hp: Number(sys.hp?.max) || 0, hardness: Number(sys.hardness) || 0, weight: Number(sys.weight?.value) || 0, steel: false, ...config.base };
  // Version 1 did not change price or armor statistics.
  config.base = { fragile: Boolean(sys.properties?.frg), price: Number(sys.price) || 0, acp: Number(sys.armor?.acp) || 0, dex: sys.armor?.dex ?? null, spellFailure: Number(sys.spellFailure) || 0, ac: Number(sys.armor?.value) || 0, ...config.base };
  config.masterworkChoice ??= Boolean(sys.masterwork);
  if (!config.manual) {
    config.manual = { hp: null, hardness: null, weight: null, enhancement: enh };
    for (const key of ["hp", "hardness", "weight"]) if (Number.isFinite(config.overrides?.[key]))
      config.manual[key] = config.overrides[key] + (key === "hp" ? enh * 10 : key === "hardness" ? enh * 2 : 0);
  }
  config.id ??= ""; config.version = 2; config.enabled = true;
  return config;
}
function materialDialog(item) {
  const config = initialMaterialConfig(item), stats = equipmentStats(config, item._source.system, item.type, enhancement(item));
  const field = (key, label, value, placeholder = "") => `<div class="form-group"><label>${label}</label><input type="number" min="0" step="any" name="${key}" value="${escapeHTML(value ?? "")}" placeholder="${escapeHTML(placeholder)}"></div>`;
  new Dialog({ title: `Ручная настройка: ${item.name}`, content: `<form class="pf1ru-material-editor">
    <p>Необязательные итоговые значения для текущего усиления. Пустое поле — автоматический расчёт. При смене материала уточнения сбрасываются.</p>
    ${field("hp", "Пункты прочности", config.manual.hp, stats.hp)}${field("hardness", "Твёрдость", config.manual.hardness, stats.hardness)}${field("weight", "Вес (фнт)", config.manual.weight, stats.weight)}
    <label><input type="checkbox" name="steel" ${config.base.steel ? "checked" : ""}> Исходный предмет стальной (для ПП адамантина)</label>
    <details><summary>Исходные параметры и цена</summary><p>Исходные значения должны быть без материала, усиления и искусной работы. Для уже улучшенного предмета проверьте их один раз.</p>
    ${field("baseHp", "Исходные пункты прочности", config.base.hp)}${field("baseHardness", "Исходная твёрдость", config.base.hardness)}${field("baseWeight", "Исходный вес (фнт)", config.base.weight)}${field("basePrice", "Исходная цена (зм)", config.base.price)}
    ${field("materialPrice", "Надбавка материала (зм)", config.materialPrice, stats.priceUnknown ? "Цена не задана в библиотеке" : "По описанию материала")}
    <p>Надбавка заменяет только стоимость материала. Искусная работа и усиление учитываются отдельно по правилам.</p></details></form>`, buttons: {
    save: { icon: '<i class="fas fa-save"></i>', label: "Сохранить", callback: async html => {
      const form = html[0].querySelector("form"); if (!form.reportValidity()) return false;
      const data = new FormData(form);
      for (const key of ["hp", "hardness", "weight"]) config.manual[key] = data.get(key) === "" ? null : Number(data.get(key));
      config.manual.enhancement = enhancement(item);
      for (const [key, name] of [["hp", "baseHp"], ["hardness", "baseHardness"], ["weight", "baseWeight"], ["price", "basePrice"]]) config.base[key] = Number(data.get(name));
      config.base.steel = data.has("steel"); config.materialPrice = data.get("materialPrice") === "" ? null : Number(data.get("materialPrice"));
      await item.update({ [`flags.${MODULE}.material`]: config });
    } }, cancel: { label: "Отмена" }
  } }, { width: 580, classes: ["dialog", "pf1ru-material-dialog"] }).render(true);
}
Hooks.on("renderItemSheet", (app, html) => {
  const item = app.item ?? app.object;
  if (game.system.id !== "pf1" || !applicable(item)) return;
  const root = html[0] ?? html, config = initialMaterialConfig(item), m = MATERIALS.find(m => m.id === config.id);
  const host = root.querySelector('.tab[data-tab="details"]') ?? root.querySelector(".item-properties");
  if (!host || root.querySelector(".pf1ru-material-controls")) return;
  const group = document.createElement("div"); group.className = "pf1ru-material-controls";
  group.innerHTML = `<h3 class="form-header">Особые материалы</h3><div class="form-group"><label>Особый материал</label><select class="pf1ru-material-select" ${!app.isEditable ? "disabled" : ""}><option value="">Обычный материал</option>${availableMaterials(item.type, item._source.system).map(m => `<option value="${m.id}" ${m.id === config.id ? "selected" : ""}>${m.name}</option>`).join("")}</select></div>
    ${config.id === "wyroot" ? `<div class="form-group"><label>Запас пунктов жизни вирута</label><select class="pf1ru-material-grade" ${!app.isEditable ? "disabled" : ""}>${[1, 2, 3].map(n => `<option value="${n}" ${n === (config.grade ?? 1) ? "selected" : ""}>${n}</option>`).join("")}</select></div>` : ""}
    ${config.id === "viridium" ? `<label class="checkbox"><input class="pf1ru-material-reinforced" type="checkbox" ${config.reinforced ? "checked" : ""} ${!app.isEditable ? "disabled" : ""}/> Устранить хрупкость (${gearKind(item.type, item._source.system) === "ammo" ? "+20" : "+1000"} зм)</label>` : ""}
    ${config.id === "silver" && item._source.system.properties?.dbl ? `<div class="form-group"><label>Серебрение двойного оружия</label><select class="pf1ru-material-ends" ${!app.isEditable ? "disabled" : ""}><option value="1" ${config.silverEnds === 1 ? "selected" : ""}>Один конец (+90 зм)</option><option value="2" ${config.silverEnds !== 1 ? "selected" : ""}>Оба конца (+180 зм)</option></select></div>` : ""}
    ${app.isEditable ? '<button type="button" class="pf1ru-material-manual"><i class="fas fa-edit"></i> Ручная настройка</button>' : ""}
    <p class="pf1ru-material-help">${escapeHTML(m ? `${m.note}` : "Материал, искусная работа и усиление пересчитываются от исходных параметров.")}</p>`;
  group.querySelector(".pf1ru-material-select").addEventListener("change", async event => {
    config.id = event.target.value; config.manual = { hp: null, hardness: null, weight: null, enhancement: enhancement(item) }; config.materialPrice = null;
    await item.update({ [`flags.${MODULE}.material`]: config });
  });
  group.querySelector(".pf1ru-material-grade")?.addEventListener("change", async event => {
    config.grade = Number(event.target.value); await item.update({ [`flags.${MODULE}.material`]: config });
  });
  group.querySelector(".pf1ru-material-reinforced")?.addEventListener("change", async event => { config.reinforced = event.target.checked; await item.update({ [`flags.${MODULE}.material`]: config }); });
  group.querySelector(".pf1ru-material-ends")?.addEventListener("change", async event => { config.silverEnds = Number(event.target.value); await item.update({ [`flags.${MODULE}.material`]: config }); });
  group.querySelector(".pf1ru-material-manual")?.addEventListener("click", () => materialDialog(item));
  const auraField = host.querySelector('[name="system.cl"], [name="system.aura.school"]')?.closest(".form-group");
  const auraHeader = auraField?.previousElementSibling;
  if (auraHeader?.matches("h3.form-header")) auraHeader.before(group); else host.append(group);
  if (materialConfig(item).enabled) {
    for (const input of root.querySelectorAll('[name="system.hp.max"], [name="system.hardness"], [name="system.weight.value"]')) {
      input.readOnly = true; input.title = "Изменяется через «Ручная настройка»";
    }
    for (const input of root.querySelectorAll('[name="system.price"], [data-attr-name="system.price"], .price-description-input')) {
      const tip = `Исходная цена без материала, усиления и искусной работы: ${config.base.price} зм`;
      input.title = tip; input.dataset.tooltip = tip;
    }
    if (equipmentStats(config, item._source.system, item.type, enhancement(item)).priceUnknown)
      group.querySelector(".pf1ru-material-help").append(" Для этого типа предмета надбавка материала не указана: используется базовая цена с учётом выбранной искусной работы и усиления.");
  }
});
Hooks.on("preUpdateItem", (item, change) => {
  if (game.system.id !== "pf1" || !applicable(item)) return;
  const expanded = foundry.utils.expandObject(change), old = materialConfig(item), sys = item._source.system;
  const incoming = get(expanded, `flags.${MODULE}.material`), enhPath = item.type === "equipment" ? "system.armor.enh" : "system.enh";
  const paths = [enhPath, "system.masterwork", "system.equipmentSubtype", "system.weaponSubtype", "system.properties.dbl"];
  if (!incoming && !paths.some(p => get(expanded, p) !== undefined && get(expanded, p) !== get(item._source, p))) return;
  const config = { ...initialMaterialConfig(item), ...incoming };
  if (Object.values(config.base).some(v => typeof v === "number" && !Number.isFinite(v))) return false;
  for (const key of ["hp", "hardness", "weight", "price"]) if (config.base[key] < 0) return false;
  const system = { ...sys, ...expanded.system, armor: { ...sys.armor, ...expanded.system?.armor }, properties: { ...sys.properties, ...expanded.system?.properties } };
  if (config.id && !availableMaterials(item.type, system).some(m => m.id === config.id)) { config.id = ""; config.manual = {}; config.materialPrice = null; }
  if (get(expanded, "system.masterwork") !== undefined && expanded.system.masterwork !== sys.masterwork) config.masterworkChoice = expanded.system.masterwork;
  const stats = equipmentStats(config, system, item.type, enhancement(item, system)), hp = sys.hp ?? { max: 0, value: 0 };
  const values = { "system.hp.max": stats.hp, "system.hp.value": Math.max(0, stats.hp - Math.max(0, hp.max - Number(get(expanded, "system.hp.value") ?? hp.value))), "system.hardness": stats.hardness, "system.price": stats.price, "system.masterwork": stats.masterwork };
  if (item.type !== "attack") values["system.weight.value"] = stats.weight;
  if (item.type === "weapon") values["system.properties.frg"] = config.id === "viridium" ? !config.reinforced : Boolean(config.base.fragile);
  if (item.type === "equipment") Object.assign(values, { "system.armor.acp": stats.acp, "system.armor.dex": stats.dex, "system.spellFailure": stats.spellFailure, "system.armor.value": stats.ac });
  const key = item.type === "equipment" ? "effectNotes" : "attackNotes";
  const notes = [...(get(expanded, `system.${key}`) ?? sys[key] ?? [])].filter(n => n !== old.note), m = MATERIALS.find(m => m.id === config.id);
  config.note = m ? `Особый материал: ${m.name}.` : "";
  if (config.note && !notes.includes(config.note)) notes.push(config.note);
  values[`system.${key}`] = notes;
  for (const [path, value] of Object.entries(values)) { if (change.system) foundry.utils.setProperty(change, path, value); else change[path] = value; }
  if (change.flags) foundry.utils.setProperty(change, `flags.${MODULE}.material`, config);
  else change[`flags.${MODULE}.material`] = config;
});
// Stored ACP is final: prevent PF1 subtracting masterwork a second time.
const lighterCategories = new WeakMap(), patched = new WeakSet();
export function materialArmorPenalties(wrapped, ...args) {
  const changed = [];
  for (const item of this.items ?? []) {
    const config = materialConfig(item);
    if (item.type !== "equipment" || !config.enabled || config.version !== 2) continue;
    changed.push([item, item.system.masterwork, item.system.equipmentSubtype]); item.system.masterwork = false;
    if (lighterCategories.has(item)) item.system.equipmentSubtype = lighterCategories.get(item);
  }
  try { return wrapped(...args); }
  finally { for (const [item, mw, type] of changed) { item.system.masterwork = mw; item.system.equipmentSubtype = type; } }
}
export function materialArmorMovement(wrapped, ...args) {
  const changed = [];
  for (const item of this.items ?? []) {
    const config = materialConfig(item), type = item.system.equipmentSubtype;
    if (item.type !== "equipment" || !config.enabled || config.version !== 2 || !EQUIPMENT_MATERIALS[config.id]?.lighter || lighterCategories.has(item)) continue;
    const lighter = { heavyArmor: "mediumArmor", mediumArmor: "lightArmor" }[type]; if (!lighter) continue;
    changed.push([item, type]); lighterCategories.set(item, type); item.system.equipmentSubtype = lighter;
  }
  try { return wrapped(...args); }
  finally { for (const [item, type] of changed) { item.system.equipmentSubtype = type; lighterCategories.delete(item); } }
}
Hooks.on("setup", () => {
  if (game.system.id !== "pf1") return;
  for (const type of ["character", "npc"]) {
    const cls = CONFIG.Actor.documentClasses?.[type]; if (!cls) continue;
    for (const [name, wrapper] of [["_applyArmorPenalties", materialArmorPenalties], ["prepareSpecificDerivedData", materialArmorMovement]]) {
      let proto = cls.prototype; while (proto && !Object.hasOwn(proto, name)) proto = Object.getPrototypeOf(proto);
      if (!proto || patched.has(proto[name])) continue;
      const original = proto[name]; proto[name] = function(...args) { return wrapper.call(this, original.bind(this), ...args); }; patched.add(proto[name]);
    }
  }
});
Hooks.on("renderAttackDialog", (app, html) => {
  const item = app.object?.item, root = html[0] ?? html;
  if (game.system.id !== "pf1" || !item?.isOwner || !["mwak", "rwak"].includes(app.object?.data?.actionType)) return;
  const host = root.querySelector(".flags"); if (!host) return;
  host.classList.add("pf1ru-attack-flags");
  if (!host.querySelector(".pf1ru-alignment")) {
    const state = app._pf1ruAlignments ?? { ...(item.getFlag(MODULE, "alignments") ?? {}) };
    app._pf1ruAlignments = state; app.object._pf1ruAlignments = state;
    // Direct native checkbox labels share the same columns, spacing and baseline.
    for (const [key, text] of Object.entries(ALIGNMENTS)) {
      const label = document.createElement("label"); label.className = "checkbox pf1ru-alignment";
      label.innerHTML = `<input type="checkbox" data-alignment="${key}" ${state[key] ? "checked" : ""}/> ${text}`;
      label.addEventListener("change", async event => {
        event.stopPropagation(); state[key] = event.target.checked;
        try { await item.setFlag(MODULE, `alignments.${key}`, state[key]); } catch (error) { console.error(MODULE, error); }
      }); host.append(label);
    }
  }
  // Foundry sizes the window before render hooks. Recalculate after every native
  // rerender too (haste, Power Attack, extra attacks), once our rows are present.
  if (!app._minimized) app.setPosition?.({ height: "auto" });
});

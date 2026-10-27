import { EQUIPMENT_MATERIALS } from './material-equipment-rules.js';
export const TEMPLATE_DEFAULTS = { templateDamageEnabled: true, templateAutoSaves: true, templateAutoDamage: false, templateExcludeTargets: true, templateSuccessDamage: 'half' };
const plain = value => String(value ?? '').trim().toLowerCase().replaceAll('ё', 'е');
export function evasionFor(actor) {
  let level = 0;
  for (const item of actor.items ?? []) {
    if (item.system?.disabled) continue;
    const names = plain(item.name).split('/').map(s => s.replace(/\s*\((?:ex|su|экс|св|э|с)\)\s*$/i, '').trim());
    if (names.some(n => ['уклонение+', 'уклонение +', 'improved evasion', 'улучшенное уклонение'].includes(n))) level = 2;
    else if (names.some(n => ['уклонение', 'evasion'].includes(n))) level = Math.max(level, 1);
  }
  if (!level) return { level: 0, note: '' };
  const conditions = actor.system?.attributes?.conditions ?? {};
  if (['helpless', 'unconscious', 'paralyzed'].some(k => conditions[k])) return { level: 0, note: 'Уклонение не действует: беспомощность' };
  let armor = 0;
  for (const item of actor.items ?? []) {
    if (item.type !== 'equipment' || !item.system.equipped || item.system.melded || item.system.subType !== 'armor') continue;
    let rank = { lightArmor: 1, mediumArmor: 2, heavyArmor: 3 }[item.system.equipmentSubtype] ?? 0;
    const material = item.getFlag?.('pf1e-ru-improvements', 'material');
    if (material?.enabled && EQUIPMENT_MATERIALS[material.id]?.lighter) rank = Math.max(1, rank - 1);
    armor = Math.max(armor, rank);
  }
  const ranger = [...(actor.items ?? [])].some(i => i.type === 'class' && /^(ranger|следопыт)(\s*\/|$)/i.test(i.name) && Number(i.system?.level) >= 9);
  if (armor > (ranger ? 2 : 1)) return { level: 0, note: 'Уклонение не действует: категория брони' };
  return { level, note: level === 2 ? 'Уклонение+' : 'Уклонение' };
}
export function saveSuccess(total, natural, dc) {
  if (![total, dc].every(Number.isFinite)) throw new Error('Не удалось определить результат испытания или СЛ.');
  if (natural === 1) return false;
  if (natural === 20) return true;
  return total >= dc;
}
export function successDamage(description, fallback = 'half') {
  const text = plain(description);
  if (/\bnegates\b|отменяет|отмена|без эффекта/.test(text)) return 'none';
  if (/\bhalf\b|половин/.test(text)) return 'half';
  return fallback;
}
export function targetDamageMode(plan, row) {
  if (row.excluded) return 'excluded';
  if (row.resistanceError) return null;
  if (row.resistance?.success === false) return 'none';
  if (['full', 'half', 'none'].includes(row.override)) return row.override;
  if (!plan.saveType) return 'full';
  if (typeof row.save?.success !== 'boolean') return null;
  const evasion = plan.saveType === 'ref' && plan.successMode === 'half' ? row.evasion?.level ?? 0 : 0;
  if (row.save.success) return evasion ? 'none' : plan.successMode;
  return evasion === 2 ? 'half' : 'full';
}
export function uniqueTemplateTargets(tokens) {
  const seen = new Set(), targets = [];
  for (const token of tokens) {
    const doc = token.document ?? token, actor = token.actor ?? doc.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid); targets.push(doc.uuid);
  }
  return targets;
}

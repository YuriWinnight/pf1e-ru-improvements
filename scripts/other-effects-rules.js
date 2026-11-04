export const EFFECT_FIELDS = {
  enhancement: 'Бонус усиления', weight: 'Вес (фнт)', hp: 'Пункты прочности', hardness: 'Твёрдость', price: 'Цена (зм)',
  ac: 'Класс брони', dex: 'Максимальная ловкость', acp: 'Штраф за доспехи', spellFailure: 'Провал мистического заклинания (%)'
};
export const armorEffectFields = new Set(['ac','dex','acp','spellFailure']);
export function effectTotals(effects = [], armor = false) {
  const total = Object.fromEntries(Object.keys(EFFECT_FIELDS).map(k=>[k,0]));
  for(const effect of effects) for(const key of Object.keys(total)) {
    if (!armor && armorEffectFields.has(key)) continue;
    const value = effect[key];
    if(value !== '' && value != null && Number.isFinite(Number(value))) total[key]+=Number(value);
  }
  return total;
}
export function applyEffectDeltas(stats, effects, armor) {
  const sum = effectTotals(effects,armor), result={...stats};
  for(const key of ['weight','hp','hardness','price','ac']) if(key in result) result[key]=Math.max(0,Math.round((result[key]+sum[key])*1000)/1000);
  if (armor) {
    if(result.dex!=null) result.dex+=sum.dex;
    result.acp=Math.sign(result.acp||1)*Math.max(0,Math.abs(result.acp)+sum.acp);
    result.spellFailure=Math.min(100,Math.max(0,result.spellFailure+sum.spellFailure));
  }
  result.effectTotals=sum;
  return result;
}

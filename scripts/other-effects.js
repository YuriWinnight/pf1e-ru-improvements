import { MODULE, initialMaterialConfig, escapeHTML as esc } from './special-materials.js';
import { equipmentStats } from './material-equipment-rules.js';
import { MATERIALS } from './special-materials-data.js';
import { EFFECT_FIELDS, armorEffectFields, effectTotals } from './other-effects-rules.js';
const clone = value => foundry.utils.deepClone(value);
const enhancement = item => Number(item.type==='equipment'?item._source.system.armor?.enh:item._source.system.enh)||0;
const isArmor = item => item.type==='equipment';

export async function saveOtherEffect(item, id, input) {
  const config=initialMaterialConfig(item), effects=clone(config.otherEffects??[]);
  const effect={id:id??foundry.utils.randomID(),name:String(input.name??'').trim()||'Новый эффект'};
  for(const key of Object.keys(EFFECT_FIELDS)) {
    if(!isArmor(item)&&armorEffectFields.has(key))continue;
    const value=input[key];
    effect[key]=value==null||String(value).trim()===''?null:Number(value);
    if(effect[key]!=null&&!Number.isFinite(effect[key]))throw Error('Введите число или оставьте поле пустым.');
    if(key==='enhancement'&&effect[key]!=null&&(!Number.isInteger(effect[key])||effect[key]<0))throw Error('Бонус усиления должен быть целым неотрицательным числом.');
  }
  const index=effects.findIndex(e=>e.id===id);
  if(id&&index<0)throw Error('Эффект уже удалён.');
  if(index<0)effects.push(effect);else effects[index]=effect;
  config.otherEffects=effects;
  await item.update({[`flags.${MODULE}.material`]:config});
}
export async function deleteOtherEffect(item,id) {
  const config=initialMaterialConfig(item);
  config.otherEffects=(config.otherEffects??[]).filter(e=>e.id!==id);
  await item.update({[`flags.${MODULE}.material`]:config});
}
function effectDialog(item,id=null) {
  const effect=initialMaterialConfig(item).otherEffects?.find(e=>e.id===id)??{};
  const field=(key,hint='')=>`<div class="form-group"><label><span>${EFFECT_FIELDS[key]}</span>${hint?`<small>${hint}</small>`:''}<input name="${key}" type="number" step="${key==='enhancement'?'1':'any'}" ${key==='enhancement'?'min="0"':''} placeholder="Без изменений" value="${esc(effect[key]??'')}"></label></div>`;
  new Dialog({title:id?'Редактировать иной эффект':'Добавить иной эффект',content:`<form class="pf1ru-other-effect-editor">
    <div class="form-group"><label><span>Название эффекта</span><input name="name" type="text" placeholder="Например: Облегчённый" value="${esc(effect.name??'')}"></label></div>
    <p class="pf1ru-effect-help">Укажите изменение: 2 прибавит 2, −2 вычтет 2. Пустое поле оставляет параметр без изменений.</p>
    <fieldset><legend><i class="fas fa-coins" aria-hidden="true"></i> Стоимость</legend>
      ${field('enhancement','Эквивалент свойства: влияет только на цену, не на атаку, урон, КБ, ПП или твёрдость.')}
      ${field('price','Отдельная прибавка или скидка к цене.')}
    </fieldset>
    <fieldset><legend><i class="fas fa-weight-hanging" aria-hidden="true"></i> Параметры предмета</legend>
      ${['weight','hp','hardness'].map(key=>field(key)).join('')}
    </fieldset>
    ${isArmor(item)?`<fieldset><legend><i class="fas fa-shield-alt" aria-hidden="true"></i> Защита</legend>
      ${field('ac')}${field('dex','Если ограничения нет, оно не добавляется.')}
      ${field('acp','Отрицательное изменение уменьшает штраф.')}${field('spellFailure')}
    </fieldset>`:''}</form>`,buttons:{
      save:{label:'Сохранить',icon:'<i class="fas fa-save"></i>',callback:async html=>{
        const form=html[0].querySelector('form');if(!form.reportValidity())return false;
        try{await saveOtherEffect(item,id,Object.fromEntries(new FormData(form)));}catch(error){ui.notifications.warn(error.message);}
      }},cancel:{label:'Отмена'}
    },default:'save'},{width:540,classes:['dialog','pf1ru-other-effect-dialog']}).render(true);
}

export function renderOtherEffects(item,app,materialGroup) {
  const config=initialMaterialConfig(item), effects=config.otherEffects??[], sum=effectTotals(effects,isArmor(item));
  // PF1 assigns height:100%/overflow:hidden to nested sections. In the Details
  // flex column those sections can shrink to zero when other controls fill it.
  const section=document.createElement('div');section.className='pf1ru-other-effects';
  section.innerHTML=`<h3 class="form-header">Иные эффекты ${app.isEditable?'<button type="button" data-other-add title="Добавить эффект" aria-label="Добавить эффект"><i class="fas fa-plus"></i></button>':''}</h3>
    ${effects.map(effect=>`<div class="pf1ru-other-effect-row"><span>${esc(effect.name)}</span><span>${effect.enhancement?`+${esc(effect.enhancement)}`:''}</span>${app.isEditable?`<button type="button" data-other-edit="${esc(effect.id)}" title="Редактировать эффект" aria-label="Редактировать эффект"><i class="fas fa-edit"></i></button><button type="button" data-other-delete="${esc(effect.id)}" title="Удалить эффект" aria-label="Удалить эффект"><i class="fas fa-trash"></i></button>`:''}</div>`).join('')}
    <p class="${sum.enhancement>5?'pf1ru-effect-warning':''}">Суммарный бонус усиления эффектов: +${esc(sum.enhancement)}${sum.enhancement>5?' — превышает +5':''}</p>
    <button type="button" data-item-statistics><i class="fas fa-chart-bar"></i> Статистика предмета</button>`;
  materialGroup.after(section);
  section.querySelector('[data-other-add]')?.addEventListener('click',()=>effectDialog(item));
  for(const button of section.querySelectorAll('[data-other-edit]'))button.addEventListener('click',()=>effectDialog(item,button.dataset.otherEdit));
  for(const button of section.querySelectorAll('[data-other-delete]'))button.addEventListener('click',()=>deleteOtherEffect(item,button.dataset.otherDelete));
  section.querySelector('[data-item-statistics]').addEventListener('click',()=>new Dialog({title:`Статистика: ${item.name}`,content:statisticsContent(item),buttons:{close:{label:'Закрыть'}}},{width:680}).render(true));
}

export function statisticsContent(item) {
  const config=initialMaterialConfig(item), system=item._source.system, enh=enhancement(item), armor=isArmor(item);
  const clean={...config,otherEffects:[],manual:{}};
  // PF1 adds actual enhancement to armor AC itself; include it for display
  // without writing it into armor.value or counting property equivalents.
  const stats=(c,e=enh)=>{const value=equipmentStats(c,system,item.type,e);return armor?{...value,ac:value.ac+e}:value;};
  const plain=stats({...clean,id:'',materialPrice:null,masterworkChoice:false},0);
  const material=stats({...clean,masterworkChoice:false},0);
  const masterwork=stats(clean,0);
  const magic=stats(clean);
  const manual=stats({...config,otherEffects:[]});
  const final=stats(config);
  const format=v=>v==null?'Без ограничения':String(Math.round(v*1000)/1000);
  const difference=(before,after)=>{
    if(before===after)return '';
    if(before==null||after==null)return after==null?' (ограничение снято)':' (ограничение установлено)';
    const delta=Math.round((after-before)*1000)/1000;
    return ` (${delta>0?'+':delta<0?'−':''}${format(Math.abs(delta))})`;
  };
  const fields=Object.entries(EFFECT_FIELDS).filter(([k])=>k!=='enhancement'&&(armor||!armorEffectFields.has(k)));
  const diff=(a,b)=>fields.filter(([k])=>a[k]!==b[k]).map(([k,label])=>`${label}: ${format(a[k])} → ${format(b[k])}${difference(a[k],b[k])}`).join('; ')||'Без изменений';
  const materialName=MATERIALS.find(m=>m.id===config.id)?.name??'Обычный материал';
  const rows=[['Исходные параметры',fields.map(([k,label])=>`${label}: ${format(plain[k])}`).join('; ')],[`Особый материал: ${materialName}`,diff(plain,material)],['Искусная работа',diff(material,masterwork)],[`Бонус усиления +${enh}`,diff(masterwork,magic)],['Ручная настройка материала',diff(magic,manual)]];
  if(!armor&&enh)rows[3][1]+=`; Бонус усиления к атаке и урону: +${enh}`;
  let previous=manual;const applied=[];
  for(const effect of config.otherEffects??[]) {
    applied.push(effect);const next=stats({...config,otherEffects:applied});
    rows.push([`Иной эффект: ${effect.name}`,`${effect.enhancement?`Эквивалент особого свойства: +${effect.enhancement} (только цена); `:''}${diff(previous,next)}`]);
    previous=next;
  }
  const equivalent=effectTotals(config.otherEffects,armor).enhancement;
  if(equivalent)rows.push(['Стоимость усиления и особых свойств',`Настоящий бонус +${enh}, эквиваленты свойств +${equivalent}: (${enh} + ${equivalent})² × ${typePriceFactor(item)} = ${format(final.priceParts.enhancement+final.priceParts.effectEnhancement)} зм. Прямые надбавки к цене учитываются отдельно. Изменения каждого эффекта показаны последовательно в порядке списка.`]);
  rows.push(['Итог',fields.map(([k,label])=>`${label}: ${format(final[k])}${difference(plain[k],final[k])}`).join('; ')]);
  const lineHTML=text=>{
    const pair=text.match(/^([^:]{1,55}): (.*)$/);
    if(!pair)return `<p class="pf1ru-stat-note">${esc(text)}</p>`;
    const value=esc(pair[2]).replace(/\(([+−]\d+(?:\.\d+)?)\)$/,(match,delta)=>`<strong class="pf1ru-stat-delta ${delta.startsWith('+')?'pf1ru-stat-increase':'pf1ru-stat-decrease'}">${match}</strong>`);
    return `<div class="pf1ru-stat-row"><span class="pf1ru-stat-label">${esc(pair[1])}:</span> <span class="pf1ru-stat-value">${value}</span></div>`;
  };
  return `<div class="pf1ru-statistics">${rows.map(([label,text])=>`<h3>${esc(label)}</h3><div class="pf1ru-stat-group">${text.split('; ').map(lineHTML).join('')}</div>`).join('')}</div>`;
}
function typePriceFactor(item) {
  return isArmor(item)?1000:item.type==='loot'&&item._source.system.subType==='ammo'?40:2000;
}

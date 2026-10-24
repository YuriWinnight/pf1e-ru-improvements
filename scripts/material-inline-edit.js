import { MODULE, materialConfig, initialMaterialConfig } from './special-materials.js';
const fields = { price: ['Цена', 'system.price'], weight: ['Вес', 'system.weight.value'], hp: ['ПП', 'system.hp.max'], hardness: ['Твёрдость', 'system.hardness'] };
const get = (item, path) => foundry.utils.getProperty(item._source, path);
export async function updateMaterialBase(item, key, value) {
  if (!fields[key] || !Number.isFinite(value) || value < 0) throw new Error('Введите неотрицательное число.');
  const config = initialMaterialConfig(item); config.base[key] = value;
  if (key !== 'price') config.manual[key] = null;
  await item.update({ [`flags.${MODULE}.material`]: config });
}
function bind(input, item, key, editable, display = null) {
  if (input.dataset.pf1ruBase) return;
  input.dataset.pf1ruBase = key; input.removeAttribute('name'); input.readOnly = !editable;
  const restore = () => { input.value = display?.() ?? get(item, fields[key][1]); };
  const tip = `Без материала, усиления и искусной работы: ${initialMaterialConfig(item).base[key]}. При редактировании вводится базовое значение одного предмета.`;
  input.title = tip; input.dataset.tooltip = tip;
  input.addEventListener('focus', () => { if (editable) { input.value = initialMaterialConfig(item).base[key]; input.select(); } });
  input.addEventListener('change', async event => {
    event.stopImmediatePropagation(); if (!editable) return;
    const value = input.value.trim() === '' ? NaN : Number(input.value);
    try { await updateMaterialBase(item, key, value); } catch (error) { ui.notifications.warn(error.message); }
    restore();
  }, true);
  input.addEventListener('blur', restore);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); input.blur(); } });
  const native = input.closest('[data-action="input-text"]');
  native?.addEventListener('click', event => { event.stopImmediatePropagation(); if (editable) { input.focus(); } }, true);
}
Hooks.on('renderItemSheet', (app, html) => {
  const item = app.item ?? app.object, root = html[0] ?? html;
  if (game.system.id !== 'pf1' || !materialConfig(item).enabled) return;
  for (const [key, [, path]] of Object.entries(fields)) {
    for (const input of root.querySelectorAll(`input[name="${path}"], [data-attr-name="${path}"] input`)) bind(input, item, key, Boolean(app.isEditable));
  }
});
const observers = new WeakMap();
Hooks.on('renderActorSheet', (app, html) => {
  if (game.system.id !== 'pf1') return;
  const root = html[0] ?? html, actor = app.actor ?? app.object;
  observers.get(app)?.disconnect();
  const decorate = () => {
    for (const row of root.querySelectorAll('.item[data-item-id]')) {
      const item = actor.items.get(row.dataset.itemId);
      if (!materialConfig(item).enabled || (!game.user.isGM && item.system.identified === false)) continue;
      const editable = Boolean(app.isEditable);
      for (const [key, selector] of [['price', '.item-value']]) {
        const cell = row.querySelector(selector);
        if (!cell || cell.querySelector('[data-pf1ru-base]')) continue;
        const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = 'any';
        input.className = 'pf1ru-base-inline'; input.setAttribute('aria-label', fields[key][0]);
        const total = () => Number(get(item, fields[key][1])) * Number(item.system.quantity ?? 1);
        input.value = total(); cell.replaceChildren(input); bind(input, item, key, editable, total);
      }
      const summary = row.querySelector('.item-summary');
      if (summary && !summary.querySelector('.pf1ru-base-stats')) {
        const group = document.createElement('div'); group.className = 'pf1ru-base-stats';
        for (const [key, [label, path]] of Object.entries(fields)) {
          const wrap = document.createElement('label'); wrap.textContent = label;
          const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = 'any'; input.value = get(item, path);
          wrap.append(input); group.append(wrap); bind(input, item, key, editable);
        }
        summary.prepend(group);
      }
    }
  };
  decorate(); const observer = new MutationObserver(decorate);
  observer.observe(root, { childList: true, subtree: true }); observers.set(app, observer);
});
Hooks.on('closeActorSheet', app => { observers.get(app)?.disconnect(); observers.delete(app); });

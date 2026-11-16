const MODULE = 'pf1e-ru-improvements';
export const COINS = {
  pp: { label: 'пм', name: 'Платиновые монеты', file: 'platinum-pieces.webp' },
  gp: { label: 'зм', name: 'Золотые монеты', file: 'gold-pieces.webp' },
  sp: { label: 'см', name: 'Серебряные монеты', file: 'silver-pieces.webp' },
  cp: { label: 'мм', name: 'Медные монеты', file: 'copper-pieces.webp' }
};
const queues = new WeakMap();
export function adjustCurrency(actor, category, amounts, subtract = false) {
  if (!['currency', 'altCurrency'].includes(category)) return Promise.reject(Error('Неизвестный кошелёк.'));
  const previous = queues.get(actor) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!actor.isOwner) throw Error('Изменять валюту может только владелец персонажа или ГМ.');
    const update = {};
    for (const key of Object.keys(COINS)) {
      const amount = Number(amounts[key] ?? 0);
      if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Количество монет должно быть целым неотрицательным числом.');
      if (!amount) continue;
      const current = Number(actor.system[category]?.[key] ?? 0);
      const value = subtract ? Math.max(0, current - amount) : current + amount;
      if (!Number.isSafeInteger(value)) throw Error('Слишком большое количество монет.');
      update[`system.${category}.${key}`] = value;
    }
    if (Object.keys(update).length) await actor.update(update);
  });
  queues.set(actor, next);
  return next.finally(() => { if (queues.get(actor) === next) queues.delete(actor); });
}
function currencyDialog(actor, category, subtract) {
  const title = subtract ? 'Вычесть валюту' : 'Добавить валюту';
  let saving = false;
  const dialog = new Dialog({
    title: `${title}${category === 'altCurrency' ? ' — без веса' : ''}`,
    content: `<form class="pf1ru-currency-dialog">${Object.entries(COINS).map(([key, coin]) =>
      `<div class="form-group"><label><img src="modules/${MODULE}/assets/currency/${coin.file}" alt=""> ${coin.label.toUpperCase()}<input name="${key}" type="number" min="0" step="1" value="0"></label></div>`).join('')}
      </form>`,
    buttons: {
      ok: { label: title, icon: `<i class="fas fa-${subtract ? 'minus' : 'plus'}"></i>`, callback: () => false },
      cancel: { label: 'Отмена' }
    },
    // Foundry 11 closes Dialog after a callback even when it returns false.
    // Handle submit ourselves so invalid input stays open and double clicks cannot charge twice.
    render(html) {
      // Dialog.activateListeners receives two sibling roots (.dialog-content
      // and .dialog-buttons), not the window. Use the installed outer element
      // so both the form and footer are available before Application positions it.
      const root = dialog.element[0], form = root.querySelector('form.pf1ru-currency-dialog');
      const submit = async event => {
        event.preventDefault(); event.stopImmediatePropagation();
        if (saving || !form.reportValidity()) return;
        saving = true;
        try { await adjustCurrency(actor, category, Object.fromEntries(new FormData(form)), subtract); await dialog.close(); }
        catch (error) { saving = false; ui.notifications.warn(error.message); }
      };
      root.querySelector('[data-button="ok"]').addEventListener('click', submit, true);
      form.addEventListener('submit', submit);
      root.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.dataset.button !== 'cancel') void submit(event);
      }, true);
    }
  }, { width: 400, resizable: true, classes: ['dialog', 'pf1ru-inventory-currency-dialog'] });
  dialog.render(true);
}
export function decorateCurrency(app, html) {
  if (game.system.id !== 'pf1') return;
  const actor = app.actor ?? app.object, root = html[0] ?? html;
  if (!actor) return;
  for (const row of root.querySelectorAll('.currency')) {
    if (row.classList.contains('pf1ru-currency')) continue;
    const first = row.querySelector('[name^="system.currency."], [name^="system.altCurrency."]');
    if (!first) continue;
    const category = first.getAttribute('name').split('.')[1];
    row.classList.add('pf1ru-currency');
    for (const [key, coin] of Object.entries(COINS)) {
      const input = row.querySelector(`[name="system.${category}.${key}"]`);
      const label = row.querySelector(`.denomination.${key}`);
      if (!input || !label) continue;
      const image = document.createElement('img');
      image.src = `modules/${MODULE}/assets/currency/${coin.file}`; image.alt = '';
      image.draggable = false;
      const caption = document.createElement('span'); caption.className = 'pf1ru-coin-name'; caption.textContent = coin.label.toUpperCase();
      label.replaceChildren(image, caption); label.dataset.tooltip = coin.name;
      label.classList.toggle('alt-currency', category === 'altCurrency');
      label.removeAttribute('title'); input.setAttribute('aria-label', coin.name);
      // Preserve native nodes/listeners: direct editing, dragging and conversion still work.
      const cell = document.createElement('li'); cell.className = 'pf1ru-coin';
      label.before(cell); cell.append(label, input);
      const convert = row.querySelector(`.convert-currency[data-type="${key}"]`);
      if (convert) cell.append(convert);
    }
    if (app.isEditable && actor.isOwner) {
      const controls = document.createElement('li'); controls.className = 'pf1ru-currency-controls';
      for (const subtract of [false, true]) {
        const button = document.createElement('button'); button.type = 'button';
        const symbol = document.createElement('span');
        symbol.className = 'pf1ru-currency-symbol' + (subtract ? '' : ' pf1ru-currency-plus');
        symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = subtract ? '−' : '+';
        button.append(symbol);
        button.dataset.tooltip = subtract ? 'Вычесть валюту' : 'Добавить валюту';
        button.setAttribute('aria-label', button.dataset.tooltip);
        button.addEventListener('click', () => currencyDialog(actor, category, subtract));
        controls.append(button);
      }
      row.append(controls);
    }
  }
}
Hooks.on('renderActorSheet', decorateCurrency);

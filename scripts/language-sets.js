const MODULE = 'pf1e-ru-improvements';
const SETTING = 'languageSet';
const originals = new WeakMap();
const patched = new WeakSet();

// Spoken and written forms deliberately use different stable IDs. Do not infer
// either form from a character's old, undivided Golarion language proficiency.
const paired = {
  veldar: 'велдарский', vajja: 'ваджа', rahsavar: 'рахсаварский',
  varkhold: 'вархольд', ravelor: 'равелорский', elvarian: 'эльварийский',
  mirei: 'мирейский', reisu: 'рэйсу', aquan: 'акван', auran: 'ауран',
  giant: 'великаний', gnome: 'гномий', dwarven: 'дварфийский',
  abyssal: 'демонический', draconic: 'драконий', ignan: 'игнан',
  halfling: 'полуросличий', terran: 'терран', cyclops: 'циклопский', elven: 'эльфийский'
};
export const SILDORA_LANGUAGES = Object.freeze(Object.fromEntries([
  ...Object.entries(paired).flatMap(([id, name]) => [
    [`sildora_${id}_spoken`, `${name} (устный)`],
    [`sildora_${id}_written`, `${name} (письменный)`]
  ]),
  ['sildora_esharan', 'эшаран'], ['sildora_ardelan', 'арделанский'],
  ['aboleth', 'аболетский'], ['aklo', 'акло'], ['boggard', 'боггардский'],
  ['gnoll', 'гнольский'], ['goblin', 'гоблинский'], ['druidic', 'друидический'],
  ['necril', 'некрил'], ['orc', 'орочий'], ['protean', 'протеан'],
  ['vegepygmy', 'растепигмейский'], ['sylvan', 'сильван'], ['telepathy', 'телепатия'],
  ['treant', 'язык древней'], ['sphinx', 'язык сфинксов'], ['shadowtongue', 'язык теней']
].map(([id, label]) => [id, label[0].toLocaleUpperCase('ru') + label.slice(1)])
  .sort(([, a], [, b]) => a.localeCompare(b, 'ru'))));

export const ECHOS_LANGUAGES = Object.freeze(Object.fromEntries([
  ['aquan', 'Акван'], ['aklo', 'Акло'], ['echos_araviy', 'Аравий'],
  ['auran', 'Ауран'], ['boggard', 'Боггардский'], ['giant', 'Великаний'],
  ['echos_vindlun', 'Виндлун'], ['gnoll', 'Гнолльский'], ['goblin', 'Гоблинский'],
  ['abyssal', 'Демонический'], ['draconic', 'Драконий'], ['druidic', 'Друидический'],
  ['infernal', 'Дьявольский'], ['ignan', 'Игнан'], ['echos_koga', 'Кога'],
  ['celestial', 'Небесный'], ['necril', 'Некрил'], ['echos_norksar', "Нор'Ксар"],
  ['orc', 'Орочий'], ['undercommon', 'Подземный'], ['protean', 'Протеан'],
  ['vegepygmy', 'Растепигмейский'], ['echos_saerkhal', 'Саэр’Кхал'],
  ['sylvan', 'Сильван'], ['telepathy', 'Телепатия'], ['terran', 'Терран'],
  ['cyclops', 'Циклопский'], ['echos_khaldi', 'Халди'], ['echos_elidra', 'Элидра'],
  ['echos_ethereal', 'Эфирийский'], ['treant', 'Язык древней'],
  ['sphinx', 'Язык сфинксов'], ['shadowtongue', 'Язык теней']
].sort(([, a], [, b]) => a.localeCompare(b, 'ru'))));

export function applyLanguageSet(languages, mode) {
  if (!originals.has(languages)) originals.set(languages, { ...languages });
  const golarion = originals.get(languages);
  const catalogs = { golarion, sildora: SILDORA_LANGUAGES, echos: ECHOS_LANGUAGES };
  const active = Object.hasOwn(catalogs, mode) ? catalogs[mode] : golarion;
  // Selectors enumerate only the active vocabulary. Inactive labels remain
  // accessible by ID so existing actor/item tags never turn into empty labels.
  const inactive = { ...ECHOS_LANGUAGES, ...SILDORA_LANGUAGES, ...golarion };
  for (const key of Object.getOwnPropertyNames(languages)) delete languages[key];
  Object.assign(languages, active);
  for (const [key, label] of Object.entries(inactive)) {
    if (Object.hasOwn(active, key)) continue;
    Object.defineProperty(languages, key, { value: label, enumerable: false, writable: true, configurable: true });
  }
  return languages;
}

export function preserveInactiveLanguages(wrapped, event, formData) {
  if (this.options.subject !== 'languages') return wrapped(event, formData);
  const choices = this.options.choices ?? {};
  const current = foundry.utils.getProperty(this.object, this.attribute)?.value ?? [];
  const values = { ...formData };
  for (const key of current) {
    // Fields omitted from this vocabulary cannot be unchecked in this form.
    if (!Object.prototype.propertyIsEnumerable.call(choices, key)) values[key] = true;
  }
  return wrapped(event, values);
}

export function installLanguageSelectorProtection(Selector) {
  if (!Selector || patched.has(Selector)) return;
  const target = 'pf1.applications.ActorTraitSelector.prototype._updateObject';
  if (game.modules.get('lib-wrapper')?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE, target, preserveInactiveLanguages, 'WRAPPER');
  } else {
    const original = Selector.prototype._updateObject;
    Selector.prototype._updateObject = function(event, formData) {
      return preserveInactiveLanguages.call(this, original.bind(this), event, formData);
    };
  }
  patched.add(Selector);
}

function escapeLanguageLabel(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function languageRemovalEntries(trait, languages) {
  return [
    ...[...new Set(trait.value ?? [])].map(id => ({ id, label: languages[id] ?? id })),
    ...[...new Set((trait.custom ?? '').split(';').map(label => label.trim()).filter(Boolean))]
      .map(custom => ({ custom, label: custom }))
  ].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function removeSelectedLanguages(trait, selected) {
  const ids = new Set(selected.filter(entry => entry.id !== undefined).map(entry => entry.id));
  const custom = new Set(selected.filter(entry => entry.custom !== undefined).map(entry => entry.custom));
  return {
    value: (trait.value ?? []).filter(id => !ids.has(id)),
    custom: custom.size ? (trait.custom ?? '').split(';').filter(part => !custom.has(part.trim())).join(';') : (trait.custom ?? '')
  };
}

async function chooseLanguageRemoval(app) {
  const mode = await Dialog.wait({
    title: 'Очистить языки',
    content: '<p>Выберите способ очистки языков этого листа.</p>',
    default: 'selective',
    buttons: {
      all: { icon: '<i class="fas fa-eraser"></i>', label: 'Очистить всё', callback: () => 'all' },
      selective: { icon: '<i class="fas fa-list-check"></i>', label: 'Очистить выборочно', callback: () => 'selective' }
    },
    close: () => null
  }, { width: 400 });
  if (mode === 'all') return { all: true, selected: [] };
  if (mode !== 'selective') return null;
  const trait = foundry.utils.getProperty(app.object, app.attribute) ?? {};
  const entries = languageRemovalEntries(trait, pf1.config.languages);
  const rows = entries.map((entry, index) => `<label class="pf1ru-language-removal-row"><input type="checkbox" name="language" value="${index}"><span>${escapeLanguageLabel(entry.label)}${entry.custom !== undefined ? ' <small>(пользовательский)</small>' : ''}</span></label>`).join('');
  const selected = await Dialog.wait({
    title: 'Очистить языки выборочно',
    content: entries.length
      ? `<p>Отметьте языки, которые нужно удалить. Здесь показаны также языки других наборов.</p><div class="pf1ru-language-removal-list">${rows}</div>`
      : '<p>У этого листа нет сохранённых языков.</p>',
    default: 'cancel',
    buttons: {
      ...(entries.length ? { select: { icon: '<i class="fas fa-check"></i>', label: 'Подтвердить', callback: html => {
        const root = html?.[0] ?? html;
        return [...root.querySelectorAll('input[name="language"]:checked')].map(input => entries[Number(input.value)]).filter(Boolean);
      } } } : {}),
      cancel: { icon: '<i class="fas fa-times"></i>', label: 'Отмена', callback: () => null }
    },
    close: () => null
  }, { width: 400, resizable: true });
  if (!selected?.length) return null;
  return { all: false, selected };
}

export function addClearLanguagesButton(app, html) {
  if (game.system.id !== 'pf1' || app.options.subject !== 'languages' || !app.isEditable) return;
  const root = html?.[0] ?? html;
  const form = root?.matches?.('form') ? root : root?.querySelector?.('form');
  if (!form || form.querySelector('.pf1ru-clear-languages')) return;
  const toolbar = document.createElement('div');
  toolbar.className = 'pf1ru-language-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pf1ru-clear-languages';
  button.title = 'Очистить все языки этого листа или выбрать отдельные';
  button.innerHTML = '<i class="fas fa-eraser" aria-hidden="true"></i> Очистить';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.before(toolbar);
    toolbar.append(submit);
  } else form.append(toolbar);
  toolbar.append(button);
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled || !app.isEditable) return;
    const controls = [...form.querySelectorAll('input, button, select, textarea')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try {
      const removal = await chooseLanguageRemoval(app);
      if (!removal || !app.isEditable || !form.isConnected) return;
      const confirmed = await Dialog.wait({
        title: removal.all ? 'Очистить все языки?' : 'Очистить выбранные языки?',
        content: removal.all
          ? '<p>Будут удалены все языки этого листа, включая языки других наборов и поле «Пользовательские».</p><p>Очистить всё?</p>'
          : `<p>Из этого листа будут удалены следующие языки:</p><ul class="pf1ru-language-removal-list">${removal.selected.map(entry => `<li>${escapeLanguageLabel(entry.label)}${entry.custom !== undefined ? ' (пользовательский)' : ''}</li>`).join('')}</ul><p>Очистить выбранные языки?</p>`,
        focus: true,
        default: 'cancel',
        buttons: {
          clear: { icon: '<i class="fas fa-eraser"></i>', label: 'Очистить', callback: () => true },
          cancel: { icon: '<i class="fas fa-times"></i>', label: 'Отмена', callback: () => false }
        },
        close: () => false
      }, { width: 400 });
      if (confirmed !== true || !app.isEditable || !form.isConnected) return;
      // Read current values again so selective removal keeps languages added
      // while the dialogs were open. Bypass normal inactive-language protection.
      const trait = foundry.utils.getProperty(app.object, app.attribute) ?? {};
      const next = removal.all ? { value: [], custom: '' } : removeSelectedLanguages(trait, removal.selected);
      await app.object.update({
        [`${app.attribute}.value`]: next.value,
        [`${app.attribute}.custom`]: next.custom
      });
      form.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = next.value.includes(input.name); });
      const custom = form.querySelector('input[name="custom"]');
      if (custom) custom.value = next.custom;
      app.render(false);
    } catch (error) {
      console.error(`${MODULE} | Failed to clear languages`, error);
      ui.notifications.error('Не удалось очистить языки. Попробуйте ещё раз.');
    } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
    }
  });
}

Hooks.on('renderActorTraitSelector', addClearLanguagesButton);

Hooks.once('init', () => {
  if (game.system.id !== 'pf1') return;
  game.settings.register(MODULE, SETTING, {
    name: 'Набор языков',
    hint: 'Языки в меню персонажей и предметов для всего мира. Голарион — стандартный набор; Сильдора — пользовательский, с отдельными устными и письменными формами; Эхос — пользовательский набор из 33 языков. Уже записанные языки сохраняются. Требуется перезагрузка страницы.',
    scope: 'world', config: true, type: String, default: 'golarion',
    choices: { golarion: 'Голарион', sildora: 'Сильдора', echos: 'Эхос' }, requiresReload: true
  });
});

Hooks.once('ready', () => {
  if (game.system.id !== 'pf1') return;
  // PF1 and this module have localized their normal language dictionary by ready.
  applyLanguageSet(pf1.config.languages, game.settings.get(MODULE, SETTING));
  installLanguageSelectorProtection(pf1.applications.ActorTraitSelector);
});

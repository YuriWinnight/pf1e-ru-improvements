import { MODULE, escapeHTML as esc } from './special-materials.js';
import { focusToken, bindTokenHover } from './token-navigation.js';
import { queueDamageRequest, messageAudience } from './damage-application.js';
import { TEMPLATE_DEFAULTS, evasionFor, saveSuccess, successDamage, targetDamageMode, uniqueTemplateTargets } from './template-damage-rules.js';
import { filterHeightTargets, templateHeight, heightLabel } from './template-elevation.js';
import { checkSpellResistance, resistanceRollContent } from './spell-resistance.js';
const clone = value => foundry.utils.deepClone(value);
const flag = (doc, key) => doc?.getFlag(MODULE, key);
const gm = () => game.users.activeGM ?? game.users.find(u => u.active && u.isGM);
const setting = key => game.settings.get(MODULE, key) ?? TEMPLATE_DEFAULTS[key];
const saveNames = { ref: 'Реакция', fort: 'Стойкость', will: 'Воля' };
const damageNames = { full: 'Полный урон', half: 'Половина урона', none: 'Без урона', excluded: 'Исключён' };
let queue = Promise.resolve();
const enqueue = task => { const result = queue.catch(console.error).then(task); queue = result; return result; };
Hooks.on('init', () => {
  if (game.system.id !== 'pf1') return;
  const labels = {
    templateDamageEnabled: ['Урон по шаблонам', 'Создавать список существ в шаблоне действия с уроном. Список и управление доступны мастерам.'],
    templateAutoSaves: ['Шаблоны: автоматические испытания', 'Сразу бросать испытания PF1 за существ в области. Если выключено, мастер бросает за каждого или за всех из списка в чате.'],
    templateAutoDamage: ['Шаблоны: автоматическое списание урона', 'Применять урон, когда испытания готовы. По умолчанию выключено: мастер проверяет список и нажимает «Применить урон». При включённом исключении целей сначала требуется подтверждение списка.'],
    templateExcludeTargets: ['Шаблоны: разрешить исключение целей', 'Добавить флажки включения целей. При автоматическом списании урона дождаться подтверждения списка мастером.'],
    templateSuccessDamage: ['Шаблоны: урон при успешном испытании', 'Правило по умолчанию, если в действии не указано «половина» или «отменяет». Его можно изменить в списке. Уклонение применяется только к Реакции на половину.']
  };
  for (const [key, [name, hint]] of Object.entries(labels)) game.settings.register(MODULE, key, {
    name, hint, scope: 'world', config: true, type: key === 'templateSuccessDamage' ? String : Boolean, default: TEMPLATE_DEFAULTS[key],
    ...(key === 'templateSuccessDamage' ? { choices: { half: 'Половина', none: 'Без урона', full: 'Полный' } } : {})
  });
});
// Freeze occupied cells as soon as PF1 confirms placement, before dice animations.
Hooks.on('pf1PreActionUse', use => {
  if (game.system.id !== 'pf1' || !setting('templateDamageEnabled') || !use.shared.template) return;
  try {
    const object = use.shared.template.object;
    // A freshly created document can precede its grid highlight layer. An empty
    // layer is not yet proof of an empty area. PF1 will generate targets later.
    if (object?.getHighlightLayer && globalThis.canvas?.grid?.type !== 0) {
      const positions = object.getHighlightLayer()?.positions;
      if (!positions || !(positions.size ?? positions.length)) return;
    }
    use._pf1ruTemplateTargets = filterHeightTargets(uniqueTemplateTargets(object.getTokensWithin()), use);
  }
  catch (error) { use._pf1ruTemplateError = error.message; }
});
function nativeMetadata(use) {
  return use.shared.chatData?.['flags.pf1.metadata']
    ?? foundry.utils.getProperty(use.shared.chatData, 'flags.pf1.metadata');
}
export function resolveTemplateTargets(use) {
  if (Array.isArray(use._pf1ruTemplateTargets)) return use._pf1ruTemplateTargets;
  const template = use.shared.template, metadata = nativeMetadata(use);
  if (metadata && metadata.template === template.id && Array.isArray(metadata.targets)) {
    // These are the very targets PF1 put in the cast card. Use the template's
    // scene, not the viewer's current scene, and do not read the canvas again.
    const sceneUUID = template.parent?.uuid ?? template.uuid?.split('.MeasuredTemplate.')[0];
    if (!sceneUUID) throw new Error('Не удалось определить сцену шаблона.');
    return filterHeightTargets([...new Set(metadata.targets.map(id => `${sceneUUID}.Token.${id}`))], use);
  }
  // An early drawing error is transient: retry once the action is ready instead
  // of making that old error permanent. Only a current failure is reported.
  return filterHeightTargets(uniqueTemplateTargets(template.object.getTokensWithin()), use);
}
// PF1 has already placed the template and rolled damage at this point. Capture its
// own occupied-cell result now, never the caster's selected or targeted tokens.
Hooks.on('pf1PreDisplayActionUse', use => {
  if (game.system.id !== 'pf1' || !setting('templateDamageEnabled') || !use.shared.template || use.shared.templateData?.spellFailureSuccess === false) return;
  const snapshot = use._pf1ruDamageSnapshot ?? foundry.utils.getProperty(foundry.utils.expandObject(use.shared.chatData), `flags.${MODULE}.damageSnapshot`);
  if (!snapshot?.attacks?.some(a => !a.healing && a.damage.length)) return;
  const template = use.shared.template, metadata = nativeMetadata(use);
  const data = { template: template.uuid, targets: [], saveType: use.shared.save || metadata?.save?.type || use.action.data.save?.type || '',
    dc: Number(use.shared.saveDC ?? metadata?.save?.dc), successMode: successDamage(use.action.data.save?.description, setting('templateSuccessDamage')),
    name: use.item.name, height: templateHeight(use), createdAt: Date.now() };
  snapshot.templateWorkflowSource = true;
  use.shared.chatData[`flags.${MODULE}.damageSnapshot`] = snapshot;
  try {
    data.targets = resolveTemplateTargets(use);
  } catch (error) {
    data.error = 'Не удалось определить цели шаблона: ' + error.message;
  }
  use.shared.chatData[`flags.${MODULE}.templateSource`] = data;
});
export function cardContent(state) {
  const controls = state.status === 'review';
  const select = (name, value, options, row = '') => `<select data-template-field="${name}" data-row="${row}">${Object.entries(options).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  return `<section class="pf1ru-template-card"><h3>Цели шаблона: ${esc(state.name)}</h3>
    ${state.height ? `<p>Высоты: ${esc(heightLabel(state.height))}</p>` : ''}
    <p>${state.saveType ? `${esc(saveNames[state.saveType] ?? state.saveType)} · СЛ ${esc(state.dc)}` : 'Без испытания: полный урон'} · Исходный урон: ${state.damageTotal}</p>
    ${state.saveType && controls ? `<label>При успехе ${select('successMode', state.successMode, { half: 'Половина', none: 'Без урона', full: 'Полный' })}</label>` : ''}
    ${state.rows.map((row, i) => `<div class="pf1ru-template-row">
      <div class="pf1ru-template-actor">${state.allowExclusions && controls ? `<input type="checkbox" data-template-field="included" data-row="${i}" ${row.excluded ? '' : 'checked'} title="Включить цель">` : ''}<button type="button" class="pf1ru-template-token" data-template-token="${i}" title="Найти токен: ${esc(row.name)}" aria-label="Найти токен: ${esc(row.name)}"><img src="${esc(row.img || 'icons/svg/mystery-man.svg')}" alt=""></button><strong>${esc(row.name)}</strong></div>
      <div>${row.resistance?.success === false ? 'Испытание не требуется: УкМ не преодолена' : row.save ? `Испытание: ${row.save.total == null ? 'решение мастера' : esc(row.save.total)}${row.save.natural != null ? ` (d20: ${esc(row.save.natural)})` : ''} — <strong class="pf1ru-save-${row.save.success ? 'success' : 'failure'}">${saveLabel(row.save)}</strong>${row.save.manual ? ' · исправлено мастером' : ''}` : state.saveType ? 'Испытание ещё не выполнено' : 'Испытание не требуется'}</div>
      ${row.resistanceError ? `<p class="pf1ru-template-error">${esc(row.resistanceError)}</p>` : ''}
      ${row.evasion?.note && state.saveType === 'ref' && state.successMode === 'half' ? `<div class="notes">${esc(row.evasion.note)}</div>` : ''}
      ${row.notes ? `<div class="pf1ru-save-notes"><strong>Примечания</strong>${row.notes}</div>` : ''}
      ${resistanceRollContent(row.resistance)}
      <div>${esc(damageNames[targetDamageMode(state, row)] ?? 'Ожидает испытания')}</div>
      ${row.error ? `<p class="pf1ru-template-error">${esc(row.error)}</p>` : ''}
      ${controls ? `<div class="pf1ru-template-row-controls">${state.saveType ? `<button type="button" data-template-action="roll" data-row="${i}" ${row.excluded ? 'disabled' : ''}><i class="fas fa-dice-d20"></i> ${row.save ? 'Перебросить' : 'Испытание'}</button><button type="button" data-template-action="edit" data-row="${i}"><i class="fas fa-edit"></i> Исправить</button>` : ''}${select('override', row.override ?? '', { '': 'По результату', full: 'Полный урон', half: 'Половина', none: 'Без урона' }, i)}</div>` : ''}
    </div>`).join('')}
    ${!state.rows.length && !state.error ? '<p>В шаблоне нет существ.</p>' : ''}
    ${state.error ? `<p class="pf1ru-template-error">${esc(state.error)}</p>` : ''}
    ${controls && state.rows.length ? `<div class="pf1ru-template-controls">${state.saveType ? '<button type="button" data-template-action="rollAll"><i class="fas fa-dice-d20"></i> Бросить за остальных</button>' : ''}<button type="button" data-template-action="apply"><i class="fas fa-check"></i> ${state.autoDamage && state.allowExclusions ? 'Подтвердить цели и применить урон' : 'Применить урон'}</button></div>` : ''}
    ${state.status === 'applied' ? '<p>Обработка завершена. Отмена и замена доступны в уведомлении об уроне.</p>' : ''}
    </section>`;
}
function saveLabel(save) {
  if (!save.manual && save.natural === 20) return 'Критический успех';
  if (!save.manual && save.natural === 1) return 'Критический провал';
  return save.success ? 'Успех' : 'Провал';
}
function resistanceMessageData(state) {
  const rolls = state.rows.flatMap(row => row.resistance?.roll ? [row.resistance.roll] : []);
  return rolls.length ? { type: globalThis.CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5, rolls, 'flags.pf1.noRollRender': true } : {};
}
async function saveCard(card, state) { await card.update({ content: cardContent(state), ...resistanceMessageData(state), [`flags.${MODULE}.templateWorkflow`]: state }); }
async function saveNotes(actor, type) {
  if (!type || !actor.getContextNotesParsed) return '';
  const notes = actor.getContextNotesParsed(`savingThrow.${type}`, { roll: false });
  return TextEditor.enrichHTML(notes.map(note => `<div>${note}</div>`).join(''), { async: true, rolls: false, secrets: game.settings.get(MODULE, 'templateSavesGMOnly') === true });
}
export async function rollTemplateSave(state, row) {
  await rollResistance(state, row);
  if (row.resistance?.success === false) return;
  const actor = await fromUuid(row.actorUuid), token = await fromUuid(row.uuid);
  if (!actor) throw new Error('Актёр больше не существует.');
  row.notes = await saveNotes(actor, state.saveType);
  if (!saveNames[state.saveType] || !Number.isFinite(state.dc)) throw new Error('Проверьте тип испытания и СЛ в действии; результат можно задать вручную.');
  const data = await actor.rollSavingThrow(state.saveType, { skipDialog: true, chatMessage: false, noSound: true, token: token?.object ?? token });
  if (data?.content && globalThis.DOMParser) {
    const native = new DOMParser().parseFromString(data.content, 'text/html');
    const groups = [...native.querySelectorAll('.property-group')].filter(group => group.querySelector('label')?.textContent.trim() === game.i18n.localize('PF1.Notes'));
    if (groups.length) row.notes = await TextEditor.enrichHTML(groups.map(group => group.querySelector('.tag-list')?.innerHTML ?? '').join(''), {
      async: true, rolls: false, secrets: game.settings.get(MODULE, 'templateSavesGMOnly') === true
    });
  }
  let roll = data?.rolls?.[0];
  if (typeof roll === 'string') roll = JSON.parse(roll);
  if (!roll || !Number.isFinite(Number(roll.total))) throw new Error('Бросок испытания отменён или не вернул результат.');
  const die = roll.terms?.find(t => t.faces === 20) ?? roll.dice?.find(d => d.faces === 20);
  const rawNatural = roll.natural ?? die?.results?.find(r => r.active !== false && !r.discarded)?.result;
  const natural = rawNatural == null ? null : Number(rawNatural);
  row.save = { total: Number(roll.total), natural, success: saveSuccess(Number(roll.total), natural, state.dc), manual: false };
  row.evasion = evasionFor(actor); row.error = null;
}
async function rollMissing(state) {
  await checkResistances(state);
  if (!state.saveType) return;
  for (const row of state.rows) if (!row.excluded && !row.save && !row.override && !row.resistanceError && row.resistance?.success !== false) {
    try { await rollTemplateSave(state, row); } catch (error) { row.error = error.message; }
  }
}
async function rollResistance(state, row) {
  try {
    row.resistance = await checkSpellResistance(game.messages.get(state.source), row.uuid);
    row.resistanceError = null;
  } catch (error) { row.resistanceError = error.message; throw error; }
}
async function checkResistances(state) {
  for (const row of state.rows) if (!row.excluded) {
    try { await rollResistance(state, row); } catch { /* Retain the row error and block damage until resolved. */ }
  }
}
async function applyTemplateDamage(card, state) {
  await checkResistances(state);
  if (state.autoSaves) await rollMissing(state);
  const included = state.rows.filter(r => !r.excluded);
  if (!included.length) throw new Error('Не выбрано ни одной цели.');
  if (included.some(r => !targetDamageMode(state, r))) throw new Error('Сначала выполните испытания либо задайте результат/урон вручную для каждой цели.');
  state.status = 'applying'; state.error = null; state.revision++;
  await saveCard(card, state);
  // UUIDs contain dots: Foundry expands object keys recursively on document updates.
  // Keep them as values in an array so the saved plan survives that expansion.
  const targetModes = included.map(row => ({ uuid: row.uuid, mode: targetDamageMode(state, row),
    note: state.saveType ? `${saveNames[state.saveType] ?? state.saveType}, СЛ ${state.dc}: ${row.save ? saveLabel(row.save) : 'ручное решение'}. ${row.evasion?.note ?? ''}${row.override ? ' Доля урона задана мастером.' : ''}` : 'Без испытания.' }));
  await card.update({ [`flags.${MODULE}.damageSnapshot.targets`]: included.map(r => r.uuid), [`flags.${MODULE}.templateDamagePlan`]: targetModes });
  let failure;
  const request = { id: foundry.utils.randomID(), user: game.user, getFlag: (m, k) => k === 'damageRequest' ? { source: card.id, index: 0, mode: 'full' } : undefined,
    delete: async () => {}, update: async data => { failure = data.content.replace(/<[^>]*>/g, ''); } };
  const receipt = await queueDamageRequest(request);
  state.status = receipt ? 'applied' : 'error'; state.error = failure ?? (receipt ? null : 'Списание не завершено. Проверьте ОЗ перед дальнейшими действиями.');
  state.receipt = receipt?.id ?? null; state.revision++; await saveCard(card, state);
}
export async function createTemplateCards(source, { resume = false } = {}) {
  if (gm()?.id !== game.user.id || !setting('templateDamageEnabled')) return;
  const data = flag(source, 'templateSource'), snapshot = flag(source, 'damageSnapshot');
  if (!data || !snapshot) return;
  const attacker = await fromUuid(snapshot.actor);
  if (!source.user?.isGM && !attacker?.testUserPermission(source.user, 'OWNER')) return;
  for (const [index, attack] of snapshot.attacks.entries()) {
    if (attack.healing || !attack.damage.length || flag(source, 'templateCards')?.[index]) continue;
    await source.setFlag(MODULE, `templateCards.${index}`, 'pending');
    try {
      const state = { source: source.id, sourceIndex: index, template: data.template, name: data.name, height: data.height ?? null, status: 'review', revision: 0,
        saveType: data.saveType ?? '', dc: data.dc, successMode: data.successMode ?? 'half', rows: [], error: data.error ?? null,
        autoSaves: setting('templateAutoSaves'), autoDamage: !resume && setting('templateAutoDamage'), allowExclusions: setting('templateExcludeTargets'),
        damageTotal: attack.damage.reduce((n, r) => n + Number(r.total), 0) };
      const seen = new Set();
      for (const uuid of data.targets ?? []) {
        const token = await fromUuid(uuid), actor = token?.actor;
        if (!actor || seen.has(actor.uuid)) continue;
        seen.add(actor.uuid); state.rows.push({ uuid, actorUuid: actor.uuid, name: token.name, img: /\.(webm|mp4)(?:[?#]|$)/i.test(token.texture?.src ?? '') ? actor.img : token.texture?.src ?? actor.img,
          excluded: false, save: null, override: '', evasion: evasionFor(actor), notes: await saveNotes(actor, state.saveType) });
      }
      if (!state.error) await checkResistances(state);
      if (state.autoSaves && !state.error) await rollMissing(state);
      // A private GM list avoids exposing hidden tokens and NPC saves to players.
      const card = await ChatMessage.create({ content: cardContent(state), ...messageAudience(source, 'templateSavesGMOnly'),
        ...resistanceMessageData(state),
        flags: { [MODULE]: { templateWorkflow: state, damageSnapshot: { version: 1, actor: snapshot.actor, targets: state.rows.map(r => r.uuid), attacks: [clone(attack)] } } } });
      await source.setFlag(MODULE, `templateCards.${index}`, card.id);
      if (state.autoDamage && !state.allowExclusions && state.rows.length && !state.error && state.rows.every(r => targetDamageMode(state, r))) await applyTemplateDamage(card, state);
    } catch (error) {
      console.error(MODULE, 'Template workflow', error);
      // Clear only a reservation for which no card was created. Never reopen an applied attack.
      if (flag(source, 'templateCards')?.[index] === 'pending') await source.unsetFlag(MODULE, `templateCards.${index}`);
    }
  }
}
export async function handleTemplateCommand(card, command, user) {
  if (gm()?.id !== game.user.id || !user?.isGM || !card.user?.isGM) return;
  const state = clone(flag(card, 'templateWorkflow'));
  if (!state || state.status !== 'review' || !Number.isInteger(command.revision) || command.revision > state.revision) return;
  if (command.revision !== state.revision && !['included', 'override', 'edit', 'successMode'].includes(command.action)) {
    if (command.action === 'apply') { state.error = 'Список изменился. Проверьте результаты и нажмите «Применить урон» ещё раз.'; await saveCard(card, state); }
    return;
  }
  try {
    const row = Number.isInteger(command.row) ? state.rows[command.row] : null;
    if (command.action === 'rollAll') await rollMissing(state);
    else if (command.action === 'apply') { await applyTemplateDamage(card, state); return; }
    else if (command.action === 'successMode' && ['full', 'half', 'none'].includes(command.value)) state.successMode = command.value;
    else if (!row) throw new Error('Цель не найдена.');
    else if (command.action === 'included' && state.allowExclusions) row.excluded = !Boolean(command.value);
    else if (command.action === 'override' && ['', 'full', 'half', 'none'].includes(command.value)) { row.override = command.value; if (command.value) row.error = null; }
    else if (command.action === 'roll' && state.saveType && !row.excluded) {
      try { await rollTemplateSave(state, row); } catch (error) { row.error = error.message; }
    } else if (command.action === 'edit' && typeof command.success === 'boolean' && (command.total === null || Number.isFinite(command.total))) {
      row.save = { total: command.total, natural: null, success: command.success, manual: true }; row.error = null;
    } else throw new Error('Неверная команда списка целей.');
    state.error = null; state.revision++; await saveCard(card, state);
    if (state.autoDamage && !state.allowExclusions && state.rows.some(r => !r.excluded) && state.rows.every(r => targetDamageMode(state, r))) await applyTemplateDamage(card, state);
  } catch (error) {
    state.error = error.message; state.revision++; await saveCard(card, state);
  }
}
Hooks.on('createChatMessage', message => {
  if (game.system.id === 'pf1' && gm()?.id === game.user.id && flag(message, 'templateSource')) enqueue(() => createTemplateCards(message));
});
Hooks.on('ready', () => {
  if (game.system.id !== 'pf1' || gm()?.id !== game.user.id || !setting('templateDamageEnabled')) return;
  for (const message of game.messages) if (flag(message, 'templateSource')) enqueue(() => createTemplateCards(message, { resume: true }));
});
Hooks.on('updateChatMessage', (card, change, options, userId) => {
  if (game.system.id !== 'pf1' || gm()?.id !== game.user.id) return;
  const commands = foundry.utils.getProperty(foundry.utils.expandObject(change), `flags.${MODULE}.templateCommands`);
  for (const [id, command] of Object.entries(commands ?? {})) {
    if (id.startsWith('-=') || !command) continue;
    enqueue(async () => { await handleTemplateCommand(card, command, game.users.find(u => u.id === userId)); await card.unsetFlag(MODULE, `templateCommands.${id}`); });
  }
});
Hooks.on('renderChatMessage', (card, html) => {
  const state = flag(card, 'templateWorkflow'); if (game.system.id !== 'pf1' || !state) return;
  const root = html[0] ?? html;
  root.querySelectorAll('.pf1ru-template-card > p.notes').forEach(note => note.remove());
  if (!game.user.isGM) {
    root.querySelectorAll('[data-template-field], [data-template-action]').forEach(control => control.remove());
    root.querySelectorAll('.pf1ru-template-card > label').forEach(label => label.remove());
  }
  for (const button of root.querySelectorAll('[data-template-token]')) {
    const uuid = state.rows[Number(button.dataset.templateToken)]?.uuid;
    bindTokenHover(button, uuid);
    button.addEventListener('click', async () => {
      try { await focusToken(uuid); }
      catch (error) { ui.notifications.warn(error.message); }
    });
  }
  if (!game.user.isGM) return;
  const send = command => card.setFlag(MODULE, `templateCommands.${foundry.utils.randomID()}`, { ...command, revision: state.revision });
  for (const control of root.querySelectorAll('[data-template-field]')) control.addEventListener('change', () => {
    send({ action: control.dataset.templateField, row: control.dataset.row === '' ? null : Number(control.dataset.row), value: control.type === 'checkbox' ? control.checked : control.value });
  });
  for (const button of root.querySelectorAll('[data-template-action]')) button.addEventListener('click', () => {
    const action = button.dataset.templateAction, row = button.dataset.row == null ? null : Number(button.dataset.row);
    if (action !== 'edit') { send({ action, row }); return; }
    const value = state.rows[row].save;
    new Dialog({ title: `Испытание: ${state.rows[row].name}`, content: `<form><div class="form-group"><label>Итог броска (необязательно)</label><input type="number" step="any" name="total" value="${esc(value?.total ?? '')}"></div><div class="form-group"><label>Результат</label><select name="outcome"><option value="auto">По итогу и СЛ</option><option value="success" ${value?.total == null && value?.success === true ? 'selected' : ''}>Успех</option><option value="failure" ${value?.total == null && value?.success === false ? 'selected' : ''}>Провал</option></select></div></form>`,
      buttons: { save: { label: 'Сохранить', callback: html => {
        const form = html[0].querySelector('form'); if (!form.reportValidity()) return false;
        const data = new FormData(form), total = data.get('total') === '' ? null : Number(data.get('total')), outcome = data.get('outcome');
        if (outcome === 'auto' && (total === null || !Number.isFinite(state.dc))) return false;
        send({ action: 'edit', row, total, success: outcome === 'auto' ? total >= state.dc : outcome === 'success' });
      } }, cancel: { label: 'Отмена' } } }).render(true);
  });
});

export async function focusTemplateToken(uuid) {
  if (!game.user.isGM) return;
  return focusToken(uuid);
}

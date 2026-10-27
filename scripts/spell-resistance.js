import { MODULE, escapeHTML as esc } from './special-materials.js';
import { bindTokenHover, focusToken } from './token-navigation.js';

const flag = (doc, key) => doc?.getFlag(MODULE, key);
const locks = new Map();
const writes = new Map();
const setting = key => game.settings.get(MODULE, key) === true;
export function spellResistanceSource(use) {
  if (use.item.type !== 'spell' || use.item.system.sr === false || use.shared.templateData?.spellFailureSuccess === false) return null;
  const book = use.item.system.spellbook;
  return { name: use.item.name, book, cl: Number(use.shared.rollData?.cl ?? use.actor.system.attributes.spells.spellbooks[book]?.cl.total) };
}
export function resistanceLabel(result) {
  if (!result) return '';
  if (result.skipped) return `УкМ ${result.dc}: проверка отключена или отклонена`;
  return `УкМ ${result.dc}: проверка уровня заклинателя ${result.total} — ${result.success ? 'преодолена' : 'не преодолена; без урона'}`;
}
export function resistanceRollContent(result) {
  if (!result || result.skipped) return '';
  return `<section class="pf1ru-cl-check"><h4>Уровень заклинателя против УкМ</h4>
    <div>Устойчивость к магии цели: <strong>${esc(result.dc)}</strong></div>
    ${result.html || `<div class="dice-roll"><div class="dice-result"><h4 class="dice-total">${esc(result.total)}</h4></div></div>`}
    <div class="pf1ru-save-${result.success ? 'success' : 'failure'}">${result.success ? 'УкМ преодолена' : 'УкМ не преодолена — без урона'}</div>
  </section>`;
}
export function resistanceTargetContent(token) {
  const src = token.texture?.src || token.actor?.img || 'icons/svg/mystery-man.svg';
  const media = /\.(webm|mp4)(?:[?#]|$)/i.test(src)
    ? `<video src="${esc(src)}" autoplay loop muted playsinline></video>`
    : `<img src="${esc(src)}" alt="">`;
  return `<button type="button" class="pf1ru-cl-token" data-pf1ru-sr-target title="Найти токен: ${esc(token.name)}" aria-label="Найти токен: ${esc(token.name)}">${media}</button>`;
}
function cached(source, uuid) {
  return flag(source, 'spellResistanceResults')?.find(r => r.uuid === uuid)
    ?? Array.from(game.users).flatMap(u => u.getFlag?.(MODULE, 'spellResistanceResults') ?? []).find(r => r.source === source.id && r.uuid === uuid);
}
export async function checkSpellResistance(source, uuid) {
  const workflow = flag(source, 'templateWorkflow');
  if (workflow) source = game.messages.get(workflow.source) ?? source;
  const spell = flag(source, 'damageSnapshot')?.spell;
  if (!spell) return null;
  const key = `${source.id}:${uuid}`;
  if (locks.has(key)) return locks.get(key);
  const promise = (async () => {
    const previous = cached(source, uuid);
    if (previous) return previous;
    const token = await fromUuid(uuid), actor = token?.actor;
    const dc = Number(actor?.system.attributes?.sr?.total);
    if (!(dc > 0)) return null;
    let rollCheck = !setting('disableAutomaticSpellResistance');
    if (!rollCheck && setting('promptSpellResistance')) rollCheck = await Dialog.confirm({ title: 'Устойчивость к магии',
      content: `<p>${esc(spell.name)} → ${esc(token.name)}: УкМ ${dc}. Выполнить проверку уровня заклинателя?</p>`, defaultYes: false });
    const result = { source: source.id, uuid, actorUuid: actor.uuid, name: token.name, dc, skipped: !rollCheck };
    let rollMessage;
    if (rollCheck) {
      const caster = await fromUuid(flag(source, 'damageSnapshot').actor);
      if (!caster?.rollCL || !Number.isFinite(spell.cl)) throw new Error('Не удалось определить уровень заклинателя для проверки УкМ.');
      const id = foundry.utils.randomID();
      // Keep PF1's native CL-check hooks and modifiers, adding only the per-cast
      // CL offset (for example the offset entered in the spell-use dialog).
      const hook = Hooks.on('pf1PreActorRollCl', (a, options) => {
        if (a !== caster || options.pf1ruResistanceCheck !== id) return;
        const offset = spell.cl - Number(caster.system.attributes.spells.spellbooks[spell.book]?.cl.total ?? 0);
        if (offset) options.parts.push(`${offset}[Смещение уровня заклинателя]`);
      });
      let data;
      try { data = await caster.rollCL(spell.book, { skipDialog: true, chatMessage: false, noSound: true, pf1ruResistanceCheck: id }); }
      finally { Hooks.off('pf1PreActorRollCl', hook); }
      let roll = data?.rolls?.[0];
      if (typeof roll === 'string') roll = JSON.parse(roll);
      if (!roll || !Number.isFinite(Number(roll.total))) throw new Error('Проверка УкМ отменена или не вернула результат.');
      result.total = Number(roll.total); result.success = result.total >= dc;
      result.roll = roll.toJSON ? roll.toJSON() : foundry.utils.deepClone(roll);
      result.formula = roll.formula ?? roll._formula ?? '';
      // PF1's native roll HTML includes the dice tooltip, named bonuses and
      // all caster-level context notes (including notes supplied by hooks).
      result.html = data.content ?? '';
      rollMessage = data;
    }
    if (game.user.isGM || source.isOwner || source.user?.id === game.user.id) {
      const write = (writes.get(source.id) ?? Promise.resolve()).catch(() => {}).then(() =>
        source.setFlag(MODULE, 'spellResistanceResults', [...(flag(source, 'spellResistanceResults') ?? []), result]));
      writes.set(source.id, write);
      try { await write; } finally { if (writes.get(source.id) === write) writes.delete(source.id); }
    } else {
      // A target's owner can apply damage while the GM is offline, without
      // needing write permission on the caster's original chat message.
      await game.user.setFlag(MODULE, 'spellResistanceResults', [...(flag(game.user, 'spellResistanceResults') ?? []).slice(-499), result]);
    }
    if (rollMessage && !flag(source, 'templateSource') && !flag(source, 'damageSnapshot')?.templateWorkflowSource) {
      // Publish the already evaluated native PF1 roll, never roll a second die.
      // Explicit recipients preserve the cast's privacy even when the GM's
      // currently selected roll mode differs from the player's roll mode.
      const message = { ...rollMessage,
        sound: globalThis.CONFIG?.sounds?.dice,
        content: `<section class="pf1ru-cl-message"><div class="pf1ru-cl-heading">${resistanceTargetContent(token)}<h3>${esc(spell.name)} → ${esc(token.name)}</h3></div>${resistanceRollContent(result)}</section>`,
        whisper: [...(source.whisper ?? [])], blind: Boolean(source.blind),
        flags: { ...(rollMessage.flags ?? {}), [MODULE]: { spellResistanceCheck: { source: source.id, target: uuid } } }
      };
      delete message._id;
      await ChatMessage.create(message);
    }
    return result;
  })();
  locks.set(key, promise);
  try { return await promise; } finally { locks.delete(key); }
}

Hooks.on('init', () => {
  if (game.system.id !== 'pf1') return;
  for (const [key, name, hint] of [
    ['disableAutomaticSpellResistance', 'УкМ: отключить автоматические проверки', 'По умолчанию проверка уровня заклинателя против УкМ выполняется автоматически. Включите, чтобы отключить её.'],
    ['promptSpellResistance', 'УкМ: спрашивать перед проверкой', 'Работает только при отключённых автоматических проверках. При отказе проверка не выполняется и не изменяет урон.']
  ]) game.settings.register(MODULE, key, { name, hint, scope: 'world', config: true, type: Boolean, default: false });
});
const boundTokenButtons = new WeakSet();
Hooks.on('renderChatMessage', (message, html) => {
  const check = flag(message, 'spellResistanceCheck');
  if (!check && !flag(message, 'templateWorkflow')) return;
  const root = html[0] ?? html;
  // Also clean the redundant line from messages created before this update.
  root.querySelectorAll('.pf1ru-cl-formula').forEach(el => el.remove());
  if (!check?.target) return;
  const section = root.querySelector('.pf1ru-cl-message');
  if (!section) return; // A private roll may have no visible content for this user.
  if (!section.querySelector('[data-pf1ru-sr-target]')) {
    const token = globalThis.fromUuidSync?.(check.target);
    const title = section.querySelector('h3');
    if (token && title) {
      const heading = document.createElement('div'); heading.className = 'pf1ru-cl-heading';
      heading.innerHTML = resistanceTargetContent(token);
      title.before(heading); heading.append(title);
    }
  }
  for (const button of section.querySelectorAll('[data-pf1ru-sr-target]')) {
    if (boundTokenButtons.has(button)) continue;
    boundTokenButtons.add(button);
    bindTokenHover(button, check.target);
    button.addEventListener('click', () => focusToken(check.target).catch(error => ui.notifications.warn(error.message)));
  }
});
Hooks.on('createChatMessage', async source => {
  if (game.system.id !== 'pf1') return;
  const gm = game.users.activeGM ?? game.users.find(u => u.active && u.isGM);
  if ((gm?.id ?? source.user?.id) !== game.user.id) return;
  const snapshot = flag(source, 'damageSnapshot');
  if (!snapshot?.spell || snapshot.templateWorkflowSource || flag(source, 'templateWorkflow')) return;
  const caster = await fromUuid(snapshot.actor);
  if (!source.user?.isGM && !caster?.testUserPermission(source.user, 'OWNER')) return;
  for (const uuid of snapshot.targets) {
    try { await checkSpellResistance(source, uuid); }
    catch (error) { console.error(MODULE, 'Spell resistance', error); }
  }
});

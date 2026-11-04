const remembered = new Map(), pending = new Map();
let timer = null;
const health = actor => {
  const hp = actor?.system?.attributes?.hp;
  return hp && Number.isFinite(Number(hp.value)) ? { value: Number(hp.value), temp: Number(hp.temp) || 0, nonlethal: Number(hp.nonlethal) || 0 } : null;
};
export function healthTextChanges(before, after) {
  const damage = Math.max(0, before.value - after.value) + Math.max(0, before.temp - after.temp) + Math.max(0, after.nonlethal - before.nonlethal);
  const healing = Math.max(0, after.value - before.value);
  const nonlethalHealing = Math.max(0, before.nonlethal - after.nonlethal);
  return { damage, healing, nonlethalHealing };
}
const MODULE = 'pf1e-ru-improvements';
export function healthTextSize() {
  const size = Number(game.settings?.get(MODULE, 'healthTextSize'));
  return Number.isFinite(size) && size > 0 ? Math.min(100, Math.max(12, size)) : 34;
}
export function healthTextVisible(token) {
  if (!token || token.destroyed || !token.visible) return false;
  const mode = game.settings?.get(MODULE, 'healthTextVisibility') ?? 'all';
  if (mode === 'none') return false;
  return mode !== 'owners' || game.user?.isGM || token.actor?.testUserPermission?.(game.user, 'OWNER') === true;
}
const visible = healthTextVisible;
Hooks.on('init', () => {
  if (game.system.id !== 'pf1') return;
  game.settings.register(MODULE, 'healthTextVisibility', {
    name: 'Цифры урона и лечения над токенами', scope: 'world', config: true, type: String, default: 'all',
    choices: { all: 'Включены у всех', owners: 'ГМ видит все, игроки — только своих персонажей', none: 'Выключены у всех' },
    hint: 'Определяет, кому видны цифры изменения ОЗ. Скрытые от пользователя токены не раскрываются.', onChange: rememberScene
  });
  game.settings.register(MODULE, 'healthTextSize', {
    name: 'Размер цифр урона и лечения', scope: 'world', config: true, type: Number, default: 34,
    range: { min: 12, max: 100, step: 1 },
    hint: 'Размер шрифта над токенами в пикселях. По умолчанию: 34. Изменение применяется к следующим анимациям без перезагрузки.'
  });
});
function clear() {
  if (timer !== null) clearTimeout(timer);
  timer = null; pending.clear(); remembered.clear();
}
function rememberScene() {
  clear();
  if (game.system.id !== 'pf1') return;
  for (const token of canvas.tokens?.placeables ?? []) {
    const hp = health(token.actor); if (hp) remembered.set(token.actor.uuid, hp);
  }
}
function drain() {
  timer = null;
  const entry = pending.entries().next().value;
  if (!entry) return;
  const [key, job] = entry; pending.delete(key);
  const token = canvas.tokens?.placeables?.find(t => t.document.uuid === job.uuid);
  if (visible(token) && canvas.ready) {
    const text = job.kind === 'damage' ? `−${job.amount}` : job.kind === 'healing' ? `+${job.amount}` : `−${job.amount} нелет.`;
    // Start one animation per 90ms, independent of document writes. Hidden or
    // deleted tokens are checked again at display time; no socket broadcasts.
    Promise.resolve().then(() => canvas.interface.createScrollingText({ x: token.center.x, y: token.y }, text, {
      duration: 1400, distance: Math.max(36, token.h * 0.65), anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
      direction: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: healthTextSize(), stroke: 0x000000, strokeThickness: 4,
      fill: job.kind === 'damage' ? 0xff3333 : 0x33cc55
    })).catch(error => console.warn('pf1e-ru-improvements | Health text', error));
  }
  if (pending.size) timer = setTimeout(drain, 90);
}
export function showHealthChange(actor) {
  if (game.system.id !== 'pf1' || !canvas.ready) return;
  const before = remembered.get(actor.uuid), after = health(actor);
  if (!after) return;
  remembered.set(actor.uuid, after);
  if (!before) return;
  const changes = healthTextChanges(before, after);
  for (const token of canvas.tokens?.placeables ?? []) {
    if (token.actor?.uuid !== actor.uuid || !visible(token)) continue;
    for (const [kind, amount] of Object.entries(changes)) {
      if (!amount) continue;
      const key = `${token.document.uuid}:${kind}`, existing = pending.get(key);
      pending.set(key, { uuid: token.document.uuid, kind, amount: amount + (existing?.amount ?? 0) });
    }
  }
  if (pending.size && timer === null) timer = setTimeout(drain, 0);
}
Hooks.on('canvasReady', rememberScene);
Hooks.on('canvasTearDown', clear);
Hooks.on('createToken', doc => {
  if (game.system.id !== 'pf1' || doc.parent?.id !== canvas.scene?.id) return;
  const hp = health(doc.actor); if (hp) remembered.set(doc.actor.uuid, hp);
});
Hooks.on('updateActor', showHealthChange);

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
const visible = token => token && !token.destroyed && token.visible;
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
      direction: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 34, stroke: 0x000000, strokeThickness: 4,
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

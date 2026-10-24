const MODULE = 'pf1e-ru-improvements';
const pending = new WeakMap();

// Foundry 11 hides the shared container across async texture loads. Overlapping
// calls can capture visible=false and restore it last, leaving every icon hidden.
export function serializeTokenEffects(wrapped, ...args) {
  const existing = pending.get(this);
  if (existing) { existing.again = true; existing.args = args; return existing.promise; }
  const state = { again: false, args };
  pending.set(this, state);
  state.promise = Promise.resolve().then(async () => {
    let result;
    do {
      state.again = false;
      const container = this.effects;
      if (this.destroyed || !container || container.destroyed) return;
      const visible = container.visible;
      try { result = await wrapped(...state.args); }
      finally {
        if (!container.destroyed && this.effects === container) container.visible = visible;
      }
    } while (state.again && !this.destroyed);
    return result;
  }).finally(() => pending.delete(this));
  return state.promise;
}
Hooks.on('init', () => {
  if (game.system.id !== 'pf1' || Number(game.release?.generation ?? 11) !== 11) return;
  if (game.modules.get('lib-wrapper')?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE, 'Token.prototype.drawEffects', serializeTokenEffects, 'WRAPPER');
  } else {
    const original = Token.prototype.drawEffects;
    Token.prototype.drawEffects = function(...args) { return serializeTokenEffects.call(this, original.bind(this), ...args); };
  }
});

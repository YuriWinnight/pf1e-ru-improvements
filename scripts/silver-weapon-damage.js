import { MODULE, materialConfig } from './special-materials.js';
export function silverWeaponDamage(wrapped, options = {}) {
  if (materialConfig(this.item).id !== 'silver' || this.item?.type === 'spell' || this.isHealing || !['mwak', 'rwak'].includes(this.data?.actionType)) return wrapped(options);
  // Native PF1 adds extraParts only to the first damage part. It also repeats
  // this roll for critical multipliers and handles minimum nonlethal damage.
  return wrapped({ ...options, extraParts: [...(options.extraParts ?? []), '-1[Алхимическое серебро]'] });
}
Hooks.on('setup', () => {
  if (game.system.id !== 'pf1') return;
  const prototype = pf1.components.ItemAction.prototype;
  if (game.modules.get('lib-wrapper')?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE, 'pf1.components.ItemAction.prototype.rollDamage', silverWeaponDamage, 'WRAPPER');
  } else {
    const original = prototype.rollDamage;
    prototype.rollDamage = function(options) { return silverWeaponDamage.call(this, original.bind(this), options); };
  }
});

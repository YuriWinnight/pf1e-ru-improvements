const SPELLBOOK_WARNING_MODULE = "pf1e-ru-improvements";
const patchedSpellbookClasses = new WeakSet();

function resetSpellbookAbilityWarning(wrapped, bookId, ...args) {
  const book = this.system?.attributes?.spells?.spellbooks?.[bookId];
  // PF1 9.6 prepares spellbooks before and after applying each item change. Its native
  // method sets this flag when the score is low, but never clears it when bonuses raise
  // the score. Reset only the derived flag and let PF1 evaluate the current score again.
  for (const level of Object.values(book?.spells ?? {})) {
    if (level && typeof level === "object") delete level.lowAbilityScore;
  }
  return wrapped(bookId, ...args);
}

function installSpellbookAbilityWarningFix() {
  if (game.system.id !== "pf1") return;
  for (const type of ["character", "npc"]) {
    const actorClass = CONFIG.Actor.documentClasses?.[type];
    const prototype = actorClass?.prototype;
    if (!prototype || typeof prototype._updateSpellBook !== "function" || patchedSpellbookClasses.has(actorClass)) continue;
    if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
      libWrapper.register(SPELLBOOK_WARNING_MODULE,
        `CONFIG.Actor.documentClasses.${type}.prototype._updateSpellBook`,
        resetSpellbookAbilityWarning, "WRAPPER");
    } else {
      const original = prototype._updateSpellBook;
      prototype._updateSpellBook = function(...args) {
        return resetSpellbookAbilityWarning.call(this, original.bind(this), ...args);
      };
    }
    patchedSpellbookClasses.add(actorClass);
  }
}

Hooks.once("init", installSpellbookAbilityWarningFix);
Hooks.once("setup", installSpellbookAbilityWarningFix);

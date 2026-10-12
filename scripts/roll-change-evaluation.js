const ROLL_CHANGE_MODULE = "pf1e-ru-improvements";
const preparingRollActors = new WeakMap();
const patchedRollActorClasses = new WeakSet();
const rollChangeTargets = new Set(["attack", "mattack", "rattack", "damage", "wdamage", "sdamage"]);
let rollChangePatched = false;

function trackActorChangePreparation(wrapped, ...args) {
  const depth = preparingRollActors.get(this) ?? 0;
  preparingRollActors.set(this, depth + 1);
  try { return wrapped(...args); }
  finally {
    if (depth) preparingRollActors.set(this, depth);
    else preparingRollActors.delete(this);
  }
}

function evaluateRollChangeWithoutApplying(wrapped, actor, targets = null, options = {}) {
  if (!actor || preparingRollActors.has(actor) || targets !== null || !rollChangeTargets.has(this.subTarget)) {
    return wrapped(actor, targets, options);
  }
  const overrides = actor.changeOverrides;
  if (!overrides) return wrapped(actor, targets, options);
  // PF1 9.6 calls applyChange just to evaluate a roll's attack/damage bonus.
  // Reusing prepared targets applies stacking penalties to the actor AGAIN.
  // Its native null target evaluates the formula but skips actor/source writes.
  // Supply the required sentinel synchronously and restore it even on errors.
  const descriptor = Object.getOwnPropertyDescriptor(overrides, "null");
  overrides.null = {};
  try { return wrapped(actor, [null], { ...options, applySourceInfo: false }); }
  finally {
    if (descriptor) Object.defineProperty(overrides, "null", descriptor);
    else delete overrides.null;
  }
}

function wrapRollChangeMethod(path, prototype, method, wrapper) {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(ROLL_CHANGE_MODULE, path, wrapper, "WRAPPER");
  } else {
    const original = prototype[method];
    prototype[method] = function(...args) { return wrapper.call(this, original.bind(this), ...args); };
  }
}

function installRollChangeEvaluationFix() {
  if (game.system.id !== "pf1") return;
  for (const type of ["character", "npc"]) {
    const actorClass = CONFIG.Actor.documentClasses?.[type];
    if (!actorClass || patchedRollActorClasses.has(actorClass)) continue;
    wrapRollChangeMethod(`CONFIG.Actor.documentClasses.${type}.prototype.prepareDerivedData`,
      actorClass.prototype, "prepareDerivedData", trackActorChangePreparation);
    patchedRollActorClasses.add(actorClass);
  }
  const changeClass = globalThis.pf1?.components?.ItemChange;
  if (!changeClass || rollChangePatched) return;
  wrapRollChangeMethod("pf1.components.ItemChange.prototype.applyChange", changeClass.prototype,
    "applyChange", evaluateRollChangeWithoutApplying);
  rollChangePatched = true;
}

Hooks.once("init", installRollChangeEvaluationFix);
Hooks.once("setup", installRollChangeEvaluationFix);

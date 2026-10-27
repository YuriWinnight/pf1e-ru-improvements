const ROLL_CHANGE_MODULE = "pf1e-ru-improvements";
const preparingRollActors = new WeakMap();
const patchedRollActorClasses = new WeakSet();
const rollChangeTargets = new Set(["attack", "mattack", "rattack", "damage", "wdamage", "sdamage"]);
let rollChangePatched = false;

// PF1 resets skill.mod only after applying all Changes. During preparation,
// formulas must use the current ranks/ability/change bonuses instead of that
// unprepared field. Do not touch persisted skills or the final roll cache.
export function refreshSubskillModifiers(actor, data) {
  for (const skill of Object.values(data.skills ?? {})) {
    for (const sub of Object.values(skill?.subSkills ?? {})) {
      if (!sub) continue;
      sub.mod = Number(sub.rank || 0) + (sub.cs && sub.rank > 0 ? pf1.config.classSkillBonus : 0)
        + Number(data.abilities?.[sub.ability]?.mod || 0) + Number(sub.changeBonus || 0)
        - (sub.acp ? Number(data.attributes?.acp?.total || 0) : 0);
    }
  }
}
export function orderSkillDependencies(targets, changes) {
  const dependencies = new Map();
  for (const target of targets) {
    if (!target.includes('.subSkills.')) continue;
    const parent = target.split('.subSkills.')[0];
    if (targets.includes(parent)) dependencies.set(target, new Set([parent]));
  }
  for (const change of changes) {
    if (!targets.includes(change.subTarget) || typeof change.formula !== 'string') continue;
    for (const match of change.formula.matchAll(/@skills\.([\w]+(?:\.subSkills\.[\w]+)?)\.mod\b/g)) {
      const source = `skill.${match[1]}`;
      if (targets.includes(source) && source !== change.subTarget) {
        if (!dependencies.has(change.subTarget)) dependencies.set(change.subTarget, new Set());
        dependencies.get(change.subTarget).add(source);
      }
    }
  }
  const result = [], visited = new Set(), active = new Set();
  const visit = target => {
    if (visited.has(target) || active.has(target)) return;
    active.add(target);
    for (const source of dependencies.get(target) ?? []) visit(source);
    active.delete(target); visited.add(target); result.push(target);
  };
  targets.forEach(visit);
  return result;
}
Hooks.on('pf1GetRollData', (actor, data) => {
  if (preparingRollActors.has(actor)) refreshSubskillModifiers(actor, data);
});

function trackActorChangePreparation(wrapped, ...args) {
  const depth = preparingRollActors.get(this) ?? 0;
  const ownTargets = Object.getOwnPropertyDescriptor(this, '_skillTargets');
  const originalTargets = this._skillTargets;
  if (!depth && Array.isArray(originalTargets)) Object.defineProperty(this, '_skillTargets', {
    configurable: true, get: () => orderSkillDependencies(originalTargets, Array.from(this.changes ?? []))
  });
  preparingRollActors.set(this, depth + 1);
  try { return wrapped(...args); }
  finally {
    if (!depth && Array.isArray(originalTargets)) {
      if (ownTargets) Object.defineProperty(this, '_skillTargets', ownTargets);
      else delete this._skillTargets;
    }
    if (depth) preparingRollActors.set(this, depth);
    else preparingRollActors.delete(this);
  }
}

function evaluateRollChangeWithoutApplying(wrapped, actor, targets = null, options = {}) {
  if (actor && preparingRollActors.has(actor) && typeof this.formula === 'string' && /@skills\.\w+\.subSkills\.\w+\./.test(this.formula)) {
    // ItemPF.getRollData ignores the refresh option supplied by ItemChange.
    // Refresh the actor cache first, after the source skill's Changes ran.
    actor.getRollData({ refresh: true });
  }
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

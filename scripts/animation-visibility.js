// Sequencer 3.x checks TokenMesh.visible, which does not reflect Token.visible in Foundry 11.
// Gate rendering locally instead of ending effects or changing their shared data/animation state.
const ANIMATION_VISIBILITY_WRAPPER = Symbol("pf1e-ru-improvements.animation-visibility");

function canViewAnimationToken(document, reference) {
  if (document?.documentName !== "Token") {
    // A token not yet drawn (or just deleted) must not leak through a cached effect position.
    return !(typeof reference === "string" && /^Scene\.[^.]+\.Token\.[^.]+$/.test(reference));
  }
  if (document.hidden) return false;
  const token = document.object;
  // Foundry resolves invisibility, special senses and the current user's vision into this value.
  // Do not evaluate Token.isVisible here: its getter changes detectionFilter and repeats LOS tests.
  return Boolean(token && !token.destroyed && token.visible);
}

function canViewTokenAnimation(effect) {
  if (game.user?.isGM) return true;
  const data = effect.data;
  if (!data || data.screenSpace) return true;

  // Persistent auras and other effects following a token must follow its visibility as well,
  // even if the effect was configured with bindVisibility:false.
  if (data.attachTo?.active && !canViewAnimationToken(effect.sourceDocument, data.source)) return false;
  if ((data.stretchTo?.attachTo || data.rotateTowards?.attachTo)
    && !canViewAnimationToken(effect.targetDocument, data.target)) return false;

  // A stationary atLocation(token) effect can also expose that token without attachTo().
  // Coordinate-only effects, templates and travelling projectiles retain their usual behavior.
  if (!data.attachTo?.active && !data.moves && !data.stretchTo && !data.rotateTowards
    && !canViewAnimationToken(effect.sourceDocument, data.source)) return false;
  return true;
}

function protectTokenAnimation(effect) {
  if (!effect) return;
  for (const method of ["render", "renderCanvas"]) {
    const original = effect[method];
    if (typeof original !== "function" || original[ANIMATION_VISIBILITY_WRAPPER]) continue;
    const guarded = function(...args) {
      if (!canViewTokenAnimation(this)) return;
      return original.apply(this, args);
    };
    guarded[ANIMATION_VISIBILITY_WRAPPER] = true;
    effect[method] = guarded;
  }
}

function protectExistingTokenAnimations() {
  if (!game.modules.get("sequencer")?.active) return;
  for (const effect of globalThis.Sequencer?.EffectManager?.effects ?? []) protectTokenAnimation(effect);
}

// createSequencerEffect fires before textures are loaded or added to the canvas, preventing
// a first-frame flash. Each render reads current token visibility, so movement, sight changes,
// status changes and un-hiding need neither polling nor changes to persisted effect flags.
Hooks.on("createSequencerEffect", protectTokenAnimation);
Hooks.on("updateSequencerEffect", protectTokenAnimation);
Hooks.on("sequencerEffectManagerReady", protectExistingTokenAnimations);
Hooks.on("canvasReady", protectExistingTokenAnimations);
Hooks.once("ready", protectExistingTokenAnimations);

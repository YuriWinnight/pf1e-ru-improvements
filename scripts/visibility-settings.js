const VISIBILITY_MODULE = "pf1e-ru-improvements";

export function canSeeOwnHiddenToken(document) {
  return Boolean(document?.hidden && game.user && !game.user.isGM
    && game.settings.get(VISIBILITY_MODULE, "ownerSeesHiddenToken")
    && document.actor?.testUserPermission(game.user, "OWNER"));
}

function gmChatVisibility(wrapped, ...args) {
  const visible = wrapped(...args);
  return visible || Boolean(game.user?.isGM && game.settings.get(VISIBILITY_MODULE, "gmSeesAllMessages"));
}

function ownHiddenTokenVisibility(wrapped, ...args) {
  const visible = wrapped(...args);
  return visible || canSeeOwnHiddenToken(this.document);
}

function ownHiddenTokenVision(wrapped, ...args) {
  const source = wrapped(...args);
  if (source || !canSeeOwnHiddenToken(this.document)) return source;
  if (!canvas.effects.visibility.tokenVision || !this.hasSight) return false;
  if (this.controlled) return true;
  // Keep Foundry's usual rule: use all owned sight sources only when no other
  // sighted token is selected. A hidden owned token is now a selectable source too.
  return !this.layer.controlled.some(token => token !== this && token.hasSight
    && (!token.document.hidden || canSeeOwnHiddenToken(token.document)));
}

function ownHiddenTokenAlpha(wrapped, ...args) {
  const alpha = this.alpha;
  const result = wrapped(...args);
  // Foundry 11 prepares hidden tokens with alpha=0 for players. Restore only the
  // local derived alpha, capped at the GM's 0.5; never modify the saved document.
  if (canSeeOwnHiddenToken(this)) this.alpha = Math.min(alpha, 0.5);
  return result;
}

function restoreGMPrivateRollDetails(message, html, data) {
  if (!game.user?.isGM || !game.settings.get(VISIBILITY_MODULE, "gmSeesAllMessages")) return;
  if (!message.whisper.length || message.whisper.includes(game.user.id) || (message.isAuthor && !message.blind)) return;
  const root = html?.[0] ?? html;
  const content = root?.querySelector?.(".message-content");
  if (!content || typeof data?.message?.content !== "string") return;
  // PF1 9.6's renderChatMessage hook redacts these nodes independently of
  // isContentVisible. Recover just its dice fields from the already enriched
  // render data, keeping the actual message, recipients and card listeners intact.
  const original = document.createElement("div");
  original.innerHTML = data.message.content;
  for (const selector of [".dice", ".dice-formula", ".dice-total"]) {
    const sources = original.querySelectorAll(selector);
    const targets = content.querySelectorAll(selector);
    if (sources.length !== targets.length) continue;
    sources.forEach((source, index) => {
      targets[index].innerHTML = source.innerHTML;
      for (const state of ["success", "failure"]) {
        targets[index].classList.toggle(state, source.classList.contains(state));
      }
    });
  }
}

function wrapVisibilityMember(className, prototype, member, wrapper, getter = false) {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(VISIBILITY_MODULE, `${className}.prototype.${member}`, wrapper, "WRAPPER");
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(prototype, member);
  const original = getter ? descriptor.get : descriptor.value;
  Object.defineProperty(prototype, member, {
    ...descriptor,
    [getter ? "get" : "value"]: function(...args) {
      return wrapper.call(this, original.bind(this), ...args);
    }
  });
}

Hooks.once("init", () => {
  if (game.system.id !== "pf1") return;
  for (const [key, label] of [["gmSeesAllMessages", "GMSeesAllMessages"], ["ownerSeesHiddenToken", "OwnerSeesHiddenToken"]]) {
    game.settings.register(VISIBILITY_MODULE, key, {
      name: `PF1ERU.Settings.${label}.Name`,
      hint: `PF1ERU.Settings.${label}.Hint`,
      scope: "world", config: true, type: Boolean, default: false, requiresReload: true
    });
  }
  // Both chat getters are needed: whispers are omitted by ChatLog.visible,
  // while self/blind rolls are redacted separately by isContentVisible.
  // This also covers chat history without changing its recipients or roll mode.
  wrapVisibilityMember("ChatMessage", ChatMessage.prototype, "visible", gmChatVisibility, true);
  wrapVisibilityMember("ChatMessage", ChatMessage.prototype, "isContentVisible", gmChatVisibility, true);
  wrapVisibilityMember("Token", Token.prototype, "isVisible", ownHiddenTokenVisibility, true);
  wrapVisibilityMember("Token", Token.prototype, "_isVisionSource", ownHiddenTokenVision);
  wrapVisibilityMember("TokenDocument", TokenDocument.prototype, "prepareBaseData", ownHiddenTokenAlpha);
  Hooks.on("renderChatMessage", restoreGMPrivateRollDetails);
});

export async function focusToken(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc?.parent) throw new Error('Токен больше не существует.');
  if (!game.user.isGM && (canvas.scene?.id !== doc.parent.id || !doc.object?.visible || doc.hidden)) {
    throw new Error('Токен сейчас не виден на вашей сцене.');
  }
  if (canvas.scene?.id !== doc.parent.id) await doc.parent.view();
  const token = canvas.tokens?.get(doc.id);
  if (!token || canvas.scene?.id !== doc.parent.id) throw new Error('Не удалось показать токен на сцене.');
  if (game.user.isGM || token.isOwner) {
    canvas.tokens.activate();
    token.control({ releaseOthers: true });
  }
  await canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
}

let hovered;
export function clearChatTokenHover() {
  if (!hovered) return;
  const current = hovered; hovered = null;
  current.observer?.disconnect();
  if (!current.token.destroyed) current.token._onHoverOut(new Event('pointerout'));
}
export function bindTokenHover(button, uuid) {
  button.addEventListener('mouseenter', event => {
    clearChatTokenHover();
    const token = globalThis.canvas?.tokens?.placeables?.find(t => t.document.uuid === uuid);
    if (!token || token.destroyed || !token.visible || (!game.user.isGM && token.document.hidden)) return;
    token._onHoverIn(event, { hoverOutOthers: true });
    hovered = { button, token };
    // Chat rerenders can remove the hovered element without a mouseleave event.
    if (globalThis.MutationObserver) {
      const observer = new MutationObserver(() => { if (!button.isConnected) clearChatTokenHover(); });
      hovered.observer = observer; observer.observe(document.body, { childList: true, subtree: true });
    }
  });
  button.addEventListener('mouseleave', () => { if (hovered?.button === button) clearChatTokenHover(); });
}
Hooks.on('canvasTearDown', clearChatTokenHover);

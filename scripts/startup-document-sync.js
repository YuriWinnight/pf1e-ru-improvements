const installed = new WeakMap();

/** Capture server notifications while Foundry 11 loads the canvas. No server writes,
 * polling, GM requests, synthetic update calls, or replacement world snapshots.
 * Hand queued responses to the actual native backend handler, in arrival order.
 */
export function bufferStartupDocuments(socket, backend, report = console.error) {
  if (installed.has(socket)) return installed.get(socket);
  const queue = [], original = backend.activateSocketListeners;
  let handler, activated = false, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const capture = response => queue.push(response);
  socket.on('modifyDocument', capture);
  const state = { done, get pending() { return queue.length; } };
  installed.set(socket, state);
  function activate(...args) {
    if (args[0] !== socket || activated) return original.apply(this, args);
    activated = true;
    const before = new Set(socket.listeners('modifyDocument'));
    const result = original.apply(this, args);
    const added = socket.listeners('modifyDocument').filter(listener => !before.has(listener));
    if (added.length !== 1) {
      socket.off('modifyDocument', capture);
      if (backend.activateSocketListeners === activate) backend.activateSocketListeners = original;
      report('pf1e-ru-improvements | Не удалось подключить очередь загрузки: неизвестный обработчик документов.');
      queue.length = 0; resolveDone(); return result;
    }
    handler = added[0];
    socket.off('modifyDocument', handler);
    if (backend.activateSocketListeners === activate) backend.activateSocketListeners = original;
    // Run after the complete native socket registration, not inside it.
    void Promise.resolve().then(drain);
    return result;
  }
  backend.activateSocketListeners = activate;
  async function drain() {
    let processed = 0, failures = 0;
    while (queue.length) {
      const response = queue.shift();
      try {
        // Avoid animating historical movements across the map during catch-up.
        const replay = { ...response, request: { ...response.request, options: { ...response.request?.options, animate: false } } };
        await handler(replay);
      } catch (error) { failures++; report('pf1e-ru-improvements | Ошибка синхронизации при загрузке', error); }
      if (++processed % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    // No asynchronous gap here: new notifications now go directly to Foundry.
    socket.off('modifyDocument', capture);
    socket.on('modifyDocument', handler);
    if (failures) globalThis.ui?.notifications?.warn('Не все изменения мира удалось получить при загрузке. Перезагрузите страницу; подробности в консоли.');
    resolveDone({ processed, failures });
  }
  return state;
}
Hooks.once('init', () => {
  if (game.system.id !== 'pf1' || Number(game.release?.generation) !== 11 || game.ready) return;
  bufferStartupDocuments(game.socket, CONFIG.DatabaseBackend);
});

const installed = new WeakMap();

// A create notification may already be represented by the initial world data.
// Recreating it would replace the document which the canvas just drew and leave
// its old placeable behind. Keep that instance; subsequent queued updates still
// go through the native handler. Compendium operations use their native path.
export function withoutExistingCreates(response) {
  const request = response.request;
  if (request?.action !== 'create' || request.pack || request.parentUuid?.startsWith('Compendium.')) return response;
  const collection = request.parentUuid
    ? globalThis.fromUuidSync?.(request.parentUuid)?.getEmbeddedCollection(request.type)
    : globalThis.game?.collections?.get(request.type);
  if (!collection) return response;
  const result = (response.result ?? []).filter(data => !collection.has(data._id));
  return result.length ? { ...response, result } : null;
}

/** Capture server notifications while Foundry 11 loads the canvas. No server writes,
 * polling, GM requests, synthetic update calls, or replacement world snapshots.
 * Hand queued responses to the actual native backend handler, in arrival order.
 */
export function bufferStartupDocuments(socket, backend, report = console.error) {
  if (installed.has(socket)) return installed.get(socket);
  const queue = [], original = backend.activateSocketListeners;
  let handler, activated = false, cancelled = false, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const capture = response => queue.push(response);
  socket.on('modifyDocument', capture);
  const state = { done, get pending() { return queue.length; }, cancel() {
    if (activated || cancelled) return;
    cancelled = true;
    socket.off('modifyDocument', capture);
    if (backend.activateSocketListeners === activate) backend.activateSocketListeners = original;
    queue.length = 0;
    installed.delete(socket);
    resolveDone({ processed: 0, failures: 0 });
  } };
  installed.set(socket, state);
  function activate(...args) {
    if (args[0] !== socket || activated || cancelled) return original.apply(this, args);
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
        const replay = withoutExistingCreates({ ...response, request: { ...response.request, options: { ...response.request?.options, animate: false } } });
        if (replay) await handler(replay);
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

/** Modules execute before DOMContentLoaded/Game.create. Subscribe BEFORE the
 * world request: init is too late, especially while a large world is in flight.
 * The normal backend is still invoked only after Foundry has built documents
 * and finished canvas initialization. Never replay before those exist.
 */
export function installEarlyDocumentCapture(GameClass, backend, report = console.error) {
  const original = GameClass.getData;
  async function getData(socket, view, ...args) {
    if (!['game', 'stream'].includes(view)) return original.call(this, socket, view, ...args);
    const state = bufferStartupDocuments(socket, backend, report);
    try {
      const data = await original.call(this, socket, view, ...args);
      if (data?.system?.id !== 'pf1' || Number(data?.release?.generation) !== 11) state.cancel();
      return data;
    } catch (error) {
      state.cancel();
      throw error;
    } finally {
      if (GameClass.getData === getData) GameClass.getData = original;
    }
  }
  GameClass.getData = getData;
}

if (typeof Game !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.DatabaseBackend) {
  installEarlyDocumentCapture(Game, CONFIG.DatabaseBackend);
}

// Fallback for loaders which execute this file after Game.getData has returned.
Hooks.once('init', () => {
  if (game.system.id !== 'pf1' || Number(game.release?.generation) !== 11 || game.ready) return;
  bufferStartupDocuments(game.socket, CONFIG.DatabaseBackend);
});

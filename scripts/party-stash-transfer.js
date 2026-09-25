const PARTY_MODULE = "pf1e-party-folder";
const GIVE_PATCH = Symbol.for("pf1e-ru-improvements.party-stash-transfer");
const pendingItems = new Set();
const partyQueues = new Map();

function partyIntegration() {
  if (!game.modules.get(PARTY_MODULE)?.active) return null;
  const api = globalThis.PF1EPartyFolder;
  return typeof api?.getPartyActors === "function"
    && typeof api?.PF1PartyActorSheet?.prototype?._storeItem === "function" ? api : null;
}

function isParty(actor) {
  return Boolean(actor?.getFlag?.(PARTY_MODULE, "isParty"));
}

function giveTitle() {
  return game.i18n.lang === "ru" ? "Передать предмет актёру" : "Give item to actor";
}

// Keep translation scoped to the transfer dialog, including when Party Folder is disabled.
Hooks.on("renderDialog", (app, html) => {
  if (game.i18n.lang !== "ru" || !["Give item to actor", "Give iten to actor"].includes(app.data?.title)) return;
  app.data.title = giveTitle();
  const root = app.element?.[0] ?? html?.[0] ?? html;
  const title = root?.querySelector?.(".window-title");
  if (title) title.textContent = giveTitle();
});

function chooseGiveTarget(targets) {
  return new Promise(resolve => {
    let chosen = false;
    const wrapper = document.createElement("div");
    targets.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = `dialog-get-actor flexrow${entry.disabled ? " disabled" : ""}`;
      row.dataset.giveTargetIndex = String(index);
      const image = document.createElement("img");
      image.src = entry.document.img || "icons/svg/chest.svg";
      const name = document.createElement("h2");
      name.textContent = entry.name ?? entry.document.name;
      row.append(image, name);
      wrapper.append(row);
    });
    new Dialog({
      title: giveTitle(), content: wrapper.innerHTML, buttons: {},
      close: () => { if (!chosen) resolve(null); },
      render(html) {
        html.find("[data-give-target-index]:not(.disabled)").click(event => {
          if (chosen) return;
          const entry = targets[Number(event.currentTarget.dataset.giveTargetIndex)];
          if (!entry || entry.disabled) return;
          chosen = true;
          resolve(entry);
          this.close();
        });
      }
    }, { classes: [...Dialog.defaultOptions.classes, "pf1", "get-actor"] }).render(true);
  });
}

async function transferToParty(api, party, item, sourceActor) {
  const previous = partyQueues.get(party.id) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    if (!partyIntegration() || !party.testUserPermission(game.user, "OWNER")
      || !sourceActor.testUserPermission(game.user, "OWNER") || sourceActor.items.get(item.id) !== item) {
      throw new Error("Нет доступа к предмету или тайнику партии.");
    }
    const before = new Set((party.getFlag(PARTY_MODULE, "stash")?.items ?? []).map(entry => entry.stashId));
    // Party Folder performs normalization, including container contents and identification flags.
    // Copy first, then delete the source only after a successful write to the stash.
    const stored = await api.PF1PartyActorSheet.prototype._storeItem.call(
      { actor: party }, item, { ctrlKey: true }
    );
    if (!stored) return;
    const added = new Set((party.getFlag(PARTY_MODULE, "stash")?.items ?? [])
      .filter(entry => !before.has(entry.stashId)).map(entry => entry.stashId));
    if (!added.size) throw new Error("Не удалось подтвердить добавление предмета в тайник.");
    try {
      await sourceActor.deleteEmbeddedDocuments("Item", [item.id]);
      if (sourceActor.items.has(item.id)) throw new Error("Исходный предмет не был удалён.");
    } catch (error) {
      const stash = foundry.utils.deepClone(party.getFlag(PARTY_MODULE, "stash"));
      stash.items = stash.items.filter(entry => !added.has(entry.stashId));
      await party.setFlag(PARTY_MODULE, "stash", stash);
      throw error;
    }
  });
  partyQueues.set(party.id, operation);
  try { await operation; }
  finally { if (partyQueues.get(party.id) === operation) partyQueues.delete(party.id); }
}

function installPartyStashTransfer() {
  const prototype = globalThis.pf1?.applications?.actor?.ActorSheetPF?.prototype;
  if (!prototype || typeof prototype._onItemGive !== "function" || prototype[GIVE_PATCH]) return;
  const original = prototype._onItemGive;
  prototype._onItemGive = async function(event) {
    const api = partyIntegration();
    if (!api) return original.call(this, event);
    event.preventDefault();
    const actor = this.document;
    const item = actor.items.get(event.currentTarget.closest(".item")?.dataset.itemId);
    if (!item || !actor.testUserPermission(game.user, "OWNER")) return;
    const key = item.uuid;
    if (pendingItems.has(key)) return;
    pendingItems.add(key);
    try {
      const parties = api.getPartyActors().filter(party => party !== actor && party.testUserPermission(game.user, "OWNER"));
      const targets = parties.map(party => ({
        kind: "stash", document: party,
        name: `${game.i18n.lang === "ru" ? "Тайник партии" : "Party stash"}${parties.length > 1 ? ` — ${party.name}` : ""}`
      }));
      const ordinaryActors = game.actors.contents.filter(target => target !== actor && !isParty(target));
      targets.push(...ordinaryActors.filter(target => target.testUserPermission(game.user, "OWNER"))
        .map(document => ({ kind: "actor", document })));
      targets.push(...actor.items.filter(target => target.type === "container" && target !== item)
        .map(document => ({ kind: "item", document })));
      targets.push(...game.items.contents.filter(target => target.type === "container" && target.testUserPermission(game.user, "OWNER"))
        .map(document => ({ kind: "item", document })));
      const gmActive = game.users.contents.some(user => user.active && user.isGM);
      targets.push(...ordinaryActors.filter(target => target.hasPlayerOwner && !target.testUserPermission(game.user, "OWNER"))
        .map(document => ({ kind: "actor", document, disabled: !gmActive })));
      const entry = await chooseGiveTarget(targets);
      if (!entry || actor.items.get(item.id) !== item) return;
      const target = entry.document;
      if (entry.kind === "stash") return await transferToParty(api, target, item, actor);
      if (entry.kind === "actor" && !target.testUserPermission(game.user, "OWNER")) {
        game.socket.emit("system.pf1", { eventType: "giveItem", targetActor: target.uuid, item: item.uuid });
        return;
      }
      if (entry.kind === "actor") await target.createEmbeddedDocuments("Item", [item.toObject()]);
      else await target.createContainerContent(item.toObject());
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
    } catch (error) {
      console.error("pf1e-ru-improvements | Item transfer failed", error);
      ui.notifications.error("Не удалось передать предмет. Подробности записаны в консоль Foundry.");
    } finally { pendingItems.delete(key); }
  };
  prototype[GIVE_PATCH] = true;
}

Hooks.once("ready", installPartyStashTransfer);

const MODULE_ID = "pf1e-ru-improvements";
const PARTY_FOLDER_ID = "pf1e-party-folder";
const UNKNOWN_ICON_FLAG = "unidentifiedIcon";
const UNKNOWN_ICON_SETTING = "replaceUnidentifiedItemIcons";
const UNKNOWN_ICON_MIGRATION_SETTING = "unidentifiedIconMigration";
const UNKNOWN_ICON_MIGRATION_VERSION = 2;
const HIDE_IDENTIFY_DC_SETTING = "hideIdentifyDCFromPlayers";
const CURSE_FLAG = "curse";
const CURSE_SOUND_SETTING = "curseRevealSound";
const CURSE_SOUND_VOLUME_SETTING = "curseRevealSoundVolume";
const SOCKET_NAME = `module.${MODULE_ID}`;
const SOCKET_ACTION_CURSE_FAILURE = "createCurseFailureWhisper";
const ACTOR_TYPES = new Set(["character", "npc"]);
const IDENTIFIABLE_ITEM_TYPES = new Set(["consumable", "container", "equipment", "loot", "spell", "weapon"]);
const UNKNOWN_ICON_ROOT = `modules/${MODULE_ID}/assets/unidentified`;
const UNKNOWN_ICONS = Object.freeze({
  alchemical: `${UNKNOWN_ICON_ROOT}/unknown-alchemical-satchel.webp`,
  alchemyTool: `${UNKNOWN_ICON_ROOT}/unknown-alchemy-tool.webp`,
  ammunition: `${UNKNOWN_ICON_ROOT}/unknown-ammunition.webp`,
  animalPart: `${UNKNOWN_ICON_ROOT}/unknown-animal-part.webp`,
  armor: `${UNKNOWN_ICON_ROOT}/unknown-armor.webp`,
  book: `${UNKNOWN_ICON_ROOT}/unknown-book.webp`,
  clothing: `${UNKNOWN_ICON_ROOT}/unknown-clothing.webp`,
  consumable: `${UNKNOWN_ICON_ROOT}/unknown-consumable.webp`,
  container: `${UNKNOWN_ICON_ROOT}/unknown-container.webp`,
  food: `${UNKNOWN_ICON_ROOT}/unknown-food.webp`,
  gemstone: `${UNKNOWN_ICON_ROOT}/unknown-gemstone.webp`,
  holySymbol: `${UNKNOWN_ICON_ROOT}/unknown-holy-symbol.webp`,
  loot: `${UNKNOWN_ICON_ROOT}/unknown-loot.webp`,
  material: `${UNKNOWN_ICON_ROOT}/unknown-material.webp`,
  oil: `${UNKNOWN_ICON_ROOT}/unknown-oil-flask.webp`,
  potion: `${UNKNOWN_ICON_ROOT}/unknown-potion-round.webp`,
  ring: `${UNKNOWN_ICON_ROOT}/unknown-ring.webp`,
  scroll: `${UNKNOWN_ICON_ROOT}/unknown-scroll.webp`,
  shield: `${UNKNOWN_ICON_ROOT}/unknown-shield.webp`,
  wand: `${UNKNOWN_ICON_ROOT}/unknown-wand.webp`,
  weaponBludgeoning: `${UNKNOWN_ICON_ROOT}/unknown-weapon-bludgeoning.webp`,
  weaponMelee: `${UNKNOWN_ICON_ROOT}/unknown-weapon-melee.webp`,
  wondrousDevice: `${UNKNOWN_ICON_ROOT}/unknown-wondrous-device.webp`,
  writingSupply: `${UNKNOWN_ICON_ROOT}/unknown-writing-supply.webp`
});

let lastFastHealingTurnKey = "";

function gprop(object, path) {
  return foundry.utils.getProperty(object, path);
}

function sprop(object, path, value) {
  return foundry.utils.setProperty(object, path, value);
}

function has(object, path) {
  return foundry.utils.hasProperty(object, path);
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    if (value.total !== undefined) return toNumber(value.total, fallback);
    if (value.value !== undefined) return toNumber(value.value, fallback);
    if (value.base !== undefined) return toNumber(value.base, fallback);
  }
  const parsed = Number.parseFloat(String(value).replace(/,/g, ".").replace(/[^0-9.+\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function signed(value) {
  const number = toNumber(value, 0);
  return `${number >= 0 ? "+" : ""}${number}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSupportedActor(actor) {
  return Boolean(actor && ACTOR_TYPES.has(actor.type));
}

function isPartyActor(actor) {
  return Boolean(actor?.getFlag?.(PARTY_FOLDER_ID, "isParty"));
}

function canManageActor(actor) {
  return Boolean(actor && (game.user.isGM
    || actor.isOwner
    || actor.testUserPermission?.(game.user, "OWNER")
    || actor.testUserPermission?.(game.user, 3)));
}

function isActorItem(item) {
  return Boolean(item?.parent?.documentName === "Actor" && isSupportedActor(item.parent));
}

function isIdentifiableItem(item) {
  return Boolean(item && IDENTIFIABLE_ITEM_TYPES.has(String(item.type ?? "").toLowerCase()));
}

function isItemIdentified(item) {
  return gprop(item, "system.identified") !== false;
}

function shouldHideIdentifyDC() {
  return !game.user.isGM && game.settings.get(MODULE_ID, HIDE_IDENTIFY_DC_SETTING) !== false;
}

function getCurseData(item) {
  const source = item?.getFlag?.(MODULE_ID, CURSE_FLAG)
    ?? gprop(item, `flags.${MODULE_ID}.${CURSE_FLAG}`)
    ?? {};
  return {
    cursed: source.cursed === true,
    identified: source.identified === true,
    description: String(source.description ?? "")
  };
}

function collectClassificationText(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (["string", "number", "boolean"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => collectClassificationText(entry, depth + 1));
  if (typeof value === "object") return Object.values(value).flatMap((entry) => collectClassificationText(entry, depth + 1));
  return [];
}

function itemClassificationText(source) {
  const system = source?.system ?? {};
  return collectClassificationText([
    source?.type,
    source?.name,
    system.subType,
    system.weaponType,
    system.weaponSubtype,
    system.equipmentType,
    system.equipmentSubtype,
    system.slot,
    system.baseTypes,
    system.weaponGroups,
    system.ammoType,
    system.tags
  ]).join(" ").toLocaleLowerCase("ru").replace(/ё/g, "е");
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function getUnknownIconCategory(source) {
  const type = String(source?.type ?? "").toLowerCase();
  const text = itemClassificationText(source);

  if (type === "consumable") {
    if (includesAny(text, ["scroll", "свиток"])) return "scroll";
    if (includesAny(text, ["wand", "жезл", "палочк"])) return "wand";
    if (includesAny(text, ["oil", "масло"])) return "oil";
    if (includesAny(text, ["potion", "зелье", "эликсир"])) return "potion";
    if (includesAny(text, ["poison", "acid", "alchem", "яд", "кислот", "алхим"])) return "alchemical";
    if (includesAny(text, ["food", "drink", "еда", "пища", "напиток"])) return "food";
    return "consumable";
  }

  if (type === "weapon") {
    if (includesAny(text, ["ammo", "ammunition", "arrow", "bolt", "bullet", "dart", "боеприпас", "стрел", "болт", "пуля", "дротик"])) return "ammunition";
    if (includesAny(text, ["bludgeon", "hammer", "mace", "club", "flail", "дроб", "молот", "булав", "кистен", "дубин"])) return "weaponBludgeoning";
    return "weaponMelee";
  }

  if (type === "equipment") {
    if (includesAny(text, ["shield", "щит"])) return "shield";
    if (includesAny(text, ["ring", "кольц"])) return "ring";
    if (includesAny(text, ["holy", "divine", "focus", "свящ", "сакраль", "символ веры"])) return "holySymbol";
    if (includesAny(text, ["clothing", "robe", "mask", "cloak", "одеж", "роб", "маск", "плащ"])) return "clothing";
    if (includesAny(text, ["armor", "брон", "доспех"])) return "armor";
    return "wondrousDevice";
  }

  if (type === "container") return "container";
  if (type === "spell") return "book";

  if (type === "loot") {
    if (includesAny(text, ["gem", "jewel", "crystal", "камн", "самоцвет", "кристалл"])) return "gemstone";
    if (includesAny(text, ["animal", "bone", "hide", "кост", "шкур", "часть тела", "трофе"])) return "animalPart";
    if (includesAny(text, ["food", "drink", "ration", "еда", "пища", "напиток", "паек", "паёк"])) return "food";
    if (includesAny(text, ["book", "tome", "книг", "том"])) return "book";
    if (includesAny(text, ["ink", "quill", "paper", "чернил", "перо", "бумаг"])) return "writingSupply";
    if (includesAny(text, ["ore", "ingot", "metal", "material", "сырье", "сырье", "слиток", "металл", "материал"])) return "material";
    if (includesAny(text, ["alchem", "lab", "алхим", "лаборатор"])) return "alchemyTool";
    return "loot";
  }

  return "wondrousDevice";
}

function getUnknownIcon(source) {
  const category = getUnknownIconCategory(source);
  return { category, img: UNKNOWN_ICONS[category] ?? UNKNOWN_ICONS.loot };
}

function isModuleUnknownIcon(path) {
  return String(path ?? "").startsWith(`${UNKNOWN_ICON_ROOT}/`);
}

function storedUnknownIconData(item) {
  return item?.getFlag?.(MODULE_ID, UNKNOWN_ICON_FLAG)
    ?? gprop(item, `flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}`)
    ?? null;
}

function areUnknownItemIconsEnabled() {
  return game.settings.get(MODULE_ID, UNKNOWN_ICON_SETTING) !== false;
}

function nextItemSource(item, changed = {}) {
  const source = item.toObject ? item.toObject() : foundry.utils.deepClone(item);
  const expanded = foundry.utils.expandObject(foundry.utils.deepClone(changed));
  return foundry.utils.mergeObject(source, expanded, { inplace: false, overwrite: true });
}

function applyUnknownIconToPreUpdate(item, changed, options = {}) {
  if (options?.[MODULE_ID]?.syncUnidentifiedIcon || !isActorItem(item) || !isIdentifiableItem(item)) return;
  const source = nextItemSource(item, changed);
  const identified = gprop(source, "system.identified") !== false;
  const stored = storedUnknownIconData(item);

  if (identified) {
    if (!stored) return;
    if (stored.originalImg) changed.img = stored.originalImg;
    sprop(changed, `flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`, null);
    return;
  }

  if (isItemIdentified(item)) sprop(changed, `flags.${MODULE_ID}.${CURSE_FLAG}.identified`, false);

  if (!areUnknownItemIconsEnabled()) {
    if (!stored) return;
    const incomingImg = has(changed, "img") ? changed.img : item.img;
    if (isModuleUnknownIcon(incomingImg)) changed.img = stored.originalImg || "icons/svg/item-bag.svg";
    sprop(changed, `flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`, null);
    return;
  }

  const { category, img } = getUnknownIcon(source);
  const incomingImg = has(changed, "img") ? changed.img : item.img;
  const originalImg = !isModuleUnknownIcon(incomingImg)
    ? incomingImg
    : stored?.originalImg ?? item.img;
  changed.img = img;
  sprop(changed, `flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}`, {
    originalImg: isModuleUnknownIcon(originalImg) ? stored?.originalImg ?? "icons/svg/item-bag.svg" : originalImg,
    category
  });
}

function applyUnknownIconToPreCreate(item, data) {
  if (!areUnknownItemIconsEnabled()
    || !isActorItem(item)
    || !isIdentifiableItem(item)
    || gprop(data, "system.identified") !== false) return;
  const { category, img } = getUnknownIcon(data);
  const originalImg = isModuleUnknownIcon(data.img) ? "icons/svg/item-bag.svg" : data.img || "icons/svg/item-bag.svg";
  item.updateSource(foundry.utils.expandObject({
    img,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.originalImg`]: originalImg,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.category`]: category
  }));
}

async function synchronizeCreatedUnknownItem(item, options = {}, userId = null) {
  if (options?.[MODULE_ID]?.syncUnidentifiedIcon
    || !areUnknownItemIconsEnabled()
    || userId !== game.user.id
    || !isActorItem(item)
    || !isIdentifiableItem(item)
    || isItemIdentified(item)
    || storedUnknownIconData(item)) return;
  const { category, img } = getUnknownIcon(item);
  const originalImg = isModuleUnknownIcon(item.img) ? "icons/svg/item-bag.svg" : item.img || "icons/svg/item-bag.svg";
  await item.update({
    img,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.originalImg`]: originalImg,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.category`]: category
  }, { diff: true, [MODULE_ID]: { syncUnidentifiedIcon: true } });
}

async function synchronizeUpdatedUnknownItem(item, options = {}, userId = null) {
  if (options?.[MODULE_ID]?.syncUnidentifiedIcon
    || userId !== game.user.id
    || !isActorItem(item)
    || !isIdentifiableItem(item)) return;
  const stored = storedUnknownIconData(item);
  if (isItemIdentified(item)) {
    if (!stored) return;
    await item.update({
      img: stored.originalImg || "icons/svg/item-bag.svg",
      [`flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`]: null
    }, { diff: true, [MODULE_ID]: { syncUnidentifiedIcon: true } });
    return;
  }
  if (!areUnknownItemIconsEnabled()) {
    if (!stored) return;
    await item.update({
      img: isModuleUnknownIcon(item.img) ? stored.originalImg || "icons/svg/item-bag.svg" : item.img,
      [`flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`]: null
    }, { diff: true, [MODULE_ID]: { syncUnidentifiedIcon: true } });
    return;
  }
  const { category, img } = getUnknownIcon(item);
  const originalImg = stored?.originalImg
    ?? (isModuleUnknownIcon(item.img) ? "icons/svg/item-bag.svg" : item.img || "icons/svg/item-bag.svg");
  if (item.img === img && stored?.originalImg && stored.category === category) return;
  await item.update({
    img,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.originalImg`]: originalImg,
    [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.category`]: category
  }, { diff: true, [MODULE_ID]: { syncUnidentifiedIcon: true } });
}

async function synchronizeExistingUnknownItemIcons(enabled = areUnknownItemIconsEnabled()) {
  if (!game.user.isGM) return 0;
  let changed = 0;
  for (const actor of game.actors ?? []) {
    if (!isSupportedActor(actor)) continue;
    const updates = [];
    for (const item of actor.items ?? []) {
      if (!isIdentifiableItem(item)) continue;
      const stored = storedUnknownIconData(item);
      if (isItemIdentified(item) || !enabled) {
        if (!stored) continue;
        updates.push({
          _id: item.id,
          img: isModuleUnknownIcon(item.img) ? stored.originalImg || "icons/svg/item-bag.svg" : item.img,
          [`flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`]: null
        });
        continue;
      }
      const { category, img } = getUnknownIcon(item);
      const originalImg = stored?.originalImg
        ?? (isModuleUnknownIcon(item.img) ? "icons/svg/item-bag.svg" : item.img || "icons/svg/item-bag.svg");
      if (item.img === img && stored?.originalImg && stored.category === category) continue;
      updates.push({
        _id: item.id,
        img,
        [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.originalImg`]: originalImg,
        [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.category`]: category
      });
    }
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates, {
      diff: true,
      [MODULE_ID]: { syncUnidentifiedIcon: true }
    });
    changed += updates.length;
  }
  return changed;
}

async function migrateExistingUnknownItemIcons() {
  if (!game.user.isGM) return 0;
  if (!areUnknownItemIconsEnabled()) return synchronizeExistingUnknownItemIcons(false);
  const current = Number(game.settings.get(MODULE_ID, UNKNOWN_ICON_MIGRATION_SETTING) ?? 0);
  if (current >= UNKNOWN_ICON_MIGRATION_VERSION) return 0;
  let changed = 0;
  for (const actor of game.actors ?? []) {
    if (!isSupportedActor(actor)) continue;
    const updates = [];
    for (const item of actor.items ?? []) {
      if (!isIdentifiableItem(item)) continue;
      const stored = storedUnknownIconData(item);
      if (isItemIdentified(item)) {
        if (!stored) continue;
        updates.push({
          _id: item.id,
          img: stored.originalImg || "icons/svg/item-bag.svg",
          [`flags.${MODULE_ID}.-=${UNKNOWN_ICON_FLAG}`]: null
        });
        continue;
      }
      const { category, img } = getUnknownIcon(item);
      const originalImg = stored?.originalImg
        ?? (isModuleUnknownIcon(item.img) ? "icons/svg/item-bag.svg" : item.img || "icons/svg/item-bag.svg");
      if (item.img === img && stored?.originalImg) continue;
      updates.push({
        _id: item.id,
        img,
        [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.originalImg`]: originalImg,
        [`flags.${MODULE_ID}.${UNKNOWN_ICON_FLAG}.category`]: category
      });
    }
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates, {
      diff: true,
      [MODULE_ID]: { syncUnidentifiedIcon: true }
    });
    changed += updates.length;
  }
  await game.settings.set(MODULE_ID, UNKNOWN_ICON_MIGRATION_SETTING, UNKNOWN_ICON_MIGRATION_VERSION);
  return changed;
}

function configLabel(collection, key, fallback = "") {
  if (!key) return fallback;
  const value = collection?.[key];
  if (typeof value === "string") return game.i18n.localize(value);
  return value?.label ? game.i18n.localize(value.label) : fallback || String(key);
}

function getItemAuraData(item) {
  const system = item?.system ?? {};
  const curse = getCurseData(item);
  const casterLevel = Math.max(0, toNumber(system.cl, 0));
  const schoolKey = String(system.aura?.school ?? "").trim();
  const rawDC = system.identifyDC ?? system.identificationDC ?? system.aura?.identifyDC;
  const hasExplicitDC = rawDC !== undefined && rawDC !== null && rawDC !== "" && toNumber(rawDC, 0) > 0;
  const magical = Boolean(schoolKey || casterLevel > 0 || hasExplicitDC || curse.cursed);
  const strengthKey = casterLevel > 20 ? "overwhelming" : casterLevel > 11 ? "strong" : casterLevel > 5 ? "moderate" : "faint";
  const strengthFallback = { faint: "слабая", moderate: "средняя", strong: "сильная", overwhelming: "подавляющая" }[strengthKey];
  const strength = configLabel(CONFIG.PF1?.auraStrengths, strengthKey, strengthFallback);
  const school = configLabel(CONFIG.PF1?.spellSchools, schoolKey, schoolKey);
  const identifyDC = magical ? (hasExplicitDC ? Math.max(0, toNumber(rawDC, 0)) : 15 + casterLevel) : "—";
  return {
    magical,
    aura: magical ? `${strength}${school ? `, ${school}` : ""}` : "—",
    casterLevel: magical ? casterLevel : "—",
    identifyDC,
    cursed: curse.cursed,
    curseIdentified: curse.identified,
    curseIdentifyDC: curse.cursed ? toNumber(identifyDC, 0) + 10 : "—"
  };
}

function identificationEntry(item) {
  const identified = isItemIdentified(item);
  const unidentifiedName = String(gprop(item, "system.unidentified.name") ?? "").trim();
  return {
    id: item.id,
    name: !identified && !game.user.isGM
      ? unidentifiedName || "Неопознанный предмет"
      : item.name || "Предмет",
    img: item.img || "icons/svg/item-bag.svg",
    identified,
    ...getItemAuraData(item)
  };
}

function buildActorIdentificationData(actor) {
  const identified = [];
  const unidentified = [];
  for (const item of actor.items ?? []) {
    if (!isIdentifiableItem(item)) continue;
    const entry = identificationEntry(item);
    if (!entry.magical) continue;
    (entry.identified ? identified : unidentified).push(entry);
  }
  const sort = (left, right) => left.name.localeCompare(right.name, game.i18n.lang);
  identified.sort(sort);
  unidentified.sort(sort);
  return { identified, unidentified };
}

function getSpellcraftBonus(actor) {
  const skill = actor?.system?.skills?.spl;
  let bonus = skill?.mod ?? skill?.total;
  if (bonus === undefined) {
    try {
      const info = actor?.getSkillInfo?.("spl");
      bonus = info?.mod ?? info?.total;
    } catch (_error) {
      bonus = 0;
    }
  }
  return toNumber(bonus, 0);
}

function getRollFromChatResult(result) {
  if (!result) return null;
  if (result instanceof Roll) return result;
  const rolls = Array.isArray(result.rolls) ? result.rolls : [];
  return rolls[0] ?? result.roll ?? result._roll ?? null;
}

function getChatMessageFromRollResult(result) {
  if (!result) return null;
  if (result.documentName === "ChatMessage" || result.constructor?.documentName === "ChatMessage") return result;
  if (result.id && game.messages?.get(result.id)) return game.messages.get(result.id);
  return null;
}

async function performNativeSpellcraftCheck(actor, { skipDialog = false, rollMode = null } = {}) {
  if (!actor || typeof actor.rollSkill !== "function") return null;
  const options = { event: null, skipDialog };
  if (rollMode) options.rollMode = rollMode;
  const result = await actor.rollSkill("spl", options);
  if (!result) return null;
  const message = getChatMessageFromRollResult(result);
  const roll = getRollFromChatResult(result) ?? getRollFromChatResult(message);
  return { message, roll, total: toNumber(roll?.total, Number.NaN) };
}

function dialogPromise({ title, content, buttons, defaultButton = "ok" }) {
  return new Promise((resolve) => {
    const wrappedButtons = {};
    for (const [id, button] of Object.entries(buttons)) {
      wrappedButtons[id] = {
        ...button,
        callback: (html) => resolve(button.callback ? button.callback(html) : true)
      };
    }
    new Dialog({
      title,
      content,
      buttons: wrappedButtons,
      default: defaultButton,
      close: () => resolve(null)
    }).render(true);
  });
}

function getGameMasters() {
  return game.users.filter((user) => Number(user.role) === CONST.USER_ROLES.GAMEMASTER);
}

function getActiveGMDispatcher() {
  const activeGM = game.users.activeGM;
  if (activeGM) return activeGM;
  return getGameMasters()
    .filter((user) => user.active)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

async function createFailedCurseIdentificationWhisper(payload) {
  const actor = await fromUuid(payload?.actorUuid).catch(() => null);
  const item = actor?.items?.get(payload?.itemId);
  if (!actor || !item) return;
  if (!game.user.isGM) return;
  const recipients = getGameMasters().map((user) => user.id);
  if (!recipients.length) return;
  await ChatMessage.create({
    user: game.user.id,
    speaker: { alias: "Опознание предметов" },
    whisper: recipients,
    blind: true,
    content: `<section class="pf1e-ru-curse-whisper">
      <h4><i class="fas fa-user-secret"></i> Неопознанное проклятие</h4>
      <p><b>${escapeHTML(actor.name)}</b> опознал предмет <b>${escapeHTML(item.name)}</b>, но не распознал его проклятие.</p>
      <p>Результат: <b>${toNumber(payload.rollTotal, 0)}</b>; СЛ проклятия: <b>${toNumber(payload.curseIdentifyDC, 0)}</b>.</p>
    </section>`,
    flags: {
      [MODULE_ID]: {
        curseIdentificationSecret: true,
        actorUuid: actor.uuid,
        itemUuid: item.uuid,
        curseIdentifyDC: toNumber(payload.curseIdentifyDC, 0),
        rollTotal: toNumber(payload.rollTotal, 0)
      }
    }
  });
}

async function whisperFailedCurseIdentification(actor, item, roll, curseIdentifyDC) {
  const dispatcher = getActiveGMDispatcher();
  if (!dispatcher) {
    console.warn(`${MODULE_ID} | Не удалось отправить скрытое сообщение: игровой мастер не подключён.`);
    return;
  }
  const request = {
    action: SOCKET_ACTION_CURSE_FAILURE,
    requestingUserId: game.user.id,
    payload: {
      actorUuid: actor.uuid,
      itemId: item.id,
      curseIdentifyDC,
      rollTotal: toNumber(roll.total, 0)
    }
  };
  if (dispatcher.id === game.user.id) return createFailedCurseIdentificationWhisper(request.payload);
  game.socket.emit(SOCKET_NAME, request);
}

function playCurseRevealSound() {
  if (!game.settings.get(MODULE_ID, CURSE_SOUND_SETTING)) return;
  const volume = Math.max(0, Math.min(1, toNumber(game.settings.get(MODULE_ID, CURSE_SOUND_VOLUME_SETTING), 0.3)));
  if (!volume) return;
  const source = `modules/${MODULE_ID}/assets/audio/curse-reveal.mp3`;
  try {
    // Штатная push-рассылка Foundry воспроизводит один и тот же звук на всех
    // подключённых клиентах и не требует установленного обработчика сокета модуля.
    const playback = AudioHelper.play({ src: source, volume, autoplay: true, loop: false }, true);
    if (playback?.catch) playback.catch((error) => {
      console.warn(`${MODULE_ID} | Не удалось воспроизвести звук раскрытого проклятия.`, error);
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Не удалось воспроизвести звук раскрытого проклятия.`, error);
  }
}

async function handleModuleSocket(request) {
  if (!request || request.requestingUserId === game.user.id) return;
  if (request.action !== SOCKET_ACTION_CURSE_FAILURE) return;
  const dispatcher = getActiveGMDispatcher();
  if (!dispatcher || dispatcher.id !== game.user.id) return;
  const requestingUser = game.users.get(request.requestingUserId);
  const actor = await fromUuid(request.payload?.actorUuid).catch(() => null);
  const canRequest = requestingUser && actor && (requestingUser.isGM
    || actor.testUserPermission?.(requestingUser, "OWNER"));
  if (!canRequest) return;
  await createFailedCurseIdentificationWhisper(request.payload);
}

class PF1ERUActorIdentificationApp extends Application {
  constructor(actor, options = {}) {
    super({ ...options, id: `pf1e-ru-identification-${actor.id}` });
    this.actor = actor;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Опознание предметов",
      template: `modules/${MODULE_ID}/templates/actor-identification.hbs`,
      classes: ["pf1e", "pf1e-ru-actor-identification"],
      width: 760,
      height: 620,
      resizable: true
    }, { inplace: false });
  }

  async getData(options = {}) {
    const data = await super.getData(options);
    const tables = buildActorIdentificationData(this.actor);
    return foundry.utils.mergeObject(data, {
      actor: { id: this.actor.id, name: this.actor.name, img: this.actor.img },
      spellcraftBonus: signed(getSpellcraftBonus(this.actor)),
      canRoll: canManageActor(this.actor) && tables.unidentified.length > 0,
      canToggle: game.user.isGM,
      showCurseDetails: game.user.isGM,
      showIdentifyDC: !shouldHideIdentifyDC(),
      ...tables
    }, { inplace: false });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='roll-identification']").on("click", (event) => this._rollIdentification(event));
    html.find("[data-action='toggle-identification']").on("click", (event) => this._toggleIdentification(event));
    html.find("[data-action='open-item']").on("click", (event) => this._openItem(event));
  }

  _openItem(event) {
    event.preventDefault();
    this.actor.items.get(event.currentTarget.dataset.itemId)?.sheet?.render(true);
  }

  async _toggleIdentification(event) {
    event.preventDefault();
    if (!game.user.isGM) return ui.notifications.warn("Изменять состояние опознания вручную может только игровой мастер.");
    const item = this.actor.items.get(event.currentTarget.dataset.itemId);
    if (!item) return;
    const identified = !isItemIdentified(item);
    const update = { "system.identified": identified };
    if (!identified) update[`flags.${MODULE_ID}.${CURSE_FLAG}.identified`] = false;
    await item.update(update, { diff: true });
    this.render(false);
  }

  async _rollIdentification(event) {
    event.preventDefault();
    if (!canManageActor(this.actor)) return ui.notifications.warn("Недостаточно прав для проверки Колдовства этого персонажа.");
    const tables = buildActorIdentificationData(this.actor);
    if (!tables.unidentified.length) return ui.notifications.info("В инвентаре нет неопознанных магических предметов.");

    const mode = await dialogPromise({
      title: `Опознание: ${this.actor.name}`,
      content: "<form class='pf1e-ru-tool-dialog'><p>Какие неопознанные предметы включить в проверку?</p></form>",
      buttons: {
        all: { label: "Опознать всё", callback: () => "all" },
        selective: { label: "Выборочно", callback: () => "selective" },
        cancel: { label: "Отмена", callback: () => null }
      },
      defaultButton: "all"
    });
    if (!mode) return;

    let targets = tables.unidentified;
    if (mode === "selective") {
      const choices = tables.unidentified.map((entry) => `
        <label class="pf1e-ru-identification-choice">
          <input type="checkbox" name="entry" value="${entry.id}" checked>
          <img src="${escapeHTML(entry.img)}" alt="">
          <span>${escapeHTML(entry.name)}</span>
        </label>`).join("");
      const selected = await dialogPromise({
        title: "Выборочное опознание",
        content: `<form class="pf1e-ru-tool-dialog"><p>Снимите отметки с предметов, которые нужно исключить.</p><div class="pf1e-ru-identification-choice-list">${choices}</div></form>`,
        buttons: {
          ok: { label: "Подтвердить", callback: (html) => [...new FormData(html.find("form")[0]).getAll("entry")].map(String) },
          cancel: { label: "Отмена", callback: () => null }
        }
      });
      if (!selected) return;
      const selectedIds = new Set(selected);
      targets = tables.unidentified.filter((entry) => selectedIds.has(entry.id));
      if (!targets.length) return ui.notifications.warn("Для опознания не выбран ни один предмет.");
    }

    const rollMode = game.settings.get("core", "rollMode") || "publicroll";
    let successes = 0;
    for (const entry of targets) {
      const item = this.actor.items.get(entry.id);
      if (!item || isItemIdentified(item)) continue;
      const nativeResult = await performNativeSpellcraftCheck(this.actor, { skipDialog: false, rollMode });
      if (!nativeResult?.roll || !Number.isFinite(nativeResult.total)) {
        ui.notifications.warn(`PF1 не смог выполнить проверку Колдовства для «${entry.name}».`);
        continue;
      }
      const roll = nativeResult.roll;
      const success = nativeResult.total >= toNumber(entry.identifyDC, Number.POSITIVE_INFINITY);
      const curseSuccess = success && entry.cursed
        && nativeResult.total >= toNumber(entry.curseIdentifyDC, Number.POSITIVE_INFINITY);
      const resultName = success ? item.name || entry.name : entry.name;
      const flavor = `<section class="pf1e-ru-identification-chat-result ${success ? "success" : "failure"}">
          <h4>Опознание: ${escapeHTML(resultName)}</h4>
          <p>СЛ опознания: <b>${entry.identifyDC}</b></p>
          <p><i class="fas ${success ? "fa-check" : "fa-times"}"></i> <b>${success ? "Успех" : "Провал"}</b></p>
          ${curseSuccess ? '<p class="pf1e-ru-curse-revealed"><i class="fas fa-skull"></i> <b>Предмет проклят!</b></p>' : ""}
        </section>`;
      const identificationFlags = {
        identificationResult: true,
        actorUuid: this.actor.uuid,
        itemId: item.id,
        identifyDC: entry.identifyDC,
        curseIdentifyDC: entry.cursed ? entry.curseIdentifyDC : null,
        success,
        curseSuccess
      };
      if (nativeResult.message) {
        await nativeResult.message.update({
          flavor,
          [`flags.${MODULE_ID}`]: identificationFlags
        });
      } else {
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          flavor,
          rollMode,
          flags: {
            pf1: { metadata: { rolls: {} } },
            [MODULE_ID]: identificationFlags
          }
        });
      }
      if (!success) continue;
      const update = { "system.identified": true };
      if (curseSuccess) update[`flags.${MODULE_ID}.${CURSE_FLAG}.identified`] = true;
      await item.update(update, { diff: true });
      if (entry.cursed && !curseSuccess) await whisperFailedCurseIdentification(this.actor, item, roll, entry.curseIdentifyDC);
      if (curseSuccess) playCurseRevealSound();
      successes += 1;
    }
    if (successes) ui.notifications.info(`Опознано предметов: ${successes}.`);
    this.render(false);
  }
}

function getItemFromSheet(sheet) {
  const item = sheet?.item ?? sheet?.object ?? sheet?.document;
  return item?.documentName === "Item" ? item : null;
}

function insertAfterAuraSection(root, element) {
  const auraHeader = [...root.querySelectorAll("h3.form-header")]
    .find((header) => ["аура", "aura"].includes(header.textContent.trim().toLocaleLowerCase("ru")));
  if (!auraHeader) return false;
  let anchor = auraHeader;
  while (anchor.nextElementSibling && !anchor.nextElementSibling.matches("h3.form-header")) anchor = anchor.nextElementSibling;
  anchor.after(element);
  return true;
}

function findAuraIdentifyDCGroup(root) {
  const auraHeader = [...root.querySelectorAll("h3.form-header")]
    .find((header) => ["аура", "aura"].includes(header.textContent.trim().toLocaleLowerCase("ru")));
  if (!auraHeader) return null;
  let current = auraHeader.nextElementSibling;
  while (current && !current.matches("h3.form-header")) {
    const text = current.textContent.trim().toLocaleLowerCase("ru");
    if (current.matches(".form-group") && (text.includes("сл опознания") || text.includes("identify dc"))) return current;
    current = current.nextElementSibling;
  }
  return null;
}

function applyIdentifyDCVisibility(root) {
  const group = findAuraIdentifyDCGroup(root);
  if (!group) return;
  group.classList.toggle("pf1e-ru-player-identify-dc-hidden", shouldHideIdentifyDC());
}

function injectCurseIdentifyDC(root, item) {
  const group = findAuraIdentifyDCGroup(root);
  if (!group || group.querySelector(".pf1e-ru-curse-dc")) return group;
  const curse = getCurseData(item);
  const aura = getItemAuraData(item);
  group.classList.add("pf1e-ru-curse-identify-dc-row");
  const label = document.createElement("label");
  label.className = `pf1e-ru-curse-dc ${curse.cursed ? "" : "is-hidden"}`;
  label.textContent = `СЛ Опознания проклятия ${aura.curseIdentifyDC}`;
  group.append(label);
  return group;
}

function buildCurseAuraControls(item) {
  const curse = getCurseData(item);
  const wrapper = document.createElement("div");
  wrapper.className = "pf1e-ru-curse-aura-controls";
  wrapper.innerHTML = `<div class="form-group">
    <label class="checkbox pf1e-ru-curse-checkbox">
      <input type="checkbox" class="pf1e-ru-curse-toggle" ${curse.cursed ? "checked" : ""}><span>Проклято</span>
    </label>
  </div>`;
  wrapper.querySelector(".pf1e-ru-curse-toggle")?.addEventListener("change", async (event) => {
    event.stopPropagation();
    const cursed = event.currentTarget.checked;
    await item.update({
      [`flags.${MODULE_ID}.${CURSE_FLAG}.cursed`]: cursed,
      ...(!cursed ? { [`flags.${MODULE_ID}.${CURSE_FLAG}.identified`]: false } : {})
    }, { diff: true });
  });
  return wrapper;
}

function rememberItemSheetScroll(sheet, root) {
  if (!sheet || !root?.querySelectorAll) return;
  const positions = [...root.querySelectorAll(".tab[data-tab]")]
    .filter((tab) => tab.scrollTop > 0 || tab.scrollLeft > 0)
    .map((tab) => ({
      group: tab.dataset.group ?? "",
      tab: tab.dataset.tab ?? "",
      top: tab.scrollTop,
      left: tab.scrollLeft
    }));
  if (positions.length) sheet._pf1eRuScrollPositions = positions;
}

function restoreItemSheetScroll(sheet, root) {
  const positions = sheet?._pf1eRuScrollPositions;
  if (!positions?.length || !root?.querySelectorAll) return;
  delete sheet._pf1eRuScrollPositions;
  requestAnimationFrame(() => {
    const tabs = [...root.querySelectorAll(".tab[data-tab]")];
    for (const position of positions) {
      const tab = tabs.find((entry) =>
        (entry.dataset.group ?? "") === position.group
        && (entry.dataset.tab ?? "") === position.tab);
      if (!tab) continue;
      tab.scrollTop = position.top;
      tab.scrollLeft = position.left;
    }
  });
}

function injectCurseIdentifiedCheckbox(sheet, root, item) {
  const curse = getCurseData(item);
  if (!curse.cursed) return;
  const identifiedInput = root.querySelector('input[name="system.identified"]');
  const originalLabel = identifiedInput?.closest("label");
  const container = identifiedInput?.closest(".form-group") ?? originalLabel?.parentElement;
  if (!container || container.querySelector(".pf1e-ru-curse-identified-toggle")) return;
  const label = originalLabel?.cloneNode(false) ?? document.createElement("label");
  label.removeAttribute("for");
  label.classList.add("checkbox", "pf1e-ru-curse-identified-label");
  label.innerHTML = `<input type="checkbox" class="pf1e-ru-curse-identified-toggle" ${curse.identified ? "checked" : ""}> Опознано с проклятием`;
  if (originalLabel) originalLabel.after(label);
  else container.append(label);
  label.querySelector("input")?.addEventListener("change", async (event) => {
    event.stopPropagation();
    const identified = event.currentTarget.checked;
    rememberItemSheetScroll(sheet, root);
    await item.update({
      [`flags.${MODULE_ID}.${CURSE_FLAG}.identified`]: identified,
      ...(identified ? { "system.identified": true } : {})
    }, { diff: true });
  });
}

function activateInjectedCurseTab(nav, body, link, cursePanel) {
  for (const item of nav.querySelectorAll("a.item")) item.classList.remove("active");
  for (const tab of body.querySelectorAll(':scope > .tab[data-group="description"]')) tab.classList.remove("active");
  link.classList.add("active");
  cursePanel.classList.add("active");
}

function createCurseRichEditor(sheet, item, enriched) {
  const target = `flags.${MODULE_ID}.${CURSE_FLAG}.description`;
  const editor = document.createElement("div");
  editor.className = "editor pf1e-ru-curse-editor";
  editor.innerHTML = `<a class="editor-edit"><i class="fas fa-edit"></i></a><div class="editor-content" data-edit="${target}" data-engine="prosemirror" data-collaborate="false">${enriched}</div>`;
  return editor;
}

async function injectCurseDescriptionTab(sheet, root, item) {
  const curse = getCurseData(item);
  if (!curse.cursed || (!game.user.isGM && (!curse.identified || !isItemIdentified(item)))) return;
  const primary = root.querySelector('.tab[data-group="primary"][data-tab="description"]');
  if (!primary || primary.querySelector(".pf1e-ru-curse-description")) return;
  const enriched = await TextEditor.enrichHTML(curse.description || "", {
    async: true,
    secrets: game.user.isGM,
    documents: true
  });

  const nativeNav = primary.querySelector('nav[data-group="description"]');
  const nativeBody = primary.querySelector(".description-body");
  if (nativeNav && nativeBody) {
    const link = document.createElement("a");
    link.className = "item pf1e-ru-curse-description-link";
    link.dataset.tab = "curse";
    link.textContent = "Проклято";
    nativeNav.append(link);
    const panel = document.createElement("div");
    panel.className = "tab description-group flexcol pf1e-ru-curse-description";
    panel.dataset.group = "description";
    panel.dataset.tab = "curse";
    let curseEditorContent = null;
    if (game.user.isGM) {
      const editor = createCurseRichEditor(sheet, item, enriched);
      curseEditorContent = editor.querySelector(".editor-content");
      panel.append(editor);
    } else panel.innerHTML = `<div class="pf1e-ru-curse-description-player">${enriched}</div>`;
    nativeBody.append(panel);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activateInjectedCurseTab(nativeNav, nativeBody, link, panel);
      const target = curseEditorContent?.dataset.edit;
      if (target && !sheet.editors?.[target] && typeof sheet?._activateEditor === "function") {
        sheet._activateEditor(curseEditorContent);
      }
    });
    for (const nativeLink of nativeNav.querySelectorAll("a.item:not(.pf1e-ru-curse-description-link)")) {
      nativeLink.addEventListener("click", () => panel.classList.remove("active"));
    }
    return;
  }

  const normal = primary.querySelector(":scope > .description-container") ?? primary.firstElementChild;
  if (!normal) return;
  const nav = document.createElement("nav");
  nav.className = "sheet-navigation tabs subtabs description pf1e-ru-player-curse-tabs";
  nav.innerHTML = '<a class="item active" data-ru-tab="identified">Опознано</a><a class="item" data-ru-tab="curse">Проклято</a>';
  primary.insertBefore(nav, normal);
  const panel = document.createElement("section");
  panel.className = "pf1e-ru-curse-description pf1e-ru-curse-description-player";
  panel.innerHTML = enriched;
  panel.hidden = true;
  primary.append(panel);
  nav.querySelector('[data-ru-tab="identified"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    normal.hidden = false;
    panel.hidden = true;
    nav.querySelectorAll("a.item").forEach((entry) => entry.classList.toggle("active", entry === event.currentTarget));
  });
  nav.querySelector('[data-ru-tab="curse"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    normal.hidden = true;
    panel.hidden = false;
    nav.querySelectorAll("a.item").forEach((entry) => entry.classList.toggle("active", entry === event.currentTarget));
  });
}

async function injectItemCurseControls(sheet, html) {
  const item = getItemFromSheet(sheet);
  if (!item || !isIdentifiableItem(item)) return;
  const root = html?.[0] ?? html ?? sheet?.element?.[0];
  if (!root?.querySelector) return;
  applyIdentifyDCVisibility(root);
  if (game.user.isGM && !root.querySelector(".pf1e-ru-curse-aura-controls")) {
    const identifyDCGroup = injectCurseIdentifyDC(root, item);
    const controls = buildCurseAuraControls(item);
    if (identifyDCGroup) identifyDCGroup.after(controls);
    else insertAfterAuraSection(root, controls);
    injectCurseIdentifiedCheckbox(sheet, root, item);
  }
  await injectCurseDescriptionTab(sheet, root, item);
}

function getActorFromSheet(sheet) {
  return sheet?.actor
    ?? (sheet?.object?.documentName === "Actor" ? sheet.object : null)
    ?? (sheet?.document?.documentName === "Actor" ? sheet.document : null);
}

function getFastHealingAmount(actor) {
  const raw = gprop(actor, "system.traits.fastHealing");
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Math.max(0, Math.floor(raw));
  try {
    const rollData = actor?.getRollData?.() ?? {};
    const total = globalThis.RollPF?.safeRoll
      ? RollPF.safeRoll(String(raw), rollData, null, { suppressError: true }).total
      : Roll.create(String(raw), rollData).evaluate({ async: false }).total;
    return Math.max(0, Math.floor(toNumber(total, 0)));
  } catch (_error) {
    return Math.max(0, Math.floor(toNumber(raw, 0)));
  }
}

function partyFolderHandlesFastHealing(actor) {
  if (!game.modules.get(PARTY_FOLDER_ID)?.active) return false;
  let folder = actor?.folder;
  while (folder) {
    if (folder.type === "Actor" && folder.getFlag?.(PARTY_FOLDER_ID, "isPartyFolder")) return true;
    folder = folder.folder ?? folder.parent ?? null;
  }
  return false;
}

function getFastHealingRecipients(actor) {
  return [...(game.users ?? [])]
    .filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER"))
    .map((user) => user.id);
}

async function postFastHealingCard(actor, { turnKey = null, automatic = false } = {}) {
  if (!actor || !canManageActor(actor)) return null;
  const amount = getFastHealingAmount(actor);
  if (!amount) return ui.notifications.info(`${actor.name}: быстрое лечение отсутствует.`);
  const key = turnKey || `manual:${foundry.utils.randomID()}`;
  const compatibilityRoll = await new Roll("0").roll({ async: true });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: getFastHealingRecipients(actor),
    content: `<section class="pf1e-ru-fast-healing-chat">
      <h3><i class="fas fa-heartbeat"></i> Быстрое лечение</h3>
      <p><b>${escapeHTML(actor.name)}</b> может восстановить <b>${amount} ПЗ</b>${automatic ? " в свой ход" : ""}.</p>
      <button type="button" data-action="apply-pf1e-ru-fast-healing" title="Применить быстрое лечение"><i class="fas fa-plus"></i> Восстановить ${amount} ПЗ</button>
    </section>`,
    rolls: [compatibilityRoll],
    flags: {
      pf1: { metadata: { rolls: {} } },
      [MODULE_ID]: {
        fastHealing: {
          actorUuid: actor.uuid,
          actorId: actor.id,
          amount,
          applied: false,
          cancelled: false,
          turnKey: key
        }
      }
    }
  });
}

async function resolveFastHealingActor(data) {
  if (data?.actorUuid) {
    try {
      const document = await fromUuid(data.actorUuid);
      if (document?.documentName === "Actor") return document;
    } catch (_error) {
      // Для старых сообщений остаётся поиск по идентификатору актёра.
    }
  }
  return data?.actorId ? game.actors.get(data.actorId) : null;
}

async function applyFastHealingFromMessage(message, button = null) {
  const data = message?.getFlag?.(MODULE_ID, "fastHealing") ?? gprop(message, `flags.${MODULE_ID}.fastHealing`);
  if (!data || data.applied) return;
  const actor = await resolveFastHealingActor(data);
  if (!actor || !canManageActor(actor)) return ui.notifications.warn("Недостаточно прав для восстановления ПЗ этого персонажа.");
  const amount = Math.max(0, Math.floor(toNumber(data.amount, 0)));
  const current = toNumber(gprop(actor, "system.attributes.hp.value"), 0);
  const maximum = Math.max(0, toNumber(gprop(actor, "system.attributes.hp.max"), current));
  const next = Math.min(maximum, current + amount);
  const restored = Math.max(0, next - current);
  if (restored) await actor.update({ "system.attributes.hp.value": next }, { diff: true });
  await message.update({
    [`flags.${MODULE_ID}.fastHealing.applied`]: true,
    [`flags.${MODULE_ID}.fastHealing.cancelled`]: false,
    [`flags.${MODULE_ID}.fastHealing.restored`]: restored,
    [`flags.${MODULE_ID}.fastHealing.hpBefore`]: current,
    [`flags.${MODULE_ID}.fastHealing.hpAfter`]: next
  });
  if (button) {
    button.classList.add("is-applied");
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-check"></i> Восстановлено ${restored} ПЗ`;
  }
  ui.notifications.info(`${actor.name}: восстановлено ${restored} ПЗ быстрым лечением.`);
}

async function undoFastHealingFromMessage(message) {
  const data = message?.getFlag?.(MODULE_ID, "fastHealing") ?? gprop(message, `flags.${MODULE_ID}.fastHealing`);
  if (!data?.applied) return;
  const actor = await resolveFastHealingActor(data);
  if (!actor || !canManageActor(actor)) return ui.notifications.warn("Недостаточно прав для изменения ПЗ этого персонажа.");
  const current = toNumber(gprop(actor, "system.attributes.hp.value"), 0);
  const recordedAfter = toNumber(data.hpAfter, current);
  const recordedBefore = toNumber(data.hpBefore, current);
  const restored = Math.max(0, toNumber(data.restored, 0));
  const next = current === recordedAfter ? recordedBefore : current - restored;
  await actor.update({ "system.attributes.hp.value": next }, { diff: true });
  await message.update({
    [`flags.${MODULE_ID}.fastHealing.applied`]: false,
    [`flags.${MODULE_ID}.fastHealing.cancelled`]: false,
    [`flags.${MODULE_ID}.fastHealing.restored`]: 0,
    [`flags.${MODULE_ID}.fastHealing.hpBefore`]: next,
    [`flags.${MODULE_ID}.fastHealing.hpAfter`]: next
  });
  ui.notifications.info(`${actor.name}: применение быстрого лечения отменено.`);
}

function getChatMessageFromContext(li) {
  const id = li?.data?.("messageId") ?? li?.[0]?.dataset?.messageId ?? li?.dataset?.messageId;
  return id ? game.messages.get(id) : null;
}

async function postAutomaticFastHealingReminder(combat) {
  const activeGM = game.users?.activeGM;
  if (!combat?.started || !game.user.isGM || (activeGM && !activeGM.isSelf)) return;
  const combatant = combat.combatant;
  const actor = combatant?.actor;
  if (!isSupportedActor(actor) || isPartyActor(actor) || partyFolderHandlesFastHealing(actor)) return;
  const amount = getFastHealingAmount(actor);
  if (!amount) return;
  const key = `${combat.id}:${combat.round ?? 0}:${combat.turn ?? 0}:${combatant.id}`;
  if (lastFastHealingTurnKey === key) return;
  lastFastHealingTurnKey = key;
  await postFastHealingCard(actor, { turnKey: key, automatic: true });
}

function injectActorInventoryIdentification(root, actor) {
  const inventory = root?.querySelector?.('.tab.inventory[data-tab="inventory"]');
  if (!inventory) return;
  inventory.querySelectorAll(".pf1e-ru-inventory-identification-button").forEach((button) => button.remove());
  const toolbar = [...inventory.querySelectorAll(".inventory-filters.flexrow")]
    .find((element) => element.querySelector('.item-list-search input[type="search"]'));
  if (!toolbar) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf1e-ru-inventory-identification-button";
  button.title = "Проверить опознание предметов этого персонажа";
  button.innerHTML = '<i class="fas fa-eye"></i> Опознание предметов';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    new PF1ERUActorIdentificationApp(actor).render(true);
  });
  const filters = toolbar.querySelector(".filter-list");
  if (filters) filters.before(button);
  else toolbar.append(button);
}

function injectActorFastHealingControl(root, actor) {
  if (!root?.querySelector) return;
  root.querySelectorAll(".pf1e-ru-fast-healing-inline").forEach((button) => button.remove());
  const amount = getFastHealingAmount(actor);
  if (!amount) return;
  const input = root.querySelector('input[name="system.traits.fastHealing"]');
  const container = input?.closest("li.attribute") ?? input?.closest(".form-group");
  if (!container) return;
  const target = container.querySelector(".attribute-value .attribute")
    ?? container.querySelector(".attribute-value")
    ?? container.querySelector(":scope > label");
  if (!target) return;
  target.classList.add("pf1e-ru-fast-healing-slot");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf1e-ru-fast-healing-inline";
  button.title = `Применить быстрое лечение (${amount} ПЗ)`;
  button.setAttribute("aria-label", button.title);
  button.innerHTML = '<i class="fas fa-heartbeat"></i>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void postFastHealingCard(actor).catch((error) => {
      console.error(`${MODULE_ID} | Не удалось создать карточку быстрого лечения.`, error);
    });
  });
  target.append(button);
}

function injectRenderedActorSheetTools(sheet) {
  const actor = getActorFromSheet(sheet);
  if (!isSupportedActor(actor) || isPartyActor(actor) || !canManageActor(actor)) return;
  const root = sheet?.element?.[0] ?? sheet?.element;
  injectActorInventoryIdentification(root, actor);
  injectActorFastHealingControl(root, actor);
  const header = root?.querySelector?.(".window-header");
  if (!header) return;
  header.querySelectorAll(".pf1e-ru-identification-tool, .pf1e-ru-fast-healing-tool").forEach((element) => element.remove());
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, HIDE_IDENTIFY_DC_SETTING, {
    name: "Скрывать СЛ опознания от игроков",
    hint: "Скрывать сложность опознания в листах предметов и окне опознания инвентаря. Игровые мастера всегда видят это значение.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      if (!game.ready) return;
      for (const app of Object.values(ui.windows ?? {})) {
        if (app instanceof PF1ERUActorIdentificationApp || getItemFromSheet(app)) app.render(false);
      }
    }
  });
  game.settings.register(MODULE_ID, UNKNOWN_ICON_SETTING, {
    name: "Изображения неопознанных предметов",
    hint: "Заменять изображения неопознанных предметов подходящими изображениями модуля. При отключении сохранённые исходные изображения будут возвращены.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (enabled) => {
      if (!game.ready || !game.user?.isGM) return;
      void synchronizeExistingUnknownItemIcons(enabled).catch((error) => {
        console.error(`${MODULE_ID} | Не удалось обновить изображения неопознанных предметов.`, error);
      });
    }
  });
  game.settings.register(MODULE_ID, UNKNOWN_ICON_MIGRATION_SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  game.settings.register(MODULE_ID, CURSE_SOUND_SETTING, {
    name: "Звук при раскрытии проклятия",
    hint: "Воспроизводить короткое зловещее сопровождение, когда проверка раскрывает проклятие предмета.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, CURSE_SOUND_VOLUME_SETTING, {
    name: "Громкость раскрытия проклятия",
    hint: "Громкость звукового сопровождения проклятия.",
    scope: "world",
    config: true,
    type: Number,
    default: 0.3,
    range: { min: 0, max: 1, step: 0.05 }
  });
});

Hooks.once("ready", async () => {
  game.socket.on(SOCKET_NAME, (request) => {
    void handleModuleSocket(request).catch((error) => {
      console.error(`${MODULE_ID} | Ошибка обработки сетевого события.`, error);
    });
  });
  await migrateExistingUnknownItemIcons().catch((error) => {
    console.error(`${MODULE_ID} | Не удалось назначить изображения неопознанным предметам.`, error);
  });
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      ...(module.api ?? {}),
      getUnknownItemIcon: (source) => getUnknownIcon(source).img,
      areUnknownItemIconsEnabled,
      openActorIdentification: (actor) => new PF1ERUActorIdentificationApp(actor).render(true),
      postFastHealingCard
    };
  }
});

Hooks.on("preCreateItem", applyUnknownIconToPreCreate);
Hooks.on("preUpdateItem", applyUnknownIconToPreUpdate);
Hooks.on("createItem", (item, options, userId) => {
  void synchronizeCreatedUnknownItem(item, options, userId).catch((error) => {
    console.error(`${MODULE_ID} | Не удалось назначить изображение новому неопознанному предмету.`, error);
  });
});
Hooks.on("updateItem", (item, _changed, options, userId) => {
  void synchronizeUpdatedUnknownItem(item, options, userId).catch((error) => {
    console.error(`${MODULE_ID} | Не удалось синхронизировать изображение опознанного предмета.`, error);
  });
});
Hooks.on("renderActorSheet", injectRenderedActorSheetTools);
Hooks.on("renderItemSheet", (sheet, html) => {
  const root = html?.[0] ?? html ?? sheet?.element?.[0];
  restoreItemSheetScroll(sheet, root);
  void injectItemCurseControls(sheet, html).catch((error) => {
    console.error(`${MODULE_ID} | Не удалось добавить настройки проклятия в лист предмета.`, error);
  });
});
Hooks.on("renderChatMessage", (message, html) => {
  const data = message.getFlag?.(MODULE_ID, "fastHealing") ?? gprop(message, `flags.${MODULE_ID}.fastHealing`);
  const root = html?.[0] ?? html;
  const button = root?.querySelector?.("[data-action='apply-pf1e-ru-fast-healing']");
  if (!button || !data) return;
  if (data.applied) {
    button.classList.add("is-applied");
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-check"></i> Быстрое лечение применено';
  } else {
    button.classList.remove("is-applied", "is-cancelled");
    button.disabled = false;
    button.innerHTML = `<i class="fas fa-plus"></i> Восстановить ${Math.max(0, Math.floor(toNumber(data.amount, 0)))} ПЗ`;
    button.addEventListener("click", () => applyFastHealingFromMessage(message, button));
  }
});
Hooks.on("getChatLogEntryContext", (_html, options) => {
  options.push({
    name: "Отменить быстрое лечение",
    icon: '<i class="fas fa-undo"></i>',
    condition: (li) => {
      const message = getChatMessageFromContext(li);
      const data = message?.getFlag?.(MODULE_ID, "fastHealing") ?? gprop(message, `flags.${MODULE_ID}.fastHealing`);
      return Boolean(data?.applied);
    },
    callback: (li) => undoFastHealingFromMessage(getChatMessageFromContext(li))
  });
});
Hooks.on("updateCombat", (combat, changed) => {
  if (changed.turn === undefined && changed.round === undefined && changed.started === undefined) return;
  setTimeout(() => postAutomaticFastHealingReminder(combat).catch((error) => {
    console.error(`${MODULE_ID} | Не удалось отправить напоминание о быстром лечении.`, error);
  }), 50);
});
Hooks.on("deleteCombat", () => { lastFastHealingTurnKey = ""; });

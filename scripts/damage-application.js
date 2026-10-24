import { MODULE, ALIGNMENTS, materialConfig, escapeHTML as esc } from "./special-materials.js";
import { MATERIALS } from "./special-materials-data.js";
import { calculateDamage, componentsFromRolls, applyToHealth } from "./damage-rules.js";
import { focusToken, bindTokenHover } from "./token-navigation.js";

const clone = value => foundry.utils.deepClone(value);
const flag = (doc, key) => doc?.getFlag(MODULE, key);
const pendingClicks = new Set();
let workQueue = Promise.resolve();
Hooks.on("init", () => {
  if (game.system.id !== "pf1") return;
  game.settings.register(MODULE, "damageCalculationGMOnly", {
    name: "Расчёт урона виден только ГМ",
    hint: "Показывает подробный раздел «Расчёт», включая условия преодолённого СУ, только мастеру. Если выключить, расчёт смогут видеть все участники, которым доступно сообщение. Итог урона остаётся видимым.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => globalThis.ui?.chat?.render(true)
  });
});
const modes = { none: "Без урона", full: "Полный урон", half: "Половина исходного урона", criticalHalf: "Половина критического урона", critical: "Критический урон", manual: "Итоговый урон вручную", undo: "Урон отменён" };
const gm = () => game.users.activeGM ?? game.users.find(u => u.active && u.isGM);
const authorized = (user, source) => Boolean(user && source && (user.isGM || (source.user?.id === user.id && source.isContentVisible)));
const health = actor => {
  const hp = actor.system.attributes.hp;
  return { value: Number(hp.value), temp: Number(hp.temp) || 0, nonlethal: Number(hp.nonlethal) || 0, max: Number(hp.max) };
};
const sameHealth = (a, b) => ["value", "temp", "nonlethal", "max"].every(k => a[k] === b[k]);
const healthUpdate = hp => Object.fromEntries(["value", "temp", "nonlethal"].map(k => [`system.attributes.hp.${k}`, hp[k]]));

export function snapshotAction(use) {
  const action = use.action, item = use.item;
  const align = action._pf1ruAlignments ?? flag(item, "alignments") ?? {};
  const enhancementChanges = item.getContextChanges?.("wdamage")?.filter(c => c.modifier === "enh").map(c => Number(c.value) || 0) ?? [];
  return {
    version: 1, actor: use.actor.uuid,
    targets: Array.from(game.user.targets).map(t => t.document.uuid),
    attacks: use.shared.chatAttacks.map(atk => {
      const ammo = atk.ammo?.id ? use.actor.items.get(atk.ammo.id) : null;
      const ammoAlign = flag(ammo, "alignments") ?? {};
      return {
        weapon: ["mwak", "rwak"].includes(action.data.actionType) && item.type !== "spell",
        healing: Boolean(atk.isHealing), nonlethal: Boolean(atk.nonlethal),
        enhancement: Math.max(Number(action.enhancementBonus) || 0, Number(ammo?.system.enh) || 0, ...enhancementChanges),
        material: materialConfig(ammo ?? item).id ?? "",
        alignments: Object.keys(ALIGNMENTS).filter(k => align[k] || ammoAlign[k]),
        criticalMultiplier: Number(action.data.ability?.critMult) || 2,
        damage: atk.damage.rolls.map(r => r.toJSON()), critDamage: atk.critDamage.rolls.map(r => r.toJSON())
      };
    })
  };
}
Hooks.on("pf1PreActionUse", use => {
  if (game.system.id === "pf1" && use.actor) use._pf1ruDamageSnapshot = snapshotAction(use);
});
Hooks.on("pf1PreDisplayActionUse", use => {
  if (game.system.id !== "pf1" || !use.actor) return;
  const snapshot = use._pf1ruDamageSnapshot ?? snapshotAction(use);
  // Script calls can modify the rolled damage after the earlier hook. Keep the final rolls,
  // while preserving the weapon properties and marked targets captured for this attack.
  use.shared.chatAttacks.forEach((atk, i) => {
    if (!snapshot.attacks[i]) return;
    snapshot.attacks[i].damage = atk.damage.rolls.map(r => r.toJSON());
    snapshot.attacks[i].critDamage = atk.critDamage.rolls.map(r => r.toJSON());
    snapshot.attacks[i].nonlethal = Boolean(atk.nonlethal);
  });
  use.shared.chatData[`flags.${MODULE}.damageSnapshot`] = snapshot;
});

export function actorDefenses(actor) {
  const traits = clone(actor.system.traits ?? {});
  const races = actor.race ? [actor.race] : [...(actor.items ?? [])].filter(i => i.type === "race");
  const isUndead = value => ["undead", "нежить"].includes(String(value ?? "").trim().toLowerCase());
  const undead = isUndead(traits.type) || races.some(r => isUndead(r.system.creatureType) || (Array.isArray(r.system.subTypes) ? r.system.subTypes : [r.system.subTypes]).some(isUndead));
  if (undead) {
    if (typeof traits.di === "string") traits.di = { value: [], custom: traits.di };
    traits.di ??= { value: [], custom: "" }; traits.di.value ??= [];
    if (!traits.di.value.includes("nonlethal")) traits.di.value.push("nonlethal");
  }
  // Material defenses coexist with sheet defenses. The calculator takes the strongest,
  // so a manually entered copy of the same resistance does not stack.
  for (const item of actor.items ?? []) {
    if (item.type !== "equipment" || !item.system.equipped || item.system.melded) continue;
    const material = MATERIALS.find(m => m.id === materialConfig(item).id);
    const category = { lightArmor: 1, mediumArmor: 2, heavyArmor: 3 }[item.system.equipmentSubtype];
    if (!category) continue;
    const append = (key, entry) => {
      if (typeof traits[key] === "string") traits[key] = { value: [], custom: traits[key] };
      traits[key] ??= { value: [], custom: "" }; traits[key].value ??= [];
      traits[key].value.push(entry);
    };
    if (material?.id === "adamantine") append("dr", { amount: category, types: [], operator: true });
    if (material?.resistance) append("eres", { amount: 2, types: [material.resistance], operator: true });
  }
  return { dr: traits.dr, eres: traits.eres, di: traits.di, dv: traits.dv, nonlethalImmune: undead };
}

export function resultFor(attack, traits, mode, amount) {
  if (mode === "manual") {
    if (!Number.isInteger(amount) || amount < 0 || amount > 1000000) throw new Error("Введите целое неотрицательное число урона.");
    return { original: amount, lethal: amount, nonlethal: 0, details: ["Итог введён вручную; защиты повторно не применялись."] };
  }
  if (mode === "none") return { original: 0, lethal: 0, nonlethal: 0, details: ["Урон обнулён по результату испытания или решению мастера."] };
  if (mode === "undo") return { original: 0, lethal: 0, nonlethal: 0, details: [] };
  const critical = ["critical", "criticalHalf"].includes(mode);
  if (critical && !attack.critDamage.length) throw new Error("В этой атаке нет броска критического урона.");
  const rolls = critical ? [...attack.damage, ...attack.critDamage] : attack.damage;
  try {
    return calculateDamage({ components: componentsFromRolls(rolls, attack.nonlethal), source: attack, traits, half: ["half", "criticalHalf"].includes(mode) });
  } catch (error) {
    const totals = rolls.map(r => Number(r.total));
    if (totals.some(n => !Number.isFinite(n))) throw error;
    const components = rolls.map((roll, i) => {
      try { return componentsFromRolls([roll], attack.nonlethal)[0]; }
      catch { return { amount: totals[i], types: ["untyped"], nonlethal: attack.nonlethal }; }
    });
    const result = calculateDamage({ components: components.map(p => ({ ...p, types: ["untyped"] })), source: attack,
      traits: traits.nonlethalImmune ? { di: { value: ["nonlethal"] } } : {}, half: ["half", "criticalHalf"].includes(mode) });
    result.details.unshift("Урон или защита не распознаны: применён обычный результат броска без автоматических поправок защит.");
    return result;
  }
}

const targetImage = row => {
  const src = row.img || "icons/svg/mystery-man.svg";
  return /\.(webm|mp4)(?:[?#]|$)/i.test(src)
    ? `<video src="${esc(src)}" aria-label="${esc(row.name)}" autoplay loop muted playsinline></video>`
    : `<img src="${esc(src)}" alt="${esc(row.name)}">`;
};
const damageSummary = row => {
  if (!row.result || row.mode === "undo") return "";
  const r = row.result;
  return `<div class="pf1ru-damage-summary">${r.drBypassed ? '<div>СУ <span class="pf1ru-damage-bypassed">преодолено</span></div>' : ''}<div>Нанесено урона: <strong>${Math.max(0, r.lethal + r.nonlethal - (r.tempAbsorbed ?? 0))}</strong>${r.nonlethal ? ` (нелетальный: ${r.nonlethal})` : ''}</div>${r.absorbed > 0 ? `<div><span class="pf1ru-damage-absorbed">Поглощено</span>: ${r.absorbed}</div>` : ''}${r.tempAbsorbed > 0 ? `<div><span class="pf1ru-damage-absorbed">Поглощено</span> временными ОЗ: ${r.tempAbsorbed}</div>` : ''}</div>`;
};
export const receiptContent = record => `<section class="pf1ru-damage-receipt"><h3>Урон по целям</h3>
  ${record.rows.map((row, i) => `<div class="pf1ru-damage-target"><div class="pf1ru-damage-heading">${targetImage(row)}<span><strong>${esc(row.name)}</strong>: ${row.error ? esc(row.error) + (row.result ? ` Последнее подтверждённое списание: ${row.result.lethal + row.result.nonlethal}.` : "") : esc(modes[row.mode])}</span></div>
  ${damageSummary(row)}
  <div class="pf1ru-damage-buttons">${Object.entries({ undo: "Отменить", manual: "Ввести итог", half: "Вернуть и списать половину", ...(record.hasCritical ? { critical: "Вернуть и списать критический" } : {}) }).map(([mode, title]) => `<button type="button" data-pf1ru-damage="${mode}" data-row="${i}"><i class="fas fa-${{undo:"undo",manual:"edit",half:"adjust",critical:"bolt"}[mode]}" aria-hidden="true"></i> ${title}</button>`).join("")}</div></div>`).join("")}
  <p class="notes">Цели сохранены в момент атаки. Половина считается до защит. Повторные кнопки заменяют это списание.</p></section>`;

async function feedback(text, source = null) {
  return ChatMessage.create({ content: `<p class="pf1ru-damage-feedback">${esc(text)}</p>`,
    whisper: [...new Set([game.user.id, ...(source?.user?.id ? [source.user.id] : []), ...game.users.filter(u => u.isGM).map(u => u.id)])] });
}
function manualDialog(callback) {
  new Dialog({ title: "Итоговый урон", content: '<p>Окончательный летальный урон: СУ, сопротивления и уязвимости повторно не применяются. Временные ОЗ поглощают его обычным образом.</p><input name="damage" type="number" min="0" max="1000000" step="1" value="0">',
    buttons: { apply: { label: "Применить", callback: html => {
      const input = html[0].querySelector("input"); if (input.reportValidity()) callback(Number(input.value));
    } }, cancel: { label: "Отмена" } }, default: "apply" }).render(true);
}
export async function requestDamage(source, index, mode, amount, receipt = null, row = null) {
  if (!authorized(game.user, source)) return;
  const key = `${source.id}:${index}:${receipt?.id ?? ""}:${row ?? ""}`;
  if (pendingClicks.has(key)) return;
  if (!gm()) return feedback("Для списания по целям нужен подключённый мастер. Урон не изменён.", source);
  pendingClicks.add(key);
  try {
    const id = foundry.utils.randomID();
    await source.setFlag(MODULE, `damageRequests.${id}`, { source: source.id, index, mode, amount: amount ?? null, receipt: receipt?.id ?? null, row,
      revision: receipt ? flag(receipt, "damageReceipt").revision : null });
  } finally { pendingClicks.delete(key); }
}

export async function processRequest(request) {
  const command = flag(request, "damageRequest");
  if (!command || flag(request, "damageRequestDone") || gm()?.id !== game.user.id) return;
  const source = game.messages.get(command.source), snapshot = flag(source, "damageSnapshot"), user = request.user;
  try {
    if (!authorized(user, source) || !snapshot || !Object.hasOwn(modes, command.mode)) throw new Error("Нет доступа к этой атаке.");
    if (!Number.isInteger(command.index) || !snapshot.attacks[command.index]) throw new Error("Атака не найдена.");
    const attacker = await fromUuid(snapshot.actor);
    if (!user.isGM && !attacker?.testUserPermission(user, "OWNER")) throw new Error("Нет прав владельца атакующего актёра.");
    if (snapshot.templateWorkflowSource) throw new Error("Для урона шаблона используйте список целей в чате мастера.");
    const templateWorkflow = flag(source, "templateWorkflow"), templatePlan = flag(source, "templateDamagePlan");
    if (templateWorkflow && (!source.user?.isGM || (!command.receipt && templateWorkflow.status !== "applying"))) throw new Error("Список целей ещё не подтверждён или уже обработан.");
    const attack = snapshot.attacks[command.index];
    if (attack.healing) throw new Error("Эта карточка содержит лечение, а не урон.");
    let receipt = command.receipt ? game.messages.get(command.receipt) : null;
    // The source stores a receipt for each attack. A double click cannot create another hit.
    const receiptId = flag(source, "damageReceipts")?.[command.index];
    if (!receipt && receiptId) {
      receipt = game.messages.get(receiptId);
      if (receipt) throw new Error("Урон этой атаки уже обработан. Используйте кнопки в её сообщении о списании.");
      throw new Error("Сообщение о списании этой атаки было удалено. Повторное автоматическое списание заблокировано.");
    }
    let record;
    if (receipt) {
      if (!receipt.user?.isGM || receipt.id !== receiptId) throw new Error("Сообщение о списании не подтверждено мастером.");
      record = clone(flag(receipt, "damageReceipt"));
      if (!record || record.source !== source.id || record.index !== command.index) throw new Error("Неверная ссылка на атаку.");
      if (record.revision !== command.revision) throw new Error("Это списание уже изменилось. Используйте обновлённое сообщение.");
      if (!Number.isInteger(command.row) || !record.rows[command.row]) throw new Error("Цель не найдена.");
    } else {
      if (!snapshot.targets.length) throw new Error("При атаке не было отмеченных целей. Выбранные токены не используются. Отметьте цели и сделайте новый бросок.");
      record = { source: source.id, index: command.index, revision: 0, mode: command.mode, hasCritical: attack.critDamage.length > 0, rows: [] };
      const seen = new Set();
      for (const uuid of snapshot.targets) {
        const token = await fromUuid(uuid), actor = token?.actor;
        if (!actor) { record.rows.push({ uuid, name: "Удалённая цель", error: "Токен или актёр больше не существует." }); continue; }
        // Two linked tokens can share the same HP document; do not damage it twice for one hit.
        if (seen.has(actor.uuid)) continue;
        seen.add(actor.uuid);
        record.rows.push({ uuid, actorUuid: actor.uuid, name: token.name, img: token.texture?.src ?? actor.img, before: health(actor), after: health(actor), traits: actorDefenses(actor) });
      }
      // Reserve the attack before any HP write. Recovery state lives on the source,
      // so only the completed receipt creates a chat message.
      await source.setFlag(MODULE, `damageReceipts.${command.index}`, `pending:${request.id}`);
      await source.setFlag(MODULE, `damagePending.${command.index}`, record);
    }
    const indices = command.receipt ? [command.row] : record.rows.map((_, i) => i);
    for (const i of indices) {
      const row = record.rows[i];
      try {
        const actor = row.actorUuid ? await fromUuid(row.actorUuid) : null;
        if (!actor) throw new Error("Цель больше не существует; её ОЗ не изменены.");
        const config = game.settings.get("pf1", "healthConfig");
        if (config?.variants?.[actor.type === "character" ? "pc" : "npc"]?.useWoundsAndVigor) throw new Error("Вариант ран и бодрости требует штатного расчёта PF1; ОЗ не изменены.");
        if (!sameHealth(health(actor), row.after)) throw new Error("ОЗ уже изменились после этого списания. Автоматическая замена отменена, чтобы сохранить последующее лечение или урон.");
        const planned = templateWorkflow && !command.receipt
          ? (Array.isArray(templatePlan) ? templatePlan.find(p => p.uuid === row.uuid)
            : templatePlan?.[row.uuid] ?? foundry.utils.getProperty(templatePlan ?? {}, row.uuid)) : null;
        if (templateWorkflow && !command.receipt && !["full", "half", "none"].includes(planned?.mode)) throw new Error("Для цели не подтверждена доля урона.");
        const mode = planned?.mode ?? (command.mode === "half" && row.basis === "critical" ? "criticalHalf" : command.mode);
        const result = resultFor(attack, row.traits, mode, command.amount);
        if (planned?.note) result.details.unshift(planned.note);
        const after = command.mode === "undo" ? clone(row.before) : applyToHealth(row.before, result);
        if (mode === "undo") result.details.push("Восстановлены ОЗ, временные ОЗ и нелетальный урон до этого списания.");
        else if (row.before.temp > after.temp) { result.tempAbsorbed = row.before.temp - after.temp; result.details.push(`Поглощено временными ОЗ: ${result.tempAbsorbed}`); }
        // Persist a recovery record before the actor update, and a marker atomically with HP.
        // On an interrupted write this is evidence for the GM, never a reason to apply it twice.
        record.inProgress = { row: i, before: row.after, after };
        if (receipt) await receipt.setFlag(MODULE, "damageReceipt", record);
      else await source.setFlag(MODULE, `damagePending.${command.index}`, record);
        if (gm()?.id !== game.user.id || !sameHealth(health(actor), row.after)) throw new Error("ОЗ или активный мастер изменились во время расчёта. Это списание не выполнено.");
        await actor.update({ ...healthUpdate(after), [`flags.${MODULE}.lastDamageReceipt`]: { id: receipt?.id ?? request.id, revision: record.revision + 1 } });
        row.after = after; row.result = result; row.error = null; row.mode = mode;
        if (["critical", "criticalHalf"].includes(mode)) row.basis = "critical";
      } catch (error) { row.error = error.message; }
      record.inProgress = null;
      if (receipt) await receipt.setFlag(MODULE, "damageReceipt", record);
      else await source.setFlag(MODULE, `damagePending.${command.index}`, record);
    }
    record.mode = command.mode; record.revision++;
    if (receipt) await receipt.update({ content: receiptContent(record), [`flags.${MODULE}.damageReceipt`]: record });
    else {
      receipt = await ChatMessage.create({ content: receiptContent(record), whisper: [...(source.whisper ?? [])], blind: Boolean(source.blind), flags: { [MODULE]: { damageReceipt: record } } });
      await source.setFlag(MODULE, `damageReceipts.${command.index}`, receipt.id);
      await source.unsetFlag(MODULE, `damagePending.${command.index}`);
    }
    await request.delete();
    return receipt;
  } catch (error) {
    await request.update({ content: `<p>${esc(error.message)}</p>`, [`flags.${MODULE}.damageRequestDone`]: true });
  }
}
export function queueDamageRequest(request) {
  const result = workQueue.catch(console.error).then(() => processRequest(request));
  workQueue = result; return result;
}
// The server supplies userId for this document update. Never trust a sender ID
// inside the flag payload. Existing authorization checks still run on the GM.
Hooks.on("updateChatMessage", (source, change, options, userId) => {
  if (game.system.id !== "pf1" || gm()?.id !== game.user.id) return;
  const requests = foundry.utils.getProperty(foundry.utils.expandObject(change), `flags.${MODULE}.damageRequests`);
  for (const [id, command] of Object.entries(requests ?? {})) {
    if (id.startsWith("-=") || !command || command.source !== source.id) continue;
    const user = game.users.find(u => u.id === userId);
    const request = { id, user, getFlag: (module, key) => key === "damageRequest" ? command : undefined,
      delete: () => source.unsetFlag(MODULE, `damageRequests.${id}`),
      update: async data => { await feedback(data.content.replace(/<[^>]*>/g, ""), source); await source.unsetFlag(MODULE, `damageRequests.${id}`); } };
    queueDamageRequest(request);
  }
});

Hooks.on("renderChatMessage", (message, html) => {
  if (game.system.id !== "pf1") return;
  const root = html[0] ?? html, receipt = flag(message, "damageReceipt"), snapshot = flag(message, "damageSnapshot");
  if (receipt) {
    // Also enhance old receipts, without rewriting their saved HTML or HP.
    root.querySelectorAll('.pf1ru-damage-heading').forEach((heading, index) => {
      const picture = heading.querySelector('img, video');
      if (!picture || picture.closest('[data-pf1ru-focus]')) return;
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'pf1ru-damage-token'; button.dataset.pf1ruFocus = String(index);
      button.title = 'Найти токен: ' + (receipt.rows[index]?.name ?? '');
      button.setAttribute('aria-label', button.title);
      picture.replaceWith(button); button.append(picture);
      bindTokenHover(button, receipt.rows[index]?.uuid);
      button.addEventListener('click', async () => {
        try { await focusToken(receipt.rows[index]?.uuid); }
        catch (error) { ui.notifications.warn(error.message); }
      });
    });
    // Shared HTML contains only the summary. Add details for this viewer, so the
    // GM's rendered view is never saved into the content seen by everyone else.
    const showCalculation = game.user.isGM || game.settings.get(MODULE, "damageCalculationGMOnly") === false;
    root.querySelectorAll(".pf1ru-damage-target").forEach((target, index) => {
      for (const old of target.querySelectorAll(":scope > details")) old.remove();
      const details = receipt.rows?.[index]?.result?.details;
      if (!showCalculation || !details?.length) return;
      const element = document.createElement("details"); element.className = "pf1ru-damage-calculation";
      element.innerHTML = `<summary>Расчёт</summary>${details.map(text => `<div>${esc(text)}</div>`).join("")}`;
      const buttons = target.querySelector(".pf1ru-damage-buttons");
      if (buttons) buttons.before(element); else target.append(element);
    });
    const source = game.messages.get(receipt.source);
    for (const button of root.querySelectorAll("[data-pf1ru-damage]")) {
      button.hidden = !authorized(game.user, source);
      button.addEventListener("click", () => {
        const mode = button.dataset.pf1ruDamage, row = Number(button.dataset.row);
        const execute = amount => requestDamage(source, receipt.index, mode, amount, message, row);
        if (mode === "manual") manualDialog(execute); else execute();
      });
    }
    return;
  }
  if (!snapshot) return;
  if (snapshot.templateWorkflowSource) {
    root.querySelectorAll('[data-action="applyDamage"]').forEach(button => button.remove());
    return;
  }
  for (const container of root.querySelectorAll(".chat-attack[data-index]")) {
    const index = Number(container.dataset.index), attack = snapshot.attacks[index];
    if (!attack || attack.healing || !attack.damage.length) continue;
    // Capture before the PF1 jQuery delegate: never apply this same click to selected tokens.
    container.addEventListener("click", event => {
      const button = event.target.closest('[data-action="applyDamage"]');
      if (!button || !container.contains(button)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!authorized(game.user, message)) return;
      const th = button.closest("th"), critical = th?.parentElement.classList.contains("damage") && th.cellIndex > 0;
      const half = button.querySelector("i.absolute")?.textContent.trim() === "½";
      requestDamage(message, index, critical ? (half ? "criticalHalf" : "critical") : half ? "half" : "full");
    }, true);
  }
});

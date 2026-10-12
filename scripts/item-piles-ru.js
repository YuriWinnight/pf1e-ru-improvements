import { ITEM_PILES_RU, ITEM_PILES_LITERAL_RU } from "./item-piles-ru-translations.js";

// Keep shared Foundry keys (Name, Description, etc.) untouched. Item Piles has
// its own localized strings and a few literal labels in its Svelte components.
const observers = new WeakMap();
const protectedContent = ".merchant-description, .editor, .prosemirror, [contenteditable], .item-piles-name, .merchant-name";

function enabled() {
  return game.system?.id === "pf1" && game.modules?.get("item-piles")?.active
    && String(game.i18n.lang).toLowerCase().startsWith("ru");
}

function applyTranslations() {
  if (!enabled()) return;
  for (const [key, value] of Object.entries(ITEM_PILES_RU)) {
    foundry.utils.setProperty(game.i18n.translations, key, value);
  }
}

function translateDefaultCurrencies(currencies) {
  if (!Array.isArray(currencies)) return currencies;
  const defaults = {
    "system.currency.pp": ["{#}P", "{#}П", "{#}пм"],
    "system.currency.gp": ["{#}G", "{#}З", "{#}зм"],
    "system.currency.sp": ["{#}S", "{#}С", "{#}см"],
    "system.currency.cp": ["{#}C", "{#}М", "{#}мм"]
  };
  return currencies.map(currency => {
    const pair = defaults[currency?.data?.path];
    return currency?.type === "attribute" && pair && pair.slice(0, 2).includes(currency.abbreviation)
      ? { ...currency, abbreviation: pair[2] } : currency;
  });
}

// Item Piles reads this setting for both its currency editor and transactions.
// Translate the four PF1 defaults consistently; never rewrite stored settings,
// actor overrides, custom abbreviations, exchange rates or currency quantities.
Hooks.once("setup", () => {
  if (!enabled()) return;
  const wrapper = function (wrapped, namespace, key, ...args) {
    const value = wrapped(namespace, key, ...args);
    return enabled() && namespace === "item-piles" && key === "currencies"
      ? translateDefaultCurrencies(value) : value;
  };
  if (globalThis.libWrapper) {
    libWrapper.register("pf1e-ru-improvements", "game.settings.get", wrapper, "WRAPPER");
  } else {
    const original = game.settings.get;
    game.settings.get = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
  }
});

function translateLabel(element) {
  if (element.closest(protectedContent)) return;
  // Change only text nodes, retaining Svelte's element references and listeners.
  for (const node of element.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const value = ITEM_PILES_LITERAL_RU[node.data.trim()];
    if (value) node.data = node.data.replace(/\S(?:[\s\S]*\S)?/, value);
  }
}

function translateWindow(root) {
  if (!enabled()) return;
  // These headers contain UI column labels; the rows below contain user data.
  for (const header of root.querySelectorAll(".item-piles-sortable-list-columns.header")) {
    const labels = Array.from(header.children, cell => cell.textContent.trim());
    if (labels.includes("Primary") || labels.includes("Основная")) {
      header.parentElement.classList.add("pf1e-ru-primary-currencies");
    } else if (labels.includes("Fixed") || labels.includes("Фиксированная")) {
      header.parentElement.classList.add("pf1e-ru-purchase-prices");
    } else if ((labels.includes("Short") || labels.includes("Сокращение")) && labels.length === 5) {
      header.parentElement.classList.add("pf1e-ru-secondary-currencies");
    }
  }
  const labels = [
    ".item-piles-sortable-list-columns.header > div",
    ".item-piles-item-list-header .item-piles-small-text > a",
    ".merchant-left-pane .update-button",
    ".item-piles-config-container label.item-piles-text-center",
    ".item-piles-sortable-list-columns > .full-span",
    ".item-piles-config-container h2", ".item-piles-config-container h3"
  ];
  for (const element of root.querySelectorAll(labels.join(","))) translateLabel(element);
  for (const button of root.querySelectorAll(".item-piles-button")) {
    if (button.closest(protectedContent)) continue;
    if (button.textContent.trim() === ITEM_PILES_RU["ITEM-PILES.Merchant.AddTable"]) {
      button.parentElement.classList.add("pf1e-ru-add-table-row");
    }
  }
  for (const input of root.querySelectorAll("input[placeholder]")) {
    if (input.closest(protectedContent)) continue;
    const value = ITEM_PILES_LITERAL_RU[input.getAttribute("placeholder")];
    if (value) input.setAttribute("placeholder", value);
  }
  for (const control of root.querySelectorAll("[data-fast-tooltip]")) {
    if (control.closest(protectedContent)) continue;
    if (control.getAttribute("data-fast-tooltip") === "Open Macro") {
      control.setAttribute("data-fast-tooltip", ITEM_PILES_LITERAL_RU["Open Macro"]);
    }
  }
  // Category names and price presets may be user-supplied, so only touch the
  // sorting control, identified by its built-in 'Sort by:' labels.
  for (const select of root.querySelectorAll("select")) {
    if (select.closest(protectedContent)) continue;
    const options = Array.from(select.options);
    if (!options.length || !options.every(option => /^(Sort by:|Сортировка:)/.test(option.textContent.trim()))) continue;
    for (const option of options) {
      for (const node of option.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const current = node.data;
        const label = current.trim();
        const value = ITEM_PILES_LITERAL_RU[label] ?? (label === "Type" ? "Тип" : null);
        const next = value ? current.replace(/\S(?:[\s\S]*\S)?/, value) : current.replace(/^Sort by:/, "Сортировка:");
        if (next !== current) node.data = next;
      }
    }
  }
  if (root.classList.contains("item-piles-merchant-sheet")) {
    const title = root.querySelector(".window-title");
    if (title) {
      for (const node of title.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && /^Merchant: /.test(node.data)) {
          node.data = node.data.replace(/^Merchant: /, "Торговец: ");
        }
      }
    }
  }
}

function onRender(app, html) {
  if (!enabled()) return;
  // SvelteApplication replaces _element while Foundry's hook still receives
  // its detached initial HTML. Observe the mounted application shell instead.
  const element = app.element?.[0] ?? app.element ?? html?.[0] ?? html;
  const root = element?.matches?.(".item-piles-app") ? element : element?.closest?.(".item-piles-app");
  if (!root) return;
  root.classList.add("pf1e-ru-item-piles");
  const previous = observers.get(app);
  if (previous?.root === root) return translateWindow(root);
  previous?.observer.disconnect();
  translateWindow(root);

  // Expand only once per window, leaving later manual resizing intact.
  // The distributed Item Piles bundle minifies JS class names. Identify its
  // windows by stable CSS classes and its own localized application titles.
  const title = root.querySelector(".window-title")?.textContent.trim() ?? app.title ?? "";
  const editorWidths = {
    ItemEditor: 760, CurrenciesEditor: 820, SecondaryCurrenciesEditor: 720,
    ItemTypePriceModifiersEditor: 740, PriceModifiersEditor: 740, MerchantColumnsEditor: 820
  };
  let desired = root.matches(".item-piles-merchant-sheet") ? 960 : root.matches(".item-piles-config") ? 660 : 0;
  for (const [editor, width] of Object.entries(editorWidths)) {
    const prefix = ITEM_PILES_RU[`ITEM-PILES.Applications.${editor}.Title`].split(":")[0];
    if (title === prefix || title.startsWith(`${prefix}:`)) desired = width;
  }
  const available = Math.max(0, window.innerWidth - 24);
  const width = Math.min(desired, available);
  if (width > root.getBoundingClientRect().width) app.setPosition({ width });

  const observer = new MutationObserver(() => {
    observer.disconnect();
    translateWindow(root);
    observer.observe(root, observerOptions);
  });
  observer.observe(root, observerOptions);
  observers.set(app, { root, observer });
}

const observerOptions = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "data-fast-tooltip"] };
for (const hook of ["init", "i18nInit", "setup", "ready"]) Hooks.once(hook, applyTranslations);
Hooks.on("renderApplication", onRender);
Hooks.on("closeApplication", app => {
  observers.get(app)?.observer.disconnect();
  observers.delete(app);
});

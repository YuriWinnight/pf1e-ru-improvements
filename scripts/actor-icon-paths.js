// Some PF1 alternative-sheet templates use url({{item.img}}) without quotes.
// Parentheses and spaces then invalidate the CSS even though the asset exists.
function quoteIconUrl(path) {
  const escaped = path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    .replace(/\r/g, "\\d ").replace(/\n/g, "\\a ").replace(/\f/g, "\\c ");
  return `url("${escaped}")`;
}

Hooks.on("renderActorSheet", (app, html) => {
  if (game.system?.id !== "pf1") return;
  const root = html?.[0] ?? html;
  const actor = app.actor ?? app.object;
  if (!root?.querySelectorAll || !actor?.items?.get) return;
  for (const icon of root.querySelectorAll(".item-image[style]")) {
    // Leave valid backgrounds (including custom overrides) entirely unchanged.
    if (icon.style.backgroundImage) continue;
    const itemId = icon.closest("[data-item-id]")?.dataset.itemId;
    const path = actor.items.get(itemId)?.img;
    if (typeof path !== "string" || !path) continue;
    const style = icon.getAttribute("style");
    const unquoted = `url(${path})`;
    // Match the document's exact image path, never infer a path from CSS syntax.
    if (!style.includes(unquoted) || !/background-image\s*:/i.test(style)) continue;
    icon.setAttribute("style", style.replace(unquoted, quoteIconUrl(path)));
  }
});

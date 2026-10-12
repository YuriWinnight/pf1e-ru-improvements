const LIGHTING_TOOLS_MODULE = "pf1e-ru-improvements";
let updatingSceneLowLight = false;

async function setSceneLowLight(disabled) {
  const scene = canvas?.scene;
  if (!game.user?.isGM || !scene || updatingSceneLowLight) return;
  updatingSceneLowLight = true;
  try {
    const updatesFor = documents => documents
      .filter(document => Boolean(document.getFlag("pf1", "disableLowLight")) !== disabled)
      .map(document => ({ _id: document.id, "flags.pf1.disableLowLight": disabled }));
    const lights = updatesFor(scene.lights.contents);
    const tokens = updatesFor(scene.tokens.filter(token => token.light?.dim || token.light?.bright));
    if (lights.length) await scene.updateEmbeddedDocuments("AmbientLight", lights);
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens);
    ui.notifications.info(game.i18n.localize(disabled
      ? "PF1ERU.Lighting.Disabled" : "PF1ERU.Lighting.Enabled"));
  } catch (error) {
    console.error(`${LIGHTING_TOOLS_MODULE} | Scene low-light update failed`, error);
    ui.notifications.error(game.i18n.localize("PF1ERU.Lighting.Error"));
  } finally { updatingSceneLowLight = false; }
}

Hooks.on("getSceneControlButtons", controls => {
  if (game.system.id !== "pf1" || !game.user?.isGM) return;
  const lighting = controls.find(control => control.name === "lighting");
  if (!lighting) return;
  for (const [disabled, suffix, icon] of [[false, "Enable", "fa-eye"], [true, "Disable", "fa-eye-slash"]]) {
    const name = `${LIGHTING_TOOLS_MODULE}-low-light-${suffix.toLowerCase()}`;
    if (lighting.tools.some(tool => tool.name === name)) continue;
    lighting.tools.push({ name, title: `PF1ERU.Lighting.${suffix}`, icon: `fas ${icon}`,
      button: true, onClick: () => setSceneLowLight(disabled) });
  }
});

// Flag-only updates do not always reinitialize light radii in Foundry 11.
// Refresh on every client, including when the checkbox is changed manually.
function refreshSceneLowLight(document, changes) {
  if (document.parent?.id !== canvas?.scene?.id) return;
  const flags = changes.flags?.pf1;
  if (!flags || !("disableLowLight" in flags || "-=disableLowLight" in flags)) return;
  canvas.perception?.update({ initializeLighting: true, refreshLighting: true, refreshVision: true });
}
Hooks.on("updateAmbientLight", refreshSceneLowLight);
Hooks.on("updateToken", refreshSceneLowLight);

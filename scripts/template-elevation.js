import { MODULE, escapeHTML as esc } from './special-materials.js';

export const levelsActive = () => game.modules?.get('levels')?.active === true;
const documentOf = token => token?.document ?? token;
const number = value => value === '' || value == null ? NaN : Number(value);
const savedHeight = template => template?.getFlag?.(MODULE, 'templateHeight') ?? template?.flags?.[MODULE]?.templateHeight;
let placingUse = null;
const patched = new WeakMap();

export function casterToken(use) {
  const actor = use.actor ?? use.item?.actor ?? use.object?.actor;
  const explicit = use.token ?? use.shared?.token ?? actor?.token;
  if (explicit) return documentOf(explicit);
  const matches = token => token.actor && (token.actor === actor || token.actor.uuid === actor?.uuid);
  return documentOf(globalThis.canvas?.tokens?.controlled?.find(matches)
    ?? actor?.getActiveTokens?.()?.find(matches));
}

export function heightPolicy(use, selection = {}, scene = globalThis.canvas?.scene) {
  const token = casterToken(use);
  const elevation = Number.isFinite(number(token?.elevation)) ? number(token.elevation) : 0;
  const common = { version: 1, elevation, units: scene?.grid?.units ?? '' };
  if (selection.mode === 'all') return { ...common, mode: 'all' };
  if (selection.mode === 'range') {
    const bottom = number(selection.bottom), top = number(selection.top);
    if (!Number.isFinite(bottom) || !Number.isFinite(top) || bottom > top)
      throw new Error('Укажите диапазон высот: нижняя граница не должна превышать верхнюю.');
    return { ...common, mode: 'range', bottom, top, elevation: bottom };
  }
  const floors = scene?.getFlag?.('levels', 'sceneLevels') ?? scene?.flags?.levels?.sceneLevels ?? [];
  // Levels stores [bottom, top, name]. Prefer the upper floor at a shared boundary.
  const floor = (Array.isArray(floors) ? floors : []).filter(Array.isArray).map(([bottom, top, label]) => ({ bottom: number(bottom), top: number(top), label }))
    .filter(f => Number.isFinite(f.bottom) && Number.isFinite(f.top) && f.bottom <= elevation && elevation <= f.top)
    .sort((a, b) => b.bottom - a.bottom || a.top - b.top)[0];
  return { ...common, mode: 'caster', bottom: floor?.bottom ?? elevation, top: floor?.top ?? elevation, label: floor?.label ?? '' };
}

export function heightMatches(token, policy) {
  if (!policy || policy.mode === 'all') return true;
  const elevation = number(documentOf(token)?.elevation ?? 0);
  return Number.isFinite(elevation) && elevation >= policy.bottom && elevation <= policy.top;
}

export function templateHeight(use) {
  if (!levelsActive()) return null;
  return savedHeight(use.shared?.template) ?? use.shared?._pf1ruTemplateHeight
    ?? heightPolicy(use, use.shared?._pf1ruHeightSelection, use.shared?.template?.parent ?? globalThis.canvas?.scene);
}

export function filterHeightTargets(uuids, use) {
  const policy = templateHeight(use);
  if (!policy || policy.mode === 'all') return uuids;
  const scene = use.shared?.template?.parent;
  return uuids.filter(uuid => {
    const token = scene?.tokens?.get(uuid.split('.Token.')[1]) ?? globalThis.fromUuidSync?.(uuid);
    return token && heightMatches(token, policy);
  });
}

export function heightLabel(policy) {
  if (!policy) return '';
  if (policy.mode === 'all') return 'Все высоты';
  const range = `${policy.bottom === policy.top ? policy.bottom : `${policy.bottom}–${policy.top}`} ${policy.units}`.trim();
  return policy.mode === 'caster' && policy.label ? `${policy.label}: ${range}` : range;
}

export function renderHeightChoice(app, html) {
  if (game.system.id !== 'pf1' || !levelsActive() || !app.object?.hasTemplate) return;
  const root = html[0] ?? html;
  if (root.querySelector('.pf1ru-template-height')) return;
  const anchor = root.querySelector('[name="measure-template"]')?.closest('.form-group');
  if (!anchor) return;
  const defaults = heightPolicy(app);
  const state = app._pf1ruHeightSelection ??= { mode: 'caster', bottom: defaults.bottom, top: defaults.top };
  const block = document.createElement('div');
  block.className = 'pf1ru-template-height';
  block.innerHTML = `<div class="form-group"><label>Высоты шаблона</label><select name="pf1ru-height-mode" aria-label="Высоты шаблона">
    <option value="caster">Этаж токена (${esc(heightLabel(defaults))})</option><option value="all">Все высоты</option><option value="range">Диапазон высот</option></select></div>
    <div class="form-group pf1ru-height-range"><label>От / до (${esc(defaults.units)})</label><div class="pf1ru-height-inputs"><input type="number" step="any" name="pf1ru-height-bottom" aria-label="Нижняя высота" required><span>—</span><input type="number" step="any" name="pf1ru-height-top" aria-label="Верхняя высота" required></div></div>`;
  const mode = block.querySelector('select'), bottom = block.querySelector('[name="pf1ru-height-bottom"]'), top = block.querySelector('[name="pf1ru-height-top"]');
  mode.value = state.mode; bottom.value = state.bottom; top.value = state.top;
  const refresh = () => {
    const custom = state.mode === 'range';
    block.querySelector('.pf1ru-height-range').hidden = !custom;
    bottom.disabled = top.disabled = !custom;
    bottom.setCustomValidity(''); top.setCustomValidity('');
    if (custom && number(bottom.value) > number(top.value)) top.setCustomValidity('Верхняя высота должна быть не ниже нижней.');
  };
  mode.addEventListener('change', () => { state.mode = mode.value; refresh(); app.setPosition?.({ height: 'auto' }); });
  for (const [input, key] of [[bottom, 'bottom'], [top, 'top']]) input.addEventListener('input', () => { state[key] = input.value; refresh(); });
  const validate = event => {
    if (event.type === 'click' && !event.target.closest('button[name="attack_single"],button[name="attack_full"]')) return;
    if (root.querySelector('[name="measure-template"]')?.checked === false || mode.value !== 'range') return;
    if (!bottom.reportValidity() || !top.reportValidity()) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  // The native dialog resolves on button click without HTML form validation.
  root.addEventListener('click', validate, true); root.addEventListener('submit', validate, true);
  anchor.after(block); refresh(); app.setPosition?.({ height: 'auto' });
}
Hooks.on('renderAttackDialog', renderHeightChoice);

export function readHeightForm(wrapped, form = {}) {
  if (levelsActive()) {
    const root = form?.[0]?.querySelector ? form[0] : null;
    const value = name => root ? root.querySelector(`[name="${name}"]`)?.value : form[name];
    this.shared._pf1ruHeightSelection = { mode: value('pf1ru-height-mode') ?? 'caster', bottom: value('pf1ru-height-bottom'), top: value('pf1ru-height-top') };
  }
  return wrapped(form);
}

export function placeHeightTemplate(wrapped, ...args) {
  if (!levelsActive()) return wrapped(...args);
  this.shared._pf1ruTemplateHeight = heightPolicy(this, this.shared._pf1ruHeightSelection);
  // PF1 constructs the preview synchronously before its first await. Do not keep
  // global context during user placement, so simultaneous casts cannot mix.
  const previous = placingUse; placingUse = this;
  try { return wrapped(...args); } finally { placingUse = previous; }
}

export function stampHeightTemplate(wrapped, ...args) {
  const template = wrapped(...args);
  if (template && levelsActive() && placingUse) {
    const height = placingUse.shared._pf1ruTemplateHeight;
    template.document.updateSource({ [`flags.${MODULE}.templateHeight`]: { ...height }, 'flags.levels.elevation': height.elevation });
  }
  return template;
}

export function tokensWithinHeight(wrapped, ...args) {
  const tokens = wrapped(...args), policy = savedHeight(this.document);
  if (!levelsActive() || !policy) return tokens;
  return tokens.filter(token => heightMatches(token, policy));
}

export function enforceTemplateElevation(template) {
  const height = savedHeight(template);
  if (levelsActive() && height) template.updateSource({ 'flags.levels.elevation': height.elevation });
}
// Levels 4.x overwrites elevation 0 on creation. Register after its own hook.
Hooks.on('ready', () => Hooks.on('preCreateMeasuredTemplate', enforceTemplateElevation));

export function installTemplateElevation() {
  if (game.system.id !== 'pf1' || !levelsActive()) return;
  const wrap = (path, owner, method, handler) => {
    if (!owner || typeof owner[method] !== 'function') return;
    let methods = patched.get(owner); if (!methods) patched.set(owner, methods = new Set());
    if (methods.has(method)) return;
    if (game.modules.get('lib-wrapper')?.active && globalThis.libWrapper) libWrapper.register(MODULE, path, handler, 'WRAPPER');
    else { const original = owner[method]; owner[method] = function(...args) { return handler.call(this, original.bind(this), ...args); }; }
    methods.add(method);
  };
  const use = globalThis.pf1?.actionUse?.ActionUse?.prototype;
  wrap('pf1.actionUse.ActionUse.prototype.alterRollData', use, 'alterRollData', readHeightForm);
  wrap('pf1.actionUse.ActionUse.prototype.promptMeasureTemplate', use, 'promptMeasureTemplate', placeHeightTemplate);
  wrap('pf1.canvas.AbilityTemplate.fromData', globalThis.pf1?.canvas?.AbilityTemplate, 'fromData', stampHeightTemplate);
  wrap('pf1.canvas.MeasuredTemplatePF.prototype.getTokensWithin', globalThis.pf1?.canvas?.MeasuredTemplatePF?.prototype, 'getTokensWithin', tokensWithinHeight);
}
Hooks.on('setup', installTemplateElevation);

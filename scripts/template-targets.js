import { levelsActive, heightMatches } from './template-elevation.js';
const MODULE = 'pf1e-ru-improvements';
const patched = new WeakSet();

// Recompute geometry instead of depending on a visible, already-painted grid
// layer. In particular hidden templates and the first cone placement can have
// no highlight positions even though the document geometry is complete.
export function geometryTargets(template) {
  const doc = template.document, scene = template.scene ?? doc?.parent;
  const size = Number(scene?.dimensions?.size ?? globalThis.canvas?.dimensions?.size);
  const units = Number(scene?.dimensions?.distance ?? globalThis.canvas?.dimensions?.distance);
  if (!doc || !(size > 0) || !(units > 0) || !globalThis.canvas?.tokens) return null;
  if (scene?.id && canvas.scene?.id && scene.id !== canvas.scene.id) return null;
  const type = doc.t, distance = Number(doc.distance) * size / units;
  const angle = Number(doc.direction || 0) * Math.PI / 180;
  const cls = template.constructor;
  let shape = template.shape;
  if (!shape) {
    if (type === 'circle') shape = cls.getCircleShape?.(distance);
    if (type === 'cone') shape = cls.getConeShape?.(angle, Number(doc.angle), distance);
    if (type === 'rect') shape = cls.getRectShape?.(angle, distance);
    if (type === 'ray') shape = cls.getRayShape?.(angle, distance, Number(doc.width) * size / units);
  }
  if (!shape) return null;
  let squares;
  const gridType = canvas.grid?.type;
  if (gridType === 1 && game.settings.get('pf1', 'measureStyle') && ['circle', 'cone', 'ray'].includes(type) && template.getHighlightedSquares) {
    const previous = template.shape, previousRay = template.ray;
    try {
      template.shape = shape;
      if (type === 'ray' && globalThis.Ray?.fromAngle)
        template.ray = Ray.fromAngle(Number(doc.x), Number(doc.y), angle, distance);
      squares = template.getHighlightedSquares();
    }
    finally { template.shape = previous; if (type === 'ray') template.ray = previousRay; }
  }
  const inside = (x,y) => shape.contains(x - Number(doc.x), y - Number(doc.y));
  return canvas.tokens.placeables.filter(token => {
    if (!token.actor) return false;
    if (gridType === 0) return inside(token.center.x, token.center.y);
    const x = Number(token.document?.x ?? token.x), y = Number(token.document?.y ?? token.y);
    const w = Number(token.w ?? Number(token.document?.width ?? 1) * size), h = Number(token.h ?? Number(token.document?.height ?? 1) * size);
    if (![x,y,w,h].every(Number.isFinite)) return inside(token.center.x, token.center.y);
    if (squares) return squares.some(s => Math.min(x+w,s.x+size)-Math.max(x,s.x)>0.001 && Math.min(y+h,s.y+size)-Math.max(y,s.y)>0.001);
    // Native-shaped templates: sample each occupied grid cell (including large
    // tokens), using grid centres so square/hex geometry follows the canvas.
    for (let dx=0; dx<Math.max(1,Math.ceil(w/size)); dx++) for(let dy=0; dy<Math.max(1,Math.ceil(h/size)); dy++) {
      const px=x+Math.min(w/2+dx*size,(dx+0.5)*size), py=y+Math.min(h/2+dy*size,(dy+0.5)*size);
      const [cx,cy]=canvas.grid.getCenter?.(px,py) ?? [px,py];
      if (inside(cx,cy)) return true;
    }
    return false;
  });
}
export function templateTargets(wrapped, ...args) {
  const targets = geometryTargets(this) ?? wrapped(...args);
  const policy = this.document?.getFlag?.(MODULE,'templateHeight') ?? this.document?.flags?.[MODULE]?.templateHeight;
  return levelsActive() && policy ? targets.filter(t=>heightMatches(t,policy)) : targets;
}
export function installTemplateTargets() {
  if (game.system.id !== 'pf1') return;
  const prototype = globalThis.pf1?.canvas?.MeasuredTemplatePF?.prototype;
  if (!prototype?.getTokensWithin || patched.has(prototype)) return;
  if (game.modules?.get('lib-wrapper')?.active && globalThis.libWrapper)
    libWrapper.register(MODULE,'pf1.canvas.MeasuredTemplatePF.prototype.getTokensWithin',templateTargets,'MIXED');
  else {
    const original = prototype.getTokensWithin;
    prototype.getTokensWithin=function(...args){ return templateTargets.call(this,original.bind(this),...args); };
  }
  patched.add(prototype);
}
Hooks.on('setup', installTemplateTargets);

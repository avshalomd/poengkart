// The app's motion, in one place: the three curves app.css also names
// (--ease-out, --ease-io, --ease-drawer), the one spring, and a guard for the
// browsers that cannot run either. Every caller checks still() first: a reader
// who asked the system for less motion gets a short crossfade, never movement.
export const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const EASE = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',       // entering, exiting, a figure arriving
  io: 'cubic-bezier(0.77, 0, 0.175, 1)',       // something moving across the screen
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',    // the school sheet
};

// A spring given as Apple gives one (bounce, duration in seconds), sampled into
// a CSS linear() so the compositor runs it like any other easing.
function spring(bounce: number, dur: number) {
  const z = 1 - bounce, w = 2 * Math.PI / dur, wd = w * Math.sqrt(Math.max(0, 1 - z * z));
  const x = (t: number) => z < 1
    ? 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w * t) * (1 + w * t);
  const total = Math.log(1000) / (z * w), n = 48, p: string[] = [];
  for (let i = 0; i <= n; i++) p.push((i === n ? 1 : x(total * i / n)).toFixed(4));
  return { easing: `linear(${p.join(', ')})`, duration: Math.round(total * 1000) };
}
export const POP = spring(0.3, 0.4);            // a wish added: the + answers with a small overshoot

// The cubic-bezier above as a function, for figures counted frame by frame
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t: number) => ((ax * t + bx) * t + cx) * t, Y = (t: number) => ((ay * t + by) * t + cy) * t;
  const D = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = D(t); if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
    return Y(Math.min(1, Math.max(0, t)));
  };
}
export const easeOut = bezier(0.23, 1, 0.32, 1);

// element.animate(), which throws on an easing the browser cannot parse
// (linear() before Safari 17.2) and does not exist in the unit tests' DOM: the
// spring falls back to the ease-out, and no animation at all is still correct.
// A cancelled animation rejects its `finished`: an interrupted one is not an
// error, so the rejection is handled here once for every caller.
export function play(el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions): Animation | null {
  if (!el || typeof (el as any).animate !== 'function') return null;
  let a: Animation | null = null;
  try { a = el.animate(kf, o); } catch (e) {
    try { a = el.animate(kf, { ...o, easing: EASE.out }); } catch (e2) { return null; }
  }
  a?.finished?.catch(() => {});
  return a;
}

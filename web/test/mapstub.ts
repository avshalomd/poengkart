import { S } from '../src/state';

/** The MapLibre surface map.ts calls between two frames, with a real Mercator
 *  projection at a fixed zoom so bounds and bbox maths are honest. `container`
 *  may be an element or an id; the map lands on S.map unless `mini` is set. */
export function stubMap(container?: HTMLElement | string, mini = false): any {
  const el = typeof container === 'string' ? document.getElementById(container)
    : container || document.getElementById('map') || document.createElement('div');
  el!.classList.add('maplibregl-map');
  let canvasContainer = el!.querySelector('.maplibregl-canvas-container') as HTMLElement | null;
  if (!canvasContainer) {
    canvasContainer = document.createElement('div');
    canvasContainer.className = 'maplibregl-canvas-container';
    el!.appendChild(canvasContainer);
  }
  let canvas = canvasContainer.querySelector('canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'maplibregl-canvas';
    canvas.setAttribute('role', 'region');      // MapLibre's own, with its tabindex
    canvas.setAttribute('tabindex', '0');
    canvasContainer.appendChild(canvas);
  }
  const corners: Record<string, HTMLElement> = {};
  for (const k of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const c = document.createElement('div'); c.className = `maplibregl-ctrl-${k}`; el!.appendChild(c); corners[k] = c;
  }
  const listeners: Record<string, Function[]> = {};
  // centred on the dataset at the zoom whose 1400×900 viewport holds all of it
  const state = { center: [10, 62] as [number, number], zoom: 5, style: '' as any, size: [1400, 900] };
  const W = 1400, H = 900, TILE = 512;
  const scale = () => TILE * Math.pow(2, state.zoom);
  const proj = ([lng, lat]: [number, number]) => {
    const s = scale(), x = (lng + 180) / 360 * s;
    const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI)) * s;
    return { x, y };
  };
  const map: any = {
    project: (ll: [number, number]) => { const p = proj(ll), c = proj(state.center); return { x: p.x - c.x + W / 2, y: p.y - c.y + H / 2 }; },
    unproject: () => ({ lng: state.center[0], lat: state.center[1] }),
    getZoom: () => state.zoom, getCenter: () => ({ lng: state.center[0], lat: state.center[1] }),
    getBounds: () => {
      const s = scale(), c = proj(state.center);
      const lng = (x: number) => x / s * 360 - 180;
      const lat = (y: number) => (Math.atan(Math.exp((0.5 - y / s) * 2 * Math.PI)) * 4 / Math.PI - 1) * 90;
      const w = lng(c.x - W / 2), e = lng(c.x + W / 2), n = lat(c.y - H / 2), so = lat(c.y + H / 2);
      return { getWest: () => w, getEast: () => e, getNorth: () => n, getSouth: () => so, toArray: () => [[w, so], [e, n]] };
    },
    fitBounds: () => map, jumpTo: (o: any) => { if (o.center) state.center = o.center; if (o.zoom != null) state.zoom = o.zoom; return map; },
    easeTo: (o: any) => map.jumpTo(o), flyTo: (o: any) => map.jumpTo(o), panBy: () => map,
    zoomIn: () => { state.zoom++; return map; }, zoomOut: () => { state.zoom--; return map; },
    resize: () => map, isMoving: () => false, loaded: () => true, remove: () => {},
    setStyle: (s: any) => { state.style = s; return map; }, getStyle: () => state.style,
    getContainer: () => el, getCanvasContainer: () => canvasContainer, getCanvas: () => canvas,
    addControl: (c: any, pos = 'top-right') => { corners[pos].appendChild(c.onAdd(map)); return map; },
    removeControl: (c: any) => { c.onRemove?.(); return map; },
    on: (e: string, f: Function) => { (listeners[e] ??= []).push(f); return map; },
    off: () => map, once: (e: string, f: Function) => map.on(e, f),
    fire: (e: string, d?: any) => { for (const f of listeners[e] ?? []) f(d); },
    _state: state,
  };
  if (!mini) S.map = map;
  return map;
}

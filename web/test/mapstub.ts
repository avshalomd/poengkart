// Leaflet and leaflet.markercluster are loaded by test/setup.ts, for every
// test file: this one only stubs the map object itself.
import { S } from '../src/state';

/** Only what the render functions call on the map between two frames. */
export function stubMap(): any {
  const listeners: Record<string, Function[]> = {};
  // Leaflet's own container, so a stray deferred reveal() finds a real element
  // even after setup.ts has replaced the body.
  const container = document.getElementById('map') || document.createElement('div');
  const map = {
    getZoom: () => 7, setZoom: () => map, setView: () => map, fitBounds: () => map, flyTo: () => map,
    flyToBounds: () => map, panTo: () => map, panInside: () => map,
    getBounds: () => ({ contains: () => true, pad: () => ({}) }), getCenter: () => ({ lat: 62, lng: 10 }),
    getSize: () => ({ x: 1400, y: 900 }), invalidateSize: () => map,
    getContainer: () => document.getElementById('map') || container,
    getBoundsZoom: () => 7,
    on: (e: string, f: Function) => { (listeners[e] ??= []).push(f); return map; }, off: () => map, once: () => map,
    fire: (e: string, d?: any) => { for (const f of listeners[e] ?? []) f(d); }, hasLayer: () => false,
    removeLayer: () => map, addLayer: () => map,
    attributionControl: { options: { prefix: '' }, setPrefix() {} }, zoomControl: { getContainer: () => document.createElement('div') },
    // where L.Control.addTo() puts a control's container (the locate button)
    _controlCorners: Object.fromEntries(['topleft', 'topright', 'bottomleft', 'bottomright']
      .map(k => [k, document.createElement('div')])),
    latLngToContainerPoint: () => ({ x: 0, y: 0 }), containerPointToLatLng: () => ({ lat: 0, lng: 0 }),
  };
  S.map = map as any;   // only what the render functions call between two frames
  return map;
}

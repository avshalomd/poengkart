import { describe, it, expect } from 'vitest';
import { pinStyle, ATTRIBUTION } from '../../../tools/vendor-map-styles.mjs';

const style = {
  version: 8,
  sources: { carto: { type: 'vector', url: 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json' } },
  glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.basemaps.cartocdn.com/gl/voyager-gl-style/sprite',
  layers: [{ id: 'background', type: 'background' }],
};
const tilejson = {
  tiles: ['https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt',
          'https://tiles-b.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt'],
  minzoom: 0, maxzoom: 14,
};

describe('pinning a CARTO style', () => {
  it('inlines the tile templates with the key, keeps fonts and sprites, and sets the app\'s attribution', () => {
    const out = pinStyle(style, tilejson, 'k123');
    const src: any = out.sources.carto;
    expect(src.url).toBeUndefined();
    expect(src.tiles).toEqual(tilejson.tiles.map(u => u + '?key=k123'));
    expect(src.minzoom).toBe(0);
    expect(src.maxzoom).toBe(14);
    expect(src.attribution).toBe(ATTRIBUTION);
    expect(ATTRIBUTION).toContain('openstreetmap.org/copyright');
    expect(ATTRIBUTION).toContain('carto.com/attributions');
    expect(out.glyphs).toBe(style.glyphs);
    expect(out.sprite).toBe(style.sprite);
    expect(out.layers).toEqual(style.layers);
    expect(style.sources.carto).toHaveProperty('url');   // the input is not mutated
  });
});

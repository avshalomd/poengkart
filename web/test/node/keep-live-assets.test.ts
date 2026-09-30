import { describe, it, expect } from 'vitest';
// @ts-ignore: a plain .mjs tool without types
import { refs } from '../../../tools/keep-live-assets.mjs';

describe('the live files a build carries over', () => {
  it('reads the stylesheet and script a page links', () => {
    const html = `<link rel="stylesheet" href="/assets/Base.BEZwj0on.css">
      <script type="module" src="/assets/Base.astro_astro_type_script_index_0_lang.DdssibS1.js"></script>
      <link rel="icon" href="/favicon.svg"><a href="/akershus/asker">Asker</a>`;
    expect(refs(html).sort()).toEqual([
      '/assets/Base.BEZwj0on.css',
      '/assets/Base.astro_astro_type_script_index_0_lang.DdssibS1.js',
    ]);
  });
  it('follows a module to MapLibre and MapLibre to its sibling', () => {
    expect(refs('import"/maplibre/6.10.0/maplibre-gl.mjs";')).toEqual(['/maplibre/6.10.0/maplibre-gl.mjs']);
    expect(refs('import{a}from"./maplibre-gl-shared.mjs";', '/maplibre/6.10.0/maplibre-gl.mjs'))
      .toEqual(['/maplibre/6.10.0/maplibre-gl-shared.mjs']);
  });
  it('leaves source maps and anything outside the immutable folders alone', () => {
    expect(refs('//# sourceMappingURL=Base.x.js.map\n"/data/schools.json" "/assets/Base.x.js.map"')).toEqual([]);
  });
});

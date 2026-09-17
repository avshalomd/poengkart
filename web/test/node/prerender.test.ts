import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../../src/data';
import { fillShell, schoolHead } from '../../src/prerender';
import { esc, slug, schoolPath } from '../../src/helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(path.join(here, '../../src/shell.html'), 'utf8');

describe('the build, with no DOM', () => {
  it('imports the templates and fills the shell for every school', () => {
    expect(typeof window).toBe('undefined');
    const data = loadDataset();
    expect(data.schools.length).toBeGreaterThan(200);
    for (const s of data.schools) {
      const html = fillShell(shell, s, data);
      expect(html).toContain('<aside id="side" class="open">');
      expect(html).toContain(`<h2>${esc(s.name)}</h2>`);
      expect(html.length).toBeGreaterThan(shell.length);
    }
  });
  it('every anchor still exists in the shell', () => {
    for (const a of ['<div class="photo" id="s-photo"></div>', '<div class="meta" id="s-meta"></div>', '<div class="notes" id="s-notes" hidden></div>',
                     '<div class="hero" id="s-hero"></div>', '<div class="mixwarn" id="s-mix" hidden></div>', '<div id="s-list"></div>', '<div id="src-note"></div>', '<aside id="side">'])
      expect(shell).toContain(a);
  });
  it('paths and heads are consistent', () => {
    const s = loadDataset().schools[0];
    expect(schoolHead(s).canonical.endsWith(schoolPath(s))).toBe(true);
    expect(schoolPath(s)).toBe('/' + slug(s.fylke) + '/' + slug(s.name));
  });
});

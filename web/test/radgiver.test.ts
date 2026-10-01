import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures } from './fixtures';
import { initHelpers } from '../src/helpers';
import { md } from '../src/radgiver';

// The chat prints a model's words into the page: md() is the only door, so
// it must let through the page's own school links and the official sites
// and nothing else.
describe('the chat renders a small, safe Markdown', () => {
  beforeAll(() => { loadFixtures(); initHelpers(); });

  it('escapes HTML a model or a reader might write', () => {
    expect(md('<img src=x onerror=alert(1)> **ok**')).toBe('<p>&lt;img src=x onerror=alert(1)&gt; <strong>ok</strong></p>');
  });
  it('links a school that exists, even with a stray space, and keeps it in the app', () => {
    const a = '<p><a href="/akershus/asker" data-school="/akershus/asker">Asker</a></p>';
    expect(md('[Asker]( /akershus/asker)')).toBe(a);
    expect(md('[Asker](\\/akershus\\/asker)')).toBe(a);
  });
  it('mends a school path spelt with the name\'s own letters', () => {
    expect(md('[Bjørnholt](/oslo/bjørnholt-videregående-skole)'))
      .toContain('href="/oslo/bjornholt-videregaende-skole" data-school="/oslo/bjornholt-videregaende-skole"');
  });
  it('drops a link to a school that does not exist, or to any other site', () => {
    expect(md('[Galtvort](/oslo/galtvort)')).toBe('<p>Galtvort</p>');
    expect(md('[vigo](https://vigo.no.evil.example/login)')).toBe('<p>vigo</p>');
    expect(md('[x](javascript:alert(1))')).not.toContain('<a');
    expect(md('[x](http://www.vilbli.no)')).toBe('<p>x</p>');
  });
  it('opens an official site in a new tab', () => {
    expect(md('[vilbli](https://www.vilbli.no/nb/)')).toContain('href="https://www.vilbli.no/nb/" target="_blank" rel="noopener">vilbli ↗</a>');
  });
  it('links a bare official address in a new tab, and leaves any other as text', () => {
    expect(md('Se https://www.vilbli.no.')).toBe('<p>Se <a href="https://www.vilbli.no/" target="_blank" rel="noopener">https://www.vilbli.no ↗</a>.</p>');
    expect(md('Se https://evil.example/vigo')).toBe('<p>Se https://evil.example/vigo</p>');
    expect(md('[https://www.vigo.no](https://www.vigo.no)').match(/<a /g)).toHaveLength(1);
  });
  it('draws bullets and numbered lists', () => {
    expect(md('Svar:\n- en\n- to\n\n1. første')).toBe('<p>Svar:</p><ul><li>en</li><li>to</li></ul><ol><li>første</li></ol>');
  });
});

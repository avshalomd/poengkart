import { describe, it, expect } from 'vitest';
import { GET } from '../../src/pages/llms.txt.ts';
import { loadDataset } from '../../src/data';

describe('llms.txt', () => {
  it('names the site, its numbers and its page patterns, from the dataset', async () => {
    const res = await GET({} as any);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    const t = await res.text(), data = loadDataset();
    expect(t.startsWith('# Poengkart\n\n> ')).toBe(true);
    expect(t).toContain(`${data.schools.length} schools`);
    expect(t).toContain('https://poengkart.no/akershus/asker');
    expect(t).toContain('](https://poengkart.no/report)');
    expect(t).not.toMatch(/undefined|NaN/);
  });
});

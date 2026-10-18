import { describe, it, expect } from 'vitest';
import { GET } from '../../src/pages/sitemap.xml.ts';   // the extension is part of the name: `sitemap.xml` alone would be looked up as a file
import { loadDataset } from '../../src/data';

describe('sitemap.xml', () => {
  it('lists the home, the report, every county and every school, once each', async () => {
    const res = await GET({} as any);
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const data = loadDataset();
    expect(locs.length).toBe(data.schools.length + data.counties.length + 2);
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs[0]).toBe('https://poengkart.no/');
    expect(locs[1]).toBe('https://poengkart.no/report');
    expect(locs).toContain('https://poengkart.no/akershus/asker');
    expect(locs).toContain('https://poengkart.no/akershus');
    expect(xml).not.toContain('<lastmod>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

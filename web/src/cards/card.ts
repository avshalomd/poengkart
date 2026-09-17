/* One share card per school, drawn at build time: satori lays out a small
   flex tree with the app's face and colours and emits SVG; resvg (wasm, no
   native binary) rasterises it. The hero figure is meanStep's, the same
   statistic the sheet and the dot show, and the line is that mean year by
   year. Nothing here runs in the browser. */
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
// The two faces come in through Vite, not off disk: Astro bundles this module
// into web/dist/.prerender/chunks, where a path anchored on import.meta.url
// points at the chunk and the fonts are not beside it (data.ts carries the
// same note about the dataset). `?inline` hands each file over as a data URI,
// so the face travels inside the build and nothing extra is published.
import regularTtf from './InstrumentSans-Regular.ttf?inline';
import boldTtf from './InstrumentSans-Bold.ttf?inline';
import { S } from '../state';
import { capFirst, shownPrograms, yearMeans } from '../helpers';
import { heroCells } from '../templates';
import type { School } from '../types';

const require = createRequire(import.meta.url);
const ttf = (dataUri: string) => Buffer.from(dataUri.slice(dataUri.indexOf(',') + 1), 'base64');
const W = 1200, H = 630;
// the app's light palette, web/src/styles/app.css :root (a card is a static
// image: it cannot follow the reader's theme, so it is the light one)
const BG = '#f4f6f9';      // --page
const INK = '#0f1720';     // --ink
const MUTED = '#46525e';   // --ink-2
const ACCENT = '#2876d4';  // --accent
const UP = '#0b7f0b';      // --good: .hero .cell .v.up
const DOWN = '#46525e';    // --ink-2: .hero .cell .v.dn

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[] | null = null;
let wasm: Promise<void> | null = null;
async function ready() {
  fonts ??= [
    { name: 'Instrument Sans', data: ttf(regularTtf), weight: 400, style: 'normal' },
    { name: 'Instrument Sans', data: ttf(boldTtf), weight: 700, style: 'normal' },
  ];
  // the package's exports map may not expose the .wasm path; its directory does
  wasm ??= initWasm(readFileSync(path.join(path.dirname(require.resolve('@resvg/resvg-wasm')), 'index_bg.wasm')));
  await wasm;
}

type Node = { type: string; props: Record<string, any> };
const el = (type: string, style: Record<string, any>, children?: any, extra: Record<string, any> = {}): Node =>
  ({ type, props: { style, children, ...extra } });

function sparkline(points: [string, number][]): string {
  const w = 480, h = 200, pad = 12;
  if (points.length < 2) return '';
  const ys = points.map(p => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - lo) / span) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<path d="${d}" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="9" fill="${ACCENT}"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// The sheet's hero cells, as the card shows them: the first cell is the figure
// (or its label when there is no mean), a middle cell exists only when there is
// a change to report, the last is the programme count the card does not show.
export function heroFigures(s: School): { value: string; label: string; delta: string; deltaColor: string } {
  const cells = heroCells(s, null);
  const first = cells[0], change = cells.length === 3 ? cells[1] : null;
  return {
    value: String(first.v),
    label: capFirst(first.l),
    delta: change ? `${change.v} · ${capFirst(change.l)}` : '',
    deltaColor: change?.cls === 'up' ? UP : change?.cls === 'dn' ? DOWN : MUTED,
  };
}

export function cardTree(s: School): Node {
  S.lang = 'no';
  const h = heroFigures(s);
  const line = sparkline(yearMeans(shownPrograms(s)));
  const nameSize = s.name.length > 30 ? 48 : 60;
  // A figure is four characters. Where a school has no mean, the sheet's own
  // label stands in the figure's place and that is prose — «Ingen venteliste»,
  // «2 fullt uten poeng · 4 ingen venteliste» — which at the figure's size ran
  // off the card and shoved the line out of it. So a label steps down a size,
  // a long one steps down again, and the line keeps its width whatever the
  // text does.
  const valueSize = h.value.length <= 8 ? 96 : h.value.length <= 20 ? 56 : 40;
  return el('div', { width: W, height: H, display: 'flex', flexDirection: 'column', padding: '56px 64px', background: BG, color: INK, fontFamily: 'Instrument Sans' }, [
    el('div', { display: 'flex', fontSize: 28, fontWeight: 700, color: ACCENT }, 'Poengkart'),
    el('div', { display: 'flex', fontSize: nameSize, fontWeight: 700, lineHeight: 1.1, marginTop: 24 }, s.name),
    el('div', { display: 'flex', fontSize: 28, color: MUTED, marginTop: 10 }, s.fylke),
    el('div', { display: 'flex', flexGrow: 1 }),
    el('div', { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }, [
      el('div', { display: 'flex', flexDirection: 'column', flexShrink: 1, maxWidth: line ? 560 : W - 128 }, [
        el('div', { display: 'flex', fontSize: 24, color: MUTED }, h.label),
        el('div', { display: 'flex', fontSize: valueSize, fontWeight: 700, lineHeight: 1.1 }, h.value),
        ...(h.delta ? [el('div', { display: 'flex', fontSize: 30, color: h.deltaColor, marginTop: 8 }, h.delta)] : []),
      ]),
      ...(line ? [el('img', { width: 480, height: 200, flexShrink: 0 }, undefined, { src: line, width: 480, height: 200 })] : []),
    ]),
    el('div', { display: 'flex', fontSize: 22, color: MUTED, marginTop: 28 }, 'poengkart-no.vercel.app'),
  ]);
}

export async function renderCard(s: School): Promise<Uint8Array> {
  await ready();
  const svg = await satori(cardTree(s) as any, { width: W, height: H, fonts: fonts! });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

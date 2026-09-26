import { chartMode, esc, sheetLens, fmt, HELD_OUT, isPoints, zeroIsFill, levelScope, meanOf, numericLatest, openMix, progName, shownPrograms, visibleIn } from "./helpers";
import { CATS, t } from "./i18n";
import { renderList } from "./programs";
import { setSheetLens } from "./sidebar";
import { S } from './state';

/* ================= chart (3 resolution levels) ================= */
export function seriesFor(mode, cat, prog) {
  const progs = mode === 'prog' ? [prog]
    : mode === 'cat' ? shownPrograms(S.current).filter(p => p.category === cat)
    : shownPrograms(S.current);
  return progs.filter(p => Object.values(p.values).some(isPoints));
}
export function renderChartCard() {
  // tabs
  const tabs = document.querySelectorAll('#tabs button');
  tabs[0].textContent = t('tabAll'); tabs[1].textContent = t('tabCat'); tabs[2].textContent = t('tabProg');
  tabs.forEach((b: any) => {
    const on = b.dataset.mode === chartMode();
    b.classList.toggle('on', on);
    // every other toggle in the app says which one is chosen; this one only
    // said it in colour, so a screen reader heard three identical buttons
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.onclick = () => {
      if (b.dataset.mode === 'all') {
        S.chart.prog = null;
        setSheetLens('all');
      } else if (b.dataset.mode === 'cat') {
        S.chart.prog = null;
        // from the programmes the hero and the list count, not the unfiltered set:
        // Elvebakken's default landed on a programme its own hero called "tilbys ikke her"
        const present = [...new Set(shownPrograms(S.current).map(p => p.category))];
        const lens = sheetLens();
        setSheetLens(lens !== 'all' && present.includes(lens) ? lens
          : present.includes(S.mapCat) ? S.mapCat : present[0]);
      } else {
        const pool = levelScope(S.current!.programs).filter(p => sheetLens() === 'all' || p.category === sheetLens());
        S.chart.prog = pool.find(p => numericLatest(p.values)) || pool[0] || null;
        renderChartCard(); renderList();
      }
    };
  });
  // category select inside chart
  const cs: any = document.getElementById('chart-cat');
  if (chartMode() === 'cat') {
    const present = [...new Set(levelScope(S.current!.programs).map(p => p.category))];
    if (!present.includes(sheetLens())) present.push(sheetLens());   // lens the school lacks
    cs.hidden = false;
    cs.setAttribute('aria-label', t('tabCat'));   // a <select> has no placeholder to fall back on
    cs.innerHTML = present.map((c: any) => `<option value="${c}">${CATS[c][S.lang]}</option>`).join('');
    cs.value = sheetLens();
    cs.onchange = () => setSheetLens(cs.value);
  } else cs.hidden = true;
  drawChart();
}

export function drawChart() {
  // a chart must span the school's own years: Akershus and Trøndelag publish
  // one year, and nine mostly-empty columns read as a broken chart
  const own = [...new Set(shownPrograms(S.current).flatMap(p => Object.keys(p.values)))].sort() as string[];
  const allYears = S.DATA!.years.map(String);
  const years = own.length > 1
    ? allYears.filter(y => y >= own[0] && y <= own[own.length - 1])
    : own;
  const W = 444, H = 190, ML = 30, MR = 12, MT = 16, MB = 22;
  const iw = W - ML - MR, ih = H - MT - MB;
  const series = seriesFor(chartMode(), sheetLens(), S.chart.prog);
  document.getElementById('chart-tip')!.style.display = 'none';  // stale on redraw
  const svgHost = document.getElementById('chart-svg');
  const dataEl = document.getElementById('chart-data');
  if (dataEl) dataEl.innerHTML = '';
  svgHost!.onkeydown = null;
  svgHost!.tabIndex = -1;               // nothing to step through until a line is drawn
  if (years.length < 2) {
    document.getElementById('chart-sub')!.textContent =
      t('oneYearOnly', years[0] || '');
    svgHost!.innerHTML = '';
    return;
  }
  // seriesFor() drops every programme with no numeric cell, so a selection that
  // is entirely `open`, F or D leaves nothing to draw. The old code carried on
  // and printed "0 programområder" over a bare grid — directly contradicting
  // the hero above, which counts the same programmes unfiltered and says 1.
  // The years.length guard above does not catch it: that measures the whole
  // school's span, not the selected category's.
  if (!series.length) {
    // a lens the school does not run at all is "tilbys ikke her", as the hero says,
    // not "everyone who applied got in"
    const lens = sheetLens();
    const offered = lens === 'all' || shownPrograms(S.current).some(p => p.category === lens);
    document.getElementById('chart-sub')!.textContent = offered ? t('chartNoPoints') : `${CATS[lens][S.lang]} · ${t('notOffered')}`;
    svgHost!.innerHTML = '';
    return;
  }

  // the y-domain follows the data: a fixed 10-50 window flattened every school
  // whose thresholds run above 50 (Sauda ambulansefag sits at 51-54)
  const nums = series.flatMap(p => Object.values(p.values).filter(isPoints));
  let LO = 10, HI = 50;
  if (nums.length) {
    LO = Math.max(0, Math.floor((Math.min(...nums) - 3) / 5) * 5);
    HI = Math.ceil((Math.max(...nums) + 3) / 5) * 5;
    if (HI - LO < 20) { LO = Math.max(0, HI - 20); HI = LO + 20; }
  }
  const step = (HI - LO) > 45 ? 20 : 10;
  const ticks: number[] = [];
  for (let g = Math.ceil(LO / step) * step; g <= HI; g += step) ticks.push(g);
  const x = i => ML + i * iw / (years.length - 1);
  const y = v => MT + ih - (Math.min(Math.max(v, LO), HI) - LO) * ih / (HI - LO);
  const sub = document.getElementById('chart-sub');
  // The chart's own scope, counted the way the hero and the list count rows:
  // series.length only counts the programme areas that HAVE a poenggrense to
  // plot, so printing it bare put a smaller number under the hero's larger one
  // with nothing to say the two were counting different things.
  const chartScope = chartMode() === 'cat'
    ? shownPrograms(S.current).filter(p => p.category === sheetLens()) : shownPrograms(S.current);
  const scopeN = visibleIn(chartScope);
  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]);
  // a held-out county's numbers are not poenggrenser, and the note right above
  // this caption says so: the caption must not assert one either
  const held = HELD_OUT.has(S.current!.fylke);
  sub!.textContent = chartMode() === 'prog'
    ? `${S.chart.prog ? progName(S.chart.prog) + ' · ' : ''}${t('chartSubProg')}`
    : chartMode() === 'cat' ? t(held ? 'chartSubCatHeld' : 'chartSubCat', series.length, scopeN, span)
                            : t(held ? 'chartSubAllHeld' : 'chartSubAll', series.length, scopeN, span);
  if (chartMode() !== 'prog') {
    const cy = [...new Set(series.flatMap(p => Object.keys(p.values)))].sort().pop();
    const cm = openMix(chartScope, cy);
    if (cm.mostly) sub!.textContent += ` · ⚠ ${t('mostlyOpenShort')}`;
  }

  // The mean of the same cells the dot and the headline use, so the figure
  // above the chart sits exactly on this line's last point and the change is
  // its last step. 0,0 stays out: it is not a height on a points axis.
  const mid = {}, cnt = {};
  years.forEach(yr => {
    const vals = series.map(p => p.values[yr]).filter(isPoints);
    if (vals.length) { mid[yr] = meanOf(vals); cnt[yr] = vals.length; }
  });

  let svg = '';
  // grid + y labels
  for (const gy of ticks) {
    svg += `<line x1="${ML}" y1="${y(gy)}" x2="${W - MR}" y2="${y(gy)}" stroke="var(--line)" stroke-width="1"/>` +
           `<text x="${ML - 6}" y="${y(gy) + 3}" font-size="10.5" fill="var(--ink-3)" text-anchor="end">${gy}</text>`;
  }
  years.forEach((yr, i) => {
    svg += `<text x="${x(i)}" y="${H - 6}" font-size="10.5" fill="var(--ink-3)" text-anchor="middle">${yr.slice(2)}</text>`;
  });

  const lineOf = (p, stroke, width, op) => {
    let segs: string[][] = [], run: string[] = [];
    years.forEach((yr, i) => {
      const v = p.values[yr];
      if (isPoints(v)) run.push(`${x(i)},${y(v)}`);
      else if (run.length) { segs.push(run); run = []; }
    });
    if (run.length) segs.push(run);
    return segs.filter(r => r.length > 1).map(r =>
      `<polyline points="${r.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${op}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  };

  if (S.chart.prog) {
    const p = S.chart.prog;
    svg += lineOf(p, 'var(--accent)', 2.5, 1);
    years.forEach((yr, i) => {
      const v = p.values[yr];
      if (isPoints(v))
        svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="var(--accent)" stroke="var(--surface-solid)" stroke-width="1.5"/>`;
      else if (v === 'open' || v === 0)   // neither is a height on this axis
        svg += `<circle cx="${x(i)}" cy="${y(LO)}" r="4" fill="var(--surface-solid)" stroke="var(--ink-3)" stroke-width="1.6"/>`;
    });
    const l = numericLatest(p.values);
    if (l) svg += `<text x="${x(years.indexOf(l[0])) - 8}" y="${Math.max(y(l[1]) - 9, MT - 3)}" font-size="11" font-weight="700" fill="var(--ink)" text-anchor="middle">${fmt(l[1])}</text>`;
  } else {
    for (const p of series) svg += lineOf(p, 'var(--context)', 1.4, .55);
    svg += lineOf({ values: mid }, 'var(--accent)', 2.6, 1);
    years.forEach((yr, i) => {
      if (mid[yr] != null)
        svg += `<circle cx="${x(i)}" cy="${y(mid[yr])}" r="3.6" fill="var(--accent)" stroke="var(--surface-solid)" stroke-width="1.4"/>`;
    });
  }
  svg += `<line id="xh" x1="0" x2="0" y1="${MT}" y2="${MT + ih}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  document.getElementById('chart-svg')!.innerHTML =
    `<svg id="the-chart" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${svg}</svg>`;

  // crosshair + tooltip
  const svgEl = document.getElementById('the-chart');
  const tip = document.getElementById('chart-tip');
  const xh: any = svgEl!.querySelector('#xh');
  // The year-by-year figures were bound to mousemove alone, so on a phone the
  // numbers behind the school's headline chart could not be reached at all —
  // against this file's own rule that touch gets whatever hover gets. One
  // reader takes a clientX/clientY from either kind of event.
  // one sentence per year, for the tooltip, the keyboard and the table alike
  const bodyAt = yr => {
    if (S.chart.prog) {
      const v = S.chart.prog.values[yr];
      return v === undefined ? '–'
        : isPoints(v) ? `${fmt(v)} ${t('pts')}`
        : v === 0 ? (zeroIsFill(S.current?.fylke, yr) ? t('noPoints') : `${fmt(0)} ${t('pts')}`)
        : v === 'open' ? t('allIn') : v === 'F' ? t('priority')
        : v === 'D' ? t('docAdm') : t('gone');
    }
    return mid[yr] != null ? `${t('midLabel')} ${fmt(mid[yr])} · ${cnt[yr]} ${t('series', cnt[yr])}` : '–';
  };
  let at = -1;                          // the year the crosshair stands on
  const readAt = ev => {
    const r = svgEl!.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * W / r.width;
    let bi = 0, bd = 1e9;
    years.forEach((yr, i) => { const d = Math.abs(x(i) - sx); if (d < bd) { bd = d; bi = i; } });
    show(bi, ev);
  };
  const show = (bi, ev) => {
    const yr = years[bi];
    at = bi;
    xh.setAttribute('x1', x(bi)); xh.setAttribute('x2', x(bi)); xh.setAttribute('visibility', 'visible');
    tip!.innerHTML = `<span class="y">${yr}</span> <span class="r">${bodyAt(yr)}</span>`;
    tip!.style.display = 'block';
    // In the wrap's own lengths: at Stor and Ekstra stor the sheet is zoomed, so
    // a viewport offset written as style.left was drawn 15-30% further right.
    // And flip by the tip's real width, 142-276px: a fixed 130 let
    // «15 programområder» run off the sheet.
    const wrapEl = document.getElementById('chart-wrap'), wrap = wrapEl!.getBoundingClientRect();
    const z = wrap.width / wrapEl!.offsetWidth || 1, cx = (ev.clientX - wrap.left) / z, tw = tip!.offsetWidth;
    let px = cx + 14;
    if (px + tw > wrapEl!.offsetWidth - 4) px = Math.max(4, cx - 14 - tw);
    tip!.style.left = px + 'px';
    tip!.style.top = ((ev.clientY - wrap.top) / z - 34) + 'px';
  };
  const clear = () => { tip!.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); at = -1; };
  // The keyboard walks the same crosshair: ← → a year at a time, Home and End
  // to the ends, Escape to put it away. The host is rebuilt on every redraw,
  // so the handler is assigned, not added.
  const [colYear, colFig] = t('chartDataCols');
  document.getElementById('chart-keys')!.textContent = t('chartKeys');
  if (dataEl) dataEl.innerHTML = `<caption>${esc(t('chartData'))}</caption>` +
    `<thead><tr><th scope="col">${esc(colYear)}</th><th scope="col">${esc(colFig)}</th></tr></thead><tbody>` +
    years.map(yr => `<tr><th scope="row">${yr}</th><td>${esc(bodyAt(yr))}</td></tr>`).join('') + `</tbody>`;
  svgHost!.tabIndex = 0;
  svgHost!.onkeydown = ev => {
    if (ev.key === 'Escape' && at >= 0) { clear(); ev.stopPropagation(); return; }
    const to = ev.key === 'ArrowRight' ? Math.min(years.length - 1, at + 1)
      : ev.key === 'ArrowLeft' ? (at < 0 ? years.length - 1 : Math.max(0, at - 1))
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? years.length - 1 : -1;
    if (to < 0) return;
    ev.preventDefault();
    const r = svgEl!.getBoundingClientRect();
    show(to, { clientX: r.left + x(to) * r.width / W, clientY: r.top + r.height * .45 });
  };
  svgHost!.onblur = clear;
  svgEl!.addEventListener('mousemove', readAt);
  svgEl!.addEventListener('mouseleave', clear);
  // preventDefault keeps the drag from scrolling the panel while a finger is
  // reading along the line; the touch lingers a moment after release so the
  // number can actually be read
  const touchRead = ev => {
    if (!ev.touches.length) return;
    ev.preventDefault();
    readAt(ev.touches[0]);
  };
  svgEl!.addEventListener('touchstart', touchRead, { passive: false });
  svgEl!.addEventListener('touchmove', touchRead, { passive: false });
  svgEl!.addEventListener('touchend', () => setTimeout(clear, 2500), { passive: true });
}

export function initChart() {
}

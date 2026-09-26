/* Poengkart figure invariants — paste whole into the Browser pane console
   (mcp__Claude_Browser__javascript_tool) with the app loaded. See ../SKILL.md.

   It calls the app's OWN helpers (meanOf, isPoints, round1, schoolPressure,
   openMix, visibleIn, numericLatest, shownPrograms, and for the forecast
   layer predFor, chanceOf, schoolChance, and for the level scope levelScope,
   isVg1) and reads the REAL rendered panel, so it
   cannot drift from the code the way a copied harness does. chartOf() is the
   single piece mirrored from drawChart(); if that function's year window or
   line changes, change it here too.

   Runtime ~20s for 191 schools. Green output is one line. */
(async () => {
  for (let i = 0; i < 60; i++) {
    try { if (DATA && DATA.schools && typeof openMix === 'function') break; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  const fail = [], hit = {};
  const say = (id, ok, d) => { hit[id] = (hit[id] || 0) + 1; if (!ok) fail.push(`${id}  ${d}`); };
  // independent oracle: exact one-decimal rounding via integer hundredths.
  // Deliberately NOT the app's method — a fix validated by its own assumption
  // is not validated (this is how the toPrecision(15) rounding shipped broken).
  const exact1 = v => { const h = Math.round(v * 100), s = h < 0 ? -1 : 1; return s * Math.round(Math.abs(h) / 10) / 10; };
  const num = el => el ? Number(el.textContent.replace(/[+\s]/g, '').replace('\u2212', '-').replace(',', '.')) : NaN;
  const chartOf = s => {                       // mirrors drawChart()'s year window + bold line
    const shown = shownPrograms(s);            // the app's own recency filter
    const own = [...new Set(shown.flatMap(p => Object.keys(p.values)))].sort();
    const all = DATA.years.map(String);
    const years = own.length > 1 ? all.filter(y => y >= own[0] && y <= own[own.length - 1]) : own;
    const series = shown.filter(p => Object.values(p.values).some(isPoints));
    const line = {};
    years.forEach(y => { const v = series.map(p => p.values[y]).filter(isPoints); if (v.length) line[y] = meanOf(v); });
    return { line, plotted: years.filter(y => line[y] != null) };
  };
  // the forecast layer must not touch I1-I7: run them with points off, then
  // check the chance figures on their own (I8-I10) with points on
  // measured on the shipping default: Vg1 only (I17 flips the scope itself)
  const wasCat = mapCat, wasPts = myPoints, wasLv = allLevels; mapCat = 'all'; myPoints = null; allLevels = false;
  for (const s of DATA.schools) {
    const progsShown = shownPrograms(s);
    const yrs = [...new Set(progsShown.flatMap(p => Object.keys(p.values)))].sort();
    const latest = yrs[yrs.length - 1];
    const hero = meanOf(progsShown.map(p => p.values[latest]).filter(isPoints));
    const { line, plotted } = chartOf(s);

    // I1 — every figure printed is the exact one-decimal rounding of its value
    for (const y of yrs) {
      const m = meanOf(s.programs.map(p => p.values[y]).filter(isPoints));
      if (m !== null) say('I1', round1(m) === exact1(m), `${s.name} ${y}: prints ${round1(m)}, exact ${exact1(m)}`);
    }

    // I7 — a 0,0 never reaches a points figure (it filled up; it is not a threshold to plot)
    for (const p of s.programs) {
      const nl = numericLatest(p.values);
      say('I7', !nl || nl[1] > 0, `${s.name} ${p.program}: numericLatest -> ${nl && nl[1]}`);
      say('I7', !Object.values(p.values).some(v => v === 0 && isPoints(v)), `${s.name} ${p.program}: 0 passed isPoints`);
    }

    openSide(s);                                  // the real panel, not a model of it
    const cells = [...document.querySelectorAll('#s-hero .cell')];
    const vals = cells.map(c => c.querySelector('.v'));
    const shown = hero === null ? null : num(vals[0]);

    // I2 — the headline figure sits exactly on the chart line's last point
    if (hero !== null && plotted.length)
      say('I2', shown === round1(line[plotted[plotted.length - 1]]),
          `${s.name}: hero ${shown}, line ends ${round1(line[plotted[plotted.length - 1]])}`);

    // I3 — the change is that line's last step, and is absent when there is no step
    const dCell = cells.find(c => /endring|change/i.test(c.querySelector('.l').textContent));
    if (hero !== null && plotted.length > 1) {
      const step = round1(line[plotted[plotted.length - 1]] - line[plotted[plotted.length - 2]]);
      say('I3', !!dCell && num(dCell.querySelector('.v')) === step,
          `${s.name}: shows ${dCell && dCell.querySelector('.v').textContent}, step ${step}`);
    } else say('I3', !dCell, `${s.name}: change shown with no previous plotted year`);

    // I14 — the list's ENDRING is the same step as the hero's "endring fra" (the
    // list once compared like-for-like programmes and flipped sign on 30 schools)
    const listD = deltaFor(s, 'all', latest);
    if (hero !== null && plotted.length > 1)
      say('I14', listD === round1(line[plotted[plotted.length - 1]] - line[plotted[plotted.length - 2]]),
          `${s.name}: list ${listD}, hero step ${round1(line[plotted[plotted.length - 1]] - line[plotted[plotted.length - 2]])}`);
    else say('I14', listD === null, `${s.name}: list shows ${listD} with no step`);

    // I4 — the map dot agrees with the panel headline
    const st = schoolPressure(s, 'all');
    if (st.kind === 'points' && hero !== null && st.year === latest)
      say('I4', round1(st.v) === shown, `${s.name}: dot ${round1(st.v)}, hero ${shown}`);

    // I5 — the programme count equals the rows the list actually renders
    say('I5', num(vals[vals.length - 1]) === document.querySelectorAll('#s-list .prow').length,
        `${s.name}: hero says ${num(vals[vals.length - 1])}, list renders ${document.querySelectorAll('#s-list .prow').length}`);

    // I6 — the "most took everyone" note appears exactly when it should
    const mix = openMix(progsShown, latest);
    say('I6', document.getElementById('s-mix').hidden === !(mix.mostly && hero !== null),
        `${s.name}: note ${document.getElementById('s-mix').hidden ? 'absent' : 'shown'}, open ${mix.open}/${mix.total}`);
  }
  // ---- the forecast layer (data/model.json), with points on ----
  if (typeof MODEL !== 'undefined' && MODEL) {
    myPoints = 40;
    for (const s of DATA.schools) {
      const e = MODEL.schools[`${s.fylke}|${s.name}`];
      if (!e || !e.programs) continue;
      // I8 — every chance printed is a probability of the app's own formula,
      //      and more points never lower it
      for (const p of s.programs) {
        const pr = predFor(s, p);
        if (!pr) continue;
        const c30 = chanceOf(pr, 30), c40 = chanceOf(pr, 40), c50 = chanceOf(pr, 50);
        say('I8', c30 >= 0 && c50 <= 1 && c30 <= c40 + 1e-9 && c40 <= c50 + 1e-9,
            `${s.name} ${p.program}: ${c30.toFixed(3)} ${c40.toFixed(3)} ${c50.toFixed(3)}`);
      }
      // I9 — the dot's colour is the bucket of the best chance the panel lists,
      //      and the panel's counts add up to the chips rendered
      const ch = schoolChance(s, 'all', myPoints);
      openSide(s);
      const chips = [...document.querySelectorAll('#s-list .ch:not(.none)')];
      if (ch) {
        say('I9', chips.length === ch.n, `${s.name}: ${chips.length} chips, ${ch.n} forecasts`);
        const best = Math.max(...chips.map(c => parseInt(c.textContent)));
        say('I9', best === pct(ch.best), `${s.name}: best chip ${best}, best chance ${pct(ch.best)}`);
        const counts = { likely: 0, possible: 0, unlikely: 0 };
        chips.forEach(c => counts[[...c.classList].find(k => k.startsWith('b-')).slice(2)]++);
        say('I9', counts.likely === ch.likely && counts.possible === ch.possible && counts.unlikely === ch.unlikely,
            `${s.name}: chips ${JSON.stringify(counts)} vs ${ch.likely}/${ch.possible}/${ch.unlikely}`);
      } else say('I9', chips.length === 0, `${s.name}: chips without forecasts`);
      // I18 — a chip's band is the band of the figure it prints: read from the
      //       DOM against the legend's edges, since «35 %» was once drawn,
      //       counted and headlined as «under 35 %» (0,348 banded before rounding)
      chips.forEach(c => {
        const n = parseInt(c.textContent), cls = [...c.classList].find(k => k.startsWith('b-')).slice(2);
        const band = n >= Math.round(BANDS.likely * 100) ? 'likely' : n >= Math.round(BANDS.possible * 100) ? 'possible' : 'unlikely';
        say('I18', cls === band, `${s.name}: chip "${c.textContent}" is drawn ${cls}`);
      });
      // I10 — the chance block agrees with the chips
      const box = document.getElementById('s-chance');
      say('I10', !box.hidden, `${s.name}: chance block hidden with a forecast present`);
      if (ch) {
        const head = box.querySelector('.h').textContent;
        const n = ch.likely || ch.possible || ch.n;
        say('I10', head.includes(String(n)) && head.includes(String(ch.n)), `${s.name}: "${head}" vs ${ch.likely}/${ch.possible}/${ch.n}`);
      }
      // I15 — the final-round sentence: its "L av n" is counted over the same
      //       programme areas as the head (n is the head's n), L never drops
      //       below the published round's count, and the wording says
      //       "fortsatt" exactly when the count is unchanged
      const fb = ch && finalRoundBridge(s);
      if (fb) {
        const txt = box.textContent;
        const L3 = ch.progs.filter(p => bucketOf(chanceFinal(predFor(s, p), myPoints, p.category, fb)) === 'likely').length;
        const m = txt.match(/(\d+) av (\d+)\. Målt/);
        say('I15', !!m && +m[1] === L3 && +m[2] === ch.n, `${s.name}: note "${m && m[0]}" vs ${L3}/${ch.n}`);
        say('I15', L3 >= ch.likely, `${s.name}: final-round likely ${L3} below first-round ${ch.likely}`);
        const same = L3 === ch.likely;
        say('I15', txt.includes('fortsatt') === same && txt.includes('ikke sannsynlig') === (same && L3 === 0), `${s.name}: wording for L3=${L3}, L1=${ch.likely}`);
      }
    }
    // I12 — the choices list: counts and the at-least-one figure follow from the
    //       chips it shows, and a pick toggled on the row appears in the list
    myPoints = 40;
    const saved = choices.slice(); choices = [];
    const picks = [], vg1cats = new Set();
    for (const s of DATA.schools) {
      const p = shownPrograms(s).find(q => predFor(s, q)      // a pick the list can mark
        && (q.level !== 'Vg1' || vg1cats.has(q.category) || vg1cats.size < 3));
      if (p) { picks.push([s, p]); if (p.level === 'Vg1') vg1cats.add(p.category); }
      if (picks.length === 4) break;
    }
    picks.forEach(([s, p]) => toggleChoice(s, p));
    const rows = [...document.querySelectorAll('#choices .row')];
    say('I12', rows.length === picks.length, `${rows.length} rows for ${picks.length} picks`);
    const cs = picks.map(([s, p]) => chanceOf(predFor(s, p), myPoints));
    const want = { likely: 0, possible: 0, unlikely: 0 };
    cs.forEach(c => want[bucketOf(c)]++);
    const sumTxt = (document.querySelector('#choices .sum') || {}).textContent || '';
    say('I12', sumTxt.includes(`${want.likely} `) && sumTxt.includes(`${want.possible} `) && sumTxt.includes(`${want.unlikely} `),
        `sum "${sumTxt}" vs ${JSON.stringify(want)}`);
    // past CHANCE_CAP the line says «over 95 %» rather than a figure the
    // dependence between wishes cannot back
    const anyC = 1 - cs.reduce((a, c) => a * (1 - c), 1);
    const any = anyC > CHANCE_CAP ? pct(CHANCE_CAP) : pct(anyC);
    say('I12', (sumTxt.includes(`${any} %`) || sumTxt.includes(`${any}%`))
               && (anyC > CHANCE_CAP) === sumTxt.includes(t('choicesAnyOver', any)),
        `at-least-one ${any} not in "${sumTxt}"`);
    openSide(picks[0][0]);
    say('I12', document.querySelectorAll('#s-list .pick.on').length >= 1, 'picked row not marked in the list');
    // I13 — the list refuses what vigo would refuse: an 11th wish, or a 4th
    //       Vg1 utdanningsprogram — and says why
    const wishes = [];
    for (const s of DATA.schools) {
      for (const q of s.programs) {
        if (q.level === 'Vg1' || !predFor(s, q)) continue;
        wishes.push([s, q]); break;
      }
      if (wishes.length === 11) break;
    }
    if (wishes.length === 11) {
      choices = []; wishes.slice(0, 10).forEach(([s, q]) => toggleChoice(s, q));
      say('I13', choices.length === 10, `10 wishes gave ${choices.length}`);
      toggleChoice(...wishes[10]);
      say('I13', choices.length === 10 && !!document.querySelector('#choices .vnote'),
          `11th wish: length ${choices.length}, note ${!!document.querySelector('#choices .vnote')}`);
    }
    const cand = {};
    for (const s of DATA.schools)
      for (const q of s.programs)
        if (q.level === 'Vg1' && predFor(s, q) && !cand[q.category]) { cand[q.category] = [s, q]; break; }
    const four = Object.values(cand).slice(0, 4);
    if (four.length === 4) {
      choices = []; four.slice(0, 3).forEach(([s, q]) => toggleChoice(s, q));
      toggleChoice(...four[3]);
      say('I13', choices.length === 3 && !!document.querySelector('#choices .vnote'),
          `4th Vg1 programme: length ${choices.length}, note ${!!document.querySelector('#choices .vnote')}`);
    }
    // ...and rows the recency filter hides are disclosed, never silently gone
    const wasOld = showOld; showOld = false;
    const sOld = DATA.schools.find(x => levelScope(x.programs).some(q => !isRecent(q, x.fylke))
                                     && levelScope(x.programs).some(q => isRecent(q, x.fylke)));
    if (sOld) {
      openSide(sOld);
      const btn = document.querySelector('#s-list .oldnote');
      const nHid = levelScope(sOld.programs).length - shownPrograms(sOld).length;
      say('I13', !!btn && document.querySelectorAll('#s-list .prow').length ===
                 Number(document.querySelectorAll('#s-hero .cell:last-child .v')[0].textContent),
          `${sOld.name}: hidden rows without a disclosure line (${nHid} hidden)`);
      showOld = true; renderSide();
      say('I13', document.querySelectorAll('#s-list .prow').length === visibleIn(levelScope(sOld.programs))
                 && !!document.querySelector('#s-list .oldnote'),
          `${sOld.name}: showing history lost rows or the way back`);
    }
    // I17 — the level default: with the later years off, a school that
    //       publishes them lists only its Vg1 rows, discloses the rest with a
    //       way back, and its dot is the mean of those Vg1 rows alone; with
    //       them on, the rows appear and the way back to Vg1 is offered
    showOld = false; allLevels = false;
    const sL = DATA.schools.find(x => x.programs.some(isVg1)
                                   && x.programs.some(q => !isVg1(q) && isRecent(q, x.fylke)));
    if (sL) {
      openSide(sL);
      const rows = document.querySelectorAll('#s-list .prow').length;
      say('I17', rows === visibleIn(shownPrograms(sL))
                 && ![...document.querySelectorAll('#s-list .prow .lv')].some(e => e.textContent.trim() !== 'Vg1'),
          `${sL.name}: ${rows} rows, a row beyond Vg1 shown`);
      say('I17', !!document.querySelector('#s-list .lvnote'), `${sL.name}: later years hidden without a disclosure line`);
      const st = schoolPressure(sL, 'all');
      if (st.kind === 'points') {
        const want = meanOf(sL.programs.filter(isVg1).map(p => p.values[st.year]).filter(isPoints));
        say('I17', round1(st.v) === round1(want), `${sL.name}: dot ${round1(st.v)}, Vg1 mean ${round1(want)}`);
      }
      allLevels = true; renderSide();
      const rows2 = document.querySelectorAll('#s-list .prow').length;
      say('I17', rows2 === visibleIn(shownPrograms(sL)) && rows2 > rows && !!document.querySelector('#s-list .lvnote'),
          `${sL.name}: showing the later years lost rows or the way back (${rows} -> ${rows2})`);
      allLevels = false;
    } else say('I17', false, 'no school with recent rows beyond Vg1 to check');
    showOld = wasOld;
    choices = saved; try { localStorage.setItem('pk-choices', JSON.stringify(choices)); } catch (e) {}
    renderChoices();
    // I16 — a map cluster's ring is the mix of the dots it holds: the counts in
    //       the ring add up to the number printed on it, its segments are those
    //       shares, and its spoken label carries the same counts; and the rings
    //       and the loose dots together account for every school on the map,
    //       bucket by bucket, by the dots' own colour rule (recomputed here from
    //       schoolChance). With points off there is no ring.
    //       The ring's counts are supercluster's own sums now, and a cluster's
    //       schools are no longer reachable from its element the way
    //       markercluster's getAllChildMarkers() made them: the totals over the
    //       whole map stand in for the per-cluster count, which is why the view
    //       is framed on the whole dataset first — every school has to be on it.
    {
      const wasView = view;
      if (view !== 'map') setView('map');
      mapCat = 'all'; myPoints = 40;
      fitHome(false);                           // nothing clustered off the edge
      drawMarkers();
      const KEYS = ['likely', 'possible', 'unlikely', 'none'];
      const zero = () => ({ likely: 0, possible: 0, unlikely: 0, none: 0 });
      const clusters = [...document.querySelectorAll('#map .pk-cluster:not([hidden])')];
      say('I16', clusters.length > 0, 'no clusters on screen to check');
      const got = zero();
      let held = 0;
      for (const el of clusters) {
        const n = Number(el.textContent), ring = (el.dataset.mix || '').split(',').map(Number);
        const mix = zero(); KEYS.forEach((k, i) => { mix[k] = ring[i]; });
        say('I16', ring.length === 4 && ring.every(v => v >= 0)
                   && ring.reduce((a, b) => a + b, 0) === n,
            `cluster of ${n}: ring ${el.dataset.mix} does not add up to the number on it`);
        const at = k => `${(100 * k / n).toFixed(2)}%`, css = k => el.style.getPropertyValue(k);
        say('I16', css('--l') === at(mix.likely) && css('--p') === at(mix.likely + mix.possible)
                   && css('--u') === at(mix.likely + mix.possible + mix.unlikely),
            `cluster of ${n}: segments ${css('--l')} ${css('--p')} ${css('--u')} vs ${el.dataset.mix}`);
        // the label names the kommune the element prints under it
        say('I16', el.getAttribute('aria-label') === t('clusterAria', n, mix, el.dataset.place || null),
            `cluster of ${n}: label "${el.getAttribute('aria-label')}"`);
        KEYS.forEach(k => { got[k] += mix[k] || 0; });
        held += n;
      }
      for (const d of document.querySelectorAll('#map .pk-dot')) { got[d.dataset.pkBucket]++; held++; }
      const want = zero(), on = visibleSchools().filter(s => s.lat);
      for (const s of on) { const c = schoolChance(s, 'all', myPoints); want[c ? bucketOf(c.best) : 'none']++; }
      say('I16', held === on.length && KEYS.every(k => got[k] === want[k]),
          `map holds ${held} of ${on.length} schools, rings+dots ${JSON.stringify(got)}, dots' own rule ${JSON.stringify(want)}`);
      myPoints = null; drawMarkers();
      say('I16', !document.querySelector('#map .pk-cluster.mix, #map .pk-cluster[data-mix]'), 'ring drawn with points off');
      if (wasView !== 'map') setView(wasView);
    }
    // I11 — with points off, nothing of the forecast layer leaks into the list
    myPoints = null;
    const s0 = DATA.schools.find(s => MODEL.schools[`${s.fylke}|${s.name}`]?.programs);
    if (s0) { openSide(s0); say('I11', document.querySelectorAll('#s-list .ch:not(.none)').length === 0, 'chips shown with points off'); }
  }
  mapCat = wasCat; myPoints = wasPts; allLevels = wasLv;
  if (typeof drawMarkers === 'function') drawMarkers();   // I16 redrew the map; put it back
  return (fail.length ? `${fail.length} FAILURES\n` + [...new Set(fail)].slice(0, 20).join('\n') + '\n\n' : 'all green\n')
    + Object.entries(hit).map(([k, v]) => `${k} ×${v}`).join('  ');
})()

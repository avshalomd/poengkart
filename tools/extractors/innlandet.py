#!/usr/bin/env python3
"""Innlandet — a rolling three-year matrix (2023/2024/2025), 2. inntak.

The file states its own scope: "Poenggrense for sist inntatte søker med
ungdomsrett pr. 2.inntak". Grouped by school, then by Nivå; the school name is
printed once per group and wraps across lines, and the Nivå digit is printed
once per level block, so both are carried down.

"Ledige plasser" = places were still free, i.e. no effective threshold.
"""
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', '..', 'poenggrenser', 'data', 'innlandet')

META = {
    'code': '34', 'fylke': 'Innlandet', 'round': '2', 'rights': 'ungdomsrett',
    'free_choice': False, 'levels': 'Vg1–Vg4',
    # innlandetfylke.no does not host or link this PDF — its own search, its
    # sitemap and the Wayback index all return nothing for "poenggrense".
    # The file is distributed through vilbli's county-information block (the
    # same channel as Rogaland and Trøndelag); the exact Artikkelvedlegg URL is
    # not yet pinned — see .claude/research/national-expansion.md
    'source': 'https://www.vilbli.no/nb/innlandet/a/poengsum-og-karakterer-6',
    'source_note': 'exact vilbli attachment URL not yet pinned',
}


def _cluster(words, tol=2.5):
    lines, cur, last = [], [], None
    for w in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if last is None or w['top'] - last <= tol:
            cur.append(w)
        else:
            lines.append(cur)
            cur = [w]
        last = w['top']
    if cur:
        lines.append(cur)
    return lines


# ---- the two documents released under innsynskrav 2026/1 (26.08.2026) ----
# Different layouts from the published rolling matrix, same series: the county
# confirmed 2020-2022 exists only in these PDFs and nothing older survives.
# Their legend: 'Inntak uten poenggrense, eller hvor poenggrensen ikke er
# relevant, er merket med "-"' — and the not-relevant intakes (4-year YSK,
# admitted by interview) are excluded from the tables altogether, so "-" is
# read as open. "**" marks "Ikke igangsatt": the programme did not run that
# year and the row is dropped rather than published as open.


def _cell(v):
    s = common.squash(v or '')
    if s in ('-', '–', '—'):
        return 'open'
    return common.classify_cell(s, min_value=0)


def _parse_innsyn_2020(path):
    """Per-school bordered tables; VG1 section then VG2; one value column."""
    rows, school, level = [], None, 'Vg1'
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ''
            if 'Nedre inntaksgrense VG2' in txt:
                level = 'Vg2'
            for tbl in page.extract_tables():
                for r in tbl:
                    if not r or len(r) < 2:
                        continue
                    if r[0]:
                        head = common.squash(r[0].replace('\n', ' '))
                        if head and head != 'Skole':
                            school = head
                    prog_raw = common.squash((r[1] or '').replace('\n', ' '))
                    if (not prog_raw or prog_raw.startswith('Utdanningsprogram')
                            or '**' in prog_raw):
                        continue
                    v = _cell(next((c for c in r[2:] if c and c.strip()), '-'))
                    program = common.canon_program(prog_raw.rstrip('*'))
                    if school and program and v is not None:
                        rows.append({'school': school, 'program': program,
                                     'level': level, 'values': {2020: v},
                                     'county': META['fylke'], 'round': META['round']})
    return rows


def _parse_innsyn_2021_22(path):
    """Skolenavn | Nivå | Programområde | 2021/22 | 2022/23 — pr. 2. inntak."""
    rows, school, level = [], None, 'Vg1'
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for tbl in page.extract_tables():
                for r in tbl:
                    if not r or len(r) < 5:
                        continue
                    first = common.squash((r[0] or '').replace('\n', ' '))
                    if first.startswith(('Poenggrense', 'Skolenavn')):
                        continue
                    if first:
                        school = first
                    if r[1] and common.squash(r[1]) in ('1', '2', '3', '4'):
                        level = 'Vg' + common.squash(r[1])
                    program = common.canon_program(
                        common.squash((r[2] or '').replace('\n', ' ')))
                    values = {}
                    for year, cell in ((2021, r[3]), (2022, r[4])):
                        v = _cell(cell)
                        if v is not None:
                            values[year] = v
                    if school and program and values:
                        rows.append({'school': school, 'program': program,
                                     'level': level, 'values': values,
                                     'county': META['fylke'], 'round': META['round']})
    return rows


INNSYN_FILES = {
    'innlandet-2020-21-mottatt-innsyn.pdf': _parse_innsyn_2020,
    'innlandet-2021-2022-mottatt-innsyn.pdf': _parse_innsyn_2021_22,
}


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.pdf'):
            continue
        if fname in INNSYN_FILES:
            out.append((fname, INNSYN_FILES[fname](os.path.join(SRC, fname))))
            continue
        rows = []
        with pdfplumber.open(os.path.join(SRC, fname)) as pdf:
            school, level, cols = None, 'Vg1', None
            group_rows = []
            for page in pdf.pages:
                words = page.extract_words()
                header = {}
                for w in words:
                    t = common.norm(w['text'])
                    if t == 'Skole':
                        header['school'] = w['x0']
                    elif t == 'Nivå':
                        header['niva'] = w['x0']
                    elif t.startswith('Programområde'):
                        header['program'] = w['x0']
                    elif re.fullmatch(r'20\d\d', t):
                        header.setdefault('years', []).append((int(t), w['x0']))
                if header.get('years') and 'program' in header:
                    cols = header
                if not cols:
                    continue
                first_year_x = min(x for _, x in cols['years'])
                for line in _cluster(words):
                    toks = sorted(line, key=lambda w: w['x0'])
                    txt = common.squash(' '.join(common.norm(w['text']) for w in toks))
                    if not txt or txt.startswith(('Skole ', 'Poenggrense', '•')):
                        continue
                    name_toks = [w for w in toks if w['x0'] < cols['niva'] - 4]
                    niva_toks = [w for w in toks
                                 if cols['niva'] - 4 <= w['x0'] < cols['program'] - 4]
                    prog_toks = [w for w in toks
                                 if cols['program'] - 4 <= w['x0'] < first_year_x - 8]
                    val_toks = [w for w in toks if w['x0'] >= first_year_x - 8]
                    if name_toks and not prog_toks and not val_toks:
                        # continuation of a wrapped school name: the group's
                        # first data row was already emitted under the truncated
                        # name, so rename it retroactively
                        if school:
                            full = common.squash(f'{school} ' + ' '.join(
                                common.norm(w['text']) for w in name_toks))
                            for r in group_rows:
                                r['school'] = full
                            school = full
                        continue
                    if name_toks:
                        school = common.squash(' '.join(common.norm(w['text']) for w in name_toks))
                        group_rows = []
                    if niva_toks:
                        d = common.norm(niva_toks[0]['text'])
                        if d in ('1', '2', '3', '4'):
                            level = f'Vg{d}'
                    program = common.canon_program(' '.join(
                        common.norm(w['text']) for w in prog_toks))
                    if not school or not program or not val_toks:
                        continue
                    # group value words by their nearest year column
                    buckets = {}
                    for w in val_toks:
                        cx = (w['x0'] + w['x1']) / 2
                        yi = min(range(len(cols['years'])),
                                 key=lambda i: abs(cols['years'][i][1] + 14 - cx))
                        buckets.setdefault(yi, []).append(common.norm(w['text']))
                    values = {}
                    for yi, parts in buckets.items():
                        v = common.classify_cell(' '.join(parts), min_value=0)
                        if v is not None:
                            values[cols['years'][yi][0]] = v
                    if values:
                        row = {'school': school, 'program': program, 'level': level,
                               'values': values, 'county': META['fylke'],
                               'round': META['round']}
                        rows.append(row)
                        group_rows.append(row)
        # the first row of a group is emitted before the school name's
        # continuation line is seen, so "Nord-Østerdal" and "Nord-Østerdal
        # videregående skole" both appear — fold the prefix into the full name
        names = {r['school'] for r in rows}
        fold = {}
        for short in names:
            longer = [n for n in names if n != short and n.startswith(short + ' ')]
            if len(longer) == 1:
                fold[short] = longer[0]
        if fold:
            for r in rows:
                r['school'] = fold.get(r['school'], r['school'])
        out.append((fname, rows))
    return out, warn

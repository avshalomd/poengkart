#!/usr/bin/env python3
"""Akershus — 58 HTML tables (2025/26) plus two FOI Excel grids.

The best-structured source in the country: the HTML page publishes 1. AND
2. inntak side by side. We take 2. inntak as the canonical series (comparable
with Rogaland, and the round after which places have stopped moving) and keep
1. inntak in `values_r1`.

The county answered our innsynskrav of 25.08.2026 with two Excel workbooks
(inntak@afk.no, 27.08.2026): school × programme grids of the 2. inntak lower
thresholds for 2024/25 and 2026/27, same 34 schools and short school names as
the HTML page. Those files carry only the second round, so no values_r1.

Cell semantics, from the sources' own footnotes (HTML and xlsx legends agree):
  "Alle som søkte, fikk tilbud om skoleplass."  -> open  (xlsx: '*')
  "Inntak etter en kombinasjon av karakterer …" -> D     (xlsx: '**')
  "0,0" is a REAL threshold: "flere med 0,0 i poengsum står igjen på venteliste
  og ikke har fått plass" — full, but the queue was made of 0-point applicants.
"""
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'akershus')

META = {
    'code': '32', 'fylke': 'Akershus', 'round': '2', 'rights': 'ungdomsrett',
    'free_choice': False,          # inntaksregioner
    'levels': 'Vg1',
    'source': 'https://afk.no/tjenester/skole-og-opplaring/opplaring-i-skole/soke-skoleplass/poenggrenser.222835.aspx',
    'also_publishes': '1. inntak (kept in values_r1)',
}


def _year(fname):
    m = re.search(r'(20\d\d)-20\d\d', fname)
    return int(m.group(1)) if m else None


def _xlsx_cell(v):
    """One grid cell -> float | 'open' | 'D' | None, per the files' legend."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if 0 <= v <= common.MAX_PLAUSIBLE else None
    t = str(v).strip()
    if t == '**':                        # karakterer + ferdigheter
        return 'D'
    if t == '*':                         # alle som søkte fikk tilbud
        return 'open'
    return common.classify_cell(t, min_value=0)


def _parse_xlsx(path, year):
    import openpyxl
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows, header = [], None
    for r in ws.iter_rows(values_only=True):
        if header is None:
            if r and str(r[0]).strip() == 'Skolenr':
                header = [common.canon_program(str(h)) if h else None
                          for h in r[2:]]
            continue
        if not isinstance(r[0], int):    # legend lines under the grid
            continue
        school = common.squash(str(r[1]))
        for prog, cell in zip(header, r[2:]):
            v = _xlsx_cell(cell)
            if not prog or v is None:
                continue
            rows.append({'school': school, 'program': prog,
                         'level': common.guess_level(prog, 'Vg1'),
                         'values': {year: v},
                         'county': META['fylke'], 'round': META['round']})
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    for fname in sorted(os.listdir(SRC), reverse=True):      # newest first
        if not fname.endswith(('.html', '.xlsx')):
            continue
        year = _year(fname)
        if not year:
            warn.append(f'{fname}: cannot read year from filename')
            continue
        if fname.endswith('.xlsx'):
            out.append((fname, _parse_xlsx(os.path.join(SRC, fname), year)))
            continue
        soup = BeautifulSoup(open(os.path.join(SRC, fname), encoding='utf-8',
                                  errors='replace').read(), 'lxml')
        rows, seen = [], set()
        # the page publishes the same figures twice: 24 tables per
        # utdanningsprogram (rows = schools) and 34 per school (rows =
        # programmes). Parse both and de-duplicate, so neither cut can hide a
        # combination the other lists.
        for tb in soup.find_all('table'):
            cap = tb.find('caption')
            heading = cap.get_text(' ', strip=True) if cap else ''
            trs = tb.find_all('tr')
            if not trs:
                continue
            header = [c.get_text(' ', strip=True).lower()
                      for c in trs[0].find_all(['th', 'td'])]
            per_school = bool(header) and header[0].startswith('utdanningsprogram')
            program = None
            fixed_school = None
            if per_school:
                fixed_school = common.squash(re.sub(r'\bvgs\.?$', '', heading, flags=re.I))
                if not fixed_school:
                    continue
            else:
                if '–' not in heading:
                    continue
                program = common.canon_program(re.split(r'[–]', heading, 1)[-1])
                if not program:
                    continue
            # column order is school | 1. inntak | 2. inntak
            i1 = next((i for i, h in enumerate(header) if '1.' in h), 1)
            i2 = next((i for i, h in enumerate(header) if '2.' in h), 2)
            for tr in trs[1:]:
                tds = tr.find_all(['td', 'th'])
                if len(tds) <= max(i1, i2):
                    continue
                first = common.squash(tds[0].get_text(' ', strip=True))
                if not first or first.lower().startswith('poenggrense 0,0'):
                    continue
                school = fixed_school if per_school else first
                prog = program if not per_school else common.canon_program(first)
                if not school or not prog:
                    continue
                v2 = common.classify_cell(tds[i2].get_text(' ', strip=True), min_value=0)
                v1 = common.classify_cell(tds[i1].get_text(' ', strip=True), min_value=0)
                if v2 is None and v1 is None:
                    continue
                key = (school, prog.lower())
                if key in seen:          # the page repeats tables per school
                    continue
                seen.add(key)
                row = {'school': school, 'program': prog,
                       'level': common.guess_level(prog, 'Vg1'),
                       'values': {year: v2} if v2 is not None else {},
                       'county': META['fylke'], 'round': META['round']}
                if v1 is not None:
                    row['values_r1'] = {year: v1}
                if not row['values']:
                    row['values'] = {year: v1}      # only 1. inntak known
                    row['round_note'] = '1'
                rows.append(row)
        out.append((fname, rows))
    return out, warn

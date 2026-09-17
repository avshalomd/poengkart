#!/usr/bin/env python3
"""Telemark — one workbook sent on request, Vg1, 2024/25–2026/27.

The county publishes no poenggrenser: nothing on telemarkfylke.no, nothing
on vilbli, and its intake news of 9 July 2026 gives per-school head-counts
only. Asked on 01.09.2026 (inntak@telemarkfylke.no), Kompetanse og
integrering answered on 17.09.2026 with «Laveste inntakspoeng – siste 3
år»: one sheet per school year, one row per (school, Vg1 programme), with
the inntaksregion, the county's school number, the vigo programområdekode,
the number of places («Plasser») and two figures, «Laveste karakterpoeng»
and «Laveste totalpoeng».

Semantics, and what the file does NOT say:

- «Laveste karakterpoeng» is the county's own «lavest inntatt»: the lowest
  grade points among those admitted. That is the poenggrense published
  here. Every offered programme carries one, down to 10,0; the file has no
  marker for «everyone got in», so the dataset has no fill state for
  Telemark, the figures are not comparable with other counties'
  poenggrenser, and tools/model.py holds the county out of every fit and
  score (HELD_OUT; its schools are forecast by the satellite fit on its own
  cells) until the county says, per programme and year, whether everyone
  was admitted (asked 17.09.2026).
- «Laveste totalpoeng» (2026/27 only, '-' before) is not read. In 33 of 55
  rows it is karakterpoeng + 300; elsewhere the offset is 0, 200, 400 or a
  fraction, so it is another applicant's ordering points with a regional
  or priority bonus the county has not explained (asked 17.09.2026).
- The intake round is stated nowhere. The county's July publication is its
  «hovedinntak» and everyone with ungdomsrett is offered a place by 5
  August; a file dated 17 September may be either. round is None until the
  county answers (asked 17.09.2026) — a round is never inferred.
- «Plasser (klasordn)» is the programme's capacity; not carried (nothing
  consumes it yet; docs/roadmap.md).
- Five regions: the thresholds of a nærskole county apply to the region's
  own residents, as in Trøndelag; free_choice is False and the region
  travels with the school as inntaksregion.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'telemark')
GREP = os.path.join(HERE, '..', 'grep-programomraader.json')

META = {
    'code': '40', 'fylke': 'Telemark', 'round': None, 'rights': 'ungdomsrett',
    'round_note': 'the county\'s extract does not state which inntak the figures are from (asked 17.09.2026)',
    'free_choice': False,          # 5 inntaksregioner
    'levels': 'Vg1',
    # the county publishes no thresholds; its intake news is the only public
    # statement about the intake (head-counts per school, no figures)
    'source': 'https://telemarkfylke.no/no/aktuelt/yrkesfag-topper-sokerlista-i-telemark/',
    'note': ('workbook sent on request, received 17.09.2026: «Laveste karakterpoeng», '
             'the lowest grade points among the admitted, for every offered programme; '
             'no fill state, no intake round stated'),
}
HEADER = ('Skoleår', 'Region (skole)', 'Skolenr (grlsoker)', 'Skole', 'Nivå')
# the file writes the regions in capitals, one with a stray space
REGION_NAMES = {
    'GRENLAND': 'Grenland',
    'MIDT-ØST TELEMARK': 'Midt-Øst Telemark',
    'ØST -TELEMARK/TINN': 'Øst-Telemark/Tinn',
    'VESTMAR': 'Vestmar',
    'VEST-TELEMARK': 'Vest-Telemark',
}


def _grep():
    try:
        return json.load(open(GREP, encoding='utf-8'))
    except FileNotFoundError:
        return {}


def _value(cell):
    """«33,8» / «36» (text, decimal comma) -> float; None for '-' or blank."""
    t = common.squash(str(cell if cell is not None else '')).replace(',', '.')
    if t in ('', '-'):
        return None
    return float(t)


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    grep = _grep()
    if not grep:
        warn.append('Grep registry missing — run tools/fetch_grep.py')
    import openpyxl
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.xlsx'):
            continue
        wb = openpyxl.load_workbook(os.path.join(SRC, fname), data_only=True)
        rows = {}
        for ws in wb.worksheets:
            header = None
            for r in ws.iter_rows(values_only=True):
                if header is None:
                    header = r
                    if tuple(str(c) for c in r[:5]) != HEADER or str(r[9]) != 'Laveste karakterpoeng':
                        warn.append(f'{fname}/{ws.title}: unexpected header {r[:10]}')
                        break
                    continue
                skolear, region, nr, navn, niva, _kort, kode, label, _plasser, nedre = r[:10]
                if not skolear or nr is None:
                    continue
                year = int(str(skolear)[:4])
                school = common.squash(str(navn))
                if str(niva).strip() != '1':
                    warn.append(f'{fname}/{ws.title}: unexpected level {niva!r} for {school}')
                    continue
                code = common.squash(str(kode))
                name = common.VIGO_VARIANT_CODES.get(code) or (grep.get(code) or {}).get('nob')
                if not name:
                    # the county's own label, comma-spliced («Frisør,blomst,int,eksp.design»)
                    name = common.squash(str(label)).replace(',', ', ').replace(',  ', ', ')
                    warn.append(f'{fname}/{ws.title}: code {code} not in the register, using the label {name!r}')
                program = common.canon_program(name)
                try:
                    v = _value(nedre)
                except ValueError:
                    warn.append(f'{fname}/{ws.title}: unreadable value {nedre!r} for {school} {code}')
                    continue
                if v is None:
                    continue
                if not (0 <= v <= common.MAX_PLAUSIBLE):
                    warn.append(f'{fname}/{ws.title}: implausible value {v} for {school} {code}')
                    continue
                reg = REGION_NAMES.get(common.squash(str(region)))
                if not reg:
                    warn.append(f'{fname}/{ws.title}: unknown region {region!r} for {school}')
                key = (school, program.lower())
                row = rows.setdefault(key, {'school': school, 'program': program,
                                            'level': common.guess_level(program, 'Vg1'),
                                            'grep': code,          # the county supplies the code; it outranks the label
                                            'values': {},
                                            'county': META['fylke'], 'round': META['round'],
                                            'region': reg})
                if year in row['values']:
                    warn.append(f'{fname}/{ws.title}: {school} {code} {year} printed twice')
                row['values'][year] = v
        out.append((fname, list(rows.values())))
    return out, warn

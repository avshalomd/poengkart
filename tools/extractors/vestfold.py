#!/usr/bin/env python3
"""Vestfold — one workbook sent on request, Vg1–Vg3, 2024/25–2026/27.

The county publishes no poenggrenser: its intake page on vestfoldfylke.no
gives applicant and admission head-counts per school at 1. inntak, nothing
per programområde. Asked on 21.09.2026 (inntak@vestfoldfylke.no), and on
28.09.2026 for the lowest admitted points per programområde, 2024–2026, the
intake team (Sektorstøtte og inntak) took it to its leadership group and
answered on 28.10.2026 with «Laveste inntatte karakterpoeng 20262027.xlsx»:
one sheet, one row per (school, programområde) with the county's school
number, the level («Nivå» 1–3), the utdanningsprogram, the vigo
programområdekode and the county's short label, and one column per year
(«2026», «2025», «2024»; the school year that starts that autumn, as the
file name's «20262027» says of the newest).

Semantics, and what the file does NOT say:

- The figure is the county's own «lavest inntatte karakterpoeng»: the
  lowest grade points among those admitted. Every offered programme carries
  one, down to 10,0, and the file has no marker for «everyone got in», so,
  as for Telemark, the dataset has no fill state for Vestfold, the figures
  are not comparable with other counties' poenggrenser, and tools/model.py
  holds the county out of every fit and score (HELD_OUT; its schools are
  forecast by the satellite fit on their own cells).
- The county asks that the figures be used as a guide only: «lavest
  inntatte karakterpoeng kan endre seg mye fra år til år, på grunn av blant
  annet antall vedtatte og justerte skoleplasser hvert år, elevenes
  søkemønster fra år til år, samt andre faktorer. Oversikten vil derfor kun
  være veiledende» (reply of 28.10.2026). The app says so on every Vestfold
  school (guideOnlyNote, GUIDE_ONLY in web/src/helpers.ts).
- The intake round is stated nowhere. The request asked for 2. inntak; the
  reply sends «oversikt over lavest inntatte karakterpoeng for de siste tre
  årene» without naming one. round is None — a round is never inferred.
- A blank cell is a programme not offered that year (34 of 765); it is
  skipped, not zero.
- Idrettsfag: up to half of the Vg1 places can be given on documented sport
  results combined with points (vestfoldfylke.no, «Søke skoleplass»), so
  the lowest admitted points there may belong to an applicant admitted on
  documentation. Kept as printed, as the county sends it.
- The labels are vigo's short ones («Påbygg gen studiekomp,SK»), the same
  wording as Møre og Romsdal's extract; the code travels with the row as
  `grep`, so the county's variants («SK 3år», «toppidrett») stay distinct.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'vestfold')

META = {
    'code': '39', 'fylke': 'Vestfold', 'round': None, 'rights': 'ungdomsrett',
    'round_note': 'the county\'s workbook does not state which inntak the figures are from',
    # grade-based admission across the county since 2024 (docs/roadmap.md,
    # «Places as a model input»); no inntaksregioner
    'free_choice': True,
    'levels': 'Vg1–Vg3',
    # the county publishes no thresholds; its intake page is the only public
    # statement about the intake (head-counts per school, no figures)
    'source': 'https://www.vestfoldfylke.no/no/meny/tjenester/opplaring/opplaring-i-skole/soke-skoleplass/',
    'note': ('workbook sent on request, received 28.10.2026: «Laveste inntatte karakterpoeng», '
             'the lowest grade points among the admitted, for every offered programme; '
             'no fill state, no intake round stated; the county asks that it be read as a guide only'),
}
HEADER = ('Skolenr', 'Skolenavn', 'Nivå', 'Utdanningsprogram', 'Progr_kode', 'Programområde')
LEVELS = {1: 'Vg1', 2: 'Vg2', 3: 'Vg3'}


def _clean_program(label):
    # vigo's short label, comma-spliced («Studiespesialisering,fotball»)
    n = common.squash(str(label)).replace(',', ', ').replace(',  ', ', ')
    return common.canon_program(n)


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    import openpyxl
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.xlsx'):
            continue
        wb = openpyxl.load_workbook(os.path.join(SRC, fname), data_only=True)
        rows = {}
        for ws in wb.worksheets:
            header, years = None, []
            for r in ws.iter_rows(values_only=True):
                if header is None:
                    header = r
                    if tuple(str(c) for c in r[:6]) != HEADER:
                        warn.append(f'{fname}/{ws.title}: unexpected header {r[:6]}')
                        break
                    try:
                        years = [int(str(c)) for c in r[6:] if c is not None]
                    except ValueError:
                        warn.append(f'{fname}/{ws.title}: unexpected year columns {r[6:]}')
                        break
                    continue
                nr, navn, niva, _prog, kode, label = r[:6]
                if nr is None or not navn:
                    continue
                school = common.squash(str(navn))
                level = LEVELS.get(int(niva)) if str(niva).strip().isdigit() else None
                if not level:
                    warn.append(f'{fname}/{ws.title}: unexpected level {niva!r} for {school}')
                    continue
                code = common.squash(str(kode))
                program = _clean_program(label)
                if not program:
                    warn.append(f'{fname}/{ws.title}: no programme label for {school} {code}')
                    continue
                key = (school, code, level)
                if key in rows:
                    warn.append(f'{fname}/{ws.title}: {school} {code} printed twice')
                    continue
                row = {'school': school, 'program': program,
                       'level': common.guess_level(program, level),
                       'grep': code,          # the county supplies the code; it outranks the label
                       'values': {},
                       'county': META['fylke'], 'round': META['round']}
                for year, cell in zip(years, r[6:]):
                    if cell is None or str(cell).strip() == '':
                        continue               # not offered that year
                    try:
                        v = float(str(cell).replace(',', '.'))
                    except ValueError:
                        warn.append(f'{fname}/{ws.title}: unreadable value {cell!r} for {school} {code} {year}')
                        continue
                    if not (0 <= v <= common.MAX_PLAUSIBLE):
                        warn.append(f'{fname}/{ws.title}: implausible value {v} for {school} {code} {year}')
                        continue
                    row['values'][year] = round(v, 1)
                if row['values']:
                    rows[key] = row
        out.append((fname, list(rows.values())))
    return out, warn

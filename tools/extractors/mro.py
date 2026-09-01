#!/usr/bin/env python3
"""Møre og Romsdal — one FOI Excel extract, Vg1, 15 years.

The county publishes its poenggrenser only inside a Power BI dashboard
("karakterstatistikk"), whose Publish-to-Web mode offers no download. Dan
Ernes at Kompetanse- og næringsavdelinga answered our request of 25.08.2026
with the tidy extract behind it (dan.ernes@mrfylke.no, 01.09.2026):
one row per (school year, school, programme), with the official Grep
kurskode, the lower threshold (Nedrekar) and — unused here, our schema has
no field for it — the admitted mean (Gjennomkar).

Semantics, and what the file does NOT say:

- No intake round is stated anywhere. The dashboard refreshes once a year
  after 2. inntak (Dan's mail of 26.08.2026), but that is a publication
  cadence, not a statement about which round the figures describe — so the
  round stays None, like Buskerud and Trøndelag.
- There is no "everyone got in" marker. Every offered programme carries a
  number, so an undersubscribed programme's figure is simply its weakest
  admitted applicant (min 5.7 in the file) rather than a competitive bar.
  That is still "the points of the last admitted", which is what a
  poenggrense means everywhere in the app — but this county cannot be
  distinguished from full-with-waitlist, hence `no_open_marker` below.
- '-' means no figure (2 cells of 1793); the cell is skipped, not zero.

School numbers, not names, are the identity in the file, and the county has
retro-labelled its history after two reorganisations:

- 15005/15033 are "Fagerlia - Ålesund vgs, avd Fagerlia/Ålesund" — the two
  schools that merged into Ålesund vgs in 2022 (15037). The old Ålesund
  series (15033) continues seamlessly into 15037 under the same name; the
  campuses ran the same programmes with different thresholds, so Fagerlia
  keeps its own historical identity instead of being folded in.
- 15006 "Romsdal Vgs" is Romsdal vgs's own 2-årig track (the file's label
  says so); it folds into 15019, and on the one (programme, year) both
  carry, the main school's figure wins.
- 15028 is the Vanylven campus Herøy vgs ran until 2019 — a real school in
  another kommune, kept as its own (closed) entity.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', '..', '..', 'poenggrenser', 'data', 'mro')

META = {
    'code': '15', 'fylke': 'Møre og Romsdal', 'round': None,
    'rights': 'ungdomsrett',
    'round_note': 'the extract does not state which intake round the figures are from',
    'free_choice': True,           # fritt skolevalg i hele fylket
    'levels': 'Vg1',
    'source': 'https://mrfylke.no/utdanning-og-karriere/statistikk-og-analyser',
    'note': ('FOI extract from the Power BI dashboard, received 01.09.2026; '
             'no "everyone admitted" marker exists, so an undersubscribed '
             "programme's figure is its weakest admitted applicant"),
}

# file skolenr -> published name. Everything else keeps the file's own name.
SCHOOL_NAMES = {
    15005: 'Fagerlia videregående skole',
    15033: 'Ålesund videregående skole',      # pre-merger series, same name
    15037: 'Ålesund videregående skole',      # the merged school, 2022-
    15006: 'Romsdal videregående skole',      # the file labels it "Romsdal Vgs"
    15019: 'Romsdal videregående skole',
    15028: 'Herøy vidaregåande skule, avd. Vanylven',
}
# where two skolenr fold into one school and publish the same (programme,
# year), the LOWER-priority number yields (15006 is Romsdal's 2-årig track)
YIELDS = {15006}


def _clean_program(name):
    # "_ Service og samferdsel" marks a discontinued programme in the
    # dashboard; ",musikk" is cramped comma-splicing
    n = name.lstrip('_ ').strip()
    n = n.replace(',', ', ').replace(',  ', ', ')
    return common.canon_program(n)


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    import openpyxl
    for fname in sorted(os.listdir(SRC), reverse=True):
        if not fname.endswith('.xlsx'):
            continue
        ws = openpyxl.load_workbook(os.path.join(SRC, fname), data_only=True).worksheets[0]
        rows, owner = {}, {}
        header = None
        for r in ws.iter_rows(values_only=True):
            if header is None:
                header = r
                if [str(c) for c in r[:4]] != ['Skoleår', 'Skolenr', 'Skolenavn', 'Nivå']:
                    warn.append(f'{fname}: unexpected header {r[:4]}')
                    break
                continue
            skolear, nr, navn, niva, kode, kursnavn, nedre = r[0], r[1], r[2], r[3], r[4], r[5], r[6]
            if not skolear or nr is None:
                continue
            year = int(str(skolear)[:4])
            try:
                nr = int(nr)
            except (TypeError, ValueError):
                warn.append(f'{fname}: bad skolenr {nr!r}')
                continue
            school = SCHOOL_NAMES.get(nr) or common.squash(str(navn))
            if str(niva).strip() != '1':
                warn.append(f'{fname}: unexpected level {niva!r} for {school}')
                continue
            program = _clean_program(str(kursnavn))
            if not program:
                warn.append(f'{fname}: no programme name in {kursnavn!r}')
                continue
            v = None
            if nedre is not None and str(nedre).strip() != '-':
                try:
                    v = float(str(nedre).replace(',', '.'))
                except ValueError:
                    warn.append(f'{fname}: unreadable value {nedre!r}')
                    continue
                if not (0 <= v <= common.MAX_PLAUSIBLE):
                    warn.append(f'{fname}: implausible value {v} for {school}')
                    continue
            if v is None:
                continue
            key = (school, program.lower())
            row = rows.setdefault(key, {'school': school, 'program': program,
                                        'level': common.guess_level(program, 'Vg1'),
                                        'values': {},
                                        'county': META['fylke'], 'round': META['round']})
            if year in row['values'] and owner.get((key, year)) not in YIELDS and nr in YIELDS:
                continue                    # the main school's figure stands
            row['values'][year] = v
            owner[(key, year)] = nr
        out.append((fname, list(rows.values())))
    return out, warn

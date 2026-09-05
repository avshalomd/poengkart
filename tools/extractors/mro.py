#!/usr/bin/env python3
"""Møre og Romsdal — one FOI Excel extract, Vg1, 15 years.

The county publishes its poenggrenser only inside a Power BI dashboard
("karakterstatistikk"), whose Publish-to-Web mode offers no download.
Kompetanse- og næringsavdelinga answered our request of 25.08.2026 with the
tidy extract behind it (reply of 01.09.2026, case reference in
`docs/private/`): one row per (school year, school, programme), with the official Grep
kurskode, the lower threshold (Nedrekar) and the admitted mean (Gjennomkar,
carried as `means` and published as `admitted_mean` in data/samples.csv).

Semantics, and what the file does NOT say:

- The figures are from 2. inntak — "Våre tall er basert på 2.inntaket i
  august (som er det endelige inntaket for oss)", the department's reply of 01.09.2026.
  The file itself does not say so; the round rests on that confirmation,
  asked for precisely because a round must never be inferred.
- The file has no "everyone got in" marker: every offered programme carries
  a number, down to 5.7. The dashboard the county actually publishes does
  not print those numbers. Its page "Vg1 Nedre karaktergrense" masks a cell
  with * and legends it «Ruter markert med * betyr at alle kom inn, eller
  at laveste karakter var under 25.» — everyone admitted, or the lowest
  score under 25 — and the file reproduces that mask exactly: every 2026/27
  cell starred on the dashboard has Nedrekar below 25 in the file, every
  unstarred cell 25 or more. The county's adviser confirmed the reading
  (Dan Ernes, 03.09.2026): with the county's high fill rates a star on Vg1
  «kan nesten tolkes som at det er ledig plass», and the capacity data that
  would settle it may be linked next year. So the county's own rule is
  applied here, `OPEN_BELOW`: a figure under 25 is published as "ingen
  venteliste", the state the dashboard shows, not the number it hides.
  It is a proxy — a programme with a queue whose cutoff was 24.6 is labelled
  open, and one that took everyone with the weakest at 27 keeps its number —
  and tools/model.py measures what the proxy labels are worth
  (meta.halflife_search.proxy_label_experiment).
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

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'mro')

META = {
    'code': '15', 'fylke': 'Møre og Romsdal', 'round': '2',
    'rights': 'ungdomsrett',
    'free_choice': True,           # fritt skolevalg i hele fylket
    'levels': 'Vg1',
    # the dashboard itself (Publish to Web); the county page that embeds it,
    # mrfylke.no/.../overgang-og-innsoking-til-vidaregaande/poenggrenser/,
    # moved in 2026 (archived copy of 11.06.2026 in the Wayback Machine)
    'source': ('https://app.powerbi.com/view?r=eyJrIjoiNjk4M2E1M2YtYWNmYi00ODU1LTg2ZGQtNjM5'
               'YmU1NzJmOTM4IiwidCI6ImI5MzJlY2U3LTljZGYtNGQ5NC1iNGMxLTE1MjU2ZTQzYzdlYSIsImMiOjl9'),
    'note': ('FOI extract behind the Power BI dashboard, received 01.09.2026; '
             '"ingen venteliste" follows the dashboard\'s own rule: a figure '
             'under 25 is shown as * («alle kom inn, eller laveste karakter '
             'var under 25»)'),
}
# the dashboard's mask, as its legend states it: a Vg1 threshold under this
# is published as "everyone got in or under 25", never as the number
OPEN_BELOW = 25.0

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


def _mean(cell):
    if cell is None or str(cell).strip() in ('', '-'):
        return None
    try:
        return float(str(cell).replace(',', '.'))
    except ValueError:
        return None


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
            gjennom = r[7] if len(r) > 7 else None        # Gjennomkar: mean points of the admitted
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
            if v < OPEN_BELOW:
                v = 'open'                  # the county's own rule, see above
            key = (school, program.lower())
            row = rows.setdefault(key, {'school': school, 'program': program,
                                        'level': common.guess_level(program, 'Vg1'),
                                        # the county supplies the register's own
                                        # code; it outranks anything re-derived
                                        # from the label (and keeps the MDD
                                        # variants distinct)
                                        'grep': str(kode).strip(),
                                        'values': {},
                                        'county': META['fylke'], 'round': META['round']})
            if year in row['values'] and owner.get((key, year)) not in YIELDS and nr in YIELDS:
                continue                    # the main school's figure stands
            row['values'][year] = v
            owner[(key, year)] = nr
            # the admitted mean travels with the cell (`means`): where it equals
            # the threshold, one applicant set the figure — tools/model.py lets
            # the backtest choose such a cell's weight in the level fit
            g = _mean(gjennom)
            if g is not None:
                row.setdefault('means', {})[year] = round(g, 1)
        out.append((fname, list(rows.values())))
    return out, warn

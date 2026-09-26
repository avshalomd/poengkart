#!/usr/bin/env python3
"""Agder — two counsellor decks from the county's intake office, Vg1.

Agder publishes no poenggrenser. What survives are the tables its intake
office showed school counsellors (rådgivere) at their yearly meeting:

- 2020 and 2021: «Rådgiversamling 1.september 2021 – Inntak og
  elevtjenester», slides 14-18, «Siste ordinært inntatte Vg1 2020 og 2021»
  (the last applicant admitted in the ordinary intake). One small table per
  school, two columns, every public school and every Vg1 programme. The PDF
  (made by PowerPoint, created 06.09.2021) has a text layer and real table
  rules, so it is parsed directly. It was hosted on agderfk.no and is gone
  from there (404, 26.09.2026); the Wayback Machine holds the file.
- 2016 and 2017: Aust-Agder fylkeskommune's «Elevinntak. Rådgiversamling
  8.12.17», slide 8, «Poengsum siste inntatte i hovedinntak, utvalgte
  tilbud»: a hand-picked 17 lines at six Aust-Agder schools, Vg1 and Vg2,
  printed in plain karakterpoeng (grade average × 10). Still live on the
  county's event system (checked 26.09.2026, byte-identical).

How the 2020-21 figures are read (a decoding, not a rule the county states)
---------------------------------------------------------------------------
The 2020-21 table does not print karakterpoeng. Most of its figures are a
hundreds value plus a figure in the 0-60 range: «824,3», «730,4», «321,4*»,
«900,00*». Across all 240 numbers in the table the hundreds are always one
of 0, 200, 300, 700, 800, 900 and never 100, 400, 500 or 600, and the rest
(value − the hundreds) always lies between 0 and 60, the karakterpoeng scale
(research lane AD, 26.09.2026, zero exceptions; this parser re-checks both
and warns on any figure that breaks either).
The reading used here: the hundreds are a priority tier (Agder ranks by
«konkurransepoeng = karakterpoeng + nærskolepoeng», forskrift FOR-2019-02-
06-2289 § 2-3, but no county document gives the nærskolepoeng value — the
forskrift, the 2026 høringsnotat, three counsellor decks, agderfk.no and
vilbli.no were all read), and the rest is the last admitted applicant's
karakterpoeng. So:

    split the cell on «/», strip «*», decimal comma -> number v
    offset = 100·floor(v/100); remainder = v − offset
    one number:  remainder > 0 -> that remainder is the threshold (points)
                 remainder = 0 -> 'open' (the lowest real remainder anywhere
                 in the table is 12.9; a 0 reads as «no competitive floor:
                 everyone in the tier was admitted»)
    «A/B»:       two tiers reported for one offer, each with its own cutoff
                 (35 cells, all in the 2020 column, always an 800-tier then
                 a 700-tier). Which one is the offer's threshold is the
                 owner's call: AGDER_TWO_TIER below, default 'skip'.
    «-» / blank: the offer did not run that year (5 cells, all 2020, all
                 on offers with a real 2021 figure) -> no cell

«*» is printed on 71 figures (52 single figures, and the first figure of 19
«A/B» cells, never the second) and has no legend anywhere in the deck (lane
AD checked the rendered slides); it does not line up with a 0 remainder. It
is ignored and counted in a warning.

META['note'] says the same in one sentence, so a reader of schools.json
knows the Agder 2020-21 numbers are this project's arithmetic.

The round
---------
Neither table numbers its round. The 2021 deck's own vocabulary is
hovedinntak / suppleringsinntak (slide 3: «Tall etter suppleringsinntaket
29.juli 2021») and slides 14-18 say only «ordinært inntatte»; the 2017 deck
says «hovedinntak», which slide 28 describes as «Hovedinntaket vil kjøres
ca 6. juli … Suppleringsinntaket vil kjøres ca 10. august». A round is never
inferred, so round is None for both, as for Buskerud and Telemark.

Aust-Agder 2016-17
------------------
Printed values are read as they stand: plain karakterpoeng, no offsets (all
34 figures are 22,2-47,9). Aust-Agder had no intake regions then (slide 12,
quoting its local forskrift: «Aust-Agder fylkeskommune har ikke
inntaksregioner. Søkere kan derfor i utgangspunktet søke til videregående
skoler i hele fylket, uavhengig av bosted», though the county could still
redirect applicants geographically), so these are county-wide thresholds.
Programme names stay as printed apart from abbreviations: «Vg1 Elektro» was
Elektrofag before the 2020 reform and keeps that name; «MDD musikk» / «dans»
/ «drama» are Dahlske's three music, dance and drama queues.
"""
import math
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'agder')

META = {
    'code': '42', 'fylke': 'Agder', 'round': None,
    'round_note': ('neither source numbers its intake round: the 2020–21 table is the '
                   '«siste ordinært inntatte», the 2016–17 Aust-Agder table the '
                   '«siste inntatte i hovedinntak»'),
    'rights': 'ungdomsrett',
    'free_choice': False,          # nærskolepoeng (FOR-2019-02-06-2289 § 2-3)
    'levels': 'Vg1 (2016–17 also three Vg2 programmes; one Vg3 line in 2021)',
    # the newest document; its agderfk.no original is 404 since the county
    # moved its site, so the address given is the archived copy of that file
    'source': ('https://web.archive.org/web/20220303051051/https://agderfk.no/_f/p1/'
               'i570727fd-8302-43df-a498-401f410a3dc3/'
               'presentasjon-radgiversamling-010921-evaluering-av-arets-inntak-2.pdf'),
    'note': ('the 2020–21 figures are decoded from priority-tier offsets (value − the '
             'hundreds): a reading of the table\'s own arithmetic, not a rule the county '
             'states; 2016–17 (Aust-Agder, selected offers) is printed as plain '
             'karakterpoeng'),
    # the years whose figures are this project's arithmetic; the app says so
    # beside them (decodedNote)
    'decoded_years': ['2020', '2021'],
}

# the 2016-17 deck, still live on the county's event system
SOURCE_2016_17 = ('https://agderfk.pameldingssystem.no/auto/1/Anna%20Skarheim/'
                  'r%C3%A5dgiversamlinger/8des2017/R%C3%A5dgiversamling%20081217_akm.pdf')

FILE_2020_21 = 'agder-2020-2021-radgiversamling-010921-evaluering-av-arets-inntak.pdf'
FILE_2016_17 = 'aust-agder-2016-2017-radgiversamling-081217-elevinntak.pdf'

# «A/B» cells (2020 only): 'skip' publishes no figure for that year;
# 'lower' takes the lower of the two remainders (the more permissive of the
# two tiers' cutoffs); 'upper' takes the first token's remainder (the 800
# tier, printed first). A 0 remainder is 'open' under either choice.
AGDER_TWO_TIER = 'skip'

# the offsets the table uses; anything else is a misread or a new layout
KNOWN_OFFSETS = {0, 200, 300, 700, 800, 900}

# The decks' short school names -> the register's (NSR) full names.
SCHOOLS = {
    'Risør': 'Risør videregående skole',
    'Tvedestrand': 'Tvedestrand videregående skole',
    # NSR lists only the two sites, «avd Barbu» and «avd Tyholmen»; the
    # deck does not say which site an offer is at
    'Arendal': 'Arendal videregående skole',
    'Lillesand': 'Lillesand videregående skole',
    'Sam Eyde': 'Sam Eyde videregående skole',
    'Dahlske': 'Dahlske videregående skole',
    'Setesdal': 'Setesdal vidaregåande skule',
    'KKG': 'Kristiansand katedralskole Gimle',
    'Vennesla': 'Vennesla videregående skole',
    'Tangen': 'Tangen videregående skole',
    'Kvadraturen': 'Kvadraturen videregående skole',
    'Vågsbygd': 'Vågsbygd videregående skole',
    'Mandal': 'Mandal videregående skole',
    'Søgne': 'Søgne videregående skole',
    # NSR lists three studiesteder (Farsund, Lista, Lyngdal), not the school
    'Eilert Sundt': 'Eilert Sundt videregående skole',
    'Byremo': 'Byremo videregående skole',
    'Sirdal': 'Sirdal videregående skole',
    # NSR lists two studiesteder (Flekkefjord, Kvinesdal), not the school
    'Flekkefjord': 'Flekkefjord videregående skole',
    # 2016-17. «TvÅ» is Tvedestrand og Åmli videregående skole; its Holt
    # site is the register unit 874573922, «Tvedestrand videregående skole
    # avd Holt» today (Brønnøysund's name history: «TVEDESTRAND OG ÅMLI
    # VIDEREGÅENDE SKOLE AVD HOLT» 2011-2019)
    'TvÅ, avd. Holt': 'Tvedestrand videregående skole avd Holt',
    # a rename, not a merger: the same register unit (974573857) was
    # «MØGLESTU VIDEREGÅENDE SKOLE» until 20.08.2019 and has been «LILLESAND
    # VIDEREGÅENDE SKOLE» since (Brønnøysund's name history), which is the
    # «Lillesand» of the 2020-21 table
    'Møglestu': 'Lillesand videregående skole',
}

# 2020-21: the slides' abbreviations and one typo -> the programme's own
# name, as the same table prints it for other schools. Keyed by the printed
# label, lower-case, after a wrapped cell is joined (see _label).
NAMES_2020 = {
    'elektro': 'Elektro og datateknologi',              # Risør; every other school prints it in full
    'teknoligi og industri': 'Teknologi- og industrifag',
    'helse': 'Helse- og oppvekstfag',                   # Tvedestrand
    # «med stu[diekompetanse]»: the variant the other schools print as
    # «Helse- og oppvekstfag,SK 3år», new in 2021 at all of them (2020 «-»)
    'helse med stu.': 'Helse- og oppvekstfag, SK 3 år',
    'idrett': 'Idrettsfag',
    'stud.spes.': 'Studiespesialisering',
    'stud.spes. int.': 'Studiespesialisering, internasjonalisering',   # as KKG prints it
    'stud.spes. forsk.': 'Studiespesialisering, forskerlinje',         # as Vågsbygd prints it
    # LAL = landslinje, as common.PROGRAM_ALIASES reads it for Innlandet
    'studiespesialisering,alpin/langrenn,lal': 'Studiespesialisering, alpin/langrenn, landslinje',
    # ALTVG3: the row names its own level (see LEVELS_2020)
    'gullsmedfaget,altvg3,1.år': 'Gullsmedfaget, ALTVG3, 1. år',
}
# a line whose label names a level other than the table's Vg1
LEVELS_2020 = {'gullsmedfaget,altvg3,1.år': 'Vg3'}

# 2016-17: printed after the «Vg1 »/«Vg2 » prefix. Pre-2020 names stay as
# printed; only the abbreviations are written out, to the name of the time.
NAMES_2016 = {
    'elektro': 'Elektrofag',                            # Vg1 Elektrofag until the 2020 reform
    'helse- og oppvekst': 'Helse- og oppvekstfag',
    'mdd musikk': 'Musikk, dans og drama, musikk',
    'mdd dans': 'Musikk, dans og drama, dans',
    'mdd drama': 'Musikk, dans og drama, drama',
}

YEAR_RE = re.compile(r'^20\d\d$')
NUM_RE = re.compile(r'^\d+(?:,\d+)?$')


def _label(cell):
    """A table cell's text on one line: «Studiespesialisering,alpin/\\nlangrenn
    ,LAL» -> «Studiespesialisering,alpin/langrenn,LAL»."""
    s = common.squash((cell or '').replace('\n', ' '))
    s = re.sub(r'/\s+', '/', s)
    return re.sub(r'\s+,', ',', s)


def _program(label, names):
    return common.canon_program(names.get(label.lower(), label))


# --- 2020-21 ---------------------------------------------------------------

def _tokens(raw):
    """«825,3*/721,5» -> [(825.3, True), (721.5, False)]; None if unreadable."""
    out = []
    for tok in raw.split('/'):
        t = tok.strip()
        star = '*' in t
        t = t.replace('*', '').strip()
        if not NUM_RE.match(t):
            return None
        out.append((float(t.replace(',', '.')), star))
    return out


def _split(v):
    offset = 100 * math.floor(v / 100)
    return offset, round(v - offset, 2)


def _points(rem):
    return 'open' if rem == 0 else round(rem, 1)


def _decode(raw, where, tally, warn):
    """One printed 2020-21 cell -> float | 'open' | None (no cell)."""
    s = common.squash(raw or '')
    if s in ('', '-', '–'):
        tally['no_offer'] += 1
        return None
    toks = _tokens(s)
    if not toks:
        warn.append(f'{FILE_2020_21}: {where}: unreadable cell {s!r}, skipped')
        return None
    tally['star'] += sum(star for _, star in toks)
    parts = []
    for v, _ in toks:
        offset, rem = _split(v)
        if offset not in KNOWN_OFFSETS:
            warn.append(f'{FILE_2020_21}: {where}: {s!r} has offset {offset}, '
                        f'not one of {sorted(KNOWN_OFFSETS)}; skipped')
            return None
        if not (0 <= rem <= common.MAX_PLAUSIBLE) or abs(rem * 10 - round(rem * 10)) > 1e-6:
            warn.append(f'{FILE_2020_21}: {where}: {s!r} leaves {rem}, not a karakterpoeng; skipped')
            return None
        parts.append(rem)
    if len(parts) == 1:
        return _points(parts[0])
    if len(parts) == 2:
        tally['two_tier'].append(f'{where} «{s}»')
        if AGDER_TWO_TIER == 'lower':
            return _points(min(parts))
        if AGDER_TWO_TIER == 'upper':
            return _points(parts[0])
        return None
    warn.append(f'{FILE_2020_21}: {where}: {s!r} has {len(parts)} figures; skipped')
    return None


def _year_header(row):
    """{column index: year} if the row is a school's header («Risør | 2020 |
    2021»), else None."""
    cols = {i: int(c.strip()) for i, c in enumerate(row[1:], start=1)
            if c and YEAR_RE.match(c.strip())}
    return cols if len(cols) >= 2 and _label(row[0]) else None


def _parse_2020_21(path, warn):
    rows, tally = [], {'no_offer': 0, 'star': 0, 'two_tier': []}
    with pdfplumber.open(path) as pdf:
        pages = list(pdf.pages)
        start = next((i for i, p in enumerate(pages)
                      if 'Siste ordinært inntatte Vg1' in (p.extract_text() or '')), None)
        if start is None:
            warn.append(f'{FILE_2020_21}: title «Siste ordinært inntatte Vg1» not found')
            return rows
        for page in pages[start:]:
            # the slide's frame is detected as one page-sized table; the
            # schools' tables sit inside it
            tables = [t for t in page.find_tables() if t.bbox[2] - t.bbox[0] < 0.9 * page.width]
            extracted = [t.extract() for t in tables]
            if not any(tb and _year_header(tb[0]) for tb in extracted):
                break                      # past the last slide of the table
            for tb in extracted:
                school, cols = None, None
                for r in tb:
                    head = _year_header(r)
                    if head:
                        printed = _label(r[0])
                        school = SCHOOLS.get(printed)
                        cols = head
                        if not school:
                            warn.append(f'{FILE_2020_21}: unknown school «{printed}», its rows skipped')
                        continue
                    label = _label(r[0])
                    cells = [r[i] if i < len(r) else None for i in cols] if cols else []
                    if not label:
                        if any(c and c.strip() for c in cells):
                            warn.append(f'{FILE_2020_21}: a row with figures but no programme: {r}')
                        continue
                    if not school:
                        if cols is None:
                            warn.append(f'{FILE_2020_21}: row «{label}» before any school heading, skipped')
                        continue
                    program = _program(label, NAMES_2020)
                    level = LEVELS_2020.get(label.lower(), 'Vg1')
                    values = {}
                    for i, year in cols.items():
                        where = f'{school} / {label} / {year}'
                        v = _decode(r[i] if i < len(r) else None, where, tally, warn)
                        if v is not None:
                            values[year] = v
                    if values:
                        rows.append({'school': school, 'program': program, 'level': level,
                                     'values': values, 'county': META['fylke'],
                                     'round': META['round']})
    if tally['two_tier']:
        what = {'skip': 'no figure published for that year',
                'lower': 'the lower remainder published',
                'upper': 'the first (800-tier) remainder published'}[AGDER_TWO_TIER]
        warn.append(f'{FILE_2020_21}: {len(tally["two_tier"])} «A/B» two-tier cells, '
                    f'AGDER_TWO_TIER={AGDER_TWO_TIER!r} ({what}): '
                    + '; '.join(tally['two_tier']))
    if tally['star']:
        warn.append(f'{FILE_2020_21}: {tally["star"]} figures carry «*», which the deck does '
                    f'not explain; the mark is ignored')
    return rows


# --- 2016-17 (Aust-Agder) --------------------------------------------------

LEVEL_PREFIX = re.compile(r'^(Vg[1-4])\s+(.+)$')


def _parse_2016_17(path, warn):
    rows = []
    with pdfplumber.open(path) as pdf:
        page = next((p for p in pdf.pages
                     if 'Poengsum siste inntatte i hovedinntak' in (p.extract_text() or '')), None)
        if page is None:
            warn.append(f'{FILE_2016_17}: slide «Poengsum siste inntatte i hovedinntak» not found')
            return rows
        for tb in page.extract_tables():
            cols, level, printed, school = None, None, None, None
            for r in tb:
                if cols is None:
                    head = {i: int(c.strip()) for i, c in enumerate(r)
                            if c and YEAR_RE.match(c.strip())}
                    if len(head) >= 2:
                        cols = head            # «2017 | 2016»: newest first
                    continue
                prog_cell, school_cell = _label(r[0]), _label(r[1])
                if prog_cell:
                    m = LEVEL_PREFIX.match(prog_cell)
                    if m:
                        level, printed = m.group(1), m.group(2)
                    elif printed:
                        # «dans», «drama» under «Vg1 MDD musikk»: the next
                        # queue of the same programme at the same school
                        printed = f'{printed.rsplit(" ", 1)[0]} {prog_cell}'
                    else:
                        warn.append(f'{FILE_2016_17}: «{prog_cell}» with no level, skipped')
                        continue
                if school_cell:
                    school = SCHOOLS.get(school_cell)
                    if not school:
                        warn.append(f'{FILE_2016_17}: unknown school «{school_cell}», row skipped')
                        continue
                if not (level and printed and school):
                    continue
                values = {}
                for i, year in cols.items():
                    v = common.classify_cell(r[i] or '', min_value=0)
                    if v is not None:
                        values[year] = v
                    elif (r[i] or '').strip():
                        warn.append(f'{FILE_2016_17}: {school} {printed} {year}: '
                                    f'unreadable {r[i]!r}, skipped')
                if values:
                    rows.append({'school': school, 'program': _program(printed, NAMES_2016),
                                 'level': level, 'values': values,
                                 'county': META['fylke'], 'round': META['round']})
    return rows


# newest first; any other file in the folder is reported, not read
SOURCES = [(FILE_2020_21, _parse_2020_21), (FILE_2016_17, _parse_2016_17)]


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    known = {f for f, _ in SOURCES}
    for fname in sorted(os.listdir(SRC)):
        if fname not in known and not fname.startswith('.'):
            warn.append(f'{META["fylke"]}: {fname} is not a source this extractor reads, ignored '
                        f'(add it to SOURCES if it is one)')
    for fname, parse in SOURCES:
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            warn.append(f'{META["fylke"]}: missing source {fname}')
            continue
        rows = parse(path, warn)
        if not rows:
            warn.append(f'{META["fylke"]}: {fname}: no rows parsed')
        out.append((fname, rows))
    return out, warn

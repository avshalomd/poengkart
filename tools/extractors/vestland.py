#!/usr/bin/env python3
"""Vestland — the deepest archive in Norway: 2020/21 through 2026/27.

Simple three-column PDFs (skule | programområde | nedre poenggrense) at fixed
x-positions, published for BOTH 1. and 3. inntaksomgang. We take 1. inntak as
the canonical series — it is the round Oslo and Akershus also publish, so a
future "compare on round 1" view can span all three — and keep 3. inntak in
`values_r3`.

The PDFs state their own scope: "Nedre poenggrense på vg1 gjeld alle med
ungdomsrett i sitt inntaksområde" — Vestland uses intake areas, so a threshold
applies to applicants resident in that area, not to everyone in the county.
"""
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'vestland')

META = {
    'code': '46', 'fylke': 'Vestland', 'round': '1', 'rights': 'ungdomsrett',
    'free_choice': False,          # inntaksområde
    'levels': 'Vg1 (+ later levels where listed)',
    'source': ('https://www.vestlandfylke.no/utdanning-og-karriere/elev/'
               'soknad-inntak/test-poenggrenser/'),
    'also_publishes': '3. inntak (kept in values_r3)',
}
LEVEL_RE = re.compile(r'^Vg\s?([1-4])\b', re.I)


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


def _columns(words):
    """x-positions of the header columns, across three layout generations:
       2021-22  Skole navn | Programområde navn | Vg1  | Nedre poenggrense
       2022-26  Skule namn | Programområde namn | Nivå | Nedre poenggrense
       2025-26  Skule namn | Programområde namn |      | Nedre poenggrense
    """
    prog = niva = val = school = extra = None
    for w in words:
        t = common.norm(w['text'])
        tl = t.lower()
        if tl.startswith('programområde'):
            prog = w['x0']
        elif tl in ('nivå', 'vg1', 'nivaa'):
            niva = w['x0']
        elif tl == 'nedre':
            val = w['x0']
        elif tl in ('skule', 'skole') and school is None:
            school = w['x0']
    if prog is None or val is None:
        return None
    # the Vg2/Vg3 pages of the 3. inntak editions add a fourth column, the
    # utdanningsprogram, to the RIGHT of the value on the header line; read
    # from the right without cutting it off and every one of those rows is
    # lost. Only the header line counts: the page title ends in the same word.
    hdr = [w for w in words if common.norm(w['text']).lower() == 'nedre' and w['x0'] == val]
    if hdr:
        top = hdr[0]['top']
        for w in words:
            if (common.norm(w['text']).lower().startswith('utdanningspr')
                    and abs(w['top'] - top) < 3 and w['x0'] > val):
                extra = w['x0']
    # a Nivå column only counts if it sits between programme and value
    if niva is not None and not (prog < niva < val):
        niva = None
    return {'school': school or 0, 'program': prog, 'niva': niva, 'value': val,
            'extra': extra}


def _parse(path, warn):
    """-> {(school, program, level): value}"""
    found, level = {}, 'Vg1'
    with pdfplumber.open(path) as pdf:
        pages_parsed, cols = 0, None
        for page in pdf.pages:
            words = page.extract_words()
            # the header is printed only on the first page of each Vg block;
            # carry the last-seen geometry forward or 2/3 of every file is lost
            cols = _columns(words) or cols
            if not cols:
                continue
            pages_parsed += 1
            prefix = None
            for line in _cluster(words):
                text = common.squash(' '.join(common.norm(w['text']) for w in line))
                if not text:
                    continue
                # the 2023/24 edition draws the first word of a long programme
                # name a couple of points above its row, so it clusters alone;
                # keep it for the row that follows, whose name starts indented
                if (len(line) == 1 and abs(line[0]['x0'] - cols['program']) < 4
                        and common.classify_cell(text, min_value=0) is None):
                    prefix = text
                    continue
                m = LEVEL_RE.match(text)
                if m:
                    level = f'Vg{m.group(1)}'
                    continue
                low = text.lower()
                if low.startswith(('skule', 'skole', 'oversikt', 'nedre poenggrense')):
                    continue
                toks = sorted(line, key=lambda w: w['x0'])
                if cols.get('extra'):
                    toks = [w for w in toks if w['x0'] < cols['extra'] - 4]
                if not toks:
                    continue
                # take the value from the RIGHT: the header's Nivå and Nedre
                # columns sit 23pt apart while their data does not, so an
                # x-boundary swallows the level digit into the value
                val, vi = None, None
                for k in range(1, min(4, len(toks)) + 1):
                    cand = common.squash(' '.join(common.norm(w['text']) for w in toks[-k:]))
                    c = common.classify_cell(cand, min_value=0)
                    if c is not None:
                        val, vi = c, len(toks) - k
                if val is None or vi is None or vi == 0:
                    continue
                body = toks[:vi]
                row_level = level
                if body and common.norm(body[-1]['text']) in ('1', '2', '3', '4') \
                        and body[-1]['x0'] > cols['program']:
                    row_level = f'Vg{common.norm(body[-1]["text"])}'
                    body = body[:-1]
                school = common.squash(' '.join(
                    common.norm(w['text']) for w in body if w['x0'] < cols['program'] - 4))
                ptoks = [w for w in body if w['x0'] >= cols['program'] - 4]
                if prefix and ptoks and ptoks[0]['x0'] > cols['program'] + 8:
                    ptoks = [{'text': prefix}] + ptoks
                prefix = None
                program = common.canon_program(' '.join(common.norm(w['text']) for w in ptoks))
                if not school or not program:
                    continue
                v = val
                found[(school, program, row_level)] = v
        if not pages_parsed:
            warn.append(f'{os.path.basename(path)}: no parsable header found '
                        f'(rotated-text layout?) — skipped')
    return found



def _matrix(path, warn):
    """The 2020/21 editions are not the later three-column list at all: they
    are a wide grid, schools down the side and programmes written up the page
    as rotated column headers. The grid is ruled, so the cells come out cleanly
    — the work is rebuilding each header from its glyphs, read bottom-to-top.

    As everywhere in this county, the header is drawn only on the first page of
    a block and the continuation pages carry none, so the geometry has to be
    carried forward or the tail of the document is silently lost.
    """
    found, cols = {}, None
    settings = {'vertical_strategy': 'lines', 'horizontal_strategy': 'lines'}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.find_tables(settings)
            if not tables:
                continue
            tbl = tables[0]
            rows = tbl.extract()
            header_here = rows and len(rows) > 1 and (rows[1][0] or '').strip() == 'Skulenamn'
            if header_here:
                band = tbl.rows[0].cells
                top, bottom = band[0][1], band[0][3]
                cols = []
                for i, cell in enumerate(band[1:], 1):
                    if not cell:
                        continue
                    x0, _, x1, _ = cell
                    ch = [c for c in page.chars if top - 1 <= c['top'] <= bottom + 1
                          and x0 - 1 <= (c['x0'] + c['x1']) / 2 <= x1 + 1]
                    ch.sort(key=lambda c: (-c['top'], c['x0']))
                    label = common.squash(''.join(c['text'] for c in ch))
                    if label:
                        cols.append((i, label))
            if not cols:
                continue
            for row in rows[2 if header_here else 0:]:
                school = common.squash(row[0] or '')
                if not school or school == 'Skulenamn':
                    continue
                for i, program in cols:
                    if i >= len(row):
                        continue
                    v = common.classify_cell(row[i] or '', loose=True)
                    if v is not None:
                        found[(school, common.canon_program(program), 'Vg1')] = v
    return found



# --- Hordaland, the county Vestland replaced in 2020 -------------------------
# Two press releases survive only in the Wayback Machine. They cover far less
# than the later series — Vg1 studiespesialisering, public schools in the
# Bergen area, 1. inntaksomgang — but each one prints last year's figure beside
# this year's, so the pair carries 2017, 2018 and 2019. The 2018 column appears
# in both files and agrees to the decimal, which is the cross-check that makes
# them safe to use.
HORDALAND = {
    'hordaland_2019_1inntak_bergen-st.pdf': 2019,
    'hordaland_2018_1inntak_bergen-st.pdf': 2018,
}
# the press releases use short forms; the register names are what we publish
HORDALAND_NAMES = {
    'amalie skram vgs': 'Amalie Skram videregående skole',
    'arna vgs': 'Arna vidaregåande skule',
    'askøy vgs': 'Askøy videregående skole',
    'bergen katedralskole': 'Bergen katedralskole',
    'fyllingsdalen vgs': 'Fyllingsdalen videregående skole',
    'knarvik vgs': 'Knarvik vidaregåande skule',
    'langhaugen vgs': 'Langhaugen videregående skole',
    'nordahl grieg vgs': 'Nordahl Grieg videregående skole',
    'olsvikåsen vgs': 'Olsvikåsen videregående skole',
    'os gymnas': 'Os gymnas',
    'osterøy vgs': 'Osterøy vidaregåande skule',
    'sandsli vgs': 'Sandsli videregående skole',
    'sotra vgs': 'Sotra vidaregåande skule',
    'tertnes vgs': 'Tertnes vidaregåande skule',
    'årstad vgs': 'Årstad videregående skole',
}
# "Amalie Skram vgs 49,40: « (i fjor: 48,80)" and
# "Amalie Skram videregående skole: 48,3 (i fjor 49,4)" are the same line in
# two years' house styles. One period-for-comma typo is in the source.
HORD_RE = re.compile(
    r'^(?P<name>[^:0-9]+?)[:\s]+(?P<now>\d{2}[.,]\d{1,2})\s*(?:poeng)?\s*[:«\s]*'
    r'\(i fjor:?\s*(?P<prev>\d{2}[.,]\d{1,2})\)')


def _hordaland_name(raw):
    n = common.squash(raw).rstrip(':').strip()
    n = re.sub(r'\bvidereg[åa]ende skole$|\bvidareg[åa]ande skule$|\bvgs\.?$', 'vgs', n, flags=re.I)
    n = re.sub(r'\s+', ' ', n).strip().lower()
    return HORDALAND_NAMES.get(n)


# The county reorganised a school into a department of another and renamed it
# in the 2026-27 edition. Left alone that publishes two schools — the old name
# with 2020-2025 and the new one with 2026 — for one building, and the national
# register (NSR) still knows it under the old name, which is also what it calls
# itself. Keep the history together under that name.
RENAMED = {
    'Førde vidaregåande skule, avd Høyanger': 'Høyanger vidaregåande skule',
}

# Hafstad and Mo og Øyrane became one school in 2023, in one new building, and
# the county stopped publishing them separately. Published apart they are three
# pins around Førde with no overlapping years and no history on the one that
# still exists. They share no programme between them — Hafstad's seven were
# academic, Mo og Øyrane's thirty vocational — so joining them invents no
# figure and hides no disagreement. The school carries a note saying where the
# older years come from.
MERGED = {
    'Hafstad videregående skule': ('Førde vidaregåande skule', 2023),
    'Mo og Øyrane vidaregåande skule': ('Førde vidaregåande skule', 2023),
}


def _identity(school):
    """-> (name to publish under, (former name, year) if this is a merger)."""
    if school in MERGED:
        return MERGED[school][0], (school, MERGED[school][1])
    return RENAMED.get(school, school), None


# --- the two county-wide tables the old counties left behind ----------------
# Vestland fylkeskommune keeps two PDFs its predecessors made: Hordaland's
# full 3. inntak table for 2017/18-2019/20 (Vg1-Vg3, every public school,
# keyed by programområdekode) and Sogn og Fjordane's 1. inntak Vg1 table for
# 2018/19-2019/20. Neither filename carries a year, so they are named here.
HORDALAND_FULL = 'hordaland_2017-2019_3inntak_vg1-vg3.pdf'
SFJ_VG1 = 'sogn-og-fjordane_2018-2019_1inntak_vg1.pdf'
GREP_CODE_RE = re.compile(r'^[A-Z]{5}\d[A-Z0-9-]{4}$')
# Laksevåg and Bergen Maritime were separate schools until 2020 and offered
# three of the same programmes (ELELE1, ELELE2, TPTIP1), so their rows cannot
# be folded into the merged school's series without inventing a figure.
# The merged school's own series starts in 2020; the two predecessors are
# left out rather than published as pins with no first-round data.
HORDALAND_SKIP = {'Laksevåg videregående skole', 'Bergen Maritime videregående skole'}


def _hordaland_full(path, warn):
    """Hordaland's 3. inntak table -> rows carrying values_r3 only.

    Vestland's canonical series is 1. inntak; these cells are the later
    round, so they go beside the series (values_r3), where the round bridge
    can pair them with the press releases' 1. inntak figures. A blank cell is
    a programme not offered that year; «Alle» is a programme with no queue.
    """
    cells, level, years = {}, None, None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            for line in _cluster(words):
                toks = sorted(line, key=lambda w: w['x0'])
                text = common.squash(' '.join(common.norm(w['text']) for w in toks))
                m = re.match(r'^Vidaregåande kurs (\d)\b', text)
                if m:
                    level = f'Vg{m.group(1)}'
                    continue
                if text.startswith('Skolenr'):
                    # "2019- 2018- 2017-" on the Vg1 page, "2019 2018 2017"
                    # later; either way the first year of the school year
                    ys = [(int(common.norm(w['text'])[:4]), (w['x0'] + w['x1']) / 2)
                          for w in toks if re.match(r'^20\d\d-?$', common.norm(w['text']))]
                    if ys:
                        years = ys
                    continue
                code = [i for i, w in enumerate(toks)
                        if GREP_CODE_RE.match(common.norm(w['text']))]
                if not code or level is None or not years:
                    continue
                ci = code[0]
                school = common.squash(' '.join(common.norm(w['text']) for w in toks[:ci]))
                school = re.sub(r'^\d{5}\s*', '', school)
                if school in HORDALAND_SKIP:
                    continue
                first_val = min(x for _, x in years) - 12
                name = common.canon_program(' '.join(
                    common.norm(w['text']) for w in toks[ci + 1:]
                    if (w['x0'] + w['x1']) / 2 < first_val))
                if not school or not name:
                    continue
                for w in toks[ci + 1:]:
                    cx = (w['x0'] + w['x1']) / 2
                    if cx < first_val:
                        continue
                    v = common.classify_cell(common.norm(w['text']), min_value=0)
                    if v is None:
                        continue
                    year = min(years, key=lambda yc: abs(yc[1] - cx))[0]
                    cells.setdefault((school, name, level), {})[year] = v
    if not cells:
        warn.append(f'{os.path.basename(path)}: no rows parsed')
    rows = []
    for (school, name, level), r3 in cells.items():
        school, merged = _identity(school)
        row = {'school': school, 'program': name, 'level': level, 'values': {},
               'values_r3': r3, 'county': META['fylke'], 'round': '3'}
        if merged:
            row['merged_from'], row['merged_year'] = merged
        rows.append(row)
    return rows


# the table groups schools by utdanningsprogram with a two-letter code and a
# nynorsk short form; these are the register names the rest of the dataset uses
SFJ_PROGRAMS = {
    'BA': 'Bygg- og anleggsteknikk',
    'DH': 'Design og håndverk',
    'EL': 'Elektrofag',
    'HS': 'Helse- og oppvekstfag',
    'ID': 'Idrettsfag',
    'KD': 'Kunst, design og arkitektur',
    'MD': 'Musikk, dans og drama',
    'ME': 'Medier og kommunikasjon',
    'NA': 'Naturbruk',
    'RM': 'Restaurant- og matfag',
    'SS': 'Service og samferdsel',
    'ST': 'Studiespesialisering',
    'TP': 'Teknikk og industriell produksjon',
}


def _sfj_program(label):
    m = re.match(r'^([A-Z]{2}),\s*(.+)$', common.squash(label))
    if not m:
        return None
    code, rest = m.group(1), m.group(2).lower()
    base = SFJ_PROGRAMS.get(code)
    if not base:
        return None
    if code == 'MD':
        return common.canon_program('Musikk, dans og drama, ' + rest.rsplit(',', 1)[-1].strip())
    if code == 'NA' and 'med' in rest:
        return common.canon_program('Naturbruk ' + rest[rest.index('med'):])
    return base


def _sfj(path, warn):
    """Sogn og Fjordane's 1. inntak Vg1 table -> rows in the canonical series.

    A ruled table: the utdanningsprogram cell spans its schools, so it is
    carried down the group; «alle» is a programme with no queue and «ikkje
    tilbod» a programme not offered that year.
    """
    found = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for tbl in page.find_tables():
                rows = tbl.extract()
                years, group = None, None
                for r in rows:
                    cells = [common.squash(c or '') for c in r]
                    if len(cells) < 4:
                        continue
                    ys = [int(c[:4]) for c in cells[2:] if re.match(r'^20\d\d/\d\d$', c)]
                    if len(ys) == len(cells) - 2:
                        years = ys
                        continue
                    if cells[0] == 'Utdanningsprogram' or not years:
                        continue
                    if cells[0]:
                        group = _sfj_program(cells[0])
                        if group is None:
                            warn.append(f'{os.path.basename(path)}: unknown '
                                        f'utdanningsprogram {cells[0]!r}')
                    school = cells[1]
                    if not group or not school:
                        continue
                    for y, raw in zip(years, cells[2:]):
                        v = common.classify_cell(raw, min_value=0)
                        if v is not None:
                            found.setdefault((school, group), {})[y] = v
    if not found:
        warn.append(f'{os.path.basename(path)}: no rows parsed')
    out = []
    for (school, program), values in found.items():
        school, merged = _identity(school)
        row = {'school': school, 'program': program, 'level': 'Vg1',
               'values': values, 'county': META['fylke'], 'round': '1'}
        if merged:
            row['merged_from'], row['merged_year'] = merged
        out.append(row)
    return out


def _hordaland(path, year, warn):
    rows = []
    with pdfplumber.open(path) as pdf:
        text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
    for line in text.split('\n'):
        m = HORD_RE.match(common.squash(line))
        if not m:
            continue
        name = _hordaland_name(m.group('name'))
        if not name:
            warn.append(f'{os.path.basename(path)}: unknown school {m.group("name")!r}')
            continue
        # both columns belong to one series. Emitting a row per year made the
        # merge treat the second as a second occurrence of the same programme,
        # so every one of these schools carried a duplicate Studiespesialisering
        # and the older year never reached the trend line.
        values = {}
        for y, g in ((year, 'now'), (year - 1, 'prev')):
            v = common.classify_cell(m.group(g).replace('.', ','))
            if v is not None:
                values[y] = v
        if not values:
            continue
        rows.append({'school': name, 'program': 'Studiespesialisering',
                     'level': 'Vg1', 'values': values,
                     'county': META['fylke'], 'round': '1'})
    if not rows:
        warn.append(f'{os.path.basename(path)}: no rows parsed')
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    named = set(HORDALAND) | {HORDALAND_FULL, SFJ_VG1}
    files = sorted((f for f in os.listdir(SRC)
                    if f.endswith('.pdf') and f not in named), reverse=True)
    by_year = {}
    for fname in files:
        m = re.search(r'^vestland_(20\d\d)-\d\d_(\d)inntak(-rev\d+)?\.pdf$', fname)
        if not m:
            warn.append(f'{fname}: cannot read year/round from filename')
            continue
        # a county reprint that corrects a figure gets a new file name
        # (sources are never overwritten); the highest revision is the one read
        slot = by_year.setdefault(int(m.group(1)), {})
        if m.group(2) not in slot or (m.group(3) or '') > re.sub(
                r'^.*?(-rev\d+)?\.pdf$', r'\1', slot[m.group(2)]):
            slot[m.group(2)] = fname

    for year in sorted(by_year, reverse=True):
        rounds = by_year[year]
        primary = rounds.get('1') or rounds.get('3')
        read = _matrix if year <= 2020 else _parse
        cells = read(os.path.join(SRC, primary), warn)
        alt = (read(os.path.join(SRC, rounds['3']), warn)
               if ('1' in rounds and '3' in rounds) else {})
        rows = []
        if not cells:
            continue
        for (school, program, level), v in cells.items():
            school, merged = _identity(school)
            row = {'school': school, 'program': program, 'level': level,
                   'values': {year: v}, 'county': META['fylke'],
                   'round': '1' if '1' in rounds else '3'}
            if merged:
                row['merged_from'], row['merged_year'] = merged
            if (school, program, level) in alt:
                row['values_r3'] = {year: alt[(school, program, level)]}
            rows.append(row)
        out.append((primary, rows))

    for fname, year in HORDALAND.items():
        path = os.path.join(SRC, fname)
        if os.path.exists(path):
            out.append((fname, _hordaland(path, year, warn)))
    for fname, read in ((SFJ_VG1, _sfj), (HORDALAND_FULL, _hordaland_full)):
        path = os.path.join(SRC, fname)
        if os.path.exists(path):
            out.append((fname, read(path, warn)))
    return out, warn

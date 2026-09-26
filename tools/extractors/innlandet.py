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

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'innlandet')

META = {
    'code': '34', 'fylke': 'Innlandet', 'round': '2', 'rights': 'ungdomsrett',
    'free_choice': False, 'levels': 'Vg1–Vg2',
    # innlandetfylke.no does not host or link this PDF — its own search, its
    # sitemap and the Wayback index all return nothing for "poenggrense".
    # The file is distributed through vilbli's county-information block (the
    # same channel as Rogaland and Trøndelag); the attachment below is
    # byte-for-byte the 2024–2026 file in sources/ (verified 5 Sept 2026)
    'source': 'https://www.vilbli.no/nb/innlandet/a/poengsum-og-karakterer-6',
    'source_file': 'https://webservice.vilbli.no/Data/Artikkelvedlegg/041513/Poenggrense+2024-2026.pdf',
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
                    if len(r) > 5:
                        # a one-row table can come back grid-mangled, with the
                        # real cells padded by empty columns (seen once: the
                        # Dombås Studiespesialisering row split into 7 cells,
                        # which silently dropped the school's only 2020 line).
                        # Compact and reread only when the shape is unambiguous.
                        nz = [c for c in r if c and c.strip()]
                        if len(nz) == 3:
                            r = nz
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


# ---- Hedmark 2012-2018: «Poenggrense ved inntak til videregående skoler i
# Hedmark», the county's yearly overview for counsellors, five intakes per
# edition. The PDFs are gone; six editions survive as docplayer.me page text
# (sources/innlandet/hedmark-poenggrense-<first>-<last>.transcript.txt, T2).
# Their own legend: «Tallene i tabellene viser utregnet gjennomsnittskarakter
# for den sist inntatte med ungdomsrett ved 2. inntaket … Ved ledige plasser
# signaliseres ingen gjennomsnittskarakter» — so the round is stated (2, the
# same as Innlandet's own tables), «ledig» is open, and a grade average to one
# decimal is ×10 points (the press prints «45,6 poeng … 4,56 i
# gjennomsnittskarakter» for the same scale). Blank cells are not in the text
# at all, so a row with fewer than five figures does not say which years they
# belong to; see _hedmark_spans. Vg3 rows are skipped: the legend says Vg3
# carries no figure («Det oppgis ingen gjennomsnittskarakter for inntaket til
# Vg3-nivået»), yet a few Påbygg rows print numbers anyway.
HEDMARK_FIRST_YEAR = 2012          # the dataset's first year; the editions reach back to 2008
HEDMARK_SCHOOLS = [
    'Nord-Østerdal videregående skole', 'Storsteigen videregående skole',
    'Elverum videregående skole', 'Midt-Østerdal videregående skole',
    'Trysil videregående skole', 'Hamar katedralskole', 'Stange videregående skole',
    'Ringsaker videregående skole', 'Jønsberg videregående skole',
    'Storhamar videregående skole', 'Sentrum videregående skole',
    'Øvrebyen videregående skole', 'Solør videregående skole',
    'Skarnes videregående skole',
]
# a region heading runs straight into its first school's name
_HEDMARK_HEAD = re.compile(
    r'(?:Region \d+ ?(?:[-–] ?)?)?(?:(?:Nord-Østerdal|Sør-Østerdal|Hedmarken|Glåmdalen) )?('
    + '|'.join(map(re.escape, HEDMARK_SCHOOLS)) + r')(?: \(avd\. Koppang\))?')
_HEDMARK_VAL = re.compile(r'^(\d,\d{1,2}|\d|ledig|lrdig|l?agt ned)$', re.I)
# The docplayer text splits some decimals into two broken tokens («2, ,8»),
# and a digit goes missing with them: Nord-Østerdal's Vg2 Arbeidsmaskiner
# reads «3,1 2, ,8» in one edition, «2, ,8 3,1» in the next and «2 3,8 3,1 3,9
# 2,2» in a third. Such a row is unreadable in that edition and is dropped.
_HEDMARK_BROKEN = re.compile(r'^(\d,|,\d)$')
# spelling, abbreviation and typo variants of one programme, to the county's
# own later spelling; renamed programmes keep their own names
HEDMARK_NAMES = {
    'bygg og anleggsteknikk': 'Bygg- og anleggsteknikk',
    'helse/oppvekst, sk 3 år': 'Helse- og oppvekstfag, SK 3 år',
    'kkunst, design og arkitektur': 'Kunst, design og arkitektur',
    'musikk/dans/drama (dans)': 'Musikk, dans og drama, dans',
    'musikk/dans/drama (drama)': 'Musikk, dans og drama, drama',
    'musikk/dans/drama (musikk)': 'Musikk, dans og drama, musikk',
    'naturbruk (hest)': 'Naturbruk, hest',
    'service, og samferdsel, sk 3 år': 'Service og samferdsel, SK 3 år',
    'service/samf. ysk- 4 årig': 'Service og samferdsel, YSK 4 år',
    'studiespes. med formgivingsfag': 'Studiespesialisering med formgivingsfag',
    'studiespesialisering med formgivningsfag': 'Studiespesialisering med formgivingsfag',
    'studiespesialisering med forb. ib': 'Studiespesialisering, forberedende IB',
    'studiespesialisering- toppidrett': 'Studiespesialisering, toppidrett',
    'anl.gartner/idr.anl.fag': 'Anleggsgartner- og idrettsanleggsfag',
    'anleggsgartner- og idrettsanlegg': 'Anleggsgartner- og idrettsanleggsfag',
    'anleggsteknikk(landslinje)': 'Anleggsteknikk, landslinje',
    'arbeisdsmaskiner': 'Arbeidsmaskiner',
    'barne- og ungd.arb, sk 3 år': 'Barne- og ungdomsarbeiderfag, SK 3 år',
    'barne- og ungdomsarbeiderfaget': 'Barne- og ungdomsarbeiderfag',
    'barne-og ungdomsarbeiderfag': 'Barne- og ungdomsarbeiderfag',
    'data og elektronikk': 'Data og elektronikk',
    'helsearbeiderfaget': 'Helsearbeiderfag',
    'helsearbeiderfaget, sk 3 år': 'Helsearbeiderfag, SK 3 år',
    'hest og hovslagerfag': 'Heste- og hovslagerfag',
    'ikt- servicefag': 'IKT-servicefag',
    'interiør og ustillingsdesign': 'Interiør og utstillingsdesign',
    'klima, energi, og miljøteknikk': 'Klima-, energi- og miljøteknikk',
    'klima-, energi og miljøteknikk': 'Klima-, energi- og miljøteknikk',
    'kokk og servitørfag': 'Kokk- og servitørfag',
    'landbr/gartn.nær, friluftsliv': 'Landbruk/gartnernæring, friluftsliv',
    'meieproduksjon': 'Medieproduksjon',
    'salg/service/sikkerhet': 'Salg, service og sikkerhet',
    'salg/service/sikkerhet, ysk 4 år': 'Salg, service og sikkerhet, YSK 4 år',
    'salg/service/sikkerhet,sk 3 år': 'Salg, service og sikkerhet, SK 3 år',
}


def _hedmark_cell(tok):
    t = tok.lower()
    if t in ('ledig', 'lrdig'):             # «lrdig»: a typo in the 2011-2015 edition
        return 'open'
    if t.endswith('agt ned'):               # «lagt ned»: closed that year
        return 'U'
    return round(float(t.replace(',', '.')) * 10, 1)


def _hedmark_program(name):
    n = common.squash(name)
    return common.canon_program(HEDMARK_NAMES.get(n.lower(), n))


def _hedmark_edition(path, warn):
    """One edition -> {(school, level, program): [cells]}; a broken row is None."""
    pages = [ln.split('\t', 1)[1] for ln in open(path, encoding='utf-8')
             if not ln.startswith('#') and '\t' in ln]
    # «lagt ned» is two words; glue it so the value run reads it as one token
    body = re.sub(r'\bl?agt ned\b', lambda m: m.group(0).replace(' ', '_'), ' '.join(pages))
    parts = _HEDMARK_HEAD.split(body)
    out, fname = {}, os.path.basename(path)
    for school, seg in zip(parts[1::2], parts[2::2]):
        chunks = re.split(r'\b(V[Gg][1-3])\s+', seg)
        for lvl, txt in zip(chunks[1::2], chunks[2::2]):
            level = 'Vg' + lvl[-1]
            if level == 'Vg3':
                continue
            toks = [t.replace('_', ' ') for t in txt.split()]
            if any(_HEDMARK_BROKEN.match(t) for t in toks):
                name = ' '.join(t for t in toks
                                if not re.match(r'^[\d,]', t) and t.lower() != 'ledig')
                if name:
                    out[(school, level, _hedmark_program(name))] = None
                warn.append(f'Innlandet: {fname}: {school} {level} «{" ".join(toks)}» '
                            f'has a broken figure, row dropped from this edition')
                continue
            j = len(toks)
            while j and _HEDMARK_VAL.match(toks[j - 1]):
                j -= 1
            name, vals = ' '.join(toks[:j]), toks[j:]
            if not name or not vals:
                warn.append(f'Innlandet: {fname}: {school} {level} «{" ".join(toks)}» unreadable, dropped')
                continue
            key = (school, level, _hedmark_program(name))
            if key in out:
                warn.append(f'Innlandet: {fname}: {school} {level} «{key[2]}» printed twice, dropped')
                out[key] = None
                continue
            out[key] = [_hedmark_cell(v) for v in vals]
    return out


def _hedmark_spans(editions):
    """The years of every short row's figures, read from all editions at once.

    A row with five figures is unambiguous. A shorter one is placed by
    assuming the programme ran in one unbroken stretch of years [s, e]: every
    edition that prints the row must then show exactly as many figures as its
    window shares with [s, e], every edition that leaves it out must share
    none, and two editions that place a figure in the same year must agree
    (the oldest edition excepted: 2008-2012 differs from all later ones on
    five 2012 cells, and the later ones win). A row is kept only if every
    stretch that passes gives each edition the same years; a programme with a
    gap year, or one the editions leave ambiguous, is dropped."""
    order = sorted(editions, reverse=True)
    oldest = order[-1]
    first, last = oldest[0], order[0][1]
    placed = {}
    for key in {k for rows in editions.values() for k in rows}:
        layouts = set()
        for s in range(first, last + 1):
            for e in range(s, last + 1):
                got, ok = {}, True
                for ed in order:
                    rows = editions[ed]
                    years = [y for y in range(ed[0], ed[1] + 1) if s <= y <= e]
                    if key not in rows:
                        ok = not years
                    elif rows[key] is None:       # broken in this edition: no evidence
                        continue
                    elif len(rows[key]) != len(years):
                        ok = False
                    else:
                        for y, v in zip(years, rows[key]):
                            if y in got and got[y] != v and ed != oldest:
                                ok = False
                            got.setdefault(y, v)
                    if not ok:
                        break
                if ok:
                    layouts.add(tuple(
                        tuple(y for y in range(ed[0], ed[1] + 1) if s <= y <= e) for ed in order))
        if len(layouts) == 1:
            placed[key] = dict(zip(order, next(iter(layouts))))
    return placed


def _parse_hedmark(warn):
    files = sorted(f for f in os.listdir(SRC)
                   if re.fullmatch(r'hedmark-poenggrense-\d{4}-\d{4}\.transcript\.txt', f))
    editions = {}
    for f in files:
        a, b = map(int, re.findall(r'\d{4}', f))
        editions[(a, b)] = _hedmark_edition(os.path.join(SRC, f), warn)
    if not editions:
        return []
    placed = _hedmark_spans(editions)
    out, dropped = [], []
    for (a, b), rows in sorted(editions.items(), reverse=True):
        rs = []
        for key, vals in rows.items():
            if vals is None:
                continue
            years = placed.get(key, {}).get((a, b))
            if years is None and len(vals) == b - a + 1:
                years = tuple(range(a, b + 1))
            if years is None:
                dropped.append((a, b, key))
                continue
            values = {y: v for y, v in zip(years, vals) if y >= HEDMARK_FIRST_YEAR}
            if values:
                school, level, program = key
                # the county's own file is gone; the text is docplayer's copy
                # of it, so the figures carry the reprint flag
                rs.append({'school': school, 'program': program, 'level': level,
                           'values': values, 'county': META['fylke'], 'round': '2',
                           'reprint': True})
        out.append((f'hedmark-poenggrense-{a}-{b}.transcript.txt', rs))
    if dropped:
        warn.append(f'Innlandet: Hedmark: {len(dropped)} short rows (in '
                    f'{len({k for *_, k in dropped})} series) whose years the editions leave '
                    f'ambiguous, dropped (see _hedmark_spans)')
    return out


# the rolling three-year matrices, newest first; every other PDF in the folder
# (the 2026 applicant-count tables, a future drop-in) is ignored with a warning
MATRIX_FILES = ['innlandet-2024-2026-2inntak.pdf', 'innlandet_2023-2025_2inntak.pdf']


# Dokka videregående skole became an avdeling of Raufoss from the 2025/26
# school year (Nordre Land kommune, 04.10.2024); the county's 2026 table
# prints the new name, the FOI files the old one. One school, one series.
MERGED = {
    'Dokka videregående skole': ('Raufoss videregående skole avd Dokka', 2025),
}


def _apply_merges(rows):
    for r in rows:
        if r['school'] in MERGED:
            new, year = MERGED[r['school']]
            r['merged_from'], r['merged_year'] = r['school'], year
            r['school'] = new
    return rows


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    known = MATRIX_FILES + list(INNSYN_FILES)
    for fname in sorted(os.listdir(SRC)):
        if fname.endswith('.pdf') and fname not in known:
            warn.append(f'{META["fylke"]}: {fname} is not a poenggrense table, ignored '
                        f'(add it to MATRIX_FILES or INNSYN_FILES if it is one)')
    for fname in MATRIX_FILES + sorted(INNSYN_FILES, reverse=True):
        if not os.path.exists(os.path.join(SRC, fname)):
            warn.append(f'{META["fylke"]}: missing source {fname}')
            continue
        if fname in INNSYN_FILES:
            out.append((fname, _apply_merges(INNSYN_FILES[fname](os.path.join(SRC, fname)))))
            continue
        rows = []
        with pdfplumber.open(os.path.join(SRC, fname)) as pdf:
            school, level, cols = None, 'Vg1', None
            group_rows, last_row = [], None
            # rows printed before their school's name (see the Nivå branch below)
            pending, group_niva = [], False
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
                        group_rows, pending = pending, []
                        for r in group_rows:
                            r['school'] = school
                        group_niva = bool(group_rows)
                    if niva_toks:
                        d = common.norm(niva_toks[0]['text'])
                        if d in ('1', '2', '3', '4'):
                            # A page break can fall between a school's first row
                            # and its name: the 2024–2026 table ends page 18 on
                            # «1 Idrettsfag 46,3 44,4 41,9» and prints «Øvrebyen
                            # videregående skole» at the top of page 19. A Nivå
                            # «1» with no name, in a group that already carries a
                            # Nivå, opens the next school; read under the one
                            # above, the row collided with Hadeland's own
                            # Idrettsfag and Øvrebyen lost its 2026 figure.
                            if d == '1' and not name_toks and group_niva:
                                school, group_rows = None, []
                            level = f'Vg{d}'
                            group_niva = True
                    # A programme name can wrap too, and its second line
                    # carries nothing else: no school, no level, no values.
                    # Dropping it published the row under a truncated name
                    # ("Håndverk, design og"), which then classified as
                    # nothing at all. Give the tail back to the row it
                    # belongs to, exactly as a wrapped school name is.
                    if prog_toks and not name_toks and not niva_toks and not val_toks:
                        if last_row is not None:
                            tail = common.squash(' '.join(common.norm(w['text'])
                                                          for w in prog_toks))
                            joiner = '' if last_row['program'].endswith((',', '-')) else ' '
                            last_row['program'] = common.canon_program(
                                last_row['program'] + joiner + tail)
                        continue
                    program = common.canon_program(' '.join(
                        common.norm(w['text']) for w in prog_toks))
                    if (not school and not group_niva) or not program or not val_toks:
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
                        (group_rows if school else pending).append(row)
                        last_row = row
        # the first row of a group is emitted before the school name's
        # continuation line is seen, so "Nord-Østerdal" and "Nord-Østerdal
        # videregående skole" both appear — fold the prefix into the full name.
        # Only a TRUNCATION may be folded: a name that already ends in the word
        # for a school is complete, and one school's name is legitimately the
        # prefix of a branch campus's. Folding those merged Raufoss vgs into
        # "Raufoss vgs avd Dokka" and published the parent's own thresholds
        # under its branch — 13 series of the wrong school.
        for r in [r for r in rows if not r['school']]:
            warn.append(f'{META["fylke"]}: {fname}: «{r["program"]}» {r["level"]} has no school name, dropped')
        rows = [r for r in rows if r['school']]
        COMPLETE = ('skole', 'skule', 'gymnas', 'katedralskole')
        names = {r['school'] for r in rows}
        fold = {}
        for short in names:
            if short.lower().endswith(COMPLETE):
                continue
            longer = [n for n in names if n != short and n.startswith(short + ' ')]
            if len(longer) == 1:
                fold[short] = longer[0]
        if fold:
            for r in rows:
                r['school'] = fold.get(r['school'], r['school'])
        out.append((fname, _apply_merges(rows)))
    # Hedmark 2012-2018 last: older than every Innlandet file, so a (school,
    # programme, year) the newer tables also print keeps their figure
    out.extend(_parse_hedmark(warn))
    return out, warn

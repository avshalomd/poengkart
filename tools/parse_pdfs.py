#!/usr/bin/env python3
"""Parse Rogaland poenggrenser PDFs (2018-2026) into one merged dataset.

Coordinate-based extraction (pdfplumber): every word carries an x/y, so year
columns are resolved by x-proximity to the header's year positions and Vg-level
groups by the table's own rect bands. This replaces the earlier text-flow
heuristics, which mis-parsed shared pages, sparse rows and the 2019-2020 file.

Handles, deliberately:
  * two (or more) school tables on one page — a school title resets the header
  * continuation pages — school/header carry over when a page has neither
  * source header typos — e.g. Kopervik's "2023 2023 2025" (middle column is 2024)
  * source spelling typos — "Ingen ventesliste", "Fortrinsrett", "Fortinnsrett"
  * non-Rogaland schools on the national landslinje pages (blacklisted)

Cell semantics in web/public/data/schools.json:
  number  -> threshold (last admitted applicant's points; grade avg x 10)
  "open"  -> no waitlist / everyone qualified admitted
  "F"     -> fortrinnsrett quota (statutory priority, outside points competition)
  "D"     -> admission by documentation (IB, toppidrett) — no threshold
  "U"     -> program discontinued that year (Utgår)
  absent  -> no data (program not offered / not in any source PDF)

Outputs web/public/data/schools.json (+ data/source-drift.json for cells where the
county's own PDFs disagree with each other).
"""

import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from taxonomy import classify_category   # noqa: E402  (one taxonomy, in one place)

import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'sources', 'rogaland')
OUT = os.path.join(HERE, '..', 'web', 'public', 'data')
DRIFT = os.path.join(HERE, '..', 'data', 'source-drift.json')

# newest first: on overlapping (school, program, level, year) the newest wins
FILES = [
    'poenggrenser-rogaland-2024-2026-official-rev2.pdf',
    'poenggrenser-rogaland-2024-2026-official.pdf',
    'poenggrenser-rogaland-2023-2025-official.pdf',
    'poenggrenser-rogaland-2022-2024-wayback.pdf',
    'poenggrenser-rogaland-2023-2024.pdf',
    'poenggrenser-rogaland-2022-2023.pdf',
    'poenggrenser-rogaland-2021-2022.pdf',
    'poenggrenser-rogaland-2019-2020.pdf',
]

# Each edition prints its year header on every school's page, and one page
# per edition carries a wrong one — Hetland's reads "2019 2020 2022" in the
# 2022-23 edition and "2020 2022 2023" in the next, Kopervik's "2022 2023 2023"
# and "2023 2023 2025". The document's own majority header is the truth: a page
# whose header disagrees with it is re-labelled and the repair is logged. This
# replaced a hand-kept list of "uncertain" years (QA 2026-08-19; data-hole
# sweep 2026-09-05 found the cause).

# non-Rogaland schools appearing on the national "landslinje flyfag" pages
BLACKLIST = {'bardufoss', 'bardufoss videregående skole',
             'skedsmo videregående skole', 'bodø videregående skole',
             'fosen videregående skole', 'ffff fosen videregående skole'}
SCHOOL_ALIASES = {
    'stavanger katedral skole': 'Stavanger Katedralskole',
    'stavanger katedralskole': 'Stavanger Katedralskole',
    'landslinje flyfag - sola videregående skole': 'Sola videregående skole',
    'sola videregående skole landslinje flyfag': 'Sola videregående skole',
}
VG1_PROGRAMS = {
    'studiespesialisering', 'idrettsfag', 'kunst, design og arkitektur',
    'medier og kommunikasjon', 'musikk, dans og drama', 'bygg og anleggsteknikk',
    'bygg- og anleggsteknikk', 'elektro og datateknologi', 'elektrofag',
    'design og håndverk', 'frisør, blomster, interiør og eksponeringsdesign',
    'helse og oppvekstfag', 'helse- og oppvekstfag',
    'håndverk, design og produktutvikling',
    'informasjonsteknologi og medieproduksjon', 'naturbruk',
    'restaurant- og matfag', 'restaurant og matfag', 'service og samferdsel',
    'salg, service og reiseliv', 'teknologi- og industrifag',
    'teknikk og industriell produksjon',
}
VG3_HINTS = {'påbygg til generell studiekompetanse'}

# same program, different spelling across files: normalize so series merge
PROGRAM_ALIASES = {
    'språk, samfunnsfag og økonomi': 'Språk, samfunn og økonomi',
    'helse og oppvekstfag': 'Helse- og oppvekstfag',
    'restaurant og matfag': 'Restaurant- og matfag',
    'bygg og anleggsteknikk': 'Bygg- og anleggsteknikk',
    'teknologi og industrifag': 'Teknologi- og industrifag',
    'barne- og ungdomsarbeiderfag': 'Barne- og ungdomsarbeider',
    'helsearbeider': 'Helsearbeiderfag',
    'eletro og datateknologi': 'Elektro og datateknologi',     # Jåttå's typo, 2019-2026
    'språk, samfunnsfag og økonomi, toppidrett': 'Språk, samfunn og økonomi, toppidrett',
}

# value vocabulary (incl. the county's own typos) — anything else in a value
# column position is treated as part of the program name
VOCAB = {'ingen', 'venteliste', 'ventelise', 'ventelis', 'ventesliste',
         'fortrinnsrett', 'fortinnsrett', 'fortrinsrett', 'fortrinn',
         'utgår', 'ledige', 'plasser', '-', 'dokumentasjon'}
NUM_RE = re.compile(r'^\d+(?:,\d+)?$')
YEAR_RE = re.compile(r'^20\d\d$')
LEVEL_RE = re.compile(r'^Vg\d$')
COL_HALFSPAN = 62      # pt: how close a word must sit to a year-column centre
MIN_PLAUSIBLE = 8.0    # bare integers below this are parse noise (course-code digits); a printed decimal is always a threshold


def norm(s):
    return unicodedata.normalize('NFKC', s).replace('\xa0', ' ').replace('‐', '-').strip()


def squash(s):
    return re.sub(r'\s+', ' ', s).strip()


def classify_cell(txt):
    t = squash(txt).lower()
    if t.startswith('ingen vente') or t.startswith('ledige'):
        return 'open'
    if t.startswith('fort'):
        return 'F'
    if t.startswith('utgår'):
        return 'U'
    if t.startswith('dokumentasjon'):
        return 'D'
    if t == '-':
        return None
    if NUM_RE.match(t):
        return float(t.replace(',', '.'))
    return None


def is_school_title(txt):
    l = txt.lower()
    if any(ch.isdigit() for ch in txt) or 'programområde' in l:
        return False
    return ('skole' in l or 'skule' in l or 'gymnas' in l) and len(l) < 70


def canon_school(name):
    key = squash(name).lower()
    return SCHOOL_ALIASES.get(key, squash(name))


def canon_program(name):
    n = squash(name)
    n = re.sub(r',(?=\S)', ', ', n)          # "Kunst,design" -> "Kunst, design"
    n = re.sub(r'\s*\.\s*$', '', n)           # trailing period
    n = re.sub(r'\s+', ' ', n).strip(' -–')
    return PROGRAM_ALIASES.get(n.lower(), n)


def guess_level(program):
    p = program.lower()
    if p in VG1_PROGRAMS:
        return 'Vg1'
    if p in VG3_HINTS:
        return 'Vg3'
    return 'Vg2/Vg3'


def repair_years(years):
    """Fix source header typos like Kopervik's '2023 2023 2025' -> 2023/24/25."""
    if len(set(years)) == len(years):
        return years, None
    fixed = list(years)
    for i in range(1, len(fixed)):
        if fixed[i] <= fixed[i - 1]:
            fixed[i] = fixed[i - 1] + 1
    if len(set(fixed)) == len(fixed) and all(
            b - a == 1 for a, b in zip(fixed, fixed[1:])):
        return fixed, f'header years {years} repaired to {fixed}'
    return years, f'DUPLICATE header years {years} left as-is'


def cluster_lines(words, tol=2.0):
    ws = sorted(words, key=lambda w: (w['top'], w['x0']))
    lines, cur, last = [], [], None
    for w in ws:
        if last is None or w['top'] - last <= tol:
            cur.append(w)
        else:
            lines.append(cur)
            cur = [w]
        last = w['top']
    if cur:
        lines.append(cur)
    return [sorted(l, key=lambda w: w['x0']) for l in lines]


def _band_rects(page):
    return [r for r in page.rects
            if (r['x1'] - r['x0']) > 300 and (r['bottom'] - r['top']) > 8]


def _fill(r):
    c = r.get('non_stroking_color')
    return tuple(round(x, 2) for x in c) if isinstance(c, (list, tuple)) and len(c) >= 3 else None


def page_words(page):
    """The page's words, with a level label printed as two words joined up:
    Dalane's påbygg band reads «Vg 4», and split in two it was neither a
    level marker nor part of the name, so the row fell to the name guess."""
    words = page.extract_words()
    out = []
    for w in words:
        prev = out[-1] if out else None
        if (prev and prev['text'] == 'Vg' and re.fullmatch(r'\d', w['text'])
                and abs(w['top'] - prev['top']) < 2 and 0 <= w['x0'] - prev['x1'] < 8):
            out[-1] = {**prev, 'text': 'Vg' + w['text'], 'x1': w['x1']}
            continue
        out.append(w)
    return out


def band_colours(pdf):
    """The table fills each level's band in its own colour, the same on every
    page. Learnt from the bands that carry a marker, so a band printed without
    one can still be named: Sola's Vg2 block in the 2024–2026 edition has no
    «Vg2» beside it, and its rows (Flyfag, Realfag, Dronefag …) fell back to
    the name guess, «Vg2/Vg3», splitting three series in two."""
    votes = {}
    for page in pdf.pages:
        words = page_words(page)
        for top, bottom, lvl, col in _marked_bands(page, words):
            if col is not None:
                votes.setdefault(col, {}).setdefault(lvl, 0)
                votes[col][lvl] += 1
    # a colour names a level only when it never names another
    return {col: next(iter(v)) for col, v in votes.items() if len(v) == 1}


def _marked_bands(page, words):
    cands = _band_rects(page)
    marks = [(w, norm(w['text'])) for w in words
             if LEVEL_RE.match(norm(w['text'])) and w['x0'] < 130]
    out = []
    for w, lvl in marks:
        cy = (w['top'] + w['bottom']) / 2
        inside = [r for r in cands if r['top'] - 1 <= cy <= r['bottom'] + 1]
        if inside:
            r = min(inside, key=lambda r: r['bottom'] - r['top'])
            out.append((r['top'], r['bottom'], lvl, _fill(r)))
    return out


def level_bands(page, words, colours=None):
    """Vg-level groups come from the table's own rect bands; the level marker
    word inside a band names it. Returns [(top, bottom, 'Vg1'), ...]."""
    cands = _band_rects(page)
    marks = [(w, norm(w['text'])) for w in words
             if LEVEL_RE.match(norm(w['text'])) and w['x0'] < 130]
    bands = []
    for w, lvl in marks:
        cy = (w['top'] + w['bottom']) / 2
        inside = [r for r in cands if r['top'] - 1 <= cy <= r['bottom'] + 1]
        if inside:
            r = min(inside, key=lambda r: r['bottom'] - r['top'])
            bands.append((r['top'], r['bottom'], lvl))
        else:
            bands.append((w['top'] - 6, w['bottom'] + 6, lvl))
    # the marked bands first, then every other band by its colour
    for r in cands:
        lvl = (colours or {}).get(_fill(r))
        if lvl and _fill(r) not in ((1, 1, 1), (1.0, 1.0, 1.0)):
            bands.append((r['top'], r['bottom'], lvl))
    return bands


def band_level(bands, line):
    cy = sum((w['top'] + w['bottom']) / 2 for w in line) / len(line)
    for top, bottom, lvl in bands:
        if top - 1 <= cy <= bottom + 1:
            return lvl
    return None


def modal_headers(pdf):
    """The year header most pages of the document print, per column count."""
    seen = {}
    for page in pdf.pages:
        for line in cluster_lines(page.extract_words()):
            if 'Programområde' not in squash(' '.join(norm(w['text']) for w in line)):
                continue
            ys = tuple(int(norm(w['text'])) for w in line if YEAR_RE.match(norm(w['text'])))
            if ys:
                ys = tuple(repair_years(list(ys))[0])
                seen.setdefault(len(ys), {})[ys] = seen.get(len(ys), {}).get(ys, 0) + 1
    return {n: max(c, key=c.get) for n, c in seen.items()}


def parse_pdf(path, warn):
    """Yield row dicts with exact per-year cells."""
    rows = []
    with pdfplumber.open(path) as pdf:
        modal = modal_headers(pdf)
        colours = band_colours(pdf)
        school, year_cols = None, None      # carry across pages (continuations)
        for pi, page in enumerate(pdf.pages):
            words = page_words(page)
            lines = cluster_lines(words)
            bands = level_bands(page, words, colours)
            for line in lines:
                texts = [norm(w['text']) for w in line]
                joined = squash(' '.join(texts))
                if not joined:
                    continue
                if joined == 'Bardufoss':                 # bare title, blacklisted
                    school, year_cols = 'Bardufoss videregående skole', None
                    continue
                if is_school_title(joined):
                    school, year_cols = canon_school(joined), None
                    continue
                if 'Programområde' in joined:
                    ycs = [(int(norm(w['text'])), (w['x0'] + w['x1']) / 2)
                           for w in line if YEAR_RE.match(norm(w['text']))]
                    if ycs:
                        years, note = repair_years([y for y, _ in ycs])
                        if note:
                            warn.append(f'{os.path.basename(path)} p{pi+1} '
                                        f'{school}: {note}')
                        want = modal.get(len(years))
                        if want and tuple(years) != want:
                            warn.append(f'{os.path.basename(path)} p{pi+1} '
                                        f'{school}: header years {years} relabelled '
                                        f'to the edition\'s {list(want)}')
                            years = list(want)
                        year_cols = list(zip(years, [x for _, x in ycs]))
                    continue
                if school is None or year_cols is None:
                    if re.search(r'\d,\d|Ingen|Fortrinn|Utgår', joined):
                        warn.append(f'{os.path.basename(path)} p{pi+1}: '
                                    f'orphan row (no school/header): {joined[:70]}')
                    continue
                if school.lower() in BLACKLIST:
                    continue

                min_colx = min(x for _, x in year_cols)
                namews, valws = [], []
                for w in line:
                    t = norm(w['text'])
                    cx = (w['x0'] + w['x1']) / 2
                    if LEVEL_RE.match(t) and w['x0'] < 130:
                        continue                      # level marker, not content
                    near = min(abs(cx - x) for _, x in year_cols)
                    if ((NUM_RE.match(t) or t.lower() in VOCAB)
                            and near <= COL_HALFSPAN and cx > min_colx - COL_HALFSPAN):
                        valws.append((t, cx))
                    else:
                        namews.append(t)
                if not valws:
                    continue
                program = canon_program(' '.join(namews))
                if not program:
                    warn.append(f'{os.path.basename(path)} p{pi+1} {school}: '
                                f'values with no program name: {joined[:70]}')
                    continue

                buckets = {}
                for t, cx in valws:
                    yi = min(range(len(year_cols)),
                             key=lambda i: abs(year_cols[i][1] - cx))
                    buckets.setdefault(yi, []).append(t)
                values = {}
                for yi, toks in buckets.items():
                    v = classify_cell(' '.join(toks))
                    if v is None:
                        continue
                    # course-code digits never carry a decimal separator, so a
                    # printed "3,9" is the county's own figure (kept; a newer
                    # edition that disagrees wins the merge and the drift log)
                    if isinstance(v, float) and v < MIN_PLAUSIBLE and ',' not in ''.join(toks):
                        warn.append(f'{os.path.basename(path)} p{pi+1} {school} '
                                    f'"{program}" {year_cols[yi][0]}: implausible '
                                    f'value {v} dropped')
                        continue
                    values[year_cols[yi][0]] = v
                if values:
                    rows.append({
                        'school': school, 'program': program,
                        'level': band_level(bands, line) or guess_level(program),
                        'values': values,
                    })
    return rows


def validate(schools, warn):
    """Loud checks — every one of these has caught a real defect before."""
    problems = []
    for name, progs in schools.items():
        for rec in progs.values():
            p = rec['program']
            # a trailing standalone number is a swallowed threshold; a trailing
            # alphanumeric token (PBPBY4P2) is a legitimate Vigo course code
            if re.search(r'\s\d+(?:,\d+)?$', p):
                problems.append(f'{name}: threshold glued onto name: "{p}"')
            if re.search(r'ventelis|fortrinn|fortinn|utgår|ledige|dokumentasjon',
                         p, re.I):
                problems.append(f'{name}: value token glued into name: "{p}"')
            if rec['category'] == 'annet':
                problems.append(f'{name}: uncategorised program: "{p}"')
            for y, v in rec['values'].items():
                if isinstance(v, float) and not (0 <= v <= 65):
                    problems.append(f'{name} "{p}" {y}: out-of-range value {v}')
    return problems


def main():
    warn = []
    per_file = {}
    for fname in FILES:
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            print(f'MISSING: {fname}', file=sys.stderr)
            continue
        rows = parse_pdf(path, warn)
        per_file[fname] = rows
        cells = sum(len(r['values']) for r in rows)
        print(f'{fname}: {len(rows)} rows, {cells} cells')

    # merge newest-first; key on (program, level) + occurrence within that key
    schools, drift = {}, []
    for fname in FILES:
        occ_seen = {}
        for r in per_file.get(fname, []):
            base = (r['school'], r['program'].lower(), r['level'])
            occ = occ_seen.get(base, 0)
            occ_seen[base] = occ + 1
            key = f'{r["program"].lower()}|{r["level"]}|{occ}'
            rec = schools.setdefault(r['school'], {}).setdefault(key, {
                'program': r['program'], 'level': r['level'],
                'category': classify_category(r['program']), 'values': {},
                'sources': {},
            })
            for y, v in r['values'].items():
                if y in rec['values']:
                    if rec['values'][y] != v:      # older file disagrees
                        drift.append({'school': r['school'], 'program': r['program'],
                                      'level': r['level'], 'year': y,
                                      'kept': rec['values'][y], 'kept_from': rec['sources'][y],
                                      'ignored': v, 'ignored_from': fname})
                else:
                    rec['values'][y] = v
                    rec['sources'][y] = fname

    problems = validate(schools, warn)

    out = {'region': 'Rogaland', 'sources': FILES, 'schools': []}
    all_years = set()
    for school in sorted(schools):
        progs = []
        for rec in schools[school].values():
            all_years.update(rec['values'])
            progs.append({'program': rec['program'], 'level': rec['level'],
                          'category': rec['category'],
                          'values': {str(y): v for y, v in sorted(rec['values'].items())}})
        progs.sort(key=lambda p: (p['level'], p['program']))
        entry = {'name': school, 'programs': progs}
        out['schools'].append(entry)
    out['years'] = sorted(all_years)

    # keep school-level enrichment (coords, photos, links) across re-runs
    dest = os.path.join(OUT, 'schools.json')
    if os.path.exists(dest):
        old = {s['name']: s for s in json.load(open(dest))['schools']}
        for s in out['schools']:
            prev = old.get(s['name'], {})
            for k, v in prev.items():
                if k not in ('name', 'programs', 'uncertain_years'):
                    s[k] = v

    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
    os.makedirs(os.path.dirname(DRIFT), exist_ok=True)
    json.dump(drift, open(DRIFT, 'w'), ensure_ascii=False, indent=1)

    ncells = sum(len(p['values']) for s in out['schools'] for p in s['programs'])
    print(f'\n{len(out["schools"])} schools, {ncells} cells, years {out["years"]}')
    if warn:
        print(f'\n--- {len(warn)} parse warnings ---')
        for w in warn[:25]:
            print('  ', w)
        if len(warn) > 25:
            print(f'   … {len(warn) - 25} more')
    print(f'\n--- validation: {len(problems)} problems ---')
    for p in problems[:25]:
        print('  ', p)
    if len(problems) > 25:
        print(f'   … {len(problems) - 25} more')
    print(f'\nsource disagreements (older file overridden): {len(drift)} -> {DRIFT}')
    print(f'-> {dest}')


if __name__ == '__main__':
    main()

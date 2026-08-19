#!/usr/bin/env python3
"""Parse Rogaland poenggrenser PDFs (2018-2025) into one merged dataset.

Uses pypdf layout mode: school titles sit above their tables, year columns are
sliced by x-position, and each value token is mapped to the nearest year
column — so sparse rows (programs that didn't exist all years) parse exactly.

Cell semantics in web/data/schools.json:
  number  -> threshold (last admitted applicant's points; grade avg x 10)
  "open"  -> no waitlist / everyone qualified admitted ("Ingen venteliste",
             "Ledige plasser")
  "F"     -> admission by priority rules (Fortrinnsrett), no threshold
  "U"     -> program discontinued that year (Utgår)
  absent  -> no data (program not offered / not in any source PDF)
"""

import json
import os
import re
import sys
import unicodedata

from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'poenggrenser', 'data')
OUT = os.path.join(HERE, '..', 'web', 'data')

# newest first: on overlapping (school, program, year) the newest file wins.
# mode 'layout' slices by x-position (exact); 'plain' is the fallback for PDFs
# whose rotated text breaks pypdf layout mode — values are right-aligned onto
# the year columns there (exact for full rows, heuristic for sparse ones).
FILES = [
    ('poenggrenser-rogaland-2023-2025-official.pdf', 'layout'),
    ('poenggrenser-rogaland-2023-2024.pdf', 'layout'),
    ('poenggrenser-rogaland-2022-2023.pdf', 'plain'),
    ('poenggrenser-rogaland-2021-2022.pdf', 'plain'),
    ('poenggrenser-rogaland-2019-2020.pdf', 'layout'),
]

YEAR_RE = re.compile(r'\b(20\d\d)\b')
VALUE_TOKEN_RE = re.compile(
    r'Ingen\s+ventelis\s*t?\s*e?|Ledige\s+plasser|Fort\w*inn\w*|Utgår|\d+(?:,\d+)?|(?<=\s)-(?=\s|$)',
    re.IGNORECASE,
)
LEVEL_RE = re.compile(r'^\s*(Vg\d)\b')

# non-Rogaland schools that appear on the national "landslinje flyfag" pages
BLACKLIST = {'bardufoss', 'bardufoss videregående skole',
             'skedsmo videregående skole', 'bodø videregående skole',
             'fosen videregående skole', 'ffff fosen videregående skole'}
SCHOOL_ALIASES = {
    'stavanger katedral skole': 'Stavanger Katedralskole',
    'stavanger katedralskole': 'Stavanger Katedralskole',
    'landslinje flyfag ‐ sola videregående skole': 'Sola videregående skole',
    'landslinje flyfag - sola videregående skole': 'Sola videregående skole',
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

# program -> national utdanningsprogram category. Ordered keyword rules over
# the lowercased program name; first hit wins. Ids are stable app-side keys.
CATEGORY_RULES = [
    ('pb',      ['påbygg']),
    ('elektro', ['elektro', 'elenergi', 'automatiser', 'automasjon', 'datateknologi',
                 'dataelektronik', 'flyfag', 'avionik', 'drone', 'kulde', 'ventilasjon']),
    ('im',      ['informasjonsteknologi', 'medieproduksjon', 'ikt']),
    ('helse',   ['helse', 'oppvekst', 'barne- og ungdom', 'barne‐ og ungdom', 'ambulanse',
                 'apotek', 'tannhelse', 'hudplei', 'fotterap', 'aktivitør', 'portør']),
    ('bygg',    ['bygg', 'anleggsteknikk', 'anleggsgartner', 'tømrer', 'betong', 'mur',
                 'rørlegg', 'klima', 'energi og miljø', 'overflate', 'trevare', 'treteknikk',
                 'anleggsmaskin', 'stillas']),
    ('tip',     ['teknologi- og industrifag', 'teknologi og industrifag', 'teknikk og industriell', 'industriteknologi',
                 'kjøretøy', 'arbeidsmaskin', 'bilskade', 'karosseri', 'energi operatør', 'energioperatør', 'transport og logistikk', 'kjemiprosess',
                 'laborator', 'brønnteknikk', 'sveis', 'platearbeid', 'cnc', 'maritim',
                 'motormann', 'matros', 'skipsteknisk', 'yrkessjåfør', 'logistikk']),
    ('rm',      ['restaurant', 'matfag', 'kokk', 'servitør', 'baker', 'konditor',
                 'matproduksjon', 'sjømat', 'ernæring']),
    ('sr',      ['salg', 'service', 'reiseliv', 'sikkerhet', 'samferdsel', 'resepsjon']),
    ('nat',     ['naturbruk', 'landbruk', 'gartner', 'heste', 'hovslager', 'agronom',
                 'skogbruk', 'akvakultur', 'fiske og fangst', 'villmark']),
    ('mk',      ['medier og kommunikasjon', 'mediedesign']),
    ('design',  ['design og håndverk', 'frisør', 'blomster', 'interiør', 'utstilling',
                 'eksponering', 'design og tekstil', 'søm', 'gull', 'håndverk', 'produktutvikling']),
    ('idrett',  ['idrett']),
    ('mdd',     ['musikk', 'dans', 'drama']),
    ('kda',     ['kunst']),
    ('st',      ['studiespesialiser', 'realfag', 'språk, samfunn', 'international baccalaureate', 'forskerlinje']),
]


def classify_category(program):
    p = program.lower()
    for cat, needles in CATEGORY_RULES:
        if any(n in p for n in needles):
            return cat
    return 'annet'


def norm(s):
    s = unicodedata.normalize('NFKC', s).replace('\xa0', ' ').replace('‐', '-')
    return s


def squash(s):
    return re.sub(r'\s+', ' ', s).strip()


def classify(token):
    t = squash(token).lower()
    if t.startswith('ingen ventelis') or t.startswith('ledige plasser'):
        return 'open'
    if t.startswith('fort'):
        return 'F'
    if t.startswith('utgår'):
        return 'U'
    if t == '-':
        return None  # missing cell
    return float(t.replace(',', '.'))


def looks_like_school(stripped):
    l = stripped.lower()
    if any(ch.isdigit() for ch in stripped) or 'programområde' in l:
        return False
    if l in BLACKLIST:
        return True  # recognized so we can switch context (and then drop rows)
    return ('skole' in l or 'skule' in l or 'gymnas' in l) and len(l) < 70


def canon_school(name):
    key = squash(name).lower()
    return SCHOOL_ALIASES.get(key, squash(name))



# the same program is spelled differently across source files; normalize so
# series merge and priority-quota rows fold onto the right program
PROGRAM_ALIASES = {
    'språk, samfunnsfag og økonomi': 'Språk, samfunn og økonomi',
    'helse og oppvekstfag': 'Helse- og oppvekstfag',
    'restaurant og matfag': 'Restaurant- og matfag',
    'bygg og anleggsteknikk': 'Bygg- og anleggsteknikk',
    'teknologi og industrifag': 'Teknologi- og industrifag',
    'barne‐ og ungdomsarbeider': 'Barne- og ungdomsarbeider',
}


def canon_program(name):
    return PROGRAM_ALIASES.get(squash(name).lower(), squash(name))


def guess_level(program, explicit):
    if explicit:
        return explicit
    p = program.lower()
    if p in VG1_PROGRAMS:
        return 'Vg1'
    if p in VG3_HINTS:
        return 'Vg3'
    return 'Vg2/Vg3'


def parse_pdf_plain(path):
    """Fallback for PDFs where layout mode fails (rotated text): linear text,
    one school table per page, values peeled off line-ends and right-aligned
    onto the year columns."""
    header_re = re.compile(r'^Nivå\s+Programområde\s*navn((?:\s+\d{4})+)\s*$')
    reader = PdfReader(path)
    for page in reader.pages:
        text = norm(page.extract_text() or '')
        lines = [squash(l) for l in text.split('\n') if l.strip()]
        header_i, years = None, None
        for i, l in enumerate(lines):
            m = header_re.match(l)
            if m:
                header_i, years = i, [int(y) for y in m.group(1).split()]
                break
        if header_i is None:
            continue
        school = None
        for l in reversed(lines[:header_i]):
            if looks_like_school(l):
                school = l
                break
        if not school:
            school = next((l for l in lines if looks_like_school(l)), None)
        if not school:
            continue
        school = canon_school(school)
        if school.lower() in BLACKLIST:
            continue
        for l in lines[header_i + 1:]:
            if re.fullmatch(r'Vg\d', l):
                continue
            explicit_level = None
            lm = LEVEL_RE.match(l)
            if lm:
                explicit_level, l = lm.group(1), l[lm.end():].strip()
            values, rest = [], l
            while len(values) < len(years):
                m = None
                for m2 in VALUE_TOKEN_RE.finditer(rest):
                    if m2.end() >= len(rest.rstrip()):
                        m = m2
                if m is None:
                    break
                values.insert(0, m.group(0))
                rest = rest[:m.start()].rstrip()
            program = squash(rest)
            if not program or not values:
                continue
            if 'programområde' in program.lower() or program.lower() in ('venteliste', 'ingen', 'nivå'):
                continue
            while True:
                p2 = re.sub(r'\s+(?:Ingen\s+ventelis\w*|Fort\w*inn\w*|Ledige\s+plasser|Utgår|-)\s*$', '', program, flags=re.IGNORECASE).strip()
                if p2 == program or not p2:
                    break
                program = p2
            program = canon_program(program)
            yearvals = {}
            for y, tok in zip(years[-len(values):], values):
                v = classify(tok)
                if v is not None:
                    yearvals[y] = v
            if yearvals:
                yield school, program, guess_level(program, explicit_level), yearvals


def parse_pdf(path):
    """Yield (school, program, level, {year: value}) rows."""
    reader = PdfReader(path)
    for page in reader.pages:
        text = norm(page.extract_text(extraction_mode='layout') or '')
        school = None
        year_cols = []  # [(year, x_center)]
        for raw in text.split('\n'):
            if not raw.strip():
                continue
            stripped = squash(raw)
            if looks_like_school(stripped):
                school = canon_school(stripped)
                year_cols = []
                continue
            if 'Programområde' in raw:
                year_cols = [(int(m.group(1)), (m.start() + m.end()) / 2)
                             for m in YEAR_RE.finditer(raw)]
                continue
            if not school or not year_cols:
                continue
            if school.lower() in BLACKLIST:
                continue
            line = raw
            explicit_level = None
            lm = LEVEL_RE.match(line)
            if lm:
                explicit_level = lm.group(1)
                line = line[:lm.start(1)] + ' ' * len(lm.group(1)) + line[lm.end(1):]
            # find value tokens right of the name area
            name_limit = min(x for _, x in year_cols) - 22
            tokens = [(m.group(0), (m.start() + m.end()) / 2, m.start())
                      for m in VALUE_TOKEN_RE.finditer(line)]
            tokens = [t for t in tokens if t[1] > name_limit]
            if not tokens:
                continue
            first_tok_start = min(t[2] for t in tokens)
            program = squash(line[:first_tok_start])
            # repair glyph-splatter like "F l yfag" -> "Flyfag"
            program = re.sub(r'\b(\w) (\w) (?=\w)', r'\1\2', program)
            if not program:
                continue
            if 'programområde' in program.lower() or program.lower() in ('venteliste', 'ingen', 'nivå'):
                continue
            while True:
                p2 = re.sub(r'\s+(?:Ingen\s+ventelis\w*|Fort\w*inn\w*|Ledige\s+plasser|Utgår|-)\s*$', '', program, flags=re.IGNORECASE).strip()
                if p2 == program or not p2:
                    break
                program = p2
            program = canon_program(program)
            yearvals = {}
            for tok, x, _ in tokens:
                year = min(year_cols, key=lambda yc: abs(yc[1] - x))[0]
                v = classify(tok)
                if v is not None and year not in yearvals:
                    yearvals[year] = v
            if yearvals:
                yield school, program, guess_level(program, explicit_level), yearvals


def main():
    import logging
    logging.getLogger('pypdf').setLevel(logging.ERROR)
    schools = {}
    for fname, mode in FILES:
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            print(f'MISSING: {fname}', file=sys.stderr)
            continue
        n = 0
        occ_seen = {}
        parser = parse_pdf if mode == 'layout' else parse_pdf_plain
        for school, program, level, yearvals in parser(path):
            k0 = (school, program.lower())
            occ = occ_seen.get(k0, 0)
            occ_seen[k0] = occ + 1
            rec = schools.setdefault(school, {}).setdefault(
                f'{program.lower()}#{occ}',
                {'program': program, 'level': level, 'values': {}})
            for y, v in yearvals.items():
                rec['values'].setdefault(y, v)
            n += 1
        print(f'{fname}: {n} rows')

    keep_keys = ('lat', 'lon', 'orgnr', 'nsr_name', 'url', 'email', 'phone', 'address',
                 'photo', 'photo_source', 'photo_page', 'wiki_url', 'wiki_extract')
    prev = {}
    dest0 = os.path.join(OUT, 'schools.json')
    if os.path.exists(dest0):
        for s in json.load(open(dest0)).get('schools', []):
            prev[s['name']] = {k: s[k] for k in keep_keys if k in s}
    out = {'region': 'Rogaland', 'sources': [f for f, _ in FILES], 'schools': []}
    all_years = set()
    for school in sorted(schools):
        progs = []
        for rec in schools[school].values():
            all_years.update(rec['values'])
            progs.append({'program': rec['program'], 'level': rec['level'],
                          'category': classify_category(rec['program']),
                          'values': {str(y): v for y, v in sorted(rec['values'].items())}})
        out['schools'].append({'name': school, **prev.get(school, {}), 'programs': progs})
    out['years'] = sorted(all_years)

    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, 'schools.json')
    with open(dest, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'\n{len(out["schools"])} schools, years {out["years"]}')
    for s in out['schools']:
        ncells = sum(len(p['values']) for p in s['programs'])
        print(f'  {s["name"]}: {len(s["programs"])} programs, {ncells} year-cells')
    print(f'-> {dest}')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Shared logic for every county extractor.

A county extractor is a module exposing:
    META = {'code': '11', 'fylke': 'Rogaland', 'round': '2', ...}
    def extract() -> list[dict]   # rows, newest source first

A row is:
    {'school': str, 'program': str, 'level': 'Vg1'|'Vg2'|'Vg3'|'Vg4'|'Vg2/Vg3',
     'values': {int(year): cell}, 'region': str|None}

Cell values:  float | 'open' | 'F' | 'D' | 'U'
    number  threshold (last admitted applicant's points; grade average x 10)
    open    no waitlist — everyone qualified was admitted (NOT zero)
    F       fortrinnsrett quota (statutory priority, outside the competition)
    D       admission by documentation (IB, elite sport)
    U       programme discontinued that year
"""

import re
import unicodedata

MIN_PLAUSIBLE = 8.0     # points below this are parse noise, not thresholds
MAX_PLAUSIBLE = 65.0

# --- text ---------------------------------------------------------------
def norm(s):
    return unicodedata.normalize('NFKC', s or '').replace('\xa0', ' ').replace('‐', '-').strip()


def squash(s):
    return re.sub(r'\s+', ' ', norm(s)).strip()


# --- cell semantics -----------------------------------------------------
# every spelling seen across counties, including the counties' own typos
OPEN_TOKENS = ('ingen vente', 'ingen ventelis', 'ledige', 'alle søkere', 'alle sokere',
               'alle som søkte', 'alle', 'ingen venteliste', 'ingen ventesliste')
PRIORITY_TOKENS = ('fortrinn', 'fortrinnsrett', 'fortinnsrett', 'fortrinsrett')
DOC_TOKENS = ('dokumentasjon', 'dok.', 'individuell')
GONE_TOKENS = ('utgår', 'utgar', 'utgått', 'lagt ned')
EMPTY_TOKENS = ('', '-', '–', '—', '.', '..', 'n/a', 'ikke aktuelt')

NUM_RE = re.compile(r'^\d{1,2}(?:[.,]\d{1,2})?$')


def classify_cell(txt):
    """Text -> float | 'open' | 'F' | 'D' | 'U' | None (no data)."""
    t = squash(txt).lower().rstrip('*').strip()
    if t in EMPTY_TOKENS:
        return None
    if any(t.startswith(x) for x in PRIORITY_TOKENS):
        return 'F'
    if any(t.startswith(x) for x in GONE_TOKENS):
        return 'U'
    if any(t.startswith(x) for x in DOC_TOKENS):
        return 'D'
    if any(t.startswith(x) for x in OPEN_TOKENS):
        return 'open'
    if NUM_RE.match(t):
        v = float(t.replace(',', '.'))
        return v if MIN_PLAUSIBLE <= v <= MAX_PLAUSIBLE else None
    return None


# --- programme names ----------------------------------------------------
PROGRAM_ALIASES = {
    'språk, samfunnsfag og økonomi': 'Språk, samfunn og økonomi',
    'helse og oppvekstfag': 'Helse- og oppvekstfag',
    'restaurant og matfag': 'Restaurant- og matfag',
    'bygg og anleggsteknikk': 'Bygg- og anleggsteknikk',
    'teknologi og industrifag': 'Teknologi- og industrifag',
    'barne- og ungdomsarbeiderfag': 'Barne- og ungdomsarbeider',
    'helsearbeider': 'Helsearbeiderfag',
    'elektro og datateknologi': 'Elektro og datateknologi',
    'informasjonsteknologi og medieproduksjon': 'Informasjonsteknologi og medieproduksjon',
    'frisør, blom., int. og eksp.design': 'Frisør, blomster, interiør og eksponeringsdesign',
    'håndverk, design og produktutvikling': 'Håndverk, design og produktutvikling',
    'salg, service og reiseliv': 'Salg, service og reiseliv',
}


def canon_program(name):
    n = squash(name)
    n = re.sub(r',(?=\S)', ', ', n)          # "Kunst,design" -> "Kunst, design"
    n = re.sub(r'\s*\.\s*$', '', n).strip(' -–')
    return PROGRAM_ALIASES.get(n.lower(), n)


VG1_PROGRAMS = {
    'studiespesialisering', 'idrettsfag', 'kunst, design og arkitektur',
    'medier og kommunikasjon', 'musikk, dans og drama', 'bygg- og anleggsteknikk',
    'elektro og datateknologi', 'elektrofag', 'design og håndverk',
    'frisør, blomster, interiør og eksponeringsdesign', 'helse- og oppvekstfag',
    'håndverk, design og produktutvikling',
    'informasjonsteknologi og medieproduksjon', 'naturbruk',
    'restaurant- og matfag', 'service og samferdsel', 'salg, service og reiseliv',
    'teknologi- og industrifag', 'teknikk og industriell produksjon',
}
VG3_HINTS = {'påbygg til generell studiekompetanse'}


def guess_level(program, explicit=None):
    if explicit:
        return explicit
    p = program.lower()
    if p in VG1_PROGRAMS:
        return 'Vg1'
    if p in VG3_HINTS:
        return 'Vg3'
    return 'Vg2/Vg3'


# --- categories (national utdanningsprogram) ----------------------------
CATEGORY_RULES = [
    ('pb',      ['påbygg']),
    ('elektro', ['elektro', 'elenergi', 'automatiser', 'automasjon', 'datateknologi',
                 'dataelektronik', 'flyfag', 'avionik', 'drone', 'kulde', 'ventilasjon']),
    ('im',      ['informasjonsteknologi', 'medieproduksjon', 'ikt']),
    ('helse',   ['helse', 'oppvekst', 'barne- og ungdom', 'ambulanse', 'apotek',
                 'tannhelse', 'hudplei', 'fotterap', 'aktivitør', 'portør']),
    ('bygg',    ['bygg', 'anleggsteknikk', 'anleggsgartner', 'tømrer', 'betong', 'mur',
                 'rørlegg', 'klima', 'energi og miljø', 'overflate', 'trevare',
                 'treteknikk', 'anleggsmaskin', 'stillas']),
    ('tip',     ['teknologi- og industrifag', 'teknologi og industrifag',
                 'teknikk og industriell', 'industriteknologi', 'kjøretøy',
                 'arbeidsmaskin', 'bilskade', 'karosseri', 'energi operatør',
                 'energioperatør', 'transport og logistikk', 'kjemiprosess', 'laborator',
                 'brønnteknikk', 'sveis', 'platearbeid', 'cnc', 'maritim', 'motormann',
                 'matros', 'skipsteknisk', 'yrkessjåfør', 'logistikk', 'boring']),
    ('rm',      ['restaurant', 'matfag', 'kokk', 'servitør', 'baker', 'konditor',
                 'matproduksjon', 'sjømat', 'ernæring']),
    ('sr',      ['salg', 'service', 'reiseliv', 'sikkerhet', 'samferdsel', 'resepsjon']),
    ('nat',     ['naturbruk', 'landbruk', 'gartner', 'heste', 'hovslager', 'agronom',
                 'skogbruk', 'akvakultur', 'fiske og fangst', 'villmark', 'reindrift',
                 'anleggsgartner']),
    ('mk',      ['medier og kommunikasjon', 'mediedesign']),
    ('design',  ['design og håndverk', 'frisør', 'blomster', 'interiør', 'utstilling',
                 'eksponering', 'design og tekstil', 'søm', 'gull', 'håndverk',
                 'produktutvikling', 'duodji']),
    ('idrett',  ['idrett', 'toppidrett']),
    ('mdd',     ['musikk', 'dans', 'drama']),
    ('kda',     ['kunst']),
    ('st',      ['studiespesialiser', 'realfag', 'språk, samfunn', 'samfunnsfag',
                 'international baccalaureate', ' ib', 'forskerlinje', 'studiefor']),
]


def classify_category(program):
    p = program.lower()
    for cat, needles in CATEGORY_RULES:
        if any(n in p for n in needles):
            return cat
    return 'annet'


# --- merge & validate ---------------------------------------------------
def merge_rows(rows_newest_first):
    """Fold rows into {school: {key: record}}; the newest source wins a cell.

    Series identity is (programme, level) + an occurrence index, so a school
    that lists the same programme at two levels keeps two series.
    """
    schools, drift = {}, []
    for source, rows in rows_newest_first:
        occ_seen = {}
        for r in rows:
            # school identity is (county, name): the same school name exists in
            # more than one county (St. Olav in both Stavanger and Sarpsborg)
            sid = (r.get('county', ''), r['school'])
            base = (sid, r['program'].lower(), r['level'])
            occ = occ_seen.get(base, 0)
            occ_seen[base] = occ + 1
            key = f'{r["program"].lower()}|{r["level"]}|{occ}'
            rec = schools.setdefault(sid, {}).setdefault(key, {
                'program': r['program'], 'level': r['level'],
                'category': classify_category(r['program']),
                'values': {}, 'sources': {},
            })
            for y, v in r['values'].items():
                if y in rec['values']:
                    if rec['values'][y] != v:
                        drift.append({'county': r.get('county', ''),
                                      'school': r['school'], 'program': r['program'],
                                      'level': r['level'], 'year': y,
                                      'kept': rec['values'][y], 'kept_from': rec['sources'][y],
                                      'ignored': v, 'ignored_from': source})
                else:
                    rec['values'][y] = v
                    rec['sources'][y] = source
    return schools, drift


def validate(schools):
    problems = []
    for (county, name), progs in schools.items():
        for rec in progs.values():
            p = rec['program']
            if re.search(r'\s\d+(?:[.,]\d+)?$', p):
                problems.append(f'{county} {name}: threshold glued onto name: "{p}"')
            if re.search(r'ventelis|fortrinn|fortinn|utgår|ledige|dokumentasjon', p, re.I):
                problems.append(f'{county} {name}: value token glued into name: "{p}"')
            if rec['category'] == 'annet':
                problems.append(f'{county} {name}: uncategorised programme: "{p}"')
            for y, v in rec['values'].items():
                if isinstance(v, float) and not (MIN_PLAUSIBLE <= v <= MAX_PLAUSIBLE):
                    problems.append(f'{county} {name} "{p}" {y}: out-of-range {v}')
    return problems

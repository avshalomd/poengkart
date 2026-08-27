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
DOC_TOKENS = ('dokumentasjon', 'dok.', 'individuell', 'intervju',
              'inntak etter en kombinasjon', 'kombinasjon av karakterer',
              'kombinasjon av ferdighet', 'kombinasjon av intervju')
GONE_TOKENS = ('utgår', 'utgar', 'utgått', 'lagt ned')
EMPTY_TOKENS = ('', '-', '–', '—', '.', '..', 'n/a', 'ikke aktuelt')

NUM_RE = re.compile(r'^\d{1,2}(?:[.,]\d{1,2})?$')


def classify_cell(txt, min_value=MIN_PLAUSIBLE, loose=False):
    """Text -> float | 'open' | 'F' | 'D' | 'U' | None (no data).

    min_value guards PDF extraction noise (course-code digits parsed as
    thresholds); HTML tables are clean, so they pass min_value=0 and keep
    genuine low values such as Akershus's 0,0 ("full, and applicants with 0,0
    were still left on the waiting list").
    loose additionally accepts a leading number in a compound cell such as
    Buskerud's "35,0 (+ tilleggspoeng) musikk / 39,2 (+ tilleggspoeng)".
    """
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
        return v if min_value <= v <= MAX_PLAUSIBLE else None
    if loose:
        m = re.match(r'^(\d{1,2}(?:[.,]\d{1,2})?)\b', t)
        if m:
            v = float(m.group(1).replace(',', '.'))
            return v if min_value <= v <= MAX_PLAUSIBLE else None
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
    # county abbreviations and typos seen in the sources
    'fbie': 'Frisør, blomster, interiør og eksponeringsdesign',
    'teknikk og industrifag': 'Teknologi- og industrifag',
    'studespesialisering': 'Studiespesialisering',
    'studespesialisering, entreprenørskap': 'Studiespesialisering, entreprenørskap',
    'musikk, dans, drama': 'Musikk, dans og drama',
    'kunst, design og arkitektur (kda)': 'Kunst, design og arkitektur',
    'elektro og datatekologi': 'Elektro og datateknologi',
    'helse-og oppvekstfag': 'Helse- og oppvekstfag',
    'studiespesialisering,toppidrett': 'Studiespesialisering, toppidrett',
    'frisør, blomst, int., eksp. design': 'Frisør, blomster, interiør og eksponeringsdesign',
    'frisør, blomster, interiør og eksponeringsdesign': 'Frisør, blomster, interiør og eksponeringsdesign',
    'bygg og anlegg': 'Bygg- og anleggsteknikk',
    'håndverk, design, produktutv': 'Håndverk, design og produktutvikling',
    'it og medieproduksjon': 'Informasjonsteknologi og medieproduksjon',
    'inform.tekn og medieprod, inform.tekn sk 3 år': 'Informasjonsteknologi og medieproduksjon, SK 3 år',
    'inform.tekn og medieprod, inform.tekn, sk 3 år': 'Informasjonsteknologi og medieproduksjon, SK 3 år',
    'teknologi og idustrifag': 'Teknologi- og industrifag',
    'teknologi og industrifag': 'Teknologi- og industrifag',
    'elektro og datateknologi, , sk 3 år': 'Elektro og datateknologi, SK 3 år',
    'studiespesialiseriing, internasjonalisering': 'Studiespesialisering, internasjonalisering',
    'helse- og oppvekst, studiekompetanse': 'Helse- og oppvekstfag, studiekompetanse',
    'studiespesialisering, ib': 'Studiespesialisering, forberedende IB',
    'studiespesialisering, topppidrett': 'Studiespesialisering, toppidrett',
    'frisør, blomst, int, eksp. design': 'Frisør, blomster, interiør og eksponeringsdesign',
    'inform.ekn og medieprod, inform.tekn sk 3 år':
        'Informasjonsteknologi og medieproduksjon, SK 3 år',
    'inform.tekn og medieprod. sk 3 år':
        'Informasjonsteknologi og medieproduksjon, SK 3 år',
    'naturbruk, energi/miljøfag, sk 3 år': 'Naturbruk, energi-/miljøfag, SK 3 år',
}


def canon_program(name):
    n = squash(name)
    n = re.sub(r',(?=\S)', ', ', n)          # "Kunst,design" -> "Kunst, design"
    n = re.sub(r'\s*\.\s*$', '', n).strip(' -–,')
    n = re.sub(r'\bSK\s*(\d)\s*år', r'SK \1 år', n)      # 'SK 3år' -> 'SK 3 år'
    n = re.sub(r'\bSK\s*(\d)$', r'SK \1 år', n)          # truncated rotated label
    n = re.sub(r'\s+vg\s?[1-4]$', '', n, flags=re.I)      # Grep's 'Idrettsfag vg1'
    # Resolve a known spelling before normalising, or a rule below would edit
    # the raw name out of the table's reach ("Bygg og anlegg" is listed there
    # as the short form of "Bygg- og anleggsteknikk").
    n = PROGRAM_ALIASES.get(n.lower(), n)
    # A county spells the same programme several ways across its own editions,
    # and each spelling used to start a series of its own: the programme looked
    # as if it had ended one year and a new one begun.
    n = re.sub(r'\bYSK\s*\(?\s*(\d)\s*år\)?', r'YSK \1 år', n)   # 'YSK 4år', 'YSK (4 år)'
    n = re.sub(r'^(Bygg|Helse|Restaurant|Teknologi) og ', r'\1- og ', n)
    n = re.sub(r'\bint\.\s*eksp\.', 'int, eksp.', n)               # 'int.eksp. design'
    n = re.sub(r'\beksp\.(?=\S)', 'eksp. ', n)                     # 'eksp.design'
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


# --- categories ---------------------------------------------------------
# Resolved against Udir's Grep register rather than by keyword; see
# tools/taxonomy.py, which documents the register, the five decisions behind
# the mapping, and what to do when a new source brings an unknown name.
from taxonomy import classify_category, english_program   # noqa: E402,F401


# --- merge & validate ---------------------------------------------------
def merge_rows(rows_newest_first):
    """Fold rows into {school: {key: record}}; the newest source wins a cell.

    Series identity is (programme, level) + an occurrence index, so a school
    that lists the same programme at two levels keeps two series.
    """
    schools, drift, attrs = {}, [], {}
    NAMES = {}                     # casefolded name -> the spelling we publish
    for source, rows in rows_newest_first:
        occ_seen = {}
        for r in rows:
            # school identity is (county, name): the same school name exists in
            # more than one county (St. Olav in both Stavanger and Sarpsborg).
            # Case is not part of the identity — one Vestland edition writes
            # "Bergen maritime" and another "Bergen Maritime", and letting that
            # split a school in two put the same building on the map twice.
            sid = (r.get('county', ''), NAMES.setdefault(
                (r.get('county', ''), r['school'].casefold()), r['school']))
            if r.get('region'):
                attrs.setdefault(sid, {})['inntaksregion'] = r['region']
            if r.get('merged_from'):
                a = attrs.setdefault(sid, {})
                a['merged_from'] = sorted(set(a.get('merged_from', [])) | {r['merged_from']})
                a['merged_year'] = r['merged_year']
            base = (sid, r['program'].lower(), r['level'])
            # A source can list one school twice — Rogaland's national flyfag
            # pages repeat Sola under a second heading — and counting that as a
            # second occurrence published the same programme twice. Only start
            # a new series when the repeat actually disagrees about a year;
            # a repeat that merely restates or extends the first is the first.
            occ = occ_seen.get(base, 0)
            if occ:
                prev = schools.get(sid, {}).get(f'{r["program"].lower()}|{r["level"]}|0')
                if prev and not any(y in prev['values'] and prev['values'][y] != v
                                    for y, v in r['values'].items()):
                    occ = 0
            if occ == occ_seen.get(base, 0):
                occ_seen[base] = occ + 1
            key = f'{r["program"].lower()}|{r["level"]}|{occ}'
            rec = schools.setdefault(sid, {}).setdefault(key, {
                'program': r['program'], 'level': r['level'],
                'category': classify_category(r['program']),
                'values': {}, 'sources': {},
            })
            for alt in ('values_r1', 'values_r3'):
                if r.get(alt):
                    rec.setdefault(alt, {}).update({y: v for y, v in r[alt].items()
                                                    if y not in rec.get(alt, {})})
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
    _fold_series(schools, drift)
    return schools, drift, attrs


def _fold_series(schools, drift):
    """Join series that are the same programme wearing two labels.

    Two ways one programme ends up as two rows, both of which read to a family
    as "this stopped and something new began":

    'Vg2/Vg3' is what guess_level() returns when a source does not say which
    level a programme is. Only Rogaland's newest edition does that, so a
    programme's older years sit under Vg2 (or Vg3) and its newest under the
    placeholder. Where the school has exactly one of the two, the placeholder
    is that one.

    An occurrence index above zero survives only when a source listed the same
    school twice and the two listings disagree about a year. Keep the reading
    the merge already chose, fold the rest in, and record the disagreement
    where every other one is recorded.
    """
    for (county, name), recs in schools.items():
        for key in list(recs):
            rec = recs.get(key)
            if rec is None:
                continue
            prog, level, occ = key.rsplit('|', 2)
            target = None
            if level == 'Vg2/Vg3':
                sibs = [f'{prog}|{lv}|{occ}' for lv in ('Vg2', 'Vg3')
                        if f'{prog}|{lv}|{occ}' in recs]
                if len(sibs) == 1:
                    target = sibs[0]
            elif occ != '0' and f'{prog}|{level}|0' in recs:
                target = f'{prog}|{level}|0'
            if not target:
                continue
            into = recs[target]
            for y, v in sorted(rec['values'].items()):
                if y not in into['values']:
                    into['values'][y] = v
                    into['sources'][y] = rec['sources'][y]
                elif into['values'][y] != v:
                    drift.append({'county': county, 'school': name,
                                  'program': rec['program'], 'level': rec['level'],
                                  'year': y, 'kept': into['values'][y],
                                  'kept_from': into['sources'][y],
                                  'ignored': v, 'ignored_from': rec['sources'][y]})
            for alt in ('values_r1', 'values_r3'):
                if rec.get(alt):
                    into.setdefault(alt, {}).update(
                        {y: v for y, v in rec[alt].items() if y not in into.get(alt, {})})
            del recs[key]


def validate(schools, min_value=MIN_PLAUSIBLE):
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
                if isinstance(v, float) and not (0 <= v <= MAX_PLAUSIBLE):
                    problems.append(f'{county} {name} "{p}" {y}: out-of-range {v}')
    return problems

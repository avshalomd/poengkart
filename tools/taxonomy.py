#!/usr/bin/env python3
"""Programme names -> the national utdanningsprogram, and their English titles.

Every threshold in this dataset belongs to a programme, and the map's filter is
a list of *utdanningsprogram* — the fifteen national programmes a Norwegian
pupil actually applies to. Deciding which one a county's label means is this
module's whole job.

WHERE THE ANSWER COMES FROM
---------------------------
Not from us. Udir publishes the structure in Grep, its curriculum register:

    https://data.udir.no/kl06/v201906/utdanningsprogram   18 programme codes
    https://data.udir.no/kl06/v201906/programomraader     497 programme areas

tools/fetch_grep.py caches the second one as grep-programomraader.json, with
each area's Bokmål and Nynorsk name and — for most — an official English title.
A Grep code carries its utdanningsprogram in its first two letters:

    BABAT1----   BA = Bygg- og anleggsteknikk, area BAT, first year
    ELAVI3----   EL = Elektro og datateknologi, avionics, third year

So resolving a county's label to any Grep code answers the category question
without anyone maintaining a keyword list. That is what replaced the previous
approach: an ordered list of ~100 substrings where the first match won, which
filed "Landbruk og gartn(ernæring)" under Restaurant- og matfag because the
food keyword `ernæring` appears inside "gartnernæring", and put anleggsgartner
under Bygg because Bygg happened to be listed before Naturbruk.

The structure is national. Counties differ only in how they spell things —
"Teknologi- og industrifag", "Teknologi-/industrifag, YSK 4år" and "Teknolog og
idustrifag" are all the same programme, and all three appear in these PDFs.

WHEN A NEW SOURCE ARRIVES
-------------------------
Run tools/test_parse.py. It fails if any programme name in the dataset cannot
be resolved, and prints the names. For each one, in this order:

  1. Look it up on https://data.udir.no/kl06/v201906/programomraader or
     https://vilbli.no — the county nearly always means a real programme area
     and has just abbreviated or misspelled it.
  2. If it is a recognisable truncation of a Grep name, add it to ALIASES with
     the Grep code's two-letter prefix. That is the normal case.
  3. If it is a programme discontinued before Grep's current edition, add its
     successor to SUCCESSOR_BY_CODE with a comment saying what happened to it.
  4. Only if none of that applies is a new category warranted, and that is a
     product decision, not a parsing one.

Never add a keyword. The reason this module exists is that keywords match
substrings of words they were never meant to touch.
"""
import collections
import difflib
import functools
import json
import os
import re
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
GREP = os.path.join(HERE, 'grep-programomraader.json')

# ---------------------------------------------------------------- the categories
# The fifteen utdanningsprogram in force under LK20, plus påbygging. Påbygging
# is not an utdanningsprogram — it is the year a vocational pupil takes to reach
# university admission — but it is a thing a pupil chooses, so it gets a filter.
# Names and English titles are Udir's own, from the utdanningsprogram endpoint;
# the two marked below are lightly edited, see DECISION 5.
CATEGORIES = {
    'ST': ('Studiespesialisering', 'Specialization in General Studies'),
    'ID': ('Idrettsfag', 'Sports and Physical Education'),
    'MD': ('Musikk, dans og drama', 'Music, Dance and Drama'),
    'KD': ('Kunst, design og arkitektur', 'Art, Design and Architecture'),
    'MK': ('Medier og kommunikasjon', 'Media and Communication'),
    'BA': ('Bygg- og anleggsteknikk', 'Building and Construction'),
    'EL': ('Elektro og datateknologi', 'Electrical Engineering and Computer Technology'),
    'FD': ('Frisør, blomster, interiør og eksponeringsdesign',
           'Hairdressing, Floristry, Interior and Retail Design'),
    'HS': ('Helse- og oppvekstfag', 'Healthcare, Childhood and Youth Development'),
    'DT': ('Håndverk, design og produktutvikling', 'Handicrafts, Design and Product Development'),
    'IM': ('Informasjonsteknologi og medieproduksjon', 'Information Technology and Media Production'),
    'NA': ('Naturbruk', 'Agriculture, Fishing and Forestry'),
    'RM': ('Restaurant- og matfag', 'Restaurant and Food Processing'),
    'SR': ('Salg, service og reiseliv', 'Sales, Service, Travel and Tourism'),
    'TP': ('Teknologi- og industrifag', 'Technical and Industrial Production'),
    'PB': ('Påbygging til generell studiekompetanse',
           'Supplementary year for general university admission'),
}

# ------------------------------------------------------------------- DECISION 3
# The dataset spans 2012-2026 and the 2020 reform lands in the middle of it.
# Grep still carries the discontinued programmes, so a pre-reform label can
# resolve to a code that no longer exists. Everything is filed under today's
# structure: a family reading the map in 2026 thinks in today's terms, and a
# filter that hides a school's older years because a trade was reclassified is
# worse than one that shows the whole history together.
#
# The split programmes cannot be handled wholesale — Service og samferdsel went
# three separate ways — so the successor is recorded per programme area, with
# the utdanningsprogram-level entry as the fallback for areas not listed.
SUCCESSOR_BY_CODE = {
    'SSISF2': 'IM',   # IKT-servicefag  -> IT-utvikler / IT-drift under IM
    'SSISF3': 'IM',
    'SSIDT3': 'IM',   # IKT-driftsteknikerfaget
    'SSITU3': 'IM',   # IKT-tjenesteutviklerfaget
    'SSTRL2': 'TP',   # transport og logistikk -> TP (also has a live TPTOL2)
    'DHMDE3': 'IM',   # mediedesign -> mediegrafiker under IM
    'DHMED1': 'IM',   # medieproduksjon (also has a live IMMED2)
    'DHMED2': 'IM',
    # Design og håndverk's own areas mostly answer for themselves: interiør and
    # utstillingsdesign are what FD's interiør og eksponeringsdesign is now,
    # while textiles went to DT. Only the Vg1 is genuinely ambiguous, and that
    # is DECISION 4 below.
    'DHDTE2': 'DT',   # design og tekstil -> DT's søm og tekstilhåndverk
}
SUCCESSOR_BY_PROGRAM = {
    'SS': 'SR',       # Service og samferdsel -> Salg, service og reiseliv
    'ME': 'MK',       # the old yrkesfaglig Medier og kommunikasjon
    # DECISION 4: Design og håndverk split into FD and DT in 2020, and a Vg1
    # row from 2018 cannot say which half it became. Of the five schools that
    # published it, three went on to offer only hairdressing/interior areas,
    # one offers both and one neither — so the larger successor takes it.
    'DH': 'FD',
    'R9': None,       # Reform 94 leftovers; nothing in this dataset hits them
}

# ------------------------------------------------------------------------ aliases
# Names Grep cannot match on its own, and why. Two kinds only:
#
#   * pre-2020 Vg1 names. Grep reused the codes and replaced the names, so
#     "Elektrofag" and "Teknikk og industriell produksjon" are simply gone from
#     the register even though the codes ELELE1 and TPTIP1 are still there.
#   * county truncations of a programme area — "Elenergi" for "Elenergi og
#     ekom", "Kulde-, varmepumpe-, vent.tekn" for the full mouthful.
#
# The value is the Grep code the label means today (DECISION 3: everything is
# filed under the current structure, so "Data og elektronikk" carries the code
# of its successor, Elenergi og ekom). A bare two-letter value remains for the
# labels that are not any programme area — International Baccalaureate is real
# but lives outside Grep — and resolves to the category with no code. A `#`
# stands for the year digit, filled from the row's level: "Språk, samfunn og
# økonomi" exists as both STSSA2 and STSSA3.
ALIASES = {
    # Oslo 2017-2019: plain Studiespesialisering, labelled to distinguish it
    # from the formgivingsfag variant offered next to it. Fuzzy matching read
    # the label as the thing it excludes and handed it STFOR1.
    'studiespesialisering (uten formgivingsfag)': 'STUSP1----',
    'studiespesialisering uten formgivingsfag': 'STUSP1----',
    'teknikk og industriell produksjon': 'TPTIP1----',
    'teknikk og industrifag': 'TPTIP1----',
    'elektrofag': 'ELELE1----',
    'elektro': 'ELELE1----',
    'elenergi': 'ELELE2----',
    'data og elektronikk': 'ELELE2----',
    'kulde varmepumpe vent tekn': 'ELKVV2----',
    'kulde varmepumpe vent teknologi': 'ELKVV2----',
    'helse og sosialfag': 'HSHSF1----',
    'helse oppvekst ambulanse': 'HSHSF1----',
    # a fuzzy hit alone, which the comma-prefix walk does not try: Jåttå's
    # «Barne- og ungdomsarbeider, toppidrett» (2024) went unresolved
    'barne og ungdomsarbeider': 'HSBUA2----',
    'service og sikkerhet og admin': 'SRSSH2----',
    'elektro og datatekn autom': 'ELELE1----',
    'håndverk design og produktutv søm th': 'DTDTH1----',
    'studiespes business': 'STUSP1----',
    'studiespes skiskyting': 'STUSP1----',
    'språk samfunn og økonomi toppidrett': 'STSSA#----',
    'international baccalaureate': 'ST',
    'international baccalaureate ib': 'ST',
    'naturbruk med anleggsgartnar': 'NANAB1----',   # else the old BA anleggsgartner wins
    # 13 Sept 2026: three labels the last-resort steps read as a narrower area.
    # "Medieproduksjon" sits inside "IT og medieproduksjon" (Rogaland, Oslo),
    # "Gartnerfaget" inside "Landbruk/gartnernæring", and "Frisør" is the first
    # word of Rogaland's abbreviated Vg1 — which then read "Hairdresser"
    'it og medieproduksjon': 'IMIKM1----',
    'landbruk gartnernæring': 'NALGA2----',
    'frisør blomst int eksp design': 'FDFBI1----',
}

NOISE = [
    r'\b(sk|ysk)\s*\d?\s*(år|årig)?\b', r'\b\d\s*(år|årig)\b',
    r'\blandslinje\b', r'\blal\b', r'\bny\b', r'\bpb[a-z0-9]+\b',
    r'\bmed\b', r'\bm\b', r'\bdagtid\b', r'\bkveld\b', r'\bnett\b',
    r'\better\b', r'\be\b',
]


def _norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    s = re.sub(r'\bvg\s*[1-4]\b', ' ', s)
    s = re.sub(r'[.,/()\-–]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _strip_noise(s):
    for r in NOISE:
        s = re.sub(r, ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _load():
    grep = json.load(open(GREP, encoding='utf-8'))
    index = collections.defaultdict(list)
    for code, titles in grep.items():
        for key in ('nob', 'nno'):
            n = _norm(titles.get(key))
            if n:
                index[n].append(code)
    return grep, dict(index)


GREP_TITLES, INDEX = _load()

# Codes vigo offers that Grep does not publish. Vg4 påbygg is one: Grep has
# only PBPBY4---- «Fag for studiekompetanse», the code a vitnemål records the
# year under, while vigo offers it as PBPBY4YK-- (Udir's
# registreringshåndbok, «Påbygg etter fag- og yrkesopplæring»), and the
# counties print that code beside the row (Dalane «(PBPBY4YK)», Bryne
# «(pbpby4yk)»). The title is Udir's own name for the year (føring av
# vitnemål, 4.4), the counterpart of Grep's «Vg3 påbygging …»; vilbli's
# «… etter yrkeskompetanse» is the counties' wording, and the app labels
# this title «Udir». Until 23 Sept 2026 every påbygg row carried PBPBY3----,
# so a Vg4 row's official name read «Vg3 påbygging …» beside its Vg4 chip.
# The name decides as well as the level: Vestland prints its «Påbygg gen
# studiekomp etter yrkeskompetanse» at level 3 in 2021/22 and 2023/24 and at
# level 4 in 2022/23, and it is the year after a trade either way.
VIGO_TITLES = {
    'PBPBY4YK--': {'nob': 'Vg4 påbygging til generell studiekompetanse'},
}


def _pick(codes, level=None):
    """A name can match a live code and a discontinued one — Transport og
    logistikk is SSTRL2 and TPTOL2, blacksmithing is DHSME2 and DTSME2. The
    live one wins; that is DECISION 3 applied at the register level.

    Grep's sixth character is the year digit. Where the caller knows the
    level, a code that agrees with it beats alphabetical order: "Idrettsfag"
    matches both IDIDR2 (vg2) and IDRET1 (vg1), and plain sorting handed
    every Vg1 Idrettsfag row the Vg2 identity — 236 entries across all
    counties wore a code contradicting their own level, which Møre og
    Romsdal's source (which supplies the codes) was the first to prove."""
    live = [c for c in codes if c[:2] in CATEGORIES]
    pool = live or codes
    if level and len(level) == 3 and level[2].isdigit():
        lv = [c for c in pool if len(c) > 5 and c[5] == level[2]]
        if lv:
            pool = lv
    return sorted(pool)[0]


def _alias(v, level):
    """An ALIASES value -> (category, code or None). A bare category has no
    code; a `#` needs the level's year digit to become one."""
    if len(v) == 2:
        return v, None
    if '#' in v:
        digit = (level or '')[-1:]
        if digit not in '1234':
            return _category(v.replace('#', '2')), None
        v = v.replace('#', digit)
    return _category(v), v


def resolve(program, level=None):
    """Programme name -> (category code, Grep code or None, how it matched).

    The steps are tried in order, most trustworthy first, and `how` records
    which one answered so a reviewer can tell an exact hit from a guess.
    `level` (Vg1..Vg4) only disambiguates aliases whose code differs by year.
    """
    n = _norm(program)
    if 'påbygg' in n or 'pabygg' in n:
        after_yk = level == 'Vg4' or 'yrkeskomp' in n
        return 'PB', 'PBPBY4YK--' if after_yk else 'PBPBY3----', 'keyword'
    for cand in (n, _strip_noise(n)):
        if cand in ALIASES:
            return (*_alias(ALIASES[cand], level), 'alias')
        if cand in INDEX:
            return _category(_pick(INDEX[cand], level)), _pick(INDEX[cand], level), 'exact'
    # "Studiespesialisering, toppidrett" is Studiespesialisering with a subject
    # bolted on: walk the comma-separated prefixes from longest to shortest.
    parts = [p.strip() for p in program.split(',') if p.strip()]
    for i in range(len(parts), 0, -1):
        cand = _strip_noise(_norm(', '.join(parts[:i])))
        if cand in ALIASES:
            return (*_alias(ALIASES[cand], level), 'alias')
        if cand in INDEX:
            return _category(_pick(INDEX[cand], level)), _pick(INDEX[cand], level), 'prefix'
    base = _strip_noise(n)
    close = difflib.get_close_matches(base, list(INDEX), n=1, cutoff=0.84)
    if close:
        code = _pick(INDEX[close[0]], level)
        ratio = difflib.SequenceMatcher(None, base, close[0]).ratio()
        return _category(code), code, f'fuzzy {ratio:.2f}'
    # last resort: a register name sitting inside a longer county label
    inside = [k for k in INDEX if len(k) > 7 and k in base]
    if inside:
        code = _pick(INDEX[max(inside, key=len)], level)
        return _category(code), code, 'contains'
    return None, None, 'unresolved'


def _category(grep_code):
    up = grep_code[:2]
    if up in CATEGORIES:
        return up
    return SUCCESSOR_BY_CODE.get(grep_code[:6]) or SUCCESSOR_BY_PROGRAM.get(up)


def grep_info(program, level=None):
    """Programme name -> (Grep code or None, its official Bokmål title).

    The code is the register's own key for the programme area the county's
    label means — the standard identity a row shares with the same programme
    at any other school. None where the label is outside Grep (IB) or the
    level cannot disambiguate it."""
    _, code, _ = resolve(program, level)
    if not code:
        return None, None
    return code, (GREP_TITLES.get(code) or VIGO_TITLES.get(code) or {}).get('nob')


def covers(label, title):
    """True when the county's label already contains the register title, so
    printing the official name next to it would add nothing."""
    return _norm(title) in _norm(label)


def classify_category(program):
    """The map's filter key for a programme name. 'annet' only if unresolvable,
    which test_parse.py treats as a failure rather than a category."""
    cat, _, _ = resolve(program)
    return cat or 'annet'


# ------------------------------------------------------------------ English names
# Udir's own English title wherever the register has one — 224 of the 244 names
# in the dataset, 94% of the series. The rest are below.
BASE_EN = {
    'teknikk og industriell produksjon': 'Technical and Industrial Production',
    'elektrofag': 'Electrical Engineering',
    'elektro': 'Electrical Engineering',
    'elenergi': 'Electrical Power',
    'data og elektronikk': 'Computer and Electronics',
    'kulde varmepumpe vent tekn': 'Refrigeration, Heat Pump and Ventilation Technology',
    'kulde varmepumpe vent teknologi': 'Refrigeration, Heat Pump and Ventilation Technology',
    'international baccalaureate': 'International Baccalaureate',
    'international baccalaureate ib': 'International Baccalaureate',
    'studiespes business': 'Specialization in General Studies',
    'studiespes skiskyting': 'Specialization in General Studies',
    'dronefag': 'Drone Technology',
    'service og sikkerhet og admin': 'Service, Security and Administration',
    'helse oppvekst ambulanse': 'Healthcare, Childhood and Youth Development',
    'språk samfunn og økonomi toppidrett': 'Languages, Social Sciences and Economics',
    'håndverk design og produktutv søm th': 'Handicrafts, Design and Product Development',
    'elektrofag elenergi': 'Electrical Engineering',
    'elektro og datatekn autom': 'Electrical Engineering and Computer Technology',
    'elektrofag autom': 'Electrical Engineering',
}

# DECISION 5: Udir's English, lightly edited. Two edits only.
#
# The first is casing. The register drifts between title case ("Building and
# Construction") and sentence case ("Electrical engineering and computer
# technology") from one entry to the next, which reads as carelessness when the
# two sit in the same list. _title() capitalises each word's first letter and
# leaves the rest alone, so an initialism keeps its shape: ICT stays ICT.
SMALL = {'and', 'or', 'of', 'the', 'for', 'in', 'to', 'a', 'an', 'with', 'on', 'at'}


def _title(s):
    out = []
    for i, w in enumerate(s.split(' ')):
        if not w:
            continue
        if i and w.lower() in SMALL:
            out.append(w[0].lower() + w[1:])
        else:
            out.append(w[0].upper() + w[1:])
    return ' '.join(out)


# The second is length: their påbygging title runs to 82 characters — unusable
# in a row that also carries a school name and a number.
SHORTEN = {
    'Supplementary programme for general university and college admissions certification':
        'Supplementary year for general university admission',
    'Subjects for general university and college admissions certification':
        'Supplementary year for general university admission',
}

# What the county appended after the programme's own name, and what it means.
# Where the words name a programme area Udir has translated, the gloss is Udir's
# English in lower case (helsearbeider -> Health Work, søm/th -> Sewing and
# Textile Handicrafts); the rest are the plain words, as the first entries have
# always been. Order matters: a longer pattern has to consume its words before
# a shorter one can claim them, or "SK 3 år" reports itself twice.
#
# Every tail keeps its meaning (13 Sept 2026 QA). This list used to be the only
# thing that survived, so a tail it lacked vanished: Lier's three Elektro og
# datateknologi Vg1 rows, 115 groups in 83 schools, read as one programme in
# English. A tail no pattern explains now stays in Norwegian, in parentheses.
QUALIFIERS = [
    (r'\bvg\s*3\s+sk\b', 'Vg3 in school'),               # Grep: "vg3 i skole"
    (r'\bstudiekompetanse\s*\(\s*3\s*år\s*\)', '3-year academic track'),
    (r'\bSK\s*3[\s-]*(år|årig)?(?!\w)', '3-year academic track'),
    # \b: "YSK" used to be read as "SK", so the 4-year track said "academic track"
    (r'\bYSK(\s*4\s*(år)?)?(?!\w)', '4-year vocational + academic'),
    (r'\bSK\b', 'academic track'), (r'\bstudiekompetanse\b', 'academic track'),
    (r'\b(etter|er)\s+yrkeskomp\w*|\be\s*/\s*yrkeskomp\w*|\byrkeskomp\w*',
     'after vocational qualification'),
    (r'\blandslinje\b', 'national programme'), (r'\bLAL\b', 'national programme'),
    (r'\bm/\s*toppidrett\b', 'elite sport'), (r'\btoppidrett\b', 'elite sport'),
    (r'\bheste-?\s*og\s+dyrefag\b', 'equestrian and animal studies'),
    (r'(?<!bratt )\bfriluftsliv\b', 'outdoor life'),
    (r'\bdyrekunnskap\b', 'animal science'), (r'\bdyrefag\b', 'animal studies'),
    (r'\bhest\b', 'horses'), (r'\banleggsgartn[ae]r\b', 'landscaping'),
    (r'\bforskerlinje\b', 'research track'),
    (r'\bentrepr(?:enør|\.)?\s*skap\b', 'entrepreneurship'),
    (r'\bbedr\.?\s*utv(?:ikling)?\b\.?', 'business development'),
    (r'\bteknologifag\b', 'technology'),
    (r'\bteknologi\s+og\s+miljø\b', 'technology and environment'),
    (r'\bhelse-\s*og\s+miljøteknologi\b', 'health and environmental technology'),
    (r'\binternasjonalisering\b', 'internationalisation'), (r'\bskiskyting\b', 'biathlon'),
    (r'\bdagtid\b', 'daytime'), (r'\bkveld\b', 'evening'), (r'\bnett\b', 'online'),
    (r'\bfolkemusikk\b', 'folk music'), (r'\bjazz\b', 'jazz'), (r'\balpin\b', 'alpine skiing'),
    (r'\bbusiness\b', 'business'), (r'\bscience\b', 'science'),
    (r'\bambulanse(?:fag)?\b', 'ambulance'),
    (r'\bhelsearbeid(?:er)?(?:fag)?\b', 'health work'),
    (r'\bbarne\s*(?:-\s*og\s+|og\s+|/\s*)ungd(?:oms)?\.?\s*arb(?:eider)?(?:fag)?\b\.?',
     'child care and youth work'),
    (r'\bautom(?:atisering)?\b', 'automation'), (r'\belenergi\b', 'electrical power'),
    (r'\brealfag\b', 'natural science and mathematics studies'),
    (r'\benergi-?\s*/\s*miljøfag\b', 'energy and environmental studies'),
    (r'\bsøm\s*[/ ]\s*th\b', 'sewing and textile handicrafts'),
    (r'\bgull\s*/\s*sølv\b', 'goldsmith and silversmith'),
    (r'\btrearb(?:eid)?\b\.?', 'woodworking'),
    (r'\binnov(?:asjon)?\s*/\s*ledelse\b', 'innovation and leadership'),
    (r'\binnovasjon\b', 'innovation'),
    (r'\bforberedende\s+IB\b', 'pre-IB'),
    (r'\b2-årig,?\s*1\.\s*år\b', 'year 1 of 2'), (r'\b2-årig,?\s*2\.\s*år\b', 'year 2 of 2'),
    (r'\b4-årig\b', '4-year'),
]

# Names the generic "programme + appended words" reading gets wrong, written
# out. Music, dance and drama names the discipline chosen *inside* the
# programme ("Music, Dance and Drama, music, dance, drama" otherwise). The
# others, 13 Sept 2026: Udir gives Teknikk og industriell produksjon and its
# 2020 successor Teknologi- og industrifag the same English title, so the older
# name keeps its own words; Oslo's "uten formgivingsfag" is glossed with Udir's
# title for Studiespesialisering med formgivingsfag; Godalen's automation Vg1
# has the register area inside the label, not at its start.
WHOLE_EN = {
    'musikk dans og drama musikk': 'Music, Dance and Drama — music',
    'musikk dans og drama dans': 'Music, Dance and Drama — dance',
    'musikk dans og drama drama': 'Music, Dance and Drama — drama',
    'musikk dans og drama folkemusikk lal': 'Music, Dance and Drama — folk music, national programme',
    'musikk folkemusikk lal': 'Music — folk music, national programme',
    'teknikk og industriell produksjon':
        'Technical and Industrial Production (Teknikk og industriell produksjon)',
    'studiespesialisering uten formgivingsfag':
        'Specialization in General Studies (without Art, Craft and Design Studies)',
    'elektro og data automatisering og robotikk sk 3 år':
        'Electrical Engineering and Computer Technology, automation and robotics, 3-year academic track',
    'interiør og eksponeringsdesign interiør og utstillingsdesign':
        'Interior and Exposure Design (Interior and Display Design)',
}

_WORDS = re.compile(r'[^\W_]+')
_JOINERS = {'og', 'til', 'for', 'i'}
_NOT_ABBREV = {'med', 'm', 'og', 'til', 'for', 'i', 'etter', 'er', 'e', 'sk', 'ysk',
               'lal', 'ib', 'vg'}


def _same_word(a, b):
    """A label word spells a title word: equal, abbreviated, or misspelt."""
    if a == b:
        return True
    if a in _NOT_ABBREV or b in _NOT_ABBREV:
        return False
    if len(a) >= 3 and len(b) >= 3 and (a.startswith(b) or b.startswith(a)):
        return True
    return len(a) >= 5 and len(b) >= 5 and difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def _consumed(words, title):
    """How many of the label's leading words spell the programme's own name.
    Counties abbreviate ("Håndverk, design og produktutv"), misspell
    ("produkutvikl"), drop a joiner ("Håndverk, design, produktutvikling") and
    split a word ("Energi operatørfaget")."""
    i = j = 0
    while i < len(words) and j < len(title):
        a, b = words[i], title[j]
        if a != b and len(a) >= 3 and a not in _NOT_ABBREV and b.startswith(a):
            k = i
            while k + 1 < len(words) and b.startswith(''.join(words[i:k + 2])):
                k += 1
            i, j = k + 1, j + 1
        elif _same_word(a, b):
            i, j = i + 1, j + 1
        elif b in _JOINERS and j + 1 < len(title) and _same_word(a, title[j + 1]):
            j += 1
        elif a in _JOINERS and i + 1 < len(words) and _same_word(words[i + 1], b):
            i += 1
        else:
            break
    return i


def _strip_qualifiers(s):
    for pat, _ in QUALIFIERS:
        s = re.sub(pat, ' ', s, flags=re.I)
    return s


# the spellings a programme's own name can take: the register's two titles, and
# the hand-kept keys that resolve to the same category — minus any qualifier a
# key carries ("studiespes business" names Studiespesialisering plus a tail)
_KEY_CAT = {**{k: _alias(v, None)[0] for k, v in ALIASES.items()},
            **{k: resolve(k)[0] for k in BASE_EN}}


def _name_spellings(cat, code):
    out = []
    t = GREP_TITLES.get(code) or VIGO_TITLES.get(code) or {}
    for title in (t.get('nob'), t.get('nno')):
        if title:
            out.append(_norm(title).split())
    for k, c in _KEY_CAT.items():
        if c == cat:
            out.append(_norm(_strip_qualifiers(_norm(k))).split())
    return [w for w in out if w]


def _tail_items(tail):
    """(position, text, is_english) for everything in the tail: a gloss per
    qualifier, and the Norwegian words no qualifier explains."""
    items, masked = [], tail
    for pat, en in QUALIFIERS:
        for m in re.finditer(pat, masked, flags=re.I):
            items.append((m.start(), en, True))
        masked = re.sub(pat, lambda m: '\0' * len(m.group()), masked, flags=re.I)
    for m in re.finditer(r'[^\0]+', masked):
        c, prev = m.group(), None
        while c != prev:
            prev = c
            c = c.strip(' ,.;:/()-–')
            c = re.sub(r'^(?:med|og|m/)\s*', '', c, flags=re.I)
            c = re.sub(r'\s+(?:og|med)$', '', c, flags=re.I)
        if re.search(r'[^\W\d_]{2,}', c):
            items.append((m.start(), c, False))
    return sorted(items)


@functools.lru_cache(maxsize=None)
def english_program(program):
    """Programme name -> English title, or None if nothing can be built."""
    n = _norm(program)
    if n in WHOLE_EN:
        return WHOLE_EN[n]
    cat, code, _ = resolve(program)
    base = BASE_EN.get(n) or BASE_EN.get(_strip_noise(n))
    if not base and code:
        base = (GREP_TITLES.get(code) or {}).get('eng')
    if not base:
        # the register knows the programme but has never translated it: fall
        # back to the category's own English title, which is always right if
        # less specific
        base = CATEGORIES[cat][1] if cat in CATEGORIES else None
    if not base:
        return None
    base = SHORTEN.get(base, base)
    base = _title(re.sub(r'\s*vg\s*[1-4]\s*$', '', base, flags=re.I).strip())
    # read qualifiers only in what the county added after the programme's own
    # name, or "Ambulansefag" reports "ambulance" as if it were an add-on
    words = [(m.group().lower(), m.end()) for m in _WORDS.finditer(program)]
    start = 0
    while start < len(words) and re.fullmatch(r'vg\d?|\d', words[start][0]):
        start += 1                                   # "Vg 4 Påbygg ..."
    label = [w for w, _ in words[start:]]
    used = max((_consumed(label, s) for s in _name_spellings(cat, code)), default=0)
    if not used:
        # the programme's name could not be found in the label: gloss what can
        # be glossed and keep no Norwegian, which would repeat the whole label
        items = [it for it in _tail_items(program) if it[2]]
    else:
        items = _tail_items(program[words[start + used - 1][1]:])
    # a tail that only repeats the programme's own name adds nothing: the
    # register title's words ("Studieforberedende naturbruk", whose area is
    # Naturbruk) or its English ("Naturbruk med heste- og dyrefag")
    own = set(_norm((GREP_TITLES.get(code) or VIGO_TITLES.get(code) or {}).get('nob') or '').split())
    out, seen = base, {base.lower()}
    for _, text, is_english in items:
        if text.lower() in seen or (not is_english and own
                                    and set(_norm(text).split()) <= own):
            continue
        seen.add(text.lower())
        out += f', {text}' if is_english else f' ({text})'
    return out

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
# The dataset spans 2017-2026 and the 2020 reform lands in the middle of it.
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
# Names Grep cannot match, and why. Two kinds only:
#
#   * pre-2020 Vg1 names. Grep reused the codes and replaced the names, so
#     "Elektrofag" and "Teknikk og industriell produksjon" are simply gone from
#     the register even though the codes ELELE1 and TPTIP1 are still there.
#   * county truncations of a programme area — "Elenergi" for "Elenergi og
#     ekom", "Kulde-, varmepumpe-, vent.tekn" for the full mouthful.
#
# Eleven of these, against roughly a hundred keywords before.
ALIASES = {
    'teknikk og industriell produksjon': 'TP',
    'teknikk og industrifag': 'TP',
    'elektrofag': 'EL',
    'elektro': 'EL',
    'elenergi': 'EL',
    'data og elektronikk': 'EL',
    'kulde varmepumpe vent tekn': 'EL',
    'kulde varmepumpe vent teknologi': 'EL',
    'helse og sosialfag': 'HS',
    'helse oppvekst ambulanse': 'HS',
    'service og sikkerhet og admin': 'SR',
    'elektro og datatekn autom': 'EL',
    'håndverk design og produktutv søm th': 'DT',
    'studiespes business': 'ST',
    'studiespes skiskyting': 'ST',
    'språk samfunn og økonomi toppidrett': 'ST',
    'international baccalaureate': 'ST',
    'international baccalaureate ib': 'ST',
    'naturbruk med anleggsgartnar': 'NA',   # else the old BA anleggsgartner wins
}

# ------------------------------------------------------------------- normalising
# Counties bolt these onto a programme name. None of them change which
# programme it is; all of them stop it matching the register.
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


def _pick(codes):
    """A name can match a live code and a discontinued one — Transport og
    logistikk is SSTRL2 and TPTOL2, blacksmithing is DHSME2 and DTSME2. The
    live one wins; that is DECISION 3 applied at the register level."""
    live = [c for c in codes if c[:2] in CATEGORIES]
    return sorted(live or codes)[0]


def resolve(program):
    """Programme name -> (category code, Grep code or None, how it matched).

    The steps are tried in order, most trustworthy first, and `how` records
    which one answered so a reviewer can tell an exact hit from a guess.
    """
    n = _norm(program)
    if 'påbygg' in n or 'pabygg' in n:
        return 'PB', 'PBPBY3----', 'keyword'
    for cand in (n, _strip_noise(n)):
        if cand in ALIASES:
            return ALIASES[cand], None, 'alias'
        if cand in INDEX:
            return _category(_pick(INDEX[cand])), _pick(INDEX[cand]), 'exact'
    # "Studiespesialisering, toppidrett" is Studiespesialisering with a subject
    # bolted on: walk the comma-separated prefixes from longest to shortest.
    parts = [p.strip() for p in program.split(',') if p.strip()]
    for i in range(len(parts), 0, -1):
        cand = _strip_noise(_norm(', '.join(parts[:i])))
        if cand in ALIASES:
            return ALIASES[cand], None, 'alias'
        if cand in INDEX:
            return _category(_pick(INDEX[cand])), _pick(INDEX[cand]), 'prefix'
    base = _strip_noise(n)
    close = difflib.get_close_matches(base, list(INDEX), n=1, cutoff=0.84)
    if close:
        code = _pick(INDEX[close[0]])
        ratio = difflib.SequenceMatcher(None, base, close[0]).ratio()
        return _category(code), code, f'fuzzy {ratio:.2f}'
    # last resort: a register name sitting inside a longer county label
    inside = [k for k in INDEX if len(k) > 7 and k in base]
    if inside:
        code = _pick(INDEX[max(inside, key=len)])
        return _category(code), code, 'contains'
    return None, None, 'unresolved'


def _category(grep_code):
    up = grep_code[:2]
    if up in CATEGORIES:
        return up
    return SUCCESSOR_BY_CODE.get(grep_code[:6]) or SUCCESSOR_BY_PROGRAM.get(up)


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

# What the county appended, and what it means. Order matters: a longer pattern
# has to consume its words before a shorter one can claim them, or "SK 3 år"
# reports itself twice.
SUFFIX = [
    (r',?\s*SK\s*3[\s-]*(år|årig)?', '3-year academic track'),
    (r',?\s*SK\b', 'academic track'),
    (r',?\s*YSK\s*4?\s*(år)?', '4-year vocational + academic'),
    (r',?\s*landslinje', 'national programme'), (r',?\s*LAL\b', 'national programme'),
    (r',?\s*m/toppidrett', 'elite sport'), (r',?\s*toppidrett', 'elite sport'),
    (r',?\s*friluftsliv', 'outdoor life'), (r',?\s*dyrekunnskap', 'animal science'),
    (r',?\s*hest\b', 'horses'), (r',?\s*forskerlinje', 'research track'),
    (r',?\s*entreprenørskap', 'entrepreneurship'), (r',?\s*teknologifag', 'technology'),
    (r',?\s*internasjonalisering', 'internationalisation'), (r',?\s*skiskyting', 'biathlon'),
    (r',?\s*dagtid', 'daytime'), (r',?\s*kveld', 'evening'), (r',?\s*nett\b', 'online'),
    (r',?\s*folkemusikk', 'folk music'), (r',?\s*alpin', 'alpine skiing'),
    (r',?\s*business', 'business'), (r',?\s*ambulanse', 'ambulance'),
]

# Music, dance and drama names the discipline chosen *inside* the programme, so
# the generic "programme + appended subject" reading produces "Music, Dance and
# Drama, music, dance, drama". Written out instead.
MDD = {
    'musikk dans og drama musikk': 'Music, Dance and Drama — music',
    'musikk dans og drama dans': 'Music, Dance and Drama — dance',
    'musikk dans og drama drama': 'Music, Dance and Drama — drama',
    'musikk dans og drama folkemusikk lal': 'Music, Dance and Drama — folk music, national programme',
    'musikk folkemusikk lal': 'Music — folk music, national programme',
}


def english_program(program):
    """Programme name -> English title, or None if nothing can be built."""
    n = _norm(program)
    if n in MDD:
        return MDD[n]
    _, code, _ = resolve(program)
    base = BASE_EN.get(n) or BASE_EN.get(_strip_noise(n))
    if not base and code:
        base = (GREP_TITLES.get(code) or {}).get('eng')
    if not base:
        # the register knows the programme but has never translated it: fall
        # back to the category's own English title, which is always right if
        # less specific
        cat, _, _ = resolve(program)
        base = CATEGORIES[cat][1] if cat in CATEGORIES else None
    if not base:
        return None
    base = SHORTEN.get(base, base)
    base = _title(re.sub(r'\s*vg\s*[1-4]\s*$', '', base, flags=re.I).strip())
    # scan for suffixes only in what the county added after the programme's own
    # name, or "Ambulansefag" reports "ambulance" as if it were an add-on
    tail = program
    _, hit_code, how = resolve(program)
    if hit_code:
        head = _norm((GREP_TITLES.get(hit_code) or {}).get('nob') or '').split(' ')[0]
        if head:
            cut = re.sub(r'^.*?' + re.escape(head) + r'[^,]*', '', tail, count=1, flags=re.I)
            if cut != tail:
                tail = cut
    extras = []
    for pat, en in SUFFIX:
        stripped = re.sub(pat, ' ', tail, flags=re.I)
        if stripped != tail:
            tail = stripped
            if en not in extras:
                extras.append(en)
    return base + (', ' + ', '.join(extras) if extras else '')

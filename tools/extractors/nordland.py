#!/usr/bin/env python3
"""Nordland — chapter 4 of the county's yearly statistics booklet, Vg1–Vg3.

Nordland fylkeskommune printed its thresholds in «Statistikk» (the
statistikkhefte for videregående opplæring), one table per school, every
programme area at every level. Two generations survive:

2013, 2014, 2015 — «OVERSIKT OVER NEDRE POENGGRENSE VED DE ENKELTE
KURSTILBUD OG PROGRAMOMRÅDETILBUD ETTER 2. GANGS INNTAK <year>». The 2013/14
and 2014/15 editions are the county's own PDFs; 2015 survives only as
docplayer.me page text (nordland-poenggrense-2015.transcript.txt, T2). Each
row is «KURS KURSNAVN MED RETT UTEN RETT»: the Grep code, «VGn» and the name,
then the threshold for applicants with ungdomsrett and for those without.
Only MED RETT is read; UTEN RETT is a different population (its own words,
FULLT and UAKTUELL, only ever appear there). The legend, verbatim:
  «Til landslinjer konkurrerer søkere fra hele landet på lik linje om alle
  elevplassene. Til øvrige linjer har søkere fra eget fylke fortrinnsrett.
  Fylkestillegget er 800 poeng. Alle som tidligere har fullført en utdannelse
  som gir yrkes- eller studiekompetanse trekkes automatisk 200 poeng. Diverse
  andre rangeringer gjør at enkelte trekkes 100 poeng.»
  «ALLE = Alle søkere til utdanningsprogrammet er tatt inn etter 2. gangs
  inntak.»
  «800 = Nedre poenggrense for inntak til kurs/programområder etter 2. gangs
  inntak»
so the conversion (decided 26 Sept 2026, research lane AE) is:
  ALLE                        -> 'open'
  INGEN                       -> no cell. Not in the legend; printed in both
                                 columns at once («VG2 DESIGN OG TEKSTIL INGEN
                                 INGEN»): nobody applied, so there is neither
                                 a threshold nor a place everyone got
  a landslinje figure         -> the figure as printed. «Til landslinjer
                                 konkurrerer søkere fra hele landet på lik
                                 linje»: no county supplement, and the table
                                 prints them on the plain scale (Fauske's
                                 «ANLEGGSTEKNIKK (LANDSLINJE) 25,60»)
  any other figure >= 800     -> figure − 800 («Fylkestillegget er 800 poeng»)
  exactly 800,00              -> 0.0, a real number: the last applicant in had
                                 no grade points on top of the supplement
                                 (Akershus and Vestland keep their 0,0 the same
                                 way). ALLE is the separate «everyone in» mark
  any other figure < 800      -> no cell, with a warning. The applicant carried
                                 a deduction («trekkes automatisk 200 poeng»,
                                 «enkelte trekkes 100 poeng») and the table
                                 does not say which, so the points cannot be
                                 recovered (seen once: Sortland Vg2 Realfag
                                 2013, 635,60)
The round is stated: «ETTER 2. GANGS INNTAK», so these rows carry round '2'.

2019–2021 — «Videregående opplæring – Statistikk 2021», «KAPITTEL 4 LAVESTE
INNTAKSPOENG», one three-year table per school with the columns «Laveste
poeng inntatte 2019 / 2020 / 2021». Plain points, no supplement (every figure
lies between 0 and 52). The legend, verbatim:
  «Oversikten viser laveste inntakspoeng på utdanningstilbudene som har vært
  igangsatt. Blanke ruter indikerer at tilbudet ikke er tilbudt gjeldende år.
  I tilfeller der det er mindre enn 5 observasjoner er tallene i rutene
  anonymisert og markert med " - "»
so a blank cell is no cell, «-» is no cell (anonymised, fewer than five
admitted), and a figure is read by its x position, never by token order: a
row with a blank year otherwise shifts its figures into the wrong columns
(lane AE's token-order pass misplaced 57 of 422 rows). «0,0» has no legend
at all; see NORDLAND_ZERO. The booklet never says which intake round the
table is from, nor which applicants («Laveste poeng inntatte»: the lowest
among those admitted, rights group not stated), so these rows carry round
None and META['round'] is None.

Programme names are printed in capitals in 2013–15 and abbreviated in 2021;
they keep their own words (Elektrofag, Teknikk og industriell produksjon,
Service og samferdsel, Design og håndverk stay as printed) and only
spelling, capitals, abbreviations and the county's typos are brought to the
official spelling (OLD_NAMES, NEW_NAMES). Helse- og sosialfag is the one
exception, joined to Helse- og oppvekstfag by the merge: the register renamed
it in 2013 under the same code (common.SERIES_ALIASES).
"""
import os
import re
import sys

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'sources', 'nordland')

META = {
    'code': '18', 'fylke': 'Nordland', 'round': None, 'rights': 'ungdomsrett',
    'free_choice': False,          # regional intake 2013-2024 (inntaksområder)
    'levels': 'Vg1–Vg3',
    'round_note': 'the county does not state which intake round the figures are from',
    # the newest document; its nfk.no address answers 404 (checked 26.09.2026),
    # so the address given is the Wayback Machine's copy of that file
    'source': ('https://web.archive.org/web/20220619024639/https://www.nfk.no/_f/p1/'
               'i5f39ecf5-39a7-4346-922d-610d4389916e/'
               'Videreg%C3%A5ende%20oppl%C3%A6ring%20-%20Statistikk%202021.pdf'),
    'note': ('2013–2015 are printed on an 800-point scale (the county supplement, '
             '«Fylkestillegget er 800 poeng») and are published as the figure − 800; '
             'landslinjer carry no supplement and are published as printed'),
    # «laveste inntakspoeng på utdanningstilbudene som har vært igangsatt»:
    # the lowest admitted, with no marker for «everyone got in»; the app says
    # so beside these years (lowestAdmittedNote)
    'lowest_admitted_years': ['2019', '2020', '2021'],
    # printed on the 800-point scale and published as the figure − 800
    # (landslinjer excepted); the app says so beside them (supplementNote)
    'supplement_years': ['2013', '2014', '2015'],
}

# Where each file came from. The two nfk.no handler links answer 404 today
# (26.09.2026); the Wayback Machine holds all three PDFs byte-identical.
SOURCE_URLS = {
    'nordland-statistikk-2021.pdf':
        'https://www.nfk.no/_f/p1/i5f39ecf5-39a7-4346-922d-610d4389916e/'
        'Videreg%C3%A5ende%20oppl%C3%A6ring%20-%20Statistikk%202021.pdf',
    'nordland-statistikkhefte-2014-2015.pdf':
        'https://web.archive.org/web/20150324025529id_/'
        'https://www.nfk.no/Handlers/fh.ashx?MId1=5051&FilId=34759',
    'nordland-statistikkhefte-2013-2014.pdf':
        'https://web.archive.org/web/20150324085047id_/'
        'https://www.nfk.no/Handlers/fh.ashx?MId1=5051&FilId=22713',
    'nordland-poenggrense-2015.transcript.txt':
        'https://web.archive.org/web/20170705185254/http://docplayer.me/28107511',
}

# «0,0» in the 2019-21 table (no legend explains it). 'number' publishes it
# as 0.0, a threshold of no grade points, as the 2013-15 tables' 800,00 is
# read; 'open' publishes it as «everyone qualified got in». Lane AE could not
# tell the two apart from the data (a 2013 ALLE row is no likelier to show
# 0,0 later than a row with a real 2013 threshold); the county has been asked.
NORDLAND_ZERO = 'number'

FILE_2021 = 'nordland-statistikk-2021.pdf'
TRANSCRIPT_2015 = 'nordland-poenggrense-2015.transcript.txt'
FILES_800 = {                      # the county's own PDFs, newest first
    'nordland-statistikkhefte-2014-2015.pdf': 2014,
    'nordland-statistikkhefte-2013-2014.pdf': 2013,
}

SUPPLEMENT = 800.0

# ---- schools --------------------------------------------------------------
# The printed name, lower-cased with «vgs» spelled out and the «avd.» and
# comma punctuation dropped -> the name published: the register's (NSR, see
# tools/nsr-vgs.json) wherever the register lists the school.
SCHOOLS = {
    'andøy videregående skole': 'Andøy videregående skole',
    'aust-lofoten videregående skole': 'Aust-Lofoten videregående skole',
    'bodin videregående skole': 'Bodin videregående skole',
    'bodø videregående skole': 'Bodø videregående skole',
    'brønnøysund videregående skole': 'Brønnøysund videregående skole',
    'fauske videregående skole': 'Fauske videregående skole',
    'hadsel videregående skole': 'Hadsel videregående skole',
    'meløy videregående skole': 'Meløy videregående skole',
    'mosjøen videregående skole': 'Mosjøen videregående skole',
    'mosjøen videregående skole avd hattfjelldal': 'Mosjøen videregående skole avd Hattfjelldal',
    'narvik videregående skole': 'Narvik videregående skole',
    'polarsirkelen videregående skole': 'Polarsirkelen videregående skole',
    'saltdal videregående skole': 'Saltdal videregående skole',
    'sandnessjøen videregående skole': 'Sandnessjøen videregående skole',
    'vest-lofoten videregående skole': 'Vest-Lofoten videregående skole',
    # renamed in 2025, see RENAMED
    'knut hamsun videregående skole': 'Knut Hamsun videregående skole',
    'knut hamsun videregående skole avd steigen': 'Knut Hamsun videregående skole, avd. Steigen',
    # NSR lists only the campuses («avd Sortland», «avd Kleiva»); the tables
    # print one school, and its naturbruk lines (landbruk, hest, akvakultur)
    # are taught at Kleiva, so the printed name is kept rather than filing
    # every line under one campus
    'sortland videregående skole': 'Sortland videregående skole',
    'sortland videregående skole avd øksnes': 'Sortland videregående skole avd Øksnes',
    # printed in the 2013 edition only and gone from the register: the
    # printed name, «vgs» spelled out
    'sortland videregående skole avd lødingen': 'Sortland videregående skole avd. Lødingen',
    'sortland videregående skole avd bø': 'Sortland videregående skole avd. Bø',
}

# Knut Hamsun videregående skole became Nuortta-Sálto joarkkaskåvllå / Nord-
# Salten videregående skole on 3 September 2025 (same organisation number,
# 974621282; NRK Nordland 3.9.2025). Its Steigen branch was renamed with it
# (912885070). One school, one series, published under the register's name.
RENAMED = {
    'Knut Hamsun videregående skole': ('Nord-Salten videregående skole Joarkkaskåvllå', 2025),
    'Knut Hamsun videregående skole, avd. Steigen': ('Nord-Salten videregående skole avd Steigen', 2025),
}


def _school_key(printed):
    k = common.squash(printed).lower()
    k = re.sub(r'\bvgs\b\.?', 'videregående skole', k)
    k = re.sub(r'\bavd\b\.?', 'avd', k).replace(',', ' ')
    return re.sub(r'\s+', ' ', k).strip()


def _school(printed, fname, warn):
    name = SCHOOLS.get(_school_key(printed))
    if name is None:
        warn.append(f'{META["fylke"]}: {fname}: unknown school «{printed}», kept as printed')
        return common.squash(printed)
    return name


def _apply_renames(rows):
    for r in rows:
        if r['school'] in RENAMED:
            new, year = RENAMED[r['school']]
            r['merged_from'], r['merged_year'] = r['school'], year
            r['school'] = new
    return rows


# ---- programme names --------------------------------------------------------
# 2013-15, after _old_program's clean-up (lower case; «(LANDSLINJE)» and a
# spaced dash turned into a comma; an en dash before «OG» into a hyphen).
# Only spelling, abbreviation and typo variants of one programme are joined;
# a name not listed here is printed as it stands with a capital first letter.
OLD_NAMES = {
    # typos and hyphenation
    'bygg og anlleggsteknikk': 'Bygg- og anleggsteknikk',
    'design- og håndverk': 'Design og håndverk',
    'kokk og servitørfag': 'Kokk- og servitørfag',
    'kokk og servitør': 'Kokk- og servitørfag',
    'kokk- og servitørfaget': 'Kokk- og servitørfag',
    'heste- og hovslagerfaget': 'Heste- og hovslagerfag',
    'hest og hovslagerfaget': 'Heste- og hovslagerfag',
    'barne og ungdomsarbeiderfag': 'Barne- og ungdomsarbeiderfag',   # 2015 text lost the dash
    'barne- og ungdomsarbeider': 'Barne- og ungdomsarbeiderfag',
    'salg service og sikkerhet': 'Salg, service og sikkerhet',
    'ikt-servicefag': 'IKT-servicefag',
    'ikt, servicefag': 'IKT-servicefag',                               # «IKT – SERVICEFAG»
    'ikt servicefag': 'IKT-servicefag',
    'klima-/energi/miljøtekn.': 'Klima-, energi- og miljøteknikk',
    'klima,energi og miljøteknikk': 'Klima-, energi- og miljøteknikk',
    'klima, energi- og miljøteknikk': 'Klima-, energi- og miljøteknikk',
    'klima- energi- og miljøtekn': 'Klima-, energi- og miljøteknikk',
    'teknikk og ind.produksjon': 'Teknikk og industriell produksjon',
    # abbreviations
    'påbygging til gsk': 'Påbygging til generell studiekompetanse',
    'påbygging til gsk etter yrkeskompetanse':
        'Påbygging til generell studiekompetanse etter yrkeskompetanse',
    'studiespesialisering m. formgivingsfag': 'Studiespesialisering med formgivingsfag',
    'studiespesialisering, formgivningsfag': 'Studiespesialisering med formgivingsfag',
    'studiespesialisering m. forskerlinje': 'Studiespesialisering, forskerlinje',
    # Bodin 2014, the same code (STUSP1--Q-) as its forskerlinje in 2015 and
    # 2019-21, but its own words; «FORKNING» is the booklet's typo
    'studiespesialisering m. teknologi og forkning': 'Studiespesialisering med teknologi og forskning',
    'studieforb. medier og kommunikasjon': 'Studieforberedende medier og kommunikasjon',
    'studieforb. medier/kommunikasjon': 'Studieforberedende medier og kommunikasjon',
    'medier/kommunikasjon studieforb.': 'Studieforberedende medier og kommunikasjon',
    'medier/komm studieforb': 'Studieforberedende medier og kommunikasjon',
    'studieforb. naturbruk': 'Studieforberedende naturbruk',           # 2021's own spelling
    'musikk/dans/drama, musikk': 'Musikk, dans og drama, musikk',
    'musikk/dans/drama, dans': 'Musikk, dans og drama, dans',
    'musikk/dans/drama, drama': 'Musikk, dans og drama, drama',
    'musikk/dans/drama musikk': 'Musikk, dans og drama, musikk',       # 2015 text lost the dash
    'musikk/dans/drama dans': 'Musikk, dans og drama, dans',
    'musikk/dans/drama drama': 'Musikk, dans og drama, drama',
    'idrettsfag alpint, landslinje': 'Idrettsfag, alpint, landslinje',  # 2015 text lost the dash
}
# Polarsirkelen prints the Vg1 (STFOR1) as plain «FORMGIVINGSFAG», the name of
# the Vg2 and Vg3 areas; the Vg1's own name is Studiespesialisering med
# formgivingsfag, as Bodin and Narvik print it
OLD_NAMES_AT_LEVEL = {
    ('formgivingsfag', 'Vg1'): 'Studiespesialisering med formgivingsfag',
}

# 2019-21, keyed by the printed name in lower case, after «,LAL» has become
# «, landslinje» (the 2013-15 tables' own word) and «veksl.m» «vekslingsmodell»
NEW_NAMES = {
    'språk/samf.fag/økonomi,musikk': 'Språk, samfunnsfag og økonomi, musikk',
    'påbygg gen studiekomp,sk': 'Påbygging til generell studiekompetanse, SK',
}


def _old_program(words, level):
    n = common.squash(' '.join(words))
    n = re.sub(r'\s*[–—]\s*OG\b', '- OG', n)               # «HELSE – OG SOSIALFAG»
    n = re.sub(r'\s*\(LANDSLINJE\)', ', LANDSLINJE', n)
    n = re.sub(r'\s+[–—-]\s+', ', ', n)                    # «IDRETTSFAG – ALPINT»
    k = n.lower()
    n = OLD_NAMES_AT_LEVEL.get((k, level)) or OLD_NAMES.get(k) or (k[:1].upper() + k[1:])
    return common.canon_program(n)


def _new_program(printed):
    n = common.squash(printed)
    n = re.sub(r',\s*LAL$', ', landslinje', n)
    n = n.replace('veksl.m', 'vekslingsmodell')
    return common.canon_program(NEW_NAMES.get(n.lower(), n))


# ---- 2013-2015: the 800-point tables ---------------------------------------
LEVEL = re.compile(r'^VG([1-3])$')
VALUE = re.compile(r'^(ALLE|INGEN|FULLT|UAKTUELL|\d{1,3}(?:,\d{1,2})?)$')
UTEN_ONLY = ('FULLT', 'UAKTUELL')        # the legend's words for the UTEN RETT column
# a Grep code as printed: «BABAT1----», «PBPBYG3----», «IDRET1—A-», and the
# 2015 text's truncations «MDMDD», «TPPIN»; split codes («TPPIN2 ----»,
# «MDMDD1- -4 -», and the 2015 text's «STUSP1 Q-») end in dash fragments
CODE_HEAD = re.compile(r'^[A-Z]{5,6}\d?[A-Z0-9\-–—]*$')
CODE_FRAG = re.compile(r'^(?:[\-–—]+[A-Z0-9]{0,2}[\-–—]*|[A-Z0-9]{1,2}[\-–—]+)$')
HEADING = re.compile(r'(?:[A-ZÆØÅ][A-ZÆØÅ\-]* )+?(?:VIDEREGÅENDE SKOLE|VGS\.? AVD\. [A-ZÆØÅ]+)')
COLUMN_HEAD = re.compile(r'\bKURS KURSNAVN(?: (?:MED|UTEN) UTEN)?(?: RETT RETT)?')
# Mosjøen's 2015 table prints its Hattfjelldal campus as a second Naturbruk
# line, «NATURBRUK HATTFJELLDAL»; the 2019-21 table gives the campus its own
# heading with the same code (NANAB1), and the register lists it
CAMPUS_LINES = {
    ('Mosjøen videregående skole', 'NATURBRUK HATTFJELLDAL'):
        ('Mosjøen videregående skole avd Hattfjelldal', ['NATURBRUK']),
}


def _is_landslinje(code, name_words):
    # the code's seventh character is «L» on every landslinje (ELFLY2L----,
    # IDRET1L-B-), and the name says so as well
    return bool(re.match(r'^[A-Z]{5}\dL', code)) or 'LANDSLINJE' in ' '.join(name_words)


def _cell_800(med, landslinje, where, warn, counts):
    if med == 'ALLE':
        return 'open'
    if med == 'INGEN':
        counts['ingen'] += 1
        return None
    v = float(med.replace(',', '.'))
    if landslinje:
        if v >= SUPPLEMENT:
            warn.append(f'{where}: landslinje figure {med} carries the supplement, dropped')
            return None
        pts = round(v, 2)
    elif v < SUPPLEMENT:
        warn.append(f'{where}: {med} is below the 800 supplement (a deducted applicant, '
                    f'«trekkes automatisk 200 poeng»), points cannot be recovered, dropped')
        return None
    else:
        pts = round(v - SUPPLEMENT, 2)
    if pts > common.MAX_PLAUSIBLE:
        warn.append(f'{where}: {med} gives {pts} points, out of range, dropped')
        return None
    return pts


def _read_800(text, fname, year, rnd, warn):
    """One edition's text, as a single token stream, -> rows.

    A row is anchored on its «VGn»: the code sits just before it, the name
    runs to the first cell, and whatever follows the two cells up to the next
    code is a page number, the next school's heading, the column heads, or
    the tail of a name the page wrapped («… M. TEKNOLOGI OG 850,60 FULLT» /
    «FORKNING»)."""
    toks = text.split()
    rows, counts = [], {'ingen': 0}
    anchors = []
    for i, t in enumerate(toks):
        if not LEVEL.match(t):
            continue
        j = i - 1
        while j >= 0 and CODE_FRAG.match(toks[j]):
            j -= 1
        if j < 0 or not CODE_HEAD.match(toks[j]) or VALUE.match(toks[j]):
            warn.append(f'{META["fylke"]}: {fname}: no code before «{" ".join(toks[max(0, i - 3):i + 4])}», skipped')
            continue
        anchors.append((j, i))

    def headings(chunk, where):
        """The school named in chunk (the last heading), and the text before it."""
        txt = COLUMN_HEAD.sub(' ', ' '.join(chunk)).replace('WWW.NFK.NO', ' ')
        found = list(HEADING.finditer(txt))
        if not found:
            return None, txt
        for h in found[:-1]:
            warn.append(f'{META["fylke"]}: {fname}: «{h.group(0)}» is printed with no rows')
        tail = common.squash(txt[found[-1].end():])
        if tail:
            warn.append(f'{META["fylke"]}: {fname}: «{tail}» after «{found[-1].group(0)}» ignored ({where})')
        return found[-1].group(0), txt[:found[0].start()]

    school, _ = headings(toks[:anchors[0][0]] if anchors else [], 'before the first row')
    for k, (cstart, vg) in enumerate(anchors):
        end = anchors[k + 1][0] if k + 1 < len(anchors) else len(toks)
        seg = toks[vg + 1:end]
        code = ''.join(toks[cstart:vg])
        level = 'Vg' + toks[vg][-1]
        v = next((n for n, t in enumerate(seg) if VALUE.match(t)), None)
        where = f'{META["fylke"]}: {fname}: {school} «{" ".join(toks[cstart:vg + 1 + (v or 0)])}»'
        if v is None or not school:
            warn.append(f'{where}: no cells or no school, skipped')
            continue
        name_words, med = seg[:v], seg[v]
        n_cells = 2 if v + 1 < len(seg) and VALUE.match(seg[v + 1]) else 1
        new_school, before = headings(seg[v + n_cells:], where)
        # what is left before the next heading, bar page numbers, is the
        # wrapped tail of this row's name
        tail = [t for t in before.split() if not re.fullmatch(r'\d{1,3}', t)]
        name_words = name_words + tail
        row_school = _school(school, fname, warn)
        campus = CAMPUS_LINES.get((row_school, ' '.join(name_words)))
        if campus:
            row_school, name_words = campus
        if med in UTEN_ONLY:
            warn.append(f'{where}: the MED RETT cell is missing («{" ".join(seg[v:v + n_cells])}»), skipped')
        else:
            cell = _cell_800(med, _is_landslinje(code, name_words), where, warn, counts)
            if cell is not None:
                row = {'school': row_school, 'program': _old_program(name_words, level),
                       'level': level, 'values': {year: cell},
                       'county': META['fylke'], 'round': rnd}
                # 2015 is docplayer's text of the county's lost PDF, a copy
                if fname.endswith('.transcript.txt'):
                    row['reprint'] = True
                rows.append(row)
        if new_school:
            school = new_school
    if counts['ingen']:
        warn.append(f'{META["fylke"]}: {fname}: {counts["ingen"]} INGEN cells (no applicants) skipped')
    return rows


def _pdf_800(path, year, warn):
    """The chapter's pages of one booklet, from its title page on."""
    with pdfplumber.open(path) as pdf:
        texts = [p.extract_text() or '' for p in pdf.pages]
    first = next((i for i, t in enumerate(texts) if 'OVERSIKT OVER NEDRE POENGGRENSE' in t), None)
    if first is None:
        warn.append(f'{META["fylke"]}: {os.path.basename(path)}: no poenggrense chapter found')
        return [], None
    text = ' '.join(texts[first:])
    # «ETTER 2. GANGS INNTAK <year>» in the title: the round, stated
    m = re.search(r'ETTER\s+(\d)\.\s*GANGS\s+INNTAK\s+(\d{4})', text)
    if not m or int(m.group(2)) != year:
        warn.append(f'{META["fylke"]}: {os.path.basename(path)}: title does not state '
                    f'«ETTER n. GANGS INNTAK {year}», round left unset')
    return text, (m.group(1) if m and int(m.group(2)) == year else None)


def _transcript_800(path, warn):
    meta, pages = {}, []
    for ln in open(path, encoding='utf-8'):
        if ln.startswith('#'):
            k, _, v = ln[1:].strip().partition(':')
            meta[k.strip()] = v.strip()
        elif '\t' in ln:
            pages.append(ln.split('\t', 1)[1].strip())
    text = ' '.join(pages)
    # docplayer drops the upper-case string «RETT» wherever it occurs (see the
    # file's header): «IDSFAG» is IDRETTSFAG and «TOPPID» TOPPIDRETT. No other
    # word in the table contains it.
    text = re.sub(r'\bIDSFAG\b', 'IDRETTSFAG', text)
    text = re.sub(r'\bTOPPID\b', 'TOPPIDRETT', text)
    m = re.search(r'ETTER\s+(\d)\.\s*GANGS\s+INNTAK\s+(20\d\d)', text)
    if not m:
        warn.append(f'{META["fylke"]}: {os.path.basename(path)}: no year/round in the title')
        return text, None, None
    return text, int(m.group(2)), m.group(1)


# ---- 2019-2021: «Laveste inntakspoeng» ---------------------------------------
CODE21 = re.compile(r'^[A-Z]{5}\d[A-Z0-9-]*$')
FIG21 = re.compile(r'^\d{1,2},\d{1,2}$')


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


def _read_2021(path, warn):
    fname = os.path.basename(path)
    rows, school, cols = [], None, None
    zeros, dashes = {}, 0
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            if 'Programkode' not in text:
                continue
            for line in _cluster(page.extract_words()):
                toks = sorted(line, key=lambda w: w['x0'])
                words = [w['text'] for w in toks]
                if words[0] == 'Programkode':
                    # «Programkode Nivå Utdanningsprogram inntatte 2019 inntatte
                    # 2020 inntatte 2021»: the figures are right-aligned under
                    # their year, so each is filed under the nearest year's x1
                    years = [(int(w['text']), w['x1']) for n, w in enumerate(toks)
                             if re.fullmatch(r'20\d\d', w['text']) and n
                             and toks[n - 1]['text'] == 'inntatte']
                    first_x = min((w['x0'] for w in toks if w['text'] == 'inntatte'), default=None)
                    cols = (years, first_x) if years and first_x else None
                    continue
                joined = ' '.join(words)
                m = re.match(r'^(\d{5})\s*(\S.*)$', joined)
                if m and toks[0]['x0'] < 100:
                    school = _school(m.group(2), fname, warn)
                    continue
                if not CODE21.match(words[0]):
                    continue                       # page header, «Laveste poeng», «side n»
                if not cols or not school:
                    warn.append(f'{META["fylke"]}: {fname}: row before its header or school: «{joined}»')
                    continue
                years, first_x = cols
                if len(words) < 3 or words[1] not in ('1', '2', '3'):
                    warn.append(f'{META["fylke"]}: {fname}: {school}: no Nivå in «{joined}», skipped')
                    continue
                level = 'Vg' + words[1]
                name = ' '.join(w['text'] for w in toks[2:] if w['x0'] < first_x - 4)
                values, seen = {}, set()
                for w in (w for w in toks[2:] if w['x0'] >= first_x - 4):
                    year = min(years, key=lambda y: abs(y[1] - w['x1']))[0]
                    t = w['text']
                    if year in seen:
                        warn.append(f'{META["fylke"]}: {fname}: {school}: two figures under {year} in «{joined}»')
                        continue
                    seen.add(year)
                    if t == '-':
                        dashes += 1                 # anonymised: fewer than 5 admitted
                        continue
                    if not FIG21.match(t):
                        warn.append(f'{META["fylke"]}: {fname}: {school}: unread cell «{t}» in «{joined}»')
                        continue
                    v = float(t.replace(',', '.'))
                    if v == 0:
                        zeros[year] = zeros.get(year, 0) + 1
                        v = 'open' if NORDLAND_ZERO == 'open' else 0.0
                    elif v > common.MAX_PLAUSIBLE:
                        warn.append(f'{META["fylke"]}: {fname}: {school}: {t} out of range in «{joined}»')
                        continue
                    values[year] = v
                if values:
                    rows.append({'school': school, 'program': _new_program(name), 'level': level,
                                 'values': values, 'county': META['fylke'], 'round': None})
    if zeros:
        warn.append(f'{META["fylke"]}: {fname}: «0,0» (no legend) published as '
                    f'{"open" if NORDLAND_ZERO == "open" else "0.0"} (NORDLAND_ZERO): '
                    + ', '.join(f'{y} {n}' for y, n in sorted(zeros.items())))
    if dashes:
        warn.append(f'{META["fylke"]}: {fname}: {dashes} «-» cells (fewer than 5 admitted, '
                    f'anonymised) skipped')
    return rows, zeros


def zero_counts():
    """{year: number of «0,0» cells} in the 2019-21 table, the cells
    NORDLAND_ZERO decides."""
    return _read_2021(os.path.join(SRC, FILE_2021), [])[1]


def extract():
    warn, out = [], []
    if not os.path.isdir(SRC):
        return out, [f'{META["fylke"]}: no source directory']
    known = {FILE_2021, TRANSCRIPT_2015, *FILES_800}
    for fname in sorted(os.listdir(SRC)):
        if fname not in known:
            warn.append(f'{META["fylke"]}: {fname} is not read (add it to the extractor if it is a table)')
    # newest first
    path = os.path.join(SRC, FILE_2021)
    if os.path.exists(path):
        out.append((FILE_2021, _apply_renames(_read_2021(path, warn)[0])))
    else:
        warn.append(f'{META["fylke"]}: missing source {FILE_2021}')
    path = os.path.join(SRC, TRANSCRIPT_2015)
    if os.path.exists(path):
        text, year, rnd = _transcript_800(path, warn)
        if year:
            out.append((TRANSCRIPT_2015, _apply_renames(_read_800(text, TRANSCRIPT_2015, year, rnd, warn))))
    else:
        warn.append(f'{META["fylke"]}: missing source {TRANSCRIPT_2015}')
    for fname, year in FILES_800.items():
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            warn.append(f'{META["fylke"]}: missing source {fname}')
            continue
        text, rnd = _pdf_800(path, year, warn)
        if text:
            out.append((fname, _apply_renames(_read_800(text, fname, year, rnd, warn))))
    return out, warn

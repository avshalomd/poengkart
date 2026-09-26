#!/usr/bin/env python3
"""Rogaland — rolling multi-year PDF matrices published via vilbli.no (8 files).

Coordinate extraction (pdfplumber); the layout specifics live in
tools/parse_pdfs.py, which this module wraps so the Rogaland logic and its
regression tests stay in one place.
"""
import json
import os
import re
import sys

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common  # noqa: E402
from parse_pdfs import FILES, SRC, parse_pdf   # noqa: E402

META = {
    'code': '11',
    'fylke': 'Rogaland',
    'round': '2',                     # published after 2. inntak
    'rights': 'ungdomsrett',
    'free_choice': True,              # fritt skolevalg countywide (FOR-2024-12-11-3099 §3)
    'source': 'https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6',
}

# Cells the county has corrected in writing, applied on top of every edition
# that still prints the wrong value: (school, programme, level, year) ->
# (as printed, as corrected). A correction whose printed value no longer
# matches is left unapplied and warned about, so a reissue that fixes the
# cell, or prints something else again, is never overridden silently.
COUNTY_CORRECTIONS = {
    # printed «3,0», below the lowest possible score of 10; the county's
    # section for dimensjonering og inntak answered on 23.09.2026 (POENG-34):
    # «På Bergeland skal det være "ingen venteliste", her var det ledig plass.»
    ('Bergeland videregående skole', 'Medier og kommunikasjon', 'Vg2', 2026): (3.0, 'open'),
}


# ---- 2012 and 2015, from before the vilbli series (which starts in 2018) ----
# The register names the county's own tables use, by the stem the older
# sources print («Bryne vg.», «St.Svithun vg.», «Stvgr. Katedral», «SOTS»).
SCHOOLS = {
    'bergeland': 'Bergeland videregående skole', 'bryne': 'Bryne vidaregåande skule',
    'dalane': 'Dalane videregående skole', 'gand': 'Gand videregående skole',
    'godalen': 'Godalen videregående skole', 'haugaland': 'Haugaland videregående skole',
    'hetland': 'Hetland videregående skole', 'jåttå': 'Jåttå videregående skole',
    'karmsund': 'Karmsund videregående skole', 'kopervik': 'Kopervik videregående skole',
    'randaberg': 'Randaberg videregående skole', 'sandnes': 'Sandnes videregående skole',
    'sauda': 'Sauda vidaregåande skule', 'skeisvang': 'Skeisvang videregående skole',
    'sola': 'Sola videregående skole', 'st. olav': 'St. Olav videregående skole',
    'st. svithun': 'St. Svithun videregående skole', 'strand': 'Strand videregående skole',
    'vardafjell': 'Vardafjell videregående skole', 'vågen': 'Vågen videregående skole',
    'åkrehamn': 'Åkrehamn vidaregåande skole', 'øksnevad': 'Øksnevad vidaregåande skole',
    'ølen': 'Ølen vidaregåande skule',
    'stavanger katedralskole': 'Stavanger Katedralskole', 'stvgr. katedral': 'Stavanger Katedralskole',
    'stavanger offshore tekniske skole': 'Stavanger Offshore Tekniske skole',
    'sots': 'Stavanger Offshore Tekniske skole',
}


def _school(printed):
    n = common.school_name(printed).lower()
    n = re.sub(r'\s*\(\+ avd\. sand\)$', '', n)          # «Sauda vg. (+ avd. Sand)»
    n = re.sub(r'\s+vg\.?$', '', n)
    return SCHOOLS.get(n)


# Programme labels to the spelling the county's own tables use for the same
# programme area, so a 2015 figure joins the 2018- series. Only spelling and
# the portal's longer forms; renamed programmes keep their own names.
PORTAL_NAMES = {
    'helse og oppvekstfag': 'Helse- og oppvekstfag',
    'helsefagarbeider': 'Helsearbeiderfag',
    'anleggsgartner og idrettsanleggsfag': 'Anleggsgartner – og idrettsanlegg',
    'anleggsteknikk (landslinje)': 'Anleggsteknikk, landslinje',
    'flyfag (landslinje)': 'Flyfag, Landslinje',
    'heste og hovslagerfag': 'Heste- og hovslagerfaget',
    'klima-, energi- og miljøteknikk': 'Klima, energi og miljøteknikk',
    'kokk- og servitørfag': 'Kokk og servitørfag',
    'kulde- og varmepumpeteknikk': 'Kulde og varmepumpeteknikk',
    'labratoriefag': 'Laboratoriefag',
    'studiespesialisering realfag': 'Realfag',
    'studiespesialisering språk, samfunnsfag og økonomi': 'Språk, samfunn og økonomi',
    'studiespesialisering formgivningsfag': 'Formgivingsfag',
    'automatiseringsfaget (i skole)': 'Automatiseringsfaget',
    'avionikerfaget (landslinje i skole)': 'Avionikerfaget Landslinje',
    'dataelektronikerfaget (i skole)': 'Dataelektronikerfaget',
    'flytekniske fag (landslinje i skole)': 'Flytekniske fag, landslinje',
    'anleggsmaskinmekaniker (landslinje)': 'Anleggsmaskinmekaniker landslinje',
    'naturbruk (studieforberedende)': 'Naturbruk, studieforberedende',
    'påbygging til generell studiekompetanse': 'Påbygg til generell studiekompetanse',
    # Stavanger Aftenblad 2012
    'media og kommunikasjon': 'Medier og kommunikasjon',
    'elektro': 'Elektrofag',
    'flyfag': 'Flyfag, Landslinje',
}
# offers the portal lists but that are not an ordinary competition: small
# special-needs groups, the minority-language class, and the offers the
# portal's own notes say carry no average (St. Svithun's toppidrett, IB)
PORTAL_SKIP = re.compile(r'grunnkompetanse i gruppe|spesialundervisning|minoritetsspr|'
                         r'toppidrett|\bIB\b|international baccalaureate', re.I)
PORTAL = '31skoler-v3-2016-01-25-wayback.json'


def _portal(path, warn):
    """31skoler.no, the county's school portal for applicants in 2016 (one
    Wayback capture, 25.01.2016, of its data file /data/31skolerv3.json).

    Each offer's «limit» is the lowest average «fra forrige inntak» (from the
    previous intake) — the 2015 intake, as the portal served the 2016
    applicants (it prints «SKULERUTE FOR SKULEÅRET 2015/2016» and the 1 March
    2016 deadline). It names no round, so the round is None. Its own legend:
    «De utdanningsprogrammene hvor det står at snittet er 10 betyr at alle som
    var kvalifisert har kommet inn» (10 = everyone qualified got in, so open),
    under the heading «Fagtilbud hvor karaktersnittet er 10 eller ikke
    registrert» (so 0 = not registered, no figure). Vg4-Vg5 påbygg offers are
    left out: which of the county's later Vg4 series they are is not clear."""
    d = json.load(open(path, encoding='utf-8'))
    areas = {a['id']: a for group in d['programAreas'].values() for a in group}
    schools = {s['id']: s['name'] for s in d['schools']}
    rows, unknown = [], set()
    for card in d['comboCards']:
        area = areas.get(card['programAreaId'])
        name = schools.get(card['schoolId'], '')
        if not area or name == 'Fagopplæring i bedrift':
            continue
        label = common.squash(area['name'])
        if area.get('year') not in ('1', '2', '3') or PORTAL_SKIP.search(label):
            continue
        limit = float(card['limit'] or 0)
        if limit == 0:
            continue
        school = _school(name)
        if not school:
            unknown.add(name)
            continue
        rows.append({'school': school, 'program': PORTAL_NAMES.get(label.lower(), label),
                     'level': f'Vg{area["year"]}',
                     'values': {2015: 'open' if limit == 10 else limit},
                     'county': META['fylke'], 'round': None})
    for n in sorted(unknown):
        warn.append(f'{PORTAL}: unknown school {n!r}')
    return rows


NEWS_2017 = 'rogaland-2017-1inntak-rogfk-commoncrawl.html'
# the table's short labels, to the names the county's own tables use for the
# same programme area in 2018 (the series the 2017 figure joins)
NEWS_2017_NAMES = {
    ('Vg1', 'studiespesialisering'): 'Studiespesialisering', ('Vg1', 'musikk'): 'Musikk',
    ('Vg1', 'dans'): 'Dans', ('Vg1', 'drama'): 'Drama', ('Vg1', 'elektro'): 'Elektrofag',
    ('Vg1', 'helse- og oppvekst'): 'Helse- og oppvekstfag',
    ('Vg1', 'kunst, design, ark.'): 'Kunst, design og arkitektur', ('Vg1', 'idrettsfag'): 'Idrettsfag',
    ('Vg2', 'språk, samf., økon.'): 'Språk, samfunn og økonomi', ('Vg2', 'realfag'): 'Realfag',
    ('Vg2', 'elenergi'): 'Elenergi', ('Vg2', 'automasjon'): 'Automatisering',
    ('Vg2', 'data og elektronikk'): 'Data og elektronikk', ('Vg2', 'kjøretøy'): 'Kjøretøy',
    ('Vg2', 'ambulansefag'): 'Ambulansefag', ('Vg2', 'helsearbeiderfag'): 'Helsearbeiderfag',
    ('Vg2', 'hudpleie'): 'Hudpleie', ('Vg2', 'barne- og ungd.arb.'): 'Barne- og ungdomsarbeider',
    ('Vg2', 'reiseliv'): 'Reiseliv', ('Vg2', 'ikt'): 'IKT-servicefag',
    ('Vg2', 'flyfag'): 'Flyfag, Landslinje', ('Vg2', 'akvakultur'): 'Akvakultur',
    ('Vg3', 'automatisering'): 'Automatiseringsfaget',
    ('Vg3', 'påbygg'): 'Påbygg til generell studiekompetanse',
    ('Vg3', 'medier og komm.'): 'Medier og kommunikasjon',
}


def _news_2017(path, warn):
    """The county's own news article of 6 July 2017 (updated 12 July), «Musikk,
    dans og drama krever toppkarakterer», as Common Crawl captured it on
    20.07.2017. It names the round: «Over 18 700 elever har fått tilbud i 1.
    fellesinntak til videregående skole for skoleåret 2017/2018» (over 18,700
    pupils were offered a place in the first joint intake for 2017/2018). Its
    table is «Eksempler på programområder med stort antall søkere og lange
    ventelister» (examples of programme areas with many applicants and long
    waiting lists), columns Tilbud / Skole / «Lavest poengsum for inntak»: a
    selection, not the county's whole table, so the year is partial
    (PARTIAL_YEARS in model.py)."""
    soup = BeautifulSoup(open(path, 'rb').read(), 'lxml')
    text = soup.get_text(' ', strip=True)
    if '1. fellesinntak' not in text or '2017/2018' not in text:
        warn.append(f'{NEWS_2017}: the round or the school year is no longer where it was')
        return []
    rows = []
    for tr in soup.find('table').find_all('tr'):
        cells = [common.squash(td.get_text(' ', strip=True)) for td in tr.find_all(['td', 'th'])]
        m = re.match(r'(Vg[1-3]) (.+)$', cells[0]) if len(cells) == 3 else None
        if not m:
            continue                       # the header, and a trailing empty row
        program = NEWS_2017_NAMES.get((m[1], m[2].lower()))
        school = _school(cells[1])
        value = common.classify_cell(cells[2], min_value=0)
        if not program or not school or not isinstance(value, float):
            warn.append(f'{NEWS_2017}: row not read: {cells}')
            continue
        rows.append({'school': school, 'program': program, 'level': m[1], 'values': {2017: value},
                     'county': META['fylke'], 'round': '1'})
    return rows


def extract():
    warn, out = [], []
    for fname in FILES:                       # newest first
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            warn.append(f'missing source: {fname}')
            continue
        rows = parse_pdf(path, warn)
        for r in rows:
            r['county'] = META['fylke']
            r['round'] = META['round']
            for (school, program, level, year), (printed, fixed) in COUNTY_CORRECTIONS.items():
                if (r['school'], r['program'], r['level']) != (school, program, level) \
                        or year not in r['values']:
                    continue
                if r['values'][year] == printed:
                    r['values'][year] = fixed
                elif r['values'][year] != fixed:
                    warn.append(f'{fname}: correction for {school} {program} {level} {year} '
                                f'expects {printed!r}, the file prints {r["values"][year]!r}')
        out.append((fname, rows))
    # the older years, below every vilbli edition
    if os.path.exists(os.path.join(SRC, NEWS_2017)):
        out.append((NEWS_2017, _news_2017(os.path.join(SRC, NEWS_2017), warn)))
    if os.path.exists(os.path.join(SRC, PORTAL)):
        out.append((PORTAL, _portal(os.path.join(SRC, PORTAL), warn)))
    for fname in sorted((f for f in os.listdir(SRC) if f.endswith('.transcribed.csv')),
                        reverse=True):
        out.append((fname, common.transcription_rows(
            os.path.join(SRC, fname), META['fylke'], warn=warn,
            school=lambda n: _school(n) or warn.append(f'{fname}: unknown school {n!r}'),
            program=lambda p: PORTAL_NAMES.get(common.squash(p).lower(), p))))
    return out, warn

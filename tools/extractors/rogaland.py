#!/usr/bin/env python3
"""Rogaland — rolling multi-year PDF matrices published via vilbli.no (8 files).

Coordinate extraction (pdfplumber); the layout specifics live in
tools/parse_pdfs.py, which this module wraps so the Rogaland logic and its
regression tests stay in one place.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
    return out, warn

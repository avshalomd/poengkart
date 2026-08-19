#!/usr/bin/env python3
"""Rogaland — 5 rolling multi-year PDF matrices published via vilbli.no.

Coordinate extraction (pdfplumber); the layout specifics live in
tools/parse_pdfs.py, which this module wraps so the Rogaland logic and its
regression tests stay in one place.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from parse_pdfs import FILES, SRC, UNCERTAIN, parse_pdf   # noqa: E402

META = {
    'code': '11',
    'fylke': 'Rogaland',
    'round': '2',                     # published after 2. inntak
    'rights': 'ungdomsrett',
    'free_choice': True,              # fritt skolevalg countywide (FOR-2024-12-11-3099 §3)
    'source': 'https://www.vilbli.no/nb/rogaland/a/poengsum-og-karakterer-6',
    'uncertain': UNCERTAIN,
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
        out.append((fname, rows))
    return out, warn

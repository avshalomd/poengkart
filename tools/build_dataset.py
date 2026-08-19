#!/usr/bin/env python3
"""Build web/data/schools.json from every county extractor.

    .venv/bin/python3 tools/build_dataset.py [county ...]

Each extractor in tools/extractors/ exposes META and extract(); this module
merges their rows, carries school-level enrichment (coordinates, photos, links)
across re-runs, validates, and writes the dataset plus data/source-drift.json.
"""

import importlib
import json
import os
import pkgutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common                                    # noqa: E402
import extractors                                # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
DRIFT = os.path.join(HERE, '..', 'data', 'source-drift.json')
KEEP = ('lat', 'lon', 'orgnr', 'url', 'wiki_url', 'wiki_extract', 'address',
        'photo', 'photo_source', 'photo_page', 'photo_credit', 'photo_license',
        'photo_position', 'photo_note', 'nsr_name')


def load_extractors(only=None):
    mods = []
    for m in pkgutil.iter_modules(extractors.__path__):
        if only and m.name not in only:
            continue
        mods.append(importlib.import_module(f'extractors.{m.name}'))
    return sorted(mods, key=lambda m: m.META['fylke'])


def main():
    only = [a.lower() for a in sys.argv[1:]] or None
    mods = load_extractors(only)
    if not mods:
        sys.exit('no extractors found')

    all_rows, warnings, counties = [], [], []
    for mod in mods:
        srcs, warn = mod.extract()
        rows = sum(len(r) for _, r in srcs)
        cells = sum(len(row['values']) for _, r in srcs for row in r)
        print(f'{mod.META["fylke"]:<18} {rows:>5} rows {cells:>6} cells '
              f'{len(warn):>3} warnings  ({len(srcs)} sources)')
        warnings += [f'[{mod.META["fylke"]}] {w}' for w in warn]
        all_rows += srcs
        counties.append({k: v for k, v in mod.META.items() if k != 'uncertain'})

    schools, drift, attrs = common.merge_rows(all_rows)
    problems = common.validate(schools)

    by_meta = {c['fylke']: c for c in counties}
    out = {'counties': counties, 'schools': []}
    all_years = set()
    for (county, name) in sorted(schools):
        progs = []
        for rec in schools[(county, name)].values():
            all_years.update(rec['values'])
            progs.append({'program': rec['program'], 'level': rec['level'],
                          'category': rec['category'],
                          'values': {str(y): v for y, v in sorted(rec['values'].items())}})
        progs.sort(key=lambda p: (p['level'], p['program']))
        meta = by_meta.get(county, {})
        entry = {'name': name, 'fylke': county, 'fylkesnummer': meta.get('code'),
                 'round': meta.get('round'), 'programs': progs}
        entry.update(attrs.get((county, name), {}))
        if meta.get('free_choice') is False:
            entry['catchment'] = True      # threshold applies to residents only
        out['schools'].append(entry)
    out['years'] = sorted(all_years)

    # schools whose year labels the county changed between publications
    for mod in mods:
        for sname, years in (mod.META.get('uncertain') or {}).items():
            for s in out['schools']:
                if s['name'] == sname and s['fylke'] == mod.META['fylke']:
                    s['uncertain_years'] = years

    if os.path.exists(OUT):                      # keep enrichment across re-runs
        old = {(s.get('fylke'), s['name']): s for s in json.load(open(OUT))['schools']}
        for s in out['schools']:
            prev = old.get((s['fylke'], s['name'])) or old.get((None, s['name'])) or {}
            for k in KEEP:
                if k in prev:
                    s[k] = prev[k]

    for c in counties:
        c['schools'] = sum(1 for s in out['schools'] if s['fylke'] == c['fylke'])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    os.makedirs(os.path.dirname(DRIFT), exist_ok=True)
    json.dump(drift, open(DRIFT, 'w'), ensure_ascii=False, indent=1)

    cells = sum(len(p['values']) for s in out['schools'] for p in s['programs'])
    print(f'\n{len(out["schools"])} schools · {cells} cells · {len(counties)} counties '
          f'· years {out["years"][0]}–{out["years"][-1]}')
    if warnings:
        print(f'\n{len(warnings)} parse warnings')
        for w in warnings[:12]:
            print('  ', w)
    print(f'\nvalidation problems: {len(problems)}')
    for p in problems[:12]:
        print('  ', p)
    print(f'source disagreements: {len(drift)} -> {DRIFT}')
    print(f'-> {OUT}')


if __name__ == '__main__':
    main()

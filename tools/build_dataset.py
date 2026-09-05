#!/usr/bin/env python3
"""Build web/data/schools.json from every county extractor.

    .venv/bin/python3 tools/build_dataset.py [county ...]

Each extractor in tools/extractors/ exposes META and extract(); this module
merges their rows, carries school-level enrichment (coordinates, photos, links)
across re-runs, validates, and writes the dataset plus data/source-drift.json.
"""

import hashlib
import importlib
import json
import os
import pkgutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common                                    # noqa: E402
import taxonomy                                  # noqa: E402
import extractors                                # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
DRIFT = os.path.join(HERE, '..', 'data', 'source-drift.json')
# lat/lon are deliberately NOT carried over: a wrong coordinate from an older
# run would survive forever (an early geocode put Askøy in Vesterålen).
# tools/geocode.py re-derives them from its cache on every run.
KEEP = ('orgnr', 'url', 'wiki_url', 'wiki_extract', 'address',
        'photo', 'photo_source', 'photo_page', 'photo_credit', 'photo_license',
        'photo_position', 'photo_note', 'nsr_name')


CACHE_DIR = os.path.join(HERE, '.cache')


def _extract_cached(mod):
    """mod.extract(), memoised on the content of everything it reads.

    Parsing is by far the pipeline's slowest stage — pdfplumber walks some
    forty PDFs — and the sources are immutable once ingested. The key hashes
    the extractor's own source, common.py, the Grep registry, and the name,
    size and mtime of every file in the extractor's data directory, so ANY
    change re-parses that county and an unchanged county is a file read. The
    cache stores exactly what extract() returned; the output cannot differ.
    """
    h = hashlib.sha256()
    # parse_pdfs.py is Rogaland's real parser (extractors/rogaland.py wraps
    # it), so it is part of every extractor's key rather than only that one's
    for f in (mod.__file__, os.path.join(HERE, 'common.py'),
              os.path.join(HERE, 'parse_pdfs.py'),
              os.path.join(HERE, 'grep-programomraader.json')):
        try:
            h.update(open(f, 'rb').read())
        except OSError:
            h.update(b'-')
    src = getattr(mod, 'SRC', None)
    if src and os.path.isdir(src):
        for fn in sorted(os.listdir(src)):
            st = os.stat(os.path.join(src, fn))
            h.update(f'{fn}|{st.st_size}|{st.st_mtime_ns}'.encode())
    key = h.hexdigest()
    cpath = os.path.join(CACHE_DIR, f'extract-{mod.__name__.split(".")[-1]}.json')
    try:
        c = json.load(open(cpath))
        if c['key'] == key:
            def keys_back(row):
                for f in ('values', 'values_r1', 'values_r3', 'means'):
                    if f in row:
                        row[f] = {int(y): v for y, v in row[f].items()}
                return row
            return [(fname, [keys_back(r) for r in rows]) for fname, rows in c['out']], c['warn']
    except (OSError, ValueError, KeyError):
        pass
    out, warn = mod.extract()
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = cpath + '.tmp'
    json.dump({'key': key, 'out': out, 'warn': warn}, open(tmp, 'w'))
    os.replace(tmp, cpath)
    return out, warn


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
        srcs, warn = _extract_cached(mod)
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
            entry_p = {'program': rec['program'],
                       'program_en': common.english_program(rec['program']),
                       'level': rec['level'], 'category': rec['category'],
                       'values': {str(y): v for y, v in sorted(rec['values'].items())}}
            # the register's own identity for the row: the Grep code, and the
            # official title where the county's label spells it differently
            code, official = taxonomy.grep_info(rec['program'], rec['level'])
            if rec.get('grep'):
                # the county's own register column outranks name-derived codes
                code = rec['grep']
                official = (taxonomy.GREP_TITLES.get(code) or {}).get('nob') or official
            if code:
                entry_p['grep'] = code
                if official and not taxonomy.covers(rec['program'], official):
                    entry_p['official'] = official
            # values_r1/values_r3: the same cell from another intake round;
            # means: Gjennomkar, the mean points of those admitted (Møre og
            # Romsdal publishes it; no other county does)
            for alt in ('values_r1', 'values_r3', 'means'):
                if rec.get(alt):
                    entry_p[alt] = {str(y): v for y, v in sorted(rec[alt].items())}
            progs.append(entry_p)
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

    # ...and any year two publications disagree about by close to a whole grade
    # point, whether or not anyone listed it by hand. Åkrehamn's 2022 figure
    # differs by 20.4 points between two Rogaland editions and carried no mark
    # at all, while a hand-written entry flagged gaps a quarter that size.
    DRIFT_LIMIT = 8.0
    for d in drift:
        if d.get('reason') == 'dropped digit':      # 3,9 beside 38,9: a typo, not doubt
            continue
        if not (isinstance(d['kept'], (int, float))
                and isinstance(d['ignored'], (int, float))
                and abs(d['kept'] - d['ignored']) >= DRIFT_LIMIT):
            continue
        for s in out['schools']:
            if s['name'] == d['school'] and s['fylke'] == d['county']:
                years = s.setdefault('uncertain_years', [])
                if int(d['year']) not in years:
                    years.append(int(d['year']))
                    years.sort()

    # A county can publish one year from a different intake round than the rest
    # of its series — Vestland's 2023 figures are from 3. inntak, where far more
    # applicants have been admitted — and a reader comparing 2022 to 2023 to
    # 2024 has no way to know. Record the exceptions against the county.
    per_year = {}
    for _, rows in all_rows:
        for r in rows:
            if not r.get('round'):
                continue
            for y in r['values']:
                (per_year.setdefault(r.get('county', ''), {})
                         .setdefault(str(y), set()).add(r['round']))
    for c in counties:
        odd = {y: sorted(rs)[0] for y, rs in sorted(per_year.get(c['fylke'], {}).items())
               if len(rs) == 1 and sorted(rs)[0] != c.get('round')}
        if odd:
            c['round_years'] = odd

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

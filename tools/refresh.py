#!/usr/bin/env python3
"""Run the whole pipeline in the only order that is correct.

    .venv/bin/python3 tools/refresh.py

Order matters: build_dataset rebuilds schools.json from the extractors and
deliberately does NOT carry coordinates over (a wrong one would survive
forever), so geocode must follow it; model.py reads the finished dataset, and
build_db folds its forecasts into the SQLite export, so it comes after both.
Running build_dataset on its own leaves every school without a position.
"""
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(HERE, '..', '.venv', 'bin', 'python3')
PY = VENV if os.path.exists(VENV) else sys.executable

STEPS = [
    ('sources_manifest.py', 'sources/manifest.json: hash every source document (provenance kept)'),
    ('build_dataset.py', 'parse every county into web/data/schools.json'),
    ('geocode.py', 'NSR → Kartverket address → Kartverket place names'),
    ('photos.py', 'curated photo and identity overrides'),
    ('model.py', 'the forecast: fit, walk-forward backtest, web/data/model.json'),
    ('build_db.py', 'SQLite + CSV, including the forecasts'),
    ('make_og.py', 'the social share card, which is drawn from the data'),
    ('report_figures.py', 'the technical report’s figures, from model.json'),
    ('build_report_page.py', 'docs/technical-report.md → web/report.html'),
    ('test_parse.py', 'regression checks on the dataset'),
    ('test_model.py', 'invariants on the forecast'),
    ('test_docs.py', 'the documentation quotes the shipped model'),
    ('sources_r2.py push', 'mirror new source documents to the R2 bucket (skipped without keys)'),
]


def main():
    took = []
    for script, what in STEPS:
        print(f'\n=== {script} — {what}')
        t0 = time.time()
        name, *args = script.split()
        r = subprocess.run([PY, os.path.join(HERE, name), *args])
        took.append((script, time.time() - t0))
        if r.returncode != 0:
            sys.exit(f'\n{script} failed — stopping so a half-built dataset is '
                     f'never published')
    total = sum(t for _, t in took)
    print('\nPipeline complete.  ' + '  '.join(f'{s.replace(".py", "")} {t:.0f}s'
          for s, t in took) + f'  — total {total / 60:.1f} min')


if __name__ == '__main__':
    main()

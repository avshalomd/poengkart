#!/usr/bin/env python3
"""Run the whole pipeline in the only order that is correct.

    .venv/bin/python3 tools/refresh.py

Order matters: build_dataset rebuilds schools.json from the extractors and
deliberately does NOT carry coordinates over (a wrong one would survive
forever), so geocode must follow it, and build_db must come last. Running
build_dataset on its own leaves every school without a position.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(HERE, '..', '.venv', 'bin', 'python3')
PY = VENV if os.path.exists(VENV) else sys.executable

STEPS = [
    ('build_dataset.py', 'parse every county into web/data/schools.json'),
    ('geocode.py', 'NSR → Kartverket address → Kartverket place names'),
    ('photos.py', 'curated photo and identity overrides'),
    ('build_db.py', 'SQLite + CSV'),
    ('make_og.py', 'the social share card, which is drawn from the data'),
    ('test_parse.py', 'regression checks'),
]


def main():
    for script, what in STEPS:
        print(f'\n=== {script} — {what}')
        r = subprocess.run([PY, os.path.join(HERE, script)])
        if r.returncode != 0:
            sys.exit(f'\n{script} failed — stopping so a half-built dataset is '
                     f'never published')
    print('\nPipeline complete.')


if __name__ == '__main__':
    main()

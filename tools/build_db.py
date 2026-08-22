#!/usr/bin/env python3
"""Build an indexed SQLite database (and tidy CSV) from web/data/schools.json.

Schema:
  schools(name PK, fylke, fylkesnummer, round, catchment, lat, lon, orgnr, url,
          wiki_url, address, photo, photo_source)
  samples(school, fylke, program, occurrence, category, level, year, round,
          points REAL NULL, status TEXT)   -- one row per (program, school, year)
    status: 'points' (points set), 'open' (no waitlist, everyone admitted),
            'priority' (fortrinnsrett quota), 'documentation' (admission by
            documentation, e.g. IB/toppidrett), 'discontinued' (utgått)
    round:  the intake round the figure is from ('1', '2', '3'), NULL where the
            county does not say — a figure is only comparable within its round
  forecasts(school, fylke, program, occurrence, level, category, year, round,
            expected REAL, spread REAL, p_fill REAL, history_years)
            -- tools/model.py's forecast for the county's next publication year,
               from web/data/model.json when it exists

Outputs: data/poengkart.db, data/samples.csv, data/forecasts.csv
"""

import csv
import json
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
MODEL = os.path.join(HERE, '..', 'web', 'data', 'model.json')
OUT_DIR = os.path.join(HERE, '..', 'data')
DB = os.path.join(OUT_DIR, 'poengkart.db')
CSV = os.path.join(OUT_DIR, 'samples.csv')
FCSV = os.path.join(OUT_DIR, 'forecasts.csv')

STATUS = {'open': 'open', 'F': 'priority', 'U': 'discontinued', 'D': 'documentation'}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    data = json.load(open(SRC))
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript("""
      CREATE TABLE schools (
        name TEXT PRIMARY KEY, fylke TEXT, fylkesnummer TEXT, round TEXT,
        catchment INTEGER NOT NULL DEFAULT 0,
        lat REAL, lon REAL, orgnr TEXT, url TEXT,
        wiki_url TEXT, address TEXT, photo TEXT, photo_source TEXT
      );
      CREATE TABLE samples (
        school TEXT NOT NULL REFERENCES schools(name),
        fylke TEXT,
        program TEXT NOT NULL,
        occurrence INTEGER NOT NULL DEFAULT 0,
        category TEXT NOT NULL,
        level TEXT,
        year INTEGER NOT NULL,
        round TEXT,
        points REAL,
        status TEXT NOT NULL CHECK (status IN ('points','open','priority','discontinued','documentation')),
        PRIMARY KEY (school, program, occurrence, year)
      );
      CREATE INDEX idx_samples_year ON samples(year);
      CREATE INDEX idx_samples_category ON samples(category, year);
      CREATE INDEX idx_samples_program ON samples(program);
      CREATE INDEX idx_samples_fylke ON samples(fylke, year);
      CREATE TABLE forecasts (
        school TEXT NOT NULL REFERENCES schools(name),
        fylke TEXT,
        program TEXT NOT NULL,
        occurrence INTEGER NOT NULL DEFAULT 0,
        level TEXT,
        category TEXT NOT NULL,
        year INTEGER NOT NULL,
        round TEXT,
        expected REAL NOT NULL,
        spread REAL NOT NULL,
        p_fill REAL NOT NULL,
        history_years INTEGER NOT NULL,
        PRIMARY KEY (school, program, occurrence, year)
      );
    """)
    # the round a cell was published in: the county's, except the years the
    # county itself marks as another round (Vestland 2023 is 3. inntak)
    cy = {c['fylke']: c for c in data.get('counties', [])}
    model = json.load(open(MODEL)) if os.path.exists(MODEL) else {'schools': {}}
    rows, fc = [], []
    for s in data['schools']:
        c = cy.get(s.get('fylke'), {})
        con.execute('INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (
            s['name'], s.get('fylke'), s.get('fylkesnummer'), s.get('round'),
            1 if s.get('catchment') else 0,
            s.get('lat'), s.get('lon'), s.get('orgnr'), s.get('url'),
            s.get('wiki_url'), s.get('address'), s.get('photo'), s.get('photo_source')))
        ment = model['schools'].get(f"{s.get('fylke')}|{s['name']}", {})
        occ_seen = {}
        for p in s['programs']:
            k = p['program'].lower()
            occ = occ_seen.get(k, 0)
            occ_seen[k] = occ + 1
            for year, v in p['values'].items():
                points = v if isinstance(v, (int, float)) else None
                status = 'points' if points is not None else STATUS.get(v)
                if status is None:
                    continue
                rnd = (c.get('round_years') or {}).get(str(year)) or s.get('round')
                rows.append((s['name'], s.get('fylke'), p['program'], occ, p['category'],
                             p.get('level'), int(year), rnd, points, status))
            pr = (ment.get('programs') or {}).get(f"{k}|{p['level']}|{occ}")
            if pr:
                fc.append((s['name'], s.get('fylke'), p['program'], occ, p.get('level'),
                           p['category'], ment['year'], ment.get('round'),
                           pr['m'], pr['s'], pr['pi'], pr['h']))
    con.executemany('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?,?,?)', rows)
    con.executemany('INSERT INTO forecasts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', fc)
    con.commit()

    with open(CSV, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['school', 'fylke', 'program', 'occurrence', 'category', 'level', 'year',
                    'round', 'points', 'status'])
        w.writerows(rows)
    with open(FCSV, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['school', 'fylke', 'program', 'occurrence', 'level', 'category', 'year',
                    'round', 'expected', 'spread', 'p_fill', 'history_years'])
        w.writerows(fc)

    n_schools = con.execute('SELECT COUNT(*) FROM schools').fetchone()[0]
    n = con.execute('SELECT COUNT(*) FROM samples').fetchone()[0]
    by_status = dict(con.execute('SELECT status, COUNT(*) FROM samples GROUP BY status'))
    yr = con.execute('SELECT MIN(year), MAX(year) FROM samples').fetchone()
    nf = con.execute('SELECT COUNT(*) FROM forecasts').fetchone()[0]
    print(f'schools: {n_schools}, samples: {n}, years {yr[0]}-{yr[1]}, by status: {by_status}, forecasts: {nf}')
    print(f'-> {DB}\n-> {CSV}\n-> {FCSV}')
    # taste test: Bryne ST trend straight from SQL
    q = """SELECT year, points FROM samples
           WHERE school LIKE 'Bryne%' AND program='Studiespesialisering' AND status='points'
           ORDER BY year"""
    print('Bryne ST from SQL:', con.execute(q).fetchall())
    con.close()


if __name__ == '__main__':
    main()

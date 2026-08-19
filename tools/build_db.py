#!/usr/bin/env python3
"""Build an indexed SQLite database (and tidy CSV) from web/data/schools.json.

Schema:
  schools(name PK, lat, lon, orgnr, url, wiki_url, address, photo, photo_source)
  samples(school, program, occurrence, category, level, year,
          points REAL NULL, status TEXT)   -- one row per (program, school, year)
    status: 'points' (points set), 'open' (no waitlist, everyone admitted),
            'priority' (fortrinnsrett quota), 'documentation' (admission by
            documentation, e.g. IB/toppidrett), 'discontinued' (utgått)

Outputs: data/poengkart.db, data/samples.csv
"""

import csv
import json
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
OUT_DIR = os.path.join(HERE, '..', 'data')
DB = os.path.join(OUT_DIR, 'poengkart.db')
CSV = os.path.join(OUT_DIR, 'samples.csv')

STATUS = {'open': 'open', 'F': 'priority', 'U': 'discontinued', 'D': 'documentation'}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    data = json.load(open(SRC))
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.executescript("""
      CREATE TABLE schools (
        name TEXT PRIMARY KEY, lat REAL, lon REAL, orgnr TEXT, url TEXT,
        wiki_url TEXT, address TEXT, photo TEXT, photo_source TEXT
      );
      CREATE TABLE samples (
        school TEXT NOT NULL REFERENCES schools(name),
        program TEXT NOT NULL,
        occurrence INTEGER NOT NULL DEFAULT 0,
        category TEXT NOT NULL,
        level TEXT,
        year INTEGER NOT NULL,
        points REAL,
        status TEXT NOT NULL CHECK (status IN ('points','open','priority','discontinued','documentation')),
        PRIMARY KEY (school, program, occurrence, year)
      );
      CREATE INDEX idx_samples_year ON samples(year);
      CREATE INDEX idx_samples_category ON samples(category, year);
      CREATE INDEX idx_samples_program ON samples(program);
    """)
    rows = []
    for s in data['schools']:
        con.execute('INSERT INTO schools VALUES (?,?,?,?,?,?,?,?,?)', (
            s['name'], s.get('lat'), s.get('lon'), s.get('orgnr'), s.get('url'),
            s.get('wiki_url'), s.get('address'), s.get('photo'), s.get('photo_source')))
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
                rows.append((s['name'], p['program'], occ, p['category'],
                             p.get('level'), int(year), points, status))
    con.executemany('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?)', rows)
    con.commit()

    with open(CSV, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['school', 'program', 'occurrence', 'category', 'level', 'year', 'points', 'status'])
        w.writerows(rows)

    n_schools = con.execute('SELECT COUNT(*) FROM schools').fetchone()[0]
    n = con.execute('SELECT COUNT(*) FROM samples').fetchone()[0]
    by_status = dict(con.execute('SELECT status, COUNT(*) FROM samples GROUP BY status'))
    yr = con.execute('SELECT MIN(year), MAX(year) FROM samples').fetchone()
    print(f'schools: {n_schools}, samples: {n}, years {yr[0]}-{yr[1]}, by status: {by_status}')
    print(f'-> {DB}\n-> {CSV}')
    # taste test: Bryne ST trend straight from SQL
    q = """SELECT year, points FROM samples
           WHERE school LIKE 'Bryne%' AND program='Studiespesialisering' AND status='points'
           ORDER BY year"""
    print('Bryne ST from SQL:', con.execute(q).fetchall())
    con.close()


if __name__ == '__main__':
    main()

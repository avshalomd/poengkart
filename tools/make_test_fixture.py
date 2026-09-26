"""Freeze the web unit tests' dataset: a small, fixed slice of the shipped
schools.json and model.json, written to web/test/data/.

The unit tests used to read web/public/data/ directly, so every refresh of the
live data could turn CI red without a line of the app changing. They now read
this fixture instead, and it moves only when someone reruns this script and
commits the result (a deliberate act, reviewed like any other diff).

The slice: every school a test names, plus the first few schools of each
county in dataset order, so all nine counties, clustering and the per-county
views still have something to show. model.json keeps its whole meta block and
the forecasts of the schools kept.

Run: python3 tools/make_test_fixture.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'web', 'public', 'data')
DEST = os.path.join(ROOT, 'web', 'test', 'data')

# (fylke, name) of every school a unit test looks up by name
NAMED = {
    ('Akershus', 'Asker'),
    ('Akershus', 'Sandvika'),
    ('Akershus', 'Ski'),
    ('Akershus', 'Sørumsand'),
    ('Akershus', 'Ås'),
    ('Akershus', 'Roald Amundsen'),
    ('Oslo', 'Elvebakken videregående skole'),
    ('Rogaland', 'Randaberg videregående skole'),   # a jump: TIF 30,0 → 11,3 (the forecast's j)
    ('Oslo', 'Bjørnholt videregående skole'),
    ('Oslo', 'Blindern videregående skole'),
    ('Buskerud', 'St. Hallvard'),
    ('Vestland', 'Førde vidaregåande skule'),
    ('Trøndelag', 'Byåsen videregående skole'),
    ('Møre og Romsdal', 'Romsdal videregående skole'),
    ('Telemark', 'Skien videregående skole'),
    ('Innlandet', 'Storsteigen videregående skole'),
    ('Buskerud', 'Kongsberg'),
    ('Rogaland', 'St. Olav videregående skole'),           # the respelled school (wishes)
    ('Innlandet', 'Nord-Gudbrandsdal vgs, avd. Dombås'),   # the one with no poenggrense to plot (chart)
}
PER_COUNTY = 5


def main():
    data = json.load(open(os.path.join(SRC, 'schools.json'), encoding='utf-8'))
    model = json.load(open(os.path.join(SRC, 'model.json'), encoding='utf-8'))

    have = {(s['fylke'], s['name']) for s in data['schools']}
    missing = sorted(NAMED - have)
    if missing:
        raise SystemExit(f'named schools missing from schools.json: {missing}')

    taken = {}
    keep = []
    for s in data['schools']:
        key = (s['fylke'], s['name'])
        if key in NAMED or taken.get(s['fylke'], 0) < PER_COUNTY:
            keep.append(s)
            taken[s['fylke']] = taken.get(s['fylke'], 0) + 1

    counts = {}
    for s in keep:
        counts[s['fylke']] = counts.get(s['fylke'], 0) + 1
    counties = [dict(c, schools=counts.get(c['fylke'], 0)) for c in data['counties']]

    kept = {f"{s['fylke']}|{s['name']}" for s in keep}
    fixture_model = dict(model, schools={k: v for k, v in model['schools'].items() if k in kept})

    os.makedirs(DEST, exist_ok=True)
    for name, obj in (('schools.json', dict(data, counties=counties, schools=keep)),
                      ('model.json', fixture_model)):
        with open(os.path.join(DEST, name), 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
            f.write('\n')
    print(f'{len(keep)} schools, {len(fixture_model["schools"])} forecasts -> {os.path.relpath(DEST, ROOT)}')


if __name__ == '__main__':
    main()

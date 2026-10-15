"""schools.json's updated stamp moves only when a published figure does
(tools/build_dataset.py stamp())."""
import copy
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from build_dataset import figures_hash, stamp   # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'public', 'data', 'schools.json')


def _data():
    return {'counties': [], 'years': [2025, 2026], 'schools': [
        {'fylke': 'Oslo', 'name': 'Ullern', 'photo': 'a.jpg', 'lat': 59.9,
         'programs': [{'program': 'Studiespesialisering', 'level': 'Vg1',
                       'values': {'2025': 48.1, '2026': 49.0}}]},
    ]}


def test_a_rerun_with_the_same_figures_keeps_the_date():
    old = _data()
    old['updated'] = {'date': '2026-10-11', 'figures': figures_hash(old)}
    new = _data()
    new['schools'][0]['photo'] = 'b.jpg'          # enrichment is not a figure
    del new['schools'][0]['lat']
    assert stamp(new, old) == old['updated']


def test_a_changed_figure_dates_it_today():
    old = _data()
    old['updated'] = {'date': '2000-01-01', 'figures': figures_hash(old)}
    new = copy.deepcopy(old)
    new['schools'][0]['programs'][0]['values']['2026'] = 'Alle'
    got = stamp(new, old)
    assert got['figures'] != old['updated']['figures']
    assert got['figures'] == figures_hash(new)
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', got['date']) and got['date'] > '2026'


def test_a_first_build_is_stamped():
    for old in (None, {}, {'updated': {}}):
        got = stamp(_data(), old)
        assert set(got) == {'date', 'figures'}


def test_the_published_dataset_carries_a_stamp_that_matches_its_figures():
    data = json.load(open(DATA, encoding='utf-8'))
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', data['updated']['date'])
    assert data['updated']['figures'] == figures_hash(data)

"""How a threshold cell enters the model (tools/model.py, load_obs)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from model import load_obs   # noqa: E402


def _states(values):
    data = {'counties': [{'fylke': 'Oslo', 'round': '1'}],
            'schools': [{'fylke': 'Oslo', 'name': 'Etterstad videregående skole',
                         'programs': [{'program': 'Restaurant- og matfag', 'level': 'Vg1',
                                       'category': 'RM', 'values': values}]}]}
    rows, _, _, _ = load_obs(data)
    return {r['year']: (r['state'], r['v']) for r in rows}


def test_below_ten_is_everyone_with_a_full_record_admitted():
    # Oslo scores an applicant with fewer than seven grades as sum / 16 x 10
    # (Inntakskontoret, 5 Oct 2026): a printed 6,0 means the last one admitted
    # had grades missing, so it fills like «ingen venteliste», not as a level
    st = _states({'2024': 38.2, '2025': 'open', '2026': 6.0, '2023': 9.9, '2022': 10.0, '2021': 0.0})
    assert st[2026] == ('open', None)
    assert st[2023] == ('open', None)
    assert st[2025] == ('open', None)
    assert st[2024] == ('num', 38.2)
    assert st[2022] == ('num', 10.0)
    assert st[2021] == ('zero', None)

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

SCHOOLS = {
    'Bamble videregående skole', 'Bø vidaregåande skule', 'Hjalmar Johansen videregående skole',
    'Kragerø videregående skole', 'Nome videregående skole', 'Notodden videregående skole',
    'Porsgrunn videregående skole', 'Rjukan videregående skole', 'Skien videregående skole',
    'Skogmo videregående skole', 'Vest-Telemark vidaregåande skule',
}
REGIONS = {'Grenland', 'Midt-Øst Telemark', 'Øst-Telemark/Tinn', 'Vestmar', 'Vest-Telemark'}


def test_meta_says_what_the_county_did_not():
    from extractors import telemark
    assert telemark.META['code'] == '40' and telemark.META['fylke'] == 'Telemark'
    assert telemark.META['round'] is None and telemark.META['round_note']
    assert telemark.META['free_choice'] is False and telemark.META['levels'] == 'Vg1'


def test_extract_reads_every_cell_as_a_number():
    from extractors import telemark
    out, warn = telemark.extract()
    assert warn == []
    assert [name for name, _ in out] == ['laveste-inntakspoeng-vg1-2024-2026.xlsx']
    rows = out[0][1]
    assert len(rows) == 56
    cells = [(r['school'], y, v) for r in rows for y, v in r['values'].items()]
    assert len(cells) == 166
    assert {r['school'] for r in rows} == SCHOOLS
    assert {r['region'] for r in rows} == REGIONS
    assert all(isinstance(v, float) and 10.0 <= v <= 52.5 for _, _, v in cells)
    assert all(r['level'] == 'Vg1' and r['round'] is None and r['grep'] and r['county'] == 'Telemark'
               for r in rows)


def test_variant_codes_keep_their_own_name_and_values():
    from extractors import telemark
    rows = telemark.extract()[0][0][1]
    musikk = next(r for r in rows if r['school'] == 'Skien videregående skole' and r['grep'] == 'MDMDD1--1-')
    assert musikk['program'] == 'Musikk, dans og drama, musikk'
    assert musikk['values'] == {2024: 24.7, 2025: 44.4, 2026: 35.6}
    it = next(r for r in rows if r['grep'] == 'STUSP1--IT')
    assert it['values'] == {2024: 34.7}           # offered one year only
    hs = next(r for r in rows if r['school'] == 'Skogmo videregående skole' and r['grep'] == 'HSHSF1----')
    assert hs['values'][2024] == 10.0             # the lowest figure in the file is a figure, not noise

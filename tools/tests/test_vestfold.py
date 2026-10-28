import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

SCHOOLS = {
    'Færder videregående skole', 'Greveskogen videregående skole', 'Holmestrand videregående skole',
    'Horten videregående skole', 'Melsom videregående skole', 'Nøtterøy videregående skole',
    'Re videregående skole', 'Sande videregående skole', 'Sandefjord videregående skole',
    'Thor Heyerdahl videregående skole',
}


def test_meta_says_what_the_county_did_not():
    from extractors import vestfold
    assert vestfold.META['code'] == '39' and vestfold.META['fylke'] == 'Vestfold'
    assert vestfold.META['round'] is None and vestfold.META['round_note']
    assert vestfold.META['free_choice'] is True and vestfold.META['levels'] == 'Vg1–Vg3'


def test_extract_reads_every_cell_as_a_number():
    from extractors import vestfold
    out, warn = vestfold.extract()
    assert warn == []
    assert [name for name, _ in out] == ['laveste-inntatte-karakterpoeng-2024-2026.xlsx']
    rows = out[0][1]
    assert len(rows) == 255
    cells = [(r['school'], y, v) for r in rows for y, v in r['values'].items()]
    assert len(cells) == 731                      # 765 minus 34 blanks (not offered)
    assert {r['school'] for r in rows} == SCHOOLS
    assert {y for _, y, _ in cells} == {2024, 2025, 2026}
    assert all(isinstance(v, float) and 10.0 <= v <= 48.6 for _, _, v in cells)
    assert {r['level'] for r in rows} == {'Vg1', 'Vg2', 'Vg3'}
    assert all(r['round'] is None and r['grep'] and r['county'] == 'Vestfold' and 'region' not in r
               for r in rows)


def test_level_and_code_keep_series_apart():
    from extractors import vestfold
    rows = vestfold.extract()[0][0][1]
    sande = {(r['grep'], r['level']): r for r in rows if r['school'] == 'Sande videregående skole'}
    # one name, three levels, three series
    assert sande[('IDRET1----', 'Vg1')]['values'] == {2026: 36.3, 2025: 33.8, 2024: 33.4}
    assert sande[('IDIDR2----', 'Vg2')]['values'] == {2026: 30.0, 2025: 27.0, 2024: 24.4}
    assert sande[('IDIDR3----', 'Vg3')]['values'] == {2026: 29.2, 2025: 24.2, 2024: 31.5}
    # the county's SK 3 år variant is its own series, not the base programme
    assert sande[('HSHSF1N---', 'Vg1')]['program'] == 'Helse- og oppvekstfag, SK 3 år'
    assert sande[('HSHSF1----', 'Vg1')]['values'][2026] == 29.3
    # a blank cell is a year the programme was not offered, never a zero
    holm = next(r for r in rows if r['school'] == 'Holmestrand videregående skole' and r['grep'] == 'HSHEA2----')
    assert holm['values'] == {2026: 18.8, 2025: 24.4}

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from slug import slug, school_path  # noqa: E402

TABLE = [
    ('Asker', 'asker'),
    ('Førde vidaregåande skule', 'forde-vidaregaande-skule'),
    ('Møre og Romsdal', 'more-og-romsdal'),
    ('St. Hallvard videregående skole', 'st-hallvard-videregaende-skole'),
    ('Bjørnholt  vgs', 'bjornholt-vgs'),
    ('Ås', 'as'),
    ('Sandvika videregående skole (Bærum)', 'sandvika-videregaende-skole-baerum'),
    ('Élan', 'elan'),
    ('Vg2/Vg3', 'vg2-vg3'),
    ('  Kongsberg  ', 'kongsberg'),
    ('Trøndelag', 'trondelag'),
]


def test_table():
    for text, expected in TABLE:
        assert slug(text) == expected, text


def test_decomposed():
    import unicodedata
    assert slug(unicodedata.normalize('NFD', 'Ås')) == 'as'


def test_school_path():
    assert school_path('Akershus', 'Asker') == '/akershus/asker'

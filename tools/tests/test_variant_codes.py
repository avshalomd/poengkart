import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import common  # noqa: E402


def test_shared_table_has_every_code_the_two_counties_print():
    for code in ['MDMDD1--1-', 'MDMDD1--4-', 'MDMDD1--6-', 'HSHSF1N---', 'STUSP1--EP',
                 'STUSP1--IT', 'STUSP1--Q-', 'STUSP1--T-', 'STUSP1L-X-', 'STUSP1Z---']:
        assert code in common.VIGO_VARIANT_CODES, code


def test_trondelag_reads_the_shared_table():
    from extractors import trondelag
    assert trondelag.EXTRA_CODES is common.VIGO_VARIANT_CODES

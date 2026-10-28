"""Trøndelag from 2026/27: the scraper's new file names and the table the
extractor now reads (fixtures: two of the region tables served on vilbli on
28 Oct 2026, checked cell by cell against the county's list version)."""
import os
import shutil
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'extractors'))
DATA = os.path.join(HERE, 'data', 'trondelag')


# ---- the scraper ----

def _ctx(served):
    """A Ctx whose vilbli page cannot be read and whose attachments host serves
    `served` (file name -> body)."""
    from live import net
    from live.core import Ctx
    ctx = Ctx('trondelag', {})

    def get(url, **kw):
        if 'www.vilbli.no' in url:
            return net.Response(url=url, status=405, body=b'')
        name = url.rsplit('/', 1)[1].replace('+', ' ')
        body = served.get(name)
        return net.Response(url=url, status=200 if body else 404, body=body or b'')
    ctx.get = get
    return ctx


def _pdf(name):
    return open(os.path.join(DATA, name), 'rb').read()


def test_the_scraper_finds_the_2026_27_tables_by_name(monkeypatch):
    import datetime
    from live.sources import trondelag

    class Day(datetime.date):
        @classmethod
        def today(cls):
            return cls(2026, 10, 28)
    monkeypatch.setattr(trondelag.datetime, 'date', Day)
    served = {'Laveste inntatt 2026-2027 Trondheim tabell.pdf': _pdf('trondelag_2026-27_trondheim.pdf'),
              'Laveste inntatt 2026-2027 Namdal tabell.pdf': _pdf('trondelag_2026-27_namdal.pdf')}
    docs = trondelag.discover(_ctx(served))
    assert sorted((d.name, d.meta['region'], d.meta['school_year']) for d in docs) == [
        ('trondelag_2026-27_namdal.pdf', 'Namdal', '2026/2027'),
        ('trondelag_2026-27_trondheim.pdf', 'Trondheim', '2026/2027')]


def test_the_scraper_takes_the_table_and_leaves_its_list_twin():
    from live.sources import trondelag
    files = [('Laveste inntatt 2026-2027 Trøndelag Sør.pdf', 'a'),
             ('Laveste inntatt 2026-2027 Trøndelag Sør tabell.pdf', 'b'),
             ('Laveste inntatt 2026-2027 Fosen.pdf', 'c'),      # no table: kept, so it is seen
             ('Laveste inntatt 2526 Namdal.pdf', 'd')]
    assert trondelag._tables(files) == files[1:]


@pytest.mark.parametrize('name, region', [
    ('Laveste inntatt 2526 Trøndelag sør.pdf', 'Trøndelag Sør'),
    ('Laveste inntatt 2026-2027 Trøndelag Sør tabell.pdf', 'Trøndelag Sør'),
    ('Laveste inntatt 2026-2027 Innherred-Værnes tabell.pdf', 'Innherred-Værnes')])
def test_old_and_new_names_read_the_same_region_and_slug(name, region):
    from live.sources import trondelag
    m = trondelag.NAME.search(name)
    assert m and next(r for r in trondelag.REGIONS if r.lower() == m.group(3).lower()) == region
    assert trondelag.slug(region) in ('trondelag-sor', 'innherred-vaernes')


def test_a_table_whose_page_names_another_year_is_refused():
    from live.core import Unhealthy
    from live.sources import trondelag
    served = {'Laveste inntatt 2025-2026 Namdal tabell.pdf': _pdf('trondelag_2026-27_namdal.pdf')}
    with pytest.raises(Unhealthy):
        trondelag._doc(_ctx(served), 'Laveste inntatt 2025-2026 Namdal tabell.pdf',
                       'https://webservice.vilbli.no/Data/Artikkelvedlegg/041562/x', '')


# ---- the extractor ----

def _extract(tmp_path, monkeypatch, *names):
    import trondelag
    for n in names:
        shutil.copy(os.path.join(DATA, n), tmp_path / n)
    monkeypatch.setattr(trondelag, 'SRC', str(tmp_path))
    out, warn = trondelag.extract()
    assert warn == []
    return {(r['school'], r['program']): r['values'][2026] for _, rows in out for r in rows}


def test_trondheim_2026_reads_every_column_under_its_own_code(tmp_path, monkeypatch):
    got = _extract(tmp_path, monkeypatch, 'trondelag_2026-27_trondheim.pdf')
    assert len(got) == 49
    # KDKDA1---- and STUSP1---- were lost from the header, and these figures
    # landed one programme to the left
    assert got[('Charlottenlund videregående skole', 'Informasjonsteknologi og medieproduksjon')] == 32.7
    assert got[('Charlottenlund videregående skole', 'Kunst, design og arkitektur')] == 35.2
    assert got[('Charlottenlund videregående skole', 'Studiespesialisering')] == 26.9
    assert got[('Thora Storm videregående skole', 'Studiespesialisering')] == 49.8
    assert got[('Thora Storm videregående skole', 'Studiespesialisering, entreprenørskap')] == 53.1
    assert got[('Charlottenlund videregående skole', 'Studiespesialisering, business')] == 44.0
    # the first row, overlapped by the header, read whole
    assert got[('Skjetlein videregående skole', 'Bygg- og anleggsteknikk')] == 23.6
    assert got[('Skjetlein videregående skole', 'Teknologi- og industrifag')] == 34.6


def test_a_star_set_against_the_school_name_is_a_figure(tmp_path, monkeypatch):
    got = _extract(tmp_path, monkeypatch, 'trondelag_2026-27_namdal.pdf')
    assert len(got) == 20
    ytre = {p: v for (s, p), v in got.items() if s == 'Ytre Namdal videregående skole'}
    assert len(ytre) == 6 and list(ytre.values()).count('open') == 4
    assert all(not s.endswith('*') for s, _ in got)

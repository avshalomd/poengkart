"""The live source watch (tools/live), offline: no test here touches the network."""
import datetime
import io
import json
import os
import re
import sys
import types
from zoneinfo import ZoneInfo

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'extractors'))

import common                                     # noqa: E402
from live import fingerprint as fp, policy, powerbi, run, schedule   # noqa: E402
from live.core import Doc, Unhealthy, _clean      # noqa: E402

OSLO = ZoneInfo('Europe/Oslo')


# ---- fingerprints: same figures, different bytes, is not news ----

def test_html_fingerprint_ignores_table_order_and_page_chrome():
    a = b'<html><h1>Poenggrenser</h1><p>Sist endret 1.9</p><table><tr><td>A</td><td>40,1</td></tr></table>' \
        b'<table><tr><td>B</td><td>Alle</td></tr></table></html>'
    b = b'<html><script>nonce=42</script><h1>Poenggrenser</h1><p>Sist endret 28.9</p>' \
        b'<table><tr><td>B</td><td>Alle</td></tr></table><table><tr><td>A</td><td>40,1</td></tr></table></html>'
    c = a.replace(b'40,1', b'40,2')
    assert fp.fingerprint(a, 'html') == fp.fingerprint(b, 'html')
    assert fp.fingerprint(a, 'html') != fp.fingerprint(c, 'html')


def test_pdf_fingerprint_ignores_metadata():
    from pypdf import PdfReader, PdfWriter
    src = os.path.join(ROOT, 'sources', 'trondelag', 'trondelag_2025-26_fosen.pdf')
    body = open(src, 'rb').read()
    w = PdfWriter(clone_from=PdfReader(io.BytesIO(body)))
    w.add_metadata({'/Author': 'someone', '/Producer': 'another tool'})
    out = io.BytesIO()
    w.write(out)
    assert out.getvalue() != body
    assert fp.fingerprint(out.getvalue(), 'pdf') == fp.fingerprint(body, 'pdf')


# ---- revisions: a reprint gets a new name and is read first ----

def test_newest_first_puts_revisions_ahead_of_their_print():
    names = ['akershus-2024-2025.html', 'akershus-2025-2026.html', 'akershus-2025-2026-rev2.html',
             'akershus-2025-2026-rev10.html', 'x.transcribed.csv']
    assert common.newest_first(names) == ['x.transcribed.csv', 'akershus-2025-2026-rev10.html',
                                          'akershus-2025-2026-rev2.html', 'akershus-2025-2026.html',
                                          'akershus-2024-2025.html']
    assert common.current_files(names) == ['x.transcribed.csv', 'akershus-2025-2026-rev10.html',
                                           'akershus-2024-2025.html']
    plain = ['oslo-2017.pdf', 'oslo-2026.html', 'oslo-2025.pdf']
    assert common.newest_first(plain) == sorted(plain, reverse=True)


def test_free_name(tmp_path, monkeypatch):
    monkeypatch.setattr(run, 'SOURCES', str(tmp_path))
    (tmp_path / 'vestland').mkdir()
    assert run.free_name('vestland', 'v_2026-27_1inntak.pdf') == 'v_2026-27_1inntak.pdf'
    (tmp_path / 'vestland' / 'v_2026-27_1inntak.pdf').write_bytes(b'1')
    assert run.free_name('vestland', 'v_2026-27_1inntak.pdf') == 'v_2026-27_1inntak-rev2.pdf'
    (tmp_path / 'vestland' / 'v_2026-27_1inntak-rev2.pdf').write_bytes(b'2')
    assert run.free_name('vestland', 'v_2026-27_1inntak.pdf') == 'v_2026-27_1inntak-rev3.pdf'


def test_clean_drops_default_port_and_fragment():
    assert _clean('https://mrfylke.no:443/tenester/#x') == 'https://mrfylke.no/tenester/'
    assert _clean('https://a.no:8443/p') == 'https://a.no:8443/p'


# ---- the capture flow, with a scraper that serves what the test says ----

def _fake_source(monkeypatch, pages):
    mod = types.ModuleType('live.sources.fake')
    mod.SOURCE = {'id': 'fake', 'county': 'fake', 'publisher': 'Fake fylkeskommune',
                  'landing': 'https://fake.no/', 'season': []}

    def discover(ctx):
        if pages['page'] is None:
            raise Unhealthy('the page has no tables')
        return [Doc(url='https://fake.no/p', name='fake-2026-2027.html', county='fake',
                    label='Poenggrenser 2026–27', kind='html', landing='https://fake.no/',
                    body=pages['page'])]
    mod.discover = discover
    monkeypatch.setitem(sys.modules, 'live.sources.fake', mod)


def test_capture_then_unchanged_then_reprint(tmp_path, monkeypatch):
    monkeypatch.setattr(run, 'SOURCES', str(tmp_path))
    added = {}
    monkeypatch.setattr(run, 'add_to_manifest', lambda rel, prov: added.__setitem__(rel, prov))
    pages = {'page': b'<h1>P</h1><table><tr><td>Asker</td><td>45,0</td></tr></table>'}
    _fake_source(monkeypatch, pages)
    state = {'sources': {}, 'fingerprints': {}}
    now = datetime.datetime(2026, 7, 10, 12, 0, tzinfo=datetime.timezone.utc)

    r = run.run_source('fake', state, now)
    assert r['status'] == 'NEW' and r['captured'][0]['file'] == 'fake/fake-2026-2027.html'
    assert (tmp_path / 'fake' / 'fake-2026-2027.html').read_bytes() == pages['page']
    assert 'Fake fylkeskommune' in added['fake/fake-2026-2027.html']

    # same bytes, then the same tables with new chrome: nothing written
    assert run.run_source('fake', state, now)['status'] == 'UNCHANGED'
    pages['page'] = b'<p>Sist endret i dag</p>' + pages['page']
    assert run.run_source('fake', state, now)['status'] == 'UNCHANGED'

    # the county corrects a figure: a reprint beside the first print
    pages['page'] = pages['page'].replace(b'45,0', b'45,6')
    r = run.run_source('fake', state, now)
    assert r['status'] == 'NEW' and r['captured'][0]['file'] == 'fake/fake-2026-2027-rev2.html'
    assert (tmp_path / 'fake' / 'fake-2026-2027.html').exists()

    # a page without its tables is a failed check, and nothing is written
    pages['page'] = None
    r = run.run_source('fake', state, now)
    assert r['status'] == 'CHECK-FAIL' and not r['captured']


def test_an_error_page_is_never_captured_as_a_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(run, 'SOURCES', str(tmp_path))
    mod = types.ModuleType('live.sources.fakepdf')
    mod.SOURCE = {'id': 'fakepdf', 'county': 'fake', 'publisher': 'F', 'landing': '', 'season': []}
    mod.discover = lambda ctx: [Doc(url='u', name='x.pdf', county='fake', body=b'<html>404</html>')]
    monkeypatch.setitem(sys.modules, 'live.sources.fakepdf', mod)
    r = run.run_source('fakepdf', {'sources': {}, 'fingerprints': {}}, datetime.datetime.now())
    assert r['status'] == 'CHECK-FAIL' and not (tmp_path / 'fake').exists()


# ---- Power BI's compressed answer ----

DSR = {'results': [{'result': {'data': {
    'descriptor': {'Select': [{'Name': 'Sheet1.Skoleår'}, {'Name': 'Sheet1.Skolenavn'},
                              {'Name': 'NedrekarV2'}, {'Name': 'Gjennomkar'}]},
    'dsr': {'DS': [{'IC': True, 'ValueDicts': {'D0': ['2026/2027'], 'D1': ['Atlanten', 'Molde']},
                    'PH': [{'DM0': [
                        {'S': [{'N': 'G0', 'DN': 'D0'}, {'N': 'G1', 'DN': 'D1'}, {'N': 'M0'}, {'N': 'M1'}],
                         'C': [0, 0, '32,7', 41.5]},
                        {'C': [1, '*', 40.0], 'R': 1},          # year repeated
                        {'C': [1], 'R': 3, 'Ø': 12},            # year and school repeated, both measures null
                    ]}]}]}}}}]}


def test_powerbi_rows_decodes_repeats_nulls_and_dictionaries():
    names, rows = powerbi.rows(DSR)
    assert names[0] == 'Sheet1.Skoleår'
    assert rows == [['2026/2027', 'Atlanten', '32,7', 41.5],
                    ['2026/2027', 'Molde', '*', 40.0],
                    ['2026/2027', 'Molde', None, None]]


def test_powerbi_refuses_a_cut_short_answer():
    cut = json.loads(json.dumps(DSR))
    cut['results'][0]['result']['data']['dsr']['DS'][0]['RT'] = [['x']]
    with pytest.raises(powerbi.Incomplete):
        powerbi.rows(cut)


def test_powerbi_resource_key():
    assert powerbi.resource_key('https://app.powerbi.com/view?r=eyJrIjoiYWJjIiwidCI6InQifQ') == 'abc'


def test_mro_reads_dashboard_vg1_only_where_no_extract_and_every_later_level(tmp_path):
    import mro
    names = ['Sheet1.Skoleår', 'Sheet1.Skolenr', 'Sheet1.Skolenavn', 'Sheet1.Kurskode', 'Sheet1.Kursnavn',
             'Sheet1.Kursnavn V2', 'NedrekarV2', 'Gjennomkar']
    recs = [['2026/2027', '15001', 'Atlanten videregående skole', 'IDRET1----', 'Idrettsfag', 'Vg1 Idrettsfag', '27,6', 44.8],
            ['2027/2028', '15001', 'Atlanten videregående skole', 'IDRET1----', 'Idrettsfag', 'Vg1 Idrettsfag', '30,1', 45.0],
            ['2027/2028', '15001', 'Atlanten videregående skole', 'STUSP1----', 'Studiespesialisering', 'Vg1 Studiespesialisering', '*', 38.2],
            ['2027/2028', '15001', 'Atlanten videregående skole', 'IDIDR2----', 'Idrettsfag', 'Vg2 Idrettsfag', '33,0', 44.0],
            ['2026/2027', '15001', 'Atlanten videregående skole', 'IDIDR2----', 'Idrettsfag', 'Vg2 Idrettsfag', '24,0', 40.0]]
    schema = [{'N': f'G{i}'} for i in range(len(names))]
    ans = {'results': [{'result': {'data': {'descriptor': {'Select': [{'Name': n} for n in names]},
                                            'dsr': {'DS': [{'PH': [{'DM0': [dict({'S': schema} if i == 0 else {}, C=r)
                                                                            for i, r in enumerate(recs)]}]}]}}}}]}
    p = tmp_path / 'mro-powerbi-2027-2028.json'
    p.write_text(json.dumps(ans), encoding='utf-8')
    warn = []
    rows = mro._dashboard(str(p), {2026}, warn)
    got = {(r['program'], r['level'], y): v for r in rows for y, v in r['values'].items()}
    # Vg1 only for 2027 (the extract covers 2026); Vg2 for every year, under
    # the same «under 25» rule, as a series of its own beside the Vg1 one
    assert got == {('Idrettsfag', 'Vg1', 2027): 30.1, ('Studiespesialisering', 'Vg1', 2027): 'open',
                   ('Idrettsfag', 'Vg2', 2027): 33.0, ('Idrettsfag', 'Vg2', 2026): 'open'}
    assert not warn


# ---- the merge rule ----

DIFF = {'added': 300, 'changed': 1, 'removed': 0, 'schools_removed': [], 'schools_added': []}


def test_policy_merges_a_correction_and_holds_the_rest():
    data = ['sources/oslo/oslo-2027.html', 'sources/manifest.json', 'web/public/data/schools.json',
            'data/poengkart.db', 'tools/live/state.json']
    assert policy.may_auto_merge(DIFF, True, data, True)[0]
    assert not policy.may_auto_merge(DIFF, True, data, False)[0]
    assert not policy.may_auto_merge(DIFF, False, data, True)[0]
    assert not policy.may_auto_merge(dict(DIFF, removed=1), True, data, True)[0]
    assert not policy.may_auto_merge(dict(DIFF, schools_removed=['Oslo: X']), True, data, True)[0]
    assert not policy.may_auto_merge(dict(DIFF, changed=policy.MAX_CHANGED + 1), True, data, True)[0]
    assert not policy.may_auto_merge(DIFF, True, data + ['tools/extractors/oslo.py'], True)[0]
    held = policy.may_auto_merge(dict(DIFF, county_years_added=['Oslo 2027']), True, data, True)
    assert not held[0] and 'Oslo 2027' in held[1]


def test_diff_tells_a_new_year_from_a_filled_hole(tmp_path):
    from live import diff as livediff

    def put(name, cells):
        progs = [{'program': p, 'level': 'Vg1', 'values': v} for p, v in cells.items()]
        (tmp_path / name).write_text(json.dumps({'schools': [{'fylke': 'Oslo', 'name': 'A', 'programs': progs}]}))
        return str(tmp_path / name)

    before = put('b.json', {'ST': {'2025': 40.1, '2026': 41.0}, 'IM': {'2025': 30.0}})
    hole = put('h.json', {'ST': {'2025': 40.1, '2026': 41.0}, 'IM': {'2025': 30.0, '2026': 31.0}})
    year = put('y.json', {'ST': {'2025': 40.1, '2026': 41.0, '2027': 42.0}, 'IM': {'2025': 30.0}})
    assert livediff.diff(before, hole)['county_years_added'] == []
    assert livediff.diff(before, year)['county_years_added'] == ['Oslo 2027']


def test_policy_for_machine_written_fixes():
    f = ['tools/live/sources/oslo.py']
    assert not policy.may_auto_merge_fix(None, '2026-12-01', True, f)
    assert not policy.may_auto_merge_fix('2026-11-15', '2026-12-01', True, f)
    assert policy.may_auto_merge_fix('2026-10-01', '2026-12-01', True, f)
    assert not policy.may_auto_merge_fix('2026-10-01', '2026-12-01', False, f)
    assert not policy.may_auto_merge_fix('2026-10-01', '2026-12-01', True, f + ['tools/common.py'])


# ---- the timetable ----

def at(s):
    return datetime.datetime.fromisoformat(s).replace(tzinfo=OSLO)


def test_schedule():
    oslo = schedule.source('oslo')                     # season 15 June – 30 Sept
    assert schedule.is_due(oslo, at('2026-07-14T10:23'))        # a Tuesday in season
    assert not schedule.is_due(oslo, at('2026-07-14T21:23'))
    assert schedule.is_due(oslo, at('2026-07-18T15:23'))        # a Saturday: 09 and 15
    assert not schedule.is_due(oslo, at('2026-07-18T10:23'))
    assert schedule.is_due(oslo, at('2026-02-03T07:23'))        # off season: 07 daily
    assert not schedule.is_due(oslo, at('2026-02-03T10:23'))
    sentinel = schedule.source('sentinel')
    assert schedule.is_due(sentinel, at('2026-09-28T07:23'))    # Monday
    assert not schedule.is_due(sentinel, at('2026-09-29T07:23'))
    assert set(schedule.source_ids()) >= {'akershus', 'buskerud', 'innlandet', 'mro', 'oslo',
                                          'rogaland', 'trondelag', 'vestland', 'sentinel'}


def test_schedule_due_prints_nothing_when_nothing_is_due(capsys):
    # 01:51 Oslo on a Tuesday: no source is due, and the workflow's `--only`
    # must get no source list at all (a bare newline became ' ' and crashed it)
    assert schedule.main(['due', '--at', '2026-09-29T01:51']) == 0
    assert capsys.readouterr().out == ''
    assert schedule.main(['due', '--at', '2026-09-28T20:38']) == 0
    assert 'oslo' in capsys.readouterr().out.split()


def test_every_scraper_declares_what_the_runner_needs():
    for sid in schedule.source_ids():
        s = schedule.source(sid)
        assert s['id'] == sid and s['publisher'] and 'season' in s


def test_vilbli_sources_run_in_the_cloud_relay_and_the_rest_on_actions():
    assert {s for s in schedule.source_ids() if schedule.runner(s) == 'cloud'} == \
        {'rogaland', 'innlandet', 'trondelag'}
    assert 'rogaland' not in schedule.due(at('2026-09-01T10:23'))
    assert 'oslo' in schedule.due(at('2026-09-01T10:23'))


def test_issues_open_once_with_one_label_and_repeat_only_news():
    from live import issues
    rep = {'finished': 'now', 'sources': {'oslo': {'status': 'CHECK-FAIL', 'detail': 'no tables',
                                                   'captured': [], 'alerts': []}}}
    acts = issues.plan(rep, {})
    assert [(a[0], a[1], a[4]) for a in acts] == [('open', 'live: oslo', 'heal')]
    same = issues.plan(rep, {'live: oslo': 7}, {7: issues.body('oslo', rep['sources']['oslo'], 'then')})
    assert same == []
    rep['sources']['oslo']['detail'] = 'HTTP 500'
    assert [a[0] for a in issues.plan(rep, {'live: oslo': 7}, {7: 'old'})] == ['comment']
    rep['sources']['oslo'].update(status='UNCHANGED', detail='')
    assert [a[0] for a in issues.plan(rep, {'live: oslo': 7})] == ['close']


def test_adopt_takes_the_relay_captures_onto_a_main_that_moved(tmp_path, monkeypatch):
    import subprocess

    def git(*a):
        subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *a], cwd=tmp_path,
                       check=True, capture_output=True)

    def put(rel, body):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_bytes(body)

    git('init', '-q', '-b', 'main')
    put('sources/manifest.json', b'{"files": {}}')
    put('tools/live/state.json', b'{}')
    put('web/schools.json', b'old')
    git('add', '-A'); git('commit', '-qm', 'base')
    git('switch', '-qc', 'relay')
    put('sources/rogaland/p-rev3.pdf', b'%PDF new')
    put('sources/manifest.json', b'{"files": {"rogaland/p-rev3.pdf": {"provenance": "from vilbli"}}}')
    put('tools/live/state.json', b'{"sources": {"rogaland": {}}}')
    git('add', '-A'); git('commit', '-qm', 'relay')
    relay = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=tmp_path, capture_output=True,
                           text=True).stdout.strip()
    git('switch', '-q', 'main')
    put('web/schools.json', b'another capture merged')
    git('commit', '-qam', 'main moved')

    monkeypatch.setattr(run, 'ROOT', str(tmp_path))
    monkeypatch.setattr(run, 'SOURCES', str(tmp_path / 'sources'))
    monkeypatch.setattr(run, 'HERE', str(tmp_path / 'tools' / 'live'))
    added, merged = {}, []
    monkeypatch.setattr(run, 'add_to_manifest', lambda rel, prov: added.update({rel: prov}))
    monkeypatch.setattr(run, 'merge_state', lambda p: merged.append(json.load(open(p))))
    assert run.adopt(relay) == ['rogaland/p-rev3.pdf']
    assert (tmp_path / 'sources/rogaland/p-rev3.pdf').read_bytes() == b'%PDF new'
    assert (tmp_path / 'web/schools.json').read_bytes() == b'another capture merged'
    assert added == {'rogaland/p-rev3.pdf': 'from vilbli'}
    assert merged == [{'sources': {'rogaland': {}}}]
    assert run.adopt(relay) == []                      # main already has it, byte for byte


def test_the_workflow_fails_a_step_whose_piped_command_fails():
    # `refresh.py | tee log` under plain `bash -e` reported a failed pipeline as success
    wf = open(os.path.join(ROOT, '.github', 'workflows', 'live.yml'), encoding='utf-8').read()
    assert re.search(r'\n    defaults:\n      run:\n(?:        #.*\n)*        shell: bash\n', wf)


def test_the_state_step_needs_a_report_that_ran():
    # null == '0' in Actions: a push without a relay report pushed the relay's state to main
    wf = open(os.path.join(ROOT, '.github', 'workflows', 'live.yml'), encoding='utf-8').read()
    assert "if: steps.report.outcome == 'success' && steps.report.outputs.captured == '0'" in wf

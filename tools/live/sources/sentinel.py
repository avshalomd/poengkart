"""The counties that publish no poenggrenser today (Agder, Akershus, Buskerud,
Finnmark, Møre og Romsdal, Nordland, Oslo, Telemark, Troms, Vestfold, Vestland
and Østfold on vilbli; most of them publish on their own sites or not at all).

Any attachment that appears in one of their vilbli county blocks is reported
as an alert, never captured: no extractor reads it yet, so it needs a person
(or the self-heal routine) to say what it is. The three vilbli counties that
do publish have their own scrapers.
"""
from live import vilbli
from live.core import Doc, Unhealthy

SOURCE = {
    'id': 'sentinel', 'county': None, 'publisher': 'vilbli.no, every county block',
    'landing': vilbli.PAGE.format(county='<county>'),
    'season': [],          # weekly all year
    'min_docs': 0,
}
WATCHED_ELSEWHERE = {'rogaland', 'innlandet', 'trondelag'}
#: attachments already looked at and judged not to be poenggrenser; the file
#: name as vilbli lists it
KNOWN = {
}


def discover(ctx):
    docs, failed = [], []
    for slug, folder in vilbli.COUNTIES.items():
        if slug in WATCHED_ELSEWHERE:
            continue
        try:
            blk = vilbli.block(ctx, slug)
        except Unhealthy as e:
            failed.append(str(e))
            continue
        for fname, url in (blk or {}).get('attachments', []):
            if (slug, fname) in KNOWN:
                continue
            docs.append(Doc(url=url, name=fname, county=folder, alert=True, landing=blk['page'],
                            label=f'{blk["county"]}: {blk["heading"] or "(no heading)"} — {fname}'))
    if len(failed) > len(vilbli.COUNTIES) // 2:
        raise Unhealthy(f'{len(failed)} vilbli county pages unreadable: {failed[0]}')
    for f in failed:
        ctx.note(f)
    return docs
